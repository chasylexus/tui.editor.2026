import { DOMOutputSpec } from 'prosemirror-model';
import { EditorCommand } from '@t/spec';
import { clsWithMdPrefix } from '@/utils/dom';
import Mark from '@/spec/mark';
import { toggleMark } from '../helper/mdCommand';

const reUnderline = /^(\+{2}).*([\s\S]*)\1$/m;
const underlineSyntax = '++';

export class Underline extends Mark {
  get name() {
    return 'underline';
  }

  get schema() {
    return {
      toDOM(): DOMOutputSpec {
        return ['span', { class: clsWithMdPrefix('underline') }, 0];
      },
    };
  }

  commands(): EditorCommand {
    return toggleMark(reUnderline, underlineSyntax);
  }
}
