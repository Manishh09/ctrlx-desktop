import { Session } from 'electron';

export function setupPermissions(session: Session): void {
  session.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowedPermissions: string[] = [
      'clipboard-read',
      'clipboard-sanitized-write',
    ];

    if (allowedPermissions.includes(permission)) {
      callback(true);
    } else {
      console.warn(`[Security] Denied permission: ${permission}`);
      callback(false);
    }
  });

  // Allowlist — anything NOT explicitly listed is denied, regardless of future
  // Chromium/Electron additions.
  session.setPermissionCheckHandler((_webContents, permission) => {
    const allowed = ['clipboard-read', 'clipboard-sanitized-write'];
    return allowed.includes(permission);
  });
}
