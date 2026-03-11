import { Plugin } from 'prosemirror-state';
import { ProsemirrorNode } from 'prosemirror-model';
import { Decoration, DecorationSet } from 'prosemirror-view';

import { cls } from '@/utils/dom';

const NBSP = '\u00A0';

export const NBSP_RUN_CLASS_NAME = cls('nbsp-run');

function isBreakableWhitespace(ch: string) {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f';
}

function createNbspDecorations(doc: ProsemirrorNode) {
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (!node.isTextblock) {
      return true;
    }

    let segmentStart: number | null = null;
    let segmentHasNbsp = false;

    const closeSegment = (endPos: number) => {
      if (segmentStart === null) {
        return;
      }

      if (segmentHasNbsp && endPos > segmentStart) {
        decorations.push(Decoration.inline(segmentStart, endPos, { class: NBSP_RUN_CLASS_NAME }));
      }

      segmentStart = null;
      segmentHasNbsp = false;
    };

    node.forEach((child, offset) => {
      const childStart = pos + 1 + offset;

      if (!child.isText || !child.text) {
        closeSegment(childStart);
        return;
      }

      for (let i = 0; i < child.text.length; i += 1) {
        const ch = child.text[i];
        const absPos = childStart + i;

        if (isBreakableWhitespace(ch)) {
          closeSegment(absPos);
          continue;
        }

        if (segmentStart === null) {
          segmentStart = absPos;
        }

        if (ch === NBSP) {
          segmentHasNbsp = true;
        }
      }
    });

    closeSegment(pos + node.nodeSize - 1);

    return false;
  });

  return DecorationSet.create(doc, decorations);
}

export function nonBreakingSpace() {
  return new Plugin({
    state: {
      init(_, state) {
        return createNbspDecorations(state.doc);
      },
      apply(tr, decorationSet) {
        if (!tr.docChanged) {
          return decorationSet.map(tr.mapping, tr.doc);
        }

        return createNbspDecorations(tr.doc);
      },
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
  });
}
