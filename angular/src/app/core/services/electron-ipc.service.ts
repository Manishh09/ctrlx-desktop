import { Injectable, signal, computed, inject, OnDestroy } from '@angular/core';
import { AppConfig, BridgeMessage } from '@shared/models';

/**
 * Angular service wrapping the Electron preload API.
 * Uses signals for reactive state management.
 */
@Injectable({ providedIn: 'root' })
export class ElectronIpcService implements OnDestroy {
  private cleanupFns: (() => void)[] = [];

  /** Pending request/response callbacks keyed by correlationId. */
  private pendingRequests = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();

  // Reactive state
  private _externalAppStatus = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  private _externalAppUrl = signal<string>('');
  private _lastExternalMessage = signal<BridgeMessage | null>(null);
  private _externalLoadError = signal<string | null>(null);

  readonly externalAppStatus = this._externalAppStatus.asReadonly();
  readonly externalAppUrl = this._externalAppUrl.asReadonly();
  readonly lastExternalMessage = this._lastExternalMessage.asReadonly();
  readonly externalLoadError = this._externalLoadError.asReadonly();
  readonly isExternalReady = computed(() => this._externalAppStatus() === 'ready');

  private get api() {
    return window.electronAPI;
  }

  get isElectron(): boolean {
    return !!window.electronAPI;
  }

  constructor() {
    if (this.isElectron) {
      this.setupListeners();
    }
  }

  private setupListeners(): void {
    const unsub1 = this.api.bridge.onMessageFromExternal((message) => {
      // Route reply messages to their pending request callbacks
      if (message.replyTo && this.pendingRequests.has(message.replyTo)) {
        const pending = this.pendingRequests.get(message.replyTo)!;
        clearTimeout(pending.timer);
        this.pendingRequests.delete(message.replyTo);
        console.log(`[SHELL][8] ElectronIpcService: received REPLY from external | replyTo: ${message.replyTo} | isError: ${message.isError ?? false}`);
        if (message.isError) {
          pending.reject(new Error(String(message.payload)));
        } else {
          pending.resolve(message.payload);
        }
        return;
      }
      console.log(`[SHELL][8] ElectronIpcService: received message from EXTERNAL → dispatching to app | type: "${message.type}"`);
      this._lastExternalMessage.set(message);
    });
    this.cleanupFns.push(unsub1);

    const unsub2 = this.api.external.onNavigated((url) => {
      console.log('[SHELL][8] ElectronIpcService: external app did-navigate → status = ready | url:', url);
      this._externalAppUrl.set(url);
      this._externalAppStatus.set('ready');
      this._externalLoadError.set(null);
    });
    this.cleanupFns.push(unsub2);

    const unsub3 = this.api.external.onLoadFailed((error) => {
      console.log('[SHELL][8] ElectronIpcService: external app load FAILED → status = error | desc:', error.errorDescription);
      this._externalAppStatus.set('error');
      this._externalLoadError.set(error.errorDescription);
      // Clear the external view so Angular overlays are not obscured
      this.api.external.destroy();
      this._externalAppUrl.set('');
    });
    this.cleanupFns.push(unsub3);

    const unsub4 = this.api.external.onReady(() => {
      console.log('[SHELL][8] ElectronIpcService: external app signals READY → status = ready');
      this._externalAppStatus.set('ready');
    });
    this.cleanupFns.push(unsub4);
  }

  // ── External App Control ────────────────

  async loadExternalApp(url: string): Promise<void> {
    if (!this.isElectron) return;
    this._externalAppStatus.set('loading');
    this._externalAppUrl.set(url);
    this._externalLoadError.set(null);

    const result = await this.api.external.loadUrl(url);
    if (!result.success) {
      this._externalAppStatus.set('error');
      this._externalLoadError.set(result.error ?? 'Unknown error');
      throw new Error(result.error);
    }
  }

  async setExternalBounds(bounds: { x: number; y: number; width: number; height: number }): Promise<void> {
    if (!this.isElectron) return;
    await this.api.external.setBounds(bounds);
  }

  reloadExternal(): void {
    if (!this.isElectron) return;
    this.api.external.reload();
  }

  detachExternal(): void {
    if (!this.isElectron) return;
    this.api.external.detach();
  }

  destroyExternal(): void {
    if (!this.isElectron) return;
    this.api.external.destroy();
    this._externalAppStatus.set('idle');
  }

  // ── Bridge Messaging ────────────────

  sendToExternal(type: string, payload: unknown): void {
    if (!this.isElectron) return;
    const message: BridgeMessage = {
      type,
      payload,
      timestamp: Date.now(),
      source: 'shell',
      correlationId: crypto.randomUUID(),
    };
    console.log(`[SHELL][2] ElectronIpcService: sendToExternal | type: "${type}" | correlationId: ${message.correlationId}`);
    this.api.bridge.sendToExternal(message);
  }

  /**
   * Send a typed request to ctrlX FLOW and await a reply.
   * The external app must respond with a BridgeMessage whose `replyTo`
   * matches the outgoing `correlationId`.
   *
   * @param type    Message type (e.g. 'flow:get-zoom')
   * @param payload Request payload
   * @param timeoutMs How long to wait before rejecting (default 5 s)
   */
  requestExternal<T = unknown>(type: string, payload: unknown, timeoutMs = 5000): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.isElectron) {
        reject(new Error('Not running in Electron'));
        return;
      }
      const correlationId = crypto.randomUUID();
      const timer = setTimeout(() => {
        this.pendingRequests.delete(correlationId);
        reject(new Error(`Request '${type}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(correlationId, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      });

      const message: BridgeMessage = {
        type,
        payload,
        timestamp: Date.now(),
        source: 'shell',
        correlationId,
      };
      console.log(`[SHELL][2] ElectronIpcService: requestExternal | type: "${type}" | correlationId: ${correlationId} | timeout: ${timeoutMs}ms`);
      this.api.bridge.sendToExternal(message);
    });
  }

  // ── File System ────────────────

  readFile(path: string): Promise<string> {
    return this.api.fs.readFile(path);
  }

  writeFile(path: string, content: string): Promise<void> {
    return this.api.fs.writeFile(path, content);
  }

  selectFile(): Promise<string | null> {
    return this.api.fs.selectFile();
  }

  selectDirectory(): Promise<string | null> {
    return this.api.fs.selectDirectory();
  }

  // ── Config ────────────────

  getConfig(): Promise<AppConfig> {
    return this.api.config.get();
  }

  updateConfig(partial: Partial<AppConfig>): Promise<void> {
    return this.api.config.set(partial);
  }

  // ── Window ────────────────

  minimizeWindow(): void { this.api.window.minimize(); }
  maximizeWindow(): void { this.api.window.maximize(); }
  closeWindow(): void { this.api.window.close(); }
  toggleDevTools(): void { this.api.window.toggleDevTools(); }

  ngOnDestroy(): void {
    this.cleanupFns.forEach(fn => fn());
    // Cancel all pending request timers to avoid memory leaks
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Service destroyed'));
    }
    this.pendingRequests.clear();
  }
}
