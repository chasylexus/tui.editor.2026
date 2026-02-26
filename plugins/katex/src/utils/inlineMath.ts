import katex from 'katex';
import type { MdNode } from '@techie_doubts/tui.editor.2026';

function escapeHtml(s: string) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderKatexBlock(latex: string) {
  try {
    return katex.renderToString(String(latex || '').trim(), {
      displayMode: true,
      throwOnError: false,
      strict: 'ignore',
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';

    return `<pre class="katex-error">KaTeX error: ${escapeHtml(message)}</pre>`;
  }
}

export function renderKatexInline(latex: string) {
  try {
    return katex.renderToString(String(latex || '').trim(), {
      displayMode: false,
      throwOnError: false,
      strict: 'ignore',
      output: 'html',
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';

    return `<span class="katex-error">KaTeX error: ${escapeHtml(message)}</span>`;
  }
}

const INLINE_MATH_PROTECTED_MAP: Record<string, string> = {
  '\\': '\uE000',
  '^': '\uE001',
  _: '\uE002',
  '*': '\uE003',
  '~': '\uE004',
  '`': '\uE005',
  '[': '\uE006',
  ']': '\uE007',
  '(': '\uE008',
  ')': '\uE009',
  '!': '\uE00A',
  '<': '\uE00B',
  '>': '\uE00C',
};

const INLINE_MATH_RESTORE_MAP = Object.entries(INLINE_MATH_PROTECTED_MAP).reduce<
  Record<string, string>
>((acc, [key, value]) => {
  acc[value] = key;
  return acc;
}, {});

function shouldOpenInlineMathAt(text: string, index: number) {
  const next = text[index + 1];

  return !isEscapedAt(text, index) && next !== '$' && !isInlineMathWhitespace(next);
}

function shouldCloseInlineMathAt(text: string, index: number, segment: string) {
  if (isEscapedAt(text, index)) {
    return false;
  }

  const prev = segment[segment.length - 1];
  const next = text[index + 1];

  return !isInlineMathWhitespace(prev) && !isDigit(next);
}

function protectInlineMathChar(ch: string) {
  return INLINE_MATH_PROTECTED_MAP[ch] || ch;
}

function restoreInlineMathChar(ch: string) {
  return INLINE_MATH_RESTORE_MAP[ch] || ch;
}

export function protectInlineMathForParser(markdown: string) {
  if (!markdown || !markdown.includes('$')) {
    return markdown;
  }

  let out = '';
  let inInlineMath = false;
  let rawSegment = '';
  let protectedSegment = '';

  for (let i = 0; i < markdown.length; i += 1) {
    const ch = markdown[i];

    if (ch !== '$') {
      if (inInlineMath) {
        rawSegment += ch;
        protectedSegment += protectInlineMathChar(ch);
      } else {
        out += ch;
      }

      continue;
    }

    if (!inInlineMath) {
      if (shouldOpenInlineMathAt(markdown, i)) {
        inInlineMath = true;
        rawSegment = '';
        protectedSegment = '';
        out += '$';
        continue;
      }

      out += '$';
      continue;
    }

    if (shouldCloseInlineMathAt(markdown, i, rawSegment)) {
      out += `${protectedSegment}$`;
      inInlineMath = false;
      rawSegment = '';
      protectedSegment = '';
      continue;
    }

    rawSegment += '$';
    protectedSegment += '$';
  }

  if (inInlineMath) {
    out += rawSegment;
  }

  return out;
}

export function restoreInlineMathProtectedChars(text: string) {
  if (!text) {
    return text;
  }

  let out = '';

  for (let i = 0; i < text.length; i += 1) {
    out += restoreInlineMathChar(text[i]);
  }

  return out;
}

export function fixInlineMathBackslashes(markdown: string) {
  if (!markdown || !markdown.includes('$')) return markdown;

  let out = '';
  let inInlineMath = false;
  let inFence = false;
  let fenceChar = '';
  let fenceLen = 0;
  let inlineCodeLen = 0;
  let lineStart = true;

  for (let i = 0; i < markdown.length; i += 1) {
    const ch = markdown[i];
    const next = markdown[i + 1];
    const prev = i > 0 ? markdown[i - 1] : '';

    if (lineStart && !inInlineMath && inlineCodeLen === 0) {
      if ((ch === '`' || ch === '~') && next === ch && markdown[i + 2] === ch) {
        let len = 3;

        while (markdown[i + len] === ch) len += 1;

        const marker = markdown.slice(i, i + len);

        if (!inFence) {
          inFence = true;
          fenceChar = ch;
          fenceLen = len;
        } else if (ch === fenceChar && len >= fenceLen) {
          inFence = false;
          fenceChar = '';
          fenceLen = 0;
        }

        out += marker;
        i += len - 1;
        continue;
      }
    }

    if (!inFence) {
      if (ch === '`') {
        let len = 1;

        while (markdown[i + len] === '`') len += 1;

        if (inlineCodeLen === 0) {
          inlineCodeLen = len;
        } else if (inlineCodeLen === len) {
          inlineCodeLen = 0;
        }

        out += markdown.slice(i, i + len);
        i += len - 1;
        lineStart = false;
        continue;
      }
    }

    if (!inFence && inlineCodeLen === 0) {
      if (!inInlineMath) {
        if (ch === '$' && prev !== '\\' && next !== '$') {
          inInlineMath = true;
          out += '$';
          lineStart = false;
          continue;
        }
      } else {
        if (ch === '$' && prev !== '\\') {
          inInlineMath = false;
          out += '$';
          lineStart = false;
          continue;
        }

        if (ch === '\\' && prev !== '\\') {
          let runLen = 1;

          while (markdown[i + runLen] === '\\') {
            runLen += 1;
          }

          if (runLen >= 3) {
            const afterRun = markdown[i + runLen];
            const isLinebreakLike =
              runLen % 2 === 1 &&
              (typeof afterRun === 'undefined' || isInlineMathWhitespace(afterRun));

            if (isLinebreakLike) {
              out += '\\'.repeat(runLen - 1);
              i += runLen - 1;
              lineStart = false;
              continue;
            }
          }
        }

        if (ch === '\\' && next === '\\' && /[A-Za-z]/.test(markdown[i + 2]) && prev !== '\\') {
          out += '\\';
          i += 1;
          lineStart = false;
          continue;
        }
      }
    }

    out += ch;
    lineStart = ch === '\n';
  }

  return out;
}

function isEscapedAt(text: string, index: number) {
  let backslashCount = 0;

  for (let i = index - 1; i >= 0 && text[i] === '\\'; i -= 1) {
    backslashCount += 1;
  }

  return backslashCount % 2 === 1;
}

export function normalizeInlineMathEscapes(markdown: string) {
  if (!markdown || !markdown.includes('$') || !markdown.includes('\\_')) return markdown;

  let out = '';
  let inFence = false;
  let fenceChar = '';
  let fenceLen = 0;
  let inlineCodeLen = 0;
  let lineStart = true;
  let inDoubleMath = false;

  for (let i = 0; i < markdown.length; i += 1) {
    const ch = markdown[i];
    const next = markdown[i + 1];

    if (lineStart && !inDoubleMath && inlineCodeLen === 0) {
      if ((ch === '`' || ch === '~') && next === ch && markdown[i + 2] === ch) {
        let len = 3;

        while (markdown[i + len] === ch) len += 1;

        const marker = markdown.slice(i, i + len);

        if (!inFence) {
          inFence = true;
          fenceChar = ch;
          fenceLen = len;
        } else if (ch === fenceChar && len >= fenceLen) {
          inFence = false;
          fenceChar = '';
          fenceLen = 0;
        }

        out += marker;
        i += len - 1;
        continue;
      }
    }

    if (!inFence && !inDoubleMath) {
      if (ch === '`') {
        let len = 1;

        while (markdown[i + len] === '`') len += 1;

        if (inlineCodeLen === 0) {
          inlineCodeLen = len;
        } else if (inlineCodeLen === len) {
          inlineCodeLen = 0;
        }

        out += markdown.slice(i, i + len);
        i += len - 1;
        lineStart = false;
        continue;
      }
    }

    if (!inFence && inlineCodeLen === 0) {
      if (ch === '$' && !isEscapedAt(markdown, i)) {
        if (next === '$') {
          inDoubleMath = !inDoubleMath;
          out += '$$';
          i += 1;
          lineStart = false;
          continue;
        }

        out += '$';
        lineStart = false;

        i += 1;
        let inner = '';
        let closed = false;

        for (; i < markdown.length; i += 1) {
          const innerCh = markdown[i];

          if (innerCh === '$' && !isEscapedAt(markdown, i)) {
            closed = true;
            break;
          }

          inner += innerCh;
        }

        if (!closed) {
          out += inner;
          i -= 1;
          continue;
        }

        if (inner.includes('\\_')) {
          inner = inner.replaceAll('\\_', '_');
        }

        out += `${inner}$`;
        continue;
      }
    }

    out += ch;
    lineStart = ch === '\n';
  }

  return out;
}

interface InlineMathNodeOutput {
  content: string;
  isHTML: boolean;
}

const parentInlineMathCache = new WeakMap<MdNode, Map<MdNode, InlineMathNodeOutput>>();

function isInlineMathWhitespace(ch?: string) {
  return ch === ' ' || ch === '\t' || ch === '\n';
}

function isDigit(ch?: string) {
  return !!ch && ch >= '0' && ch <= '9';
}

function getOrCreateNodeOutput(
  nodeOutputs: Map<MdNode, InlineMathNodeOutput>,
  node: MdNode
): InlineMathNodeOutput {
  const cached = nodeOutputs.get(node);

  if (cached) {
    return cached;
  }

  const output: InlineMathNodeOutput = { content: '', isHTML: false };

  nodeOutputs.set(node, output);

  return output;
}

function appendText(nodeOutputs: Map<MdNode, InlineMathNodeOutput>, node: MdNode, text: string) {
  if (!text) {
    return;
  }

  getOrCreateNodeOutput(nodeOutputs, node).content += text;
}

function appendHTML(nodeOutputs: Map<MdNode, InlineMathNodeOutput>, node: MdNode, html: string) {
  if (!html) {
    return;
  }

  const output = getOrCreateNodeOutput(nodeOutputs, node);

  output.content += html;
  output.isHTML = true;
}

interface InlineMathParserState {
  nodeOutputs: Map<MdNode, InlineMathNodeOutput>;
  inInlineMath: boolean;
  inlineMathBuffer: string;
  inlineStartNode: MdNode | null;
}

function processOpeningInlineMathMarker(
  state: InlineMathParserState,
  node: MdNode,
  text: string,
  currentIndex: number,
  markerIndex: number
) {
  const next = text[markerIndex + 1];

  if (isEscapedAt(text, markerIndex) || next === '$' || isInlineMathWhitespace(next)) {
    appendText(state.nodeOutputs, node, text.slice(currentIndex, markerIndex + 1));

    return markerIndex + 1;
  }

  appendText(state.nodeOutputs, node, text.slice(currentIndex, markerIndex));
  state.inInlineMath = true;
  state.inlineMathBuffer = '';
  state.inlineStartNode = node;

  return markerIndex + 1;
}

function processClosingInlineMathMarker(
  state: InlineMathParserState,
  node: MdNode,
  text: string,
  currentIndex: number,
  markerIndex: number
) {
  if (isEscapedAt(text, markerIndex)) {
    state.inlineMathBuffer += text.slice(currentIndex, markerIndex + 1);

    return markerIndex + 1;
  }

  const prevChar =
    markerIndex > currentIndex
      ? text[markerIndex - 1]
      : state.inlineMathBuffer[state.inlineMathBuffer.length - 1];
  const next = text[markerIndex + 1];

  if (isInlineMathWhitespace(prevChar) || isDigit(next)) {
    state.inlineMathBuffer += text.slice(currentIndex, markerIndex + 1);

    return markerIndex + 1;
  }

  state.inlineMathBuffer += text.slice(currentIndex, markerIndex);
  appendHTML(state.nodeOutputs, node, renderKatexInline(state.inlineMathBuffer));
  state.inInlineMath = false;
  state.inlineMathBuffer = '';
  state.inlineStartNode = null;

  return markerIndex + 1;
}

function parseInlineMathTextNode(state: InlineMathParserState, node: MdNode) {
  const text = node.literal || '';
  let index = 0;

  // Ensure consumed math-only text nodes do not fall back to raw literal output.
  getOrCreateNodeOutput(state.nodeOutputs, node);

  while (index < text.length) {
    const markerIndex = text.indexOf('$', index);

    if (markerIndex === -1) {
      if (state.inInlineMath) {
        state.inlineMathBuffer += text.slice(index);
      } else {
        appendText(state.nodeOutputs, node, text.slice(index));
      }

      break;
    }

    if (state.inInlineMath) {
      index = processClosingInlineMathMarker(state, node, text, index, markerIndex);
      continue;
    }

    index = processOpeningInlineMathMarker(state, node, text, index, markerIndex);
  }
}

function parseInlineMathForParent(parent: MdNode): Map<MdNode, InlineMathNodeOutput> {
  const state: InlineMathParserState = {
    nodeOutputs: new Map<MdNode, InlineMathNodeOutput>(),
    inInlineMath: false,
    inlineMathBuffer: '',
    inlineStartNode: null,
  };
  let child = (parent.firstChild as MdNode) || null;

  while (child) {
    if (child.type === 'text') {
      parseInlineMathTextNode(state, child);
    } else if (child.type === 'softbreak') {
      if (state.inInlineMath) {
        state.inlineMathBuffer += '\n';
        getOrCreateNodeOutput(state.nodeOutputs, child);
      } else {
        appendHTML(state.nodeOutputs, child, '<br>\n');
      }
    }

    child = (child.next as MdNode) || null;
  }

  if (state.inInlineMath && state.inlineStartNode) {
    appendText(state.nodeOutputs, state.inlineStartNode, `$${state.inlineMathBuffer}`);
  }

  parentInlineMathCache.set(parent, state.nodeOutputs);

  return state.nodeOutputs;
}

function getInlineMathNodeOutput(node: MdNode): InlineMathNodeOutput {
  const parent = (node?.parent as MdNode) || null;

  if (!parent) {
    if (node.type === 'softbreak') {
      return { content: '<br>\n', isHTML: true };
    }

    return { content: node?.literal || '', isHTML: false };
  }

  const nodeOutputs = parentInlineMathCache.get(parent) || parseInlineMathForParent(parent);
  const output = nodeOutputs.get(node);

  if (output) {
    return output;
  }

  if (node.type === 'softbreak') {
    return { content: '<br>\n', isHTML: true };
  }

  return { content: node?.literal || '', isHTML: false };
}

export function getInlineMath(node: MdNode) {
  return getInlineMathNodeOutput(node).content;
}

export function getInlineMathRenderedOutput(node: MdNode) {
  return getInlineMathNodeOutput(node);
}
