import { globalShortcut } from 'electron';

export interface ShortcutConfig {
  toggleWindow: string;
  previousPage: string;
  nextPage: string;
}

export const defaultShortcutConfig: ShortcutConfig = {
  toggleWindow: 'Alt+M',
  previousPage: 'Alt+,',
  nextPage: 'Alt+.',
};

export const legacyShortcutConfig: ShortcutConfig = {
  toggleWindow: 'Control+Alt+H',
  previousPage: 'PageUp',
  nextPage: 'PageDown',
};

export function isLegacyShortcutConfig(config: Partial<ShortcutConfig> | null | undefined): boolean {
  return config?.toggleWindow === legacyShortcutConfig.toggleWindow
    && config?.previousPage === legacyShortcutConfig.previousPage
    && config?.nextPage === legacyShortcutConfig.nextPage;
}

export function registerGlobalShortcuts(
  config: ShortcutConfig,
  toggleWindow: () => void,
  previousPage: () => void,
  nextPage: () => void
): boolean {
  globalShortcut.unregisterAll();
  let allRegistered = true;

  if (config.toggleWindow.trim()) {
    if (!globalShortcut.register(config.toggleWindow, toggleWindow)) {
      console.warn(`Failed to register global shortcut: ${config.toggleWindow}`);
      allRegistered = false;
    }
  }

  if (config.previousPage.trim()) {
    if (!globalShortcut.register(config.previousPage, previousPage)) {
      console.warn(`Failed to register global shortcut: ${config.previousPage}`);
      allRegistered = false;
    }
  }

  if (config.nextPage.trim()) {
    if (!globalShortcut.register(config.nextPage, nextPage)) {
      console.warn(`Failed to register global shortcut: ${config.nextPage}`);
      allRegistered = false;
    }
  }

  return allRegistered;
}
