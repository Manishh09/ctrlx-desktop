"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IPC_CHANNELS = void 0;
/**
 * Single source of truth for all IPC channel names.
 * Used by main process, preload scripts, and Angular app.
 */
exports.IPC_CHANNELS = {
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
        READY: 'external:ready',
        DID_NAVIGATE: 'external:did-navigate',
        DID_FAIL_LOAD: 'external:did-fail-load',
        DESTROY: 'external:destroy',
    },
    // Cross-app messaging (Angular ↔ ctrlX FLOW)
    BRIDGE: {
        TO_EXTERNAL: 'bridge:to-external',
        FROM_EXTERNAL: 'bridge:from-external',
        TO_SHELL: 'bridge:to-shell',
        FROM_SHELL: 'bridge:from-shell',
    },
    // Window management
    WINDOW: {
        MINIMIZE: 'window:minimize',
        MAXIMIZE: 'window:maximize',
        CLOSE: 'window:close',
        TOGGLE_DEVTOOLS: 'window:toggle-devtools',
        IS_MAXIMIZED: 'window:is-maximized',
    },
};
//# sourceMappingURL=ipc-channels.js.map