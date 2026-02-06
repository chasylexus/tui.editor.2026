import { DOMOutputSpec } from 'prosemirror-model';
import { EditorCommand } from '@t/spec';
import { clsWithMdPrefix } from '@/utils/dom';
import Mark from '@/spec/mark';
import { toggleMark } from '../helper/mdCommand';

const reSubscript = /^(~).*([\\s\\S]*)\\1$/m;
const subscriptSyntax = '~';

export class Subscript extends Mark {
  get name() {
    return 'subscript';
  }

  get schema() {
    return {
      toDOM(): DOMOutputSpec {
        return ['span', { class: clsWithMdPrefix('subscript') }, 0];
      },
    };
  }

  commands(): EditorCommand {
    return toggleMark(reSubscript, subscriptSyntax);
  }
}
