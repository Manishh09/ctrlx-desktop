import {
  Injectable,
  OnDestroy,
  signal,
  computed,
  inject,
} from '@angular/core';
import { ElectronIpcService } from '../../core/services/electron-ipc.service';

/** A snapshot of one OS process, mirroring the shared ProcessMetric model. */
export interface ProcessMetric {
  pid: number;
  label: string;
  type: string;
  /** CPU usage in percent (0–100+) */
  cpu: number;
  /** Private memory footprint in megabytes */
  memory: number;
}

export type SortField = 'label' | 'pid' | 'type' | 'cpu' | 'memory';
export type SortDir   = 'asc' | 'desc';
export type FilterType = 'all' | string;

/**
 * ProcessMonitorService
 *
 * Polls the Electron main process every 2 seconds for app.getAppMetrics()
 * data and exposes the results via Angular Signals.  All derived views
 * (filtered, sorted) are computed signals so they update automatically.
 */
@Injectable({ providedIn: 'root' })
export class ProcessMonitorService implements OnDestroy {
  private readonly ipc = inject(ElectronIpcService);

  // ── Raw state ──────────────────────────────────────────────────────────────
  private readonly _processes = signal<ProcessMetric[]>([]);
  private readonly _loading   = signal(false);
  private readonly _error     = signal<string | null>(null);
  private readonly _sortField = signal<SortField>('cpu');
  private readonly _sortDir   = signal<SortDir>('desc');
  private readonly _typeFilter = signal<FilterType>('all');

  // ── Public read-only signals ───────────────────────────────────────────────
  readonly loading    = this._loading.asReadonly();
  readonly error      = this._error.asReadonly();
  readonly sortField  = this._sortField.asReadonly();
  readonly sortDir    = this._sortDir.asReadonly();
  readonly typeFilter = this._typeFilter.asReadonly();

  /** All distinct process types present in the current snapshot. */
  readonly availableTypes = computed(() => {
    const types = new Set(this._processes().map((p) => p.type));
    return ['all', ...Array.from(types).sort()];
  });

  /** Filtered + sorted process list — ready for direct template binding. */
  readonly processes = computed(() => {
    let list = this._processes();

    const filter = this._typeFilter();
    if (filter !== 'all') {
      list = list.filter((p) => p.type === filter);
    }

    const field = this._sortField();
    const dir   = this._sortDir() === 'asc' ? 1 : -1;

    return [...list].sort((a, b) => {
      const av = a[field];
      const bv = b[field];
      if (typeof av === 'number' && typeof bv === 'number') {
        return (av - bv) * dir;
      }
      return String(av).localeCompare(String(bv)) * dir;
    });
  });

  private pollHandle: ReturnType<typeof setInterval> | null = null;
  private readonly POLL_INTERVAL_MS = 1000;

  constructor() {
    // Only poll when running inside Electron
    if (this.ipc.isElectron) {
      this.fetchMetrics();   // immediate first fetch
      this.pollHandle = setInterval(() => this.fetchMetrics(), this.POLL_INTERVAL_MS);
    }
  }

  ngOnDestroy(): void {
    if (this.pollHandle !== null) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
  }

  // ── Interactions ───────────────────────────────────────────────────────────

  setSort(field: SortField): void {
    if (this._sortField() === field) {
      // Toggle direction when clicking the same column
      this._sortDir.update((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      this._sortField.set(field);
      this._sortDir.set('desc');
    }
  }

  setTypeFilter(type: FilterType): void {
    this._typeFilter.set(type);
  }

  async killProcess(pid: number): Promise<void> {
    if (!window.electronAPI?.processMonitor) return;
    const result = await window.electronAPI.processMonitor.kill(pid);
    if (!result.success) {
      this._error.set(result.error ?? `Failed to kill PID ${pid}`);
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async fetchMetrics(): Promise<void> {
    if (!window.electronAPI?.processMonitor) return;
    this._loading.set(true);
    try {
      const metrics = await window.electronAPI.processMonitor.getMetrics();
      this._processes.set(metrics);
      this._error.set(null);
    } catch (err) {
      this._error.set(err instanceof Error ? err.message : 'Failed to fetch process metrics');
    } finally {
      this._loading.set(false);
    }
  }
}
