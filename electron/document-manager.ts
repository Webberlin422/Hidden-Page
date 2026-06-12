import { readTextFile } from './encoding';

export interface DocumentHeader {
  path: string;
  name: string;
  encoding: string;
  totalChars: number;
}

interface CachedDocument {
  text: string;
  encoding: string;
  path: string;
  name: string;
  totalChars: number;
  lastAccessed: number;
}

class DocumentManager {
  private cache = new Map<string, CachedDocument>();
  private maxCacheSize = 3;

  async openDocument(filePath: string): Promise<DocumentHeader> {
    const existing = this.cache.get(filePath);
    if (existing) {
      existing.lastAccessed = Date.now();
      return {
        path: existing.path,
        name: existing.name,
        encoding: existing.encoding,
        totalChars: existing.totalChars,
      };
    }

    const { text, encoding } = await readTextFile(filePath);

    const name = filePath.split(/[\\/]/).pop() ?? filePath;

    // Evict least recently used if cache is full
    if (this.cache.size >= this.maxCacheSize) {
      let oldestKey = '';
      let oldestTime = Infinity;
      for (const [key, doc] of this.cache) {
        if (doc.lastAccessed < oldestTime) {
          oldestTime = doc.lastAccessed;
          oldestKey = key;
        }
      }
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(filePath, {
      text,
      encoding,
      path: filePath,
      name,
      totalChars: text.length,
      lastAccessed: Date.now(),
    });

    return { path: filePath, name, encoding, totalChars: text.length };
  }

  getSegment(filePath: string, startChar: number, endChar: number): string | null {
    const doc = this.cache.get(filePath);
    if (!doc) return null;
    doc.lastAccessed = Date.now();
    const clampedEnd = Math.min(endChar, doc.text.length);
    const clampedStart = Math.max(0, startChar);
    if (clampedStart >= clampedEnd) return '';
    return doc.text.slice(clampedStart, clampedEnd);
  }

  closeDocument(filePath: string): void {
    this.cache.delete(filePath);
  }

  findAll(filePath: string, query: string): Array<{ offset: number; length: number }> {
    const doc = this.cache.get(filePath);
    if (!doc) return [];
    doc.lastAccessed = Date.now();

    if (!query) return [];

    const lowerText = doc.text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const matches: Array<{ offset: number; length: number }> = [];
    let pos = 0;

    while ((pos = lowerText.indexOf(lowerQuery, pos)) !== -1) {
      matches.push({ offset: pos, length: query.length });
      pos += query.length;
    }

    return matches;
  }
}

export const documentManager = new DocumentManager();
