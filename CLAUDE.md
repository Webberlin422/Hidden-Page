# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev

```bash
npm run dev          # Start all three processes concurrently (Vite + tsc watch + Electron)
npm run build        # Production build (Vite build + tsc)
npm run build:renderer  # Vite only (outputs to dist/renderer/)
npm run build:main   # tsc only (outputs to dist/main/)
```

The dev workflow runs three things in parallel:
1. `vite` — serves the renderer at `localhost:5173`
2. `tsc -p electron/tsconfig.json -w` — watches and recompiles main process
3. `electron dist/main/main.js` — launches the app (waits for Vite + tsc to be ready first)

## Architecture

HiddenPage is an Electron desktop novel reader for Windows. It runs in the system tray and provides a frameless, discreet reading window with global shortcut toggling.

### Process model

```
┌─────────────────────────────────┐
│  Main process (electron/*.ts)   │
│  - Window lifecycle              │
│  - System tray                   │
│  - Global shortcuts              │
│  - Screenshot capture (pngjs)    │
│  - IPC handlers                  │
│  - Config I/O (shortcut-config.  │
│    json, reader-window-bounds.   │
│    json in userData)             │
└──────────┬──────────────────────┘
           │ contextBridge
┌──────────▼──────────────────────┐
│  Preload (electron/preload.ts)  │
│  Exposes window.hiddenPage API  │
│  All IPC is invoke-based        │
└──────────┬──────────────────────┘
           │
┌──────────▼──────────────────────┐
│  Renderer (src/app.ts)          │
│  Single-page app, mode-driven:  │
│  ?mode=reader | settings | picker│
│  - Vanilla TS + DOM manipulation│
│  - localStorage for settings    │
│    and reading progress          │
└─────────────────────────────────┘
```

### Renderer modes

The renderer is a single HTML page (`index.html` → `src/app.ts`). The `?mode=` URL parameter selects which UI to render:

| Mode | Purpose | Key elements |
|------|---------|-------------|
| `reader` | Frameless reading window | Custom drag/resize handles, scroll-based pagination, progress saving |
| `settings` | Full settings panel | Font size/color, line height, shortcut recording, screen color picker trigger |
| `picker` | Full-screen color picker | Screenshot backdrop, crosshair reticle, magnifier, pixel sampling via IPC |

### Window management (main process)

- **readerWindow** — frameless, skipTaskbar, hide-on-close (not quit). Created on startup with `autoShow=false`; toggled via global shortcut or tray.
- **settingsWindow** — regular framed window, skipTaskbar.
- **colorPickerWindow** — fullscreen, transparent, alwaysOnTop, no frame. Created on demand per pick operation.

`toggleReaderWindow()` is the core UX: if settings is focused, do nothing; if reader is visible, hide it; otherwise show it.

### Shortcut system

Shortcuts are stored as strings like `"Alt+M"` or `"Control+Shift+P"`. Two separate files handle parsing:

- **Main side** (`electron/shortcuts.ts`): `registerGlobalShortcuts()` registers with Electron's `globalShortcut` API. Only the `toggleWindow` shortcut is registered globally.
- **Renderer side** (`src/utils/shortcut.ts`): `matchesShortcut()` and `serializeShortcutEvent()` handle in-page shortcut matching (page turn keys) and recording (settings input capture).

The renderer gets its shortcut defaults from the main process via `window.hiddenPage.getDefaultShortcutConfig()` (exposed through preload). The main process is the single source of truth for default values.

### Color picker flow

1. Settings page calls `window.hiddenPage.openScreenColorPicker(mode)`
2. Main process creates a fullscreen transparent window over the target display
3. Renderer calls `captureDisplayThumbnail(displayId)` → main uses `screenshot-desktop` + `pngjs` to capture screen
4. As user moves cursor, renderer calls `samplePixelColor(x, y)` → main reads pixel from the cached PNG buffer
5. On click: `completeScreenColorPick(hex)` resolves the promise; on Esc/right-click: resolves `null`
6. Main process sends the color back to settings, which updates the form

### Data persistence

| What | Where | Format |
|------|-------|--------|
| Reader settings (font, colors) | `localStorage` (`hidden-page.settings`) | JSON |
| Reading progress (scroll position per file) | `localStorage` (`hidden-page.progress`) | JSON |
| Last opened document path | `localStorage` (`hidden-page.last-document-path`) | string |
| Shortcut config | `userData/shortcut-config.json` | JSON |
| Reader window bounds | `userData/reader-window-bounds.json` | JSON |

The main process and renderer both normalize loaded configs — missing or invalid fields fall back to hardcoded defaults.

### Key constraints

- **No framework** — the renderer builds HTML via template literals and manipulates the DOM directly. There is no React/Vue/Svelte.
- **ESM in renderer, CommonJS in main** — the Vite build outputs ESM for the browser; the electron TypeScript compiles to CommonJS (`dist/main/`).
- **`screenshot-desktop` is a CJS require** — it must be `require()`'d, not imported (see `electron/main.ts` line 8).
- **The reader window is frameless** — moving and resizing are handled by custom CSS regions + `setReaderWindowBounds` IPC calls.
- **Reader text is rendered via `innerHTML`** — the `normalizeReaderText()` function escapes HTML entities to prevent XSS from novel file content.

## Available Skills

This project includes the `deepboost` skill (`.claude/skills/claude-boost/SKILL.md`) for DeepSeek self-enhancement via multi-persona collaboration. It calls the same DeepSeek API with a different role (reviewer instead of author) — same model, fresh perspective, zero setup:

| Command | Purpose |
|---------|---------|
| `/boost <task>` | Second opinion plans the approach → you execute |
| `/review` | You build → second opinion reviews → you fix |
| `/bounce <problem>` | Quick inline consultation on a single sub-problem |
| `/dual <task>` | Both perspectives solve independently → compare & synthesize |

**Zero configuration** — uses existing `ANTHROPIC_AUTH_TOKEN`. No extra API key needed.

The skill self-triggers on ambiguous requirements, complex algorithms, security-sensitive code, or after 3+ failed attempts. See `.claude/skills/claude-boost/SKILL.md` for full protocol documentation.
