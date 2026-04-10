import { ipcMain, dialog, app } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { FileService } from '../services/file.service';
import { ConfigService } from '../services/config.service';
import type { FileOperation, FileWriteOperation } from '../../shared/models';

// Restrict file I/O to the user's home directory and app data folder.
// This prevents the renderer from reading or writing arbitrary system paths.
const fileService = new FileService([app.getPath('home'), app.getPath('userData')]);
const configService = new ConfigService();

export function registerIpcHandlers(): void {
  // ── File System ────────────────
  ipcMain.handle(IPC_CHANNELS.SHELL.READ_FILE, async (_event, op: FileOperation) => {
    if (!op?.path || typeof op.path !== 'string') {
      throw new Error('Invalid file path');
    }
    return fileService.readFile(op.path, op.encoding);
  });

  ipcMain.handle(IPC_CHANNELS.SHELL.WRITE_FILE, async (_event, op: FileWriteOperation) => {
    if (!op?.path || typeof op.path !== 'string' || typeof op.content !== 'string') {
      throw new Error('Invalid write operation');
    }
    return fileService.writeFile(op.path, op.content);
  });

  ipcMain.handle(IPC_CHANNELS.SHELL.SELECT_FILE, async (_event, filters?: Electron.FileFilter[]) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: filters ?? [{ name: 'All Files', extensions: ['*'] }],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle(IPC_CHANNELS.SHELL.SELECT_DIRECTORY, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // ── Configuration ────────────────
  ipcMain.handle(IPC_CHANNELS.SHELL.GET_CONFIG, async () => {
    return configService.getConfig();
  });

  ipcMain.handle(IPC_CHANNELS.SHELL.SET_CONFIG, async (_event, partial) => {
    if (!partial || typeof partial !== 'object') {
      throw new Error('Invalid config object');
    }
    return configService.updateConfig(partial);
  });
}
