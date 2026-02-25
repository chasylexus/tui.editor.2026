/**
 * @fileoverview Implements sequence diagram plugin (HedgeDoc-like behavior)
 */
import Raphael from 'raphael';
import { Diagram } from '@hackmd/js-sequence-diagrams/dist/parser/diagram';
import { DiagramPainter } from '@hackmd/js-sequence-diagrams/dist/painter/DiagramPainter';
import type { MdNode, PluginContext, PluginInfo } from '@techie_doubts/tui.editor.2026';
import type { HTMLToken } from '@techie_doubts/toastmark';

export interface PluginOptions {
  className?: string;
}

const DEFAULT_CLASS_NAME = 'toastui-sequence-diagram';
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

function ensureSequenceStyles() {
  if (styleInjected || typeof document === 'undefined') return;

  const style = document.createElement('style');

  style.setAttribute('data-toastui-sequence-theme', '1');
  style.textContent = `
.sequence-diagram {
  text-align: center;
  white-space: inherit;
}

.sequence-diagram > svg {
  max-width: 100%;
  height: auto;
}

.toastui-editor-dark .sequence-diagram tspan,
.td-editor-dark .sequence-diagram tspan {
  fill: #f3f4f6 !important;
}

.toastui-editor-dark .sequence-diagram rect,
.td-editor-dark .sequence-diagram rect {
  fill: transparent;
  stroke: #d1d5db;
}

.toastui-editor-dark .sequence-diagram path,
.td-editor-dark .sequence-diagram path {
  stroke: #d1d5db;
}
  `.trim();

  document.head.appendChild(style);
  styleInjected = true;
}

function createSequenceTokens(code: string, className: string): HTMLToken[] {
  const source = encodeURIComponent(code);
  const html = `<div class="sequence-diagram ${className}" data-sequence="1" data-sequence-rendered="0" data-sequence-source="${source}">${escapeHtml(
    code
  )}</div>`;

  return [
    { type: 'openTag', tagName: 'div', outerNewLine: true },
    { type: 'html', content: html },
    { type: 'closeTag', tagName: 'div', outerNewLine: true },
  ];
}

function findContentsRoot(root: HTMLElement | null) {
  if (!root) return null;

  return root.querySelector<HTMLElement>('.toastui-editor-contents') || root;
}

function readSource(el: HTMLElement) {
  const encoded = el.getAttribute('data-sequence-source');

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

function renderOneSequence(el: HTMLElement) {
  const source = readSource(el);

  if (!source.trim()) {
    el.setAttribute('data-sequence-rendered', '1');
    return;
  }

  try {
    const diagram = Diagram.parse(source);

    el.innerHTML = '';
    new DiagramPainter(diagram).drawSvg(el, { theme: 'simple' } as any);
    applySvgSizing(el);
    el.setAttribute('data-sequence-rendered', '1');
  } catch (err) {
    const message = (err as Error)?.message || String(err);

    el.innerHTML = `<div class="toastui-sequence-error">${escapeHtml(message)}</div>`;
    el.setAttribute('data-sequence-rendered', '0');
    // eslint-disable-next-line no-console
    console.warn('Sequence render failed:', err);
  }
}

function renderSequenceIn(rootEl: HTMLElement | null, force: boolean) {
  if (!rootEl) return;

  const allNodes = Array.from(
    rootEl.querySelectorAll<HTMLElement>('.sequence-diagram[data-sequence="1"]')
  );
  const nodes = force
    ? allNodes
    : allNodes.filter((node) => node.getAttribute('data-sequence-rendered') !== '1');

  if (!nodes.length) return;

  nodes.forEach((node) => renderOneSequence(node));
}

function makeScheduler(
  getRoots: () => { previewRoot: HTMLElement | null; wysiwygRoot: HTMLElement | null }
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

      renderSequenceIn(previewRoot, forceRender);
      renderSequenceIn(wysiwygRoot, forceRender);
    });
  };

  return { schedule };
}

export default function sequencePlugin(
  context: PluginContext,
  options: PluginOptions = {}
): PluginInfo {
  ensureRaphaelGlobal();
  ensureSequenceStyles();

  const className = options.className || DEFAULT_CLASS_NAME;
  const instance = context.instance as any;

  const getRoots = () => {
    const elements = instance.getEditorElements?.();

    return {
      previewRoot: findContentsRoot((elements?.mdPreview || null) as HTMLElement | null),
      wysiwygRoot: findContentsRoot((elements?.wwEditor || null) as HTMLElement | null),
    };
  };
  const scheduler = makeScheduler(getRoots);

  context.eventEmitter.listen('change', () => scheduler.schedule());
  context.eventEmitter.listen('changeMode', () => scheduler.schedule(true));
  context.eventEmitter.listen('load', () => scheduler.schedule(true));
  context.eventEmitter.listen('loadUI', () => scheduler.schedule(true));
  context.eventEmitter.listen('afterPreviewRender', () => scheduler.schedule(true));
  context.eventEmitter.listen('changeTheme', () => scheduler.schedule(true));

  return {
    toHTMLRenderers: {
      sequence(node: MdNode) {
        return createSequenceTokens(node.literal || '', className);
      },
      sequenceDiagram(node: MdNode) {
        return createSequenceTokens(node.literal || '', className);
      },
    },
  };
}
