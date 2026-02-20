/**
 * @fileoverview Implements KaTeX plugin
 * @author NHN FE Development Lab <dl_javascript@nhn.com>
 */
import type { MdNode, PluginContext, PluginInfo } from '@techie_doubts/tui.editor.2026';
import type { HTMLToken } from '@techie_doubts/toastmark';
import {
  fixInlineMathBackslashes,
  getInlineMath,
  normalizeInlineMathEscapes,
  renderKatexBlock,
} from './utils/inlineMath';
import { createBlockLatexWysiwygPlugin } from './wysiwyg/blockLatexWysiwygPlugin';
import { createCustomBlockAutoDetectPlugin } from './wysiwyg/customBlockAutoDetectPlugin';
import { createInlineLatexWysiwygPlugin } from './wysiwyg/inlineLatexWysiwygPlugin';

const DEFAULT_INLINE_CLASS = 'toastui-inline-latex-render';
const DEFAULT_BLOCK_CLASS = 'toastui-block-latex';

export interface PluginOptions {
  inlineClassName?: string;
  blockClassName?: string;
}

function createBlockTokens(html: string, blockClassName: string): HTMLToken[] {
  return [
    {
      type: 'openTag',
      tagName: 'div',
      outerNewLine: true,
      attributes: { class: blockClassName },
    },
    { type: 'html', content: html },
    { type: 'closeTag', tagName: 'div', outerNewLine: true },
  ];
}

/**
 * KaTeX plugin
 * @param {Object} context - plugin context for communicating with editor
 * @param {Object} options - options for plugin
 */
export default function katexPlugin(
  context: PluginContext,
  options: PluginOptions = {}
): PluginInfo {
  const inlineClassName = options.inlineClassName || DEFAULT_INLINE_CLASS;
  const blockClassName = options.blockClassName || DEFAULT_BLOCK_CLASS;

  const inlinePluginInfo = createInlineLatexWysiwygPlugin(context, inlineClassName);
  const blockPluginInfo = createBlockLatexWysiwygPlugin(context);
  const autoDetectPluginInfo = createCustomBlockAutoDetectPlugin(context);

  context.eventEmitter.listen('beforeConvertWysiwygToMarkdown', (markdownText) => {
    // Example: "text $a\\_b$ text" -> "text $a_b$ text"
    // Example: "text a\\_b" -> unchanged
    // Example: "$$ a\\_b $$" -> unchanged
    const normalized = normalizeInlineMathEscapes(markdownText);

    return fixInlineMathBackslashes(normalized);
  });

  const inlineWysiwygPlugins = inlinePluginInfo.wysiwygPlugins || [];
  const blockWysiwygPlugins = blockPluginInfo.wysiwygPlugins || [];
  const autoDetectWysiwygPlugins = autoDetectPluginInfo.wysiwygPlugins || [];

  return {
    ...inlinePluginInfo,
    wysiwygPlugins: [...inlineWysiwygPlugins, ...blockWysiwygPlugins, ...autoDetectWysiwygPlugins],
    toHTMLRenderers: {
      // block latex: $$latex ... $$
      latex(node: MdNode) {
        const html = renderKatexBlock(node.literal || '');

        return createBlockTokens(html, blockClassName);
      },
      // inline latex: $...$ in preview/split
      text(node: MdNode) {
        const str = getInlineMath(node);
        const isNodeHTML = str?.includes('class="katex"') || str?.includes('class="katex-display"');

        return { type: isNodeHTML ? 'html' : 'text', content: str };
      },
      softbreak(node: MdNode) {
        const isPrevNodeHTML = node.prev && node.prev.type === 'htmlInline';
        const isPrevBR = isPrevNodeHTML && /<br ?\/?>/.test(node.prev?.literal || '');

        let prevLiteral = '';

        if (node?.prev !== null) {
          prevLiteral = (node?.prev?.literal as string) || '';
        }

        let content = '<br>\n';

        if (prevLiteral === '$') {
          content = '';
        } else if (isPrevBR) {
          content = '\n';
        }

        return { type: isPrevBR ? 'text' : 'html', content };
      },
    },
  };
}
