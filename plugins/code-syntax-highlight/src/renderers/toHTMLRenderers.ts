import type { MdNode, CodeBlockMdNode } from '@techie_doubts/tui.editor.2026';
import type { HTMLToken } from '@techie_doubts/toastmark';
import { PrismJs } from '@t/index';

const BACKTICK_COUNT = 3;
const LINE_NUM_RE = /^(.+?)=(\d+|\+)?$/;

function parseInfoString(
  raw: string
): {
  lang: string | null;
  lineNumber: number | null;
  continueLineNumber: boolean;
  lineWrap: boolean;
} {
  if (raw === '!') {
    return {
      lang: null,
      lineNumber: null,
      continueLineNumber: false,
      lineWrap: true,
    };
  }

  const match = raw.match(LINE_NUM_RE);

  if (match) {
    if (match[2] === '+') {
      return { lang: match[1], lineNumber: null, continueLineNumber: true, lineWrap: false };
    }

    return {
      lang: match[1],
      lineNumber: match[2] ? Number(match[2]) : 1,
      continueLineNumber: false,
      lineWrap: false,
    };
  }

  return { lang: raw, lineNumber: null, continueLineNumber: false, lineWrap: false };
}

function buildGutterHTML(lineNumber: number, lineCount: number): string {
  const nums: string[] = [];

  for (let i = 0; i < lineCount; i += 1) {
    nums.push(String(lineNumber + i));
  }
  return nums.join('\n');
}

function getCodeBlockLineCount(literal: string | null | undefined) {
  return String(literal || '')
    .replace(/\n$/, '')
    .split('\n').length;
}

function findPreviousCodeBlock(node: MdNode) {
  let cursor = node.prev || null;

  while (cursor) {
    if (cursor.type === 'codeBlock') {
      return cursor as CodeBlockMdNode;
    }
    cursor = cursor.prev || null;
  }

  return null;
}

function resolveLineNumberInternal(
  node: CodeBlockMdNode,
  cache: WeakMap<object, number | null>,
  seen: WeakSet<object>
): number | null {
  if (cache.has(node as object)) {
    return cache.get(node as object)!;
  }
  if (seen.has(node as object)) {
    return 1;
  }
  seen.add(node as object);

  const infoWord = (node.info || '').trim().split(/\s+/)[0] || '';
  const parsed = parseInfoString(infoWord);

  if (parsed.lineWrap) {
    cache.set(node as object, null);
    return null;
  }

  if (parsed.lineNumber !== null) {
    cache.set(node as object, parsed.lineNumber);
    return parsed.lineNumber;
  }

  if (!parsed.continueLineNumber) {
    cache.set(node as object, null);
    return null;
  }

  const prevCodeBlock = findPreviousCodeBlock(node);

  if (!prevCodeBlock) {
    cache.set(node as object, 1);
    return 1;
  }

  const prevStart = resolveLineNumberInternal(prevCodeBlock, cache, seen);

  if (prevStart === null) {
    cache.set(node as object, 1);
    return 1;
  }

  const resolved = prevStart + getCodeBlockLineCount(prevCodeBlock.literal);

  cache.set(node as object, resolved);
  return resolved;
}

function resolveLineNumber(node: CodeBlockMdNode, parsedInfo: ReturnType<typeof parseInfoString>) {
  if (!parsedInfo.continueLineNumber) {
    return parsedInfo.lineNumber;
  }

  return resolveLineNumberInternal(node, new WeakMap<object, number | null>(), new WeakSet());
}

export function getHTMLRenderers(prism: PrismJs) {
  return {
    codeBlock(node: MdNode): HTMLToken[] {
      const { fenceLength, info } = node as CodeBlockMdNode;
      const infoWords = info ? info.split(/\s+/) : [];
      const preClasses: string[] = [];
      const codeAttrs: Record<string, any> = {};
      const preAttrs: Record<string, any> = {};
      let lineNumber: number | null = null;

      if (fenceLength > BACKTICK_COUNT) {
        codeAttrs['data-backticks'] = fenceLength;
      }

      let content = node.literal!;

      if (infoWords.length && infoWords[0].length) {
        const parsed = parseInfoString(infoWords[0]);
        const { lang } = parsed;

        lineNumber = resolveLineNumber(node as CodeBlockMdNode, parsed);

        if (parsed.lineWrap) {
          preClasses.push('line-wrap');
          preAttrs['data-line-wrap'] = 'true';
          codeAttrs['data-line-wrap'] = 'true';
          lineNumber = null;
        }

        if (lang) {
          preClasses.push(`lang-${lang}`);
          codeAttrs['data-language'] = lang;
        }

        const registeredLang = lang ? prism.languages[lang] : null;

        if (registeredLang && lang && !parsed.lineWrap) {
          content = prism.highlight(node.literal!, registeredLang, lang);
        }
      }

      if (lineNumber !== null) {
        const lineCount = getCodeBlockLineCount(node.literal);
        const gutterText = buildGutterHTML(lineNumber, lineCount);

        preClasses.push('line-numbers');
        preAttrs['data-line-numbers'] = gutterText;
      }

      return [
        { type: 'openTag', tagName: 'pre', classNames: preClasses, attributes: preAttrs },
        { type: 'openTag', tagName: 'code', attributes: codeAttrs },
        { type: 'html', content },
        { type: 'closeTag', tagName: 'code' },
        { type: 'closeTag', tagName: 'pre' },
      ];
    },
  };
}
