import { Session } from 'electron';

/**
 * Attach a Content-Security-Policy response header to every request on
 * the given session.
 *
 * @param session - Electron session to protect (shell or a named partition).
 * @param isDev   - When true, allows 'unsafe-inline' and 'unsafe-eval' in
 *                  script-src to support Angular JIT / HMR. Strip both in
 *                  production (AOT build requires neither).
 */
export function setupCSP(session: Session, isDev: boolean): void {
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self'";

  session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          [
            "default-src 'self'",
            scriptSrc,
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob: https:",
            "font-src 'self' data: https:",
            "connect-src 'self' ws: wss: http://localhost:* https:",
            "worker-src 'self' blob:",
          ].join('; '),
        ],
      },
    });
  });
}
