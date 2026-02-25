import { MdNode, CodeBlockMdNode } from '@techie_doubts/toastmark';

const LINE_INFO_RE = /^(.+?)=(\d+|\+)?$/;

export interface ParsedCodeBlockInfo {
  language: string | null;
  normalizedLanguage: string;
  lineNumber: number | null;
  continueLineNumber: boolean;
  lineWrap: boolean;
}

function getInfoWord(info: string | null | undefined) {
  return String(info || '')
    .trim()
    .split(/\s+/)[0];
}

export function parseCodeBlockInfo(info: string | null | undefined): ParsedCodeBlockInfo {
  const infoWord = getInfoWord(info);

  if (!infoWord) {
    return {
      language: null,
      normalizedLanguage: '',
      lineNumber: null,
      continueLineNumber: false,
      lineWrap: false,
    };
  }

  if (infoWord === '!') {
    return {
      language: null,
      normalizedLanguage: '',
      lineNumber: null,
      continueLineNumber: false,
      lineWrap: true,
    };
  }

  const match = infoWord.match(LINE_INFO_RE);
  let language = infoWord;
  let lineNumber: number | null = null;
  let continueLineNumber = false;

  if (match) {
    language = match[1];

    if (match[2] === '+') {
      continueLineNumber = true;
    } else {
      lineNumber = match[2] ? Number(match[2]) : 1;
    }
  }

  return {
    language,
    normalizedLanguage: language.trim().toLowerCase(),
    lineNumber,
    continueLineNumber,
    lineWrap: false,
  };
}

export function getCodeBlockLineCount(literal: string | null | undefined) {
  return String(literal || '')
    .replace(/\n$/, '')
    .split('\n').length;
}

function findPreviousCodeBlock(node: MdNode | null | undefined) {
  let cursor = (node?.prev || null) as MdNode | null;

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

  const parsed = parseCodeBlockInfo(node.info);

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

  const prevStartLine = resolveLineNumberInternal(prevCodeBlock, cache, seen);

  if (prevStartLine === null) {
    cache.set(node as object, 1);
    return 1;
  }

  const resolved = prevStartLine + getCodeBlockLineCount(prevCodeBlock.literal);

  cache.set(node as object, resolved);
  return resolved;
}

export function resolveCodeBlockLineNumber(
  node: CodeBlockMdNode,
  parsedInfo?: ParsedCodeBlockInfo
): number | null {
  const parsed = parsedInfo || parseCodeBlockInfo(node.info);

  if (!parsed.continueLineNumber) {
    return parsed.lineNumber;
  }

  return resolveLineNumberInternal(node, new WeakMap<object, number | null>(), new WeakSet());
}
