import { Mark, Node, Schema } from 'prosemirror-model';
import { Plugin, Selection } from 'prosemirror-state';

import { includes } from '@/utils/common';

import { ToolbarStateMap, ToolbarStateKeys } from '@t/ui';
import { Emitter } from '@t/event';

type ListType = 'bulletList' | 'orderedList' | 'taskList';

const EXCEPT_TYPES = ['image', 'link', 'customBlock', 'frontMatter'];
const MARK_TYPES = [
  'strong',
  'strike',
  'mark',
  'superscript',
  'subscript',
  'underline',
  'emph',
  'code',
  'link',
];
const LIST_TYPES: ListType[] = ['bulletList', 'orderedList', 'taskList'];

function getToolbarStateType(node: Node, parentNode: Node) {
  const type = node.type.name;

  if (type === 'listItem') {
    return node.attrs.task ? 'taskList' : parentNode.type.name;
  }

  if (type.indexOf('table') !== -1) {
    return 'table';
  }

  return type;
}

function setListNodeToolbarState(type: ToolbarStateKeys, nodeTypeState: ToolbarStateMap) {
  nodeTypeState[type] = { active: true };

  LIST_TYPES.filter((listName) => listName !== type).forEach((listType) => {
    if (nodeTypeState[listType]) {
      delete nodeTypeState[listType];
    }
  });
}

function setMarkTypeStates(
  activeMarks: readonly Mark[],
  schema: Schema,
  toolbarState: ToolbarStateMap
) {
  MARK_TYPES.forEach((type) => {
    const mark = schema.marks[type];
    const foundMark = activeMarks.some((activeMark) => {
      if (activeMark.type !== mark) {
        return false;
      }

      if (type === 'link' && activeMark.attrs.anchorId && !activeMark.attrs.linkUrl) {
        return false;
      }

      return true;
    });

    if (foundMark) {
      toolbarState[type as ToolbarStateKeys] = { active: true };
    }
  });
}

function getToolbarState(
  selection: Selection,
  doc: Node,
  schema: Schema,
  storedMarks: readonly Mark[] | null | undefined
) {
  const { $from, $to, from, to } = selection;
  const toolbarState = {
    indent: { active: false, disabled: true },
    outdent: { active: false, disabled: true },
  } as ToolbarStateMap;

  // state.storedMarks is explicitly set by the code mark boundary handler
  // and is the source of truth for whether the cursor is inside or outside
  // a non-inclusive mark.  When null, fall back to position-based marks.
  let activeMarks: readonly Mark[];

  if (selection.empty) {
    activeMarks = storedMarks ?? $from.marks();
  } else {
    activeMarks = $from.marksAcross($to) || [];
  }

  doc.nodesBetween(from, to, (node, _, parentNode) => {
    const type = getToolbarStateType(node, parentNode!);

    if (includes(EXCEPT_TYPES, type)) {
      return;
    }

    if (includes(LIST_TYPES, type)) {
      setListNodeToolbarState(type as ToolbarStateKeys, toolbarState);

      toolbarState.indent.disabled = false;
      toolbarState.outdent.disabled = false;
    } else if (type === 'paragraph' || type === 'text') {
      setMarkTypeStates(activeMarks, schema, toolbarState);
    } else {
      toolbarState[type as ToolbarStateKeys] = { active: true };
    }
  });
  return toolbarState;
}

export function toolbarStateHighlight(eventEmitter: Emitter) {
  return new Plugin({
    view() {
      return {
        update(view) {
          const { selection, doc, schema, storedMarks } = view.state;

          eventEmitter.emit('changeToolbarState', {
            toolbarState: getToolbarState(selection, doc, schema, storedMarks),
          });
        },
      };
    },
  });
}
