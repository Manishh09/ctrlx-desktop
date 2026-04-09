import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * File system service running in the main process.
 */
export class FileService {
  private allowedRoots: string[] = [];

  constructor(allowedRoots?: string[]) {
    this.allowedRoots = allowedRoots ?? [];
  }

  async readFile(filePath: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
    const resolved = path.resolve(filePath);
    this.validatePath(resolved);
    return fs.readFile(resolved, { encoding });
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const resolved = path.resolve(filePath);
    this.validatePath(resolved);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, content, 'utf-8');
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private validatePath(resolved: string): void {
    if (this.allowedRoots.length === 0) return;
    const isAllowed = this.allowedRoots.some(root =>
      resolved.startsWith(path.resolve(root))
    );
    if (!isAllowed) {
      throw new Error(`Access denied: ${resolved}`);
    }
  }
}
