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
   */
  notifyReady(): void {
    ipcRenderer.send(IPC_CHANNELS.EXTERNAL.READY);
  },
};

contextBridge.exposeInMainWorld('ctrlxBridge', ctrlxBridge);

export type CtrlxBridge = typeof ctrlxBridge;
