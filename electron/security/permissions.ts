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

  session.setPermissionCheckHandler((_webContents, permission) => {
    const denied = ['media', 'geolocation', 'notifications', 'midi', 'pointerLock'];
    return !denied.includes(permission);
  });
}
