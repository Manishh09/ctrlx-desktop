/**
 * Preload script for the external ctrlX FLOW renderer.
 * Minimal API surface: only bridge messaging is exposed.
 * This renderer is fully sandboxed.
 *
 * IMPORTANT: Sandboxed preloads cannot require() files from disk.
 * Only require('electron') is allowed. All channel names are inlined here.
 * If you add a channel, update both this file AND shared/ipc-channels.ts.
 */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// ── Inlined channel names (mirrors shared/ipc-channels.ts) ────────────────
// Cannot use require('../shared/ipc-channels') — sandbox blocks file requires.
const CH = {
  BRIDGE_TO_SHELL:          'bridge:to-shell',
  BRIDGE_FROM_SHELL:        'bridge:from-shell',
  BRIDGE_EXTERNAL_READY_ACK:'bridge:external-ready-ack',
  EXTERNAL_READY:           'external:ready',
} as const;

// ── DIAGNOSTIC: this line fires the instant the preload script is parsed ──
console.log(
  '%c[EXTERNAL][PRELOAD] preload-external.js is RUNNING inside this WebContentsView',
  'color:#41B496;font-weight:bold;font-size:13px',
);
console.log('[EXTERNAL][PRELOAD] If you see this in the external-view DevTools → preload loaded ✅');
console.log('[EXTERNAL][PRELOAD] If you ONLY see this in the browser DevTools → wrong window! Open via "Open External DevTools" button in the Angular right-sidebar.');

const ctrlxBridge = {
  /**
   * Send a message to the Angular host shell.
   */
  sendToHost(type: string, payload: unknown): void {
    const message = {
      type,
      payload,
      timestamp: Date.now(),
      source: 'external' as const,
    };
    console.log(`[EXTERNAL][5] preload-external: sendToHost | type: "${type}" | sending via IPC bridge:to-shell`);
    ipcRenderer.send(CH.BRIDGE_TO_SHELL, message);
  },

  /**
   * Reply to a request from the host shell.
   * @param correlationId The correlationId from the incoming request message.
   */
  replyToHost(correlationId: string, payload: unknown, isError = false): void {
    const reply = {
      type: 'reply',
      payload,
      timestamp: Date.now(),
      source: 'external' as const,
      replyTo: correlationId,
      isError,
    };
    console.log(`[EXTERNAL][5] preload-external: replyToHost | correlationId: ${correlationId} | isError: ${isError}`);
    ipcRenderer.send(CH.BRIDGE_TO_SHELL, reply);
  },

  /**
   * Listen for messages from the Angular host shell.
   */
  onMessageFromHost(callback: (message: Record<string, unknown>) => void): () => void {
    const handler = (_event: IpcRendererEvent, message: Record<string, unknown>) => {
      console.log(`[EXTERNAL][5] preload-external: received from HOST | type: "${message['type']}" | payload:`, message['payload']);
      callback(message);
    };
    ipcRenderer.on(CH.BRIDGE_FROM_SHELL, handler);
    return () => ipcRenderer.removeListener(CH.BRIDGE_FROM_SHELL, handler);
  },

  /**
   * Signal that the external app is ready to receive messages.
   * Call this once your app has fully initialised.
   * This also triggers the message queue flush in the main process.
   */
  notifyReady(): void {
    console.log('[EXTERNAL][4] preload-external: notifyReady() called → sending READY + EXTERNAL_READY_ACK');
    ipcRenderer.send(CH.EXTERNAL_READY);
    // Separate ACK so main process flushes the bridge message queue
    ipcRenderer.send(CH.BRIDGE_EXTERNAL_READY_ACK);
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
    

  }, 800);

  // Listen for commands sent from Angular and log them clearly
  ctrlxBridge.onMessageFromHost((message) => {
    console.log(`[EXTERNAL][5] preload-external: ⬇ Received data from HOST in external app | type: "${message.type}" | payload:`, message.payload);
  });
});
