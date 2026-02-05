import type { PluginContext, PluginInfo } from '@toast-ui/editor';

export interface PluginOptions {
  inlineClassName?: string;
  blockClassName?: string;
}

export default function katexPlugin(context: PluginContext, options?: PluginOptions): PluginInfo;
