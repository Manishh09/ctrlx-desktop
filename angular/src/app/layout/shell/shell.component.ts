import { Component, signal } from '@angular/core';
import { LeftSidebarComponent } from '../left-sidebar/left-sidebar.component';
import { RightSidebarComponent } from '../right-sidebar/right-sidebar.component';
import { CenterAreaComponent } from '../center-area/center-area.component';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [LeftSidebarComponent, RightSidebarComponent, CenterAreaComponent],
  template: `
    <div class="shell">
      <app-left-sidebar
        class="left-sidebar"
        [style.width.px]="leftSidebarWidth()"
      />

      <div
        class="divider"
        (mousedown)="startResizeLeft($event)"
      ></div>

      <app-center-area class="center-area" />

      @if (true) { <!-- showRightSidebar() --- IGNORE --- -->
        <div
          class="divider"
          (mousedown)="startResizeRight($event)"
        ></div>

        <app-right-sidebar
          class="right-sidebar"
          [style.width.px]="rightSidebarWidth()"
         
        />
        <!-- removed from above -->
         <!-- (togglePanel)="showRightSidebar.set(false)" -->
      }
    </div>
  `,
  styles: [`
    :host { display: block; height: 100vh; overflow: hidden; }

    .shell {
      display: flex;
      height: 100%;
      background: var(--bg-chrome);
      color: var(--text-primary);
    }

    .left-sidebar {
      flex-shrink: 0;
      min-width: 200px;
      max-width: 400px;
    }

    .center-area {
      flex: 1;
      min-width: 400px;
      overflow: hidden;
    }

    .right-sidebar {
      flex-shrink: 0;
      min-width: 240px;
      max-width: 500px;
    }

    .divider {
      width: 4px;
      cursor: col-resize;
      background: var(--border-color);
      transition: background 150ms;
      flex-shrink: 0;
    }
    .divider:hover,
    .divider:active {
      background: var(--accent-color);
    }
  `],
})
export class ShellComponent {
  leftSidebarWidth = signal(280);
  rightSidebarWidth = signal(300);
  showRightSidebar = signal(true);

  startResizeLeft(event: MouseEvent): void {
    this.startResize(event, this.leftSidebarWidth, 200, 400, false);
  }

  startResizeRight(event: MouseEvent): void {
    this.startResize(event, this.rightSidebarWidth, 240, 500, true);
  }

  private startResize(
    event: MouseEvent,
    widthSignal: ReturnType<typeof signal<number>>,
    min: number,
    max: number,
    invert: boolean,
  ): void {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = widthSignal();

    const onMove = (e: MouseEvent) => {
      const delta = invert ? startX - e.clientX : e.clientX - startX;
      widthSignal.set(Math.min(max, Math.max(min, startWidth + delta)));
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }
}
