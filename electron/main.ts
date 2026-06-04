import { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, screen, shell, globalShortcut } from 'electron';
import { existsSync, promises as fs, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { defaultShortcutConfig, isLegacyShortcutConfig, registerGlobalShortcuts, type ShortcutConfig } from './shortcuts';
import type { ReaderSettings, ScreenThumbnailResult, PixelSampleResult } from './types';
import { PNG } from 'pngjs';

const screenshotDesktop = require('screenshot-desktop') as {
  (options?: { screen?: string; format?: 'png' | 'jpg' | 'jpeg' | 'bmp' }): Promise<Buffer>;
  listDisplays?: () => Promise<Array<{ id: string; name?: string }>>;
};

let readerWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let colorPickerWindow: BrowserWindow | null = null;
let isQuitting = false;
let shortcutConfig: ShortcutConfig = { ...defaultShortcutConfig };
let globalShortcutEnabled = true;
let activeColorPickerResolve: ((color: string | null) => void) | null = null;
let latestPickerPng: PNG | null = null;
let readerBoundsSaveTimer: ReturnType<typeof setTimeout> | null = null;

type ColorPickMode = 'fontColor' | 'backgroundColor';

function getShortcutConfigPath(): string {
  return path.join(app.getPath('userData'), 'shortcut-config.json');
}

function getReaderWindowBoundsPath(): string {
  return path.join(app.getPath('userData'), 'reader-window-bounds.json');
}

function defaultReaderWindowBounds(): { x: number; y: number; width: number; height: number; } {
  return {
    x: 80,
    y: 80,
    width: 1120,
    height: 760,
  };
}

function normalizeReaderWindowBounds(bounds: { x: number; y: number; width: number; height: number; }): { x: number; y: number; width: number; height: number; } {
  const minimumWidth = 56;
  const minimumHeight = 38;
  const workArea = screen.getDisplayMatching(bounds).workArea;
  const width = Math.max(minimumWidth, Math.min(bounds.width, workArea.width));
  const height = Math.max(minimumHeight, Math.min(bounds.height, workArea.height));
  const maxX = workArea.x + workArea.width - width;
  const maxY = workArea.y + workArea.height - height;

  return {
    x: Math.min(Math.max(bounds.x, workArea.x), maxX),
    y: Math.min(Math.max(bounds.y, workArea.y), maxY),
    width,
    height,
  };
}

function loadReaderWindowBounds(): { x: number; y: number; width: number; height: number; } {
  try {
    const raw = readFileSync(getReaderWindowBoundsPath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<{ x: number; y: number; width: number; height: number; }>;

    if ([parsed.x, parsed.y, parsed.width, parsed.height].every((value) => typeof value === 'number' && Number.isFinite(value))) {
      return normalizeReaderWindowBounds({
        x: parsed.x as number,
        y: parsed.y as number,
        width: parsed.width as number,
        height: parsed.height as number,
      });
    }
  } catch {
    // Fall back to defaults when the cache is missing or invalid.
  }

  return defaultReaderWindowBounds();
}

async function saveReaderWindowBounds(bounds: { x: number; y: number; width: number; height: number; }): Promise<void> {
  try {
    await fs.writeFile(getReaderWindowBoundsPath(), JSON.stringify(normalizeReaderWindowBounds(bounds), null, 2), 'utf8');
  } catch (error) {
    console.error('Failed to save reader window bounds:', error);
  }
}

function normalizeShortcutConfig(config: Partial<ShortcutConfig> | null | undefined): ShortcutConfig {
  return {
    toggleWindow: typeof config?.toggleWindow === 'string' && config.toggleWindow.trim() ? config.toggleWindow.trim() : defaultShortcutConfig.toggleWindow,
    previousPage: typeof config?.previousPage === 'string' && config.previousPage.trim() ? config.previousPage.trim() : defaultShortcutConfig.previousPage,
    nextPage: typeof config?.nextPage === 'string' && config.nextPage.trim() ? config.nextPage.trim() : defaultShortcutConfig.nextPage,
  };
}

async function loadShortcutConfig(): Promise<ShortcutConfig> {
  try {
    const raw = await fs.readFile(getShortcutConfigPath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<ShortcutConfig>;

    if (isLegacyShortcutConfig(parsed)) {
      const upgraded = { ...defaultShortcutConfig };
      await saveShortcutConfig(upgraded);
      return upgraded;
    }

    return normalizeShortcutConfig(parsed);
  } catch {
    const defaults = { ...defaultShortcutConfig };
    await saveShortcutConfig(defaults);
    return defaults;
  }
}

async function saveShortcutConfig(config: ShortcutConfig): Promise<void> {
  await fs.mkdir(path.dirname(getShortcutConfigPath()), { recursive: true });
  await fs.writeFile(getShortcutConfigPath(), JSON.stringify(config, null, 2), 'utf8');
}

function setReaderWindowBackgroundColor(color: string): void {
  if (readerWindow && !readerWindow.isDestroyed()) {
    try {
      readerWindow.setBackgroundColor(color);
    } catch (e) {
      console.error('Failed to set window background color:', e);
    }
  }
}

async function loadTextDocumentFromDialog(targetWindow: BrowserWindow): Promise<{ path: string; name: string; content: string; } | null> {
  const result = await dialog.showOpenDialog(targetWindow, {
    title: '选择小说文件',
    properties: ['openFile'],
    filters: [
      { name: 'Text Files', extensions: ['txt', 'md', 'markdown'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  const content = await fs.readFile(filePath, 'utf8');

  return {
    path: filePath,
    name: path.basename(filePath),
    content,
  };
}

function syncGlobalShortcutRegistration(): void {
  globalShortcut.unregisterAll();

  if (!globalShortcutEnabled) {
    return;
  }

  const failedKeys = registerGlobalShortcuts(
    shortcutConfig,
    toggleReaderWindow,
    () => turnPageInReader('previous'),
    () => turnPageInReader('next'),
  );

  if (failedKeys.length > 0 && settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('settings:shortcut-registration-failed', failedKeys);
  }
}

function turnPageInReader(direction: 'previous' | 'next'): void {
  if (readerWindow && !readerWindow.isDestroyed() && readerWindow.isVisible()) {
    readerWindow.webContents.send('reader:global-turn-page', direction);
  }
}

function getAssetPath(fileName: string): string {
  const candidates = [
    path.join(process.cwd(), 'assets', fileName),
    path.join(app.getAppPath(), 'assets', fileName),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

function createAppIcon(size = 256) {
  const iconPaths = [
    getAssetPath('icon.ico'),
    getAssetPath('icon.png'),
  ];

  for (const iconPath of iconPaths) {
    const image = nativeImage.createFromPath(iconPath);

    if (!image.isEmpty()) {
      return image;
    }
  }

  const fallback = nativeImage.createFromDataURL(
    `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="geometricPrecision">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#101828" />
            <stop offset="60%" stop-color="#162033" />
            <stop offset="100%" stop-color="#d97706" />
          </linearGradient>
        </defs>
        <rect x="20" y="20" rx="44" ry="44" width="216" height="216" fill="url(#g)" />
        <path d="M74 66h98l26 26v98c0 7.7-6.3 14-14 14H88c-7.7 0-14-6.3-14-14V80c0-7.7 6.3-14 14-14Z" fill="#f8fafc" />
        <path d="M172 66v24c0 5.5 4.5 10 10 10h16" fill="#e2e8f0" />
        <path d="M92 116h80M92 142h80M92 168h52" stroke="#0f172a" stroke-width="10" stroke-linecap="round" />
        <path d="M154 162l16 18 18-26" fill="none" stroke="#d97706" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    `)}`,
  );

  return fallback;
}

function getRendererUrl(mode: 'reader' | 'settings' | 'picker', params?: Record<string, string>): string {
  const baseUrl = app.isPackaged
    ? pathToFileURL(path.join(__dirname, '../renderer/index.html')).toString()
    : 'http://localhost:5173/';

  const url = new URL(baseUrl);
  url.searchParams.set('mode', mode);

  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function resolveColorPick(color: string | null): void {
  latestPickerPng = null;

  if (activeColorPickerResolve) {
    activeColorPickerResolve(color);
    activeColorPickerResolve = null;
  }

  if (colorPickerWindow && !colorPickerWindow.isDestroyed()) {
    colorPickerWindow.close();
  }
}

function createColorPickerWindow(mode: ColorPickMode): BrowserWindow {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { bounds } = display;

  const window = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    backgroundColor: '#00000000',
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    fullscreen: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    title: 'HiddenPage Color Picker',
    icon: createAppIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.setAlwaysOnTop(true, 'screen-saver');
  window.setContentProtection(true);
  window.removeMenu();
  window.once('ready-to-show', () => {
    window.show();
    window.focus();
  });
  window.loadURL(getRendererUrl('picker', { displayId: String(display.id), field: mode })).catch((error) => {
    console.error('Failed to load color picker window:', error);
  });

  window.on('closed', () => {
    if (colorPickerWindow === window) {
      colorPickerWindow = null;
      resolveColorPick(null);
    }
  });

  return window;
}

async function captureScreenThumbnail(displayId: string): Promise<ScreenThumbnailResult> {
  let screenshotOptions: { screen?: string; format: 'png' } = { format: 'png' };

  if (displayId && screenshotDesktop.listDisplays) {
    try {
      const displays = await screenshotDesktop.listDisplays();
      const selectedDisplay = displays.find((display) => display.id === displayId) ?? displays[0];

      if (selectedDisplay) {
        screenshotOptions = { format: 'png', screen: selectedDisplay.id };
      }
    } catch (error) {
      console.error('Failed to list displays for screenshot-desktop:', error);
    }
  }

  const buffer = await screenshotDesktop(screenshotOptions);
  latestPickerPng = PNG.sync.read(buffer);
  const image = nativeImage.createFromBuffer(buffer);

  if (image.isEmpty()) {
    throw new Error('Screenshot image is empty');
  }

  return {
    dataUrl: image.toDataURL(),
    width: image.getSize().width,
    height: image.getSize().height,
  };
}

function samplePixelColor(pixelX: number, pixelY: number): PixelSampleResult {
  if (!latestPickerPng) {
    return { hex: null };
  }

  const x = Math.max(0, Math.min(latestPickerPng.width - 1, Math.floor(pixelX)));
  const y = Math.max(0, Math.min(latestPickerPng.height - 1, Math.floor(pixelY)));
  const index = (latestPickerPng.width * y + x) * 4;
  const red = latestPickerPng.data[index];
  const green = latestPickerPng.data[index + 1];
  const blue = latestPickerPng.data[index + 2];
  const alpha = latestPickerPng.data[index + 3];

  if (alpha === 0) {
    return { hex: null };
  }

  const hex = `#${[red, green, blue].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
  return { hex };
}

function createWindow(mode: 'reader' | 'settings', autoShow = true): BrowserWindow {
  const icon = createAppIcon();
  const isReader = mode === 'reader';
  const readerBounds = isReader ? loadReaderWindowBounds() : null;

  const window = new BrowserWindow({
    width: isReader ? readerBounds!.width : 1080,
    height: isReader ? readerBounds!.height : 860,
    x: isReader ? readerBounds!.x : undefined,
    y: isReader ? readerBounds!.y : undefined,
    minWidth: isReader ? 56 : 900,
    minHeight: isReader ? 38 : 760,
    show: false,
    title: isReader ? 'HiddenPage Reader' : 'HiddenPage Settings',
    icon,
    frame: !isReader,
    transparent: isReader ? true : undefined,
    hasShadow: isReader ? false : undefined,
    roundedCorners: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.removeMenu();
  window.loadURL(getRendererUrl(mode)).catch((error) => {
    console.error(`Failed to load ${mode} window:`, error);
  });

  if (autoShow) {
    window.once('ready-to-show', () => {
      window.show();
    });
  }

  window.on('close', (event) => {
    if (isQuitting) {
      if (isReader) {
        void saveReaderWindowBounds(window.getBounds());
      }
      return;
    }

    event.preventDefault();
    if (isReader) {
      void saveReaderWindowBounds(window.getBounds());
    }
    window.hide();
  });

  function debouncedSaveReaderWindowBounds(bounds: { x: number; y: number; width: number; height: number; }): void {
    if (readerBoundsSaveTimer !== null) {
      clearTimeout(readerBoundsSaveTimer);
    }
    readerBoundsSaveTimer = setTimeout(() => {
      readerBoundsSaveTimer = null;
      void saveReaderWindowBounds(bounds);
    }, 150);
  }

  if (isReader) {
    window.on('resize', () => {
      if (!window.isDestroyed()) {
        debouncedSaveReaderWindowBounds(window.getBounds());
      }
    });

    window.on('move', () => {
      if (!window.isDestroyed()) {
        debouncedSaveReaderWindowBounds(window.getBounds());
      }
    });
  }

  window.on('closed', () => {
    if (isReader) {
      readerWindow = null;
    } else {
      settingsWindow = null;
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url).catch((error) => {
      console.error('Failed to open external link:', error);
    });
    return { action: 'deny' };
  });

  return window;
}

function openColorPicker(mode: ColorPickMode): Promise<string | null> {
  if (colorPickerWindow && !colorPickerWindow.isDestroyed()) {
    colorPickerWindow.close();
  }

  // Resolve any stale pending promise so it doesn't hang forever
  if (activeColorPickerResolve) {
    const stale = activeColorPickerResolve;
    activeColorPickerResolve = null;
    stale(null);
  }

  return new Promise<string | null>((resolve) => {
    const timeout = setTimeout(() => {
      if (activeColorPickerResolve) {
        activeColorPickerResolve = null;
        resolve(null);
        if (colorPickerWindow && !colorPickerWindow.isDestroyed()) {
          colorPickerWindow.close();
        }
      }
    }, 120_000);

    activeColorPickerResolve = (color: string | null) => {
      clearTimeout(timeout);
      resolve(color);
    };
    colorPickerWindow = createColorPickerWindow(mode);
  });
}

function showReaderWindow(): void {
  if (!readerWindow) {
    readerWindow = createWindow('reader');
  }

  if (readerWindow.isMinimized()) {
    readerWindow.restore();
  }

  readerWindow.show();
  readerWindow.focus();
}

function hideReaderWindow(): void {
  readerWindow?.hide();
}

function showSettingsWindow(): void {
  if (!settingsWindow) {
    settingsWindow = createWindow('settings');
  }

  if (settingsWindow.isMinimized()) {
    settingsWindow.restore();
  }

  settingsWindow.show();
  settingsWindow.focus();
}

function toggleReaderWindow(): void {
  if (!readerWindow) {
    readerWindow = createWindow('reader');
  }

  if (settingsWindow?.isFocused()) {
    return;
  }

  if (readerWindow.isVisible()) {
    hideReaderWindow();
    return;
  }

  showReaderWindow();
}

function createTray(): void {
  const icon = getAssetPath('icon.ico');
  tray = new Tray(icon);
  tray.setToolTip('HiddenPage');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: '打开小说',
        click: async () => {
          if (!readerWindow) {
            showReaderWindow();
          }

          if (!readerWindow) {
            return;
          }

          const document = await loadTextDocumentFromDialog(readerWindow);
          if (document) {
            readerWindow.webContents.send('reader:document-loaded', document);
            showReaderWindow();
          }
        },
      },
      { label: '阅读模式', click: showReaderWindow },
      { label: '设置', click: showSettingsWindow },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );

  tray.on('double-click', () => {
    showReaderWindow();
  });
}

function registerIpcHandlers(): void {
  ipcMain.handle('reader:open-text-file', async () => {
    const targetWindow = readerWindow ?? settingsWindow;

    if (!targetWindow || targetWindow.isDestroyed()) {
      return null;
    }

    return loadTextDocumentFromDialog(targetWindow);
  });

  ipcMain.handle('reader:load-document', async (_event, document: { path: string; name: string; content: string; }) => {
    if (!readerWindow) {
      showReaderWindow();
    }

    // showReaderWindow creates the window synchronously; if it's still null something went wrong
    if (!readerWindow) {
      return null;
    }

    readerWindow.webContents.send('reader:document-loaded', document);
    showReaderWindow();
    return document;
  });

  ipcMain.handle('reader:open-text-file-path', async (_event, filePath: string) => {
    const content = await fs.readFile(filePath, 'utf8');

    return {
      path: filePath,
      name: path.basename(filePath),
      content,
    };
  });

  ipcMain.handle('settings:get-shortcuts', async () => shortcutConfig);

  ipcMain.handle('settings:update-shortcuts', async (_event, nextConfig: ShortcutConfig) => {
    shortcutConfig = normalizeShortcutConfig(nextConfig);
    await saveShortcutConfig(shortcutConfig);
    syncGlobalShortcutRegistration();
    return shortcutConfig;
  });

  ipcMain.handle('settings:set-global-shortcut-enabled', async (_event, enabled: boolean) => {
    globalShortcutEnabled = enabled;
    syncGlobalShortcutRegistration();
    return globalShortcutEnabled;
  });

  ipcMain.handle('settings:apply-reader-settings', async (_event, settings: ReaderSettings) => {
    if (readerWindow && !readerWindow.isDestroyed()) {
      readerWindow.webContents.send('reader:settings-applied', settings);
    }

    setReaderWindowBackgroundColor(settings.backgroundColor);
    return settings;
  });

  ipcMain.handle('reader:set-background-color', async (_event, color: string) => {
    setReaderWindowBackgroundColor(color);
  });

  ipcMain.handle('reader:hide-window', async () => {
    hideReaderWindow();
  });

  ipcMain.handle('reader:show-window', async () => {
    showReaderWindow();
  });

  ipcMain.handle('reader:toggle-window', async () => {
    toggleReaderWindow();
  });

  ipcMain.handle('reader:get-window-bounds', async (event) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    return targetWindow?.getBounds() ?? null;
  });

  ipcMain.handle('reader:set-window-bounds', async (event, bounds: { x: number; y: number; width: number; height: number; }) => {
    const targetWindow = BrowserWindow.fromWebContents(event.sender);

    if (!targetWindow || targetWindow.isDestroyed()) {
      return null;
    }

    const nextBounds = {
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.max(bounds.width, targetWindow.getMinimumSize()[0]),
      height: Math.max(bounds.height, targetWindow.getMinimumSize()[1]),
    };

    targetWindow.setBounds(nextBounds, false);
    void saveReaderWindowBounds(targetWindow.getBounds());
    return targetWindow.getBounds();
  });

  ipcMain.handle('settings:open-screen-color-picker', async (_event, mode: ColorPickMode) => {
    return openColorPicker(mode);
  });

  ipcMain.handle('picker:complete-color-pick', async (_event, color: string | null) => {
    resolveColorPick(color);
    return color;
  });

  ipcMain.handle('picker:show-window', async () => {
    if (colorPickerWindow && !colorPickerWindow.isDestroyed()) {
      colorPickerWindow.show();
      colorPickerWindow.focus();
    }
  });

  ipcMain.handle('picker:capture-display-thumbnail', async (_event, displayId: string) => {
    return captureScreenThumbnail(displayId);
  });

  ipcMain.handle('picker:sample-pixel-color', async (_event, pixelX: number, pixelY: number) => {
    return samplePixelColor(pixelX, pixelY);
  });
}

function bootstrapApp(): void {
  app.setAppUserModelId('com.hiddenpage.reader');
  app.commandLine.appendSwitch('disable-features', 'Windows11RoundedCorners');

  app.on('second-instance', () => {
    showReaderWindow();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      showReaderWindow();
      return;
    }

    showReaderWindow();
  });

  app.on('before-quit', () => {
    isQuitting = true;
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });

  app.whenReady().then(async () => {
    try {
      shortcutConfig = await loadShortcutConfig();
      readerWindow = createWindow('reader', false);
      createTray();
      registerIpcHandlers();
      syncGlobalShortcutRegistration();
      Menu.setApplicationMenu(null);
      console.log('HiddenPage bootstrapped successfully');
    } catch (error) {
      console.error('Failed to bootstrap app:', error);
      dialog.showErrorBox('Startup Error', String(error));
    }
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  bootstrapApp();
}
