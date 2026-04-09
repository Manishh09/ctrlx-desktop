import { Component, inject, output } from '@angular/core';
import { ExternalAppService } from '../../core/services/external-app.service';
import { ElectronIpcService } from '../../core/services/electron-ipc.service';
import { TitleCasePipe } from '@angular/common';

@Component({
  selector: 'app-right-sidebar',
  standalone: true,
  imports: [TitleCasePipe],
  template: `
    <div class="sidebar-container">
      <div class="sidebar-header">
        <h3 class="title">Properties</h3>
        <!-- <button class="toggle-btn" (click)="togglePanel.emit()">&#x2715;</button> -->
      </div>

      <div class="panel-content">
        <!-- Selected Nodes -->
        <div class="section">
          <h4 class="section-title">Selected nodes</h4>
          @if (selectedNodes().length === 0) {
            <p class="empty-text">No selection</p>
          } @else {
            <ul class="node-list">
              @for (nodeId of selectedNodes(); track nodeId) {
                <li class="node-item">{{ nodeId }}</li>
              }
            </ul>
          }
        </div>

        <!-- External App Info -->
        <div class="section">
          <h4 class="section-title">External app</h4>
          <div class="info-row">
            <span class="info-label">Status</span>
            <span class="info-value status-val" [class]="externalStatus()">
              {{ externalStatus() | titlecase }}
            </span>
          </div>
          <div class="info-row">
            <span class="info-label">URL</span>
            <span class="info-value url-val" [title]="externalUrl()">
              {{ externalUrl() || '\u2014' }}
            </span>
          </div>
          @if (loadError()) {
            <div class="error-row">
              {{ loadError() }}
            </div>
          }
        </div>

        <!-- Theme -->
        <div class="section">
          <h4 class="section-title">Theme</h4>
          <div class="theme-buttons">
            <button class="theme-btn" (click)="setTheme('light')">Light</button>
            <button class="theme-btn" (click)="setTheme('dark')">Dark</button>
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="section">
          <h4 class="section-title">Developer</h4>
          <button class="dev-btn" (click)="toggleDevTools()">Toggle DevTools</button>
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
      border-left: 1px solid var(--border-color);
    }

    .sidebar-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-color);
    }

    .title {
      font-size: 13px;
      font-weight: 600;
      margin: 0;
      color: var(--text-primary);
    }

    .toggle-btn {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 4px 6px;
      font-size: 14px;
      border-radius: var(--radius-sm);
      transition: all 150ms;
    }
    .toggle-btn:hover {
      color: var(--text-primary);
      background: var(--bg-hover);
    }

    .panel-content { flex: 1; overflow-y: auto; }

    .section {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-color);
    }

    .section-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
      margin: 0 0 8px;
    }

    .empty-text {
      font-size: 12px;
      color: var(--text-muted);
      margin: 0;
      font-style: italic;
    }

    .node-list {
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .node-item {
      font-size: 12px;
      padding: 5px 8px;
      border-radius: var(--radius-sm);
      background: var(--bg-hover);
      margin-bottom: 4px;
      font-family: 'SF Mono', 'Fira Code', monospace;
      color: var(--text-secondary);
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 0;
      font-size: 12px;
    }

    .info-label { color: var(--text-muted); }
    .info-value { color: var(--text-secondary); }

    .status-val.ready { color: var(--status-success); }
    .status-val.loading { color: var(--status-warning); }
    .status-val.error { color: var(--status-error); }

    .url-val {
      max-width: 150px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 11px;
    }

    .error-row {
      margin-top: 6px;
      padding: 6px 8px;
      border-radius: var(--radius-sm);
      background: rgba(239, 68, 68, 0.1);
      color: var(--status-error);
      font-size: 11px;
      word-break: break-word;
    }

    .theme-buttons {
      display: flex;
      gap: 8px;
    }

    .theme-btn {
      flex: 1;
      padding: 6px;
      border: 1px solid var(--border-color);
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 12px;
      transition: all 150ms;
    }
    .theme-btn:hover {
      background: var(--bg-hover);
      border-color: var(--accent-color);
    }

    .dev-btn {
      width: 100%;
      padding: 6px 10px;
      border: 1px solid var(--border-color);
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 11px;
      transition: all 150ms;
    }
    .dev-btn:hover {
      background: var(--bg-hover);
      color: var(--text-secondary);
    }
  `],
})
export class RightSidebarComponent {
  private externalApp = inject(ExternalAppService);
  private ipc = inject(ElectronIpcService);

  togglePanel = output();

  selectedNodes = this.externalApp.selectedNodes;
  externalStatus = this.ipc.externalAppStatus;
  externalUrl = this.ipc.externalAppUrl;
  loadError = this.ipc.externalLoadError;

  setTheme(theme: 'light' | 'dark'): void {
    this.externalApp.setTheme(theme);
  }

  toggleDevTools(): void {
    this.ipc.toggleDevTools();
  }
}
