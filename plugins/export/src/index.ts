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

interface MenuState {
  openId: string | null;
  listenerAttached?: boolean;
}

function getMenuState(): MenuState {
  const win = window as any;

  if (!win.__toastuiToolbarMenuState) {
    win.__toastuiToolbarMenuState = { openId: null };
  }

  return win.__toastuiToolbarMenuState as MenuState;
}

function ensureMenuStateListener(state: MenuState) {
  if (state.listenerAttached || typeof document === 'undefined') return;

  document.addEventListener('mousedown', (event) => {
    const target = event.target as HTMLElement;

    if (
      target.closest('.toastui-editor-popup') ||
      target.closest('.toastui-editor-toolbar-item-wrapper')
    ) {
      return;
    }

    state.openId = null;
  });

  state.listenerAttached = true;
}

function createMenuItem(
  label: string,
  iconClassName: string,
  onSelect: () => void,
  closePopup: () => void
) {
  const item = document.createElement('li');
  const icon = document.createElement('span');
  const text = document.createElement('span');

  item.className = 'menu-item';
  item.setAttribute('role', 'menuitem');
  item.tabIndex = 0;
  icon.className = `export-menu-icon ${iconClassName}`;
  text.textContent = label;
  item.appendChild(icon);
  item.appendChild(text);

  const handleSelect = () => {
    onSelect();
    closePopup();
  };

  item.addEventListener('click', (event) => {
    event.preventDefault();
    handleSelect();
  });
  item.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleSelect();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closePopup();
    }
  });

  return item;
}

function createMenuBody(items: HTMLElement[]) {
  const list = document.createElement('ul');

  list.className = 'menu-group';
  list.setAttribute('role', 'menu');
  items.forEach((item) => list.appendChild(item));

  return list;
}

function createExportSplitButton(onMainClick: () => void) {
  const container = document.createElement('div');
  const mainButton = document.createElement('button');
  const caretButton = document.createElement('button');
  const icon = document.createElement('span');

  container.className = 'export-split';
  container.setAttribute('role', 'group');

  mainButton.type = 'button';
  mainButton.className = 'toastui-editor-toolbar-icons export-split-main';
  mainButton.setAttribute('aria-label', 'Download HTML');

  icon.className = 'export-split-icon';
  mainButton.appendChild(icon);

  caretButton.type = 'button';
  caretButton.className = 'toastui-editor-toolbar-icons export-split-caret';
  caretButton.setAttribute('aria-label', 'Export options');
  caretButton.setAttribute('aria-haspopup', 'menu');
  caretButton.textContent = '▾';

  mainButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onMainClick();
  });
  mainButton.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      onMainClick();
    }
  });

  container.appendChild(mainButton);
  container.appendChild(caretButton);

  return container;
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

function buildStandaloneHtml(bodyHtml: string, isDark: boolean) {
  const styles = collectInlineStyles();
  const darkClass = isDark ? ' toastui-editor-dark' : '';
  const bgStyle = isDark ? 'background:#121212;' : '';

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
  <body style="margin:0;${bgStyle}">
    <div class="${darkClass.trim()}" style="max-width:960px;margin:0 auto;padding:24px 32px">
      <div class="toastui-editor-contents">${bodyHtml}</div>
    </div>
  </body>
</html>
`;
}

function getWysiwygRoot(instance: any): HTMLElement | null {
  const elements = instance.getEditorElements?.();
  const wysiwygRoot = elements?.wwEditor || null;

  if (!wysiwygRoot) return null;

  return wysiwygRoot.querySelector<HTMLElement>('.toastui-editor-contents') || wysiwygRoot;
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

async function waitForWysiwygRender() {
  await Promise.resolve();
  await nextFrame();
  await nextFrame();
  await nextTick();
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
  const menuState = getMenuState();

  ensureMenuStateListener(menuState);

  const downloadMarkdown = () => {
    if (!instance.getMarkdown) return;

    const md = instance.getMarkdown();

    downloadText(markdownFileName, md, 'text/markdown');
  };

  const downloadHtml = async () => {
    const wasMarkdownMode = instance.isMarkdownMode?.() ?? false;
    const currentTheme = instance.getTheme?.() ?? 'light';
    const isDark = currentTheme === 'dark';
    let htmlBody = '';

    try {
      if (wasMarkdownMode) {
        instance.changeMode?.('wysiwyg', true);
      }

      await waitForWysiwygRender();

      // Let plugins prepare for export. Each plugin can push async work
      // into opts.promises. The theme field tells plugins which theme the
      // exported HTML will use so they can render accordingly.
      const exportOpts: Record<string, unknown> = {
        promises: [],
        theme: isDark ? 'dark' : 'default',
      };

      instance.eventEmitter?.emit?.('beforeExportHtml', exportOpts);

      const promises = exportOpts.promises as Promise<unknown>[];

      if (promises.length) {
        await Promise.all(promises);
      }

      await nextFrame();

      const wysiwygRoot = getWysiwygRoot(instance);

      if (wysiwygRoot && wysiwygRoot.innerHTML.trim()) {
        const clone = wysiwygRoot.cloneNode(true) as HTMLElement;

        inlineCanvases(wysiwygRoot, clone);
        await inlineImagesIn(clone);

        htmlBody = clone.innerHTML;
      }
    } finally {
      instance.eventEmitter?.emit?.('afterExportHtml');

      if (wasMarkdownMode) {
        instance.changeMode?.('markdown', true);
      }
    }

    if (!htmlBody) return;

    const html = buildStandaloneHtml(htmlBody, isDark);

    downloadText(htmlFileName, html, 'text/html');
  };

  const closePopup = () => {
    context.eventEmitter.emit('closePopup');
    menuState.openId = null;
  };
  const exportMenu = createMenuBody([
    createMenuItem('Download HTML', 'export-menu-icon-html', downloadHtml, closePopup),
    createMenuItem('Download Markdown', 'export-menu-icon-markdown', downloadMarkdown, closePopup),
  ]);
  const exportSplit = createExportSplitButton(downloadHtml);
  const caretButton = exportSplit.querySelector<HTMLButtonElement>('.export-split-caret');

  const openExportMenu = () => {
    const wrapper = exportSplit.closest(
      '.toastui-editor-toolbar-item-wrapper'
    ) as HTMLElement | null;

    if (wrapper) {
      wrapper.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
  };

  if (caretButton) {
    const toggleMenu = () => {
      if (menuState.openId === 'export') {
        closePopup();
        return;
      }

      closePopup();
      menuState.openId = 'export';
      openExportMenu();
    };

    caretButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleMenu();
    });
    caretButton.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        toggleMenu();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        closePopup();
      }
    });
  }
  const toolbarItems = [
    {
      groupIndex: toolbarGroupIndex,
      itemIndex: toolbarItemIndex,
      item: {
        name: 'exportSplit',
        tooltip: 'Export',
        el: exportSplit,
        popup: {
          body: exportMenu,
          className: 'toastui-editor-popup-add-heading export-split-menu',
        },
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
