import { describe, it, expect } from 'vitest';
import { matchesShortcut, serializeShortcutEvent, formatShortcut, isShortcutModifierOnlyKey, normalizeShortcutConfig } from '../shortcut';
import type { ShortcutConfig } from '../shortcut';

function makeKeyboardEvent(overrides: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    key: '',
    code: '',
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    repeat: false,
    location: 0,
    getModifierState: () => false,
    ...overrides,
  } as KeyboardEvent;
}

describe('matchesShortcut', () => {
  it('should match Alt+M shortcut', () => {
    const event = makeKeyboardEvent({ key: 'm', altKey: true });
    expect(matchesShortcut(event, 'Alt+M')).toBe(true);
  });

  it('should match Control+Shift+P shortcut', () => {
    const event = makeKeyboardEvent({ key: 'p', ctrlKey: true, shiftKey: true });
    expect(matchesShortcut(event, 'Control+Shift+P')).toBe(true);
  });

  it('should match space key shortcut', () => {
    const event = makeKeyboardEvent({ key: ' ', altKey: true });
    expect(matchesShortcut(event, 'Alt+Space')).toBe(true);
  });

  it('should not match when modifiers differ', () => {
    const event = makeKeyboardEvent({ key: 'm', altKey: true });
    expect(matchesShortcut(event, 'Control+M')).toBe(false);
  });

  it('should not match when key differs', () => {
    const event = makeKeyboardEvent({ key: 'n', altKey: true });
    expect(matchesShortcut(event, 'Alt+M')).toBe(false);
  });

  it('should return false for empty shortcut', () => {
    const event = makeKeyboardEvent({ key: 'm', altKey: true });
    expect(matchesShortcut(event, '')).toBe(false);
  });

  it('should match single key without modifiers', () => {
    const event = makeKeyboardEvent({ key: 'ArrowDown' });
    expect(matchesShortcut(event, 'ArrowDown')).toBe(true);
  });

  it('should match PageUp as single key', () => {
    const event = makeKeyboardEvent({ key: 'PageUp' });
    expect(matchesShortcut(event, 'PageUp')).toBe(true);
  });
});

describe('serializeShortcutEvent', () => {
  it('should serialize Alt+M', () => {
    const event = makeKeyboardEvent({ key: 'm', altKey: true });
    expect(serializeShortcutEvent(event)).toBe('Alt+M');
  });

  it('should serialize Control+Shift+P', () => {
    const event = makeKeyboardEvent({ key: 'p', ctrlKey: true, shiftKey: true });
    expect(serializeShortcutEvent(event)).toBe('Control+Shift+P');
  });

  it('should return null for modifier-only keys', () => {
    const event = makeKeyboardEvent({ key: 'Control', ctrlKey: true });
    expect(serializeShortcutEvent(event)).toBeNull();
  });

  it('should return null for Alt key alone', () => {
    const event = makeKeyboardEvent({ key: 'Alt' });
    expect(serializeShortcutEvent(event)).toBeNull();
  });

  it('should capitalize single letter keys', () => {
    const event = makeKeyboardEvent({ key: 'a', ctrlKey: true });
    expect(serializeShortcutEvent(event)).toBe('Control+A');
  });

  it('should preserve non-letter key names', () => {
    const event = makeKeyboardEvent({ key: 'ArrowDown', altKey: true });
    expect(serializeShortcutEvent(event)).toBe('Alt+ArrowDown');
  });
});

describe('formatShortcut', () => {
  it('should return trimmed shortcut', () => {
    expect(formatShortcut('  Alt+M  ')).toBe('Alt+M');
  });

  it('should return "未设置" for empty string', () => {
    expect(formatShortcut('')).toBe('未设置');
  });

  it('should return "未设置" for whitespace-only', () => {
    expect(formatShortcut('   ')).toBe('未设置');
  });
});

describe('isShortcutModifierOnlyKey', () => {
  it('should return true for Control', () => {
    expect(isShortcutModifierOnlyKey('Control')).toBe(true);
  });

  it('should return true for Shift', () => {
    expect(isShortcutModifierOnlyKey('Shift')).toBe(true);
  });

  it('should return true for Alt', () => {
    expect(isShortcutModifierOnlyKey('Alt')).toBe(true);
  });

  it('should return true for Meta', () => {
    expect(isShortcutModifierOnlyKey('Meta')).toBe(true);
  });

  it('should return false for regular keys', () => {
    expect(isShortcutModifierOnlyKey('a')).toBe(false);
    expect(isShortcutModifierOnlyKey('ArrowDown')).toBe(false);
    expect(isShortcutModifierOnlyKey('PageUp')).toBe(false);
  });
});

describe('normalizeShortcutConfig', () => {
  const defaults: ShortcutConfig = {
    toggleWindow: 'Alt+M',
    previousPage: 'Alt+,',
    nextPage: 'Alt+.',
  };

  it('should return config with all valid fields', () => {
    const result = normalizeShortcutConfig(
      { toggleWindow: 'Ctrl+T', previousPage: 'Up', nextPage: 'Down' },
      defaults,
    );
    expect(result).toEqual({ toggleWindow: 'Ctrl+T', previousPage: 'Up', nextPage: 'Down' });
  });

  it('should fill missing fields with defaults', () => {
    const result = normalizeShortcutConfig({ toggleWindow: 'Ctrl+H' }, defaults);
    expect(result).toEqual({ toggleWindow: 'Ctrl+H', previousPage: 'Alt+,', nextPage: 'Alt+.' });
  });

  it('should return defaults for null input', () => {
    const result = normalizeShortcutConfig(null, defaults);
    expect(result).toEqual(defaults);
  });

  it('should return defaults for undefined input', () => {
    const result = normalizeShortcutConfig(undefined, defaults);
    expect(result).toEqual(defaults);
  });

  it('should trim whitespace from values', () => {
    const result = normalizeShortcutConfig({ toggleWindow: '  Alt+X  ' }, defaults);
    expect(result.toggleWindow).toBe('Alt+X');
  });

  it('should fall back to default for empty string values', () => {
    const result = normalizeShortcutConfig({ toggleWindow: '' }, defaults);
    expect(result.toggleWindow).toBe('Alt+M');
  });
});
