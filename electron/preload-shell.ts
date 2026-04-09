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
const ALLOWED_SEND_CHANNELS = new Set<string>([
  IPC_CHANNELS.SHELL.READY,
  IPC_CHANNELS.EXTERNAL.RELOAD,
  IPC_CHANNELS.EXTERNAL.DESTROY,
  IPC_CHANNELS.BRIDGE.TO_EXTERNAL,
  IPC_CHANNELS.WINDOW.MINIMIZE,
  IPC_CHANNELS.WINDOW.MAXIMIZE,
  IPC_CHANNELS.WINDOW.CLOSE,
  IPC_CHANNELS.WINDOW.TOGGLE_DEVTOOLS,
]);

const ALLOWED_INVOKE_CHANNELS = new Set<string>([
  IPC_CHANNELS.SHELL.GET_CONFIG,
  IPC_CHANNELS.SHELL.SET_CONFIG,
  IPC_CHANNELS.SHELL.READ_FILE,
  IPC_CHANNELS.SHELL.WRITE_FILE,
  IPC_CHANNELS.SHELL.SELECT_FILE,
  IPC_CHANNELS.SHELL.SELECT_DIRECTORY,
  IPC_CHANNELS.EXTERNAL.LOAD_URL,
  IPC_CHANNELS.EXTERNAL.SET_BOUNDS,
  IPC_CHANNELS.WINDOW.IS_MAXIMIZED,
]);

const ALLOWED_RECEIVE_CHANNELS = new Set<string>([
  IPC_CHANNELS.BRIDGE.FROM_EXTERNAL,
  IPC_CHANNELS.EXTERNAL.DID_NAVIGATE,
  IPC_CHANNELS.EXTERNAL.DID_FAIL_LOAD,
  IPC_CHANNELS.EXTERNAL.READY,
]);

const electronAPI = {
  // ── Generic IPC (with channel validation) ────────────
  send(channel: string, ...args: unknown[]): void {
    if (ALLOWED_SEND_CHANNELS.has(channel)) {
      ipcRenderer.send(channel as any, ...args);
    } else {
      console.warn(`[preload] Blocked send to channel: ${channel}`);
    }
  },

  invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    if (ALLOWED_INVOKE_CHANNELS.has(channel)) {
      return ipcRenderer.invoke(channel as any, ...args);
    }
    return Promise.reject(new Error(`Blocked invoke to channel: ${channel}`));
  },

  on(channel: string, callback: (...args: unknown[]) => void): () => void {
    if (!ALLOWED_RECEIVE_CHANNELS.has(channel)) {
      console.warn(`[preload] Blocked listener on channel: ${channel}`);
      return () => {};
    }
    const handler = (_event: IpcRendererEvent, ...args: unknown[]) => callback(...args);
    ipcRenderer.on(channel as any, handler);
    return () => ipcRenderer.removeListener(channel as any, handler);
  },

  // ── Typed convenience methods ────────────

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
    destroy(): void {
      ipcRenderer.send(IPC_CHANNELS.EXTERNAL.DESTROY);
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
    onReady(cb: () => void): () => void {
      const handler = () => cb();
      ipcRenderer.on(IPC_CHANNELS.EXTERNAL.READY, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.EXTERNAL.READY, handler);
    },
  },

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

  config: {
    get(): Promise<AppConfig> {
      return ipcRenderer.invoke(IPC_CHANNELS.SHELL.GET_CONFIG) as any;
    },
    set(config: Partial<AppConfig>): Promise<void> {
      return ipcRenderer.invoke(IPC_CHANNELS.SHELL.SET_CONFIG, config) as any;
    },
  },

  window: {
    minimize(): void { ipcRenderer.send(IPC_CHANNELS.WINDOW.MINIMIZE); },
    maximize(): void { ipcRenderer.send(IPC_CHANNELS.WINDOW.MAXIMIZE); },
    close(): void { ipcRenderer.send(IPC_CHANNELS.WINDOW.CLOSE); },
    toggleDevTools(): void { ipcRenderer.send(IPC_CHANNELS.WINDOW.TOGGLE_DEVTOOLS); },
    isMaximized(): Promise<boolean> {
      return ipcRenderer.invoke(IPC_CHANNELS.WINDOW.IS_MAXIMIZED) as any;
    },
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

export type ElectronAPI = typeof electronAPI;
