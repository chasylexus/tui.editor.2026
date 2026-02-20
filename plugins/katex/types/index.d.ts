import type { PluginContext, PluginInfo } from '@techie_doubts/tui.editor.2026';

export interface PluginOptions {
  inlineClassName?: string;
  blockClassName?: string;
}

export default function katexPlugin(context: PluginContext, options?: PluginOptions): PluginInfo;
