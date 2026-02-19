import type { PluginContext, PluginInfo } from '@toast-ui/editor';
import { NodeSelection, TextSelection } from 'prosemirror-state';

const SUPPORTED_KINDS = new Set(['latex', 'chart', 'mermaid', 'uml']);

function matchInfo(text: string): string | null {
  const match = text.match(/^\s*\$\$(\w+)\s*$/);

  if (!match) return null;
  const info = match[1].toLowerCase();

  return SUPPORTED_KINDS.has(info) ? info : null;
}

function isBlockEnd(text: string): boolean {
  return /^\s*\$\$\s*$/.test(text);
}

export function createCustomBlockAutoDetectPlugin(context: PluginContext): PluginInfo {
  const { Plugin, PluginKey } = context.pmState;
  const { Fragment } = context.pmModel;
  const pluginKey = new PluginKey('customBlockAutoDetect');

  return {
    wysiwygPlugins: [
      () =>
        new Plugin({
          key: pluginKey,
          appendTransaction(trs, _oldState, newState) {
            if (!trs.some((tr) => tr.docChanged)) return null;
            if (trs.some((tr) => tr.getMeta(pluginKey))) return null;

            const { doc, schema } = newState;
            const { customBlock, paragraph } = schema.nodes;

            if (!customBlock || !paragraph) return null;

            let pos = 0;
            let tr = null;

            for (let i = 0; i < doc.childCount - 1; i += 1) {
              const node = doc.child(i);
              const next = doc.child(i + 1);
              const from = pos;

              pos += node.nodeSize;

              if (node.type !== paragraph || next.type !== paragraph) {
                continue;
              }

              const info = matchInfo(node.textContent || '');

              if (!info) continue;
              if (!isBlockEnd(next.textContent || '')) continue;

              const replaceFrom = from;
              const replaceTo = from + node.nodeSize + next.nodeSize;
              const blockNode = customBlock.create({ info });
              const tailParagraph = paragraph.createAndFill() || paragraph.create();
              const fragment = Fragment.fromArray([blockNode, tailParagraph]);

              tr = (tr || newState.tr).replaceWith(replaceFrom, replaceTo, fragment);

              if (NodeSelection?.create) {
                tr.setSelection(NodeSelection.create(tr.doc, replaceFrom));
              } else if (TextSelection?.create) {
                tr.setSelection(TextSelection.create(tr.doc, replaceFrom + 1));
              }

              tr.setMeta(pluginKey, true);
              break;
            }

            return tr;
          },
          props: {
            handleKeyDown(view, event) {
              if (event.key !== 'Backspace') return false;

              const { state } = view;
              const { selection, schema } = state;

              if (
                !(selection instanceof NodeSelection) ||
                selection.node.type?.name !== 'customBlock'
              ) {
                return false;
              }

              const info = String(selection.node.attrs?.info || '').trim();
              const [kind] = info.split(/\s+/);

              if (!SUPPORTED_KINDS.has(kind)) return false;
              if (selection.node.textContent.trim() !== '') return false;

              const { paragraph } = schema.nodes;

              if (!paragraph) return false;

              event.preventDefault();

              const { from, to } = selection;
              const first = paragraph.create(null, schema.text(`$$${kind}`));
              const second = paragraph.create(null, schema.text('$$'));
              const fragment = Fragment.fromArray([first, second]);

              const tr = state.tr.replaceWith(from, to, fragment);
              const cursorPos = from + first.nodeSize - 1;

              tr.setSelection(TextSelection.create(tr.doc, cursorPos));
              view.dispatch(tr);

              return true;
            },
          },
        }),
    ],
  };
}
