import { DOMOutputSpec, ProsemirrorNode } from 'prosemirror-model';
import { Command, setBlockType } from 'prosemirror-commands';
import { Transaction } from 'prosemirror-state';

import NodeSchema from '@/spec/node';
import { createTextSelection } from '@/helper/manipulation';
import { changeList } from '@/wysiwyg/command/list';
import { getDefaultCustomAttrs, getCustomAttrs } from '@/wysiwyg/helper/node';

const BULLET_LIST_MARKERS = new Set(['-', '+', '*']);
const ORDERED_LIST_RE = /^(\d+)\.$/;
const HEADING_RE = /^(#{1,6})$/;

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
      const startNumber = match ? Number(match[1]) : 1;

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
            order: startNumber,
          });
          break;
        }
      }

      dispatch(trFromCommand.scrollIntoView());

      return true;
    };
  }

  private makeHeadingByMarker(): Command {
    return (state, dispatch) => {
      const {
        selection: { $from, empty },
        schema,
      } = state;
      const { paragraph, heading } = schema.nodes;

      if (!empty || $from.parent.type !== paragraph || !dispatch) {
        return false;
      }

      const text = $from.parent.textBetween(0, $from.parent.content.size, '', '');
      const match = text.match(HEADING_RE);

      if (!match) {
        return false;
      }

      const level = match[1].length;
      const headingCommand = setBlockType(heading, { level, headingType: 'atx' });
      const runHeadingCommand = (): { commandResult: boolean; tr: Transaction | null } => {
        let tr: Transaction | null = null;
        const commandResult = headingCommand(state, (nextTr: Transaction) => {
          tr = nextTr;
        });

        return { commandResult, tr };
      };
      const { commandResult, tr } = runHeadingCommand();

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
      const currentMatch = currentText.match(HEADING_RE);

      if (trFromCommand.selection.$from.parent.type === heading && currentMatch) {
        const markerLength = currentMatch[1].length;

        trFromCommand
          .delete(from - markerLength, from)
          .setSelection(createTextSelection(trFromCommand, from - markerLength));
      }

      dispatch(trFromCommand.scrollIntoView());

      return true;
    };
  }

  keymaps() {
    const bulletListCommand = this.makeBulletListByMarker();
    const orderedListCommand = this.makeOrderedListByNumber();
    const headingCommand = this.makeHeadingByMarker();

    const handleSpace: Command = (state, dispatch, view) =>
      headingCommand(state, dispatch, view) ||
      orderedListCommand(state, dispatch, view) ||
      bulletListCommand(state, dispatch, view);

    return {
      Space: handleSpace,
    };
  }
}
