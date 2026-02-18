import { DOMOutputSpec, ProsemirrorNode } from 'prosemirror-model';
import { Command, setBlockType } from 'prosemirror-commands';
import { Transaction } from 'prosemirror-state';

import NodeSchema from '@/spec/node';
import { createTextSelection } from '@/helper/manipulation';
import { changeList } from '@/wysiwyg/command/list';
import { getDefaultCustomAttrs, getCustomAttrs } from '@/wysiwyg/helper/node';

const BULLET_LIST_MARKER = '-';
const BACKTICK = '`';
const EMPTY_INLINE_CODE_MARKER = '``';

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

      if (
        !empty ||
        $from.parent.type !== paragraph ||
        $from.parentOffset !== BULLET_LIST_MARKER.length
      ) {
        return false;
      }

      const text = $from.parent.textBetween(0, $from.parent.content.size, '', '');

      if (text !== BULLET_LIST_MARKER || !dispatch) {
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
        trFromCommand.selection.$from.parentOffset === BULLET_LIST_MARKER.length &&
        currentText === BULLET_LIST_MARKER
      ) {
        const markerStart = from - BULLET_LIST_MARKER.length;

        trFromCommand
          .delete(markerStart, from)
          .setSelection(createTextSelection(trFromCommand, markerStart));
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
    return {
      Space: this.makeBulletListByMarker(),
      '`': this.makeCodeByBacktick(),
    };
  }
}
