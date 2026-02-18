import { DOMOutputSpec, ProsemirrorNode } from 'prosemirror-model';
import { Command, setBlockType } from 'prosemirror-commands';
import { Transaction } from 'prosemirror-state';

import NodeSchema from '@/spec/node';
import { createTextSelection } from '@/helper/manipulation';
import { changeList } from '@/wysiwyg/command/list';
import { getDefaultCustomAttrs, getCustomAttrs } from '@/wysiwyg/helper/node';

const BULLET_LIST_MARKERS = new Set(['-', '+', '*']);
const BACKTICK = '`';
const EMPTY_INLINE_CODE_MARKER = '``';
const ORDERED_LIST_RE = /^(\d+)\.$/;

export class Paragraph extends NodeSchema {
  get name() {
    return 'paragraph';
  }

  get schema() {
    return {
      content: 'inline*',
      group: 'block',
      attrs: {
        ...getDefaultCustomAttrs(),
      },
      parseDOM: [{ tag: 'p' }],
      toDOM({ attrs }: ProsemirrorNode): DOMOutputSpec {
        return ['p', getCustomAttrs(attrs), 0];
      },
    };
  }

  private makeBulletListByMarker(): Command {
    return (state, dispatch) => {
      const {
        selection: { $from, empty },
        schema,
      } = state;
      const { paragraph, bulletList } = schema.nodes;
      const bulletListCommand = changeList(bulletList);

      if (!empty || $from.parent.type !== paragraph || $from.parentOffset !== 1) {
        return false;
      }

      const marker = $from.parent.textBetween(0, $from.parent.content.size, '', '');

      if (!BULLET_LIST_MARKERS.has(marker) || !dispatch) {
        return false;
      }

      const runBulletListCommand = (): { commandResult: boolean; tr: Transaction | null } => {
        let tr: Transaction | null = null;
        const commandResult = bulletListCommand(state, (nextTr) => {
          tr = nextTr;
        });

        return { commandResult, tr };
      };
      const { commandResult, tr } = runBulletListCommand();

      if (!commandResult || !tr) {
        return false;
      }
      const trFromCommand = tr;

      const {
        selection: { from },
      } = trFromCommand;
      const currentText = trFromCommand.selection.$from.parent.textBetween(
        0,
        trFromCommand.selection.$from.parent.content.size,
        '',
        ''
      );

      if (
        trFromCommand.selection.$from.parent.type === paragraph &&
        trFromCommand.selection.$from.parentOffset === 1 &&
        BULLET_LIST_MARKERS.has(currentText)
      ) {
        trFromCommand
          .delete(from - 1, from)
          .setSelection(createTextSelection(trFromCommand, from - 1));
      }

      // Preserve the typed marker character as the bulletChar attribute
      const $pos = trFromCommand.selection.$from;

      for (let d = $pos.depth; d > 0; d -= 1) {
        if ($pos.node(d).type === bulletList) {
          trFromCommand.setNodeMarkup($pos.before(d), null, {
            ...$pos.node(d).attrs,
            bulletChar: marker,
          });
          break;
        }
      }

      dispatch(trFromCommand.scrollIntoView());

      return true;
    };
  }

  private makeOrderedListByNumber(): Command {
    return (state, dispatch) => {
      const {
        selection: { $from, empty },
        schema,
      } = state;
      const { paragraph, orderedList } = schema.nodes;
      const orderedListCommand = changeList(orderedList);

      if (!empty || $from.parent.type !== paragraph) {
        return false;
      }

      const text = $from.parent.textBetween(0, $from.parent.content.size, '', '');
      const match = text.match(ORDERED_LIST_RE);

      if (!match || !dispatch) {
        return false;
      }

      const runOrderedListCommand = (): { commandResult: boolean; tr: Transaction | null } => {
        let tr: Transaction | null = null;
        const commandResult = orderedListCommand(state, (nextTr) => {
          tr = nextTr;
        });

        return { commandResult, tr };
      };
      const { commandResult, tr } = runOrderedListCommand();

      if (!commandResult || !tr) {
        return false;
      }
      const trFromCommand = tr;

      const {
        selection: { from },
      } = trFromCommand;
      const currentText = trFromCommand.selection.$from.parent.textBetween(
        0,
        trFromCommand.selection.$from.parent.content.size,
        '',
        ''
      );
      const currentMatch = currentText.match(ORDERED_LIST_RE);

      if (trFromCommand.selection.$from.parent.type === paragraph && currentMatch) {
        trFromCommand
          .delete(from - currentText.length, from)
          .setSelection(createTextSelection(trFromCommand, from - currentText.length));
      }

      const $pos = trFromCommand.selection.$from;

      for (let d = $pos.depth; d > 0; d -= 1) {
        if ($pos.node(d).type === orderedList) {
          trFromCommand.setNodeMarkup($pos.before(d), null, {
            ...$pos.node(d).attrs,
            order: 1,
          });
          break;
        }
      }

      dispatch(trFromCommand.scrollIntoView());

      return true;
    };
  }

  private makeCodeByBacktick(): Command {
    return (state, dispatch) => {
      const {
        selection: { $from, from, empty },
        schema,
        tr: stateTr,
        doc,
      } = state;
      const { paragraph, codeBlock } = schema.nodes;

      if (!empty || $from.parent.type !== paragraph || !dispatch) {
        return false;
      }

      const isBetweenBacktickPair =
        from > 0 &&
        doc.textBetween(from - 1, from, '', '') === BACKTICK &&
        doc.textBetween(from, from + 1, '', '') === BACKTICK;

      // Keep one auto-inserted closing backtick and move caret past it.
      if (isBetweenBacktickPair) {
        dispatch(stateTr.setSelection(createTextSelection(stateTr, from + 1)).scrollIntoView());

        return true;
      }

      const text = $from.parent.textBetween(0, $from.parent.content.size, '', '');

      if (
        text === EMPTY_INLINE_CODE_MARKER &&
        $from.parentOffset === EMPTY_INLINE_CODE_MARKER.length
      ) {
        const codeBlockCommand = setBlockType(codeBlock);
        const runCodeBlockCommand = (): {
          commandResult: boolean;
          transaction: Transaction | null;
        } => {
          let transaction: Transaction | null = null;
          const commandResult = codeBlockCommand(state, (nextTr: Transaction) => {
            transaction = nextTr;
          });

          return { commandResult, transaction };
        };
        const { commandResult, transaction } = runCodeBlockCommand();

        if (!commandResult || !transaction) {
          return false;
        }

        const trFromCommand = transaction;
        const {
          selection: { from: commandSelectionFrom },
        } = trFromCommand;
        const currentText = trFromCommand.selection.$from.parent.textBetween(
          0,
          trFromCommand.selection.$from.parent.content.size,
          '',
          ''
        );

        if (
          trFromCommand.selection.$from.parent.type === codeBlock &&
          trFromCommand.selection.$from.parentOffset === EMPTY_INLINE_CODE_MARKER.length &&
          currentText === EMPTY_INLINE_CODE_MARKER
        ) {
          const markerStart = commandSelectionFrom - EMPTY_INLINE_CODE_MARKER.length;

          trFromCommand
            .delete(markerStart, commandSelectionFrom)
            .setSelection(createTextSelection(trFromCommand, markerStart));
        }

        const cbNode = trFromCommand.selection.$from.parent;
        const codeBlockPos = trFromCommand.selection.$from.before();

        trFromCommand.setNodeMarkup(codeBlockPos, null, {
          ...cbNode.attrs,
          language: 'python',
          lineNumber: 1,
        });

        dispatch(trFromCommand.scrollIntoView());

        return true;
      }

      dispatch(
        stateTr
          .insertText(EMPTY_INLINE_CODE_MARKER, from, from)
          .setSelection(createTextSelection(stateTr, from + 1))
          .scrollIntoView()
      );

      return true;
    };
  }

  keymaps() {
    const bulletListCommand = this.makeBulletListByMarker();
    const orderedListCommand = this.makeOrderedListByNumber();

    const handleSpace: Command = (state, dispatch, view) =>
      orderedListCommand(state, dispatch, view) || bulletListCommand(state, dispatch, view);

    return {
      Space: handleSpace,
      '`': this.makeCodeByBacktick(),
    };
  }
}
