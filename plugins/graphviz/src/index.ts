/**
 * @fileoverview Implements graphviz plugin (HedgeDoc-like behavior)
 */
import Viz from 'viz.js';
import { Module, render } from 'viz.js/full.render.js';
import type { MdNode, PluginContext, PluginInfo } from '@techie_doubts/tui.editor.2026';
import type { HTMLToken } from '@techie_doubts/toastmark';

export interface PluginOptions {
  className?: string;
  renderOptions?: Record<string, unknown>;
  darkThemeAttributes?: GraphvizThemeAttributes;
}

export interface GraphvizThemeAttributes {
  graph?: Record<string, unknown>;
  node?: Record<string, unknown>;
  edge?: Record<string, unknown>;
}

const DEFAULT_CLASS_NAME = 'toastui-graphviz';
const DEFAULT_DARK_THEME_ATTRIBUTES: Required<GraphvizThemeAttributes> = {
  graph: {
    bgcolor: 'transparent',
    color: '#9ca3af',
    fontcolor: '#e5e7eb',
  },
  node: {
    color: '#9ca3af',
    fontcolor: '#e5e7eb',
    fillcolor: 'transparent',
  },
  edge: {
    color: '#9ca3af',
    fontcolor: '#e5e7eb',
  },
};
const DARK_LINE_COLOR = '#9ca3af';
const DARK_TEXT_COLOR = '#e5e7eb';
let styleInjected = false;
let viz: any = null;

function createViz() {
  return new (Viz as any)({ Module, render });
}

function getViz() {
  if (!viz) {
    viz = createViz();
  }

  return viz;
}

function escapeHtml(s: string) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function ensureGraphvizStyles() {
  if (styleInjected || typeof document === 'undefined') return;

  const style = document.createElement('style');

  style.setAttribute('data-toastui-graphviz-theme', '1');
  style.textContent = `
.graphviz {
  text-align: center;
  white-space: inherit;
}

.graphviz > svg {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 0 auto;
}

.toastui-editor-dark .graphviz > svg g.node text,
.td-editor-dark .graphviz > svg g.node text,
body.dark .graphviz > svg g.node text {
  fill: ${DARK_TEXT_COLOR} !important;
}

.toastui-editor-dark .graphviz > svg g.edge text,
.td-editor-dark .graphviz > svg g.edge text,
body.dark .graphviz > svg g.edge text {
  fill: ${DARK_TEXT_COLOR} !important;
}

.toastui-editor-dark .graphviz > svg g.node ellipse,
.toastui-editor-dark .graphviz > svg g.node polygon,
.toastui-editor-dark .graphviz > svg g.node rect,
.toastui-editor-dark .graphviz > svg g.node path,
.td-editor-dark .graphviz > svg g.node ellipse,
.td-editor-dark .graphviz > svg g.node polygon,
.td-editor-dark .graphviz > svg g.node rect,
.td-editor-dark .graphviz > svg g.node path,
body.dark .graphviz > svg g.node ellipse,
body.dark .graphviz > svg g.node polygon,
body.dark .graphviz > svg g.node rect,
body.dark .graphviz > svg g.node path {
  fill: none !important;
  stroke: ${DARK_LINE_COLOR} !important;
}

.toastui-editor-dark .graphviz > svg g.edge path,
.toastui-editor-dark .graphviz > svg g.edge polygon,
.toastui-editor-dark .graphviz > svg g.edge polyline,
.toastui-editor-dark .graphviz > svg g.edge line,
.td-editor-dark .graphviz > svg g.edge path,
.td-editor-dark .graphviz > svg g.edge polygon,
.td-editor-dark .graphviz > svg g.edge polyline,
.td-editor-dark .graphviz > svg g.edge line,
body.dark .graphviz > svg g.edge path,
body.dark .graphviz > svg g.edge polygon {
  stroke: ${DARK_LINE_COLOR} !important;
  fill: ${DARK_LINE_COLOR} !important;
}

.toastui-editor-dark .graphviz > svg g.edge polyline,
.toastui-editor-dark .graphviz > svg g.edge line,
.td-editor-dark .graphviz > svg g.edge polyline,
.td-editor-dark .graphviz > svg g.edge line,
body.dark .graphviz > svg g.edge polyline,
body.dark .graphviz > svg g.edge line {
  stroke: ${DARK_LINE_COLOR} !important;
}

.toastui-editor-dark .graphviz > svg [stroke="#000000"],
.toastui-editor-dark .graphviz > svg [stroke="black"],
.td-editor-dark .graphviz > svg [stroke="#000000"],
.td-editor-dark .graphviz > svg [stroke="black"],
body.dark .graphviz > svg [stroke="#000000"],
body.dark .graphviz > svg [stroke="black"] {
  stroke: ${DARK_LINE_COLOR} !important;
}

.toastui-editor-dark .graphviz > svg [fill="#000000"],
.toastui-editor-dark .graphviz > svg [fill="black"],
.td-editor-dark .graphviz > svg [fill="#000000"],
.td-editor-dark .graphviz > svg [fill="black"],
body.dark .graphviz > svg [fill="#000000"],
body.dark .graphviz > svg [fill="black"] {
  fill: ${DARK_LINE_COLOR} !important;
}
  `.trim();

  document.head.appendChild(style);
  styleInjected = true;
}

function findContentsRoot(root: HTMLElement | null) {
  if (!root) return null;

  return root.querySelector<HTMLElement>('.toastui-editor-contents') || root;
}

function parseOptionValue(rawValue: string) {
  const trimmed = rawValue.trim();
  const unquoted = trimmed.replace(/^['"]|['"]$/g, '');

  try {
    return JSON.parse(unquoted);
  } catch (e) {
    return unquoted;
  }
}

function parseInfoOptions(node: MdNode) {
  const info = String((node as any)?.info || '').trim();
  const payload = info.replace(/^\S+\s*/, '');

  if (!payload) {
    return null;
  }

  const options: Record<string, unknown> = {};
  const re = /([\w.-]+)=((?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s]+))/g;
  let matched = re.exec(payload);

  while (matched) {
    options[matched[1]] = parseOptionValue(matched[2]);
    matched = re.exec(payload);
  }

  return Object.keys(options).length ? options : null;
}

function createGraphvizTokens(
  code: string,
  className: string,
  options?: Record<string, unknown> | null
) {
  const escaped = escapeHtml(code);
  const source = escapeHtml(encodeURIComponent(code));
  const optionText = options ? escapeHtml(encodeURIComponent(JSON.stringify(options))) : '';
  const optionAttr = optionText ? ` data-graphviz-options="${optionText}"` : '';
  const html = `<div class="graphviz ${className}" data-graphviz="1" data-graphviz-rendered="0" data-graphviz-source="${source}"${optionAttr}>${escaped}</div>`;

  return [
    { type: 'openTag', tagName: 'div', outerNewLine: true },
    { type: 'html', content: html },
    { type: 'closeTag', tagName: 'div', outerNewLine: true },
  ] as HTMLToken[];
}

function readSource(el: HTMLElement) {
  const encoded = el.getAttribute('data-graphviz-source');

  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch (e) {
      return encoded;
    }
  }

  return el.textContent || '';
}

function readOptions(el: HTMLElement, renderOptions?: Record<string, unknown>) {
  const encoded = el.getAttribute('data-graphviz-options');
  let parsed: Record<string, unknown> = {};

  if (encoded) {
    try {
      parsed = JSON.parse(decodeURIComponent(encoded));
    } catch (e) {
      parsed = {};
    }
  }

  return {
    ...(renderOptions || {}),
    ...parsed,
  };
}

function applySvgSizing(el: HTMLElement) {
  const svg = el.querySelector<SVGElement>(':scope > svg') || el.querySelector<SVGElement>('svg');

  if (!svg) return;

  if (!svg.getAttribute('preserveAspectRatio')) {
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  }

  const widthAttr = svg.getAttribute('width') || '0';
  const heightAttr = svg.getAttribute('height') || '0';
  const width = Number.parseFloat(widthAttr);
  const height = Number.parseFloat(heightAttr);

  if (!svg.getAttribute('viewBox') && Number.isFinite(width) && Number.isFinite(height)) {
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }
}

function applyDarkSvgPalette(el: HTMLElement) {
  const svg = el.querySelector<SVGElement>('svg');

  if (!svg) {
    return;
  }

  const applyStyle = (elements: NodeListOf<SVGElement>, style: Record<string, string>) => {
    elements.forEach((node) => {
      Object.entries(style).forEach(([key, value]) => {
        node.style.setProperty(key, value);
      });
    });
  };

  applyStyle(svg.querySelectorAll<SVGElement>('g.node text, g.node tspan, g.edge text'), {
    fill: DARK_TEXT_COLOR,
  });

  applyStyle(
    svg.querySelectorAll<SVGElement>(
      'g.node rect, g.node polygon, g.node ellipse, g.node path, g.cluster path'
    ),
    {
      fill: 'none',
      stroke: DARK_LINE_COLOR,
    }
  );

  applyStyle(svg.querySelectorAll<SVGElement>('g.edge path, g.edge polyline, g.edge line'), {
    stroke: DARK_LINE_COLOR,
    fill: 'none',
  });

  applyStyle(svg.querySelectorAll<SVGElement>('g.edge polygon'), {
    stroke: DARK_LINE_COLOR,
    fill: DARK_LINE_COLOR,
  });
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

function quoteDotValue(value: unknown) {
  const escaped = String(value ?? '')
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"');

  return `"${escaped}"`;
}

function serializeAttrStatement(name: 'graph' | 'node' | 'edge', attrs?: Record<string, unknown>) {
  if (!attrs || !Object.keys(attrs).length) {
    return '';
  }

  const attrParts = Object.entries(attrs)
    .filter(([, value]) => typeof value !== 'undefined')
    .map(([key, value]) => `${key}=${quoteDotValue(value)}`);

  if (!attrParts.length) {
    return '';
  }

  return `${name} [${attrParts.join(', ')}]`;
}

function resolveDarkThemeAttributes(
  override?: GraphvizThemeAttributes
): Required<GraphvizThemeAttributes> {
  return {
    graph: { ...DEFAULT_DARK_THEME_ATTRIBUTES.graph, ...(override?.graph || {}) },
    node: { ...DEFAULT_DARK_THEME_ATTRIBUTES.node, ...(override?.node || {}) },
    edge: { ...DEFAULT_DARK_THEME_ATTRIBUTES.edge, ...(override?.edge || {}) },
  };
}

function applyDarkThemeToSource(source: string, darkThemeAttributes?: GraphvizThemeAttributes) {
  const openBraceIdx = source.indexOf('{');

  if (openBraceIdx < 0) {
    return source;
  }

  const resolvedTheme = resolveDarkThemeAttributes(darkThemeAttributes);
  const statements = [
    serializeAttrStatement('graph', resolvedTheme.graph),
    serializeAttrStatement('node', resolvedTheme.node),
    serializeAttrStatement('edge', resolvedTheme.edge),
  ].filter(Boolean);

  if (!statements.length) {
    return source;
  }

  const before = source.slice(0, openBraceIdx + 1);
  const after = source.slice(openBraceIdx + 1);
  const preamble = `\n${statements.join(';\n')};\n`;

  return `${before}${preamble}${after}`;
}

function renderOneGraphviz(
  el: HTMLElement,
  renderOptions?: Record<string, unknown>,
  darkThemeAttributes?: GraphvizThemeAttributes,
  themeOverride?: boolean | null
) {
  const source = readSource(el);
  const darkMode = typeof themeOverride === 'boolean' ? themeOverride : isDarkMode(el);
  const themedSource = darkMode ? applyDarkThemeToSource(source, darkThemeAttributes) : source;

  if (!source.trim()) {
    el.setAttribute('data-graphviz-rendered', '1');
    return Promise.resolve();
  }

  const renderTicket = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  el.setAttribute('data-graphviz-ticket', renderTicket);

  return Promise.resolve(getViz().renderString(themedSource, readOptions(el, renderOptions)))
    .then((output: string) => {
      if (el.getAttribute('data-graphviz-ticket') !== renderTicket) {
        return;
      }
      if (!output) {
        throw new Error('viz.js output empty graph');
      }

      el.innerHTML = output;
      applySvgSizing(el);
      if (darkMode) {
        applyDarkSvgPalette(el);
      }
      el.setAttribute('data-graphviz-rendered', '1');
    })
    .catch((err) => {
      if (el.getAttribute('data-graphviz-ticket') !== renderTicket) {
        return;
      }

      viz = createViz();

      const message = (err as Error)?.message || String(err);

      el.innerHTML = `<div class="toastui-graphviz-error">${escapeHtml(message)}</div>`;
      el.setAttribute('data-graphviz-rendered', '0');
      // eslint-disable-next-line no-console
      console.warn('Graphviz render failed:', err);
    });
}

async function renderGraphvizIn(
  rootEl: HTMLElement | null,
  force: boolean,
  renderOptions?: Record<string, unknown>,
  darkThemeAttributes?: GraphvizThemeAttributes,
  themeOverride?: boolean | null
) {
  if (!rootEl) return;

  const allNodes = Array.from(rootEl.querySelectorAll<HTMLElement>('.graphviz[data-graphviz="1"]'));
  const nodes = force ? allNodes : allNodes.filter((node) => node.dataset.graphvizRendered !== '1');

  if (!nodes.length) return;

  for (const node of nodes) {
    // keep rendering order stable to avoid flicker
    // eslint-disable-next-line no-await-in-loop
    await renderOneGraphviz(node, renderOptions, darkThemeAttributes, themeOverride);
  }
}

function makeScheduler(
  getRoots: () => { previewRoot: HTMLElement | null; wysiwygRoot: HTMLElement | null },
  renderOptions?: Record<string, unknown>,
  darkThemeAttributes?: GraphvizThemeAttributes
) {
  let scheduled = false;
  let forceRerender = false;
  let queue: Promise<void> = Promise.resolve();
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

      const shouldForce = forceRerender;
      const resolvedThemeOverride = pendingThemeOverride;

      forceRerender = false;
      pendingThemeOverride = null;

      queue = queue.then(async () => {
        const { previewRoot, wysiwygRoot } = getRoots();

        await renderGraphvizIn(
          previewRoot,
          shouldForce,
          renderOptions,
          darkThemeAttributes,
          resolvedThemeOverride
        );
        await renderGraphvizIn(
          wysiwygRoot,
          shouldForce,
          renderOptions,
          darkThemeAttributes,
          resolvedThemeOverride
        );
      });
    });
  };

  return { schedule };
}

export default function graphvizPlugin(
  context: PluginContext,
  options: PluginOptions = {}
): PluginInfo {
  ensureGraphvizStyles();

  const { className = DEFAULT_CLASS_NAME, renderOptions, darkThemeAttributes } = options;
  const instance = context.instance as any;

  const getRoots = () => {
    const elements = instance.getEditorElements?.();

    return {
      previewRoot: findContentsRoot((elements?.mdPreview || null) as HTMLElement | null),
      wysiwygRoot: findContentsRoot((elements?.wwEditor || null) as HTMLElement | null),
    };
  };
  const scheduler = makeScheduler(getRoots, renderOptions, darkThemeAttributes);

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
      graphviz(node: MdNode) {
        const parsedOptions = parseInfoOptions(node);

        return createGraphvizTokens(node.literal || '', className, parsedOptions);
      },
      dot(node: MdNode) {
        const parsedOptions = parseInfoOptions(node);

        return createGraphvizTokens(node.literal || '', className, parsedOptions);
      },
    },
  };
}
