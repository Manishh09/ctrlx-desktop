export type ExternalAppStatus = 'idle' | 'loading' | 'ready' | 'error';
export type AppTheme = 'light' | 'dark';

export interface AppState {
  externalAppStatus: ExternalAppStatus;
  externalAppUrl: string;
  theme: AppTheme;
  sidebarCollapsed: {
    left: boolean;
    right: boolean;
  };
}
