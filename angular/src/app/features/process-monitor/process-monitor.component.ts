import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ProcessMonitorService, SortField } from './process-monitor.service';

/**
 * ProcessMonitorComponent
 *
 * Chrome Task Manager-style panel that displays real-time metrics
 * for every Electron process (Angular UI, External 3D App, GPU, …).
 *
 * Architecture:
 *   Electron main  ──IPC──►  preload (contextBridge)  ──►  ProcessMonitorService
 *   ProcessMonitorService polls every 2 s and stores results in a Signal.
 *   This component reads the computed Signal and renders with @for / @if.
 */
@Component({
  selector: 'app-process-monitor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  template: `
    <div class="pm-container">
      <!-- ── Header ── -->
      <div class="pm-header">
        <h2 class="pm-title">
          <span class="pm-icon">⚙</span>
          Process Monitor
        </h2>

        @if (svc.loading()) {
          <span class="pm-badge pm-badge--loading">Refreshing…</span>
        }

        @if (svc.error()) {
          <span class="pm-badge pm-badge--error" [title]="svc.error()!">Error</span>
        }
      </div>

      <!-- ── Type filter pills ── -->
      <div class="pm-filters" role="group" aria-label="Filter by process type">
        @for (type of svc.availableTypes(); track type) {
          <button
            class="pm-filter-pill"
            [class.pm-filter-pill--active]="svc.typeFilter() === type"
            (click)="svc.setTypeFilter(type)"
          >
            {{ type === 'all' ? 'All' : type }}
          </button>
        }
      </div>

      <!-- ── Table ── -->
      <div class="pm-table-wrap">
        <table class="pm-table" aria-label="Process metrics">
          <thead>
            <tr>
              <th
                class="pm-th pm-th--sortable"
                [class.pm-th--active]="svc.sortField() === 'label'"
                (click)="svc.setSort('label')"
                scope="col"
              >
                Process
                <span class="pm-sort-icon">{{ sortIcon('label') }}</span>
              </th>
              <th
                class="pm-th pm-th--sortable pm-th--num"
                [class.pm-th--active]="svc.sortField() === 'pid'"
                (click)="svc.setSort('pid')"
                scope="col"
              >
                PID
                <span class="pm-sort-icon">{{ sortIcon('pid') }}</span>
              </th>
              <th
                class="pm-th pm-th--sortable"
                [class.pm-th--active]="svc.sortField() === 'type'"
                (click)="svc.setSort('type')"
                scope="col"
              >
                Type
                <span class="pm-sort-icon">{{ sortIcon('type') }}</span>
              </th>
              <th
                class="pm-th pm-th--sortable pm-th--num"
                [class.pm-th--active]="svc.sortField() === 'cpu'"
                (click)="svc.setSort('cpu')"
                scope="col"
              >
                CPU %
                <span class="pm-sort-icon">{{ sortIcon('cpu') }}</span>
              </th>
              <th
                class="pm-th pm-th--sortable pm-th--num"
                [class.pm-th--active]="svc.sortField() === 'memory'"
                (click)="svc.setSort('memory')"
                scope="col"
              >
                Memory (MB)
                <span class="pm-sort-icon">{{ sortIcon('memory') }}</span>
              </th>
              <th class="pm-th pm-th--actions" scope="col">Actions</th>
            </tr>
          </thead>

          <tbody>
            @for (proc of svc.processes(); track proc.pid) {
              <tr
                class="pm-row"
                [class.pm-row--high-cpu]="proc.cpu > 20"
                [class.pm-row--labeled]="isSpecialProcess(proc.label)"
              >
                <!-- Label -->
                <td class="pm-td pm-td--label">
                  <span class="pm-label-dot" [class]="labelDotClass(proc.label)"></span>
                  {{ proc.label }}
                </td>

                <!-- PID -->
                <td class="pm-td pm-td--num pm-td--mono">{{ proc.pid }}</td>

                <!-- Type -->
                <td class="pm-td">
                  <span class="pm-type-badge pm-type-badge--{{ proc.type.toLowerCase() }}">
                    {{ proc.type }}
                  </span>
                </td>

                <!-- CPU -->
                <td
                  class="pm-td pm-td--num pm-td--mono"
                  [class.pm-td--high]="proc.cpu > 20"
                >
                  {{ proc.cpu | number : '1.1-1' }}
                </td>

                <!-- Memory -->
                <td class="pm-td pm-td--num pm-td--mono">
                  {{ proc.memory | number : '1.1-1' }}
                </td>

                <!-- Kill button -->
                <td class="pm-td pm-td--actions">
                  <button
                    class="pm-kill-btn"
                    title="Terminate PID {{ proc.pid }}"
                    (click)="killProcess(proc.pid, proc.label)"
                  >
                    &#x2715;
                  </button>
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="6" class="pm-td pm-td--empty">
                  @if (svc.loading()) {
                    Loading process data…
                  } @else {
                    No processes found
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <!-- ── Footer ── -->
      <div class="pm-footer">
        {{ svc.processes().length }} process(es) · refreshes every 1 s
      </div>
    </div>
  `,
  styles: [`
    /* ── Container ─────────────────────────────────────────────────────────── */
    .pm-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--bg-surface, #1e1e2e);
      color: var(--text-primary, #cdd6f4);
      font-family: var(--font-ui, system-ui, sans-serif);
      font-size: 13px;
    }

    /* ── Header ─────────────────────────────────────────────────────────────── */
    .pm-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px 8px;
      border-bottom: 1px solid var(--border-color, #313244);
      flex-shrink: 0;
    }

    .pm-title {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.3px;
      color: var(--text-primary, #cdd6f4);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .pm-icon { font-style: normal; }

    .pm-badge {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 10px;
      font-weight: 500;
    }
    .pm-badge--loading {
      background: var(--accent-muted, #313244);
      color: var(--text-muted, #a6adc8);
    }
    .pm-badge--error {
      background: #e64553;
      color: #fff;
      cursor: help;
    }

    /* ── Filter pills ────────────────────────────────────────────────────── */
    .pm-filters {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 8px 16px;
      border-bottom: 1px solid var(--border-color, #313244);
      flex-shrink: 0;
    }

    .pm-filter-pill {
      padding: 3px 10px;
      border-radius: 12px;
      border: 1px solid var(--border-color, #45475a);
      background: transparent;
      color: var(--text-muted, #a6adc8);
      cursor: pointer;
      font-size: 12px;
      transition: background 120ms, color 120ms, border-color 120ms;
    }
    .pm-filter-pill:hover {
      background: var(--bg-hover, #313244);
      color: var(--text-primary, #cdd6f4);
    }
    .pm-filter-pill--active {
      background: var(--accent-color, #89b4fa);
      border-color: var(--accent-color, #89b4fa);
      color: #1e1e2e;
      font-weight: 600;
    }

    /* ── Table wrapper ───────────────────────────────────────────────────── */
    .pm-table-wrap {
      flex: 1;
      overflow-y: auto;
    }

    .pm-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }

    /* ── Table header ────────────────────────────────────────────────────── */
    .pm-th {
      position: sticky;
      top: 0;
      background: var(--bg-chrome, #181825);
      padding: 8px 12px;
      text-align: left;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted, #a6adc8);
      border-bottom: 1px solid var(--border-color, #313244);
      user-select: none;
      white-space: nowrap;
    }

    .pm-th--sortable {
      cursor: pointer;
    }
    .pm-th--sortable:hover {
      color: var(--text-primary, #cdd6f4);
    }
    .pm-th--active {
      color: var(--accent-color, #89b4fa) !important;
    }
    .pm-th--num  { text-align: right; width: 90px; }
    .pm-th--actions { text-align: center; width: 72px; }

    .pm-sort-icon {
      display: inline-block;
      width: 12px;
      margin-left: 2px;
      opacity: 0.7;
    }

    /* ── Table rows ──────────────────────────────────────────────────────── */
    .pm-row {
      border-bottom: 1px solid var(--border-color, #1e1e2e);
      transition: background 80ms;
    }
    .pm-row:hover {
      background: var(--bg-hover, #313244);
    }
    .pm-row--high-cpu {
      background: rgba(243, 139, 168, 0.06);
    }
    .pm-row--high-cpu:hover {
      background: rgba(243, 139, 168, 0.12);
    }
    .pm-row--labeled {
      /* Angular UI / External 3D App get a subtle highlight */
      background: rgba(137, 180, 250, 0.04);
    }
    .pm-row--labeled:hover {
      background: rgba(137, 180, 250, 0.09);
    }

    /* ── Table cells ─────────────────────────────────────────────────────── */
    .pm-td {
      padding: 7px 12px;
      vertical-align: middle;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 0; /* forces ellipsis with table-layout: fixed */
    }
    .pm-td--label {
      display: flex;
      align-items: center;
      gap: 7px;
      max-width: none;
    }
    .pm-td--num   { text-align: right; }
    .pm-td--mono  { font-family: var(--font-mono, 'Courier New', monospace); }
    .pm-td--high  { color: #f38ba8; font-weight: 600; }
    .pm-td--actions { text-align: center; }
    .pm-td--empty {
      text-align: center;
      padding: 32px;
      color: var(--text-muted, #a6adc8);
    }

    /* ── Label dot ───────────────────────────────────────────────────────── */
    .pm-label-dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
      background: var(--text-muted, #585b70);
    }
    .pm-label-dot--angular   { background: #a6e3a1; }
    .pm-label-dot--external  { background: #89b4fa; }
    .pm-label-dot--main      { background: #f9e2af; }

    /* ── Type badge ──────────────────────────────────────────────────────── */
    .pm-type-badge {
      display: inline-block;
      padding: 1px 7px;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 500;
      background: var(--bg-chrome, #181825);
      color: var(--text-muted, #a6adc8);
      border: 1px solid var(--border-color, #313244);
    }
    .pm-type-badge--browser { border-color: #f9e2af; color: #f9e2af; }
    .pm-type-badge--tab     { border-color: #a6e3a1; color: #a6e3a1; }
    .pm-type-badge--gpu     { border-color: #cba6f7; color: #cba6f7; }
    .pm-type-badge--utility { border-color: #89dceb; color: #89dceb; }

    /* ── Kill button ─────────────────────────────────────────────────────── */
    .pm-kill-btn {
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-muted, #585b70);
      border-radius: 4px;
      width: 24px;
      height: 24px;
      cursor: pointer;
      font-size: 12px;
      line-height: 1;
      transition: background 120ms, color 120ms, border-color 120ms;
    }
    .pm-kill-btn:hover {
      background: rgba(243, 139, 168, 0.15);
      border-color: #f38ba8;
      color: #f38ba8;
    }

    /* ── Footer ──────────────────────────────────────────────────────────── */
    .pm-footer {
      padding: 6px 16px;
      font-size: 11px;
      color: var(--text-muted, #6c7086);
      border-top: 1px solid var(--border-color, #313244);
      flex-shrink: 0;
    }
  `],
})
export class ProcessMonitorComponent {
  protected readonly svc = inject(ProcessMonitorService);

  sortIcon(field: SortField): string {
    if (this.svc.sortField() !== field) return '⇅';
    return this.svc.sortDir() === 'asc' ? '↑' : '↓';
  }

  isSpecialProcess(label: string): boolean {
    return label === 'Angular UI' || label === 'External 3D App' || label === 'Main Process';
  }

  labelDotClass(label: string): string {
    if (label === 'Angular UI')       return 'pm-label-dot--angular';
    if (label === 'External 3D App') return 'pm-label-dot--external';
    if (label === 'Main Process')     return 'pm-label-dot--main';
    return '';
  }

  killProcess(pid: number, label: string): void {
    if (!confirm(`Terminate "${label}" (PID ${pid})?`)) return;
    void this.svc.killProcess(pid);
  }
}
