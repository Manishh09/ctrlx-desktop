import {
  Component,
  ElementRef,
  inject,
  OnInit,
  OnDestroy,
  AfterViewInit,
  signal,
  input,
  effect,
} from '@angular/core';
import { ElectronIpcService } from '../../core/services/electron-ipc.service';

/**
 * Placeholder component for the external WebContentsView.
 *
 * WebContentsView is a native Chromium view managed by the main process,
 * NOT a DOM element. This component:
 * 1. Reserves screen space with a div
 * 2. Tracks its position/size via ResizeObserver
 * 3. Sends bounds to main process via IPC
 * 4. Main process positions WebContentsView on top of this slot
 */
@Component({
  selector: 'app-external-view',
  standalone: true,
  template: `
    <div class="external-view-container">
      <!-- Overlays (shown on top of the slot when external is not ready) -->
      @switch (status()) {
        @case ('idle') {
          <div class="overlay">
            <div class="overlay-content">
              <span class="overlay-icon">&#x2B21;</span>
              <h3>Connect to ctrlX FLOW</h3>
              <p>Enter the URL of your ctrlX FLOW instance</p>
              <div class="url-input-group">
                <input
                  class="url-input"
                  [value]="externalUrl()"
                  (input)="externalUrl.set(asInputValue($event))"
                  (keydown.enter)="loadExternalApp()"
                  placeholder="http://localhost:1880"
                  spellcheck="false"
                />
                <button class="connect-btn" (click)="loadExternalApp()">Connect</button>
              </div>
            </div>
          </div>
        }
        @case ('loading') {
          <div class="overlay">
            <div class="overlay-content">
              <div class="spinner"></div>
              <p>Connecting to ctrlX FLOW...</p>
              <span class="loading-url">{{ externalUrl() }}</span>
            </div>
          </div>
        }
        @case ('error') {
          <div class="overlay">
            <div class="overlay-content">
              <span class="overlay-icon error-icon">&#x26A0;</span>
              <h3>Connection failed</h3>
              <p class="error-msg">{{ loadError() ?? 'Could not reach the ctrlX FLOW instance' }}</p>
              <div class="url-input-group">
                <input
                  class="url-input"
                  [value]="externalUrl()"
                  (input)="externalUrl.set(asInputValue($event))"
                  (keydown.enter)="loadExternalApp()"
                  spellcheck="false"
                />
                <button class="connect-btn" (click)="loadExternalApp()">Retry</button>
              </div>
            </div>
          </div>
        }
      }

      <!-- The view slot — its position/size is sent to main process -->
      <div class="view-slot"></div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; }

    .external-view-container {
      position: relative;
      width: 100%;
      height: 100%;
    }

    .view-slot {
      width: 100%;
      height: 100%;
    }

    .overlay {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg-primary);
      z-index: 1;
    }

    .overlay-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      max-width: 420px;
      text-align: center;
    }

    .overlay-icon {
      font-size: 40px;
      color: var(--accent-color);
      opacity: 0.7;
    }

    .error-icon {
      color: var(--status-error);
    }

    .overlay-content h3 {
      font-size: 18px;
      font-weight: 600;
      color: var(--text-primary);
      margin: 0;
    }

    .overlay-content p {
      color: var(--text-secondary);
      font-size: 13px;
      margin: 0;
    }

    .error-msg {
      color: var(--status-error) !important;
      font-size: 12px !important;
      padding: 6px 12px;
      background: rgba(239, 68, 68, 0.08);
      border-radius: var(--radius-sm);
      word-break: break-word;
    }

    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid var(--border-color);
      border-top-color: var(--accent-color);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .loading-url {
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 11px;
      color: var(--text-muted);
    }

    .url-input-group {
      display: flex;
      gap: 8px;
      margin-top: 4px;
      width: 100%;
    }

    .url-input {
      flex: 1;
      padding: 10px 14px;
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      background: var(--bg-sidebar);
      color: var(--text-primary);
      font-size: 13px;
      font-family: 'SF Mono', 'Fira Code', monospace;
      outline: none;
      transition: border-color 150ms;
    }
    .url-input:focus {
      border-color: var(--accent-color);
    }

    .connect-btn {
      padding: 10px 20px;
      border: none;
      border-radius: var(--radius-md);
      background: var(--accent-color);
      color: #fff;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      white-space: nowrap;
      transition: background 150ms;
    }
    .connect-btn:hover {
      background: var(--accent-hover);
    }
  `],
})
export class ExternalViewComponent implements OnInit, AfterViewInit, OnDestroy {
  private ipc = inject(ElectronIpcService);
  private elementRef = inject(ElementRef);
  private resizeObserver: ResizeObserver | null = null;
  private animFrameId: number | null = null;
  private windowResizeHandler: (() => void) | null = null;
  private slot: HTMLElement | null = null;
  private viewInitialized = signal(false);

  /** Passed by the parent tab container — true when this tab is visible. */
  active = input<boolean>(false);

  status = this.ipc.externalAppStatus;
  loadError = this.ipc.externalLoadError;
  externalUrl = signal('http://localhost:1880');

  constructor() {
    // React to tab visibility changes after the view is ready.
    effect(() => {
      if (!this.viewInitialized()) return;
      if (this.active()) {
        this.startBoundsTracking();
      } else {
        this.stopBoundsTracking();
        if (this.ipc.isElectron) this.ipc.detachExternal();
      }
    });
  }

  ngOnInit(): void {
    if (this.ipc.isElectron) {
      this.ipc.getConfig().then(config => {
        if (config.externalAppUrl) {
          this.externalUrl.set(config.externalAppUrl);
        }
      }).catch(() => {});
    }
  }

  ngAfterViewInit(): void {
    this.slot = this.elementRef.nativeElement.querySelector('.view-slot') as HTMLElement;
    // Signal readiness — effect() will fire and start tracking if already active.
    this.viewInitialized.set(true);
  }

  private startBoundsTracking(): void {
    if (!this.ipc.isElectron || !this.slot) return;

    // Tear down any stale observer before re-creating.
    this.stopBoundsTracking();

    const updateBounds = (): void => {
      const rect = this.slot!.getBoundingClientRect();
      const bounds = {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
      if (bounds.width > 0 && bounds.height > 0) {
        this.ipc.setExternalBounds(bounds);
      }
    };

    this.resizeObserver = new ResizeObserver(() => {
      if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
      this.animFrameId = requestAnimationFrame(updateBounds);
    });
    this.resizeObserver.observe(this.slot);

    this.windowResizeHandler = updateBounds;
    window.addEventListener('resize', this.windowResizeHandler);

    // Snap bounds immediately so the native view appears without waiting
    // for the first ResizeObserver callback.
    requestAnimationFrame(updateBounds);
  }

  private stopBoundsTracking(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.windowResizeHandler) {
      window.removeEventListener('resize', this.windowResizeHandler);
      this.windowResizeHandler = null;
    }
  }

  async loadExternalApp(): Promise<void> {
    const url = this.externalUrl().trim();
    if (!url) return;
    try {
      await this.ipc.loadExternalApp(url);
      this.ipc.updateConfig({ externalAppUrl: url }).catch(() => {});
    } catch (error) {
      console.error('Failed to load external app:', error);
    }
  }

  asInputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  ngOnDestroy(): void {
    this.stopBoundsTracking();
    // Always detach the native view when this component is torn down.
    if (this.ipc.isElectron) this.ipc.detachExternal();
  }
}
