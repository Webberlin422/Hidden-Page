# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev

```bash
npm run dev          # Start Vite dev server + compile & launch Electron (vite-plugin-electron)
npm run build        # Production build (Vite compiles renderer + electron in one step)
npm run test         # Run Vitest unit tests
```

The dev workflow uses `vite-plugin-electron` to handle everything in one process:

1. `vite` serves the renderer at `localhost:5173`
2. `vite-plugin-electron` compiles `electron/main.ts` and `electron/preload.ts` on change
3. Electron is automatically launched/restarted when main process recompiles

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

| Mode       | Purpose                  | Key elements                                                                  |
| ---------- | ------------------------ | ----------------------------------------------------------------------------- |
| `reader`   | Frameless reading window | Custom drag/resize handles, scroll-based pagination, progress saving          |
| `settings` | Full settings panel      | Font family/weight/size, line height, font/background color, shortcut recording, screen color picker trigger |
| `picker`   | Full-screen color picker | Screenshot backdrop, crosshair reticle, magnifier, pixel sampling via IPC     |

### Window management (main process)

- **readerWindow** — frameless, skipTaskbar, hide-on-close (not quit). Created on startup with `autoShow=false`; toggled via global shortcut or tray.
- **settingsWindow** — regular framed window, skipTaskbar.
- **colorPickerWindow** — fullscreen, opaque (`#000000`), alwaysOnTop (screen-saver level), no frame. Created on demand per pick operation. Must remain hidden until screenshot is rendered.

`toggleReaderWindow()` is the core UX: if settings is focused, do nothing; if reader is visible, hide it; otherwise show it.

### Shortcut system

Shortcuts are stored as strings like `"Alt+M"` or `"Control+Shift+P"`. Two separate files handle parsing:

- **Main side** (`electron/shortcuts.ts`): `registerGlobalShortcuts()` registers with Electron's `globalShortcut` API. Only the `toggleWindow` shortcut is registered globally.
- **Renderer side** (`src/utils/shortcut.ts`): `matchesShortcut()` and `serializeShortcutEvent()` handle in-page shortcut matching (page turn keys) and recording (settings input capture).

The renderer gets its shortcut defaults from the main process via `window.hiddenPage.getDefaultShortcutConfig()` (exposed through preload). The main process is the single source of truth for default values.

### Color picker flow

1. Settings page calls `window.hiddenPage.openScreenColorPicker()` → returns `Promise<string | null>`
2. Main process creates a hidden fullscreen window (opaque `#000000`, `alwaysOnTop: 'screen-saver'`, `setContentProtection(true)`)
3. Renderer boots, calls `captureScreen()` → main uses `desktopCapturer.getSources()` with `thumbnailSize` matching the display
4. Screenshot data URL is drawn onto a full-size canvas with `willReadFrequently: true`
5. Renderer calls `showScreenColorPickerWindow()` → window becomes visible with screenshot
6. As user moves cursor, `mousemove` on canvas samples pixel via `getImageData()`, updates crosshair position and hex display
7. On `pointerdown`: color is sampled, `setPointerCapture()` locks events to canvas, a transparent shield div (z-index:9) is inserted to absorb stray `click` events
8. On `pointerup` (routed to canvas via pointer capture): calls `completeScreenColorPick(hex)`, main resolves promise, closes window after 300ms delay. Esc/right-click/cancel button: resolves `null`.

### Data persistence

| What                                        | Where                                             | Format |
| ------------------------------------------- | ------------------------------------------------- | ------ |
| Reader settings (font, colors)              | `localStorage` (`hidden-page.settings`)           | JSON   |
| Reading progress (scroll position per file) | `localStorage` (`hidden-page.progress`)           | JSON   |
| Last opened document path                   | `localStorage` (`hidden-page.last-document-path`) | string |
| Shortcut config                             | `userData/shortcut-config.json`                   | JSON   |
| Reader window bounds                        | `userData/reader-window-bounds.json`              | JSON   |

The main process and renderer both normalize loaded configs — missing or invalid fields fall back to hardcoded defaults.

### Key constraints

- **No framework** — the renderer builds HTML via template literals and manipulates the DOM directly. There is no React/Vue/Svelte.
- **ESM in renderer, CommonJS in main** — `vite-plugin-electron` compiles both; electron files output to `dist/main/` as CommonJS bundles.
- **`desktopCapturer.getSources()` for screen capture** — used in main process for the color picker screenshot. Returns `NativeImage` thumbnails matched by `display_id`. No external dependencies needed.
- **The reader window is frameless** — moving and resizing are handled by custom CSS regions + `setReaderWindowBounds` IPC calls.
- **Reader text is rendered via `innerHTML`** — the `normalizeReaderText()` function escapes HTML entities to prevent XSS from novel file content.

### Common pitfalls

- **JS inline styles vs CSS specificity** — Settings are applied via JS inline styles (e.g. `element.style.fontFamily = ...`). But CSS rules like `.settings-preview p { font-family: ... }` have higher specificity than inherited inline styles on parent elements. When adding a new setting that affects child elements, check for conflicting CSS rules and set the style directly on the children if needed (see `applyVisualSettings()` for pattern).
- **Picker z-index layers** — The picker uses z-index stacking: canvas=0, `::after` overlay=1, crosshair/labels=2, shield=9. When inserting new layers, trace which element will receive `pointerdown`/`pointerup`/`click` events. The shield (z=9) absorbs events above the canvas — if the canvas needs `pointerup`, use `setPointerCapture(event.pointerId)` on `pointerdown` so the event is routed to the canvas even after the shield is inserted.
- **Picker window visibility** — The window must remain **hidden** until the screenshot is captured and rendered to canvas. Do NOT use `ready-to-show` to auto-show it; only `picker:show-window` IPC (called from renderer after `drawImage`) should make it visible. Otherwise `desktopCapturer` may capture the black picker window instead of the desktop.
- **Shield timing** — The transparent shield is inserted on `pointerdown` to absorb the trailing `click` event (prevents click-through to the app below after window closes). It must be transparent (`background:transparent`), not opaque — an opaque black shield causes a visual black flash on click. The shield persists until window close; no need to remove it.

## Available Skills

This project includes the `deepboost` skill (`.claude/skills/claude-boost/SKILL.md`) for DeepSeek self-enhancement via multi-persona collaboration. It calls the same DeepSeek API with a different role (reviewer instead of author) — same model, fresh perspective, zero setup:

| Command             | Purpose                                                      |
| ------------------- | ------------------------------------------------------------ |
| `/boost <task>`     | Second opinion plans the approach → you execute              |
| `/review`           | You build → second opinion reviews → you fix                 |
| `/bounce <problem>` | Quick inline consultation on a single sub-problem            |
| `/dual <task>`      | Both perspectives solve independently → compare & synthesize |

**Zero configuration** — uses existing `ANTHROPIC_AUTH_TOKEN`. No extra API key needed.

The skill self-triggers on ambiguous requirements, complex algorithms, security-sensitive code, or after 3+ failed attempts. See `.claude/skills/claude-boost/SKILL.md` for full protocol documentation.
