import { Component, inject, signal } from '@angular/core';
import { ExternalAppService } from '../../core/services/external-app.service';
import { ElectronIpcService } from '../../core/services/electron-ipc.service';
import { TitleCasePipe } from '@angular/common';

interface NavItem {
  icon: string;
  label: string;
  id: string;
}

@Component({
  selector: 'app-left-sidebar',
  standalone: true,
  imports: [TitleCasePipe],
  template: `
    <div class="sidebar-container">
      <div class="sidebar-header">
        <div class="logo-row">
          <span class="logo-icon">&#x2B21;</span>
          <h2 class="logo">ctrlX Desktop</h2>
        </div>
        <span class="version">v1.0.0</span>
      </div>

      <nav class="nav-list">
        @for (item of navItems; track item.id) {
          <button
            class="nav-item"
            [class.active]="activeItem() === item.id"
            (click)="activeItem.set(item.id)"
          >
            <span class="nav-icon">{{ item.icon }}</span>
            <span class="nav-label">{{ item.label }}</span>
          </button>
        }
      </nav>

      <div class="sidebar-section">
        <h3 class="section-title">Actions</h3>
        <button class="action-btn" (click)="loadModel()">
          <span class="action-icon">&#x25A3;</span> Load Model
        </button>
        <button class="action-btn" (click)="deploy()">
          <span class="action-icon">&#x25B6;</span> Deploy Flow
        </button>
        <button class="action-btn" (click)="zoomToFit()">
          <span class="action-icon">&#x29C9;</span> Zoom to Fit
        </button>
        <button class="action-btn" (click)="reloadExternal()">
          <span class="action-icon">&#x21BB;</span> Reload External
        </button>
      </div>

      <div class="sidebar-footer">
        <div class="status-indicator" [class]="flowStatus().status">
          <span class="status-dot"></span>
          <span>{{ flowStatus().status | titlecase }}</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; }

    .sidebar-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--bg-sidebar);
      border-right: 1px solid var(--border-color);
    }

    .sidebar-header {
      padding: 16px 16px 12px;
      border-bottom: 1px solid var(--border-color);
    }

    .logo-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .logo-icon {
      font-size: 20px;
      color: var(--accent-color);
    }

    .logo {
      font-size: 15px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--text-primary);
      margin: 0;
    }

    .version {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 2px;
      display: block;
    }

    .nav-list {
      padding: 8px;
      flex: 1;
      overflow-y: auto;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 10px 12px;
      border: none;
      border-radius: var(--radius-md);
      background: transparent;
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 13px;
      text-align: left;
      transition: all 150ms;
    }
    .nav-item:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }
    .nav-item.active {
      background: var(--accent-color);
      color: #fff;
    }

    .nav-icon { font-size: 16px; width: 20px; text-align: center; }

    .sidebar-section {
      padding: 12px 12px;
      border-top: 1px solid var(--border-color);
    }

    .section-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
      margin: 0 4px 8px;
    }

    .action-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 8px 12px;
      margin-bottom: 2px;
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      background: transparent;
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 12px;
      text-align: left;
      transition: all 150ms;
    }
    .action-btn:hover {
      background: var(--bg-hover);
      border-color: var(--accent-color);
      color: var(--text-primary);
    }
    .action-btn:active {
      background: var(--bg-active);
    }

    .action-icon {
      font-size: 14px;
      width: 16px;
      text-align: center;
      opacity: 0.7;
    }

    .sidebar-footer {
      padding: 12px 16px;
      border-top: 1px solid var(--border-color);
    }

    .status-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: var(--text-secondary);
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--text-muted);
      flex-shrink: 0;
    }
    .connected .status-dot { background: var(--status-success); }
    .loading .status-dot { background: var(--status-warning); animation: pulse 1s infinite; }
    .error .status-dot { background: var(--status-error); }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
  `],
})
export class LeftSidebarComponent {
  private externalApp = inject(ExternalAppService);
  private ipc = inject(ElectronIpcService);

  activeItem = signal('flows');
  flowStatus = this.externalApp.flowStatus;

  navItems: NavItem[] = [
    { icon: '\u2B21', label: 'Flows', id: 'flows' },
    { icon: '\u25EB', label: 'Models', id: 'models' },
    { icon: '\u2699', label: 'Configuration', id: 'config' },
    { icon: '\u25A4', label: 'Monitoring', id: 'monitor' },
  ];

  async loadModel(): Promise<void> {
    if (!this.ipc.isElectron) return;
    const filePath = await this.ipc.selectFile();
    if (filePath) {
      this.externalApp.loadModel(filePath, '2d');
    }
  }

  deploy(): void {
    this.externalApp.triggerDeploy();
  }

  zoomToFit(): void {
    this.externalApp.zoomToFit();
  }

  reloadExternal(): void {
    this.ipc.reloadExternal();
  }
}
