import jschardet from 'jschardet';
import iconv from 'iconv-lite';
import { readFile } from 'node:fs/promises';

export function detectEncoding(buffer: Buffer): string {
  // BOM detection (most reliable, takes priority)
  if (buffer.length >= 2) {
    if (buffer[0] === 0xFE && buffer[1] === 0xFF) return 'utf-16be';
    if (buffer[0] === 0xFF && buffer[1] === 0xFE) return 'utf-16le';
  }
  if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    return 'utf-8';
  }

  // Statistical fallback — sample the first 64KB for performance
  const sample = buffer.subarray(0, Math.min(buffer.length, 65536));
  const result = jschardet.detect(sample);

  if (result && result.encoding) {
    const enc = result.encoding.toLowerCase().replace(/[_-]/g, '');
    // Map jschardet output to iconv-lite encoding names
    if (enc === 'utf8' || enc === 'ascii') return 'utf-8';
    if (enc === 'gb2312' || enc === 'gbk' || enc === 'gb18030') return 'gbk';
    if (enc === 'big5') return 'big5';
    if (enc === 'utf16' || enc === 'utf16le') return 'utf-16le';
    if (enc === 'utf16be') return 'utf-16be';
    if (enc === 'iso88591' || enc === 'latin1') return 'latin1';
    if (enc === 'shiftjis' || enc === 'shiftjis' || enc === 'sjis') return 'shiftjis';
    if (enc === 'euckr' || enc === 'euckr') return 'euckr';
  }

  return 'utf-8';
}

export function decodeText(buffer: Buffer, encoding?: string): { text: string; encoding: string } {
  const enc = encoding ?? detectEncoding(buffer);
  return {
    text: iconv.decode(buffer, enc),
    encoding: enc,
  };
}

export async function readTextFile(filePath: string): Promise<{ text: string; encoding: string }> {
  const buffer = await readFile(filePath);
  return decodeText(buffer);
}
