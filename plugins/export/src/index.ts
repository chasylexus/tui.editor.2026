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

function inlineTokenStyles(original: HTMLElement, clone: HTMLElement) {
  const origTokens = Array.from(original.querySelectorAll('[class*="token"]'));
  const cloneTokens = Array.from(clone.querySelectorAll('[class*="token"]'));

  origTokens.forEach((origEl, idx) => {
    const cloneEl = cloneTokens[idx] as HTMLElement | undefined;

    if (!cloneEl) return;

    const cs = getComputedStyle(origEl);

    if (cs.color) {
      cloneEl.style.color = cs.color;
    }

    if (cs.fontWeight && cs.fontWeight !== 'normal' && cs.fontWeight !== '400') {
      cloneEl.style.fontWeight = cs.fontWeight;
    }

    if (cs.fontStyle && cs.fontStyle !== 'normal') {
      cloneEl.style.fontStyle = cs.fontStyle;
    }
  });
}

function fixLineNumberInputs(original: HTMLElement, clone: HTMLElement) {
  const origInputs = Array.from(
    original.querySelectorAll<HTMLInputElement>('.toastui-editor-line-number-input')
  );
  const cloneInputs = Array.from(
    clone.querySelectorAll<HTMLInputElement>('.toastui-editor-line-number-input')
  );

  origInputs.forEach((origEl, idx) => {
    const cloneEl = cloneInputs[idx];

    if (!cloneEl) return;

    const val = origEl.value || 'off';
    const span = document.createElement('span');

    span.className = cloneEl.className;
    span.textContent = val;
    span.style.display = 'inline-block';
    span.style.textAlign = 'center';
    span.style.minWidth = '42px';

    cloneEl.replaceWith(span);
  });
}

interface MarkdownAnchor {
  id: string;
  text: string;
}

function normalizeFragmentId(text: string) {
  return text.trim().replace(/\\s+/g, '_');
}

function normalizeFragmentHref(text: string) {
  return `#${normalizeFragmentId(text)}`;
}

function slugify(text: string) {
  return normalizeFragmentId(text).replace(/_+/g, '_');
}

function toHashHref(id: string) {
  return normalizeFragmentHref(id);
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch (e) {
    return value;
  }
}

function normalizeText(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

function createUniqueId(baseId: string, usedIds: Set<string>) {
  let id = baseId || 'heading';
  let suffix = 1;

  while (usedIds.has(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(id);

  return id;
}

function ensureHeadingIds(root: HTMLElement) {
  const usedIds = new Set<string>();
  const headings = Array.from(root.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'));

  headings.forEach((heading) => {
    const existingId = heading.getAttribute('id')?.trim();
    const baseId = existingId || slugify(heading.textContent || '') || 'heading';
    const uniqueId = createUniqueId(baseId, usedIds);

    heading.setAttribute('id', uniqueId);
    heading.setAttribute('data-export-anchor-target', 'true');
  });
}

function extractMarkdownAnchors(markdown: string) {
  const anchors: MarkdownAnchor[] = [];
  const reAnchor = /<a\s+[^>]*id\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*>([\s\S]*?)<\/a>/gi;
  let match = reAnchor.exec(markdown);

  while (match) {
    const id = (match[1] || match[2] || '').trim();
    const rawText = (match[3] || '').replace(/<[^>]+>/g, '');
    const text = rawText.trim();

    if (id && text) {
      anchors.push({ id, text });
    }
    match = reAnchor.exec(markdown);
  }

  return anchors;
}

function addCustomAnchorTargets(root: HTMLElement, markdownAnchors: MarkdownAnchor[]) {
  const usedIds = new Set<string>(
    Array.from(root.querySelectorAll<HTMLElement>('[id]'))
      .map((el) => el.id)
      .filter(Boolean)
  );
  const candidates = Array.from(
    root.querySelectorAll<HTMLElement>('span, a, mark, strong, em, code')
  );

  markdownAnchors.forEach(({ id, text }) => {
    id = normalizeFragmentId(id);
    const existing = root.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`);

    if (existing) {
      existing.setAttribute('data-export-anchor-target', 'true');

      if (existing.tagName === 'A') {
        const anchor = existing as HTMLAnchorElement;

        anchor.setAttribute('href', toHashHref(existing.id));
        anchor.removeAttribute('target');
        anchor.removeAttribute('rel');
      }
      return;
    }

    const normalizedAnchorText = normalizeText(text);
    const anchorNodeTarget = candidates.find((candidate) => {
      if (candidate.tagName !== 'A') {
        return false;
      }

      const href = candidate.getAttribute('href') || '';

      if (href && href !== '#') {
        return false;
      }

      return normalizeText(candidate.textContent || '') === normalizedAnchorText;
    });

    const target = anchorNodeTarget
      ? anchorNodeTarget
      : candidates.find((candidate) => {
          if (candidate.hasAttribute('id')) {
            return false;
          }
          if (candidate.closest('a[href]')) {
            return false;
          }

          return normalizeText(candidate.textContent || '') === normalizedAnchorText;
        });

    if (!target) {
      return;
    }

    const uniqueId = createUniqueId(id, usedIds);

    target.setAttribute('id', uniqueId);
    target.setAttribute('data-export-anchor-target', 'true');

    if (target.tagName === 'A') {
      const anchor = target as HTMLAnchorElement;

      anchor.setAttribute('href', toHashHref(uniqueId));
      anchor.removeAttribute('target');
      anchor.removeAttribute('rel');
    }
  });
}

function extractFragmentDestinations(markdown: string) {
  const destinations: string[] = [];

  for (let i = 0; i < markdown.length; i += 1) {
    if (markdown[i] !== '[' || markdown[i - 1] === '!') {
      continue;
    }

    let labelEnd = i + 1;

    while (labelEnd < markdown.length && markdown[labelEnd] !== ']') {
      if (markdown[labelEnd] === '\\') {
        labelEnd += 2;
      } else {
        labelEnd += 1;
      }
    }

    if (markdown[labelEnd] !== ']' || markdown[labelEnd + 1] !== '(') {
      continue;
    }

    let cursor = labelEnd + 2;

    while (cursor < markdown.length && /\s/.test(markdown[cursor])) {
      cursor += 1;
    }

    if (markdown[cursor] !== '#') {
      continue;
    }

    cursor += 1;

    const start = cursor;
    let depth = 1;

    while (cursor < markdown.length) {
      const ch = markdown[cursor];

      if (ch === '\\') {
        cursor += 2;
        continue;
      }
      if (ch === '(') {
        depth += 1;
      } else if (ch === ')') {
        depth -= 1;
        if (depth === 0) {
          break;
        }
      }
      cursor += 1;
    }

    if (depth === 0) {
      const destination = markdown.slice(start, cursor).trim();

      if (destination) {
        destinations.push(destination);
      }
      i = cursor;
    }
  }

  return destinations;
}

function resolveTargetId(rawDestination: string, root: HTMLElement) {
  const raw = rawDestination.trim();
  const decoded = safeDecodeURIComponent(raw);
  const normalizedRaw = normalizeFragmentId(raw);
  const normalizedDecoded = normalizeFragmentId(decoded);
  const slug = slugify(decoded);
  const candidates = [raw, decoded, normalizedRaw, normalizedDecoded, slug].filter(Boolean);

  for (const candidate of candidates) {
    if (root.querySelector(`[id="${CSS.escape(candidate)}"]`)) {
      return candidate;
    }
  }

  const headingByText = Array.from(
    root.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')
  ).find((heading) => normalizeText(heading.textContent || '') === normalizeText(decoded));

  if (headingByText?.id) {
    return headingByText.id;
  }

  return normalizedDecoded || slug || decoded || raw;
}

function restoreFragmentLinks(root: HTMLElement, markdown: string) {
  const destinations = extractFragmentDestinations(markdown);
  const links = Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href]')).filter((link) => {
    const href = link.getAttribute('href') || '';

    return (
      (href === '' || href.startsWith('#')) &&
      link.getAttribute('data-export-anchor-target') !== 'true'
    );
  });

  const count = Math.min(destinations.length, links.length);

  for (let i = 0; i < count; i += 1) {
    const resolvedId = resolveTargetId(destinations[i], root);

    if (!resolvedId) {
      continue;
    }

    links[i].setAttribute('href', toHashHref(resolvedId));
    links[i].removeAttribute('target');
    links[i].removeAttribute('rel');
  }
}

function markSelfAnchors(root: HTMLElement) {
  Array.from(root.querySelectorAll<HTMLElement>('[id]')).forEach((el) => {
    if (
      el.matches('h1, h2, h3, h4, h5, h6') ||
      el.getAttribute('data-export-anchor-target') === 'true'
    ) {
      el.setAttribute('data-export-self-anchor', 'true');
    }
  });
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
    <script>
    document.querySelectorAll('.toastui-editor-code-block-copy').forEach(function(b){
      b.addEventListener('click',function(){
        var w=b.closest('.toastui-editor-ww-code-block-highlighting');
        var c=w&&w.querySelector('code');
        if(c){navigator.clipboard.writeText(c.textContent).then(function(){
          b.classList.add('copied');setTimeout(function(){b.classList.remove('copied')},1500);
        })}
      });
    });
    function safeDecode(value){
      try{return decodeURIComponent(value);}catch(e){return value;}
    }
    function resolveAnchorTarget(rawId){
      var decoded = safeDecode(rawId);
      var normalizedRaw = String(rawId).trim().replace(/\\s+/g, '_');
      var normalizedDecoded = String(decoded).trim().replace(/\\s+/g, '_');
      var candidates = [rawId, decoded, normalizedRaw, normalizedDecoded].filter(Boolean);
      for(var i=0;i<candidates.length;i+=1){
        var id = candidates[i];
        var byId = document.getElementById(id);
        if(byId){return { id: id, el: byId };}
        try {
          var escaped = CSS && CSS.escape ? CSS.escape(id) : id.replace(/(["'\\.#:[,=])/g,'\\$1');
          var byQuery = document.querySelector('[id="' + escaped + '"]');
          if(byQuery){return { id: id, el: byQuery };}
        } catch(err) {}
      }
      return null;
    }
    function navigateToHash(rawHash){
      var hash = rawHash || '';
      if(!hash || hash[0] !== '#'){return;}
      var rawId = hash.slice(1);
      var resolved = resolveAnchorTarget(rawId);
      if(!resolved){return;}
      var nextHash = '#' + resolved.id;
      if(window.location.hash !== nextHash){
        history.replaceState(null,'', nextHash);
      }
      resolved.el.scrollIntoView({ block: 'start' });
    }
    document.querySelectorAll('a[href^="#"]').forEach(function(link){
      link.removeAttribute('target');
      link.removeAttribute('rel');
      link.addEventListener('click', function(event){
        var href = link.getAttribute('href') || '';
        if(!href || href === '#'){return;}
        event.preventDefault();
        navigateToHash(href);
      });
    });
    document.querySelectorAll('[data-export-self-anchor="true"]').forEach(function(target){
      target.style.cursor='pointer';
      target.addEventListener('click', function(event){
        var id = target.getAttribute('id');
        if(!id){return;}
        if(target.tagName === 'A'){event.preventDefault();}
        navigateToHash('#' + id);
      });
    });
    ${'<'}/script>
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
    const markdownSource = instance.getMarkdown?.() ?? '';
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
        inlineTokenStyles(wysiwygRoot, clone);
        fixLineNumberInputs(wysiwygRoot, clone);
        ensureHeadingIds(clone);
        addCustomAnchorTargets(clone, extractMarkdownAnchors(markdownSource));
        restoreFragmentLinks(clone, markdownSource);
        markSelfAnchors(clone);
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
