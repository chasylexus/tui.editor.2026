import type { PluginContext, PluginInfo } from '@techie_doubts/tui.editor.2026';

export interface PluginOptions {
  preset?: string[];
}

export default function colorPlugin(context: PluginContext, options: PluginOptions): PluginInfo;
