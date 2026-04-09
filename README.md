# ctrlX Desktop

Industrial engineering desktop application built with **Electron 41** + **Angular 21** + **WebContentsView**.

Embeds external web applications (ctrlX FLOW) with full process isolation, GPU acceleration, and secure bidirectional IPC messaging.

## Architecture

```
┌───────────────────────────────────────────────┐
│              Electron Main Process             │
│                                                │
│  ┌────────────────┐    ┌───────────────────┐  │
│  │  Angular Shell  │    │   ctrlX FLOW      │  │
│  │  (Renderer 1)   │◄──►│   (Renderer 2)    │  │
│  │  preload-shell  │    │   preload-external│  │
│  └───────┬────────┘    │   sandboxed        │  │
│          │              └───────────────────┘  │
│          │                                      │
│  ┌───────▼────────────────────────────────┐    │
│  │  Node.js Services (file, config)       │    │
│  └────────────────────────────────────────┘    │
└───────────────────────────────────────────────┘
```

**Key decision:** Uses `WebContentsView` (not deprecated `BrowserView` or `<webview>`) — the current recommended Electron API for embedding web content with its own renderer process.

## Prerequisites

- **Node.js** >= 22.x
- **npm** >= 10.x

## Quick Start

```bash
# 1. Install root dependencies (Electron, build tools)
npm install

# 2. Install Angular dependencies (runs automatically via postinstall)
# If not, run: cd angular && npm install && cd ..

# 3. Start in development mode (Angular dev server + Electron)
npm run dev
```

This starts:
- Angular dev server on `http://localhost:4200`
- Electron app loading from the dev server

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start both Angular and Electron in dev mode |
| `npm run angular:dev` | Start Angular dev server only |
| `npm run electron:dev` | Compile & start Electron only (needs Angular running) |
| `npm run build` | Production build (Angular + Electron) |
| `npm run package` | Build and package for distribution |

## Project Structure

```
ctrlx-desktop/
├── shared/                    # Shared types (IPC channels, models)
│   ├── ipc-channels.ts
│   └── models.ts
├── electron/                  # Electron main process
│   ├── main.ts                # App entry, BaseWindow + WebContentsView
│   ├── preload-shell.ts       # Secure API for Angular renderer
│   ├── preload-external.ts    # Minimal bridge API for external app
│   ├── services/              # Node.js services (file, config, external view)
│   ├── ipc/                   # IPC handler registration & validation
│   └── security/              # CSP, permissions
├── angular/                   # Angular 21 application
│   └── src/app/
│       ├── core/services/     # ElectronIpcService, ExternalAppService
│       ├── layout/            # Shell, sidebars, center area with tabs
│       └── features/          # Dashboard, external view placeholder
└── package.json
```

## How the External App Embedding Works

1. Angular's `ExternalViewComponent` renders a placeholder `<div>` (the "slot")
2. A `ResizeObserver` tracks the slot's position and size
3. Bounds are sent to Electron main process via IPC
4. Main process positions a `WebContentsView` exactly on top of the slot
5. The external app runs in its own renderer process with a separate preload

## Communication Flow

```
Angular Shell  ──IPC──►  Main Process  ──webContents.send──►  ctrlX FLOW
     ◄──IPC──  Main Process  ◄──IPC──  ctrlX FLOW
```

All messages pass through the main process as a broker. No direct DOM access between renderers.

## Security

- `nodeIntegration: false` on both renderers
- `contextIsolation: true` on both renderers  
- `sandbox: true` on external renderer
- Preload scripts expose whitelist-only APIs via `contextBridge`
- IPC messages validated in handlers
- Navigation restricted to same-origin for external app
- New window creation blocked globally
- Separate storage partition for external app
- CSP headers enforced

## Connecting to ctrlX FLOW

1. Start your ctrlX FLOW instance (e.g., `http://localhost:1880`)
2. Open the app and click the **ctrlX FLOW** tab
3. Enter the URL and click **Connect**
4. The WebContentsView loads the external app with GPU acceleration

## Future Extensibility

- **Multi-tab:** `ExternalViewService` can manage a `Map<string, WebContentsView>` for multiple external apps
- **Plugin system:** Each plugin gets its own `WebContentsView` with restricted preload
- **Offline mode:** Service worker or local file server fallback
- **3D models:** WebGL is enabled with GPU acceleration flags

## License

Proprietary
