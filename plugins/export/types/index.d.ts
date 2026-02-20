import type { PluginContext, PluginInfo } from '@techie_doubts/tui.editor.2026';

export interface PluginOptions {
  markdownFileName?: string;
  htmlFileName?: string;
  toolbarGroupIndex?: number;
  toolbarItemIndex?: number;
}

export default function exportPlugin(context: PluginContext, options?: PluginOptions): PluginInfo;
