import type { PluginInfo, PluginContext } from '@techie_doubts/tui.editor.2026';
import type { Node as ProsemirrorNode, Mark as ProsemirrorMark } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import { renderKatexInline } from '../utils/inlineMath';

interface InlineMathRange {
  from: number;
  to: number;
  content: string;
  mdBlockId?: number | null;
}

interface InlineLatexPluginState {
  editRange: InlineMathRange | null;
  lineBreakPositions: number[];
  decorations: PluginContext['pmView']['DecorationSet'];
}

function getLineBreakPositions(range: InlineMathRange | null) {
  if (!range || !range.content.includes('\n')) {
    return [] as number[];
  }

  const positions: number[] = [];

  for (let idx = 0; idx < range.content.length; idx += 1) {
    if (range.content[idx] === '\n') {
      // +1 skips the leading '$' in "$...$"
      positions.push(range.from + 1 + idx);
    }
  }

  return positions;
}

function getInlineFontStyle() {
  const editorEl =
    document.querySelector('.toastui-editor-contents') ||
    document.querySelector('.toastui-editor-ww-container');
  const style = editorEl ? getComputedStyle(editorEl) : getComputedStyle(document.body);

  return style.font || `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
}

function measureInlineTextWidth(text: string) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) return text.length * 8;

  ctx.font = getInlineFontStyle();
  return ctx.measureText(text).width;
}

function collectInlineMathRanges(doc: EditorState['doc']): InlineMathRange[] {
  const ranges: InlineMathRange[] = [];
  let pending: { from: number; content: string; mdBlockId: number | null } | null = null;

  doc.descendants((node: ProsemirrorNode, pos: number, parent?: ProsemirrorNode | null) => {
    if (node.type?.name === 'codeBlock') {
      pending = null;
      return false;
    }

    if (node.isBlock && node.type?.name !== 'doc') {
      const blockId =
        typeof (node.attrs as any)?.mdBlockId === 'number' ? (node.attrs as any).mdBlockId : null;

      if (
        pending &&
        pending.mdBlockId !== null &&
        blockId !== null &&
        pending.mdBlockId === blockId
      ) {
        pending.content += '\n';
      } else {
        pending = null;
      }
    }

    if (!node.isText) return true;
    if (node.marks?.some((mark: ProsemirrorMark) => mark.type?.name === 'code')) return true;

    const text = node.text || '';
    const blockId =
      typeof (parent?.attrs as any)?.mdBlockId === 'number'
        ? (parent?.attrs as any).mdBlockId
        : null;

    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      const next = text[i + 1];
      const prev = i > 0 ? text[i - 1] : '';

      if (ch !== '$') {
        if (pending) pending.content += ch;
        continue;
      }

      if (prev === '\\') {
        if (pending) pending.content += ch;
        continue;
      }

      if (next === '$') {
        if (pending) pending.content += '$$';
        i += 1;
        continue;
      }

      if (!pending) {
        pending = { from: pos + i, content: '', mdBlockId: blockId };
        continue;
      }

      const to = pos + i + 1;
      const { content } = pending;

      ranges.push({ from: pending.from, to, content, mdBlockId: pending.mdBlockId });
      pending = null;
    }

    return true;
  });

  return ranges;
}

interface InlineDecorationBuildContext {
  Decoration: PluginContext['pmView']['Decoration'];
  DecorationSetCtor: PluginContext['pmView']['DecorationSet'];
  inlineClassName: string;
}

function buildInlineLatexDecorations(
  doc: EditorState['doc'],
  editingRange: InlineMathRange | null,
  _editingLineBreakPositions: number[],
  context: InlineDecorationBuildContext
): PluginContext['pmView']['DecorationSet'] {
  const decorations: any[] = [];
  const { Decoration, DecorationSetCtor, inlineClassName } = context;
  const DecorationAny = Decoration as any;
  const DecorationSetAny = DecorationSetCtor as any;
  const ranges = collectInlineMathRanges(doc);

  ranges.forEach(({ from, to, content }) => {
    const raw = content.trim();

    if (!raw) return;

    const isEditing = !!editingRange && editingRange.from === from && editingRange.to === to;

    const html = renderKatexInline(raw);

    if (isEditing) {
      decorations.push(
        DecorationAny.inline(from, to, {
          class: 'toastui-inline-latex-editing',
          style: 'background: rgba(255, 229, 100, 0.25); border-radius: 4px;',
          spellcheck: 'false',
        })
      );

      // Render line breaks explicitly in edit mode to avoid browser-dependent
      // collapsing of newline chars inside inline contenteditable spans.
      for (let idx = 0; idx < content.length; idx += 1) {
        if (content[idx] !== '\n') {
          continue;
        }

        const breakPos = from + 1 + idx;

        decorations.push(
          DecorationAny.widget(
            breakPos,
            () => {
              const br = document.createElement('span');

              br.className = 'toastui-inline-latex-editing-break';
              br.setAttribute('contenteditable', 'false');
              br.setAttribute('aria-hidden', 'true');
              br.textContent = '\u200b';
              return br;
            },
            { side: -1 }
          )
        );
      }

      decorations.push(
        DecorationAny.widget(
          from,
          () => {
            const wrapper = document.createElement('span');
            const tooltip = document.createElement('span');

            wrapper.className = 'toastui-inline-latex-tooltip-anchor';
            wrapper.setAttribute('contenteditable', 'false');
            wrapper.setAttribute('spellcheck', 'false');
            wrapper.setAttribute('aria-hidden', 'true');
            wrapper.style.position = 'relative';
            wrapper.style.display = 'inline-block';
            wrapper.style.pointerEvents = 'none';
            wrapper.style.userSelect = 'none';

            tooltip.className = 'toastui-inline-latex-tooltip';
            tooltip.style.position = 'absolute';
            tooltip.style.left = `${Math.max(0, measureInlineTextWidth(`$${raw}$`) / 2)}px`;
            tooltip.style.top = 'calc(100% + 6px)';
            tooltip.style.transform = 'translateX(-50%)';
            tooltip.style.zIndex = '50';
            tooltip.style.background = '#fff';
            tooltip.style.border = '1px solid rgba(0, 0, 0, 0.15)';
            tooltip.style.boxShadow = '0 10px 24px rgba(0, 0, 0, 0.18)';
            tooltip.style.borderRadius = '8px';
            tooltip.style.padding = '6px 8px';
            tooltip.style.whiteSpace = 'nowrap';
            tooltip.innerHTML = html;
            wrapper.appendChild(tooltip);
            return wrapper;
          },
          { side: -1 }
        )
      );
    } else {
      decorations.push(
        DecorationAny.inline(from, to, {
          style:
            'display: inline-block; width: 0; overflow: hidden; white-space: nowrap; font-size: 0; line-height: 0; letter-spacing: 0; text-decoration: none;',
          spellcheck: 'false',
          'aria-hidden': 'true',
        })
      );

      decorations.push(
        DecorationAny.widget(
          from,
          () => {
            const span = document.createElement('span');

            span.className = inlineClassName;
            span.setAttribute('contenteditable', 'false');
            span.setAttribute('spellcheck', 'false');
            span.setAttribute('aria-hidden', 'true');
            span.style.display = 'inline-block';
            span.style.verticalAlign = 'middle';
            span.style.pointerEvents = 'none';
            span.style.userSelect = 'none';
            span.innerHTML = html;
            return span;
          },
          { side: -1 }
        )
      );
    }
  });

  return DecorationSetAny.create(doc, decorations);
}

export function createInlineLatexWysiwygPlugin(
  context: PluginContext,
  inlineClassName: string
): PluginInfo {
  const { Plugin, PluginKey, TextSelection } = context.pmState;

  const { Decoration, DecorationSet: DecorationSetCtor } = context.pmView;
  const pluginKey = new PluginKey('inlineLatexWysiwyg');

  const setEditRange = (range: InlineMathRange | null) => {
    return { type: 'setEditRange', range };
  };

  return {
    wysiwygPlugins: [
      () =>
        new Plugin({
          key: pluginKey,
          state: {
            init: (_, state) => {
              return {
                editRange: null as InlineMathRange | null,
                lineBreakPositions: [] as number[],
                decorations: buildInlineLatexDecorations(state.doc, null, [], {
                  Decoration,
                  DecorationSetCtor,
                  inlineClassName,
                }),
              };
            },
            apply: (tr, value: InlineLatexPluginState) => {
              let { editRange, lineBreakPositions } = value;
              const meta = tr.getMeta(pluginKey);

              if (meta?.type === 'setEditRange') {
                editRange = meta.range;
                lineBreakPositions = getLineBreakPositions(editRange);
              }

              if (editRange && tr.mapping) {
                const mappedFrom = tr.mapping.map(editRange.from, 1);
                const mappedTo = tr.mapping.map(editRange.to, -1);

                if (mappedFrom >= mappedTo) {
                  editRange = null;
                  lineBreakPositions = [];
                } else {
                  editRange = { ...editRange, from: mappedFrom, to: mappedTo };
                  lineBreakPositions = lineBreakPositions
                    .map((pos) => tr.mapping.map(pos, -1))
                    .filter((pos) => pos > mappedFrom && pos < mappedTo);
                }
              }

              if (!meta) {
                const { selection } = tr;
                const { head, empty, from, to } = selection;

                const ranges = collectInlineMathRanges(tr.doc);

                if (typeof head === 'number' && empty) {
                  const nextRange = ranges.find((r) => head >= r.from && head <= r.to);

                  editRange = nextRange || null;
                } else {
                  const inRange = ranges.find((r) => from >= r.from && to <= r.to);

                  editRange = inRange || null;
                }

                if (!editRange) {
                  lineBreakPositions = [];
                } else if (!value.editRange || value.editRange.from !== editRange.from) {
                  lineBreakPositions = getLineBreakPositions(editRange);
                }
              }

              const prev = value.editRange;
              const editChanged =
                (prev && !editRange) ||
                (!prev && editRange) ||
                (prev && editRange && (prev.from !== editRange.from || prev.to !== editRange.to));

              const decorations =
                tr.docChanged || meta || tr.selectionSet || editChanged
                  ? buildInlineLatexDecorations(tr.doc, editRange, lineBreakPositions, {
                      Decoration,
                      DecorationSetCtor,
                      inlineClassName,
                    })
                  : value.decorations;

              return { editRange, lineBreakPositions, decorations };
            },
          },
          appendTransaction(transactions, oldState, newState) {
            if (!transactions.some((tr) => tr.docChanged)) {
              return null;
            }
            if (
              transactions.some(
                (tr) => tr.getMeta(pluginKey)?.type === 'normalizeInlineMathSoftbreaks'
              )
            ) {
              return null;
            }

            const oldPluginState = pluginKey.getState(oldState) as
              | InlineLatexPluginState
              | undefined;
            const pluginState = pluginKey.getState(newState) as InlineLatexPluginState | undefined;

            if (
              !pluginState?.editRange ||
              !oldPluginState?.editRange ||
              !oldPluginState.lineBreakPositions.length
            ) {
              return null;
            }

            const { doc, tr } = newState;
            let changed = false;
            const mappedBreaks = oldPluginState.lineBreakPositions.map((position) => {
              let mappedPosition = position;

              transactions.forEach((tx) => {
                mappedPosition = tx.mapping.map(mappedPosition, -1);
              });

              return mappedPosition;
            });
            const targetPositions = mappedBreaks
              .filter((pos) => pos > pluginState.editRange!.from && pos < pluginState.editRange!.to)
              .sort((a, b) => b - a);

            targetPositions.forEach((pos) => {
              if (pos <= 0 || pos > doc.content.size) {
                return;
              }

              const ch = doc.textBetween(pos, pos + 1, '', '');
              const prev = pos > 0 ? doc.textBetween(pos - 1, pos, '', '') : '';
              const next = doc.textBetween(pos + 1, pos + 2, '', '');

              if (ch === '\n' || prev === '\n' || next === '\n') {
                return;
              }

              if (ch === ' ' || ch === '\u00a0' || ch === '') {
                tr.insertText('\n', pos, ch ? pos + 1 : pos);
                changed = true;
              } else {
                tr.insertText(`\n${ch}`, pos, pos + 1);
                changed = true;
              }
            });

            if (!changed) {
              return null;
            }

            tr.setMeta(pluginKey, { type: 'normalizeInlineMathSoftbreaks' });

            return tr;
          },
          props: {
            decorations(state) {
              return this.getState(state).decorations;
            },
            handleClick(view, pos, event) {
              const { clientX, clientY } = event;
              const coords = { left: clientX, top: clientY };
              const at = view.posAtCoords(coords);

              if (!at) return false;

              const ranges = collectInlineMathRanges(view.state.doc);
              const range = ranges.find((r) => at.pos >= r.from && at.pos <= r.to);

              if (!range) return false;

              const state = pluginKey.getState(view.state);

              if (state?.editRange) return false;

              const tr = view.state.tr.setMeta(pluginKey, setEditRange(range));
              const clampedPos = Math.min(Math.max(at.pos, range.from + 1), range.to - 1);

              if (clampedPos > range.from && clampedPos < range.to) {
                tr.setSelection(TextSelection.create(view.state.doc, clampedPos));
              }

              view.dispatch(tr);
              view.focus();
              return true;
            },
            handleDOMEvents: {
              mousedown(view, event) {
                const state = pluginKey.getState(view.state);

                if (!state?.editRange) return false;

                const target = event.target as HTMLElement | null;

                if (target && target.closest?.('.toastui-inline-latex-tooltip')) return false;

                const { clientX, clientY } = event;
                const pos = view.posAtCoords({ left: clientX, top: clientY });

                if (!pos) {
                  const tr = view.state.tr.setMeta(pluginKey, setEditRange(null));

                  view.dispatch(tr);
                  return false;
                }

                const inside = pos.pos >= state.editRange.from && pos.pos <= state.editRange.to;

                if (!inside) {
                  const tr = view.state.tr.setMeta(pluginKey, setEditRange(null));

                  view.dispatch(tr);
                }
                return false;
              },
            },
          },
        }),
    ],
  };
}
