import { Injectable, signal, computed, NgZone, inject, OnDestroy } from '@angular/core';
import { AppConfig, BridgeMessage } from '@shared/models';

/**
 * Angular service wrapping the Electron preload API.
 * Uses signals for reactive state management.
 */
@Injectable({ providedIn: 'root' })
export class ElectronIpcService implements OnDestroy {
  private zone = inject(NgZone);
  private cleanupFns: (() => void)[] = [];

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
      this.zone.run(() => {
        this._lastExternalMessage.set(message);
      });
    });
    this.cleanupFns.push(unsub1);

    const unsub2 = this.api.external.onNavigated((url) => {
      this.zone.run(() => {
        this._externalAppUrl.set(url);
        this._externalAppStatus.set('ready');
        this._externalLoadError.set(null);
      });
    });
    this.cleanupFns.push(unsub2);

    const unsub3 = this.api.external.onLoadFailed((error) => {
      this.zone.run(() => {
        this._externalAppStatus.set('error');
        this._externalLoadError.set(error.errorDescription);
        // Clear the external view so Angular overlays are not obscured
        this.api.external.destroy();
        this._externalAppUrl.set('');
      });
    });
    this.cleanupFns.push(unsub3);

    const unsub4 = this.api.external.onReady(() => {
      this.zone.run(() => {
        this._externalAppStatus.set('ready');
      });
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
    this.api.bridge.sendToExternal(message);
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
  }
}
