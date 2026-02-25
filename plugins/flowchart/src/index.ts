/**
 * @fileoverview Implements flowchart plugin (HedgeDoc-like behavior)
 */
import Raphael from 'raphael';
import flowchart from 'flowchart.js';
import type { MdNode, PluginContext, PluginInfo } from '@techie_doubts/tui.editor.2026';
import type { HTMLToken } from '@techie_doubts/toastmark';

export interface PluginOptions {
  className?: string;
  drawOptions?: Record<string, unknown>;
  darkDrawOptions?: Record<string, unknown>;
}

const DEFAULT_CLASS_NAME = 'toastui-flowchart';
const DEFAULT_DRAW_OPTIONS = {
  'line-width': 2,
  fill: 'none',
  'font-size': 16,
  'font-family': "'Andale Mono', monospace",
};
const DARK_TEXT_COLOR = '#f3f4f6';
const DARK_LINE_COLOR = '#f3f4f6';
const DARK_DRAW_OPTIONS = {
  'font-color': DARK_TEXT_COLOR,
  'line-color': DARK_LINE_COLOR,
  'element-color': DARK_LINE_COLOR,
  fill: 'none',
};
let styleInjected = false;

function escapeHtml(s: string) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function ensureRaphaelGlobal() {
  if (typeof globalThis !== 'undefined') {
    (globalThis as any).Raphael = Raphael;
  }
}

function ensureFlowchartStyles() {
  if (styleInjected || typeof document === 'undefined') return;

  const style = document.createElement('style');

  style.setAttribute('data-toastui-flowchart-theme', '1');
  style.textContent = `
.flow-chart {
  text-align: center;
  white-space: inherit;
}

.flow-chart > svg {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 0 auto;
}

.toastui-editor-dark .flow-chart > svg text,
.td-editor-dark .flow-chart > svg text,
body.dark .flow-chart > svg text {
  fill: ${DARK_TEXT_COLOR} !important;
}

.toastui-editor-dark .flow-chart > svg tspan,
.td-editor-dark .flow-chart > svg tspan,
body.dark .flow-chart > svg tspan {
  fill: ${DARK_TEXT_COLOR} !important;
}

.toastui-editor-dark .flow-chart > svg rect,
.toastui-editor-dark .flow-chart > svg polygon,
.toastui-editor-dark .flow-chart > svg ellipse,
.td-editor-dark .flow-chart > svg rect,
.td-editor-dark .flow-chart > svg polygon,
.td-editor-dark .flow-chart > svg ellipse,
body.dark .flow-chart > svg rect,
body.dark .flow-chart > svg polygon,
body.dark .flow-chart > svg ellipse {
  fill: none !important;
  stroke: ${DARK_LINE_COLOR} !important;
}

.toastui-editor-dark .flow-chart > svg path,
.td-editor-dark .flow-chart > svg path,
body.dark .flow-chart > svg path {
  stroke: ${DARK_LINE_COLOR} !important;
}

.toastui-editor-dark .flow-chart > svg marker path,
.toastui-editor-dark .flow-chart > svg marker use,
.td-editor-dark .flow-chart > svg marker path,
.td-editor-dark .flow-chart > svg marker use,
body.dark .flow-chart > svg marker path,
body.dark .flow-chart > svg marker use {
  stroke: ${DARK_LINE_COLOR} !important;
  fill: ${DARK_LINE_COLOR} !important;
}

.toastui-editor-dark .flow-chart > svg [stroke="#000000"],
.toastui-editor-dark .flow-chart > svg [stroke="#000"],
.toastui-editor-dark .flow-chart > svg [stroke="black"],
.toastui-editor-dark .flow-chart > svg [stroke="rgb(0,0,0)"],
.td-editor-dark .flow-chart > svg [stroke="#000000"],
.td-editor-dark .flow-chart > svg [stroke="#000"],
.td-editor-dark .flow-chart > svg [stroke="black"],
.td-editor-dark .flow-chart > svg [stroke="rgb(0,0,0)"],
body.dark .flow-chart > svg [stroke="#000000"],
body.dark .flow-chart > svg [stroke="#000"],
body.dark .flow-chart > svg [stroke="black"] {
  stroke: ${DARK_LINE_COLOR} !important;
}

.toastui-editor-dark .flow-chart > svg [stroke]:not([stroke="none"]),
.td-editor-dark .flow-chart > svg [stroke]:not([stroke="none"]),
body.dark .flow-chart > svg [stroke]:not([stroke="none"]) {
  stroke: ${DARK_LINE_COLOR} !important;
}
  `.trim();

  document.head.appendChild(style);
  styleInjected = true;
}

function findContentsRoot(root: HTMLElement | null) {
  if (!root) return null;

  return root.querySelector<HTMLElement>('.toastui-editor-contents') || root;
}

function createFlowchartTokens(code: string, className: string): HTMLToken[] {
  const escaped = escapeHtml(code);
  const source = escapeHtml(encodeURIComponent(code));
  const html = `<div class="flow-chart ${className}" data-flowchart="1" data-flowchart-rendered="0" data-flowchart-source="${source}">${escaped}</div>`;

  return [
    { type: 'openTag', tagName: 'div', outerNewLine: true },
    { type: 'html', content: html },
    { type: 'closeTag', tagName: 'div', outerNewLine: true },
  ];
}

function readSource(el: HTMLElement) {
  const encoded = el.getAttribute('data-flowchart-source');

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
  const svg = el.querySelector<SVGElement>(':scope > svg') || el.querySelector<SVGElement>('svg');

  if (!svg) return;

  const widthAttr = svg.getAttribute('width') || '0';
  const heightAttr = svg.getAttribute('height') || '0';
  const width = Number.parseFloat(widthAttr);
  const height = Number.parseFloat(heightAttr);

  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  }
}

function isDarkMode(el: HTMLElement) {
  const themeRoot = el.closest('.toastui-editor-defaultUI, .td-editor-defaultUI');

  if (themeRoot) {
    return (
      themeRoot.classList.contains('toastui-editor-dark') ||
      themeRoot.classList.contains('td-editor-dark')
    );
  }

  return !!document.body?.classList.contains('dark');
}

function resolveDrawOptions(
  drawOptions?: Record<string, unknown>,
  darkDrawOptions?: Record<string, unknown>,
  darkMode?: boolean | null
) {
  const resolved = { ...DEFAULT_DRAW_OPTIONS };

  if (darkMode) {
    Object.assign(resolved, DARK_DRAW_OPTIONS);
  }

  Object.assign(resolved, drawOptions || {});

  if (darkMode) {
    Object.assign(resolved, darkDrawOptions || {});
  }

  return resolved;
}

function renderOneFlowchart(
  el: HTMLElement,
  drawOptions?: Record<string, unknown>,
  darkDrawOptions?: Record<string, unknown>,
  themeOverride?: boolean | null
) {
  const source = readSource(el);
  const darkMode = typeof themeOverride === 'boolean' ? themeOverride : isDarkMode(el);

  if (!source.trim()) {
    el.setAttribute('data-flowchart-rendered', '1');
    return;
  }

  try {
    const chart = flowchart.parse(source);

    el.innerHTML = '';
    chart.drawSVG(el, {
      ...resolveDrawOptions(drawOptions, darkDrawOptions, darkMode),
    });
    applySvgSizing(el);
    el.setAttribute('data-flowchart-rendered', '1');
  } catch (err) {
    const message = (err as Error)?.message || String(err);

    el.innerHTML = `<div class="toastui-flowchart-error">${escapeHtml(message)}</div>`;
    el.setAttribute('data-flowchart-rendered', '0');
    // eslint-disable-next-line no-console
    console.warn('Flowchart render failed:', err);
  }
}

function renderFlowchartIn(
  rootEl: HTMLElement | null,
  force: boolean,
  drawOptions?: Record<string, unknown>,
  darkDrawOptions?: Record<string, unknown>,
  themeOverride?: boolean | null
) {
  if (!rootEl) return;

  const allNodes = Array.from(
    rootEl.querySelectorAll<HTMLElement>('.flow-chart[data-flowchart="1"]')
  );
  const nodes = force
    ? allNodes
    : allNodes.filter((node) => node.dataset.flowchartRendered !== '1');

  if (!nodes.length) return;

  nodes.forEach((node) => renderOneFlowchart(node, drawOptions, darkDrawOptions, themeOverride));
}

function makeScheduler(
  getRoots: () => { previewRoot: HTMLElement | null; wysiwygRoot: HTMLElement | null },
  drawOptions?: Record<string, unknown>,
  darkDrawOptions?: Record<string, unknown>
) {
  let scheduled = false;
  let forceRerender = false;
  let pendingThemeOverride: boolean | null = null;

  const schedule = ({
    force = false,
    themeOverride,
  }: { force?: boolean; themeOverride?: unknown } = {}) => {
    forceRerender = forceRerender || force;
    if (themeOverride === 'dark' || themeOverride === true) {
      pendingThemeOverride = true;
    } else if (themeOverride === 'light' || themeOverride === false) {
      pendingThemeOverride = false;
    }

    if (scheduled) {
      return;
    }

    scheduled = true;

    requestAnimationFrame(() => {
      scheduled = false;

      const { previewRoot, wysiwygRoot } = getRoots();
      const forceRender = forceRerender;
      const resolvedThemeOverride = pendingThemeOverride;

      forceRerender = false;
      pendingThemeOverride = null;

      renderFlowchartIn(
        previewRoot,
        forceRender,
        drawOptions,
        darkDrawOptions,
        resolvedThemeOverride
      );
      renderFlowchartIn(
        wysiwygRoot,
        forceRender,
        drawOptions,
        darkDrawOptions,
        resolvedThemeOverride
      );
    });
  };

  return { schedule };
}

export default function flowchartPlugin(
  context: PluginContext,
  options: PluginOptions = {}
): PluginInfo {
  ensureRaphaelGlobal();
  ensureFlowchartStyles();

  const { className = DEFAULT_CLASS_NAME, drawOptions, darkDrawOptions } = options;
  const instance = context.instance as any;

  const getRoots = () => {
    const elements = instance.getEditorElements?.();

    return {
      previewRoot: findContentsRoot((elements?.mdPreview || null) as HTMLElement | null),
      wysiwygRoot: findContentsRoot((elements?.wwEditor || null) as HTMLElement | null),
    };
  };
  const scheduler = makeScheduler(getRoots, drawOptions, darkDrawOptions);

  context.eventEmitter.listen('change', () => scheduler.schedule());
  context.eventEmitter.listen('changeMode', () => scheduler.schedule({ force: true }));
  context.eventEmitter.listen('load', () => scheduler.schedule({ force: true }));
  context.eventEmitter.listen('loadUI', () => scheduler.schedule({ force: true }));
  context.eventEmitter.listen('afterPreviewRender', () => scheduler.schedule({ force: true }));
  context.eventEmitter.listen('changeTheme', (theme: unknown) =>
    scheduler.schedule({ force: true, themeOverride: theme })
  );

  return {
    toHTMLRenderers: {
      flow(node: MdNode) {
        return createFlowchartTokens(node.literal || '', className);
      },
      flowchart(node: MdNode) {
        return createFlowchartTokens(node.literal || '', className);
      },
    },
  };
}
