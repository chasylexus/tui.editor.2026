/**
 * @fileoverview Implements abc music notation plugin (HedgeDoc-like behavior)
 */
import * as ABCJS from 'abcjs';
import type { MdNode, PluginContext, PluginInfo } from '@techie_doubts/tui.editor.2026';
import type { HTMLToken } from '@techie_doubts/toastmark';

export interface PluginOptions {
  className?: string;
  renderOptions?: Record<string, unknown>;
}

const DEFAULT_CLASS_NAME = 'toastui-abc';
let styleInjected = false;

function escapeHtml(s: string) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function ensureAbcStyles() {
  if (styleInjected || typeof document === 'undefined') return;

  const style = document.createElement('style');

  style.setAttribute('data-toastui-abc-theme', '1');
  style.textContent = `
.abc {
  text-align: center;
  white-space: inherit;
}

.abc > svg {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 0 auto;
}
  `.trim();

  document.head.appendChild(style);
  styleInjected = true;
}

function findContentsRoot(root: HTMLElement | null) {
  if (!root) return null;

  return root.querySelector<HTMLElement>('.toastui-editor-contents') || root;
}

function createAbcTokens(code: string, className: string): HTMLToken[] {
  const escaped = escapeHtml(code);
  const source = escapeHtml(encodeURIComponent(code));
  const html = `<div class="abc ${className}" data-abc="1" data-abc-rendered="0" data-abc-source="${source}">${escaped}</div>`;

  return [
    { type: 'openTag', tagName: 'div', outerNewLine: true },
    { type: 'html', content: html },
    { type: 'closeTag', tagName: 'div', outerNewLine: true },
  ];
}

function readSource(el: HTMLElement) {
  const encoded = el.getAttribute('data-abc-source');

  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch (e) {
      return encoded;
    }
  }

  return el.textContent || '';
}

function applySvgSizing(el: HTMLElement) {
  const svgList = Array.from(el.querySelectorAll<SVGElement>(':scope > svg'));

  svgList.forEach((svg) => {
    const widthAttr = svg.getAttribute('width') || '0';
    const heightAttr = svg.getAttribute('height') || '0';
    const width = Number.parseFloat(widthAttr);
    const height = Number.parseFloat(heightAttr);

    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    }
  });
}

function renderOneAbc(el: HTMLElement, renderOptions?: Record<string, unknown>) {
  const source = readSource(el);

  if (!source.trim()) {
    el.setAttribute('data-abc-rendered', '1');
    return;
  }

  try {
    el.innerHTML = '';
    (ABCJS as any).renderAbc(el, source, {
      ...(renderOptions || {}),
    });
    applySvgSizing(el);
    el.setAttribute('data-abc-rendered', '1');
  } catch (err) {
    const message = (err as Error)?.message || String(err);

    el.innerHTML = `<div class="toastui-abc-error">${escapeHtml(message)}</div>`;
    el.setAttribute('data-abc-rendered', '0');
    // eslint-disable-next-line no-console
    console.warn('ABC render failed:', err);
  }
}

function renderAbcIn(
  rootEl: HTMLElement | null,
  force: boolean,
  renderOptions?: Record<string, unknown>
) {
  if (!rootEl) return;

  const allNodes = Array.from(rootEl.querySelectorAll<HTMLElement>('.abc[data-abc="1"]'));
  const nodes = force ? allNodes : allNodes.filter((node) => node.dataset.abcRendered !== '1');

  if (!nodes.length) return;

  nodes.forEach((node) => renderOneAbc(node, renderOptions));
}

function makeScheduler(
  getRoots: () => { previewRoot: HTMLElement | null; wysiwygRoot: HTMLElement | null },
  renderOptions?: Record<string, unknown>
) {
  let scheduled = false;
  let forceRerender = false;

  const schedule = (force = false) => {
    forceRerender = forceRerender || force;

    if (scheduled) {
      return;
    }

    scheduled = true;

    requestAnimationFrame(() => {
      scheduled = false;

      const { previewRoot, wysiwygRoot } = getRoots();
      const forceRender = forceRerender;

      forceRerender = false;

      renderAbcIn(previewRoot, forceRender, renderOptions);
      renderAbcIn(wysiwygRoot, forceRender, renderOptions);
    });
  };

  return { schedule };
}

export default function abcPlugin(context: PluginContext, options: PluginOptions = {}): PluginInfo {
  ensureAbcStyles();

  const { className = DEFAULT_CLASS_NAME, renderOptions } = options;
  const instance = context.instance as any;

  const getRoots = () => {
    const elements = instance.getEditorElements?.();

    return {
      previewRoot: findContentsRoot((elements?.mdPreview || null) as HTMLElement | null),
      wysiwygRoot: findContentsRoot((elements?.wwEditor || null) as HTMLElement | null),
    };
  };
  const scheduler = makeScheduler(getRoots, renderOptions);

  context.eventEmitter.listen('change', () => scheduler.schedule());
  context.eventEmitter.listen('changeMode', () => scheduler.schedule(true));
  context.eventEmitter.listen('load', () => scheduler.schedule(true));
  context.eventEmitter.listen('loadUI', () => scheduler.schedule(true));
  context.eventEmitter.listen('afterPreviewRender', () => scheduler.schedule(true));
  context.eventEmitter.listen('changeTheme', () => scheduler.schedule(true));

  return {
    toHTMLRenderers: {
      abc(node: MdNode) {
        return createAbcTokens(node.literal || '', className);
      },
    },
  };
}
