import katex from 'katex';
import type { MdNode } from '@toast-ui/editor';

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

let latexPart = '';
let ifEntering = false;
let ifEven = true;
let lastUncloseNode: MdNode | null = null;

export function getInlineMath(node: MdNode) {
  let noNeedNewLine = false;
  let str = node?.literal || '';
  let prevIdx = 0;
  let nextIdx = -1;
  const ifLastNode = node?.next === null;
  let count = 0;

  if (node && node === node?.parent?.firstChild) {
    let n: MdNode | null = node;

    while (n !== null) {
      const lit = n?.literal || '';

      for (let i = 0; i < lit.length; i += 1) {
        if (lit[i] === '$') count += 1;
      }

      lastUncloseNode = count % 2 === 1 ? n : null;
      n = (n?.next as MdNode) || null;
    }

    ifEven = count % 2 === 0;
  }

  let scanning = true;

  while (scanning) {
    prevIdx = str.indexOf('$', prevIdx);
    nextIdx = str.indexOf('$', prevIdx + 1);

    if (ifLastNode && !ifEntering && (prevIdx === -1 || nextIdx === -1)) {
      ifEntering = false;
      latexPart = '';
      scanning = false;
      continue;
    }
    if (ifLastNode && ifEntering && prevIdx === -1) {
      ifEntering = false;
      latexPart = '';
      scanning = false;
      continue;
    }

    if (ifEntering && prevIdx !== -1) {
      latexPart += ` ${str.slice(0, prevIdx)}`;
      const rendered = renderKatexInline(latexPart);

      str = str.replace(str.slice(0, prevIdx + 1), rendered);
      latexPart = '';
      ifEntering = false;
      prevIdx += 1;
      continue;
    }

    if (!ifEntering && prevIdx !== -1 && nextIdx !== -1) {
      if (str[prevIdx + 1] === '$' || str[nextIdx + 1] === '$') {
        prevIdx = nextIdx + 1;
        continue;
      }

      const inside = str.slice(prevIdx + 1, nextIdx);
      const rendered = renderKatexInline(inside);

      str = str.replace(str.slice(prevIdx, nextIdx + 1), rendered);
      prevIdx = nextIdx + 1;
      continue;
    }

    if (!ifLastNode && !ifEntering && prevIdx === -1) {
      scanning = false;
      continue;
    }

    if (!ifLastNode && !ifEntering && prevIdx !== -1 && nextIdx === -1) {
      ifEntering = true;
      latexPart = `${str.slice(prevIdx + 1)} `;
      if (ifEven || !Object.is(node, lastUncloseNode)) {
        str = str.replace(str.slice(prevIdx), '');
        noNeedNewLine = true;
      }
      scanning = false;
      continue;
    }

    if (!ifLastNode && ifEntering && prevIdx === -1) {
      latexPart += ` ${str.slice(0)} `;
      if (ifEven || !Object.is(node, lastUncloseNode)) {
        str = '';
        noNeedNewLine = true;
      }
      scanning = false;
      continue;
    }

    scanning = false;
  }

  if (noNeedNewLine) {
    (node as MdNode).literal = '$';
  }

  return str;
}
