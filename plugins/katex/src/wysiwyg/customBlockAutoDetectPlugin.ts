import type { PluginContext, PluginInfo } from '@toast-ui/editor';
import { NodeSelection, TextSelection } from 'prosemirror-state';

const LATEX_KINDS = new Set(['latex']);
const CODE_FENCE_KINDS = new Set(['mermaid', 'uml', 'chart']);

function matchLatexInfo(text: string): string | null {
  const match = text.match(/^\s*\$\$(\w+)\s*$/);

  if (!match) return null;
  const info = match[1].toLowerCase();

  return LATEX_KINDS.has(info) ? info : null;
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
            const { customBlock, paragraph, codeBlock } = schema.nodes;

            if (!customBlock || !paragraph) return null;

            let pos = 0;

            for (let i = 0; i < doc.childCount; i += 1) {
              const node = doc.child(i);
              const from = pos;

              pos += node.nodeSize;

              // Detect $$latex + $$ paragraph pairs → customBlock
              if (i < doc.childCount - 1 && node.type === paragraph) {
                const next = doc.child(i + 1);

                if (next.type === paragraph) {
                  const info = matchLatexInfo(node.textContent || '');

                  if (info && isBlockEnd(next.textContent || '')) {
                    const replaceTo = from + node.nodeSize + next.nodeSize;
                    const blockNode = customBlock.create({ info });
                    const tail = paragraph.createAndFill() || paragraph.create();
                    const fragment = Fragment.fromArray([blockNode, tail]);
                    const tr = newState.tr.replaceWith(from, replaceTo, fragment);

                    tr.setSelection(NodeSelection.create(tr.doc, from));
                    tr.setMeta(pluginKey, true);
                    return tr;
                  }
                }
              }

              // Detect codeBlock with mermaid/uml/chart language → customBlock
              if (codeBlock && node.type === codeBlock) {
                const lang = String(node.attrs.language || '')
                  .trim()
                  .toLowerCase();

                if (CODE_FENCE_KINDS.has(lang)) {
                  const content = node.content.size > 0 ? node.content : null;
                  const blockNode = customBlock.create({ info: lang }, content);
                  const tr = newState.tr.replaceWith(from, from + node.nodeSize, blockNode);

                  tr.setSelection(NodeSelection.create(tr.doc, from));
                  tr.setMeta(pluginKey, true);
                  return tr;
                }
              }
            }

            return null;
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

              if (!kind) return false;
              if (selection.node.textContent.trim() !== '') return false;

              const { from, to } = selection;

              event.preventDefault();

              // LaTeX → revert to $$latex + $$ paragraphs
              if (LATEX_KINDS.has(kind)) {
                const { paragraph } = schema.nodes;

                if (!paragraph) return false;

                const first = paragraph.create(null, schema.text(`$$${kind}`));
                const second = paragraph.create(null, schema.text('$$'));
                const fragment = Fragment.fromArray([first, second]);
                const tr = state.tr.replaceWith(from, to, fragment);

                tr.setSelection(TextSelection.create(tr.doc, from + first.nodeSize - 1));
                view.dispatch(tr);
                return true;
              }

              // Mermaid/UML/Chart → revert to codeBlock
              if (CODE_FENCE_KINDS.has(kind)) {
                const { codeBlock } = schema.nodes;

                if (!codeBlock) return false;

                const newNode = codeBlock.create({ language: kind, lineNumber: null });
                const tr = state.tr.replaceWith(from, to, newNode);
                const cursorPos = from + 1;

                tr.setSelection(TextSelection.create(tr.doc, cursorPos));
                view.dispatch(tr);
                return true;
              }

              return false;
            },
          },
        }),
    ],
  };
}
