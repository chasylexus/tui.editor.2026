/**
 * @fileoverview Implements uml plugin
 * @author NHN FE Development Lab <dl_javascript@nhn.com>
 */
import plantumlEncoder from 'plantuml-encoder';
import { PluginOptions } from '../index';

import type { MdNode, PluginContext, PluginInfo } from '@techie_doubts/tui.editor.2026';
import type { HTMLToken } from '@techie_doubts/toastmark';

const DEFAULT_RENDERER_URL = 'https://www.plantuml.com/plantuml/png/';
const DARK_PLANTUML_THEME = 'cyborg';
const PNG_FALLBACK_RENDERER_URL = 'https://www.plantuml.com/plantuml/png/';
let styleInjected = false;

function normalizeRendererURL(rendererURL: string) {
  return rendererURL.endsWith('/') ? rendererURL : `${rendererURL}/`;
}

function applyThemeDirective(text: string, theme: string): string {
  const directive = `!theme ${theme}\n`;
  const startMatch = text.match(/^(@start\w+[^\n]*\n?)/);

  if (startMatch) {
    return text.replace(startMatch[1], startMatch[1] + directive);
  }

  return directive + text;
}

function buildImgSrc(text: string, rendererURL: string, isDark: boolean): string {
  const themed = isDark ? applyThemeDirective(text, DARK_PLANTUML_THEME) : text;

  return `${normalizeRendererURL(rendererURL)}${plantumlEncoder.encode(themed)}`;
}

function createUMLTokens(text: string, rendererURL: string, isDark: boolean): HTMLToken[] {
  let renderedHTML;
  const source = encodeURIComponent(text);

  try {
    if (!plantumlEncoder) {
      throw new Error('plantuml-encoder dependency required');
    }
    renderedHTML = `<img src="${buildImgSrc(
      text,
      rendererURL,
      isDark
    )}" alt="UML diagram" decoding="async" />`;
  } catch (err) {
    renderedHTML = `Error occurred on encoding uml: ${err.message}`;
  }

  return [
    {
      type: 'openTag',
      tagName: 'div',
      outerNewLine: true,
      attributes: { 'data-plantuml-source': source },
    },
    { type: 'html', content: renderedHTML },
    { type: 'closeTag', tagName: 'div', outerNewLine: true },
  ];
}

function findContentsRoot(root: HTMLElement | null) {
  if (!root) return null;

  return root.querySelector<HTMLElement>('.toastui-editor-contents') || root;
}

function isDarkEditorRoot(root: HTMLElement | null) {
  if (!root) return false;

  return (
    root.classList.contains('toastui-editor-dark') || root.classList.contains('td-editor-dark')
  );
}

function detectDarkFromRoots(previewRoot: HTMLElement | null, wysiwygRoot: HTMLElement | null) {
  const rootSelectors = ['.toastui-editor-defaultUI', '.td-editor-defaultUI'];
  const candidates: (HTMLElement | null)[] = [];

  rootSelectors.forEach((selector) => {
    candidates.push(previewRoot?.closest<HTMLElement>(selector) || null);
    candidates.push(wysiwygRoot?.closest<HTMLElement>(selector) || null);
  });

  return candidates.some((root) => isDarkEditorRoot(root));
}

function ensureUmlStyles() {
  if (styleInjected || typeof document === 'undefined') {
    return;
  }

  const style = document.createElement('style');

  style.setAttribute('data-toastui-uml-plugin', '1');
  style.textContent = `
[data-plantuml-source] {
  text-align: center;
}

[data-plantuml-source] > img {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 auto;
}
  `.trim();

  document.head.appendChild(style);
  styleInjected = true;
}

function bindUmlImgFallback(img: HTMLImageElement, source: string) {
  if (img.dataset.umlFallbackBound === '1') {
    return;
  }

  img.dataset.umlFallbackBound = '1';

  img.addEventListener('error', () => {
    const fallback = buildImgSrc(source, PNG_FALLBACK_RENDERER_URL, false);

    if (img.src !== fallback) {
      img.src = fallback;
    }
  });
}

function updateUmlImagesIn(root: HTMLElement | null, rendererURL: string, isDark: boolean) {
  if (!root) return;
  const containers = root.querySelectorAll<HTMLElement>('[data-plantuml-source]');

  containers.forEach((container) => {
    const encoded = container.getAttribute('data-plantuml-source');

    if (!encoded) return;

    let text: string;

    try {
      text = decodeURIComponent(encoded);
    } catch (e) {
      return;
    }

    const img = container.querySelector<HTMLImageElement>('img');

    if (!img) return;

    try {
      bindUmlImgFallback(img, text);
      img.src = buildImgSrc(text, rendererURL, isDark);
    } catch (e) {
      // encoding error — leave the current image
    }
  });
}

/**
 * UML plugin
 * @param {Object} context - plugin context for communicating with editor
 * @param {Object} options - options for plugin
 * @param {string} [options.rendererURL] - url of plant uml renderer
 */
export default function umlPlugin(context: PluginContext, options: PluginOptions = {}): PluginInfo {
  ensureUmlStyles();
  const { rendererURL = DEFAULT_RENDERER_URL } = options;
  const instance = context.instance as any;

  function isDarkTheme(): boolean {
    try {
      return instance.getTheme?.() === 'dark';
    } catch (e) {
      return false;
    }
  }

  function getEditorRoots() {
    const elements = instance.getEditorElements?.();

    if (!elements) {
      return {
        previewRoot: null as HTMLElement | null,
        wysiwygRoot: null as HTMLElement | null,
      };
    }

    return {
      previewRoot: findContentsRoot((elements.mdPreview || null) as HTMLElement | null),
      wysiwygRoot: findContentsRoot((elements.wwEditor || null) as HTMLElement | null),
    };
  }

  let scheduled = false;
  let pendingThemeOverride: boolean | null = null;

  const scheduleUpdate = (themeOverride?: boolean, deferFrames = 1) => {
    if (typeof themeOverride === 'boolean') {
      pendingThemeOverride = themeOverride;
    }

    if (scheduled) {
      return;
    }

    scheduled = true;

    const framesToWait = Math.max(1, deferFrames);
    let frameCount = 0;

    const run = () => {
      frameCount += 1;

      if (frameCount < framesToWait) {
        requestAnimationFrame(run);
        return;
      }

      scheduled = false;

      const { previewRoot, wysiwygRoot } = getEditorRoots();
      const dark =
        pendingThemeOverride !== null
          ? pendingThemeOverride
          : detectDarkFromRoots(previewRoot, wysiwygRoot);

      pendingThemeOverride = null;

      updateUmlImagesIn(previewRoot, rendererURL, dark);
      updateUmlImagesIn(wysiwygRoot, rendererURL, dark);
    };

    requestAnimationFrame(run);
  };

  context.eventEmitter.listen('changeTheme', (theme: string) => {
    scheduleUpdate(theme === 'dark');
  });
  context.eventEmitter.listen('change', () => scheduleUpdate());
  context.eventEmitter.listen('changeMode', () => scheduleUpdate());
  context.eventEmitter.listen('load', () => scheduleUpdate());
  context.eventEmitter.listen('loadUI', () => scheduleUpdate());
  context.eventEmitter.listen('afterPreviewRender', () => scheduleUpdate());

  return {
    toHTMLRenderers: {
      uml(node: MdNode) {
        return createUMLTokens(node.literal!, rendererURL, isDarkTheme());
      },
      plantUml(node: MdNode) {
        return createUMLTokens(node.literal!, rendererURL, isDarkTheme());
      },
    },
  };
}
