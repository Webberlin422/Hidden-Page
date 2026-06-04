import './styles/app.css';
import { loadJson, saveJson } from './utils/storage';
import { formatShortcut, isShortcutModifierOnlyKey, matchesShortcut, normalizeShortcutConfig, serializeShortcutEvent, type ShortcutConfig } from './utils/shortcut';

interface ReaderDocument {
  path: string;
  name: string;
  content: string;
}

interface ReaderSettings {
  fontSize: number;
  lineHeight: number;
  fontColor: string;
  backgroundColor: string;
}

interface ProgressState {
  [path: string]: number;
}

interface WindowBoundsResult {
  x: number;
  y: number;
  width: number;
  height: number;
}

type AppMode = 'reader' | 'settings' | 'picker';
type ShortcutField = keyof ShortcutConfig;
type ColorField = 'fontColor' | 'backgroundColor';

const SETTINGS_KEY = 'hidden-page.settings';
const PROGRESS_KEY = 'hidden-page.progress';
const LAST_DOCUMENT_KEY = 'hidden-page.last-document-path';

const defaultReaderSettings: ReaderSettings = {
  fontSize: 20,
  lineHeight: 1.85,
  fontColor: '#132238',
  backgroundColor: '#fff8ec',
};

type StoredReaderSettings = Partial<ReaderSettings> & {
  theme?: 'light' | 'dark';
  background?: 'paper' | 'warm' | 'cool' | 'ink';
  lineHeight?: number;
};

type PickerState = {
  displayId: string;
  field: ColorField;
  image: HTMLImageElement | null;
  canvas: HTMLCanvasElement | null;
  context: CanvasRenderingContext2D | null;
  magnifierCanvas: HTMLCanvasElement | null;
  magnifierContext: CanvasRenderingContext2D | null;
  imageWidth: number;
  imageHeight: number;
  cursorX: number;
  cursorY: number;
  cursorColor: string;
};

const appUrl = new URL(window.location.href);
const appMode = appUrl.searchParams.get('mode') === 'settings'
  ? 'settings'
  : appUrl.searchParams.get('mode') === 'picker'
    ? 'picker'
    : 'reader';

const state = {
  mode: appMode as AppMode,
  document: null as ReaderDocument | null,
  settings: loadJson<ReaderSettings>(SETTINGS_KEY, defaultReaderSettings),
  shortcuts: { toggleWindow: '', previousPage: '', nextPage: '' },
  progress: loadJson<ProgressState>(PROGRESS_KEY, {}),
};

const pickerState: PickerState = {
  displayId: appUrl.searchParams.get('displayId') ?? '',
  field: (appUrl.searchParams.get('field') === 'backgroundColor' ? 'backgroundColor' : 'fontColor'),
  image: null,
  canvas: null,
  context: null,
  magnifierCanvas: null,
  magnifierContext: null,
  imageWidth: 0,
  imageHeight: 0,
  cursorX: 0,
  cursorY: 0,
  cursorColor: '#000000',
};

const appRoot = document.querySelector<HTMLDivElement>('#app');

if (!appRoot) {
  throw new Error('App root not found');
}

if (state.mode === 'picker') {
  appRoot.innerHTML = buildPickerMarkup();
} else if (state.mode === 'reader') {
  appRoot.innerHTML = buildReaderMarkup();
} else {
  appRoot.innerHTML = buildSettingsMarkup();
}

const readerElements = state.mode === 'reader'
  ? {
      viewport: document.querySelector<HTMLDivElement>('#readerViewport')!,
      content: document.querySelector<HTMLElement>('#readerContent')!,
    }
  : null;

const settingsElements = state.mode === 'settings'
  ? {
      fontSizeValue: document.querySelector<HTMLElement>('#fontSizeValue')!,
      lineHeightValue: document.querySelector<HTMLElement>('#lineHeightValue')!,
      fontPreview: document.querySelector<HTMLElement>('#fontSizePreview')!,
    fontColorValue: document.querySelector<HTMLElement>('#fontColorValue')!,
    backgroundColorValue: document.querySelector<HTMLElement>('#backgroundColorValue')!,
      shortcutSummary: document.querySelector<HTMLElement>('#shortcutSummary')!,
      statusLine: document.querySelector<HTMLElement>('#settingsStatus')!,
    importButton: document.querySelector<HTMLButtonElement>('#importNovelButton')!,
      fontSize: document.querySelector<HTMLInputElement>('[data-setting="fontSize"]')!,
    lineHeight: document.querySelector<HTMLInputElement>('[data-setting="lineHeight"]')!,
    fontColor: document.querySelector<HTMLInputElement>('[data-setting="fontColor"]')!,
    backgroundColor: document.querySelector<HTMLInputElement>('[data-setting="backgroundColor"]')!,
    pickFontColor: document.querySelector<HTMLButtonElement>('[data-pick-color="fontColor"]')!,
    pickBackgroundColor: document.querySelector<HTMLButtonElement>('[data-pick-color="backgroundColor"]')!,
      applyButton: document.querySelector<HTMLButtonElement>('#applyReaderSettingsButton')!,
      nextPage: document.querySelector<HTMLInputElement>('[data-shortcut="nextPage"]')!,
      previousPage: document.querySelector<HTMLInputElement>('[data-shortcut="previousPage"]')!,
      toggleWindow: document.querySelector<HTMLInputElement>('[data-shortcut="toggleWindow"]')!,
      restoreButton: document.querySelector<HTMLButtonElement>('#restoreShortcutsButton')!,
    }
  : null;

  const pickerElements = state.mode === 'picker'
    ? {
        image: document.querySelector<HTMLImageElement>('#pickerImage')!,
        reticle: document.querySelector<HTMLElement>('#pickerReticle')!,
        crosshairHorizontal: document.querySelector<HTMLElement>('#pickerCrosshairHorizontal')!,
        crosshairVertical: document.querySelector<HTMLElement>('#pickerCrosshairVertical')!,
        label: document.querySelector<HTMLElement>('#pickerLabel')!,
        hex: document.querySelector<HTMLElement>('#pickerHex')!,
        magnifier: document.querySelector<HTMLElement>('#pickerMagnifier')!,
        magnifierCanvas: document.querySelector<HTMLCanvasElement>('#pickerMagnifierCanvas')!,
        magnifierColor: document.querySelector<HTMLElement>('#pickerMagnifierColor')!,
        cancelButton: document.querySelector<HTMLButtonElement>('#pickerCancelButton')!,
      }
    : null;

let progressSaveTimer: number | null = null;
let activeShortcutField: ShortcutField | null = null;
let globalShortcutPaused = false;

function buildReaderMarkup(): string {
  return `
    <div class="reader-shell">
      <div class="reader-shell__move-handle" data-window-drag-handle="move"></div>
      <div class="reader-shell__resize-handle reader-shell__resize-handle--top" data-window-resize-handle="top"></div>
      <div class="reader-shell__resize-handle reader-shell__resize-handle--right" data-window-resize-handle="right"></div>
      <div class="reader-shell__resize-handle reader-shell__resize-handle--bottom" data-window-resize-handle="bottom"></div>
      <div class="reader-shell__resize-handle reader-shell__resize-handle--left" data-window-resize-handle="left"></div>
      <div class="reader-shell__resize-handle reader-shell__resize-handle--top-left" data-window-resize-handle="top-left"></div>
      <div class="reader-shell__resize-handle reader-shell__resize-handle--top-right" data-window-resize-handle="top-right"></div>
      <div class="reader-shell__resize-handle reader-shell__resize-handle--bottom-right" data-window-resize-handle="bottom-right"></div>
      <div class="reader-shell__resize-handle reader-shell__resize-handle--bottom-left" data-window-resize-handle="bottom-left"></div>
      <section class="reader-card">
        <div class="reader-card__body" id="readerViewport">
          <article class="reader-card__content reader-card__empty" id="readerContent">
            <div class="reader-empty__title">等待一本书。</div>
            <div>从托盘菜单打开小说，或把 txt 拖到这里。</div>
          </article>
        </div>
        <div class="reader-progress" id="readerProgress"></div>
      </section>
    </div>
  `;
}

function buildPickerMarkup(): string {
  return `
    <div class="picker-shell" id="pickerShell">
      <img class="picker-shell__image" id="pickerImage" alt="screen preview" draggable="false" />
      <div class="picker-shell__overlay">
        <div class="picker-shell__crosshair picker-shell__crosshair--horizontal" id="pickerCrosshairHorizontal"></div>
        <div class="picker-shell__crosshair picker-shell__crosshair--vertical" id="pickerCrosshairVertical"></div>
        <div class="picker-shell__reticle" id="pickerReticle"></div>
        <div class="picker-shell__magnifier" id="pickerMagnifier">
          <canvas class="picker-shell__magnifier-canvas" id="pickerMagnifierCanvas" width="180" height="180"></canvas>
          <div class="picker-shell__magnifier-color" id="pickerMagnifierColor">#000000</div>
        </div>
        <div class="picker-shell__hint">
          <div id="pickerLabel">点击屏幕任意位置取色</div>
          <div id="pickerHex">Esc 取消，右键取消</div>
        </div>
        <button class="picker-shell__cancel" id="pickerCancelButton" type="button">取消</button>
      </div>
    </div>
  `;
}

function buildSettingsMarkup(): string {
  return `
    <div class="settings-shell">
      <section class="settings-card settings-card--wide">
        <header class="settings-card__header">
          <div>
            <h1>设置页面</h1>
            <p>只保留字体、字体颜色和背景颜色，尽量减少阅读页可见元素。设置窗口本身不需要隐藏/显示快捷键。</p>
          </div>
          <div class="settings-card__badge">Settings</div>
        </header>

        <div class="settings-sections">
          <section class="settings-section">
            <h2>导入小说</h2>
            <p class="section-note">在这里选择本地 TXT 文件，导入后会直接发送到阅读页。</p>
            <div class="settings-actions">
              <button class="toolbar__button toolbar__button--primary" id="importNovelButton" type="button">导入小说</button>
            </div>
          </section>

          <section class="settings-section">
            <h2>阅读外观</h2>
            <div class="field-grid">
              <label class="field field--range">
                <span>字体大小 <em id="fontSizeValue"></em></span>
                <input class="field__range" data-setting="fontSize" type="range" min="1" max="30" step="1" />
              </label>
              <label class="field field--range">
                <span>行间距 <em id="lineHeightValue"></em></span>
                <input class="field__range" data-setting="lineHeight" type="range" min="0.5" max="3" step="0.05" />
              </label>
              <div class="settings-preview" id="fontSizePreview">
                <div class="settings-preview__title">字体预览</div>
                <div class="settings-preview__content">
                  <p>在设置里拖动字体大小时，这段文字会跟着变化。内容不需要真实小说，主要看字号、行距和阅读密度是否合适。</p>
                  <p>第二段可以帮你看长句的断行效果，尤其是中文、标点和空白在小字号下的表现。</p>
                  <p>再来一段，模拟连续阅读时的视觉节奏，方便你挑一个摸鱼也舒服的排版。</p>
                </div>
              </div>
              <label class="field field--color">
                <span>字体颜色 <em id="fontColorValue"></em></span>
                <div class="field__control-row">
                  <input class="field__color" data-setting="fontColor" type="color" />
                  <button class="toolbar__button field__pick-button" data-pick-color="fontColor" type="button">屏幕取色</button>
                </div>
              </label>
              <label class="field field--color">
                <span>背景颜色 <em id="backgroundColorValue"></em></span>
                <div class="field__control-row">
                  <input class="field__color" data-setting="backgroundColor" type="color" />
                  <button class="toolbar__button field__pick-button" data-pick-color="backgroundColor" type="button">屏幕取色</button>
                </div>
              </label>
            </div>
          </section>

          <section class="settings-section">
            <h2>快捷键</h2>
            <p class="section-note">仅阅读窗口使用翻页和隐藏显示快捷键。</p>
            <div class="field-grid">
              <label class="field">
                <span>下一页快捷键</span>
                <input class="field__input" data-shortcut="nextPage" type="text" readonly spellcheck="false" placeholder="点击后按新组合键" />
              </label>
              <label class="field">
                <span>上一页快捷键</span>
                <input class="field__input" data-shortcut="previousPage" type="text" readonly spellcheck="false" placeholder="点击后按新组合键" />
              </label>
              <label class="field">
                <span>隐藏 / 显示阅读窗</span>
                <input class="field__input" data-shortcut="toggleWindow" type="text" readonly spellcheck="false" placeholder="点击后按新组合键" />
              </label>
            </div>
            <div class="settings-actions">
              <button class="toolbar__button" id="restoreShortcutsButton" type="button">恢复默认快捷键</button>
            </div>
          </section>
        </div>

        <div class="settings-card__footer">
          <div id="shortcutSummary"></div>
          <div class="settings-card__footer-actions">
            <button class="toolbar__button toolbar__button--primary" id="applyReaderSettingsButton" type="button">确认应用到阅读页</button>
            <div id="settingsStatus"></div>
          </div>
        </div>
      </section>
    </div>
  `;
}

function applyVisualSettings(): void {
  document.documentElement.style.setProperty('--reader-font-color', state.settings.fontColor);
  document.documentElement.style.setProperty('--reader-background-color', state.settings.backgroundColor);
  saveJson(SETTINGS_KEY, state.settings);
  window.hiddenPage.setBackgroundColor(state.settings.backgroundColor).catch(() => {});

  if (state.mode !== 'reader') {
    if (settingsElements) {
      settingsElements.fontSize.value = String(state.settings.fontSize);
      settingsElements.lineHeight.value = String(state.settings.lineHeight);
      settingsElements.fontPreview.style.fontSize = `${state.settings.fontSize}px`;
      settingsElements.fontPreview.style.lineHeight = String(state.settings.lineHeight);
      settingsElements.fontPreview.style.color = state.settings.fontColor;
      settingsElements.fontPreview.style.backgroundColor = state.settings.backgroundColor;
      settingsElements.fontPreview.querySelectorAll<HTMLParagraphElement>('.settings-preview__content p').forEach((paragraph) => {
        paragraph.style.lineHeight = String(state.settings.lineHeight);
      });
      settingsElements.fontColor.value = state.settings.fontColor;
      settingsElements.backgroundColor.value = state.settings.backgroundColor;
      settingsElements.fontColorValue.textContent = state.settings.fontColor.toUpperCase();
      settingsElements.backgroundColorValue.textContent = state.settings.backgroundColor.toUpperCase();
      settingsElements.fontSizeValue.textContent = `${state.settings.fontSize}px`;
      settingsElements.lineHeightValue.textContent = state.settings.lineHeight.toFixed(2);
    }
    return;
  }

  if (!readerElements) {
    return;
  }

  readerElements.content.style.fontSize = `${state.settings.fontSize}px`;
  readerElements.content.style.lineHeight = String(state.settings.lineHeight);
  readerElements.content.style.color = state.settings.fontColor;
}

function renderSettingsColorValues(): void {
  if (!settingsElements) {
    return;
  }

  settingsElements.fontColor.value = state.settings.fontColor;
  settingsElements.backgroundColor.value = state.settings.backgroundColor;
  settingsElements.fontColorValue.textContent = state.settings.fontColor.toUpperCase();
  settingsElements.backgroundColorValue.textContent = state.settings.backgroundColor.toUpperCase();
}

function renderShortcutSummary(): void {
  if (!settingsElements) {
    return;
  }

  settingsElements.shortcutSummary.textContent = `当前快捷键：上一页 ${formatShortcut(state.shortcuts.previousPage)}，下一页 ${formatShortcut(state.shortcuts.nextPage)}，隐藏/显示阅读窗 ${formatShortcut(state.shortcuts.toggleWindow)}`;
}

function isValidCssColor(value: string): boolean {
  return typeof CSS !== 'undefined' && typeof value === 'string' && value.trim().length > 0 && CSS.supports('color', value);
}

function legacyBackgroundToColor(background?: string): string | null {
  switch (background) {
    case 'warm':
      return '#fff5e9';
    case 'cool':
      return '#eef5fb';
    case 'ink':
      return '#111827';
    case 'paper':
      return '#fff8ec';
    default:
      return null;
  }
}

function normalizeReaderSettings(raw: StoredReaderSettings | null | undefined): ReaderSettings {
  const fontSize = typeof raw?.fontSize === 'number' && Number.isFinite(raw.fontSize)
    ? Math.min(30, Math.max(1, Math.round(raw.fontSize)))
    : defaultReaderSettings.fontSize;
  const lineHeight = typeof raw?.lineHeight === 'number' && Number.isFinite(raw.lineHeight)
    ? Math.min(3, Math.max(0.5, Math.round(raw.lineHeight * 100) / 100))
    : defaultReaderSettings.lineHeight;
  const fontColorFallback = raw?.theme === 'dark' ? '#edf2ff' : defaultReaderSettings.fontColor;
  const backgroundColorFallback = raw?.theme === 'dark'
    ? '#121a2f'
    : legacyBackgroundToColor(raw?.background) ?? defaultReaderSettings.backgroundColor;

  return {
    fontSize,
    lineHeight,
    fontColor: isValidCssColor(raw?.fontColor ?? '') ? raw!.fontColor!.trim() : fontColorFallback,
    backgroundColor: isValidCssColor(raw?.backgroundColor ?? '') ? raw!.backgroundColor!.trim() : backgroundColorFallback,
  };
}

function setReaderColor(field: ColorField, value: string): void {
  if (!settingsElements || !isValidCssColor(value)) {
    return;
  }

  state.settings[field] = value;
  applyVisualSettings();
}

async function applyReaderSettingsNow(message = '已应用到阅读页。'): Promise<void> {
  if (!settingsElements) {
    return;
  }

  try {
    await window.hiddenPage.applyReaderSettings(state.settings);
    setSettingsStatus(message);
  } catch (error) {
    console.error('Failed to apply reader settings:', error);
    setSettingsStatus('应用到阅读页失败。');
  }
}

async function pickColor(field: ColorField): Promise<void> {
  if (!settingsElements) {
    return;
  }

  try {
    setSettingsStatus('请在屏幕上点选颜色。');
    const pickedColor = await window.hiddenPage.openScreenColorPicker(field);

    if (!pickedColor) {
      setSettingsStatus('已取消取色。');
      return;
    }

    setReaderColor(field, pickedColor);
    renderSettingsColorValues();
    setSettingsStatus(field === 'fontColor' ? '已更新字体颜色。' : '已更新背景颜色。');
    return;
  } catch (error) {
    console.error('Failed to pick color:', error);
    setSettingsStatus('屏幕取色失败。');
  }
}

function setSettingsStatus(message: string): void {
  if (settingsElements) {
    settingsElements.statusLine.textContent = message;
  }
}

function updateShortcutRecordingState(field: ShortcutField | null): void {
  activeShortcutField = field;

  if (!settingsElements) {
    return;
  }

  for (const input of [settingsElements.nextPage, settingsElements.previousPage, settingsElements.toggleWindow]) {
    const isRecording = input.dataset.shortcut === field;
    input.classList.toggle('field__input--recording', isRecording);
    input.dataset.recording = String(isRecording);
  }
}

function getShortcutInput(field: ShortcutField): HTMLInputElement | null {
  if (!settingsElements) {
    return null;
  }

  switch (field) {
    case 'nextPage':
      return settingsElements.nextPage;
    case 'previousPage':
      return settingsElements.previousPage;
    case 'toggleWindow':
      return settingsElements.toggleWindow;
    default:
      return null;
  }
}

async function setGlobalShortcutPaused(paused: boolean): Promise<void> {
  if (globalShortcutPaused === paused) {
    return;
  }

  globalShortcutPaused = paused;
  await window.hiddenPage.setGlobalShortcutEnabled(!paused);
}

function focusShortcutField(field: ShortcutField): void {
  const input = getShortcutInput(field);
  if (!input) {
    return;
  }

  input.focus();
  input.select();
}

async function beginShortcutRecording(field: ShortcutField): Promise<void> {
  if (!settingsElements) {
    return;
  }

  if (activeShortcutField === field) {
    return;
  }

  updateShortcutRecordingState(field);
  setSettingsStatus('正在录制快捷键...');
  await setGlobalShortcutPaused(true);
}

async function finishShortcutRecording(field: ShortcutField, shortcut: string): Promise<void> {
  state.shortcuts[field] = shortcut;
  updateShortcutRecordingState(null);
  renderShortcutInputs();
  renderShortcutSummary();
  try {
    await window.hiddenPage.saveShortcutConfig(state.shortcuts);
    setSettingsStatus('快捷键已保存。');
  } catch (error) {
    console.error('Failed to save shortcut config:', error);
    setSettingsStatus('快捷键保存失败。');
  } finally {
    await setGlobalShortcutPaused(false);
  }
}

async function cancelShortcutRecording(message = '已取消录制。'): Promise<void> {
  if (activeShortcutField === null) {
    return;
  }

  updateShortcutRecordingState(null);
  renderShortcutInputs();
  renderShortcutSummary();
  setSettingsStatus(message);
  await setGlobalShortcutPaused(false);
}

function normalizeReaderText(value: string): string {
  return value
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
    .split('"').join('&quot;')
    .split("'").join('&#39;');
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target.matches('input, textarea, select, [contenteditable="true"]');
}

function turnPage(direction: 'next' | 'previous'): void {
  if (!readerElements) {
    return;
  }

  const viewport = readerElements.viewport;
  const maxScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
  const delta = Math.max(240, Math.round(viewport.clientHeight * 0.88));
  const nextTop = direction === 'next' ? viewport.scrollTop + delta : viewport.scrollTop - delta;
  viewport.scrollTop = Math.min(maxScroll, Math.max(0, nextTop));
}

function renderReaderDocument(document: ReaderDocument | null): void {
  if (!readerElements) {
    return;
  }

  state.document = document;

  if (!document) {
    localStorage.removeItem(LAST_DOCUMENT_KEY);
    readerElements.content.className = 'reader-card__content reader-card__empty';
    readerElements.content.innerHTML = `
      <div class="reader-empty__title">等待一本书。</div>
      <div>从托盘菜单打开小说，或把 txt 拖到这里。</div>
    `;
    readerElements.viewport.scrollTop = 0;
    return;
  }

  localStorage.setItem(LAST_DOCUMENT_KEY, document.path);

  readerElements.content.className = 'reader-card__content';
  readerElements.content.innerHTML = normalizeReaderText(document.content);

  requestAnimationFrame(() => {
    const savedPosition = state.progress[document.path] ?? 0;
    readerElements.viewport.scrollTop = savedPosition;
    refreshProgress();
  });
}

function refreshProgress(): void {
  if (!readerElements || !state.document) {
    return;
  }

  const { scrollTop, scrollHeight, clientHeight } = readerElements.viewport;
  const maxScroll = Math.max(1, scrollHeight - clientHeight);

  // Calculate and display page number and percentage
  const totalPages = Math.max(1, Math.ceil(scrollHeight / clientHeight));
  // Map scroll progress proportionally to page range (avoids skipped pages)
  const currentPage = Math.min(totalPages, Math.max(1, Math.round((scrollTop / maxScroll) * (totalPages - 1)) + 1));
  const percent = Math.min(100, Math.round(((scrollTop + clientHeight) / scrollHeight) * 100));
  const progressEl = document.querySelector<HTMLElement>('#readerProgress');
  if (progressEl) {
    progressEl.textContent = `${currentPage}/${totalPages} · ${percent}%`;
  }

  if (progressSaveTimer !== null) {
    window.clearTimeout(progressSaveTimer);
  }

  progressSaveTimer = window.setTimeout(() => {
    if (!state.document) {
      return;
    }

    state.progress[state.document.path] = readerElements.viewport.scrollTop;
    saveJson(PROGRESS_KEY, state.progress);
  }, 120);
}

async function openDocument(): Promise<void> {
  if (!settingsElements) {
    return;
  }

  const result = await window.hiddenPage.openTextFile();

  if (!result) {
    return;
  }

  await window.hiddenPage.loadDocument(result);
  setSettingsStatus(`已导入：${result.name}`);
}

function bindReaderEvents(): void {
  if (!readerElements) {
    return;
  }

  const readerShell = document.querySelector<HTMLDivElement>('.reader-shell');
  let dragState:
    | {
        type: 'move' | 'resize';
        handle: string;
        startX: number;
        startY: number;
        bounds: WindowBoundsResult;
      }
    | null = null;

  const resizeCursorMap: Record<string, string> = {
    top: 'ns-resize',
    right: 'ew-resize',
    bottom: 'ns-resize',
    left: 'ew-resize',
    'top-left': 'nwse-resize',
    'top-right': 'nesw-resize',
    'bottom-right': 'nwse-resize',
    'bottom-left': 'nesw-resize',
  };

  const getNextBounds = (handle: string, bounds: WindowBoundsResult, deltaX: number, deltaY: number): WindowBoundsResult => {
    const minWidth = 56;
    const minHeight = 38;
    let { x, y, width, height } = bounds;

    if (handle.includes('left')) {
      const nextWidth = Math.max(minWidth, width - deltaX);
      x += width - nextWidth;
      width = nextWidth;
    }

    if (handle.includes('right')) {
      width = Math.max(minWidth, width + deltaX);
    }

    if (handle.includes('top')) {
      const nextHeight = Math.max(minHeight, height - deltaY);
      y += height - nextHeight;
      height = nextHeight;
    }

    if (handle.includes('bottom')) {
      height = Math.max(minHeight, height + deltaY);
    }

    return { x, y, width, height };
  };

  const stopDragging = (): void => {
    dragState = null;
    document.body.style.cursor = '';
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', stopDragging);
    window.removeEventListener('pointercancel', stopDragging);
  };

  const onPointerMove = async (event: PointerEvent): Promise<void> => {
    if (!dragState) {
      return;
    }

    const deltaX = event.screenX - dragState.startX;
    const deltaY = event.screenY - dragState.startY;

    if (dragState.type === 'move') {
      await window.hiddenPage.setReaderWindowBounds({
        x: dragState.bounds.x + deltaX,
        y: dragState.bounds.y + deltaY,
        width: dragState.bounds.width,
        height: dragState.bounds.height,
      });
      return;
    }

    const nextBounds = getNextBounds(dragState.handle, dragState.bounds, deltaX, deltaY);
    await window.hiddenPage.setReaderWindowBounds(nextBounds);
  };

  const beginDrag = async (event: PointerEvent, type: 'move' | 'resize', handle: string): Promise<void> => {
    if (event.button !== 0) {
      return;
    }

    const bounds = await window.hiddenPage.getReaderWindowBounds();
    if (!bounds) {
      return;
    }

    dragState = {
      type,
      handle,
      startX: event.screenX,
      startY: event.screenY,
      bounds,
    };

    document.body.style.cursor = type === 'move' ? 'grabbing' : resizeCursorMap[handle] ?? 'default';
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopDragging, { once: true });
    window.addEventListener('pointercancel', stopDragging, { once: true });
    event.preventDefault();
  };

  readerShell?.addEventListener('pointerdown', (event) => {
    const target = event.target as HTMLElement | null;
    const resizeHandle = target?.closest<HTMLElement>('[data-window-resize-handle]');
    const moveHandle = target?.closest<HTMLElement>('[data-window-drag-handle]');

    if (resizeHandle?.dataset.windowResizeHandle) {
      void beginDrag(event, 'resize', resizeHandle.dataset.windowResizeHandle);
      return;
    }

    if (moveHandle) {
      void beginDrag(event, 'move', 'move');
    }
  });

  const syncSettingsFromStorage = (): void => {
    const normalized = normalizeReaderSettings(loadJson<StoredReaderSettings>(SETTINGS_KEY, defaultReaderSettings));
    const hasChanged = normalized.fontSize !== state.settings.fontSize
      || normalized.lineHeight !== state.settings.lineHeight
      || normalized.fontColor !== state.settings.fontColor
      || normalized.backgroundColor !== state.settings.backgroundColor;

    if (!hasChanged) {
      return;
    }

    state.settings = normalized;
    applyVisualSettings();
  };

  window.addEventListener('storage', (event) => {
    if (event.key === SETTINGS_KEY) {
      syncSettingsFromStorage();
    }
  });

  window.addEventListener('focus', () => {
    syncSettingsFromStorage();
  });

  readerElements.viewport.addEventListener('scroll', refreshProgress, { passive: true });

  window.hiddenPage.onDocumentLoaded((document) => {
    renderReaderDocument(document);
  });

  // Global shortcuts from main process — bypass Chromium Alt-key interception
  window.hiddenPage.onGlobalTurnPage((direction) => {
    turnPage(direction);
  });

  window.addEventListener('keydown', async (event) => {
    if (isTypingTarget(event.target)) {
      return;
    }

    if (matchesShortcut(event, state.shortcuts.nextPage)) {
      event.preventDefault();
      turnPage('next');
      return;
    }

    if (matchesShortcut(event, state.shortcuts.previousPage)) {
      event.preventDefault();
      turnPage('previous');
      return;
    }

    if (matchesShortcut(event, state.shortcuts.toggleWindow)) {
      event.preventDefault();
      await window.hiddenPage.toggleWindow();
    }
  });

  readerElements.viewport.addEventListener('wheel', (event) => {
    event.preventDefault();
  }, { passive: false });

  readerElements.viewport.addEventListener('touchmove', (event) => {
    event.preventDefault();
  }, { passive: false });

  window.addEventListener('beforeunload', () => {
    if (state.document && readerElements) {
      state.progress[state.document.path] = readerElements.viewport.scrollTop;
      saveJson(PROGRESS_KEY, state.progress);
    }
  });
}

async function saveShortcutConfigWithStatus(nextConfig: ShortcutConfig, statusText: string): Promise<void> {
  state.shortcuts = normalizeShortcutConfig(nextConfig, window.hiddenPage.getDefaultShortcutConfig());
  renderShortcutInputs();
  renderShortcutSummary();

  if (settingsElements) {
    settingsElements.statusLine.textContent = statusText;
  }
}

function renderShortcutInputs(): void {
  if (!settingsElements) {
    return;
  }

  settingsElements.nextPage.value = state.shortcuts.nextPage;
  settingsElements.previousPage.value = state.shortcuts.previousPage;
  settingsElements.toggleWindow.value = state.shortcuts.toggleWindow;
}

function bindSettingsEvents(): void {
  if (!settingsElements) {
    return;
  }

  settingsElements.fontSize.addEventListener('input', () => {
    state.settings.fontSize = Number(settingsElements.fontSize.value);
    applyVisualSettings();
  });

  settingsElements.lineHeight.addEventListener('input', () => {
    state.settings.lineHeight = Number(settingsElements.lineHeight.value);
    applyVisualSettings();
  });

  settingsElements.fontColor.addEventListener('input', () => {
    setReaderColor('fontColor', settingsElements.fontColor.value);
  });

  settingsElements.backgroundColor.addEventListener('input', () => {
    setReaderColor('backgroundColor', settingsElements.backgroundColor.value);
  });

  settingsElements.applyButton.addEventListener('click', async () => {
    await applyReaderSettingsNow();
  });

  settingsElements.pickFontColor.addEventListener('click', async () => {
    await pickColor('fontColor');
  });

  settingsElements.pickBackgroundColor.addEventListener('click', async () => {
    await pickColor('backgroundColor');
  });

  const shortcutInputs: Array<[ShortcutField, HTMLInputElement]> = [
    ['nextPage', settingsElements.nextPage],
    ['previousPage', settingsElements.previousPage],
    ['toggleWindow', settingsElements.toggleWindow],
  ];

  for (const [key, input] of shortcutInputs) {
    input.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      void beginShortcutRecording(key).then(() => focusShortcutField(key));
    });

    input.addEventListener('focus', () => {
      void beginShortcutRecording(key);
    });

    input.addEventListener('keydown', async (event) => {
      if (activeShortcutField !== key) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (event.key === 'Escape' || event.key === 'Tab') {
        await cancelShortcutRecording();
        return;
      }

      if (isShortcutModifierOnlyKey(event.key)) {
        return;
      }

      const shortcut = serializeShortcutEvent(event);

      if (!shortcut) {
        return;
      }

      input.value = shortcut;
      await finishShortcutRecording(key, shortcut);
    });
  }

  settingsElements.restoreButton.addEventListener('click', async () => {
    if (activeShortcutField !== null) {
      await cancelShortcutRecording('已恢复默认快捷键。');
    }

    const defaultShortcuts = window.hiddenPage.getDefaultShortcutConfig();
    const savedConfig = await window.hiddenPage.saveShortcutConfig({ ...defaultShortcuts });
    await saveShortcutConfigWithStatus(savedConfig, '已恢复默认快捷键。');
  });

  window.addEventListener('blur', () => {
    if (activeShortcutField !== null) {
      void cancelShortcutRecording('已取消录制。');
    }
  });
}

async function bootstrap(): Promise<void> {
  state.settings = normalizeReaderSettings(loadJson<StoredReaderSettings>(SETTINGS_KEY, defaultReaderSettings));
  const defaultShortcuts = window.hiddenPage.getDefaultShortcutConfig();
  state.shortcuts = normalizeShortcutConfig(await window.hiddenPage.getShortcutConfig(), defaultShortcuts);

  if (state.mode === 'settings' && settingsElements) {
    settingsElements.statusLine.textContent = '支持自定义快捷键，修改后会自动保存。';
  }

  applyVisualSettings();

  if (state.mode === 'picker') {
    await bootstrapPicker();
    return;
  }

  if (state.mode === 'reader') {
    bindReaderEvents();

    window.hiddenPage.onReaderSettingsApplied((settings) => {
      state.settings = normalizeReaderSettings(settings);
      applyVisualSettings();
    });

    const lastDocumentPath = localStorage.getItem(LAST_DOCUMENT_KEY);
    if (lastDocumentPath) {
      try {
        const document = await window.hiddenPage.openTextFileAtPath(lastDocumentPath);
        // Render locally instead of calling loadDocument() IPC,
        // which would trigger showReaderWindow() and pop up the window on startup
        renderReaderDocument(document);
        return;
      } catch (error) {
        console.error('Failed to restore cached novel:', error);
        localStorage.removeItem(LAST_DOCUMENT_KEY);
      }
    }

    renderReaderDocument(null);
    return;
  }

  renderShortcutInputs();
  renderShortcutSummary();
  bindSettingsEvents();

  window.hiddenPage.onShortcutRegistrationFailed((failedKeys) => {
    if (settingsElements) {
      settingsElements.statusLine.textContent = `警告：以下快捷键注册失败，可能与其他应用冲突：${failedKeys.join('、')}`;
    }
  });

  if (settingsElements) {
    settingsElements.fontSize.value = String(state.settings.fontSize);
    settingsElements.lineHeight.value = String(state.settings.lineHeight);
    renderSettingsColorValues();
    settingsElements.fontSizeValue.textContent = `${state.settings.fontSize}px`;
    settingsElements.lineHeightValue.textContent = state.settings.lineHeight.toFixed(2);
    settingsElements.statusLine.textContent = '设置已加载。';
    settingsElements.importButton.addEventListener('click', async () => {
      await openDocument();
    });
  }
}

async function bootstrapPicker(): Promise<void> {
  if (!pickerElements) {
    return;
  }

  const picker = pickerElements;

  const cancelPicker = async (): Promise<void> => {
    await window.hiddenPage.completeScreenColorPick(null);
  };

  picker.image.addEventListener('contextmenu', async (event) => {
    event.preventDefault();
    await cancelPicker();
  });

  picker.cancelButton.addEventListener('click', async () => {
    await cancelPicker();
  });

  window.addEventListener('keydown', async (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      await cancelPicker();
    }
  });

  picker.label.textContent = pickerState.field === 'fontColor' ? '点击屏幕任意位置取字体颜色' : '点击屏幕任意位置取背景颜色';
  picker.hex.textContent = '正在准备屏幕图像...';
  picker.image.classList.add('picker-shell__image--loading');

  try {
    const capture = await window.hiddenPage.captureDisplayThumbnail(pickerState.displayId);
    const image = new Image();
    image.src = capture.dataUrl;
    await image.decode();

    pickerState.image = image;
    pickerState.imageWidth = capture.width;
    pickerState.imageHeight = capture.height;
    pickerState.canvas = document.createElement('canvas');
    pickerState.canvas.width = Math.max(1, image.naturalWidth);
    pickerState.canvas.height = Math.max(1, image.naturalHeight);
    pickerState.context = pickerState.canvas.getContext('2d', { willReadFrequently: true });
    pickerState.magnifierCanvas = picker.magnifierCanvas;
    pickerState.magnifierContext = picker.magnifierCanvas.getContext('2d', { willReadFrequently: true });

    if (!pickerState.context || !pickerState.magnifierContext || !pickerState.magnifierCanvas) {
      throw new Error('Unable to create 2D context');
    }

    pickerState.context.imageSmoothingEnabled = false;
    pickerState.context.clearRect(0, 0, pickerState.canvas.width, pickerState.canvas.height);
    pickerState.context.drawImage(image, 0, 0);

    picker.image.src = capture.dataUrl;
    picker.image.classList.remove('picker-shell__image--loading');
    picker.hex.textContent = '单击选择颜色，Esc 或右键取消';
    renderPickerMagnifier(0, 0);

    await window.hiddenPage.showScreenColorPickerWindow();

  } catch (error) {
    console.error('Failed to prepare screen picker:', error);
    picker.hex.textContent = '无法获取屏幕图像';
    return;
  }

  function renderPickerMagnifier(offsetX: number, offsetY: number): void {
    if (!pickerState.image || !pickerState.magnifierCanvas || !pickerState.magnifierContext) {
      return;
    }

    const image = pickerState.image;
    const canvas = pickerState.magnifierCanvas;
    const context = pickerState.magnifierContext;
    const sourceSize = 26;
    const rect = picker.image.getBoundingClientRect();
    const scaleX = image.naturalWidth / rect.width;
    const scaleY = image.naturalHeight / rect.height;
    const imageX = Math.max(0, Math.min(image.naturalWidth - sourceSize, Math.floor(offsetX * scaleX - sourceSize / 2)));
    const imageY = Math.max(0, Math.min(image.naturalHeight - sourceSize, Math.floor(offsetY * scaleY - sourceSize / 2)));

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = false;
    context.drawImage(image, imageX, imageY, sourceSize, sourceSize, 0, 0, canvas.width, canvas.height);

    const magnifier = picker.magnifier;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const magnifierWidth = 220;
    const magnifierHeight = 220;
    let left = offsetX + 28;
    let top = offsetY + 28;

    if (left + magnifierWidth > windowWidth) {
      left = offsetX - magnifierWidth - 28;
    }
    if (top + magnifierHeight > windowHeight) {
      top = offsetY - magnifierHeight - 28;
    }

    left = Math.min(windowWidth - magnifierWidth - 12, Math.max(12, left));
    top = Math.min(windowHeight - magnifierHeight - 12, Math.max(12, top));

    magnifier.style.transform = `translate(${left}px, ${top}px)`;
    magnifier.style.setProperty('--magnifier-color', pickerState.cursorColor);
  }

  async function updatePointer(event: PointerEvent | MouseEvent): Promise<void> {
    if (!pickerState.image || !pickerState.canvas || !pickerState.context || !pickerState.magnifierCanvas || !pickerState.magnifierContext) {
      return;
    }

    const rect = picker.image.getBoundingClientRect();
    const offsetX = Math.min(rect.width, Math.max(0, event.clientX - rect.left));
    const offsetY = Math.min(rect.height, Math.max(0, event.clientY - rect.top));
    pickerState.cursorX = offsetX;
    pickerState.cursorY = offsetY;
    picker.crosshairHorizontal.style.top = `${Math.round(offsetY)}px`;
    picker.crosshairVertical.style.left = `${Math.round(offsetX)}px`;
    picker.reticle.style.left = `${Math.round(offsetX - 14)}px`;
    picker.reticle.style.top = `${Math.round(offsetY - 14)}px`;

    const sampleX = Math.min(Math.max(0, Math.floor((offsetX / Math.max(1, rect.width)) * Math.max(1, pickerState.imageWidth))), Math.max(0, pickerState.imageWidth - 1));
    const sampleY = Math.min(Math.max(0, Math.floor((offsetY / Math.max(1, rect.height)) * Math.max(1, pickerState.imageHeight))), Math.max(0, pickerState.imageHeight - 1));

    try {
      const sampled = await window.hiddenPage.samplePixelColor(sampleX, sampleY);
      if (sampled.hex) {
        pickerState.cursorColor = sampled.hex;
        picker.hex.textContent = sampled.hex.toUpperCase();
        picker.magnifierColor.textContent = sampled.hex.toUpperCase();
      }
    } catch (error) {
      console.error('Failed to sample pixel color:', error);
    }

    renderPickerMagnifier(offsetX, offsetY);
  }

  picker.image.addEventListener('pointermove', (event) => {
    void updatePointer(event);
  });

  picker.image.addEventListener('pointerenter', (event) => {
    void updatePointer(event);
  });

  picker.image.addEventListener('click', async (event) => {
    if (!pickerState.image || !pickerState.canvas || !pickerState.context) {
      return;
    }

    const rect = picker.image.getBoundingClientRect();
    const offsetX = Math.min(rect.width, Math.max(0, event.clientX - rect.left));
    const offsetY = Math.min(rect.height, Math.max(0, event.clientY - rect.top));
    const sampleX = Math.min(Math.max(0, Math.floor((offsetX / Math.max(1, rect.width)) * Math.max(1, pickerState.imageWidth))), Math.max(0, pickerState.imageWidth - 1));
    const sampleY = Math.min(Math.max(0, Math.floor((offsetY / Math.max(1, rect.height)) * Math.max(1, pickerState.imageHeight))), Math.max(0, pickerState.imageHeight - 1));

    const sampled = await window.hiddenPage.samplePixelColor(sampleX, sampleY);
    if (!sampled.hex) {
      picker.hex.textContent = '未能识别该像素';
      return;
    }

    picker.hex.textContent = sampled.hex.toUpperCase();
    await window.hiddenPage.completeScreenColorPick(sampled.hex);
  });

}

void bootstrap().catch((error) => {
  console.error('Failed to bootstrap HiddenPage:', error);
});
