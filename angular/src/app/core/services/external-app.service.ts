import { Injectable, signal, computed, inject, effect } from '@angular/core';
import { ElectronIpcService } from './electron-ipc.service';
import { BridgeMessage } from '@shared/models';

interface StatusUpdateEvent {
  status: 'idle' | 'loading' | 'error' | 'connected';
  message?: string;
  progress?: number;
}

export interface CommLogEntry {
  direction: 'in' | 'out';
  type: string;
  summary: string;
  time: string;
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
  private _commLog = signal<CommLogEntry[]>([]);

  readonly selectedNodes = this._selectedNodes.asReadonly();
  readonly selectedEdges = this._selectedEdges.asReadonly();
  readonly flowStatus = this._flowStatus.asReadonly();
  readonly commLog = this._commLog.asReadonly();
  readonly isConnected = computed(() => this._flowStatus().status === 'connected');

  constructor() {
    effect(() => {
      const message = this.ipc.lastExternalMessage();
      if (message) {
        this.handleExternalMessage(message);
      }
    });
  }

  // ── Internal helpers ─────────────────────

  private addLog(direction: 'in' | 'out', type: string, summary: string): void {
    const entry: CommLogEntry = { direction, type, summary, time: new Date().toLocaleTimeString() };
    this._commLog.update(log => [entry, ...log].slice(0, 30));
  }

  // ── Commands to ctrlX FLOW ────────────────

  loadModel(modelPath: string, modelType: '2d' | '3d' = '2d'): void {
    console.log(`[SHELL][1] ExternalAppService: ACTION → loadModel | path: "${modelPath}" | type: ${modelType}`);
    this.addLog('out', 'flow:load-model', `Load model: ${modelPath} (${modelType})`);
    this.ipc.sendToExternal('flow:load-model', {
      modelPath,
      modelType,
      autoLayout: true,
    });
  }

  triggerDeploy(): void {
    console.log('[SHELL][1] ExternalAppService: ACTION → triggerDeploy');
    this.addLog('out', 'flow:deploy', 'Deploy flow');
    this.ipc.sendToExternal('flow:deploy', {});
  }

  selectNodes(nodeIds: string[]): void {
    console.log(`[SHELL][1] ExternalAppService: ACTION → selectNodes | ids: [${nodeIds}]`);
    this.addLog('out', 'flow:select-nodes', `Select ${nodeIds.length} node(s)`);
    this.ipc.sendToExternal('flow:select-nodes', { nodeIds });
  }

  zoomToFit(): void {
    console.log('[SHELL][1] ExternalAppService: ACTION → zoomToFit');
    this.addLog('out', 'flow:zoom-to-fit', 'Zoom to fit all nodes');
    this.ipc.sendToExternal('flow:zoom-to-fit', {});
  }

  setTheme(theme: 'light' | 'dark'): void {
    console.log(`[SHELL][1] ExternalAppService: ACTION → setTheme | theme: ${theme}`);
    this.addLog('out', 'flow:set-theme', `Set theme: ${theme}`);
    this.ipc.sendToExternal('flow:set-theme', { theme });
  }

  exportFlow(format: 'json' | 'png' = 'json'): void {
    console.log(`[SHELL][1] ExternalAppService: ACTION → exportFlow | format: ${format}`);
    this.addLog('out', 'flow:export', `Export as ${format}`);
    this.ipc.sendToExternal('flow:export', { format });
  }

  // ── Handle incoming events ────────────────

  private handleExternalMessage(message: BridgeMessage): void {
    console.log(`[SHELL][9] ExternalAppService: ⬇ Received from external | type: "${message.type}"`);
    switch (message.type) {
      case 'flow:selection-changed': {
        const event = message.payload as { selectedNodeIds: string[]; selectedEdgeIds: string[] };
        const nodes = event.selectedNodeIds ?? [];
        const edges = event.selectedEdgeIds ?? [];
        console.log(`[SHELL][9] ExternalAppService: selection-changed | nodes: [${nodes}] | edges: [${edges}]`);
        this._selectedNodes.set(nodes);
        this._selectedEdges.set(edges);
        this.addLog('in', message.type, `${nodes.length} node(s), ${edges.length} edge(s) selected`);
        break;
      }
      case 'flow:status-update': {
        const event = message.payload as StatusUpdateEvent;
        console.log(`[SHELL][9] ExternalAppService: status-update | status: "${event.status}" | msg: "${event.message ?? ''}"`);
        this._flowStatus.set(event);
        this.addLog('in', message.type, `Status: ${event.status}${event.message ? ' — ' + event.message : ''}`);
        break;
      }
      case 'flow:node-double-click': {
        const payload = message.payload as { nodeId?: string; nodeType?: string };
        console.log('[SHELL][9] ExternalAppService: node-double-click | payload:', payload);
        this.addLog('in', message.type, `Node double-clicked: ${payload?.nodeId ?? 'unknown'}`);
        break;
      }
      case 'flow:error': {
        const payload = message.payload as { code?: string; message?: string };
        console.error('[SHELL][9] ExternalAppService: error from external | payload:', payload);
        this.addLog('in', message.type, `Error: ${payload?.message ?? 'unknown'}`);
        break;
      }
      default: {
        const summary = JSON.stringify(message.payload).slice(0, 60);
        console.log(`[SHELL][9] ExternalAppService: unhandled type: "${message.type}" | payload: ${summary}`);
        this.addLog('in', message.type, summary);
      }
    }
  }
}
