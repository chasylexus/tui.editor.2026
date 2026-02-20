import type { PluginContext, PluginInfo } from '@techie_doubts/tui.editor.2026';

export interface PluginOptions {
  className?: string;
}

export default function mermaidPlugin(context: PluginContext, options?: PluginOptions): PluginInfo;
