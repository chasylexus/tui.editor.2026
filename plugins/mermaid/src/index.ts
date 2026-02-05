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

function escapeHtml(s: string) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function ensureInitialized() {
  if (initialized) return;
  if (typeof window !== 'undefined' && !(window as any).mermaid) {
    (window as any).mermaid = mermaid;
  }
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
  });
  initialized = true;
}

async function renderMermaidIn(rootEl: HTMLElement | null) {
  if (!rootEl) return;
  const nodes = Array.from(rootEl.querySelectorAll('.mermaid[data-mermaid="1"]')).filter(
    (node) => (node as HTMLElement).dataset.mermaidRendered !== '1'
  ) as HTMLElement[];

  if (!nodes.length) return;
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

      await renderMermaidIn(previewRoot);

      await renderMermaidIn(wysiwygRoot);
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
  const html = `<div class="mermaid ${className}" data-mermaid="1" data-mermaid-rendered="0">${escaped}</div>`;

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
  ensureInitialized();

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
