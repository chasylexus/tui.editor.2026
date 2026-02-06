import { Mark as ProsemirrorMark, DOMOutputSpec } from 'prosemirror-model';
import { toggleMark } from 'prosemirror-commands';

import Mark from '@/spec/mark';
import { getCustomAttrs, getDefaultCustomAttrs } from '@/wysiwyg/helper/node';

import { EditorCommand } from '@t/spec';

export class MarkText extends Mark {
  get name() {
    return 'mark';
  }

  get schema() {
    const parseDOM = ['mark'].map((tag) => {
      return {
        tag,
        getAttrs(dom: Node | string) {
          const rawHTML = (dom as HTMLElement).getAttribute('data-raw-html');

          return {
            ...(rawHTML && { rawHTML }),
          };
        },
      };
    });

    return {
      attrs: {
        rawHTML: { default: null },
        ...getDefaultCustomAttrs(),
      },
      parseDOM,
      toDOM({ attrs }: ProsemirrorMark): DOMOutputSpec {
        return [attrs.rawHTML || 'mark', getCustomAttrs(attrs)];
      },
    };
  }

  commands(): EditorCommand {
    return () => (state, dispatch) => toggleMark(state.schema.marks.mark)(state, dispatch);
  }
}
