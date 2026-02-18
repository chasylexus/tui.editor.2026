/**
 * @fileoverview Implements uml plugin
 * @author NHN FE Development Lab <dl_javascript@nhn.com>
 */
import plantumlEncoder from 'plantuml-encoder';
import { PluginOptions } from '../index';

import type { MdNode, PluginContext, PluginInfo } from '@toast-ui/editor';
import type { HTMLToken } from '@toast-ui/toastmark';

const DEFAULT_RENDERER_URL = '//www.plantuml.com/plantuml/png/';
const DARK_PLANTUML_THEME = 'cyborg';

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

  return `${rendererURL}${plantumlEncoder.encode(themed)}`;
}

function createUMLTokens(text: string, rendererURL: string, isDark: boolean): HTMLToken[] {
  let renderedHTML;
  const source = encodeURIComponent(text);

  try {
    if (!plantumlEncoder) {
      throw new Error('plantuml-encoder dependency required');
    }
    renderedHTML = `<img src="${buildImgSrc(text, rendererURL, isDark)}" />`;
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
      previewRoot: (elements.mdPreview || null) as HTMLElement | null,
      wysiwygRoot: (elements.wwEditor || null) as HTMLElement | null,
    };
  }

  context.eventEmitter.listen('changeTheme', (theme: string) => {
    const dark = theme === 'dark';
    const { previewRoot, wysiwygRoot } = getEditorRoots();

    updateUmlImagesIn(previewRoot, rendererURL, dark);
    updateUmlImagesIn(wysiwygRoot, rendererURL, dark);
  });

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
