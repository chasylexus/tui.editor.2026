/**
 * @fileoverview Implements export plugin
 * @author NHN FE Development Lab <dl_javascript@nhn.com>
 */
import type { PluginContext, PluginInfo } from '@toast-ui/editor';

import './css/plugin.css';

export interface PluginOptions {
  markdownFileName?: string;
  htmlFileName?: string;
  toolbarGroupIndex?: number;
  toolbarItemIndex?: number;
}

function downloadText(filename: string, content: string, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

  a.href = url;
  a.download = filename;

  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function inlineImagesIn(rootEl: HTMLElement) {
  const imgs = Array.from(rootEl.querySelectorAll('img'));

  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute('src');

      if (!src || src.startsWith('data:')) return;

      let url = src;

      if (url.startsWith('//')) {
        url = `https:${url}`;
      } else if (!/^https?:\/\//i.test(url)) {
        url = new URL(url, window.location.href).href;
      }

      try {
        const res = await fetch(url);

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const blob = await res.blob();
        const dataUrl = await blobToDataUrl(blob);

        img.setAttribute('src', dataUrl);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('Failed to inline image (likely CORS):', url, e);
      }
    })
  );
}

function inlineCanvases(fromRoot: HTMLElement, toRoot: HTMLElement) {
  const srcCanvases = Array.from(fromRoot.querySelectorAll('canvas'));
  const dstCanvases = Array.from(toRoot.querySelectorAll('canvas'));

  srcCanvases.forEach((canvas, idx) => {
    const target = dstCanvases[idx];

    if (!target) return;

    try {
      const dataUrl = canvas.toDataURL('image/png');
      const img = document.createElement('img');

      img.src = dataUrl;
      img.width = canvas.width;
      img.height = canvas.height;
      img.style.width = canvas.style.width;
      img.style.height = canvas.style.height;
      target.replaceWith(img);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('Inline canvas failed:', e);
    }
  });
}

function inlineMermaidSvgs(rootEl: HTMLElement) {
  const svgs = Array.from(rootEl.querySelectorAll('.mermaid > svg'));

  if (!svgs.length) return;

  svgs.forEach((svg) => {
    try {
      const serializer = new XMLSerializer();
      const svgText = serializer.serializeToString(svg);
      const encoded = encodeURIComponent(svgText);
      const dataUrl = `data:image/svg+xml;charset=utf-8,${encoded}`;
      const img = document.createElement('img');
      const widthAttr = svg.getAttribute('width') || '';
      const heightAttr = svg.getAttribute('height') || '';
      const viewBox = svg.getAttribute('viewBox') || '';
      const viewBoxParts = viewBox.split(/\s+/).map((part) => Number(part));
      const viewBoxWidth = viewBoxParts.length === 4 ? viewBoxParts[2] : NaN;
      const viewBoxHeight = viewBoxParts.length === 4 ? viewBoxParts[3] : NaN;
      const widthNum = Number.parseFloat(widthAttr);
      const heightNum = Number.parseFloat(heightAttr);
      const isWidthNumeric = Number.isFinite(widthNum) && !widthAttr.includes('%');
      const isHeightNumeric = Number.isFinite(heightNum) && !heightAttr.includes('%');

      img.src = dataUrl;
      if (isWidthNumeric) {
        img.width = widthNum;
      } else if (Number.isFinite(viewBoxWidth)) {
        img.width = viewBoxWidth;
      } else if (widthAttr) {
        img.style.width = widthAttr;
      }
      if (isHeightNumeric) {
        img.height = heightNum;
      } else if (Number.isFinite(viewBoxHeight)) {
        img.height = viewBoxHeight;
      } else if (heightAttr) {
        img.style.height = heightAttr;
      }

      if (svg.style.maxWidth) {
        img.style.maxWidth = svg.style.maxWidth;
      }
      if (svg.style.width) {
        img.style.width = svg.style.width;
      }
      if (svg.style.height) {
        img.style.height = svg.style.height;
      }
      if (!img.style.width) {
        img.style.width = '100%';
      }
      if (!img.style.height) {
        img.style.height = 'auto';
      }

      svg.replaceWith(img);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('Inline mermaid failed:', e);
    }
  });
}

function collectInlineStyles() {
  let cssText = '';

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = sheet.cssRules;

      if (!rules) continue;

      for (const rule of Array.from(rules)) {
        cssText += `${rule.cssText}\n`;
      }
    } catch (e) {
      // ignore cross-origin styles
    }
  }
  return cssText;
}

function buildStandaloneHtml(bodyHtml: string) {
  const styles = collectInlineStyles();

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title>Toast UI Export</title>
    <style>
${styles}
    </style>
  </head>
  <body>
    <div class="toastui-editor-contents">${bodyHtml}</div>
  </body>
</html>
`;
}

async function tryRenderMermaid(rootEl: HTMLElement | null) {
  if (!rootEl) return;
  const mermaidRef = (window as any).mermaid;

  if (!mermaidRef?.run) return;

  const nodes = Array.from(rootEl.querySelectorAll('.mermaid[data-mermaid="1"]')).filter(
    (node) => (node as HTMLElement).dataset.mermaidRendered !== '1'
  ) as HTMLElement[];

  if (!nodes.length) return;

  nodes.forEach((node) => {
    node.dataset.mermaidRendered = '1';
  });

  try {
    await mermaidRef.run({ nodes, suppressErrors: true });
  } catch (e) {
    nodes.forEach((node) => {
      node.dataset.mermaidRendered = '0';
    });
  }
}

function getPreviewRoot(instance: any): HTMLElement | null {
  const elements = instance.getEditorElements?.();
  const previewRoot = elements?.mdPreview || null;

  if (!previewRoot) return null;

  return previewRoot.querySelector<HTMLElement>('.toastui-editor-contents') || previewRoot;
}

function nextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function nextTick() {
  return new Promise<void>((resolve) => {
    setTimeout(() => resolve(), 0);
  });
}

async function waitForPreviewRender() {
  await nextFrame();
  await nextTick();
  await nextTick();
}

async function waitForChartRender(rootEl: HTMLElement) {
  const maxTries = 8;

  const poll = async (attempt: number) => {
    const chartRoots = rootEl.querySelectorAll('[data-chart-id]');
    const chartCanvas = rootEl.querySelectorAll('[data-chart-id] canvas');

    if (!chartRoots.length || chartCanvas.length || attempt >= maxTries) return;

    await waitForPreviewRender();

    await poll(attempt + 1);
  };

  await poll(0);
}

/**
 * Export plugin
 * @param {Object} context - plugin context for communicating with editor
 * @param {Object} options - options for plugin
 */
export default function exportPlugin(
  context: PluginContext,
  options: PluginOptions = {}
): PluginInfo {
  const markdownFileName = options.markdownFileName || 'document.md';
  const htmlFileName = options.htmlFileName || 'document.html';
  const toolbarGroupIndex = options.toolbarGroupIndex ?? 2;
  const toolbarItemIndex = options.toolbarItemIndex ?? 0;
  const instance = context.instance as any;

  const downloadMarkdown = () => {
    if (!instance.getMarkdown) return;

    const md = instance.getMarkdown();

    downloadText(markdownFileName, md, 'text/markdown');
  };

  const downloadHtml = async () => {
    let previewRoot = getPreviewRoot(instance);
    const wasMarkdownMode = instance.isMarkdownMode?.() ?? false;
    let switchedMode = false;
    let htmlBody = '';

    try {
      if ((!previewRoot || !previewRoot.innerHTML.trim()) && !wasMarkdownMode) {
        instance.changeMode?.('markdown', true);
        switchedMode = true;
        await waitForPreviewRender();
        previewRoot = getPreviewRoot(instance);
      }

      if (previewRoot && previewRoot.innerHTML.trim()) {
        await waitForPreviewRender();
        await tryRenderMermaid(previewRoot);
        await waitForPreviewRender();
        await waitForChartRender(previewRoot);

        const clone = previewRoot.cloneNode(true) as HTMLElement;

        inlineCanvases(previewRoot, clone);
        inlineMermaidSvgs(clone);
        await inlineImagesIn(clone);

        htmlBody = clone.innerHTML;
      }
    } finally {
      if (switchedMode) {
        instance.changeMode?.('wysiwyg', true);
      }
    }

    if (!htmlBody) return;

    const html = buildStandaloneHtml(htmlBody);

    downloadText(htmlFileName, html, 'text/html');
  };

  const toolbarItems = [
    {
      groupIndex: toolbarGroupIndex,
      itemIndex: toolbarItemIndex,
      item: {
        name: 'downloadMarkdown',
        tooltip: 'Download Markdown',
        className: 'toastui-editor-toolbar-icons export-button export-markdown',
        text: 'MD',
        command: 'downloadMarkdown',
      },
    },
    {
      groupIndex: toolbarGroupIndex,
      itemIndex: toolbarItemIndex + 1,
      item: {
        name: 'downloadHtml',
        tooltip: 'Download HTML',
        className: 'toastui-editor-toolbar-icons export-button export-html',
        text: 'HTML',
        command: 'downloadHtml',
      },
    },
  ];

  return {
    toolbarItems,
    markdownCommands: {
      downloadMarkdown: () => {
        downloadMarkdown();
        return true;
      },
      downloadHtml: () => {
        downloadHtml();
        return true;
      },
    },
    wysiwygCommands: {
      downloadMarkdown: () => {
        downloadMarkdown();
        return true;
      },
      downloadHtml: () => {
        downloadHtml();
        return true;
      },
    },
  };
}
