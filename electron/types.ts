export interface ShortcutConfig {
  toggleWindow: string;
  previousPage: string;
  nextPage: string;
}

export interface ReaderSettings {
  fontSize: number;
  lineHeight: number;
  fontColor: string;
  backgroundColor: string;
}

export interface OpenTextFileResult {
  path: string;
  name: string;
  content: string;
}

export type DocumentLoadedHandler = (document: OpenTextFileResult) => void;

export interface ScreenThumbnailResult {
  dataUrl: string;
  width: number;
  height: number;
}

export interface PixelSampleResult {
  hex: string | null;
}

export interface WindowBoundsResult {
  x: number;
  y: number;
  width: number;
  height: number;
}
