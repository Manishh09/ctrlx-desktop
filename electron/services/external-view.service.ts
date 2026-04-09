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

  async loadUrl(url: string): Promise<{ success: boolean; error?: string }> {
    try {
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
        if (!this.shellView.webContents.isDestroyed()) {
          this.shellView.webContents.send(IPC_CHANNELS.EXTERNAL.DID_NAVIGATE, navUrl);
        }
      });

      this.externalView.webContents.on('did-fail-load', (_event, errorCode, errorDesc) => {
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
        if (!this.shellView.webContents.isDestroyed()) {
          this.shellView.webContents.send(IPC_CHANNELS.EXTERNAL.READY);
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
    this.externalView.webContents.send(IPC_CHANNELS.BRIDGE.FROM_SHELL, message);
  }

  private setupBridgeFromExternal(): void {
    ipcMain.on(IPC_CHANNELS.BRIDGE.TO_SHELL, (_event, message: BridgeMessage) => {
      if (_event.sender !== this.externalView?.webContents) {
        console.warn('[ExternalView] Rejected bridge message from unknown sender');
        return;
      }
      if (!this.shellView.webContents.isDestroyed()) {
        this.shellView.webContents.send(IPC_CHANNELS.BRIDGE.FROM_EXTERNAL, message);
      }
    });

    ipcMain.on(IPC_CHANNELS.EXTERNAL.READY, (_event) => {
      if (_event.sender === this.externalView?.webContents) {
        if (!this.shellView.webContents.isDestroyed()) {
          this.shellView.webContents.send(IPC_CHANNELS.EXTERNAL.READY);
        }
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
    this.currentUrl = null;
  }
}
