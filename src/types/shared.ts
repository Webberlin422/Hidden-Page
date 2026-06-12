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
  fontFamily: string;
  fontWeight: number;
}

export interface OpenTextFileResult {
  path: string;
  name: string;
  content: string;
}

export interface DocumentHeader {
  path: string;
  name: string;
  encoding: string;
  totalChars: number;
}

export type DocumentLoadedHandler = (document: DocumentHeader) => void;

export interface WindowBoundsResult {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SearchMatch {
  offset: number;
  length: number;
}
