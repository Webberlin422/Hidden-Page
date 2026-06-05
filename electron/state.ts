import type { BrowserWindow, Tray } from 'electron';
import type { ShortcutConfig } from './types';
import { defaultShortcutConfig } from './shortcuts';

export const state = {
  readerWindow: null as BrowserWindow | null,
  settingsWindow: null as BrowserWindow | null,
  tray: null as Tray | null,
  colorPickerWindow: null as BrowserWindow | null,
  isQuitting: false,
  shortcutConfig: { ...defaultShortcutConfig } as ShortcutConfig,
  globalShortcutEnabled: true,
  activeColorPickerResolve: null as ((color: string | null) => void) | null,
  readerBoundsSaveTimer: null as ReturnType<typeof setTimeout> | null,
};
