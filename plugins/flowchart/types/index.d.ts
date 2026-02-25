import type { PluginContext, PluginInfo } from '@techie_doubts/tui.editor.2026';

export interface PluginOptions {
  className?: string;
  drawOptions?: Record<string, unknown>;
}

export default function flowchartPlugin(
  context: PluginContext,
  options?: PluginOptions
): PluginInfo;
