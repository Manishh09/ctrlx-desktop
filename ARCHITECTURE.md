# ctrlX Desktop — Architecture & Implementation Guide

## Industrial Engineering Desktop Application
**Electron 41 + Angular 21 + Node.js + WebContentsView**

---

## 1. Architecture Decision Record

### 1.1 Embedding Strategy: Why WebContentsView

| Approach | Verdict | Rationale |
|---|---|---|
| `<webview>` tag | ❌ Rejected | Officially deprecated since Electron 5. Chromium is undergoing architectural changes that impact stability of webviews (rendering, navigation, event routing). Electron docs explicitly recommend against it. |
| `BrowserView` | ❌ Rejected | Deprecated since Electron 30, replaced by `WebContentsView`. It's now just a shim wrapper. |
| `<iframe>` | ❌ Rejected | Subject to CSP restrictions of the loaded page, limited IPC capabilities, no separate process isolation, no `webContents` control for GPU/DevTools, and the external app may set `X-Frame-Options: DENY`. |
| **`WebContentsView`** | ✅ **Chosen** | The current recommended API. Runs in its own renderer process (true process isolation). Full `webContents` API (navigation, DevTools, events). Tied to Chromium's native Views API. Supports custom preload scripts for the embedded content. GPU acceleration works natively. Future-proof. |

**Key WebContentsView advantages for ctrlX FLOW:**
- Own renderer process = crash isolation (ctrlX crash won't kill Angular shell)
- Full `webContents` control = intercept navigation, inject scripts, handle certificates
- GPU acceleration = critical for 2D/3D model rendering (WebGL)
- Custom preload = secure bridge for bidirectional messaging
- Positioned via Main process = no DOM z-index wars

### 1.2 Communication Strategy

```
┌─────────────────────────────────────────────────────┐
│                    ELECTRON MAIN                     │
│                    (main.ts)                         │
│                                                      │
│  ┌──────────────┐    IPC     ┌──────────────────┐   │
│  │ Angular Shell │◄─────────►│  Node.js Services │   │
│  │ (Renderer 1)  │           │  (file, config)   │   │
│  │              │            └──────────────────┘   │
│  │  preload-    │                                    │
│  │  shell.ts    │    IPC Hub                         │
│  └──────┬───────┘   (Main)                           │
│         │              │                             │
│         │    ┌─────────┴──────────┐                  │
│         │    │                    │                   │
│  ┌──────▼────▼──┐                │                   │
│  │ ctrlX FLOW   │   postMessage  │                   │
│  │ (Renderer 2) │◄──────────────►│                   │
│  │              │   via IPC Hub                       │
│  │  preload-    │                                    │
│  │  external.ts │                                    │
│  └──────────────┘                                    │
└─────────────────────────────────────────────────────┘
```

**Communication paths:**

| Path | Mechanism | Why |
|---|---|---|
| Angular ↔ Main | `contextBridge` + `ipcRenderer`/`ipcMain` | Secure, validated, typed |
| Main ↔ Node Services | Direct function calls (same process) | Services run in main process |
| Angular → ctrlX FLOW | Angular→IPC→Main→`webContents.send()`→ctrlX preload | Main acts as message broker |
| ctrlX FLOW → Angular | ctrlX preload→IPC→Main→shell `webContents.send()`→Angular | Reverse broker path |
| Angular ↔ Node APIs | IPC channels with request/response pattern | File system, config, data |

### 1.3 Security Model

```
SECURITY LAYERS
═══════════════
1. nodeIntegration: false          (both renderers)
2. contextIsolation: true          (both renderers)
3. sandbox: true                   (external renderer)
4. Preload scripts                 (whitelist-only API exposure)
5. IPC message validation          (schema validation in main)
6. webRequest interceptor          (block unauthorized URLs)
7. Permission handler              (deny camera/mic/etc unless needed)
8. CSP headers                     (restrict script sources)
```

---

## 2. Project Structure

```
ctrlx-desktop/
├── package.json                    # Root workspace
├── tsconfig.json                   # Base TS config
├── electron.builder.json           # electron-builder config
│
├── electron/                       # Electron main process
│   ├── main.ts                     # App entry, window management
│   ├── preload-shell.ts            # Preload for Angular renderer
│   ├── preload-external.ts         # Preload for ctrlX FLOW renderer
│   ├── ipc/
│   │   ├── ipc-registry.ts         # Central IPC handler registration
│   │   ├── ipc-validators.ts       # Message schema validation
│   │   └── channels.ts             # Channel name constants
│   ├── services/
│   │   ├── file.service.ts         # File system operations
│   │   ├── config.service.ts       # App configuration persistence
│   │   └── external-view.service.ts# WebContentsView lifecycle
│   └── security/
│       ├── permissions.ts          # Permission request handler
│       └── csp.ts                  # Content Security Policy
│
├── angular/                        # Angular 21 application
│   ├── angular.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── main.ts                 # Angular bootstrap
│   │   ├── app/
│   │   │   ├── app.component.ts    # Root shell layout
│   │   │   ├── app.routes.ts       # Route definitions
│   │   │   ├── core/
│   │   │   │   ├── services/
│   │   │   │   │   ├── electron-ipc.service.ts
│   │   │   │   │   ├── external-app.service.ts
│   │   │   │   │   └── config.service.ts
│   │   │   │   └── models/
│   │   │   │       ├── ipc-messages.ts
│   │   │   │       └── app-state.ts
│   │   │   ├── layout/
│   │   │   │   ├── shell/
│   │   │   │   │   └── shell.component.ts
│   │   │   │   ├── left-sidebar/
│   │   │   │   │   └── left-sidebar.component.ts
│   │   │   │   ├── right-sidebar/
│   │   │   │   │   └── right-sidebar.component.ts
│   │   │   │   └── center-area/
│   │   │   │       ├── center-area.component.ts
│   │   │   │       └── tab-container/
│   │   │   │           └── tab-container.component.ts
│   │   │   └── features/
│   │   │       ├── dashboard/
│   │   │       │   └── dashboard.component.ts
│   │   │       └── external-view/
│   │   │           └── external-view.component.ts
│   │   ├── environments/
│   │   │   └── environment.ts
│   │   └── styles.scss
│   └── package.json
│
└── shared/                         # Shared types between processes
    ├── ipc-channels.ts
    └── models.ts
```

---

## 3. Implementation

### 3.1 Shared Types (`shared/`)

#### `shared/ipc-channels.ts`
```typescript
/**
 * Single source of truth for all IPC channel names.
 * Used by main process, preload scripts, and Angular app.
 */
export const IPC_CHANNELS = {
  // Shell ↔ Main
  SHELL: {
    READY: 'shell:ready',
    GET_CONFIG: 'shell:get-config',
    SET_CONFIG: 'shell:set-config',
    READ_FILE: 'shell:read-file',
    WRITE_FILE: 'shell:write-file',
    SELECT_FILE: 'shell:select-file',
    SELECT_DIRECTORY: 'shell:select-directory',
  },

  // External app management
  EXTERNAL: {
    LOAD_URL: 'external:load-url',
    RELOAD: 'external:reload',
    NAVIGATE_BACK: 'external:navigate-back',
    SET_BOUNDS: 'external:set-bounds',
    READY: 'external:ready',
    DID_NAVIGATE: 'external:did-navigate',
    DID_FAIL_LOAD: 'external:did-fail-load',
  },

  // Cross-app messaging (Angular ↔ ctrlX FLOW)
  BRIDGE: {
    TO_EXTERNAL: 'bridge:to-external',
    FROM_EXTERNAL: 'bridge:from-external',
    TO_SHELL: 'bridge:to-shell',
    FROM_SHELL: 'bridge:from-shell',
  },

  // Window management
  WINDOW: {
    MINIMIZE: 'window:minimize',
    MAXIMIZE: 'window:maximize',
    CLOSE: 'window:close',
    TOGGLE_DEVTOOLS: 'window:toggle-devtools',
  },
} as const;

export type IpcChannel = typeof IPC_CHANNELS;
```

#### `shared/models.ts`
```typescript
/**
 * Shared data models for IPC communication.
 */

export interface BridgeMessage<T = unknown> {
  type: string;
  payload: T;
  timestamp: number;
  source: 'shell' | 'external';
  correlationId?: string;
}

export interface ExternalAppBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FileOperation {
  path: string;
  encoding?: BufferEncoding;
}

export interface FileWriteOperation extends FileOperation {
  content: string;
}

export interface AppConfig {
  externalAppUrl: string;
  theme: 'light' | 'dark';
  sidebarWidth: number;
  recentFiles: string[];
  gpu: {
    hardwareAcceleration: boolean;
    webglEnabled: boolean;
  };
}

export interface SelectionChangeEvent {
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  timestamp: number;
}

export interface ModelLoadCommand {
  modelPath: string;
  modelType: '2d' | '3d';
  autoLayout?: boolean;
}

export interface StatusUpdateEvent {
  status: 'idle' | 'loading' | 'error' | 'connected';
  message?: string;
  progress?: number;
}
```

---

### 3.2 Electron Main Process

#### `electron/main.ts`
```typescript
import {
  app,
  BaseWindow,
  WebContentsView,
  ipcMain,
  session,
  Menu,
} from 'electron';
import * as path from 'path';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import { registerIpcHandlers } from './ipc/ipc-registry';
import { setupPermissions } from './security/permissions';
import { setupCSP } from './security/csp';
import { ExternalViewService } from './services/external-view.service';
import type { ExternalAppBounds } from '../shared/models';

// ──────────────────────────────────────────
// App Configuration
// ──────────────────────────────────────────
const IS_DEV = process.env.NODE_ENV === 'development';
const ANGULAR_DEV_URL = 'http://localhost:4200';
const ANGULAR_PROD_PATH = path.join(__dirname, '../angular/dist/browser/index.html');

// Enable GPU acceleration for WebGL content
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

// ──────────────────────────────────────────
// Window & View References
// ──────────────────────────────────────────
let mainWindow: BaseWindow | null = null;
let shellView: WebContentsView | null = null;
let externalViewService: ExternalViewService | null = null;

function createMainWindow(): void {
  // Use BaseWindow (not BrowserWindow) for WebContentsView architecture
  mainWindow = new BaseWindow({
    width: 1600,
    height: 1000,
    minWidth: 1024,
    minHeight: 768,
    title: 'ctrlX Desktop',
    show: false,
    // titleBarStyle: 'hidden', // Uncomment for custom title bar
  });

  // ── Shell View (Angular App) ────────────────
  shellView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload-shell.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // Angular shell needs some Node APIs via preload
      webgl: true,
      spellcheck: false,
    },
  });

  // Shell fills the entire window
  mainWindow.contentView.addChildView(shellView);

  // Load Angular app
  if (IS_DEV) {
    shellView.webContents.loadURL(ANGULAR_DEV_URL);
    shellView.webContents.openDevTools({ mode: 'detach' });
  } else {
    shellView.webContents.loadFile(ANGULAR_PROD_PATH);
  }

  // ── External View Service ────────────────
  externalViewService = new ExternalViewService(mainWindow, shellView);

  // ── Layout Management ────────────────
  const updateLayout = (): void => {
    if (!mainWindow || !shellView) return;
    const [width, height] = mainWindow.getSize();
    shellView.setBounds({ x: 0, y: 0, width, height });
    // External view bounds are managed by Angular via IPC
  };

  mainWindow.on('resize', updateLayout);
  updateLayout();

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    shellView = null;
    externalViewService?.destroy();
    externalViewService = null;
  });
}

// ──────────────────────────────────────────
// IPC: External View Management
// ──────────────────────────────────────────
function setupExternalViewIPC(): void {
  ipcMain.handle(IPC_CHANNELS.EXTERNAL.LOAD_URL, async (_event, url: string) => {
    if (!externalViewService) throw new Error('External view service not initialized');
    // Validate URL
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error(`Disallowed protocol: ${parsed.protocol}`);
      }
    } catch (e) {
      throw new Error(`Invalid URL: ${url}`);
    }
    return externalViewService.loadUrl(url);
  });

  ipcMain.handle(IPC_CHANNELS.EXTERNAL.SET_BOUNDS, async (_event, bounds: ExternalAppBounds) => {
    if (!externalViewService) return;
    // Validate bounds are reasonable numbers
    const sanitized: ExternalAppBounds = {
      x: Math.round(Math.max(0, bounds.x)),
      y: Math.round(Math.max(0, bounds.y)),
      width: Math.round(Math.max(100, bounds.width)),
      height: Math.round(Math.max(100, bounds.height)),
    };
    externalViewService.setBounds(sanitized);
  });

  ipcMain.on(IPC_CHANNELS.EXTERNAL.RELOAD, () => {
    externalViewService?.reload();
  });

  // ── Bridge: Shell → External ────────────────
  ipcMain.on(IPC_CHANNELS.BRIDGE.TO_EXTERNAL, (_event, message) => {
    externalViewService?.sendToExternal(message);
  });

  // ── Bridge: External → Shell ────────────────
  // (Handled inside ExternalViewService, forwards to shell)
}

// ──────────────────────────────────────────
// IPC: Window Controls
// ──────────────────────────────────────────
function setupWindowIPC(): void {
  ipcMain.on(IPC_CHANNELS.WINDOW.MINIMIZE, () => mainWindow?.minimize());
  ipcMain.on(IPC_CHANNELS.WINDOW.MAXIMIZE, () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.on(IPC_CHANNELS.WINDOW.CLOSE, () => mainWindow?.close());
  ipcMain.on(IPC_CHANNELS.WINDOW.TOGGLE_DEVTOOLS, () => {
    shellView?.webContents.toggleDevTools();
  });
}

// ──────────────────────────────────────────
// App Lifecycle
// ──────────────────────────────────────────
app.whenReady().then(() => {
  // Security setup
  setupPermissions(session.defaultSession);
  setupCSP(session.defaultSession);

  // Register all IPC handlers
  registerIpcHandlers();
  setupExternalViewIPC();
  setupWindowIPC();

  // Create window
  createMainWindow();

  app.on('activate', () => {
    if (!mainWindow) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Prevent new window creation from renderer
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });
});
```

#### `electron/services/external-view.service.ts`
```typescript
import {
  BaseWindow,
  WebContentsView,
  ipcMain,
} from 'electron';
import * as path from 'path';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import type { BridgeMessage, ExternalAppBounds } from '../../shared/models';

/**
 * Manages the lifecycle of the WebContentsView that hosts
 * the external ctrlX FLOW application.
 */
export class ExternalViewService {
  private externalView: WebContentsView | null = null;
  private currentUrl: string | null = null;
  private isAttached = false;

  constructor(
    private window: BaseWindow,
    private shellView: WebContentsView,
  ) {
    this.setupBridgeFromExternal();
  }

  /**
   * Create and attach the external WebContentsView, load the URL.
   */
  async loadUrl(url: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Destroy existing view if present
      if (this.externalView) {
        this.detach();
        this.externalView.webContents.close();
        this.externalView = null;
      }

      this.externalView = new WebContentsView({
        webPreferences: {
          preload: path.join(__dirname, '../preload-external.js'),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true, // Full sandbox for external content
          webgl: true,
          // Partition isolates cookies/storage from shell
          partition: 'persist:ctrlx-external',
          spellcheck: false,
          // Disable features not needed by the external app
          images: true,
          javascript: true,
        },
      });

      // Navigation guard: prevent navigating to unexpected URLs
      this.externalView.webContents.on('will-navigate', (event, navUrl) => {
        const allowed = new URL(url);
        const target = new URL(navUrl);
        if (target.origin !== allowed.origin) {
          event.preventDefault();
          console.warn(`Blocked navigation to: ${navUrl}`);
        }
      });

      // Forward navigation events to Angular shell
      this.externalView.webContents.on('did-navigate', (_event, navUrl) => {
        this.shellView.webContents.send(IPC_CHANNELS.EXTERNAL.DID_NAVIGATE, navUrl);
      });

      this.externalView.webContents.on('did-fail-load', (_event, errorCode, errorDesc) => {
        this.shellView.webContents.send(IPC_CHANNELS.EXTERNAL.DID_FAIL_LOAD, {
          errorCode,
          errorDescription: errorDesc,
        });
      });

      // Enable GPU acceleration hints
      this.externalView.setBackgroundColor('#1a1a2e');

      this.currentUrl = url;
      await this.externalView.webContents.loadURL(url);

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  /**
   * Attach the external view to the window at specific bounds.
   */
  setBounds(bounds: ExternalAppBounds): void {
    if (!this.externalView) return;

    if (!this.isAttached) {
      this.window.contentView.addChildView(this.externalView);
      this.isAttached = true;
    }

    this.externalView.setBounds(bounds);
  }

  /**
   * Remove external view from window without destroying it.
   */
  detach(): void {
    if (this.externalView && this.isAttached) {
      this.window.contentView.removeChildView(this.externalView);
      this.isAttached = false;
    }
  }

  /**
   * Send a message from Angular shell to the external app.
   */
  sendToExternal(message: BridgeMessage): void {
    if (!this.externalView || this.externalView.webContents.isDestroyed()) return;
    this.externalView.webContents.send(IPC_CHANNELS.BRIDGE.FROM_SHELL, message);
  }

  /**
   * Listen for messages from external app and forward to shell.
   */
  private setupBridgeFromExternal(): void {
    ipcMain.on(IPC_CHANNELS.BRIDGE.TO_SHELL, (_event, message: BridgeMessage) => {
      // Validate the message came from the external view
      if (_event.sender !== this.externalView?.webContents) {
        console.warn('Rejected bridge message from unknown sender');
        return;
      }
      // Forward to Angular shell
      if (!this.shellView.webContents.isDestroyed()) {
        this.shellView.webContents.send(IPC_CHANNELS.BRIDGE.FROM_EXTERNAL, message);
      }
    });
  }

  reload(): void {
    this.externalView?.webContents.reload();
  }

  destroy(): void {
    this.detach();
    if (this.externalView && !this.externalView.webContents.isDestroyed()) {
      this.externalView.webContents.close();
    }
    this.externalView = null;
  }
}
```

#### `electron/preload-shell.ts`
```typescript
/**
 * Preload script for the Angular shell renderer.
 * Exposes a controlled API surface via contextBridge.
 */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import type {
  BridgeMessage,
  ExternalAppBounds,
  AppConfig,
  FileWriteOperation,
} from '../shared/models';

// Type-safe channel whitelist
const ALLOWED_SEND_CHANNELS = new Set([
  IPC_CHANNELS.SHELL.READY,
  IPC_CHANNELS.EXTERNAL.RELOAD,
  IPC_CHANNELS.BRIDGE.TO_EXTERNAL,
  IPC_CHANNELS.WINDOW.MINIMIZE,
  IPC_CHANNELS.WINDOW.MAXIMIZE,
  IPC_CHANNELS.WINDOW.CLOSE,
  IPC_CHANNELS.WINDOW.TOGGLE_DEVTOOLS,
]);

const ALLOWED_INVOKE_CHANNELS = new Set([
  IPC_CHANNELS.SHELL.GET_CONFIG,
  IPC_CHANNELS.SHELL.SET_CONFIG,
  IPC_CHANNELS.SHELL.READ_FILE,
  IPC_CHANNELS.SHELL.WRITE_FILE,
  IPC_CHANNELS.SHELL.SELECT_FILE,
  IPC_CHANNELS.SHELL.SELECT_DIRECTORY,
  IPC_CHANNELS.EXTERNAL.LOAD_URL,
  IPC_CHANNELS.EXTERNAL.SET_BOUNDS,
]);

const ALLOWED_RECEIVE_CHANNELS = new Set([
  IPC_CHANNELS.BRIDGE.FROM_EXTERNAL,
  IPC_CHANNELS.EXTERNAL.DID_NAVIGATE,
  IPC_CHANNELS.EXTERNAL.DID_FAIL_LOAD,
  IPC_CHANNELS.EXTERNAL.READY,
]);

/**
 * The API exposed to the Angular renderer via window.electronAPI
 */
const electronAPI = {
  // ── Generic IPC (with channel validation) ────────────
  send(channel: string, ...args: unknown[]): void {
    if (ALLOWED_SEND_CHANNELS.has(channel)) {
      ipcRenderer.send(channel, ...args);
    } else {
      console.warn(`[preload] Blocked send to channel: ${channel}`);
    }
  },

  invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    if (ALLOWED_INVOKE_CHANNELS.has(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    return Promise.reject(new Error(`Blocked invoke to channel: ${channel}`));
  },

  on(channel: string, callback: (...args: unknown[]) => void): () => void {
    if (!ALLOWED_RECEIVE_CHANNELS.has(channel)) {
      console.warn(`[preload] Blocked listener on channel: ${channel}`);
      return () => {};
    }
    const handler = (_event: IpcRendererEvent, ...args: unknown[]) => callback(...args);
    ipcRenderer.on(channel, handler);
    // Return unsubscribe function
    return () => ipcRenderer.removeListener(channel, handler);
  },

  // ── Typed convenience methods ────────────

  // External app control
  external: {
    loadUrl(url: string): Promise<{ success: boolean; error?: string }> {
      return ipcRenderer.invoke(IPC_CHANNELS.EXTERNAL.LOAD_URL, url) as any;
    },
    setBounds(bounds: ExternalAppBounds): Promise<void> {
      return ipcRenderer.invoke(IPC_CHANNELS.EXTERNAL.SET_BOUNDS, bounds) as any;
    },
    reload(): void {
      ipcRenderer.send(IPC_CHANNELS.EXTERNAL.RELOAD);
    },
    onNavigated(cb: (url: string) => void): () => void {
      const handler = (_e: IpcRendererEvent, url: string) => cb(url);
      ipcRenderer.on(IPC_CHANNELS.EXTERNAL.DID_NAVIGATE, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.EXTERNAL.DID_NAVIGATE, handler);
    },
    onLoadFailed(cb: (error: { errorCode: number; errorDescription: string }) => void): () => void {
      const handler = (_e: IpcRendererEvent, error: any) => cb(error);
      ipcRenderer.on(IPC_CHANNELS.EXTERNAL.DID_FAIL_LOAD, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.EXTERNAL.DID_FAIL_LOAD, handler);
    },
  },

  // Bridge messaging
  bridge: {
    sendToExternal(message: BridgeMessage): void {
      ipcRenderer.send(IPC_CHANNELS.BRIDGE.TO_EXTERNAL, message);
    },
    onMessageFromExternal(cb: (message: BridgeMessage) => void): () => void {
      const handler = (_e: IpcRendererEvent, msg: BridgeMessage) => cb(msg);
      ipcRenderer.on(IPC_CHANNELS.BRIDGE.FROM_EXTERNAL, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.BRIDGE.FROM_EXTERNAL, handler);
    },
  },

  // File system
  fs: {
    readFile(filePath: string, encoding?: BufferEncoding): Promise<string> {
      return ipcRenderer.invoke(IPC_CHANNELS.SHELL.READ_FILE, { path: filePath, encoding }) as any;
    },
    writeFile(filePath: string, content: string): Promise<void> {
      return ipcRenderer.invoke(IPC_CHANNELS.SHELL.WRITE_FILE, { path: filePath, content } satisfies FileWriteOperation) as any;
    },
    selectFile(filters?: Electron.FileFilter[]): Promise<string | null> {
      return ipcRenderer.invoke(IPC_CHANNELS.SHELL.SELECT_FILE, filters) as any;
    },
    selectDirectory(): Promise<string | null> {
      return ipcRenderer.invoke(IPC_CHANNELS.SHELL.SELECT_DIRECTORY) as any;
    },
  },

  // Config
  config: {
    get(): Promise<AppConfig> {
      return ipcRenderer.invoke(IPC_CHANNELS.SHELL.GET_CONFIG) as any;
    },
    set(config: Partial<AppConfig>): Promise<void> {
      return ipcRenderer.invoke(IPC_CHANNELS.SHELL.SET_CONFIG, config) as any;
    },
  },

  // Window controls
  window: {
    minimize(): void { ipcRenderer.send(IPC_CHANNELS.WINDOW.MINIMIZE); },
    maximize(): void { ipcRenderer.send(IPC_CHANNELS.WINDOW.MAXIMIZE); },
    close(): void { ipcRenderer.send(IPC_CHANNELS.WINDOW.CLOSE); },
    toggleDevTools(): void { ipcRenderer.send(IPC_CHANNELS.WINDOW.TOGGLE_DEVTOOLS); },
  },
};

// Expose to renderer
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// TypeScript type export (for Angular)
export type ElectronAPI = typeof electronAPI;
```

#### `electron/preload-external.ts`
```typescript
/**
 * Preload script for the external ctrlX FLOW renderer.
 * Minimal API: only bridge messaging is exposed.
 * The external app is sandboxed.
 */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import type { BridgeMessage } from '../shared/models';

const ctrlxBridge = {
  /**
   * Send a message to the Angular host shell.
   */
  sendToHost(type: string, payload: unknown): void {
    const message: BridgeMessage = {
      type,
      payload,
      timestamp: Date.now(),
      source: 'external',
    };
    ipcRenderer.send(IPC_CHANNELS.BRIDGE.TO_SHELL, message);
  },

  /**
   * Listen for messages from the Angular host shell.
   */
  onMessageFromHost(callback: (message: BridgeMessage) => void): () => void {
    const handler = (_event: IpcRendererEvent, message: BridgeMessage) => {
      callback(message);
    };
    ipcRenderer.on(IPC_CHANNELS.BRIDGE.FROM_SHELL, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.BRIDGE.FROM_SHELL, handler);
  },

  /**
   * Signal that the external app is ready.
   */
  notifyReady(): void {
    ipcRenderer.send(IPC_CHANNELS.EXTERNAL.READY);
  },
};

contextBridge.exposeInMainWorld('ctrlxBridge', ctrlxBridge);

export type CtrlxBridge = typeof ctrlxBridge;
```

#### `electron/ipc/ipc-registry.ts`
```typescript
import { ipcMain, dialog, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { FileService } from '../services/file.service';
import { ConfigService } from '../services/config.service';
import type { FileOperation, FileWriteOperation } from '../../shared/models';

const fileService = new FileService();
const configService = new ConfigService();

/**
 * Registers all IPC handlers for shell ↔ main communication.
 * Each handler validates inputs before processing.
 */
export function registerIpcHandlers(): void {
  // ── File System ────────────────
  ipcMain.handle(IPC_CHANNELS.SHELL.READ_FILE, async (_event, op: FileOperation) => {
    if (!op?.path || typeof op.path !== 'string') {
      throw new Error('Invalid file path');
    }
    return fileService.readFile(op.path, op.encoding);
  });

  ipcMain.handle(IPC_CHANNELS.SHELL.WRITE_FILE, async (_event, op: FileWriteOperation) => {
    if (!op?.path || typeof op.path !== 'string' || typeof op.content !== 'string') {
      throw new Error('Invalid write operation');
    }
    return fileService.writeFile(op.path, op.content);
  });

  ipcMain.handle(IPC_CHANNELS.SHELL.SELECT_FILE, async (_event, filters?: Electron.FileFilter[]) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: filters ?? [{ name: 'All Files', extensions: ['*'] }],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle(IPC_CHANNELS.SHELL.SELECT_DIRECTORY, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // ── Configuration ────────────────
  ipcMain.handle(IPC_CHANNELS.SHELL.GET_CONFIG, async () => {
    return configService.getConfig();
  });

  ipcMain.handle(IPC_CHANNELS.SHELL.SET_CONFIG, async (_event, partial) => {
    if (!partial || typeof partial !== 'object') {
      throw new Error('Invalid config object');
    }
    return configService.updateConfig(partial);
  });
}
```

#### `electron/services/file.service.ts`
```typescript
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * File system service running in the main process.
 * Provides safe file operations with path validation.
 */
export class FileService {
  // Configurable allowed directories (expand as needed)
  private allowedRoots: string[] = [];

  constructor(allowedRoots?: string[]) {
    this.allowedRoots = allowedRoots ?? [];
  }

  async readFile(filePath: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
    const resolved = path.resolve(filePath);
    this.validatePath(resolved);
    return fs.readFile(resolved, { encoding });
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const resolved = path.resolve(filePath);
    this.validatePath(resolved);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, content, 'utf-8');
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Prevent directory traversal attacks.
   * If allowedRoots is configured, enforce it.
   */
  private validatePath(resolved: string): void {
    if (this.allowedRoots.length === 0) return;
    const isAllowed = this.allowedRoots.some(root =>
      resolved.startsWith(path.resolve(root))
    );
    if (!isAllowed) {
      throw new Error(`Access denied: ${resolved}`);
    }
  }
}
```

#### `electron/services/config.service.ts`
```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';
import type { AppConfig } from '../../shared/models';

const DEFAULT_CONFIG: AppConfig = {
  externalAppUrl: 'http://localhost:1880', // Default ctrlX FLOW URL
  theme: 'dark',
  sidebarWidth: 280,
  recentFiles: [],
  gpu: {
    hardwareAcceleration: true,
    webglEnabled: true,
  },
};

/**
 * Persists application configuration to disk as JSON.
 */
export class ConfigService {
  private configPath: string;
  private config: AppConfig | null = null;

  constructor() {
    this.configPath = path.join(app.getPath('userData'), 'app-config.json');
  }

  async getConfig(): Promise<AppConfig> {
    if (this.config) return { ...this.config };

    try {
      const raw = await fs.readFile(this.configPath, 'utf-8');
      this.config = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    } catch {
      this.config = { ...DEFAULT_CONFIG };
      await this.persist();
    }

    return { ...this.config };
  }

  async updateConfig(partial: Partial<AppConfig>): Promise<void> {
    const current = await this.getConfig();
    this.config = { ...current, ...partial };
    await this.persist();
  }

  private async persist(): Promise<void> {
    if (!this.config) return;
    await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
  }
}
```

#### `electron/security/permissions.ts`
```typescript
import { Session } from 'electron';

/**
 * Configure permission handlers for renderer processes.
 */
export function setupPermissions(session: Session): void {
  // Deny all permission requests by default
  session.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions: string[] = [
      // Add permissions as needed, e.g.:
      // 'clipboard-read',
      // 'clipboard-sanitized-write',
    ];

    if (allowedPermissions.includes(permission)) {
      callback(true);
    } else {
      console.warn(`Denied permission: ${permission} from ${webContents.getURL()}`);
      callback(false);
    }
  });

  // Block notification permission
  session.setPermissionCheckHandler((_webContents, permission) => {
    const denied = ['media', 'geolocation', 'notifications', 'midi', 'pointerLock'];
    return !denied.includes(permission);
  });
}
```

#### `electron/security/csp.ts`
```typescript
import { Session } from 'electron';

/**
 * Set Content Security Policy headers for all responses.
 */
export function setupCSP(session: Session): void {
  session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Angular needs eval in dev
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob: https:",
            "font-src 'self' data:",
            "connect-src 'self' ws: wss: http://localhost:* https:",
            "worker-src 'self' blob:",
          ].join('; '),
        ],
      },
    });
  });
}
```

---

### 3.3 Angular 21 Application

#### `angular/src/main.ts`
```typescript
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { provideRouter } from '@angular/router';
import { provideExperimentalZonelessChangeDetection } from '@angular/core';
import { routes } from './app/app.routes';

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    // Angular 21: Zoneless change detection (stable)
    provideExperimentalZonelessChangeDetection(),
  ],
}).catch(err => console.error(err));
```

#### `angular/src/app/app.routes.ts`
```typescript
import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./layout/shell/shell.component').then(m => m.ShellComponent),
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
      },
    ],
  },
];
```

#### `angular/src/app/app.component.ts`
```typescript
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class AppComponent {}
```

#### Type Declaration for the preload API

`angular/src/typings.d.ts`
```typescript
import type { ElectronAPI } from '../../electron/preload-shell';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
```

#### `angular/src/app/core/services/electron-ipc.service.ts`
```typescript
import { Injectable, signal, computed, NgZone, inject, OnDestroy } from '@angular/core';
import type { BridgeMessage, ExternalAppBounds, AppConfig } from '../../../../shared/models';

/**
 * Angular service wrapping the Electron preload API.
 * Uses Angular 21 signals for reactive state management.
 */
@Injectable({ providedIn: 'root' })
export class ElectronIpcService implements OnDestroy {
  private zone = inject(NgZone);
  private cleanupFns: (() => void)[] = [];

  // ── Reactive state ────────────────
  private _externalAppStatus = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  private _externalAppUrl = signal<string>('');
  private _lastExternalMessage = signal<BridgeMessage | null>(null);

  readonly externalAppStatus = this._externalAppStatus.asReadonly();
  readonly externalAppUrl = this._externalAppUrl.asReadonly();
  readonly lastExternalMessage = this._lastExternalMessage.asReadonly();
  readonly isExternalReady = computed(() => this._externalAppStatus() === 'ready');

  private get api() {
    return window.electronAPI;
  }

  constructor() {
    this.setupListeners();
  }

  private setupListeners(): void {
    // Listen for messages from external app
    const unsub1 = this.api.bridge.onMessageFromExternal((message) => {
      // Run inside Angular zone so signals trigger change detection
      this.zone.run(() => {
        this._lastExternalMessage.set(message);
      });
    });
    this.cleanupFns.push(unsub1);

    // Listen for navigation events
    const unsub2 = this.api.external.onNavigated((url) => {
      this.zone.run(() => {
        this._externalAppUrl.set(url);
        this._externalAppStatus.set('ready');
      });
    });
    this.cleanupFns.push(unsub2);

    // Listen for load failures
    const unsub3 = this.api.external.onLoadFailed((error) => {
      this.zone.run(() => {
        this._externalAppStatus.set('error');
        console.error('External app load failed:', error);
      });
    });
    this.cleanupFns.push(unsub3);
  }

  // ── External App Control ────────────────

  async loadExternalApp(url: string): Promise<void> {
    this._externalAppStatus.set('loading');
    this._externalAppUrl.set(url);
    const result = await this.api.external.loadUrl(url);
    if (!result.success) {
      this._externalAppStatus.set('error');
      throw new Error(result.error);
    }
  }

  async setExternalBounds(bounds: ExternalAppBounds): Promise<void> {
    await this.api.external.setBounds(bounds);
  }

  reloadExternal(): void {
    this.api.external.reload();
  }

  // ── Bridge Messaging ────────────────

  sendToExternal(type: string, payload: unknown): void {
    const message: BridgeMessage = {
      type,
      payload,
      timestamp: Date.now(),
      source: 'shell',
      correlationId: crypto.randomUUID(),
    };
    this.api.bridge.sendToExternal(message);
  }

  // ── File System ────────────────

  readFile(path: string): Promise<string> {
    return this.api.fs.readFile(path);
  }

  writeFile(path: string, content: string): Promise<void> {
    return this.api.fs.writeFile(path, content);
  }

  selectFile(): Promise<string | null> {
    return this.api.fs.selectFile();
  }

  selectDirectory(): Promise<string | null> {
    return this.api.fs.selectDirectory();
  }

  // ── Config ────────────────

  getConfig(): Promise<AppConfig> {
    return this.api.config.get();
  }

  updateConfig(partial: Partial<AppConfig>): Promise<void> {
    return this.api.config.set(partial);
  }

  // ── Window ────────────────

  minimizeWindow(): void { this.api.window.minimize(); }
  maximizeWindow(): void { this.api.window.maximize(); }
  closeWindow(): void { this.api.window.close(); }

  ngOnDestroy(): void {
    this.cleanupFns.forEach(fn => fn());
  }
}
```

#### `angular/src/app/core/services/external-app.service.ts`
```typescript
import { Injectable, signal, computed, inject, effect } from '@angular/core';
import { ElectronIpcService } from './electron-ipc.service';
import type { BridgeMessage, SelectionChangeEvent, StatusUpdateEvent } from '../../../../shared/models';

/**
 * High-level service for interacting with the ctrlX FLOW external app.
 * Provides typed methods for specific ctrlX FLOW operations.
 */
@Injectable({ providedIn: 'root' })
export class ExternalAppService {
  private ipc = inject(ElectronIpcService);

  // ── ctrlX FLOW State ────────────────
  private _selectedNodes = signal<string[]>([]);
  private _flowStatus = signal<StatusUpdateEvent>({ status: 'idle', timestamp: Date.now() });

  readonly selectedNodes = this._selectedNodes.asReadonly();
  readonly flowStatus = this._flowStatus.asReadonly();
  readonly isConnected = computed(() => this._flowStatus().status === 'connected');

  constructor() {
    // React to messages from external app
    effect(() => {
      const message = this.ipc.lastExternalMessage();
      if (message) {
        this.handleExternalMessage(message);
      }
    });
  }

  // ── Commands to ctrlX FLOW ────────────────

  loadModel(modelPath: string, modelType: '2d' | '3d' = '2d'): void {
    this.ipc.sendToExternal('flow:load-model', {
      modelPath,
      modelType,
      autoLayout: true,
    });
  }

  triggerDeploy(): void {
    this.ipc.sendToExternal('flow:deploy', {});
  }

  selectNodes(nodeIds: string[]): void {
    this.ipc.sendToExternal('flow:select-nodes', { nodeIds });
  }

  zoomToFit(): void {
    this.ipc.sendToExternal('flow:zoom-to-fit', {});
  }

  setTheme(theme: 'light' | 'dark'): void {
    this.ipc.sendToExternal('flow:set-theme', { theme });
  }

  // ── Handle incoming events ────────────────

  private handleExternalMessage(message: BridgeMessage): void {
    switch (message.type) {
      case 'flow:selection-changed': {
        const event = message.payload as SelectionChangeEvent;
        this._selectedNodes.set(event.selectedNodeIds);
        break;
      }
      case 'flow:status-update': {
        const event = message.payload as StatusUpdateEvent;
        this._flowStatus.set(event);
        break;
      }
      case 'flow:node-double-click': {
        // Could open a properties panel, navigate, etc.
        console.log('Node double-clicked:', message.payload);
        break;
      }
      default:
        console.log('Unhandled external message:', message.type);
    }
  }
}
```

#### `angular/src/app/layout/shell/shell.component.ts`
```typescript
import { Component, signal, computed } from '@angular/core';
import { LeftSidebarComponent } from '../left-sidebar/left-sidebar.component';
import { RightSidebarComponent } from '../right-sidebar/right-sidebar.component';
import { CenterAreaComponent } from '../center-area/center-area.component';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [LeftSidebarComponent, RightSidebarComponent, CenterAreaComponent],
  template: `
    <div class="shell" [class.right-collapsed]="!showRightSidebar()">
      <app-left-sidebar
        class="left-sidebar"
        [style.width.px]="leftSidebarWidth()"
      />

      <div class="divider left-divider"
           (mousedown)="startResizeLeft($event)"></div>

      <app-center-area class="center-area" />

      <div class="divider right-divider"
           (mousedown)="startResizeRight($event)"
           [class.hidden]="!showRightSidebar()"></div>

      <app-right-sidebar
        class="right-sidebar"
        [style.width.px]="rightSidebarWidth()"
        [class.collapsed]="!showRightSidebar()"
        (togglePanel)="showRightSidebar.set(!showRightSidebar())"
      />
    </div>
  `,
  styles: [`
    :host { display: block; height: 100vh; overflow: hidden; }

    .shell {
      display: flex;
      height: 100%;
      background: var(--bg-primary, #0f0f1a);
      color: var(--text-primary, #e0e0e0);
    }

    .left-sidebar {
      flex-shrink: 0;
      min-width: 200px;
      max-width: 400px;
    }

    .center-area {
      flex: 1;
      min-width: 400px;
      overflow: hidden;
    }

    .right-sidebar {
      flex-shrink: 0;
      min-width: 240px;
      max-width: 500px;
      transition: width 0.2s ease, opacity 0.2s ease;
    }
    .right-sidebar.collapsed {
      width: 0 !important;
      min-width: 0;
      opacity: 0;
      overflow: hidden;
    }

    .divider {
      width: 4px;
      cursor: col-resize;
      background: var(--border-color, #1e1e3a);
      transition: background 0.15s;
    }
    .divider:hover { background: var(--accent-color, #4f46e5); }
    .divider.hidden { display: none; }
  `],
})
export class ShellComponent {
  leftSidebarWidth = signal(280);
  rightSidebarWidth = signal(300);
  showRightSidebar = signal(true);

  startResizeLeft(event: MouseEvent): void {
    this.startResize(event, this.leftSidebarWidth, 200, 400);
  }

  startResizeRight(event: MouseEvent): void {
    this.startResize(event, this.rightSidebarWidth, 240, 500, true);
  }

  private startResize(
    event: MouseEvent,
    widthSignal: ReturnType<typeof signal<number>>,
    min: number,
    max: number,
    invert = false,
  ): void {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = widthSignal();

    const onMove = (e: MouseEvent) => {
      const delta = invert ? startX - e.clientX : e.clientX - startX;
      widthSignal.set(Math.min(max, Math.max(min, startWidth + delta)));
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }
}
```

#### `angular/src/app/layout/left-sidebar/left-sidebar.component.ts`
```typescript
import { Component, inject, signal } from '@angular/core';
import { ExternalAppService } from '../../core/services/external-app.service';
import { ElectronIpcService } from '../../core/services/electron-ipc.service';

interface NavItem {
  icon: string;
  label: string;
  action: string;
}

@Component({
  selector: 'app-left-sidebar',
  standalone: true,
  template: `
    <div class="sidebar-container">
      <div class="sidebar-header">
        <h2 class="logo">ctrlX Desktop</h2>
      </div>

      <nav class="nav-list">
        @for (item of navItems; track item.action) {
          <button
            class="nav-item"
            [class.active]="activeItem() === item.action"
            (click)="onNavClick(item)"
          >
            <span class="nav-icon">{{ item.icon }}</span>
            <span class="nav-label">{{ item.label }}</span>
          </button>
        }
      </nav>

      <div class="sidebar-section">
        <h3 class="section-title">Actions</h3>

        <button class="action-btn" (click)="loadModel()">
          Load Model
        </button>
        <button class="action-btn" (click)="deploy()">
          Deploy Flow
        </button>
        <button class="action-btn" (click)="zoomToFit()">
          Zoom to Fit
        </button>
      </div>

      <div class="sidebar-footer">
        <div class="status-indicator" [class]="flowStatus().status">
          <span class="status-dot"></span>
          {{ flowStatus().status }}
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; }

    .sidebar-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--bg-sidebar, #12121f);
      border-right: 1px solid var(--border-color, #1e1e3a);
      padding: 16px 0;
    }

    .sidebar-header {
      padding: 0 16px 16px;
      border-bottom: 1px solid var(--border-color, #1e1e3a);
    }

    .logo {
      font-size: 16px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--text-primary, #fff);
      margin: 0;
    }

    .nav-list {
      padding: 8px 8px;
      flex: 1;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 10px 12px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: var(--text-secondary, #8888a0);
      cursor: pointer;
      font-size: 13px;
      text-align: left;
      transition: all 0.15s;
    }
    .nav-item:hover { background: var(--bg-hover, #1a1a30); color: var(--text-primary, #fff); }
    .nav-item.active { background: var(--accent-color, #4f46e5); color: #fff; }

    .nav-icon { font-size: 16px; }

    .sidebar-section {
      padding: 16px;
      border-top: 1px solid var(--border-color, #1e1e3a);
    }

    .section-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted, #555570);
      margin: 0 0 8px;
    }

    .action-btn {
      display: block;
      width: 100%;
      padding: 8px 12px;
      margin-bottom: 4px;
      border: 1px solid var(--border-color, #1e1e3a);
      border-radius: 6px;
      background: transparent;
      color: var(--text-secondary, #8888a0);
      cursor: pointer;
      font-size: 12px;
      text-align: left;
      transition: all 0.15s;
    }
    .action-btn:hover {
      background: var(--bg-hover, #1a1a30);
      border-color: var(--accent-color, #4f46e5);
      color: var(--text-primary, #fff);
    }

    .sidebar-footer {
      padding: 12px 16px;
      border-top: 1px solid var(--border-color, #1e1e3a);
    }

    .status-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      text-transform: capitalize;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--text-muted, #555);
    }
    .connected .status-dot { background: #22c55e; }
    .loading .status-dot { background: #eab308; animation: pulse 1s infinite; }
    .error .status-dot { background: #ef4444; }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
  `],
})
export class LeftSidebarComponent {
  private externalApp = inject(ExternalAppService);
  private ipc = inject(ElectronIpcService);

  activeItem = signal('flows');
  flowStatus = this.externalApp.flowStatus;

  navItems: NavItem[] = [
    { icon: '⬡', label: 'Flows', action: 'flows' },
    { icon: '◫', label: 'Models', action: 'models' },
    { icon: '⚙', label: 'Configuration', action: 'config' },
    { icon: '📊', label: 'Monitoring', action: 'monitor' },
  ];

  onNavClick(item: NavItem): void {
    this.activeItem.set(item.action);
  }

  async loadModel(): Promise<void> {
    const filePath = await this.ipc.selectFile();
    if (filePath) {
      this.externalApp.loadModel(filePath, '2d');
    }
  }

  deploy(): void {
    this.externalApp.triggerDeploy();
  }

  zoomToFit(): void {
    this.externalApp.zoomToFit();
  }
}
```

#### `angular/src/app/layout/right-sidebar/right-sidebar.component.ts`
```typescript
import { Component, inject, output } from '@angular/core';
import { ExternalAppService } from '../../core/services/external-app.service';
import { ElectronIpcService } from '../../core/services/electron-ipc.service';

@Component({
  selector: 'app-right-sidebar',
  standalone: true,
  template: `
    <div class="sidebar-container">
      <div class="sidebar-header">
        <h3 class="title">Properties</h3>
        <button class="toggle-btn" (click)="togglePanel.emit()">✕</button>
      </div>

      <div class="panel-content">
        <div class="section">
          <h4 class="section-title">Selected Nodes</h4>
          @if (selectedNodes().length === 0) {
            <p class="empty-text">No selection</p>
          } @else {
            <ul class="node-list">
              @for (nodeId of selectedNodes(); track nodeId) {
                <li class="node-item">{{ nodeId }}</li>
              }
            </ul>
          }
        </div>

        <div class="section">
          <h4 class="section-title">External App</h4>
          <div class="info-row">
            <span class="info-label">Status</span>
            <span class="info-value" [class]="externalStatus()">
              {{ externalStatus() }}
            </span>
          </div>
          <div class="info-row">
            <span class="info-label">URL</span>
            <span class="info-value url">{{ externalUrl() || '—' }}</span>
          </div>
        </div>

        <div class="section">
          <h4 class="section-title">Theme</h4>
          <div class="theme-buttons">
            <button class="theme-btn" (click)="setTheme('light')">Light</button>
            <button class="theme-btn" (click)="setTheme('dark')">Dark</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; }

    .sidebar-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--bg-sidebar, #12121f);
      border-left: 1px solid var(--border-color, #1e1e3a);
    }

    .sidebar-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-color, #1e1e3a);
    }

    .title {
      font-size: 13px;
      font-weight: 600;
      margin: 0;
      color: var(--text-primary, #fff);
    }

    .toggle-btn {
      background: none;
      border: none;
      color: var(--text-muted, #555570);
      cursor: pointer;
      padding: 4px;
      font-size: 14px;
    }
    .toggle-btn:hover { color: var(--text-primary, #fff); }

    .panel-content { flex: 1; overflow-y: auto; }

    .section {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-color, #1e1e3a);
    }

    .section-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted, #555570);
      margin: 0 0 8px;
    }

    .empty-text {
      font-size: 12px;
      color: var(--text-muted, #555570);
      margin: 0;
    }

    .node-list {
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .node-item {
      font-size: 12px;
      padding: 4px 8px;
      border-radius: 4px;
      background: var(--bg-hover, #1a1a30);
      margin-bottom: 4px;
      font-family: monospace;
      color: var(--text-secondary, #8888a0);
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 0;
      font-size: 12px;
    }

    .info-label { color: var(--text-muted, #555570); }
    .info-value { color: var(--text-secondary, #8888a0); }
    .info-value.ready, .info-value.connected { color: #22c55e; }
    .info-value.loading { color: #eab308; }
    .info-value.error { color: #ef4444; }
    .info-value.url {
      max-width: 150px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: monospace;
      font-size: 11px;
    }

    .theme-buttons {
      display: flex;
      gap: 8px;
    }

    .theme-btn {
      flex: 1;
      padding: 6px;
      border: 1px solid var(--border-color, #1e1e3a);
      border-radius: 4px;
      background: transparent;
      color: var(--text-secondary, #8888a0);
      cursor: pointer;
      font-size: 12px;
    }
    .theme-btn:hover {
      background: var(--bg-hover, #1a1a30);
      border-color: var(--accent-color, #4f46e5);
    }
  `],
})
export class RightSidebarComponent {
  private externalApp = inject(ExternalAppService);
  private ipc = inject(ElectronIpcService);

  togglePanel = output();

  selectedNodes = this.externalApp.selectedNodes;
  externalStatus = this.ipc.externalAppStatus;
  externalUrl = this.ipc.externalAppUrl;

  setTheme(theme: 'light' | 'dark'): void {
    this.externalApp.setTheme(theme);
  }
}
```

#### `angular/src/app/layout/center-area/center-area.component.ts`
```typescript
import { Component, signal } from '@angular/core';
import { TabContainerComponent } from './tab-container/tab-container.component';
import { DashboardComponent } from '../../features/dashboard/dashboard.component';
import { ExternalViewComponent } from '../../features/external-view/external-view.component';

export interface Tab {
  id: string;
  label: string;
  icon: string;
  component: 'dashboard' | 'external-view';
}

@Component({
  selector: 'app-center-area',
  standalone: true,
  imports: [TabContainerComponent, DashboardComponent, ExternalViewComponent],
  template: `
    <div class="center-container">
      <!-- Tab Bar -->
      <div class="tab-bar">
        @for (tab of tabs; track tab.id) {
          <button
            class="tab"
            [class.active]="activeTab() === tab.id"
            (click)="activeTab.set(tab.id)"
          >
            <span class="tab-icon">{{ tab.icon }}</span>
            <span class="tab-label">{{ tab.label }}</span>
          </button>
        }
      </div>

      <!-- Tab Content -->
      <div class="tab-content">
        @switch (activeTab()) {
          @case ('dashboard') {
            <app-dashboard />
          }
          @case ('ctrlx-flow') {
            <app-external-view />
          }
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; }

    .center-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--bg-primary, #0f0f1a);
    }

    .tab-bar {
      display: flex;
      background: var(--bg-sidebar, #12121f);
      border-bottom: 1px solid var(--border-color, #1e1e3a);
      padding: 0 8px;
      flex-shrink: 0;
    }

    .tab {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 10px 16px;
      border: none;
      border-bottom: 2px solid transparent;
      background: transparent;
      color: var(--text-muted, #555570);
      cursor: pointer;
      font-size: 13px;
      transition: all 0.15s;
    }
    .tab:hover {
      color: var(--text-secondary, #8888a0);
      background: var(--bg-hover, #1a1a30);
    }
    .tab.active {
      color: var(--text-primary, #fff);
      border-bottom-color: var(--accent-color, #4f46e5);
    }

    .tab-icon { font-size: 14px; }

    .tab-content {
      flex: 1;
      overflow: hidden;
      position: relative;
    }
  `],
})
export class CenterAreaComponent {
  activeTab = signal('dashboard');

  tabs: Tab[] = [
    { id: 'dashboard', label: 'Dashboard', icon: '◫', component: 'dashboard' },
    { id: 'ctrlx-flow', label: 'ctrlX FLOW', icon: '⬡', component: 'external-view' },
  ];
}
```

#### `angular/src/app/features/external-view/external-view.component.ts`
```typescript
import {
  Component,
  ElementRef,
  inject,
  OnInit,
  OnDestroy,
  AfterViewInit,
  signal,
} from '@angular/core';
import { ElectronIpcService } from '../../core/services/electron-ipc.service';
import type { ExternalAppBounds } from '../../../../../shared/models';

/**
 * This component acts as a "placeholder" that tells the Electron main
 * process where to position the WebContentsView for the external app.
 *
 * Since WebContentsView is NOT a DOM element (it's a native Chromium
 * view managed by the main process), Angular cannot embed it directly.
 * Instead, this component:
 * 1. Reserves screen space with a div
 * 2. Observes its own position/size via ResizeObserver
 * 3. Sends bounds to main process via IPC
 * 4. Main process positions the WebContentsView on top
 */
@Component({
  selector: 'app-external-view',
  standalone: true,
  template: `
    <div class="external-view-container">
      @if (status() === 'loading') {
        <div class="loading-overlay">
          <div class="spinner"></div>
          <p>Connecting to ctrlX FLOW...</p>
        </div>
      }
      @if (status() === 'error') {
        <div class="error-overlay">
          <p class="error-icon">⚠</p>
          <p>Failed to load ctrlX FLOW</p>
          <button class="retry-btn" (click)="loadExternalApp()">Retry</button>
        </div>
      }
      @if (status() === 'idle') {
        <div class="idle-overlay">
          <p>Click to connect to ctrlX FLOW</p>
          <div class="url-input-group">
            <input
              class="url-input"
              [value]="externalUrl()"
              (input)="externalUrl.set(asInputValue($event))"
              placeholder="http://localhost:1880"
            />
            <button class="connect-btn" (click)="loadExternalApp()">Connect</button>
          </div>
        </div>
      }
      <!-- This div is the "slot" — its bounds are sent to main process -->
      <div class="view-slot" #viewSlot></div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; }

    .external-view-container {
      position: relative;
      width: 100%;
      height: 100%;
    }

    .view-slot {
      width: 100%;
      height: 100%;
    }

    .loading-overlay, .error-overlay, .idle-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: var(--bg-primary, #0f0f1a);
      z-index: 1;
      gap: 12px;
    }

    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid var(--border-color, #1e1e3a);
      border-top-color: var(--accent-color, #4f46e5);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    p {
      color: var(--text-secondary, #8888a0);
      font-size: 14px;
      margin: 0;
    }

    .error-icon { font-size: 32px; }

    .retry-btn, .connect-btn {
      padding: 8px 20px;
      border: none;
      border-radius: 6px;
      background: var(--accent-color, #4f46e5);
      color: #fff;
      cursor: pointer;
      font-size: 13px;
    }
    .retry-btn:hover, .connect-btn:hover {
      filter: brightness(1.1);
    }

    .url-input-group {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }

    .url-input {
      padding: 8px 12px;
      border: 1px solid var(--border-color, #1e1e3a);
      border-radius: 6px;
      background: var(--bg-sidebar, #12121f);
      color: var(--text-primary, #fff);
      font-size: 13px;
      width: 300px;
      font-family: monospace;
    }
    .url-input:focus {
      outline: none;
      border-color: var(--accent-color, #4f46e5);
    }
  `],
})
export class ExternalViewComponent implements OnInit, AfterViewInit, OnDestroy {
  private ipc = inject(ElectronIpcService);
  private elementRef = inject(ElementRef);
  private resizeObserver: ResizeObserver | null = null;
  private animFrameId: number | null = null;

  status = this.ipc.externalAppStatus;
  externalUrl = signal('http://localhost:1880');

  ngOnInit(): void {
    // Load config to get default URL
    this.ipc.getConfig().then(config => {
      if (config.externalAppUrl) {
        this.externalUrl.set(config.externalAppUrl);
      }
    });
  }

  ngAfterViewInit(): void {
    this.setupBoundsTracking();
  }

  /**
   * Track the position/size of the view slot and relay to main process.
   * Uses ResizeObserver + rAF for efficient updates.
   */
  private setupBoundsTracking(): void {
    const slot = this.elementRef.nativeElement.querySelector('.view-slot') as HTMLElement;
    if (!slot) return;

    const updateBounds = (): void => {
      const rect = slot.getBoundingClientRect();
      const bounds: ExternalAppBounds = {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
      if (bounds.width > 0 && bounds.height > 0) {
        this.ipc.setExternalBounds(bounds);
      }
    };

    this.resizeObserver = new ResizeObserver(() => {
      if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
      this.animFrameId = requestAnimationFrame(updateBounds);
    });

    this.resizeObserver.observe(slot);

    // Also listen to window scroll/resize
    window.addEventListener('resize', updateBounds);
    // Initial bounds
    setTimeout(updateBounds, 100);
  }

  async loadExternalApp(): Promise<void> {
    const url = this.externalUrl();
    if (!url) return;
    try {
      await this.ipc.loadExternalApp(url);
      // Save URL to config
      this.ipc.updateConfig({ externalAppUrl: url });
    } catch (error) {
      console.error('Failed to load external app:', error);
    }
  }

  asInputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
  }
}
```

#### `angular/src/app/features/dashboard/dashboard.component.ts`
```typescript
import { Component, inject } from '@angular/core';
import { ElectronIpcService } from '../../core/services/electron-ipc.service';
import { ExternalAppService } from '../../core/services/external-app.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  template: `
    <div class="dashboard">
      <div class="dashboard-header">
        <h1>Dashboard</h1>
        <p class="subtitle">System overview and quick actions</p>
      </div>

      <div class="cards-grid">
        <div class="card">
          <h3>Flow Status</h3>
          <div class="card-value" [class]="flowStatus().status">
            {{ flowStatus().status | titlecase }}
          </div>
        </div>

        <div class="card">
          <h3>Selected Nodes</h3>
          <div class="card-value">{{ selectedNodes().length }}</div>
        </div>

        <div class="card">
          <h3>External App</h3>
          <div class="card-value" [class]="externalStatus()">
            {{ externalStatus() | titlecase }}
          </div>
        </div>

        <div class="card">
          <h3>Quick Connect</h3>
          <button class="card-action" (click)="connectFlow()">
            Open ctrlX FLOW
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; overflow-y: auto; }

    .dashboard {
      padding: 32px;
      max-width: 900px;
    }

    .dashboard-header h1 {
      font-size: 24px;
      font-weight: 700;
      color: var(--text-primary, #fff);
      margin: 0;
    }

    .subtitle {
      font-size: 14px;
      color: var(--text-muted, #555570);
      margin: 4px 0 24px;
    }

    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 16px;
    }

    .card {
      background: var(--bg-sidebar, #12121f);
      border: 1px solid var(--border-color, #1e1e3a);
      border-radius: 8px;
      padding: 20px;
    }

    .card h3 {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-muted, #555570);
      margin: 0 0 12px;
    }

    .card-value {
      font-size: 20px;
      font-weight: 700;
      color: var(--text-primary, #fff);
    }
    .card-value.connected, .card-value.ready { color: #22c55e; }
    .card-value.loading { color: #eab308; }
    .card-value.error { color: #ef4444; }

    .card-action {
      padding: 8px 16px;
      border: 1px solid var(--accent-color, #4f46e5);
      border-radius: 6px;
      background: transparent;
      color: var(--accent-color, #4f46e5);
      cursor: pointer;
      font-size: 13px;
    }
    .card-action:hover {
      background: var(--accent-color, #4f46e5);
      color: #fff;
    }
  `],
})
export class DashboardComponent {
  private ipc = inject(ElectronIpcService);
  private externalApp = inject(ExternalAppService);

  flowStatus = this.externalApp.flowStatus;
  selectedNodes = this.externalApp.selectedNodes;
  externalStatus = this.ipc.externalAppStatus;

  connectFlow(): void {
    // Switch to the ctrlX FLOW tab (would need a tab service in production)
    console.log('Navigate to ctrlX FLOW tab');
  }
}
```

#### `angular/src/styles.scss`
```scss
:root {
  --bg-primary: #0f0f1a;
  --bg-sidebar: #12121f;
  --bg-hover: #1a1a30;
  --border-color: #1e1e3a;
  --accent-color: #4f46e5;
  --text-primary: #e8e8f0;
  --text-secondary: #8888a0;
  --text-muted: #555570;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  height: 100%;
  overflow: hidden;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  font-size: 14px;
  -webkit-font-smoothing: antialiased;
}

::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
}
```

---

## 4. Communication Examples (End-to-End)

### 4.1 Angular → External App (Send Command)

```typescript
// In Angular component or service:
externalAppService.loadModel('/path/to/model.json', '2d');

// Internally:
// 1. externalAppService calls ipcService.sendToExternal('flow:load-model', payload)
// 2. ipcService creates BridgeMessage, calls window.electronAPI.bridge.sendToExternal(msg)
// 3. preload-shell.ts: ipcRenderer.send('bridge:to-external', msg)
// 4. main.ts: ipcMain receives, calls externalViewService.sendToExternal(msg)
// 5. externalViewService: externalView.webContents.send('bridge:from-shell', msg)
// 6. preload-external.ts: ipcRenderer receives, calls registered callback
// 7. ctrlX FLOW JS: window.ctrlxBridge.onMessageFromHost(msg => { /* handle */ })
```

### 4.2 External App → Angular (Send Event)

```typescript
// In ctrlX FLOW app (or injected script):
window.ctrlxBridge.sendToHost('flow:selection-changed', {
  selectedNodeIds: ['node-1', 'node-3'],
  selectedEdgeIds: [],
  timestamp: Date.now(),
});

// Internally:
// 1. preload-external.ts: ipcRenderer.send('bridge:to-shell', bridgeMessage)
// 2. main.ts: ipcMain receives, validates sender is external view
// 3. main.ts: shellView.webContents.send('bridge:from-external', bridgeMessage)
// 4. preload-shell.ts: ipcRenderer receives, calls registered callback
// 5. ElectronIpcService: updates lastExternalMessage signal
// 6. ExternalAppService: effect() triggers, dispatches to handleExternalMessage
// 7. Angular UI reactively updates (selected nodes shown in right sidebar)
```

### 4.3 Angular → Electron → Node.js (File Operation)

```typescript
// In Angular:
const content = await electronIpcService.readFile('/path/to/config.yaml');

// Internally:
// 1. window.electronAPI.fs.readFile('/path/to/config.yaml')
// 2. preload-shell.ts: ipcRenderer.invoke('shell:read-file', { path, encoding })
// 3. main.ts: ipcMain.handle receives, calls fileService.readFile()
// 4. file.service.ts: validates path, reads via fs.readFile()
// 5. Result returned through invoke chain back to Angular
```

### 4.4 Node.js → Angular (Push Notification)

```typescript
// In main process (e.g., file watcher):
import { watch } from 'fs';

watch('/path/to/models/', (eventType, filename) => {
  if (shellView && !shellView.webContents.isDestroyed()) {
    shellView.webContents.send('bridge:from-external', {
      type: 'system:file-changed',
      payload: { eventType, filename },
      timestamp: Date.now(),
      source: 'shell',
    });
  }
});

// Angular picks this up via the existing bridge listener
```

---

## 5. Best Practices & Security Checklist

### Electron Security Checklist

| # | Rule | Status |
|---|---|---|
| 1 | `nodeIntegration: false` | ✅ Both renderers |
| 2 | `contextIsolation: true` | ✅ Both renderers |
| 3 | `sandbox: true` for external | ✅ External renderer |
| 4 | Preload uses `contextBridge` | ✅ Whitelist-only APIs |
| 5 | IPC messages validated | ✅ Schema checks in handlers |
| 6 | Navigation restricted | ✅ `will-navigate` handler blocks cross-origin |
| 7 | New window creation blocked | ✅ `setWindowOpenHandler` returns `deny` |
| 8 | Permission requests denied | ✅ Default deny handler |
| 9 | CSP headers set | ✅ Via `webRequest.onHeadersReceived` |
| 10 | Separate partition for external | ✅ `persist:ctrlx-external` |
| 11 | No remote module | ✅ Not imported |
| 12 | URL protocol validation | ✅ Only `http:` / `https:` allowed |

### Angular Performance Tips

- **Zoneless change detection** (Angular 21): No zone.js overhead, signals drive UI updates
- **`OnPush` not needed** with signals: Change detection runs only when signal values change
- **Lazy loading**: Feature components loaded on demand via `loadComponent`
- **ResizeObserver + rAF**: External view bounds tracked efficiently without polling
- **No unnecessary watchers**: IPC listeners cleaned up in `ngOnDestroy`

### Anti-Patterns Avoided

| Anti-Pattern | What We Did Instead |
|---|---|
| Direct DOM access to external app | WebContentsView with IPC messaging |
| `require('electron')` in renderer | contextBridge with typed API |
| Global event bus | Typed IPC channels with validation |
| Polling for bounds | ResizeObserver + requestAnimationFrame |
| Untyped IPC messages | `BridgeMessage<T>` with type discriminator |
| Fat preload scripts | Minimal surface area, separate preloads per renderer |

---

## 6. Future Extensibility

### Multi-Tab Support

The architecture already supports multiple external apps. To add more tabs:

```typescript
// In ExternalViewService, manage a Map of views:
private views = new Map<string, WebContentsView>();

async loadUrl(tabId: string, url: string): Promise<void> {
  // Create or reuse view for this tab
  let view = this.views.get(tabId);
  if (!view) {
    view = new WebContentsView({ /* ... */ });
    this.views.set(tabId, view);
  }
  await view.webContents.loadURL(url);
}

switchTab(tabId: string): void {
  // Detach all, attach only the active one
  this.views.forEach((view, id) => {
    if (id === tabId) {
      this.window.contentView.addChildView(view);
    } else {
      this.window.contentView.removeChildView(view);
    }
  });
}
```

### Plugin Architecture

```typescript
// plugins/plugin-manifest.ts
interface PluginManifest {
  id: string;
  name: string;
  version: string;
  entryPoint: string; // URL or local path
  permissions: ('fs-read' | 'fs-write' | 'network' | 'ipc')[];
  sidebar?: { position: 'left' | 'right'; component: string };
}

// Each plugin gets its own WebContentsView with restricted preload
```

### Offline/Online Modes

```typescript
// Monitor network status
window.addEventListener('online', () => {
  ipcRenderer.send('network:status', { online: true });
});
window.addEventListener('offline', () => {
  ipcRenderer.send('network:status', { online: false });
});

// In main process: cache external app for offline use
// Using service worker or local file server fallback
```

---

## 7. Build & Run

### Package Scripts (`package.json`)

```json
{
  "name": "ctrlx-desktop",
  "version": "1.0.0",
  "scripts": {
    "angular:dev": "cd angular && ng serve",
    "angular:build": "cd angular && ng build --configuration production",
    "electron:dev": "tsc -p electron/tsconfig.json && electron .",
    "dev": "concurrently \"npm run angular:dev\" \"wait-on http://localhost:4200 && npm run electron:dev\"",
    "build": "npm run angular:build && tsc -p electron/tsconfig.json && electron-builder",
    "start": "npm run dev"
  },
  "main": "electron/dist/main.js",
  "dependencies": {
    "electron": "^41.1.1"
  },
  "devDependencies": {
    "@angular/cli": "^21.2.0",
    "concurrently": "^9.0.0",
    "electron-builder": "^25.0.0",
    "typescript": "^5.7.0",
    "wait-on": "^8.0.0"
  }
}
```

### Electron Builder Config

```json
{
  "appId": "com.ctrlx.desktop",
  "productName": "ctrlX Desktop",
  "directories": {
    "output": "release"
  },
  "files": [
    "electron/dist/**/*",
    "angular/dist/**/*",
    "shared/**/*"
  ],
  "win": {
    "target": "nsis"
  },
  "mac": {
    "target": "dmg"
  },
  "linux": {
    "target": "AppImage"
  }
}
```
