/**
 * Shared data models for IPC communication.
 */

export interface BridgeMessage<T = unknown> {
  type: string;
  payload: T;
  timestamp: number;
  source: 'shell' | 'external';
  correlationId?: string;
  /** Set on reply messages — matches the correlationId of the original request. */
  replyTo?: string;
  /** True when this message is an error reply to a request. */
  isError?: boolean;
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

/**
 * A snapshot of one OS process collected by app.getAppMetrics().
 * Passed over IPC from main → renderer for the Process Monitor UI.
 */
export interface ProcessMetric {
  /** OS process ID */
  pid: number;
  /** Human-readable label, e.g. "Angular UI", "External 3D App", "GPU" */
  label: string;
  /** Electron process type: Browser, Tab, GPU, Utility, … */
  type: string;
  /** CPU usage in percent (0–100+). Absent for processes that do not report it. */
  cpu: number;
  /** Private memory footprint in megabytes */
  memory: number;
}
