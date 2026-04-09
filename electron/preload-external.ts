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
    ipcRenderer.send(IPC_CHANNELS.BRIDGE.TO_SHELL, reply);
  },

  /**
   * Listen for messages from the Angular host shell.
   */
  onMessageFromHost(callback: (message: BridgeMessage) => void): () => void {
    const handler = (_event: IpcRendererEvent, message: BridgeMessage) => {
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
    ipcRenderer.send(IPC_CHANNELS.EXTERNAL.READY);
    // Separate ACK so main process flushes the bridge message queue
    ipcRenderer.send(IPC_CHANNELS.BRIDGE.EXTERNAL_READY_ACK);
  },
};

contextBridge.exposeInMainWorld('ctrlxBridge', ctrlxBridge);

export type CtrlxBridge = typeof ctrlxBridge;
