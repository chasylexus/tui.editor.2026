import type { PluginContext, PluginInfo } from '@toast-ui/editor';

export interface PluginOptions {
  markdownFileName?: string;
  htmlFileName?: string;
  toolbarGroupIndex?: number;
  toolbarItemIndex?: number;
}

export default function exportPlugin(context: PluginContext, options?: PluginOptions): PluginInfo;
