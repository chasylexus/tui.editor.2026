const STRUCTURAL_MARKDOWN_PATTERNS = [
  /^\s{0,3}#{1,6}\s+/m,
  /^\s{0,3}>\s+/m,
  /^\s{0,3}([-*+])\s+/m,
  /^\s{0,3}\d+[.)]\s+/m,
  /^\s{0,3}[-*_]{3,}\s*$/m,
  /^\s{0,3}[-*]\s\[[ xX]\]\s+/m,
  /```[\s\S]*```/m,
  /^\s*\|.+\|\s*$/m,
  /^\s{0,3}\[\^[^\]\n]+\]:\s+/m,
];

const INLINE_MARKDOWN_PATTERNS = [
  /!\[[^\]]*]\([^)]+\)/,
  /\[[^\]]+]\([^)]+\)/,
  /`[^`\n]+`/,
  /~~[^~\n]+~~/,
  /(\*\*|__)[^*_]+(\*\*|__)/,
  /\[\^[^\]\n]+\]/,
  /\^\[[^\]\n]+\]/,
];

const FOOTNOTE_MARKDOWN_PATTERN = /\[\^[^\]\n]+\]|\^\[[^\]\n]+\]|^\s{0,3}\[\^[^\]\n]+\]:/m;

const SIMPLE_HTML_WRAPPER_TAGS = new Set(['html', 'head', 'body', 'meta', 'div', 'span', 'p', 'br']);

const RICH_HTML_TAG_SELECTOR = [
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'img',
  'video',
  'audio',
  'iframe',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'a[href]',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'del',
].join(',');

interface NormalizedHtmlTableCell {
  text: string;
}

interface HtmlCellSpanInfo {
  rowspan: number;
  colspan: number;
}

type TableRowMap = Map<number, NormalizedHtmlTableCell>;
type ActiveSpanMode = 'repeat' | 'skip';

interface ActiveSpan {
  remaining: number;
  mode: ActiveSpanMode;
  content?: string;
}

function parseHtmlDocument(html: string) {
  if (typeof document === 'undefined') {
    return null;
  }

  const parser = new DOMParser();

  return parser.parseFromString(html, 'text/html');
}

export function hasRichHtmlClipboard(html: string) {
  if (typeof html !== 'string' || !html.trim()) {
    return false;
  }

  const doc = parseHtmlDocument(html);

  if (!doc) {
    return false;
  }

  if (doc.querySelector(RICH_HTML_TAG_SELECTOR)) {
    return true;
  }

  const allElements = Array.from(doc.querySelectorAll('*'));

  return allElements.some((element) => {
    const tagName = element.tagName.toLowerCase();

    if (!SIMPLE_HTML_WRAPPER_TAGS.has(tagName)) {
      return true;
    }

    if (tagName === 'span' || tagName === 'p' || tagName === 'div') {
      const style = element.getAttribute('style');

      if (style && style.trim()) {
        return true;
      }
    }

    return false;
  });
}

function escapeTableCell(value: string) {
  return value.replace(/\|/g, '\\|').trim();
}

function normalizeHtmlTableCellText(value: string) {
  return value.replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function getCellSpanInfo(cell: Element): HtmlCellSpanInfo {
  const parseSpan = (attrName: 'rowspan' | 'colspan') => {
    const raw = cell.getAttribute(attrName);
    const span = Number.parseInt(raw || '', 10);

    return Number.isFinite(span) && span > 1 ? span : 1;
  };

  return {
    rowspan: parseSpan('rowspan'),
    colspan: parseSpan('colspan'),
  };
}

function getTopLevelTableRows(table: Element) {
  return Array.from(table.querySelectorAll('tr')).filter((row) => row.closest('table') === table);
}

function hasOnlySingleTableContent(doc: Document) {
  const tables = Array.from(doc.querySelectorAll('table'));

  if (tables.length !== 1) {
    return false;
  }

  const body = doc.body;

  if (!body) {
    return true;
  }

  const clone = body.cloneNode(true) as HTMLElement;
  const cloneTable = clone.querySelector('table');

  if (cloneTable) {
    cloneTable.remove();
  }

  const remainingText = (clone.textContent || '').replace(/\u00a0/g, ' ').trim();

  if (remainingText) {
    return false;
  }

  // If there is another table (or non-text media block) outside the first one,
  // this is mixed clipboard content; do not force markdown-table path.
  if (clone.querySelector('table, img, video, audio, iframe')) {
    return false;
  }

  // Google Docs and similar sources wrap table fragments with non-semantic
  // wrappers/styles. If no meaningful text and no media remain, treat as a
  // single-table payload.
  return true;
}

function formatMarkdownRow(cells: string[]) {
  return `| ${cells.join(' | ')} |`;
}

export function convertHtmlTableToNormalizedMarkdownTable(html: string) {
  if (typeof html !== 'string' || !html.trim()) {
    return null;
  }

  const htmlSource =
    /<table[\s>]/i.test(html) || !/<tr[\s>]/i.test(html) ? html : `<table>${html}</table>`;
  const doc = parseHtmlDocument(htmlSource);
  const table = doc?.querySelector('table');

  if (!table || !doc || !hasOnlySingleTableContent(doc)) {
    return null;
  }

  const rows = getTopLevelTableRows(table);
  const hasThead = Array.from(table.children).some(
    (child) => child.tagName && child.tagName.toLowerCase() === 'thead'
  );

  if (!rows.length) {
    return null;
  }

  const rowsData: TableRowMap[] = [];
  const covered: boolean[][] = [];
  let maxColumnCount = 0;

  rows.forEach((row, rowIndex) => {
    const cells = Array.from(row.children).filter((child) => {
      const tagName = child.tagName.toLowerCase();

      return tagName === 'th' || tagName === 'td';
    });
    let colIndex = 0;

    if (!rowsData[rowIndex]) {
      rowsData[rowIndex] = new Map<number, NormalizedHtmlTableCell>();
    }
    if (!covered[rowIndex]) {
      covered[rowIndex] = [];
    }

    cells.forEach((cell) => {
      while (covered[rowIndex][colIndex]) {
        colIndex += 1;
      }

      const { rowspan, colspan } = getCellSpanInfo(cell);
      const text = normalizeHtmlTableCellText(cell.textContent || '');

      rowsData[rowIndex].set(colIndex, {
        text,
      });

      for (let r = rowIndex; r < rowIndex + rowspan; r += 1) {
        if (!covered[r]) {
          covered[r] = [];
        }
        for (let c = colIndex; c < colIndex + colspan; c += 1) {
          covered[r][c] = true;

          // Top-row merges cannot be represented safely in markdown tables.
          // Expand them into repeated plain cells instead of preserving merge.
          if (rowIndex === 0 && (r !== rowIndex || c !== colIndex)) {
            if (!rowsData[r]) {
              rowsData[r] = new Map<number, NormalizedHtmlTableCell>();
            }
            rowsData[r].set(c, { text });
          }
        }
      }

      maxColumnCount = Math.max(maxColumnCount, colIndex + colspan);
      colIndex += colspan;
    });

    maxColumnCount = Math.max(maxColumnCount, covered[rowIndex].length);
  });

  if (!maxColumnCount) {
    return null;
  }

  const markdownRows: string[] = [];

  rows.forEach((_, rowIndex) => {
    const row = rowsData[rowIndex];
    const rowTokens = new Array(maxColumnCount).fill('').map((_, colIndex) => {
      const cell = row?.get(colIndex);

      return cell ? escapeTableCell(cell.text) : '';
    });

    markdownRows.push(formatMarkdownRow(rowTokens));
  });

  if (!markdownRows.length) {
    return null;
  }

  const header = markdownRows[0];
  const bodyRows = markdownRows.slice(1);
  const delimiter = formatMarkdownRow(new Array(maxColumnCount).fill('---'));

  // Always normalize HTML table paste through markdown path. This guarantees
  // deterministic shape in WYSIWYG and avoids "heals after mode switch".
  return [header, delimiter, ...bodyRows].join('\n');
}

const MARKDOWN_TABLE_LINE_RE = /^\s*\|.*$/;
const MARKDOWN_TABLE_DELIM_RE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/;
const MERGED_CELL_PREFIX_RE = /^\s*(?:@(?:rows|cols)=\d+:)+/;

function splitByUnescapedPipe(text: string) {
  const cells: string[] = [];
  let start = 0;

  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '|' && text[i - 1] !== '\\') {
      cells.push(text.slice(start, i));
      start = i + 1;
    }
  }

  if (start <= text.length) {
    cells.push(text.slice(start));
  }

  return cells;
}

function splitMarkdownTableCells(line: string) {
  const trimmed = line.trim();

  if (!MARKDOWN_TABLE_LINE_RE.test(trimmed) || trimmed.length < 2) {
    return null;
  }

  let body = trimmed.slice(1);

  if (body.endsWith('|')) {
    body = body.slice(0, -1);
  }

  if (!body.length) {
    return [''];
  }

  return splitByUnescapedPipe(body).map((cell) => cell.trim());
}

function formatMarkdownTableLine(cells: string[], indent = '') {
  return `${indent}| ${cells.join(' | ')} |`;
}

function parseMergedCellSyntax(cell: string) {
  let content = cell.trim();
  let colspan = 1;
  let rowspan = 1;
  let matched = true;

  while (matched) {
    matched = false;

    const colMatch = /^@cols=(\d+):(.*)$/.exec(content);

    if (colMatch) {
      colspan = Number.parseInt(colMatch[1], 10) || 1;
      content = colMatch[2];
      matched = true;
      continue;
    }

    const rowMatch = /^@rows=(\d+):(.*)$/.exec(content);

    if (rowMatch) {
      rowspan = Number.parseInt(rowMatch[1], 10) || 1;
      content = rowMatch[2];
      matched = true;
    }
  }

  return {
    raw: cell.trim(),
    content: content.trim(),
    colspan: Math.max(colspan, 1),
    rowspan: Math.max(rowspan, 1),
    hasSpanSyntax: MERGED_CELL_PREFIX_RE.test(cell),
  };
}

function countVisibleColumnsFrom(startCol: number, totalColumns: number, activeSpans: Map<number, ActiveSpan>) {
  let count = 0;

  for (let col = startCol; col < totalColumns; col += 1) {
    const activeSpan = activeSpans.get(col);

    if (!activeSpan || activeSpan.mode === 'repeat') {
      count += 1;
    }
  }

  return count;
}

function normalizeTopRowMergedTableBlock(
  headerCells: string[],
  delimiterCells: string[],
  bodyCells: string[][],
  indent: string
) {
  const parsedHeaderCells = headerCells.map(parseMergedCellSyntax);
  const expandedFirstRow: string[] = [];
  const firstRowRepeatColumns = new Map<number, string>();
  let activeSpans = new Map<number, ActiveSpan>();
  let headerWidth = 0;

  parsedHeaderCells.forEach((cell) => {
    const startCol = headerWidth;

    for (let offset = 0; offset < cell.colspan; offset += 1) {
      expandedFirstRow[startCol + offset] = cell.content;
      if (cell.hasSpanSyntax) {
        firstRowRepeatColumns.set(startCol + offset, cell.content);
      }
    }

    if (cell.rowspan > 1) {
      for (let offset = 0; offset < cell.colspan; offset += 1) {
        activeSpans.set(startCol + offset, {
          remaining: cell.rowspan - 1,
          mode: 'repeat',
          content: cell.content,
        });
      }
    }

    headerWidth += cell.colspan;
  });

  const totalColumns = Math.max(headerWidth, delimiterCells.length);
  const normalizedBodyRows: Array<Array<string | null | undefined>> = [];

  bodyCells.forEach((row) => {
    const slots: Array<string | null | undefined> = new Array(totalColumns).fill(undefined);
    const parsedRowCells = row.map(parseMergedCellSyntax);
    const nextActiveSpans = new Map<number, ActiveSpan>();
    let rowCellIndex = 0;
    let col = 0;

    while (col < totalColumns) {
      const activeSpan = activeSpans.get(col);

      if (activeSpan) {
        if (activeSpan.mode === 'repeat') {
          slots[col] = activeSpan.content || '';
        } else {
          slots[col] = null;
        }

        if (activeSpan.remaining > 1) {
          nextActiveSpans.set(col, {
            ...activeSpan,
            remaining: activeSpan.remaining - 1,
          });
        }

        col += 1;
        continue;
      }

      const remainingWidth = parsedRowCells
        .slice(rowCellIndex)
        .reduce((sum, cell) => sum + cell.colspan, 0);
      const visibleColumnsLeft = countVisibleColumnsFrom(col, totalColumns, activeSpans);

      if (firstRowRepeatColumns.has(col) && remainingWidth < visibleColumnsLeft) {
        slots[col] = firstRowRepeatColumns.get(col) || '';
        col += 1;
        continue;
      }

      const cell = parsedRowCells[rowCellIndex];

      if (!cell) {
        break;
      }

      slots[col] = cell.raw;

      for (let offset = 1; offset < cell.colspan && col + offset < totalColumns; offset += 1) {
        slots[col + offset] = null;
      }

      if (cell.rowspan > 1) {
        for (let offset = 0; offset < cell.colspan && col + offset < totalColumns; offset += 1) {
          nextActiveSpans.set(col + offset, {
            remaining: cell.rowspan - 1,
            mode: 'skip',
          });
        }
      }

      col += cell.colspan;
      rowCellIndex += 1;
    }

    while (col < totalColumns) {
      const activeSpan = activeSpans.get(col);

      if (activeSpan) {
        slots[col] = activeSpan.mode === 'repeat' ? activeSpan.content || '' : null;

        if (activeSpan.remaining > 1) {
          nextActiveSpans.set(col, {
            ...activeSpan,
            remaining: activeSpan.remaining - 1,
          });
        }
      } else if (firstRowRepeatColumns.has(col)) {
        slots[col] = firstRowRepeatColumns.get(col) || '';
      }

      col += 1;
    }

    normalizedBodyRows.push(slots);
    activeSpans = nextActiveSpans;
  });

  const stringifyRow = (cells: Array<string | null | undefined>) =>
    formatMarkdownTableLine(
      cells
        .filter((cell) => cell !== null)
        .map((cell) => (typeof cell === 'string' ? cell : '')),
      indent
    );

  return [
    formatMarkdownTableLine(
      expandedFirstRow.concat(new Array(Math.max(0, totalColumns - expandedFirstRow.length)).fill('')),
      indent
    ),
    formatMarkdownTableLine(new Array(totalColumns).fill('---'), indent),
    ...normalizedBodyRows.map(stringifyRow),
  ];
}

function normalizeMarkdownTableBlock(lines: string[]) {
  if (lines.length < 2) {
    return null;
  }

  const headerCells = splitMarkdownTableCells(lines[0]);
  const delimiterCells = splitMarkdownTableCells(lines[1]);

  if (!headerCells || !delimiterCells || !MARKDOWN_TABLE_DELIM_RE.test(lines[1].trim())) {
    return null;
  }

  const bodyCells = lines.slice(2).map(splitMarkdownTableCells);

  if (bodyCells.some((cells) => !cells)) {
    return null;
  }

  const hasMergedCellSyntax = [headerCells, ...((bodyCells as string[][]) || [])].some((cells) =>
    cells.some((cell) => /(^|:)@(?:rows|cols)=\d+:/.test(cell) || /^@(?:rows|cols)=\d+:/.test(cell))
  );
  const hasHeaderMergedCellSyntax = headerCells.some((cell) => MERGED_CELL_PREFIX_RE.test(cell));

  if (hasHeaderMergedCellSyntax) {
    const indent = (lines[0].match(/^(\s*)\|/) || ['', ''])[1];

    return normalizeTopRowMergedTableBlock(
      headerCells,
      delimiterCells,
      bodyCells as string[][],
      indent
    );
  }

  // Rows with fewer cells are valid in merged-cell table syntax.
  // Do not "rectangularize" them, otherwise phantom extra columns appear.
  if (hasMergedCellSyntax) {
    return null;
  }

  const allRows = [headerCells, delimiterCells, ...(bodyCells as string[][])];
  const maxColumnCount = allRows.reduce((max, cells) => Math.max(max, cells.length), 0);

  if (!maxColumnCount) {
    return null;
  }

  const alreadyRectangular = allRows.every((cells) => cells.length === maxColumnCount);

  if (alreadyRectangular) {
    return null;
  }

  const indent = (lines[0].match(/^(\s*)\|/) || ['', ''])[1];
  const pad = (cells: string[]) =>
    cells.concat(new Array(Math.max(0, maxColumnCount - cells.length)).fill(''));
  const normalized = [
    formatMarkdownTableLine(pad(headerCells), indent),
    formatMarkdownTableLine(new Array(maxColumnCount).fill('---'), indent),
    ...((bodyCells as string[][]).map((cells) => formatMarkdownTableLine(pad(cells), indent))),
  ];

  return normalized;
}

export function normalizeMarkdownTableShape(text: string) {
  if (typeof text !== 'string' || !text.trim()) {
    return null;
  }

  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const result: string[] = [];
  let changed = false;
  let i = 0;

  while (i < lines.length) {
    const current = lines[i];
    const next = lines[i + 1];

    if (MARKDOWN_TABLE_LINE_RE.test(current) && typeof next === 'string') {
      const blockStart = i;
      let blockEnd = i + 1;

      while (blockEnd < lines.length && MARKDOWN_TABLE_LINE_RE.test(lines[blockEnd])) {
        blockEnd += 1;
      }

      const blockLines = lines.slice(blockStart, blockEnd);
      const normalizedBlock = normalizeMarkdownTableBlock(blockLines);

      if (normalizedBlock) {
        result.push(...normalizedBlock);
        changed = true;
      } else {
        result.push(...blockLines);
      }

      i = blockEnd;
      continue;
    }

    result.push(current);
    i += 1;
  }

  if (!changed) {
    return null;
  }

  return result.join('\n');
}

export function convertTabularPlainTextToMarkdownTable(text: string) {
  if (typeof text !== 'string') {
    return null;
  }

  const normalized = text.replace(/\r\n/g, '\n');

  if (!normalized.trim() || normalized.indexOf('\t') < 0) {
    return null;
  }

  const tabularLines = normalized
    .split('\n')
    .filter((line) => line.trim().length && line.includes('\t'));

  if (tabularLines.length < 2) {
    return null;
  }

  const rawRows = tabularLines
    .map((line) => line.split('\t'))
    .filter((cells) => cells.some((cell) => cell.trim().length));

  if (rawRows.length < 2) {
    return null;
  }

  const columnCount = rawRows.reduce((max, cells) => Math.max(max, cells.length), 0);

  if (columnCount < 2) {
    return null;
  }

  const rows = rawRows.map((cells) => {
    const padded = cells.slice();

    while (padded.length < columnCount) {
      padded.push('');
    }

    return padded.map((cell) => escapeTableCell(cell));
  });

  const [header, ...body] = rows;
  const delim = new Array(columnCount).fill('---');
  const toLine = (cells: string[]) => `| ${cells.join(' | ')} |`;

  return [toLine(header), toLine(delim), ...body.map(toLine)].join('\n');
}

export function shouldPasteMarkdownInWysiwyg(plainText: string, htmlText: string) {
  if (!looksLikeMarkdownPaste(plainText)) {
    return false;
  }

  return !hasRichHtmlClipboard(htmlText);
}

export function looksLikeMarkdownPaste(text: string) {
  if (typeof text !== 'string') {
    return false;
  }

  const normalized = text.replace(/\r\n/g, '\n').trim();

  if (!normalized) {
    return false;
  }

  if (FOOTNOTE_MARKDOWN_PATTERN.test(normalized)) {
    return true;
  }

  if (STRUCTURAL_MARKDOWN_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  const inlineMatchCount = INLINE_MARKDOWN_PATTERNS.reduce(
    (count, pattern) => count + Number(pattern.test(normalized)),
    0
  );
  const hasMultipleLines = normalized.includes('\n');

  return inlineMatchCount >= 2 || (hasMultipleLines && inlineMatchCount >= 1);
}
