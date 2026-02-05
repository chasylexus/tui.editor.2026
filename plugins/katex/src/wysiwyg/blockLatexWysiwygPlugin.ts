import type { PluginContext, PluginInfo } from '@toast-ui/editor';
import type { Node as ProsemirrorNode } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import { renderKatexBlock } from '../utils/inlineMath';

interface ActiveLatexBlock {
  node: ProsemirrorNode;
  pos: number;
}

function findActiveLatexBlock(
  doc: EditorState['doc'],
  selection: EditorState['selection'] | null
): ActiveLatexBlock | null {
  if (!selection) return null;
  let active: ActiveLatexBlock | null = null;

  if (selection.node && selection.node.type?.name === 'customBlock') {
    const info = String(selection.node.attrs?.info || '').trim();
    const [kind] = info.split(/\s+/);

    if (kind === 'latex') {
      return { node: selection.node, pos: selection.from };
    }
  }

  doc.nodesBetween(selection.from, selection.to, (node, pos) => {
    if (node.type?.name !== 'customBlock') return true;
    const info = String(node.attrs?.info || '').trim();
    const [kind] = info.split(/\s+/);

    if (kind !== 'latex') return true;
    active = { node, pos };
    return false;
  });

  return active;
}

function buildBlockLatexDecorations(
  doc: EditorState['doc'],
  Decoration: PluginContext['pmView']['Decoration'],
  DecorationSetCtor: PluginContext['pmView']['DecorationSet'],
  activeBlock: ActiveLatexBlock | null
): PluginContext['pmView']['DecorationSet'] {
  const decorations: any[] = [];
  const DecorationAny = Decoration as any;
  const DecorationSetAny = DecorationSetCtor as any;

  if (activeBlock) {
    const { node, pos } = activeBlock;
    const html = renderKatexBlock(node.textContent || '');

    decorations.push(
      DecorationAny.widget(
        pos + node.nodeSize,
        () => {
          const wrapper = document.createElement('div');

          wrapper.className = 'toastui-block-latex-preview';
          wrapper.setAttribute('contenteditable', 'false');
          wrapper.setAttribute('spellcheck', 'false');
          wrapper.setAttribute('aria-hidden', 'true');
          wrapper.style.margin = '8px 0 16px';
          wrapper.style.padding = '8px 10px';
          wrapper.style.borderRadius = '8px';
          wrapper.style.background = '#fff';
          wrapper.style.border = '1px solid rgba(0, 0, 0, 0.08)';
          wrapper.style.boxShadow = '0 6px 18px rgba(0, 0, 0, 0.08)';
          wrapper.style.overflowX = 'auto';
          wrapper.innerHTML = html;
          return wrapper;
        },
        { side: -1 }
      )
    );
  }

  return DecorationSetAny.create(doc, decorations);
}

export function createBlockLatexWysiwygPlugin(context: PluginContext): PluginInfo {
  const { Plugin, PluginKey } = context.pmState;
  const { Decoration, DecorationSet } = context.pmView;
  const pluginKey = new PluginKey('blockLatexWysiwygPreview');

  const isLatexCustomBlock = (node: any) => {
    if (!node || node.type?.name !== 'customBlock') return false;
    const info = String(node.attrs?.info || '').trim();
    const [kind] = info.split(/\s+/);

    return kind === 'latex';
  };

  const findLatexBlockAtSelection = (state: EditorState) => {
    const { selection } = state;

    if (!selection) return null;

    if (selection.node && isLatexCustomBlock(selection.node)) {
      return { node: selection.node, pos: selection.from };
    }

    const { $from } = selection;

    for (let d = $from.depth; d >= 0; d -= 1) {
      const node = $from.node(d);

      if (isLatexCustomBlock(node)) {
        const pos = $from.before(d);

        return { node, pos };
      }
    }

    return null;
  };

  return {
    wysiwygPlugins: [
      () =>
        new Plugin({
          key: pluginKey,
          state: {
            init: (_, state) => {
              const active = findActiveLatexBlock(state.doc, state.selection);

              return {
                active,
                decorations: buildBlockLatexDecorations(
                  state.doc,
                  Decoration,
                  DecorationSet,
                  active
                ),
              };
            },
            apply: (tr, value) => {
              let { active } = value;

              if (tr.docChanged || tr.selectionSet) {
                active = findActiveLatexBlock(tr.doc, tr.selection);
              }

              const decorations =
                tr.docChanged || tr.selectionSet
                  ? buildBlockLatexDecorations(tr.doc, Decoration, DecorationSet, active)
                  : value.decorations;

              return { active, decorations };
            },
          },
          props: {
            decorations(state) {
              return this.getState(state).decorations;
            },
          },
          view: () => {
            let lastOpenedPos: number | null = null;

            return {
              update: (nextView, prevState) => {
                const { selection } = nextView.state;
                const prevSelection = prevState.selection;

                if (selection === prevSelection) return;

                const block = findLatexBlockAtSelection(nextView.state);

                if (!block) {
                  lastOpenedPos = null;
                  return;
                }

                const { pos } = block;

                if (lastOpenedPos === pos) return;

                const nodeDom = nextView.nodeDOM(pos);

                if (!(nodeDom instanceof HTMLElement)) return;

                const editorEl = nodeDom.querySelector('.toastui-editor-custom-block-editor');
                const editorVisible = editorEl && getComputedStyle(editorEl).display !== 'none';

                if (editorVisible) {
                  lastOpenedPos = pos;
                  return;
                }

                const button = nodeDom.querySelector(
                  '.toastui-editor-custom-block-view .tool button'
                );

                if (button instanceof HTMLElement) {
                  button.click();
                  lastOpenedPos = pos;
                }
              },
            };
          },
        }),
    ],
  };
}
