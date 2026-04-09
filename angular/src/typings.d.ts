/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Type declarations for the Electron preload APIs
 * exposed via contextBridge.
 */

interface ElectronExternalAPI {
  loadUrl(url: string): Promise<{ success: boolean; error?: string }>;
  setBounds(bounds: { x: number; y: number; width: number; height: number }): Promise<void>;
  reload(): void;
  detach(): void;
  destroy(): void;
  onNavigated(cb: (url: string) => void): () => void;
  onLoadFailed(cb: (error: { errorCode: number; errorDescription: string }) => void): () => void;
  onReady(cb: () => void): () => void;
}

interface BridgeMessage<T = unknown> {
  type: string;
  payload: T;
  timestamp: number;
  source: 'shell' | 'external';
  correlationId?: string;
}

interface ElectronBridgeAPI {
  sendToExternal(message: BridgeMessage): void;
  onMessageFromExternal(cb: (message: BridgeMessage) => void): () => void;
}

interface ElectronFsAPI {
  readFile(filePath: string, encoding?: string): Promise<string>;
  writeFile(filePath: string, content: string): Promise<void>;
  selectFile(filters?: any[]): Promise<string | null>;
  selectDirectory(): Promise<string | null>;
}

interface AppConfig {
  externalAppUrl: string;
  theme: 'light' | 'dark';
  leftSidebarWidth: number;
  rightSidebarWidth: number;
  recentFiles: string[];
  gpu: {
    hardwareAcceleration: boolean;
    webglEnabled: boolean;
  };
}

interface ElectronConfigAPI {
  get(): Promise<AppConfig>;
  set(config: Partial<AppConfig>): Promise<void>;
}

interface ElectronWindowAPI {
  minimize(): void;
  maximize(): void;
  close(): void;
  toggleDevTools(): void;
  isMaximized(): Promise<boolean>;
}

interface ElectronAPI {
  send(channel: string, ...args: unknown[]): void;
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, callback: (...args: unknown[]) => void): () => void;
  external: ElectronExternalAPI;
  bridge: ElectronBridgeAPI;
  fs: ElectronFsAPI;
  config: ElectronConfigAPI;
  window: ElectronWindowAPI;
}

interface CtrlxBridge {
  sendToHost(type: string, payload: unknown): void;
  onMessageFromHost(callback: (message: BridgeMessage) => void): () => void;
  notifyReady(): void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    ctrlxBridge: CtrlxBridge;
  }
}

export {};
