import { Injectable, signal, computed, inject, effect } from '@angular/core';
import { ElectronIpcService } from './electron-ipc.service';
import { BridgeMessage } from '@shared/models';

interface StatusUpdateEvent {
  status: 'idle' | 'loading' | 'error' | 'connected';
  message?: string;
  progress?: number;
}

/**
 * High-level service for interacting with the ctrlX FLOW external app.
 */
@Injectable({ providedIn: 'root' })
export class ExternalAppService {
  private ipc = inject(ElectronIpcService);

  private _selectedNodes = signal<string[]>([]);
  private _selectedEdges = signal<string[]>([]);
  private _flowStatus = signal<StatusUpdateEvent>({
    status: 'idle',
    message: undefined,
    progress: undefined,
  });

  readonly selectedNodes = this._selectedNodes.asReadonly();
  readonly selectedEdges = this._selectedEdges.asReadonly();
  readonly flowStatus = this._flowStatus.asReadonly();
  readonly isConnected = computed(() => this._flowStatus().status === 'connected');

  constructor() {
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

  exportFlow(format: 'json' | 'png' = 'json'): void {
    this.ipc.sendToExternal('flow:export', { format });
  }

  // ── Handle incoming events ────────────────

  private handleExternalMessage(message: BridgeMessage): void {
    switch (message.type) {
      case 'flow:selection-changed': {
        const event = message.payload as { selectedNodeIds: string[]; selectedEdgeIds: string[] };
        this._selectedNodes.set(event.selectedNodeIds ?? []);
        this._selectedEdges.set(event.selectedEdgeIds ?? []);
        break;
      }
      case 'flow:status-update': {
        const event = message.payload as StatusUpdateEvent;
        this._flowStatus.set(event);
        break;
      }
      case 'flow:node-double-click': {
        console.log('[ExternalApp] Node double-clicked:', message.payload);
        break;
      }
      case 'flow:error': {
        console.error('[ExternalApp] Error from flow:', message.payload);
        break;
      }
      default:
        console.log('[ExternalApp] Unhandled message:', message.type);
    }
  }
}
