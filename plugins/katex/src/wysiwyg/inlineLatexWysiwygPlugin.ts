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
  stableContent: string | null;
  lineBreakPositions: number[];
  decorations: PluginContext['pmView']['DecorationSet'];
}

interface RepairedInlineLatexContent {
  content: string;
  insertedOffsets: number[];
}

function countLineBreaks(content: string) {
  return (content.match(/\n/g) || []).length;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getFlexibleLineMatcher(line: string) {
  const sample = line.trimStart().slice(0, 32);

  if (!sample) {
    return null;
  }

  let pattern = '';
  let previousWasSpace = false;
  let previousWasDigit = false;

  for (const char of sample) {
    if (/\s/.test(char)) {
      if (!previousWasSpace) {
        pattern += '\\s+';
        previousWasSpace = true;
      }
      previousWasDigit = false;
      continue;
    }

    if (/\d/.test(char)) {
      if (!previousWasDigit) {
        pattern += '\\d+';
        previousWasDigit = true;
      }
      previousWasSpace = false;
      continue;
    }

    pattern += escapeRegExp(char);
    previousWasSpace = false;
    previousWasDigit = false;
  }

  return new RegExp(pattern);
}

function findLineMarkerIndex(content: string, line: string) {
  const exactMarker = line.trimStart().slice(0, 32);

  if (exactMarker) {
    const exactIndex = content.indexOf(exactMarker);

    if (exactIndex >= 0) {
      return exactIndex;
    }
  }

  const matcher = getFlexibleLineMatcher(line);
  const match = matcher?.exec(content);

  return match?.index ?? -1;
}

function repairCollapsedInlineLatexLineBreaksDetailed(
  previousContent: string,
  nextContent: string
): RepairedInlineLatexContent {
  const previousBreakCount = countLineBreaks(previousContent);
  const nextBreakCount = countLineBreaks(nextContent);

  if (!previousBreakCount || nextBreakCount >= previousBreakCount) {
    return { content: nextContent, insertedOffsets: [] };
  }

  const previousLines = previousContent.split('\n');
  let repairedContent = nextContent;
  const insertedOffsets: number[] = [];

  previousLines.forEach((line, index) => {
    if (index === 0) {
      return;
    }

    const markerIndex = findLineMarkerIndex(repairedContent, line);

    if (markerIndex < 0) {
      return;
    }

    if (repairedContent[markerIndex - 1] !== '\n') {
      const replaceFrom =
        repairedContent[markerIndex - 1] === ' ' || repairedContent[markerIndex - 1] === '\u00a0'
          ? markerIndex - 1
          : markerIndex;
      const replacedSpace = replaceFrom !== markerIndex;

      repairedContent = `${repairedContent.slice(0, replaceFrom)}\n${repairedContent.slice(
        markerIndex
      )}`;

      if (!replacedSpace) {
        insertedOffsets.push(replaceFrom);
      }
    }
  });

  return { content: repairedContent, insertedOffsets };
}

function mapCollapsedOffsetToRepairedOffset(offset: number, insertedOffsets: number[]) {
  return (
    offset +
    insertedOffsets.reduce((sum, insertedOffset) => sum + (insertedOffset <= offset ? 1 : 0), 0)
  );
}

export function repairCollapsedInlineLatexLineBreaks(previousContent: string, nextContent: string) {
  return repairCollapsedInlineLatexLineBreaksDetailed(previousContent, nextContent).content;
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

function getInlineMathContentBreakPositions(range: InlineMathRange) {
  return getLineBreakPositions(range).filter(
    (pos, index, values) =>
      pos > range.from && pos < range.to && (index === 0 || values[index - 1] !== pos)
  );
}

function getEditingBreakPositions(
  range: InlineMathRange,
  editingLineBreakPositions: number[]
): number[] {
  const contentBreakPositions = getInlineMathContentBreakPositions(range);
  const stableBreakPositions = editingLineBreakPositions
    .filter(
      (pos, index, values) =>
        pos > range.from && pos < range.to && (index === 0 || values[index - 1] !== pos)
    )
    .sort((a, b) => a - b);

  if (!stableBreakPositions.length) {
    return contentBreakPositions;
  }

  return contentBreakPositions.length >= stableBreakPositions.length
    ? contentBreakPositions
    : stableBreakPositions;
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
  editingLineBreakPositions: number[],
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

      for (const breakPos of getEditingBreakPositions(
        { from, to, content },
        editingLineBreakPositions
      )) {
        decorations.push(
          DecorationAny.widget(
            breakPos,
            () => {
              const br = document.createElement('br');

              br.className = 'toastui-inline-latex-editing-break';
              br.setAttribute('contenteditable', 'false');
              br.setAttribute('aria-hidden', 'true');
              return br;
            },
            { side: -1 }
          )
        );
      }

      decorations.push(
        DecorationAny.widget(
          to,
          () => {
            const preview = document.createElement('span');

            preview.className = 'toastui-inline-latex-live-preview';
            preview.setAttribute('contenteditable', 'false');
            preview.setAttribute('spellcheck', 'false');
            preview.setAttribute('aria-hidden', 'true');
            preview.innerHTML = html;

            return preview;
          },
          { side: 1 }
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
                stableContent: null as string | null,
                lineBreakPositions: [] as number[],
                decorations: buildInlineLatexDecorations(state.doc, null, [], {
                  Decoration,
                  DecorationSetCtor,
                  inlineClassName,
                }),
              };
            },
            apply: (tr, value: InlineLatexPluginState) => {
              let { editRange, stableContent, lineBreakPositions } = value;
              const meta = tr.getMeta(pluginKey);

              if (meta?.type === 'setEditRange') {
                editRange = meta.range;
                stableContent = editRange?.content || null;
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
                  stableContent = null;
                  lineBreakPositions = [];
                } else {
                  const isNewEditSession =
                    !value.editRange ||
                    value.editRange.from !== editRange.from ||
                    value.editRange.mdBlockId !== editRange.mdBlockId;

                  if (isNewEditSession) {
                    stableContent = editRange.content;
                    lineBreakPositions = getLineBreakPositions(editRange);
                  } else {
                    const stableBreakCount = countLineBreaks(stableContent || '');
                    const currentBreakCount = countLineBreaks(editRange.content);

                    if (!stableContent || currentBreakCount >= stableBreakCount) {
                      stableContent = editRange.content;
                      lineBreakPositions = getLineBreakPositions(editRange);
                    }
                  }
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

              return { editRange, stableContent, lineBreakPositions, decorations };
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
              !oldPluginState?.editRange ||
              !oldPluginState.stableContent ||
              !oldPluginState.lineBreakPositions.length
            ) {
              return null;
            }

            const previousEditRange = oldPluginState.editRange;
            const fallbackRange = collectInlineMathRanges(newState.doc).find(
              (range) =>
                range.mdBlockId !== null &&
                previousEditRange?.mdBlockId !== null &&
                range.mdBlockId === previousEditRange.mdBlockId
            );
            const nextRange = pluginState?.editRange || fallbackRange;

            if (!nextRange) {
              return null;
            }

            const {
              content: repairedContent,
              insertedOffsets,
            } = repairCollapsedInlineLatexLineBreaksDetailed(
              oldPluginState.stableContent,
              nextRange.content
            );

            if (repairedContent === nextRange.content) {
              return null;
            }

            const currentSelection = newState.selection;
            const selectionInsideRange =
              currentSelection.empty &&
              currentSelection.from >= nextRange.from + 1 &&
              currentSelection.from <= nextRange.to - 1;
            const tr = newState.tr.insertText(
              repairedContent,
              nextRange.from + 1,
              nextRange.to - 1
            );

            if (selectionInsideRange) {
              const collapsedOffset = currentSelection.from - (nextRange.from + 1);
              const repairedOffset = mapCollapsedOffsetToRepairedOffset(
                collapsedOffset,
                insertedOffsets
              );
              const selectionPos = Math.min(
                nextRange.from + 1 + repairedOffset,
                nextRange.from + repairedContent.length + 1
              );

              tr.setSelection(TextSelection.create(tr.doc, selectionPos));
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
