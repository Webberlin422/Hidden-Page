import type { DocumentLoadedHandler, OpenTextFileResult, ReaderSettings, ShortcutConfig } from '../../electron/preload';

type ColorPickerMode = 'fontColor' | 'backgroundColor';

interface ScreenThumbnailResult {
  dataUrl: string;
  width: number;
  height: number;
}

interface PixelSampleResult {
  hex: string | null;
}

interface WindowBoundsResult {
  x: number;
  y: number;
  width: number;
  height: number;
}

declare global {
  interface Window {
    hiddenPage: {
      openTextFile: () => Promise<OpenTextFileResult | null>;
      openTextFileAtPath: (filePath: string) => Promise<OpenTextFileResult>;
      loadDocument: (document: OpenTextFileResult) => Promise<OpenTextFileResult | null>;
      openScreenColorPicker: (mode: ColorPickerMode) => Promise<string | null>;
      showScreenColorPickerWindow: () => Promise<void>;
      captureDisplayThumbnail: (displayId: string) => Promise<ScreenThumbnailResult>;
      samplePixelColor: (pixelX: number, pixelY: number) => Promise<PixelSampleResult>;
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
      hideWindow: () => Promise<void>;
      showWindow: () => Promise<void>;
      toggleWindow: () => Promise<void>;
    };
  }
}

export {};
