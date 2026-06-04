import type { BrowserWindow, Tray } from 'electron';
import type { PNG } from 'pngjs';
import type { ShortcutConfig } from './types';
import { defaultShortcutConfig } from './shortcuts';

export type ColorPickMode = 'fontColor' | 'backgroundColor';

export const state = {
  readerWindow: null as BrowserWindow | null,
  settingsWindow: null as BrowserWindow | null,
  tray: null as Tray | null,
  colorPickerWindow: null as BrowserWindow | null,
  isQuitting: false,
  shortcutConfig: { ...defaultShortcutConfig } as ShortcutConfig,
  globalShortcutEnabled: true,
  activeColorPickerResolve: null as ((color: string | null) => void) | null,
  latestPickerPng: null as PNG | null,
  readerBoundsSaveTimer: null as ReturnType<typeof setTimeout> | null,
};
