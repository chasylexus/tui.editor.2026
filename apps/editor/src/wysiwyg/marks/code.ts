import { Mark as ProsemirrorMark, DOMOutputSpec } from 'prosemirror-model';
import { Command, toggleMark } from 'prosemirror-commands';

import Mark from '@/spec/mark';
import { createTextSelection } from '@/helper/manipulation';
import { getCustomAttrs, getDefaultCustomAttrs } from '@/wysiwyg/helper/node';

import { EditorCommand } from '@t/spec';

interface BoundaryCursorState {
  from: number;
  marks: ProsemirrorMark[];
  targetInsideCode: boolean;
  atRightCodeBoundary: boolean;
}

export class Code extends Mark {
  get name() {
    return 'code';
  }

  get schema() {
    return {
      attrs: {
        rawHTML: { default: null },
        ...getDefaultCustomAttrs(),
      },
      parseDOM: [
        {
          tag: 'code',
          getAttrs(dom: Node | string) {
            const rawHTML = (dom as HTMLElement).getAttribute('data-raw-html');

            return {
              ...(rawHTML && { rawHTML }),
            };
          },
        },
      ],
      toDOM({ attrs }: ProsemirrorMark): DOMOutputSpec {
        return [attrs.rawHTML || 'code', getCustomAttrs(attrs)];
      },
    };
  }

  commands(): EditorCommand {
    return () => (state, dispatch) => toggleMark(state.schema.marks.code)(state, dispatch);
  }

  private hasCodeMark(marks: ProsemirrorMark[]) {
    return marks.some((mark) => mark.type.name === this.name);
  }

  private applyBoundaryCursorState(
    state: Parameters<Command>[0],
    dispatch: Parameters<Command>[1],
    view: Parameters<Command>[2],
    cursorState: BoundaryCursorState
  ) {
    if (!dispatch) {
      return true;
    }

    const { from, marks } = cursorState;

    // ProseMirror 1.18.x has an internal cursorWrapper mechanism: when
    // view.markCursor is set, updateCursorWrapper() inserts a placeholder
    // <img mark-placeholder="true"> as a widget decoration carrying these marks.
    // The rendering engine places the <img> inside or outside the <code> element
    // depending on the marks, giving the browser an unambiguous DOM position
    // for the caret — which is the only reliable way to override browser
    // caret-affinity at inline element boundaries.
    if (view) {
      (view as any).markCursor = marks;
    }

    const tr = state.tr.setSelection(createTextSelection(state.tr, from)).setStoredMarks(marks);

    dispatch(tr);

    // Clear markCursor after dispatch. The cursorWrapper created during
    // updateState persists in view.cursorWrapper until the next state update.
    if (view) {
      (view as any).markCursor = null;
    }

    return true;
  }

  private moveCursorOutOfCode(direction: 'left' | 'right'): Command {
    return (state, dispatch, view) => {
      const {
        selection: { empty, from, $from },
      } = state;
      const { storedMarks } = state;
      const currentMarks = $from.marks();
      const leftMarks = $from.nodeBefore?.marks ?? [];
      const rightMarks = $from.nodeAfter?.marks ?? [];
      const leftHasCode = this.hasCodeMark(leftMarks);
      const rightHasCode = this.hasCodeMark(rightMarks);
      const atRightCodeBoundary = leftHasCode && !rightHasCode;
      const atLeftCodeBoundary = !leftHasCode && rightHasCode;

      let insideCode: boolean;

      if (storedMarks) {
        insideCode = this.hasCodeMark(storedMarks);
      } else if (atRightCodeBoundary) {
        // The browser renders the caret inside code at the right boundary.
        // Use direction as a heuristic: pressing away from code (right)
        // means the user is inside and wants to exit; pressing toward
        // code interior (left) means approaching from outside to enter.
        insideCode = direction === 'right';
      } else if (atLeftCodeBoundary) {
        insideCode = false;
      } else {
        insideCode = this.hasCodeMark(currentMarks);
      }

      if (!empty) {
        return false;
      }

      if (direction === 'left' && from > 0 && !atRightCodeBoundary && !atLeftCodeBoundary) {
        const $leftPos = state.doc.resolve(from - 1);
        const leftPosLeftMarks = $leftPos.nodeBefore?.marks ?? [];
        const leftPosRightMarks = $leftPos.nodeAfter?.marks ?? [];
        const leftPosAtRightCodeBoundary =
          this.hasCodeMark(leftPosLeftMarks) && !this.hasCodeMark(leftPosRightMarks);
        const leftPosAtLeftCodeBoundary =
          !this.hasCodeMark(leftPosLeftMarks) && this.hasCodeMark(leftPosRightMarks);

        if (!insideCode && leftPosAtRightCodeBoundary) {
          return this.applyBoundaryCursorState(state, dispatch, view, {
            from: from - 1,
            marks: leftPosRightMarks,
            targetInsideCode: false,
            atRightCodeBoundary: true,
          });
        }

        if (insideCode && leftPosAtLeftCodeBoundary) {
          return this.applyBoundaryCursorState(state, dispatch, view, {
            from: from - 1,
            marks: leftPosRightMarks,
            targetInsideCode: true,
            atRightCodeBoundary: false,
          });
        }
      }

      if (direction === 'left' && insideCode && atRightCodeBoundary && from > 0) {
        const $leftPos = state.doc.resolve(from - 1);
        const leftPosLeftMarks = $leftPos.nodeBefore?.marks ?? [];
        const leftPosRightMarks = $leftPos.nodeAfter?.marks ?? [];
        const leftPosAtLeftCodeBoundary =
          !this.hasCodeMark(leftPosLeftMarks) && this.hasCodeMark(leftPosRightMarks);

        if (leftPosAtLeftCodeBoundary) {
          return this.applyBoundaryCursorState(state, dispatch, view, {
            from: from - 1,
            marks: leftPosRightMarks,
            targetInsideCode: true,
            atRightCodeBoundary: false,
          });
        }
      }

      if (!atRightCodeBoundary && !atLeftCodeBoundary) {
        return false;
      }

      if (insideCode && direction === 'right' && atRightCodeBoundary) {
        return this.applyBoundaryCursorState(state, dispatch, view, {
          from,
          marks: rightMarks,
          targetInsideCode: false,
          atRightCodeBoundary: true,
        });
      }

      if (insideCode && direction === 'left' && atLeftCodeBoundary) {
        return this.applyBoundaryCursorState(state, dispatch, view, {
          from,
          marks: leftMarks,
          targetInsideCode: false,
          atRightCodeBoundary: false,
        });
      }

      if (!insideCode && direction === 'right' && atLeftCodeBoundary) {
        return this.applyBoundaryCursorState(state, dispatch, view, {
          from,
          marks: rightMarks,
          targetInsideCode: true,
          atRightCodeBoundary: false,
        });
      }

      if (!insideCode && direction === 'left' && atRightCodeBoundary) {
        return this.applyBoundaryCursorState(state, dispatch, view, {
          from,
          marks: leftMarks,
          targetInsideCode: true,
          atRightCodeBoundary: true,
        });
      }

      return false;
    };
  }

  keymaps() {
    const codeCommand = this.commands()();

    return {
      'Shift-Mod-c': codeCommand,
      'Shift-Mod-C': codeCommand,
      ArrowLeft: this.moveCursorOutOfCode('left'),
      ArrowRight: this.moveCursorOutOfCode('right'),
    };
  }
}
