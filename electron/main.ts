import {
  app,
  BaseWindow,
  WebContentsView,
  ipcMain,
  session,
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
const IS_DEV = !app.isPackaged;
const ANGULAR_DEV_URL = 'http://localhost:4200';
const ANGULAR_PROD_PATH = path.join(__dirname, '../../../angular/dist/ctrlx-angular/browser/index.html');

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
  });

  // ── Shell View (Angular App) ────────────────
  shellView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload-shell.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webgl: true,
      spellcheck: false,
    },
  });

  // Shell fills the entire window
  mainWindow.contentView.addChildView(shellView);

  // Load Angular app
  if (IS_DEV) {
    shellView.webContents.loadURL(ANGULAR_DEV_URL);
    // Uncomment to open DevTools automatically:
    // shellView.webContents.openDevTools({ mode: 'detach' });
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
  };

  mainWindow.on('resize', updateLayout);
  updateLayout();

  shellView.webContents.once('did-finish-load', () => {
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
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error(`Disallowed protocol: ${parsed.protocol}`);
      }
    } catch (e) {
      if (e instanceof TypeError) throw new Error(`Invalid URL: ${url}`);
      throw e;
    }
    return externalViewService.loadUrl(url);
  });

  ipcMain.handle(IPC_CHANNELS.EXTERNAL.SET_BOUNDS, async (_event, bounds: ExternalAppBounds) => {
    if (!externalViewService) return;
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

  ipcMain.on(IPC_CHANNELS.EXTERNAL.DETACH, () => {
    externalViewService?.detach();
  });

  ipcMain.on(IPC_CHANNELS.EXTERNAL.DESTROY, () => {
    externalViewService?.destroy();
  });

  ipcMain.on(IPC_CHANNELS.EXTERNAL.TOGGLE_DEVTOOLS, () => {
    externalViewService?.openDevTools();
  });

  // ── Bridge: Shell → External ────────────────
  ipcMain.on(IPC_CHANNELS.BRIDGE.TO_EXTERNAL, (_event, message) => {
    externalViewService?.sendToExternal(message);
  });
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
  ipcMain.handle(IPC_CHANNELS.WINDOW.IS_MAXIMIZED, () => {
    return mainWindow?.isMaximized() ?? false;
  });
}

// ──────────────────────────────────────────
// App Lifecycle
// ──────────────────────────────────────────
app.whenReady().then(() => {
  setupPermissions(session.defaultSession);
  setupCSP(session.defaultSession);

  registerIpcHandlers();
  setupExternalViewIPC();
  setupWindowIPC();

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
