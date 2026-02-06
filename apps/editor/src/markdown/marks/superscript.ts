import { DOMOutputSpec } from 'prosemirror-model';
import { EditorCommand } from '@t/spec';
import { clsWithMdPrefix } from '@/utils/dom';
import Mark from '@/spec/mark';
import { toggleMark } from '../helper/mdCommand';

const reSuperscript = /^(\^).*([\s\S]*)\1$/m;
const superscriptSyntax = '^';

export class Superscript extends Mark {
  get name() {
    return 'superscript';
  }

  get schema() {
    return {
      toDOM(): DOMOutputSpec {
        return ['span', { class: clsWithMdPrefix('superscript') }, 0];
      },
    };
  }

  commands(): EditorCommand {
    return toggleMark(reSuperscript, superscriptSyntax);
  }
}
