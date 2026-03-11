import { isInListNode } from '@/wysiwyg/helper/node';
import { sinkListItem, liftListItem } from '@/wysiwyg/command/list';
import { Node as ProsemirrorNode, Mark as ProsemirrorMark } from 'prosemirror-model';

import { EditorCommand } from '@t/spec';

function isPresentationalSpanMark(mark: ProsemirrorMark) {
  return mark.type.name === 'span' && !!mark.attrs?.htmlInline;
}

function removePresentationalInlineAttrsFromAttrs(
  attrs: Record<string, any>,
  options: { stripClass?: boolean } = {}
) {
  const htmlAttrs = attrs?.htmlAttrs;

  if (!htmlAttrs || typeof htmlAttrs !== 'object') {
    return null;
  }

  const stripClass = !!options.stripClass;
  let changed = false;
  const normalizedHtmlAttrs = Object.keys(htmlAttrs).reduce<Record<string, string>>((acc, key) => {
    const value = htmlAttrs[key];

    if (key === 'style' || (stripClass && (key === 'class' || key === 'data-raw-html'))) {
      changed = true;
      return acc;
    }

    if (value === null || typeof value === 'undefined') {
      changed = true;
      return acc;
    }

    acc[key] = String(value);

    return acc;
  }, {});

  if (!changed) {
    return null;
  }

  return {
    ...attrs,
    htmlAttrs: normalizedHtmlAttrs,
  };
}

function shouldUnwrapSpanMark(
  mark: ProsemirrorMark,
  attrsWithoutPresentationalAttrs: Record<string, any> | null
) {
  if (!attrsWithoutPresentationalAttrs) {
    return false;
  }

  if (!isPresentationalSpanMark(mark)) {
    return false;
  }

  const { htmlAttrs } = attrsWithoutPresentationalAttrs;

  return !htmlAttrs || !Object.keys(htmlAttrs).length;
}

function indent(): EditorCommand {
  return () => (state, dispatch) => {
    const { selection, schema } = state;
    const { $from, $to } = selection;
    const range = $from.blockRange($to);

    if (range && isInListNode($from)) {
      return sinkListItem(schema.nodes.listItem)(state, dispatch);
    }

    return false;
  };
}

function outdent(): EditorCommand {
  return () => (state, dispatch) => {
    const { selection, schema } = state;
    const { $from, $to } = selection;
    const range = $from.blockRange($to);

    if (range && isInListNode($from)) {
      return liftListItem(schema.nodes.listItem)(state, dispatch);
    }

    return false;
  };
}

function clearStyle(): EditorCommand {
  return () => (state, dispatch) => {
    const {
      selection: { from, to, empty },
      doc,
    } = state;

    if (empty) {
      return false;
    }

    let { tr } = state;
    let changed = false;

    doc.nodesBetween(from, to, (node: ProsemirrorNode, pos: number) => {
      if (node.isText) {
        const markFrom = Math.max(pos, from);
        const markTo = Math.min(pos + node.nodeSize, to);

        if (markFrom >= markTo) {
          return;
        }

        node.marks.forEach((mark: ProsemirrorMark) => {
          const attrsWithoutPresentationalAttrs = removePresentationalInlineAttrsFromAttrs(
            mark.attrs,
            {
              stripClass: isPresentationalSpanMark(mark),
            }
          );

          if (!attrsWithoutPresentationalAttrs) {
            return;
          }

          tr = tr.removeMark(markFrom, markTo, mark);

          if (!shouldUnwrapSpanMark(mark, attrsWithoutPresentationalAttrs)) {
            tr = tr.addMark(markFrom, markTo, mark.type.create(attrsWithoutPresentationalAttrs));
          }

          changed = true;
        });

        return;
      }

      const attrsWithoutPresentationalAttrs = removePresentationalInlineAttrsFromAttrs(node.attrs, {
        stripClass: node.type.name === 'span' && !!node.attrs?.htmlInline,
      });

      if (!attrsWithoutPresentationalAttrs) {
        return;
      }

      tr.setNodeMarkup(pos, null, attrsWithoutPresentationalAttrs, Array.from(node.marks));
      changed = true;
    });

    if (!changed) {
      return false;
    }

    if (dispatch) {
      dispatch(tr.scrollIntoView());
    }

    return true;
  };
}

export function getWwCommands(): Record<string, EditorCommand> {
  return {
    indent: indent(),
    outdent: outdent(),
    clearStyle: clearStyle(),
  };
}
