import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadJson, saveJson } from '../storage';

describe('storage', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();

    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => store.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => store.set(key, value)),
      removeItem: vi.fn((key: string) => store.delete(key)),
    });
  });

  describe('saveJson', () => {
    it('should save a value as JSON string', () => {
      saveJson('test-key', { foo: 'bar' });
      expect(store.get('test-key')).toBe('{"foo":"bar"}');
    });

    it('should save primitive values', () => {
      saveJson('num', 42);
      expect(store.get('num')).toBe('42');
    });

    it('should save null', () => {
      saveJson('nullable', null);
      expect(store.get('nullable')).toBe('null');
    });
  });

  describe('loadJson', () => {
    it('should return parsed value for valid JSON', () => {
      store.set('test-key', '{"foo":"bar"}');
      const result = loadJson('test-key', {});
      expect(result).toEqual({ foo: 'bar' });
    });

    it('should return fallback when key does not exist', () => {
      const fallback = { default: true };
      const result = loadJson('missing-key', fallback);
      expect(result).toBe(fallback);
    });

    it('should return fallback for invalid JSON', () => {
      store.set('bad-json', '{not valid');
      const fallback = { default: true };
      const result = loadJson('bad-json', fallback);
      expect(result).toBe(fallback);
    });

    it('should return fallback for null value', () => {
      // localStorage.getItem returns null for missing keys
      const fallback = { default: true };
      const result = loadJson('missing', fallback);
      expect(result).toBe(fallback);
    });
  });
});
