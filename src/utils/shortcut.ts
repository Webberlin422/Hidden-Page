import type { ShortcutConfig } from '../types/shared';

export type { ShortcutConfig };

type ShortcutState = {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  key: string;
};

function normalizeKeyToken(token: string): string {
  const lower = token.trim().toLowerCase();

  if (lower === 'space') {
    return 'space';
  }

  if (lower === 'plus') {
    return '+';
  }

  return lower;
}

function parseShortcut(shortcut: string): ShortcutState | null {
  const trimmed = shortcut.trim();

  if (!trimmed) {
    return null;
  }

  const parts = trimmed
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);
  let key = '';
  let ctrl = false;
  let alt = false;
  let shift = false;
  let meta = false;

  for (const part of parts) {
    const lower = part.toLowerCase();

    if (lower === 'ctrl' || lower === 'control') {
      ctrl = true;
      continue;
    }

    if (lower === 'alt' || lower === 'option') {
      alt = true;
      continue;
    }

    if (lower === 'shift') {
      shift = true;
      continue;
    }

    if (lower === 'meta' || lower === 'cmd' || lower === 'win' || lower === 'super') {
      meta = true;
      continue;
    }

    key = normalizeKeyToken(part);
  }

  if (!key) {
    return null;
  }

  return { ctrl, alt, shift, meta, key };
}

function normalizeEventKey(key: string): string {
  if (key === ' ') {
    return 'space';
  }

  return key.toLowerCase();
}

export function matchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
  const parsed = parseShortcut(shortcut);

  if (!parsed) {
    return false;
  }

  if (event.ctrlKey !== parsed.ctrl) {
    return false;
  }

  if (event.altKey !== parsed.alt) {
    return false;
  }

  if (event.shiftKey !== parsed.shift) {
    return false;
  }

  if (event.metaKey !== parsed.meta) {
    return false;
  }

  return normalizeEventKey(event.key) === parsed.key;
}

export function normalizeShortcutConfig(config: Partial<ShortcutConfig> | null | undefined, defaults: ShortcutConfig): ShortcutConfig {
  return {
    toggleWindow:
      typeof config?.toggleWindow === 'string' && config.toggleWindow.trim() ? config.toggleWindow.trim() : defaults.toggleWindow,
    previousPage:
      typeof config?.previousPage === 'string' && config.previousPage.trim() ? config.previousPage.trim() : defaults.previousPage,
    nextPage: typeof config?.nextPage === 'string' && config.nextPage.trim() ? config.nextPage.trim() : defaults.nextPage,
  };
}

export function isShortcutModifierOnlyKey(key: string): boolean {
  return key === 'Control' || key === 'Shift' || key === 'Alt' || key === 'AltGraph' || key === 'Meta';
}

function normalizeRecordedKey(key: string): string {
  if (key.length === 1) {
    return /[a-z]/i.test(key) ? key.toUpperCase() : key;
  }

  return key;
}

export function serializeShortcutEvent(event: KeyboardEvent): string | null {
  if (isShortcutModifierOnlyKey(event.key)) {
    return null;
  }

  const parts: string[] = [];

  if (event.ctrlKey) {
    parts.push('Control');
  }

  if (event.altKey) {
    parts.push('Alt');
  }

  if (event.shiftKey) {
    parts.push('Shift');
  }

  if (event.metaKey) {
    parts.push('Meta');
  }

  parts.push(normalizeRecordedKey(event.key));
  return parts.join('+');
}

export function formatShortcut(shortcut: string): string {
  return shortcut.trim() || '未设置';
}
