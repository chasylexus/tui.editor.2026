import { getHTMLRenderers } from '@/renderers/toHTMLRenderers';
import { codeSyntaxHighlighting } from '@/plugins/codeSyntaxHighlighting';
import { createCodeSyntaxHighlightView } from '@/nodeViews/codeSyntaxHighlightView';

import type { PluginContext, PluginInfo } from '@techie_doubts/tui.editor.2026';
import { PluginOptions } from '@t/index';

export function codeSyntaxHighlightPlugin(
  context: PluginContext,
  options?: PluginOptions
): PluginInfo {
  if (options) {
    const { eventEmitter } = context;
    const { highlighter: prism } = options;

    eventEmitter.addEventType('showCodeBlockLanguages');
    eventEmitter.addEventType('selectLanguage');
    eventEmitter.addEventType('finishLanguageEditing');

    const { languages } = prism!;
    const registerdlanguages = Object.keys(languages).filter(
      (language) => typeof languages[language] !== 'function'
    );

    return {
      toHTMLRenderers: getHTMLRenderers(prism!),
      wysiwygPlugins: [() => codeSyntaxHighlighting(context, prism!)],
      wysiwygNodeViews: {
        codeBlock: createCodeSyntaxHighlightView(registerdlanguages),
      },
    };
  }
  return {};
}
