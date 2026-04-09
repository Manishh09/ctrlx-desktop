/**
 * Preload script for the external ctrlX FLOW renderer.
 * Minimal API surface: only bridge messaging is exposed.
 * This renderer is fully sandboxed.
 */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import type { BridgeMessage } from '../shared/models';

const ctrlxBridge = {
  /**
   * Send a message to the Angular host shell.
   */
  sendToHost(type: string, payload: unknown): void {
    const message: BridgeMessage = {
      type,
      payload,
      timestamp: Date.now(),
      source: 'external',
    };
    console.log(`[EXTERNAL][5] preload-external: sendToHost | type: "${type}" | sending via IPC bridge:to-shell`);
    ipcRenderer.send(IPC_CHANNELS.BRIDGE.TO_SHELL, message);
  },

  /**
   * Reply to a request from the host shell.
   * @param correlationId The correlationId from the incoming request message.
   */
  replyToHost(correlationId: string, payload: unknown, isError = false): void {
    const reply: BridgeMessage = {
      type: 'reply',
      payload,
      timestamp: Date.now(),
      source: 'external',
      replyTo: correlationId,
      isError,
    };
    console.log(`[EXTERNAL][5] preload-external: replyToHost | correlationId: ${correlationId} | isError: ${isError}`);
    ipcRenderer.send(IPC_CHANNELS.BRIDGE.TO_SHELL, reply);
  },

  /**
   * Listen for messages from the Angular host shell.
   */
  onMessageFromHost(callback: (message: BridgeMessage) => void): () => void {
    const handler = (_event: IpcRendererEvent, message: BridgeMessage) => {
      console.log(`[EXTERNAL][5] preload-external: received from HOST | type: "${message.type}" | payload:`, message.payload);
      callback(message);
    };
    ipcRenderer.on(IPC_CHANNELS.BRIDGE.FROM_SHELL, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.BRIDGE.FROM_SHELL, handler);
  },

  /**
   * Signal that the external app is ready to receive messages.
   * Call this once your app has fully initialised.
   * This also triggers the message queue flush in the main process.
   */
  notifyReady(): void {
    console.log('[EXTERNAL][4] preload-external: notifyReady() called → sending READY + EXTERNAL_READY_ACK');
    ipcRenderer.send(IPC_CHANNELS.EXTERNAL.READY);
    // Separate ACK so main process flushes the bridge message queue
    ipcRenderer.send(IPC_CHANNELS.BRIDGE.EXTERNAL_READY_ACK);
  },
};

contextBridge.exposeInMainWorld('ctrlxBridge', ctrlxBridge);

export type CtrlxBridge = typeof ctrlxBridge;

// ──────────────────────────────────────────────────────────────────────────
// DEMO: Auto-simulate external app lifecycle & bidirectional data events
//
// This block auto-notifies readiness and sends periodic demo messages back
// to the Angular shell, simulating what ctrlX FLOW would emit in production.
// ──────────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  console.log('[EXTERNAL][3] preload-external: DOMContentLoaded → scheduling notifyReady in 800 ms');

  // Step 1: Notify host we are ready (with a slight delay so the page settles)
  setTimeout(() => {
    console.log('[EXTERNAL][4] preload-external: ⬆ Notifying host that external app is READY');
    ctrlxBridge.notifyReady();

    // Step 2: Send initial status to host
    setTimeout(() => {
      console.log('[EXTERNAL][5] preload-external: ⬆ Sending "flow:status-update" → connected to HOST');
      ctrlxBridge.sendToHost('flow:status-update', {
        status: 'connected',
        message: 'ctrlX FLOW is ready',
        progress: 100,
      });
    }, 400);

    // Step 3: Periodically simulate selection events back to host
    let demoTick = 0;
    const demoInterval = setInterval(() => {
      demoTick++;

      if (demoTick % 3 === 1) {
        const nodeIds = [`node-${demoTick}`, `node-${demoTick + 1}`];
        console.log(`[EXTERNAL][5] preload-external: ⬆ DEMO tick ${demoTick} → sending "flow:selection-changed" to HOST | nodes: [${nodeIds}]`);
        ctrlxBridge.sendToHost('flow:selection-changed', {
          selectedNodeIds: nodeIds,
          selectedEdgeIds: [`edge-${demoTick}`],
        });
      } else if (demoTick % 3 === 2) {
        console.log(`[EXTERNAL][5] preload-external: ⬆ DEMO tick ${demoTick} → sending "flow:node-double-click" to HOST`);
        ctrlxBridge.sendToHost('flow:node-double-click', {
          nodeId: `node-${demoTick}`,
          label: `Demo Node ${demoTick}`,
          position: { x: demoTick * 40, y: demoTick * 20 },
        });
      } else {
        console.log(`[EXTERNAL][5] preload-external: ⬆ DEMO tick ${demoTick} → sending "flow:status-update" to HOST`);
        ctrlxBridge.sendToHost('flow:status-update', {
          status: 'connected',
          message: `Flow running — tick ${demoTick}`,
          progress: (demoTick * 10) % 100,
        });
      }

      if (demoTick >= 15) clearInterval(demoInterval);
    }, 4000);

  }, 800);

  // Listen for commands sent from Angular and log them clearly
  ctrlxBridge.onMessageFromHost((message) => {
    console.log(`[EXTERNAL][5] preload-external: ⬇ Received data from HOST in external app | type: "${message.type}" | payload:`, message.payload);
  });
});
