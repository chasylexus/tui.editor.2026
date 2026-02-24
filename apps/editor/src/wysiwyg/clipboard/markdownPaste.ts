const STRUCTURAL_MARKDOWN_PATTERNS = [
  /^\s{0,3}#{1,6}\s+/m,
  /^\s{0,3}>\s+/m,
  /^\s{0,3}([-*+])\s+/m,
  /^\s{0,3}\d+[.)]\s+/m,
  /^\s{0,3}[-*_]{3,}\s*$/m,
  /^\s{0,3}[-*]\s\[[ xX]\]\s+/m,
  /```[\s\S]*```/m,
  /^\s*\|.+\|\s*$/m,
];

const INLINE_MARKDOWN_PATTERNS = [
  /!\[[^\]]*]\([^)]+\)/,
  /\[[^\]]+]\([^)]+\)/,
  /`[^`\n]+`/,
  /~~[^~\n]+~~/,
  /(\*\*|__)[^*_]+(\*\*|__)/,
];

export function looksLikeMarkdownPaste(text: string) {
  if (typeof text !== 'string') {
    return false;
  }

  const normalized = text.replace(/\r\n/g, '\n').trim();

  if (!normalized) {
    return false;
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
