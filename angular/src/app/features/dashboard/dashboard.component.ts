import { Component, inject } from '@angular/core';
import { ElectronIpcService } from '../../core/services/electron-ipc.service';
import { ExternalAppService } from '../../core/services/external-app.service';
import { TitleCasePipe } from '@angular/common';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [TitleCasePipe],
  template: `
    <div class="dashboard">
      <div class="dashboard-header">
        <h1>Dashboard</h1>
        <p class="subtitle">System overview and quick actions</p>
      </div>

      <div class="cards-grid">
        <div class="card">
          <div class="card-header">Flow status</div>
          <div class="card-value" [class]="flowStatus().status">
            {{ flowStatus().status | titlecase }}
          </div>
          @if (flowStatus().message) {
            <div class="card-detail">{{ flowStatus().message }}</div>
          }
        </div>

        <div class="card">
          <div class="card-header">Selected nodes</div>
          <div class="card-value">{{ selectedNodes().length }}</div>
          <div class="card-detail">
            {{ selectedNodes().length === 0 ? 'None selected' : selectedNodes().length + ' node(s)' }}
          </div>
        </div>

        <div class="card">
          <div class="card-header">External app</div>
          <div class="card-value" [class]="externalStatus()">
            {{ externalStatus() | titlecase }}
          </div>
          @if (externalUrl()) {
            <div class="card-detail mono">{{ externalUrl() }}</div>
          }
        </div>

        <div class="card">
          <div class="card-header">Quick actions</div>
          <div class="card-actions">
            <button class="card-btn primary" (click)="openExternalTab()">
              Open ctrlX FLOW
            </button>
            <button class="card-btn" (click)="reloadExternal()">
              Reload
            </button>
          </div>
        </div>
      </div>

      <div class="info-section">
        <h2>Architecture</h2>
        <p>
          This application uses Electron {{ electronVersion }} with Angular 21,
          embedding the ctrlX FLOW web application via a separate
          WebContentsView with full process isolation and GPU acceleration.
        </p>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">Renderer</span>
            <span class="info-val">Angular 21 (Zoneless)</span>
          </div>
          <div class="info-item">
            <span class="info-label">Embedding</span>
            <span class="info-val">WebContentsView</span>
          </div>
          <div class="info-item">
            <span class="info-label">IPC</span>
            <span class="info-val">contextBridge + preload</span>
          </div>
          <div class="info-item">
            <span class="info-label">Security</span>
            <span class="info-val">Sandboxed, CSP, isolated</span>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; overflow-y: auto; }

    .dashboard { padding: 32px; max-width: 960px; }

    .dashboard-header h1 {
      font-size: 24px;
      font-weight: 700;
      color: var(--text-primary);
      margin: 0;
    }

    .subtitle {
      font-size: 14px;
      color: var(--text-muted);
      margin: 4px 0 24px;
    }

    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }

    .card {
      background: var(--bg-sidebar);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      padding: 20px;
    }

    .card-header {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-muted);
      margin-bottom: 10px;
    }

    .card-value {
      font-size: 22px;
      font-weight: 700;
      color: var(--text-primary);
      margin-bottom: 4px;
    }
    .card-value.connected, .card-value.ready { color: var(--status-success); }
    .card-value.loading { color: var(--status-warning); }
    .card-value.error { color: var(--status-error); }

    .card-detail {
      font-size: 12px;
      color: var(--text-muted);
    }
    .card-detail.mono {
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 11px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .card-actions {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .card-btn {
      padding: 8px 12px;
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      background: transparent;
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 12px;
      transition: all 150ms;
    }
    .card-btn:hover {
      background: var(--bg-hover);
      border-color: var(--accent-color);
      color: var(--text-primary);
    }
    .card-btn.primary {
      background: var(--accent-color);
      border-color: var(--accent-color);
      color: #fff;
    }
    .card-btn.primary:hover {
      background: var(--accent-hover);
    }

    .info-section {
      border-top: 1px solid var(--border-color);
      padding-top: 24px;
    }

    .info-section h2 {
      font-size: 16px;
      font-weight: 600;
      margin: 0 0 8px;
      color: var(--text-primary);
    }

    .info-section p {
      font-size: 13px;
      color: var(--text-secondary);
      line-height: 1.6;
      margin-bottom: 16px;
    }

    .info-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }

    .info-item {
      display: flex;
      justify-content: space-between;
      padding: 8px 12px;
      background: var(--bg-sidebar);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-sm);
      font-size: 12px;
    }

    .info-label { color: var(--text-muted); }
    .info-val { color: var(--text-secondary); }
  `],
})
export class DashboardComponent {
  private ipc = inject(ElectronIpcService);
  private externalApp = inject(ExternalAppService);

  flowStatus = this.externalApp.flowStatus;
  selectedNodes = this.externalApp.selectedNodes;
  externalStatus = this.ipc.externalAppStatus;
  externalUrl = this.ipc.externalAppUrl;

  electronVersion = '41';

  openExternalTab(): void {
    // In a real app, this would switch the tab via a shared service
    console.log('Switch to ctrlX FLOW tab');
  }

  reloadExternal(): void {
    this.ipc.reloadExternal();
  }
}
