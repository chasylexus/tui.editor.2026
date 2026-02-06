import { Mark as ProsemirrorMark, DOMOutputSpec } from 'prosemirror-model';
import { toggleMark } from 'prosemirror-commands';

import Mark from '@/spec/mark';
import { getCustomAttrs, getDefaultCustomAttrs } from '@/wysiwyg/helper/node';

import { EditorCommand } from '@t/spec';

export class Underline extends Mark {
  get name() {
    return 'underline';
  }

  get schema() {
    const parseDOM = ['u'].map((tag) => {
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
        return [attrs.rawHTML || 'u', getCustomAttrs(attrs)];
      },
    };
  }

  commands(): EditorCommand {
    return () => (state, dispatch) => toggleMark(state.schema.marks.underline)(state, dispatch);
  }
}
