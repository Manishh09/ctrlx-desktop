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

export type FileEncoding = 'utf8' | 'utf-8' | 'ascii' | 'base64' | 'base64url' | 'hex' | 'binary' | 'latin1' | 'ucs2' | 'ucs-2' | 'utf16le' | 'utf-16le';

export interface FileOperation {
  path: string;
  encoding?: FileEncoding;
}

export interface FileWriteOperation extends FileOperation {
  content: string;
}

export interface AppConfig {
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
