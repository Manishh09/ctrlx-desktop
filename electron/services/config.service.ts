import * as fs from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';
import type { AppConfig } from '../../shared/models';

const DEFAULT_CONFIG: AppConfig = {
  externalAppUrl: 'http://localhost:1880',
  theme: 'light',
  leftSidebarWidth: 280,
  rightSidebarWidth: 300,
  recentFiles: [],
  gpu: {
    hardwareAcceleration: true,
    webglEnabled: true,
  },
};

export class ConfigService {
  private configPath: string;
  private config: AppConfig | null = null;

  constructor() {
    this.configPath = path.join(app.getPath('userData'), 'app-config.json');
  }

  async getConfig(): Promise<AppConfig> {
    if (this.config) return { ...this.config };

    try {
      const raw = await fs.readFile(this.configPath, 'utf-8');
      this.config = { ...DEFAULT_CONFIG, ...JSON.parse(raw) } as AppConfig;
    } catch {
      this.config = { ...DEFAULT_CONFIG };
      await this.persist();
    }

    return { ...this.config };
  }

  async updateConfig(partial: Partial<AppConfig>): Promise<void> {
    const current = await this.getConfig();
    this.config = { ...current, ...partial };
    await this.persist();
  }

  private async persist(): Promise<void> {
    if (!this.config) return;
    const dir = path.dirname(this.configPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
  }
}
