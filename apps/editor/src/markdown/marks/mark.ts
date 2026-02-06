import { DOMOutputSpec } from 'prosemirror-model';
import { EditorCommand } from '@t/spec';
import { clsWithMdPrefix } from '@/utils/dom';
import Mark from '@/spec/mark';
import { toggleMark } from '../helper/mdCommand';

const reMark = /^(={2}).*([\s\S]*)\1$/m;
const markSyntax = '==';

export class MarkText extends Mark {
  get name() {
    return 'mark';
  }

  get schema() {
    return {
      toDOM(): DOMOutputSpec {
        return ['span', { class: clsWithMdPrefix('mark') }, 0];
      },
    };
  }

  commands(): EditorCommand {
    return toggleMark(reMark, markSyntax);
  }
}
