function normalizeLineEndings(text: string) {
  return text.replace(/\r\n?/g, '\n');
}

function normalizeFootnoteId(id: string) {
  const normalized = id
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_.:-]/g, '_')
    .replace(/_+/g, '_');

  return normalized || 'note';
}

function escapeHtmlAttr(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function unescapeInlineFootnoteText(text: string) {
  return text.replace(/\\\[/g, '[').replace(/\\\]/g, ']').replace(/\\\\/g, '\\');
}

function parseDefinitions(lines: string[]) {
  const mainLines: string[] = [];
  const definitions = new Map<string, string>();
  const definitionOrder: string[] = [];
  const sourceToMainLineMap = Array(lines.length + 1).fill(0);
  const definitionSourceLines = new Map<string, number[]>();
  let idx = 0;

  while (idx < lines.length) {
    const line = lines[idx];
    const matched = line.match(/^\[\^([^\]\s]+)\]:\s*(.*)$/);

    if (!matched) {
      mainLines.push(line);
      sourceToMainLineMap[idx + 1] = mainLines.length;
      idx += 1;
      continue;
    }

    const id = normalizeFootnoteId(matched[1]);
    const contentLines = [matched[2] || ''];
    const sourceLines = [idx + 1];

    idx += 1;

    while (idx < lines.length) {
      const nextLine = lines[idx];
      const isIndented = /^(?: {4,}|\t)/.test(nextLine);
      const isBlank = nextLine.trim() === '';
      const nextIsContinuation =
        idx + 1 < lines.length && /^(?: {4,}|\t)/.test(lines[idx + 1] || '');

      if (isIndented) {
        contentLines.push(nextLine.replace(/^(?: {4}|\t)/, ''));
        sourceLines.push(idx + 1);
        idx += 1;
        continue;
      }

      if (isBlank && nextIsContinuation) {
        contentLines.push('');
        sourceLines.push(idx + 1);
        idx += 1;
        continue;
      }

      break;
    }

    while (contentLines.length && contentLines[contentLines.length - 1] === '') {
      contentLines.pop();
      sourceLines.pop();
    }

    definitions.set(id, contentLines.join('\n').trim());
    definitionSourceLines.set(id, sourceLines);
    if (!definitionOrder.includes(id)) {
      definitionOrder.push(id);
    }
  }

  return { mainLines, definitions, definitionOrder, sourceToMainLineMap, definitionSourceLines };
}

function isFenceStart(line: string) {
  const matched = line.match(/^\s*(`{3,}|~{3,})/);

  if (!matched) {
    return null;
  }

  return matched[1];
}

function replaceOutsideCodeSpans(line: string, replacer: (segment: string) => string): string {
  let idx = 0;
  let result = '';

  while (idx < line.length) {
    const tickStart = line.indexOf('`', idx);

    if (tickStart < 0) {
      result += replacer(line.slice(idx));
      break;
    }

    result += replacer(line.slice(idx, tickStart));

    let tickLen = 1;

    while (line[tickStart + tickLen] === '`') {
      tickLen += 1;
    }

    const fence = '`'.repeat(tickLen);
    const codeEnd = line.indexOf(fence, tickStart + tickLen);

    if (codeEnd < 0) {
      result += line.slice(tickStart);
      break;
    }

    result += line.slice(tickStart, codeEnd + tickLen);
    idx = codeEnd + tickLen;
  }

  return result;
}

function createRefHtml(id: string, refIndex: number, number: number) {
  const safeId = escapeHtmlAttr(id);
  const refId = `fnref-${safeId}-${refIndex}`;
  const targetId = `fn-${safeId}`;

  return {
    html: `<sup class="footnote-ref"><a id="${refId}" href="#${targetId}">${number}</a></sup>`,
    refId,
  };
}

function appendFootnotesSection(
  markdownBody: string,
  definitions: Map<string, string>,
  numberById: Map<string, number>,
  orderedIds: string[],
  refIdsByFootnoteId: Map<string, string[]>
) {
  if (!orderedIds.length) {
    return markdownBody;
  }

  const lines: string[] = [];

  orderedIds.forEach((id) => {
    const safeId = escapeHtmlAttr(id);
    const number = numberById.get(id)!;
    const definition = definitions.get(id) || 'None';
    const definitionLines = (definition || '').split('\n');
    const backRefs = refIdsByFootnoteId.get(id) || [];
    const backRefText = backRefs
      .map((refId, idx) => `[↩${idx === 0 ? '' : idx + 1}](#${refId})`)
      .join(' ');
    const lastLineIndex = definitionLines.length - 1;

    if (backRefText) {
      definitionLines[lastLineIndex] = `${definitionLines[lastLineIndex]} ${backRefText}`.trim();
    }

    const head = definitionLines[0] || '';

    lines.push(`${number}. <a id="fn-${safeId}">[${number}]</a>${head ? ` ${head}` : ''}`);

    for (let idx = 1; idx < definitionLines.length; idx += 1) {
      lines.push(`    ${definitionLines[idx]}`);
    }

    lines.push('');
  });

  while (lines.length && lines[lines.length - 1] === '') {
    lines.pop();
  }

  const section = ['---', '', '#### Footnotes', '', ...lines].join('\n');

  return markdownBody.trim() ? `${markdownBody}\n\n${section}` : section;
}

export function hasFootnoteSyntax(markdown: string) {
  if (!markdown) {
    return false;
  }

  return /\[\^[^\]]+\]|\^\[[^\]]+\]|^\[\^[^\]]+\]:/m.test(markdown);
}

export function hasTransformedFootnoteMarkup(markdown: string) {
  if (!markdown) {
    return false;
  }

  return (
    /<sup(?:\s+[^>]*)?>\s*<a\b[^>]*href="#fn-[^"]+"[^>]*>\d+<\/a>\s*<\/sup>/i.test(markdown) &&
    /(?:^|\n)(?:---|\*\*\*)\n\n####\s+Footnotes\s*\n/i.test(markdown)
  );
}

function stripBackReferenceLinks(line: string) {
  return line.replace(/\s*\[↩\d*\]\(#fnref-[^)]+\)/g, '').trimEnd();
}

function parseTransformedFootnotesSection(section: string) {
  const lines = section.split('\n');
  const definitions = new Map<string, string>();
  const orderedIds: string[] = [];
  let idx = 0;

  while (idx < lines.length) {
    const line = lines[idx];

    if (!line.trim()) {
      idx += 1;
      continue;
    }

    const matched = line.match(
      /^\d+\.\s+<a\s+[^>]*id="fn-([^"]+)"[^>]*>\\?\[\d+\\?\]<\/a>(?:\s*(.*))?$/
    );

    if (!matched) {
      return null;
    }

    const [, id, definition = ''] = matched;
    const definitionLines = [definition];

    idx += 1;

    while (idx < lines.length) {
      const nextLine = lines[idx];

      if (/^(?: {4}|\t)/.test(nextLine)) {
        definitionLines.push(nextLine.replace(/^(?: {4}|\t)/, ''));
        idx += 1;
        continue;
      }

      break;
    }

    while (definitionLines.length && definitionLines[definitionLines.length - 1] === '') {
      definitionLines.pop();
    }

    if (definitionLines.length) {
      const lastIndex = definitionLines.length - 1;

      definitionLines[lastIndex] = stripBackReferenceLinks(definitionLines[lastIndex]);
    }

    definitions.set(id, definitionLines.join('\n').trim());
    orderedIds.push(id);
  }

  return { definitions, orderedIds };
}

function restoreFootnoteRefsInLine(line: string) {
  return replaceOutsideCodeSpans(line, (segment) =>
    segment.replace(
      /<sup(?:\s+[^>]*)?>\s*<a\b([^>]*)>\d+<\/a>\s*<\/sup>/gi,
      (match: string, attrs: string) => {
        const href = attrs.match(/\bhref=(['"])#fn-([^"']+)\1/i);

        if (!href) {
          return match;
        }

        return `[^${href[2]}]`;
      }
    )
  );
}

function restoreFootnoteRefs(markdownBody: string) {
  const lines = markdownBody.split('\n');
  let inFence = false;
  let fenceToken = '';

  const nextLines = lines.map((line) => {
    const fence = isFenceStart(line);

    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceToken = fence[0];
      } else if (fence[0] === fenceToken[0]) {
        inFence = false;
      }

      return line;
    }

    if (inFence || /^ {4,}/.test(line)) {
      return line;
    }

    return restoreFootnoteRefsInLine(line);
  });

  return nextLines.join('\n');
}

function buildDefinitionSection(orderedIds: string[], definitions: Map<string, string>) {
  const lines: string[] = [];

  orderedIds.forEach((id) => {
    const definition = definitions.get(id) || '';
    const definitionLines = definition.split('\n');
    const head = definitionLines[0] || '';

    lines.push(`[^${id}]:${head ? ` ${head}` : ''}`);

    for (let idx = 1; idx < definitionLines.length; idx += 1) {
      lines.push(`    ${definitionLines[idx]}`);
    }

    lines.push('');
  });

  while (lines.length && lines[lines.length - 1] === '') {
    lines.pop();
  }

  return lines.join('\n');
}

export function restoreTransformedFootnotes(markdown: string) {
  const normalized = normalizeLineEndings(markdown || '');
  const markerRegex = /\n(?:---|\*\*\*)\n\n####\s+Footnotes\s*\n\n/g;
  let markerIndex = -1;
  let markerLen = 0;
  let matched = markerRegex.exec(normalized);

  while (matched) {
    markerIndex = matched.index;
    markerLen = matched[0].length;
    matched = markerRegex.exec(normalized);
  }

  if (markerIndex < 0 || markerLen === 0) {
    return {
      markdown: normalized,
      restored: false,
    };
  }

  const markdownBody = normalized.slice(0, markerIndex);
  const footnotesSection = normalized.slice(markerIndex + markerLen);
  const parsed = parseTransformedFootnotesSection(footnotesSection);

  if (!parsed || !parsed.orderedIds.length) {
    return {
      markdown: normalized,
      restored: false,
    };
  }

  const restoredBody = restoreFootnoteRefs(markdownBody).trimEnd();
  const definitions = buildDefinitionSection(parsed.orderedIds, parsed.definitions);
  const restoredMarkdown = restoredBody ? `${restoredBody}\n\n${definitions}` : definitions;

  return {
    markdown: restoredMarkdown,
    restored: true,
  };
}

export function transformMarkdownFootnotes(markdown: string) {
  const normalized = normalizeLineEndings(markdown || '');
  const sourceLines = normalized.split('\n');

  if (!hasFootnoteSyntax(normalized)) {
    const sourceToRenderedLineMap = Array(sourceLines.length + 1).fill(0);

    for (let line = 1; line <= sourceLines.length; line += 1) {
      sourceToRenderedLineMap[line] = line;
    }

    return {
      markdown: normalized,
      hasFootnotes: false,
      sourceToRenderedLineMap,
    };
  }

  const {
    mainLines,
    definitions,
    definitionOrder,
    sourceToMainLineMap,
    definitionSourceLines,
  } = parseDefinitions(sourceLines);
  const numberById = new Map<string, number>();
  const orderedIds: string[] = [];
  const refsCountById = new Map<string, number>();
  const refIdsByFootnoteId = new Map<string, string[]>();
  const inlineDefinitions = new Map<string, string>();
  let nextNumber = 1;
  let nextInlineId = 1;
  let inFence = false;
  let fenceToken = '';

  function ensureNumber(id: string) {
    if (!numberById.has(id)) {
      numberById.set(id, nextNumber);
      orderedIds.push(id);
      nextNumber += 1;
    }

    return numberById.get(id)!;
  }

  function registerReference(id: string) {
    const count = (refsCountById.get(id) || 0) + 1;
    const number = ensureNumber(id);
    const ref = createRefHtml(id, count, number);

    refsCountById.set(id, count);

    if (!refIdsByFootnoteId.has(id)) {
      refIdsByFootnoteId.set(id, []);
    }
    refIdsByFootnoteId.get(id)!.push(ref.refId);

    return ref.html;
  }

  const replacedLines = mainLines.map((line) => {
    const fence = isFenceStart(line);

    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceToken = fence[0];
      } else if (fence[0] === fenceToken[0]) {
        inFence = false;
      }

      return line;
    }

    if (inFence || /^ {4,}/.test(line)) {
      return line;
    }

    return replaceOutsideCodeSpans(line, (segment) =>
      segment.replace(
        /\^\[((?:\\.|[^\]\\])*)\]|\[\^([^\]\s]+)\]/g,
        (match: string, inlineText: string, refId: string, offset: number, whole: string) => {
          if (offset > 0 && whole[offset - 1] === '\\') {
            return match;
          }

          if (typeof inlineText === 'string' && inlineText.length > 0) {
            const id = `inline_${nextInlineId}`;
            const content = unescapeInlineFootnoteText(inlineText);

            nextInlineId += 1;
            inlineDefinitions.set(id, content.trim());

            return registerReference(id);
          }

          if (refId) {
            return registerReference(normalizeFootnoteId(refId));
          }

          return match;
        }
      )
    );
  });

  inlineDefinitions.forEach((value, id) => {
    if (!definitions.has(id)) {
      definitions.set(id, value);
    }
  });

  definitionOrder.forEach((id) => {
    if (!numberById.has(id)) {
      ensureNumber(id);
    }
  });

  definitions.forEach((_value, id) => {
    if (!numberById.has(id)) {
      ensureNumber(id);
    }
  });

  const sourceToRenderedLineMap = Array(sourceLines.length + 1).fill(0);
  let bodyStart = 0;
  let bodyEnd = replacedLines.length - 1;

  while (bodyStart <= bodyEnd && replacedLines[bodyStart].trim() === '') {
    bodyStart += 1;
  }

  while (bodyEnd >= bodyStart && replacedLines[bodyEnd].trim() === '') {
    bodyEnd -= 1;
  }

  if (bodyStart <= bodyEnd) {
    for (let sourceLine = 1; sourceLine < sourceToMainLineMap.length; sourceLine += 1) {
      const mainLine = sourceToMainLineMap[sourceLine];

      if (!mainLine) {
        continue;
      }

      const mainLineIndex = mainLine - 1;

      if (mainLineIndex < bodyStart || mainLineIndex > bodyEnd) {
        continue;
      }

      sourceToRenderedLineMap[sourceLine] = mainLineIndex - bodyStart + 1;
    }
  }

  const bodyLineCount = bodyStart <= bodyEnd ? bodyEnd - bodyStart + 1 : 0;
  const sectionStartLine = bodyLineCount > 0 ? bodyLineCount + 2 : 1;
  let currentSectionLine = sectionStartLine + 4;

  orderedIds.forEach((id) => {
    const definition = definitions.get(id) || '';
    const definitionLines = definition.split('\n');
    const mappedSourceLines = definitionSourceLines.get(id) || [];

    for (let idx = 0; idx < definitionLines.length && idx < mappedSourceLines.length; idx += 1) {
      sourceToRenderedLineMap[mappedSourceLines[idx]] = currentSectionLine + idx;
    }

    currentSectionLine += definitionLines.length;
    currentSectionLine += 1;
  });

  const transformed = appendFootnotesSection(
    replacedLines.join('\n').trim(),
    definitions,
    numberById,
    orderedIds,
    refIdsByFootnoteId
  );

  return {
    markdown: transformed,
    hasFootnotes: orderedIds.length > 0,
    sourceToRenderedLineMap,
  };
}
