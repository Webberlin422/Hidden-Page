import type {
  DocumentHeader,
  DocumentLoadedHandler,
  ReaderSettings,
  ShortcutConfig,
  WindowBoundsResult,
} from './shared';

declare global {
  interface Window {
    hiddenPage: {
      openTextFile: () => Promise<DocumentHeader | null>;
      openTextFileAtPath: (filePath: string) => Promise<DocumentHeader>;
      loadDocument: (document: DocumentHeader) => Promise<DocumentHeader | null>;
      openDocument: (filePath: string) => Promise<DocumentHeader>;
      getSegment: (filePath: string, startChar: number, endChar: number) => Promise<string | null>;
      closeDocument: (filePath: string) => Promise<void>;
      openScreenColorPicker: () => Promise<string | null>;
      captureScreen: () => Promise<{ dataUrl: string; width: number; height: number }>;
      showScreenColorPickerWindow: () => Promise<void>;
      completeScreenColorPick: (color: string | null) => Promise<string | null>;
      getReaderWindowBounds: () => Promise<WindowBoundsResult | null>;
      setReaderWindowBounds: (bounds: WindowBoundsResult) => Promise<WindowBoundsResult | null>;
      applyReaderSettings: (settings: ReaderSettings) => Promise<ReaderSettings>;
      onDocumentLoaded: (handler: DocumentLoadedHandler) => void;
      onReaderSettingsApplied: (handler: (settings: ReaderSettings) => void) => void;
      onGlobalTurnPage: (handler: (direction: 'previous' | 'next') => void) => void;
      getShortcutConfig: () => Promise<ShortcutConfig>;
      saveShortcutConfig: (config: ShortcutConfig) => Promise<ShortcutConfig>;
      setGlobalShortcutEnabled: (enabled: boolean) => Promise<boolean>;
      setBackgroundColor: (color: string) => Promise<void>;
      getDefaultShortcutConfig: () => ShortcutConfig;
      onShortcutRegistrationFailed: (handler: (failedKeys: string[]) => void) => void;
      hideWindow: () => Promise<void>;
      showWindow: () => Promise<void>;
      toggleWindow: () => Promise<void>;
    };
  }
}

export {};
