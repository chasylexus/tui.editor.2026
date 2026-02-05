import type { PluginContext, PluginInfo } from '@toast-ui/editor';

export interface PluginOptions {
  className?: string;
}

export default function mermaidPlugin(context: PluginContext, options?: PluginOptions): PluginInfo;
