import {
  app,
  BaseWindow,
  IpcMainEvent,
  WebContentsView,
  ipcMain,
} from 'electron';
import * as path from 'path';
import * as fs from 'fs';
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

  /**
   * Messages buffered while the external view is not yet ready.
   * Flushed when the external app signals BRIDGE.EXTERNAL_READY_ACK.
   */
  private messageQueue: BridgeMessage[] = [];
  private isExternalReady = false;

  // ──────────────────────────────────────────────────────────────────────────
  // Named listener references — stored so they can be removed in destroy() and
  // prevent listener accumulation when the service is re-created (e.g. macOS
  // window re-activation via app.on('activate')).
  // ──────────────────────────────────────────────────────────────────────────

  private readonly onBridgeToShell = (event: IpcMainEvent, message: BridgeMessage): void => {
    if (event.sender !== this.externalView?.webContents) {
      console.warn('[MAIN] ExternalViewService: Rejected bridge message from unknown sender');
      return;
    }
    console.log(`[MAIN][6] ExternalViewService: received from EXTERNAL → forwarding to shell | type: "${message.type}" | source: ${message.source}`);
    if (!this.shellView.webContents.isDestroyed()) {
      this.shellView.webContents.send(IPC_CHANNELS.BRIDGE.FROM_EXTERNAL, message);
    }
  };

  private readonly onReadyAck = (event: IpcMainEvent): void => {
    if (event.sender !== this.externalView?.webContents) return;
    console.log('[MAIN][3] ExternalViewService: EXTERNAL_READY_ACK received → marking ready + flushing queue');
    this.isExternalReady = true;
    this.flushMessageQueue();
  };

  private readonly onExternalReady = (event: IpcMainEvent): void => {
    if (event.sender === this.externalView?.webContents) {
      console.log('[MAIN][3] ExternalViewService: READY signal from external app → forwarding to shell');
      if (!this.shellView.webContents.isDestroyed()) {
        this.shellView.webContents.send(IPC_CHANNELS.EXTERNAL.READY);
      }
    }
  };

  constructor(
    private window: BaseWindow,
    private shellView: WebContentsView,
  ) {
    this.setupBridgeFromExternal();
  }

  async loadUrl(url: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (this.externalView) {
        this.detach();
        this.externalView.webContents.close();
        this.externalView = null;
      }

      // Reset readiness state for new session
      this.isExternalReady = false;
      this.messageQueue = [];

      // ── Diagnostic: verify the preload file exists on disk ────────
      const preloadPath = path.join(__dirname, '../preload-external.js');
      const preloadExists = fs.existsSync(preloadPath);
      console.log(
        `[MAIN][1] ExternalViewService: preload path: "${preloadPath}"`,
        preloadExists ? '✅ file exists' : '❌ FILE NOT FOUND — run \'npm run electron:compile\' first!',
      );
      console.log('[MAIN][1] ExternalViewService: loadUrl called →', url);

      this.externalView = new WebContentsView({
        webPreferences: {
          preload: path.join(__dirname, '../preload-external.js'),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webgl: true,
          partition: 'persist:ctrlx-external',
          spellcheck: false,
          images: true,
          javascript: true,
        },
      });

      // Navigation guard
      this.externalView.webContents.on('will-navigate', (event, navUrl) => {
        try {
          const allowed = new URL(url);
          const target = new URL(navUrl);
          if (target.origin !== allowed.origin) {
            event.preventDefault();
            console.warn(`[ExternalView] Blocked navigation to: ${navUrl}`);
          }
        } catch {
          event.preventDefault();
        }
      });

      // Forward events to Angular shell
      this.externalView.webContents.on('did-navigate', (_event, navUrl) => {
        console.log('[MAIN][2] ExternalViewService: external did-navigate →', navUrl);
        if (!this.shellView.webContents.isDestroyed()) {
          this.shellView.webContents.send(IPC_CHANNELS.EXTERNAL.DID_NAVIGATE, navUrl);
        }
      });

      this.externalView.webContents.on('did-fail-load', (_event, errorCode, errorDesc) => {
        console.log('[MAIN][2] ExternalViewService: external did-fail-load | code:', errorCode, '| desc:', errorDesc);
        // Detach so Angular error overlay is not obscured by the native view
        this.detach();
        if (!this.shellView.webContents.isDestroyed()) {
          this.shellView.webContents.send(IPC_CHANNELS.EXTERNAL.DID_FAIL_LOAD, {
            errorCode,
            errorDescription: errorDesc,
          });
        }
      });

      this.externalView.setBackgroundColor('#1a1a2e');

      // Fallback: emit READY on did-finish-load so non-cooperative apps
      // (e.g. Node-RED that won't call ctrlxBridge.notifyReady()) still
      // transition out of the loading state.
      this.externalView.webContents.once('did-finish-load', () => {
        console.log('[MAIN][3] ExternalViewService: external did-finish-load → sending READY to shell');
        if (!this.shellView.webContents.isDestroyed()) {
          this.shellView.webContents.send(IPC_CHANNELS.EXTERNAL.READY);
        }

        // ── Diagnostic: verify ctrlxBridge was exposed by the preload (dev only) ──
        if (!app.isPackaged) {
          this.externalView?.webContents.executeJavaScript('typeof window.ctrlxBridge')
            .then((result: string) => {
              if (result === 'object') {
                console.log('[MAIN][DIAG] ✅ window.ctrlxBridge is EXPOSED — preload loaded correctly');
              } else {
                console.error(
                  `[MAIN][DIAG] ❌ window.ctrlxBridge is "${result}" in external renderer.`,
                  '\n  Possible causes:',
                  '\n  1. Preload JS not compiled (run: npm run electron:compile)',
                  '\n  2. Preload path mismatch (check log above)',
                  '\n  3. contextBridge.exposeInMainWorld() threw an error in the preload',
                );
              }
            })
            .catch((err: Error) => console.error('[MAIN][DIAG] executeJavaScript failed:', err));
        }
      });

      this.currentUrl = url;
      await this.externalView.webContents.loadURL(url);

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      // Detach so Angular overlays are visible on failure
      this.detach();
      return { success: false, error: message };
    }
  }

  setBounds(bounds: ExternalAppBounds): void {
    if (!this.externalView) return;

    if (!this.isAttached) {
      this.window.contentView.addChildView(this.externalView);
      this.isAttached = true;
    }

    this.externalView.setBounds(bounds);
  }

  detach(): void {
    if (this.externalView && this.isAttached) {
      try {
        this.window.contentView.removeChildView(this.externalView);
      } catch { /* view may already be removed */ }
      this.isAttached = false;
    }
  }

  sendToExternal(message: BridgeMessage): void {
    if (!this.externalView || this.externalView.webContents.isDestroyed()) return;

    if (!this.isExternalReady) {
      // Queue the message — will be flushed on EXTERNAL_READY_ACK
      console.log(`[MAIN][4] ExternalViewService: external not ready → QUEUED message | type: "${message.type}" | queue size: ${this.messageQueue.length + 1}`);
      this.messageQueue.push(message);
      return;
    }

    console.log(`[MAIN][4] ExternalViewService: forwarding to external view | type: "${message.type}" | correlationId: ${message.correlationId ?? 'none'}`);
    this.externalView.webContents.send(IPC_CHANNELS.BRIDGE.FROM_SHELL, message);
  }

  private flushMessageQueue(): void {
    if (!this.externalView || this.externalView.webContents.isDestroyed()) {
      this.messageQueue = [];
      return;
    }
    console.log(`[MAIN][4] ExternalViewService: flushing ${this.messageQueue.length} queued message(s) to external`);
    for (const msg of this.messageQueue) {
      console.log(`[MAIN][4]   → flushed type: "${msg.type}"`);
      this.externalView.webContents.send(IPC_CHANNELS.BRIDGE.FROM_SHELL, msg);
    }
    this.messageQueue = [];
  }

  private setupBridgeFromExternal(): void {
    // Register stored handler references so they can be cleanly removed
    // in destroy() without accumulating duplicate listeners.
    ipcMain.on(IPC_CHANNELS.BRIDGE.TO_SHELL, this.onBridgeToShell);
    ipcMain.on(IPC_CHANNELS.BRIDGE.EXTERNAL_READY_ACK, this.onReadyAck);
    ipcMain.on(IPC_CHANNELS.EXTERNAL.READY, this.onExternalReady);
  }

  /**
   * Returns the OS PID of the external WebContentsView renderer,
   * or null when no external view is currently loaded.
   * Used by the Process Monitor to label the external process.
   */
  getExternalOSProcessId(): number | null {
    if (!this.externalView || this.externalView.webContents.isDestroyed()) return null;
    try {
      return this.externalView.webContents.getOSProcessId();
    } catch {
      return null;
    }
  }

  reload(): void {
    this.externalView?.webContents.reload();
  }

  openDevTools(): void {
    if (!this.externalView || this.externalView.webContents.isDestroyed()) return;
    this.externalView.webContents.openDevTools({ mode: 'detach' });
    console.log('[MAIN] ExternalViewService: opened DevTools for external WebContentsView');
  }

  destroy(): void {
    // Remove all IPC listeners registered by this instance to prevent
    // accumulation when the service is destroyed and re-created.
    ipcMain.removeListener(IPC_CHANNELS.BRIDGE.TO_SHELL, this.onBridgeToShell);
    ipcMain.removeListener(IPC_CHANNELS.BRIDGE.EXTERNAL_READY_ACK, this.onReadyAck);
    ipcMain.removeListener(IPC_CHANNELS.EXTERNAL.READY, this.onExternalReady);
    this.detach();
    if (this.externalView && !this.externalView.webContents.isDestroyed()) {
      this.externalView.webContents.close();
    }
    this.externalView = null;
    this.currentUrl = null;
    this.isExternalReady = false;
    this.messageQueue = [];
  }
}
