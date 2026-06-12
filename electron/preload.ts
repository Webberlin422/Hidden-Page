import { contextBridge, ipcRenderer } from 'electron';
import { defaultShortcutConfig } from './shortcuts';
import type {
  ShortcutConfig,
  DocumentHeader,
  WindowBoundsResult,
  ReaderSettings,
  DocumentLoadedHandler,
  SearchMatch,
} from './types';

export type {
  ShortcutConfig,
  DocumentHeader,
  WindowBoundsResult,
  ReaderSettings,
  DocumentLoadedHandler,
  SearchMatch,
};

contextBridge.exposeInMainWorld('hiddenPage', {
  openTextFile: (): Promise<DocumentHeader | null> => ipcRenderer.invoke('reader:open-text-file'),
  openTextFileAtPath: (filePath: string): Promise<DocumentHeader> => ipcRenderer.invoke('reader:open-text-file-path', filePath),
  loadDocument: (document: DocumentHeader): Promise<DocumentHeader | null> => ipcRenderer.invoke('reader:load-document', document),
  openDocument: (filePath: string): Promise<DocumentHeader> => ipcRenderer.invoke('reader:open-document', filePath),
  getSegment: (filePath: string, startChar: number, endChar: number): Promise<string | null> =>
    ipcRenderer.invoke('reader:get-segment', { path: filePath, startChar, endChar }),
  closeDocument: (filePath: string): Promise<void> => ipcRenderer.invoke('reader:close-document', filePath),
  openScreenColorPicker: (): Promise<string | null> => ipcRenderer.invoke('settings:open-screen-color-picker'),
  captureScreen: (): Promise<{ dataUrl: string; width: number; height: number }> =>
    ipcRenderer.invoke('picker:capture-screen'),
  showScreenColorPickerWindow: (): Promise<void> => ipcRenderer.invoke('picker:show-window'),
  completeScreenColorPick: (color: string | null): Promise<string | null> => ipcRenderer.invoke('picker:complete-color-pick', color),
  onDocumentLoaded: (handler: DocumentLoadedHandler): void => {
    ipcRenderer.on('reader:document-loaded', (_event, document: DocumentHeader) => handler(document));
  },
  onReaderSettingsApplied: (handler: (settings: ReaderSettings) => void): void => {
    ipcRenderer.on('reader:settings-applied', (_event, settings: ReaderSettings) => handler(settings));
  },
  onGlobalTurnPage: (handler: (direction: 'previous' | 'next') => void): void => {
    ipcRenderer.on('reader:global-turn-page', (_event, direction: 'previous' | 'next') => handler(direction));
  },
  getReaderWindowBounds: (): Promise<WindowBoundsResult | null> => ipcRenderer.invoke('reader:get-window-bounds'),
  setReaderWindowBounds: (bounds: WindowBoundsResult): Promise<WindowBoundsResult | null> =>
    ipcRenderer.invoke('reader:set-window-bounds', bounds),
  applyReaderSettings: (settings: ReaderSettings): Promise<ReaderSettings> =>
    ipcRenderer.invoke('settings:apply-reader-settings', settings),
  getShortcutConfig: (): Promise<ShortcutConfig> => ipcRenderer.invoke('settings:get-shortcuts'),
  saveShortcutConfig: (config: ShortcutConfig): Promise<ShortcutConfig> => ipcRenderer.invoke('settings:update-shortcuts', config),
  setGlobalShortcutEnabled: (enabled: boolean): Promise<boolean> => ipcRenderer.invoke('settings:set-global-shortcut-enabled', enabled),
  setBackgroundColor: (color: string): Promise<void> => ipcRenderer.invoke('reader:set-background-color', color),
  onShortcutRegistrationFailed: (handler: (failedKeys: string[]) => void): void => {
    ipcRenderer.on('settings:shortcut-registration-failed', (_event, failedKeys: string[]) => handler(failedKeys));
  },
  getDefaultShortcutConfig: (): ShortcutConfig => ({ ...defaultShortcutConfig }),
  hideWindow: (): Promise<void> => ipcRenderer.invoke('reader:hide-window'),
  showWindow: (): Promise<void> => ipcRenderer.invoke('reader:show-window'),
  toggleWindow: (): Promise<void> => ipcRenderer.invoke('reader:toggle-window'),
  findInDocument: (path: string, query: string): Promise<SearchMatch[]> =>
    ipcRenderer.invoke('reader:find-in-document', { path, query }),
  onShowJumpToPage: (handler: () => void): void => {
    ipcRenderer.on('reader:show-jump-to-page', () => handler());
  },
  onShowSearch: (handler: () => void): void => {
    ipcRenderer.on('reader:show-search', () => handler());
  },
});
