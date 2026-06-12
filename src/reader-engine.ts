export interface SearchMatch {
  offset: number;
  length: number;
}

export interface EngineDocumentHeader {
  path: string;
  name: string;
  encoding: string;
  totalChars: number;
}

export interface PageResult {
  pageIndex: number;
  totalPages: number;
  charOffset: number;
  totalChars: number;
}

export interface ViewMetrics {
  fontSize: number;
  lineHeight: number;
  width: number;
  height: number;
}

export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (ch) => map[ch]);
}

export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function estimateCharsPerPage(metrics: ViewMetrics): number {
  const avgCharWidth = metrics.fontSize * 0.9;
  const charsPerLine = Math.max(1, Math.floor(metrics.width / avgCharWidth));
  const linesPerView = Math.max(1, Math.floor(metrics.height / (metrics.fontSize * metrics.lineHeight)));
  return Math.max(1, Math.floor(charsPerLine * linesPerView * 0.95));
}

export class ReaderEngine {
  private container: HTMLElement;
  private documentPath = '';
  private documentName = '';
  private totalChars = 0;
  private charsPerPage: number;
  private charOffset = 0;
  private pageIndex = 0;
  private totalPages = 0;
  private searchHighlights: SearchMatch[] = [];
  private activeHighlightIndex = -1;

  constructor(container: HTMLElement, metrics: ViewMetrics) {
    this.container = container;
    this.charsPerPage = estimateCharsPerPage(metrics);
  }

  get currentDocumentPath(): string {
    return this.documentPath;
  }

  get currentDocumentName(): string {
    return this.documentName;
  }

  async loadDocument(header: EngineDocumentHeader): Promise<void> {
    this.documentPath = header.path;
    this.documentName = header.name;
    this.totalChars = header.totalChars;
    this.totalPages = Math.max(1, Math.ceil(this.totalChars / this.charsPerPage));
    this.charOffset = 0;
    this.pageIndex = 0;
    await this.renderCurrentPage();
  }

  async goToCharOffset(offset: number): Promise<PageResult> {
    const clamped = Math.max(0, Math.min(offset, Math.max(0, this.totalChars - 1)));
    this.charOffset = clamped;
    this.pageIndex = Math.min(Math.floor(this.charOffset / this.charsPerPage), this.totalPages - 1);
    await this.renderCurrentPage();
    return this.getPageResult();
  }

  async turnPage(direction: 'next' | 'previous'): Promise<PageResult> {
    if (direction === 'next') {
      this.pageIndex = Math.min(this.pageIndex + 1, this.totalPages - 1);
    } else {
      this.pageIndex = Math.max(this.pageIndex - 1, 0);
    }
    this.charOffset = this.pageIndex * this.charsPerPage;
    await this.renderCurrentPage();
    return this.getPageResult();
  }

  async goToPage(pageNumber: number): Promise<PageResult> {
    const clamped = Math.max(1, Math.min(pageNumber, this.totalPages));
    const offset = (clamped - 1) * this.charsPerPage;
    return this.goToCharOffset(offset);
  }

  setSearchHighlights(matches: SearchMatch[], activeIndex: number): void {
    this.searchHighlights = matches;
    this.activeHighlightIndex = activeIndex;
  }

  clearSearchHighlights(): void {
    this.searchHighlights = [];
    this.activeHighlightIndex = -1;
  }

  getPageResult(): PageResult {
    return {
      pageIndex: this.pageIndex,
      totalPages: this.totalPages,
      charOffset: this.charOffset,
      totalChars: this.totalChars,
    };
  }

  recalculate(metrics: ViewMetrics): void {
    const oldCharOffset = this.charOffset;
    this.charsPerPage = estimateCharsPerPage(metrics);
    this.totalPages = Math.max(1, Math.ceil(this.totalChars / this.charsPerPage));
    this.pageIndex = Math.min(Math.floor(oldCharOffset / this.charsPerPage), this.totalPages - 1);
    this.charOffset = oldCharOffset;
  }

  private async renderCurrentPage(): Promise<void> {
    if (!this.documentPath || this.totalChars === 0) {
      this.container.innerHTML = '';
      return;
    }

    const start = this.charOffset;
    // Fetch with a small overflow buffer to avoid clipping at boundaries
    const end = Math.min(start + this.charsPerPage + 256, this.totalChars);

    let segment: string | null = null;
    try {
      segment = await window.hiddenPage.getSegment(this.documentPath, start, end);
    } catch {
      // Ignore — render empty on error
    }

    if (segment === null) {
      // Document not cached; attempt to reopen
      try {
        await window.hiddenPage.openDocument(this.documentPath);
        segment = await window.hiddenPage.getSegment(this.documentPath, start, end);
      } catch {
        // Last-resort fallback
      }
    }

    const safeText = normalizeLineEndings(segment ?? '');
    if (this.searchHighlights.length === 0 || safeText.length === 0) {
      this.container.innerHTML = escapeHtml(safeText);
      return;
    }

    // Build HTML with <mark> tags for matches visible on this page
    const pageStart = this.charOffset;
    const pageEnd = pageStart + safeText.length;
    const activeOffset = this.activeHighlightIndex >= 0
      ? this.searchHighlights[this.activeHighlightIndex]?.offset ?? -1
      : -1;

    const visibleMatches = this.searchHighlights
      .filter((m) => m.offset >= pageStart && m.offset < pageEnd)
      .sort((a, b) => a.offset - b.offset);

    if (visibleMatches.length === 0) {
      this.container.innerHTML = escapeHtml(safeText);
      return;
    }

    let html = '';
    let lastEnd = 0;
    for (const match of visibleMatches) {
      const localStart = match.offset - pageStart;
      const localEnd = localStart + match.length;
      const isActive = match.offset === activeOffset;

      html += escapeHtml(safeText.slice(lastEnd, localStart));
      const cls = isActive ? ' class="search-active"' : '';
      html += `<mark${cls}>${escapeHtml(safeText.slice(localStart, localEnd))}</mark>`;
      lastEnd = localEnd;
    }
    html += escapeHtml(safeText.slice(lastEnd));

    this.container.innerHTML = html;
  }
}
