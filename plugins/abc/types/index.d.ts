import type { PluginContext, PluginInfo } from '@techie_doubts/tui.editor.2026';

export interface PluginOptions {
  className?: string;
  renderOptions?: Record<string, unknown>;
}

export default function abcPlugin(context: PluginContext, options?: PluginOptions): PluginInfo;
