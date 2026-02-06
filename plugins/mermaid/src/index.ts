/**
 * @fileoverview Implements mermaid plugin
 * @author NHN FE Development Lab <dl_javascript@nhn.com>
 */
import mermaid from 'mermaid';
import type { MdNode, PluginContext, PluginInfo } from '@toast-ui/editor';
import type { HTMLToken } from '@toast-ui/toastmark';

export interface PluginOptions {
  className?: string;
}

const DEFAULT_CLASS_NAME = 'toastui-mermaid';
let initialized = false;
let lastTheme: 'default' | 'dark' | null = null;
let styleInjected = false;

function escapeHtml(s: string) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function ensureInitialized(theme: 'default' | 'dark') {
  if (initialized && lastTheme === theme) return false;
  if (typeof window !== 'undefined' && !(window as any).mermaid) {
    (window as any).mermaid = mermaid;
  }
  const config: mermaid.MermaidConfig = {
    startOnLoad: false,
    securityLevel: 'strict',
    theme,
  };

  if (theme === 'dark') {
    config.themeVariables = {
      background: '#111111',
      primaryColor: '#1f1f1f',
      primaryTextColor: '#ffffff',
      primaryBorderColor: '#4b5563',
      secondaryColor: '#2a2a2a',
      secondaryTextColor: '#ffffff',
      secondaryBorderColor: '#4b5563',
      tertiaryColor: '#1a1a1a',
      tertiaryTextColor: '#ffffff',
      tertiaryBorderColor: '#4b5563',
      lineColor: '#9ca3af',
      clusterBkg: '#1a1a1a',
      clusterBorder: '#4b5563',
      edgeLabelBackground: '#1a1a1a',
    };
  }

  mermaid.initialize(config);
  initialized = true;
  lastTheme = theme;
  return true;
}

function ensureMermaidStyles() {
  if (styleInjected || typeof document === 'undefined') return;
  const style = document.createElement('style');

  style.setAttribute('data-toastui-mermaid-theme', '1');
  style.textContent = `
.toastui-editor-dark .toastui-mermaid {
  background: #111111;
  border-radius: 4px;
  padding: 6px 8px;
}

.toastui-editor-dark .toastui-mermaid svg {
  background: #111111 !important;
}

.toastui-editor-dark .toastui-mermaid svg .node rect,
.toastui-editor-dark .toastui-mermaid svg .node ellipse,
.toastui-editor-dark .toastui-mermaid svg .node circle,
.toastui-editor-dark .toastui-mermaid svg .node polygon {
  fill: #1f1f1f !important;
  stroke: #4b5563 !important;
}

.toastui-editor-dark .toastui-mermaid svg .edgePath path,
.toastui-editor-dark .toastui-mermaid svg .flowchart-link {
  stroke: #9ca3af !important;
}

.toastui-editor-dark .toastui-mermaid svg .label text,
.toastui-editor-dark .toastui-mermaid svg .label foreignObject,
.toastui-editor-dark .toastui-mermaid svg .edgeLabel {
  fill: #ffffff !important;
  color: #ffffff !important;
}
  `.trim();

  document.head.appendChild(style);
  styleInjected = true;
}

async function renderMermaidIn(rootEl: HTMLElement | null, restoreSources: boolean) {
  if (!rootEl) return;
  const nodes = Array.from(rootEl.querySelectorAll('.mermaid[data-mermaid="1"]')).filter(
    (node) => (node as HTMLElement).dataset.mermaidRendered !== '1'
  ) as HTMLElement[];

  if (!nodes.length) return;
  if (restoreSources) {
    nodes.forEach((node) => {
      const { mermaidSource } = node.dataset;

      if (mermaidSource) {
        node.textContent = decodeURIComponent(mermaidSource);
      }
      node.dataset.mermaidRendered = '0';
    });
  }
  nodes.forEach((node) => {
    node.dataset.mermaidRendered = '1';
  });

  try {
    await mermaid.run({ nodes, suppressErrors: true });
  } catch (e) {
    nodes.forEach((node) => {
      node.dataset.mermaidRendered = '0';
    });
    // eslint-disable-next-line no-console
    console.error('Mermaid render failed:', e);
  }
}

function makeMermaidScheduler(
  getRoots: () => {
    previewRoot: HTMLElement | null;
    wysiwygRoot: HTMLElement | null;
  }
) {
  let scheduled = false;

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;

    requestAnimationFrame(async () => {
      scheduled = false;

      const { previewRoot, wysiwygRoot } = getRoots();
      const themeRoot =
        previewRoot?.closest('.toastui-editor-defaultUI') ||
        wysiwygRoot?.closest('.toastui-editor-defaultUI');
      const isDark = themeRoot?.classList.contains('toastui-editor-dark') || false;
      const theme = isDark ? 'dark' : 'default';
      const didReinitialize = ensureInitialized(theme);

      await renderMermaidIn(previewRoot, didReinitialize);

      await renderMermaidIn(wysiwygRoot, didReinitialize);
    });
  };

  return { schedule };
}

function findContentsRoot(root: HTMLElement | null) {
  if (!root) return null;
  return root.querySelector<HTMLElement>('.toastui-editor-contents') || root;
}

function createMermaidTokens(code: string, className: string): HTMLToken[] {
  const escaped = escapeHtml(code);
  const source = escapeHtml(encodeURIComponent(code));
  const html = `<div class="mermaid ${className}" data-mermaid="1" data-mermaid-rendered="0" data-mermaid-source="${source}">${escaped}</div>`;

  return [
    { type: 'openTag', tagName: 'div', outerNewLine: true },
    { type: 'html', content: html },
    { type: 'closeTag', tagName: 'div', outerNewLine: true },
  ];
}

/**
 * Mermaid plugin
 * @param {Object} context - plugin context for communicating with editor
 * @param {Object} options - options for plugin
 */
export default function mermaidPlugin(
  context: PluginContext,
  options: PluginOptions = {}
): PluginInfo {
  ensureMermaidStyles();
  const className = options.className || DEFAULT_CLASS_NAME;
  const instance = context.instance as any;
  const getRoots = () => {
    const elements = instance.getEditorElements?.();

    return {
      previewRoot: findContentsRoot(elements?.mdPreview || null),
      wysiwygRoot: findContentsRoot(elements?.wwEditor || null),
    };
  };
  const scheduler = makeMermaidScheduler(getRoots);

  context.eventEmitter.listen('change', () => scheduler.schedule());
  context.eventEmitter.listen('changeMode', () => scheduler.schedule());
  context.eventEmitter.listen('load', () => scheduler.schedule());
  context.eventEmitter.listen('loadUI', () => scheduler.schedule());

  scheduler.schedule();

  return {
    toHTMLRenderers: {
      mermaid(node: MdNode) {
        return createMermaidTokens(node.literal || '', className);
      },
    },
  };
}
