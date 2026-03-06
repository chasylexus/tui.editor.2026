import { isInListNode } from '@/wysiwyg/helper/node';
import { sinkListItem, liftListItem } from '@/wysiwyg/command/list';
import { Node as ProsemirrorNode, Mark as ProsemirrorMark } from 'prosemirror-model';

import { EditorCommand } from '@t/spec';

function removeInlineStyleFromAttrs(attrs: Record<string, any>) {
  const htmlAttrs = attrs?.htmlAttrs;

  if (!htmlAttrs || typeof htmlAttrs !== 'object' || !Object.prototype.hasOwnProperty.call(htmlAttrs, 'style')) {
    return null;
  }

  const { style: _removedStyle, ...restHtmlAttrs } = htmlAttrs;
  const normalizedHtmlAttrs = Object.keys(restHtmlAttrs).reduce<Record<string, string>>((acc, key) => {
    const value = restHtmlAttrs[key];

    if (value === null || value === undefined) {
      return acc;
    }

    acc[key] = String(value);

    return acc;
  }, {});

  return {
    ...attrs,
    htmlAttrs: normalizedHtmlAttrs,
  };
}

function shouldUnwrapSpanMark(
  mark: ProsemirrorMark,
  attrsWithoutStyle: Record<string, any> | null
) {
  if (!attrsWithoutStyle) {
    return false;
  }

  if (mark.type.name !== 'span' || !mark.attrs?.htmlInline) {
    return false;
  }

  const htmlAttrs = attrsWithoutStyle.htmlAttrs;

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

    let tr = state.tr;
    let changed = false;

    doc.nodesBetween(from, to, (node: ProsemirrorNode, pos: number) => {
      if (node.isText) {
        const markFrom = Math.max(pos, from);
        const markTo = Math.min(pos + node.nodeSize, to);

        if (markFrom >= markTo) {
          return;
        }

        node.marks.forEach((mark: ProsemirrorMark) => {
          const attrsWithoutStyle = removeInlineStyleFromAttrs(mark.attrs);

          if (!attrsWithoutStyle) {
            return;
          }

          tr = tr.removeMark(markFrom, markTo, mark);

          if (!shouldUnwrapSpanMark(mark, attrsWithoutStyle)) {
            tr = tr.addMark(markFrom, markTo, mark.type.create(attrsWithoutStyle));
          }

          changed = true;
        });

        return;
      }

      const attrsWithoutStyle = removeInlineStyleFromAttrs(node.attrs);

      if (!attrsWithoutStyle) {
        return;
      }

      tr.setNodeMarkup(pos, null, attrsWithoutStyle, Array.from(node.marks));
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
