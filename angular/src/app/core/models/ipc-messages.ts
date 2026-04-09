// Re-export shared models for Angular consumption
// In a real monorepo (Nx), these would come from a shared lib

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
