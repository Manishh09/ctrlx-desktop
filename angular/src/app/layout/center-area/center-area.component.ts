import { Component, signal } from '@angular/core';
import { DashboardComponent } from '../../features/dashboard/dashboard.component';
import { ExternalViewComponent } from '../../features/external-view/external-view.component';

interface Tab {
  id: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-center-area',
  standalone: true,
  imports: [DashboardComponent, ExternalViewComponent],
  template: `
    <div class="center-container">
      <div class="tab-bar">
        @for (tab of tabs; track tab.id) {
          <button
            class="tab"
            [class.active]="activeTab() === tab.id"
            (click)="activeTab.set(tab.id)"
          >
            <span class="tab-icon">{{ tab.icon }}</span>
            <span class="tab-label">{{ tab.label }}</span>
          </button>
        }
      </div>

      <div class="tab-content">
        @switch (activeTab()) {
          @case ('dashboard') {
            <app-dashboard />
          }
          @case ('ctrlx-flow') {
            <app-external-view />
          }
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; }

    .center-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--bg-primary);
    }

    .tab-bar {
      display: flex;
      background: var(--bg-sidebar);
      border-bottom: 1px solid var(--border-color);
      padding: 0 8px;
      flex-shrink: 0;
    }

    .tab {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 10px 16px;
      border: none;
      border-bottom: 2px solid transparent;
      background: transparent;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 13px;
      transition: all 150ms;
    }
    .tab:hover {
      color: var(--text-secondary);
      background: var(--bg-hover);
    }
    .tab.active {
      color: var(--text-primary);
      border-bottom-color: var(--accent-color);
    }

    .tab-icon { font-size: 14px; }

    .tab-content {
      flex: 1;
      overflow: hidden;
      position: relative;
    }
  `],
})
export class CenterAreaComponent {
  activeTab = signal('dashboard');

  tabs: Tab[] = [
    { id: 'dashboard', label: 'Dashboard', icon: '\u25EB' },
    { id: 'ctrlx-flow', label: 'ctrlX FLOW', icon: '\u2B21' },
  ];
}
