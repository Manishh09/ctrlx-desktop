/**
 * Single source of truth for all IPC channel names.
 * Used by main process, preload scripts, and Angular app.
 */
export const IPC_CHANNELS = {
  // Shell ↔ Main
  SHELL: {
    READY: 'shell:ready',
    GET_CONFIG: 'shell:get-config',
    SET_CONFIG: 'shell:set-config',
    READ_FILE: 'shell:read-file',
    WRITE_FILE: 'shell:write-file',
    SELECT_FILE: 'shell:select-file',
    SELECT_DIRECTORY: 'shell:select-directory',
  },

  // External app management
  EXTERNAL: {
    LOAD_URL: 'external:load-url',
    RELOAD: 'external:reload',
    NAVIGATE_BACK: 'external:navigate-back',
    SET_BOUNDS: 'external:set-bounds',
    DETACH: 'external:detach',
    READY: 'external:ready',
    DID_NAVIGATE: 'external:did-navigate',
    DID_FAIL_LOAD: 'external:did-fail-load',
    DESTROY: 'external:destroy',
    /** Open DevTools panel specifically for the external WebContentsView. */
    TOGGLE_DEVTOOLS: 'external:toggle-devtools',
  },

  // Cross-app messaging (Angular ↔ ctrlX FLOW)
  BRIDGE: {
    TO_EXTERNAL: 'bridge:to-external',
    FROM_EXTERNAL: 'bridge:from-external',
    TO_SHELL: 'bridge:to-shell',
    FROM_SHELL: 'bridge:from-shell',
    /** External app signals it is ready to receive queued messages. */
    EXTERNAL_READY_ACK: 'bridge:external-ready-ack',
  },

  // Process monitor (like Chrome Task Manager)
  PROCESS: {
    GET_METRICS: 'process:get-metrics',
    KILL: 'process:kill',
  },

  // Window management
  WINDOW: {
    MINIMIZE: 'window:minimize',
    MAXIMIZE: 'window:maximize',
    CLOSE: 'window:close',
    TOGGLE_DEVTOOLS: 'window:toggle-devtools',
    IS_MAXIMIZED: 'window:is-maximized',
  },
} as const;

export type IpcChannel = typeof IPC_CHANNELS;
