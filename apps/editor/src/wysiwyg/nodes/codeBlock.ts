import { ProsemirrorNode, DOMOutputSpec } from 'prosemirror-model';
import { setBlockType, Command } from 'prosemirror-commands';

import { addParagraph } from '@/helper/manipulation';
import { between, last } from '@/utils/common';
import NodeSchema from '@/spec/node';
import { getCustomAttrs, getDefaultCustomAttrs } from '@/wysiwyg/helper/node';

import { EditorCommand } from '@t/spec';

export class CodeBlock extends NodeSchema {
  get name() {
    return 'codeBlock';
  }

  get schema() {
    return {
      content: 'text*',
      group: 'block',
      attrs: {
        language: { default: null },
        lineNumber: { default: null },
        lineWrap: { default: false },
        rawHTML: { default: null },
        ...getDefaultCustomAttrs(),
      },
      code: true,
      defining: true,
      marks: '',
      parseDOM: [
        {
          tag: 'pre',
          preserveWhitespace: 'full' as const,
          getAttrs(dom: Node | string) {
            const rawHTML = (dom as HTMLElement).getAttribute('data-raw-html');
            const child = (dom as HTMLElement).firstElementChild;
            const lineWrapAttr =
              child?.getAttribute('data-line-wrap') ||
              (dom as HTMLElement).getAttribute('data-line-wrap');

            const lineNumAttr = child?.getAttribute('data-line-number');

            return {
              language: child?.getAttribute('data-language') || null,
              lineNumber: lineNumAttr ? Number(lineNumAttr) : null,
              lineWrap:
                lineWrapAttr === '' ||
                lineWrapAttr === 'true' ||
                (dom as HTMLElement).classList.contains('line-wrap'),
              ...(rawHTML && { rawHTML }),
            };
          },
        },
      ],
      toDOM({ attrs }: ProsemirrorNode): DOMOutputSpec {
        const preAttrs: Record<string, any> = {
          ...getCustomAttrs(attrs),
        };
        const codeAttrs: Record<string, any> = {
          'data-language': attrs.language,
        };
        const preClasses = [preAttrs.class].filter(Boolean);

        if (attrs.lineNumber !== null) {
          codeAttrs['data-line-number'] = String(attrs.lineNumber);
        }
        if (attrs.lineWrap) {
          preClasses.push('line-wrap');
          preAttrs['data-line-wrap'] = 'true';
          codeAttrs['data-line-wrap'] = 'true';
        }

        preAttrs.class = preClasses.length ? preClasses.join(' ') : null;

        return [attrs.rawHTML || 'pre', preAttrs, ['code', codeAttrs, 0]];
      },
    };
  }

  commands(): EditorCommand {
    return () => (state, dispatch) => setBlockType(state.schema.nodes.codeBlock)(state, dispatch);
  }

  moveCursor(direction: 'up' | 'down'): Command {
    return (state, dispatch) => {
      const { tr, doc, schema } = state;
      const { $from } = state.selection;
      const { view } = this.context;

      if (view!.endOfTextblock(direction) && $from.node().type.name === 'codeBlock') {
        const lines: string[] = $from.parent.textContent.split('\n');

        const offset = direction === 'up' ? $from.start() : $from.end();
        const range =
          direction === 'up'
            ? [offset, lines[0].length + offset]
            : [offset - last(lines).length, offset];
        const pos = doc.resolve(direction === 'up' ? $from.before() : $from.after());
        const node = direction === 'up' ? pos.nodeBefore : pos.nodeAfter;

        if (between($from.pos, range[0], range[1]) && !node) {
          const newTr = addParagraph(tr, pos, schema);

          if (newTr) {
            dispatch!(newTr);
            return true;
          }
        }
      }

      return false;
    };
  }

  keymaps() {
    const codeCommand = this.commands()();

    return {
      'Shift-Mod-p': codeCommand,
      'Shift-Mod-P': codeCommand,
      ArrowUp: this.moveCursor('up'),
      ArrowDown: this.moveCursor('down'),
    };
  }
}
