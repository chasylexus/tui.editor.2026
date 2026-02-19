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
        toolbarState.anchor = { active: true };
        return false;
      }

      return true;
    });

    if (foundMark) {
      toolbarState[type as ToolbarStateKeys] = { active: true };
    }
  });
}

function setBoundaryLinkStates(
  selection: Selection,
  doc: Node,
  schema: Schema,
  toolbarState: ToolbarStateMap
) {
  if (!selection.empty) {
    return;
  }

  const linkType = schema.marks.link;

  if (!linkType) {
    return;
  }

  const { $from } = selection;
  const candidateNodes = [$from.nodeBefore, $from.nodeAfter];

  candidateNodes.forEach((node) => {
    if (!node || !node.isText) {
      return;
    }

    const linkMark = linkType.isInSet(node.marks);

    if (!linkMark) {
      return;
    }

    if (linkMark.attrs.anchorId && !linkMark.attrs.linkUrl) {
      toolbarState.anchor = { active: true };
    } else {
      toolbarState.link = { active: true };
    }
  });

  const size = doc.content.size > 0 ? doc.content.size - 1 : 1;
  const cursorPos = selection.from;
  const aroundPositions = [cursorPos, Math.max(1, cursorPos - 1), Math.min(size, cursorPos + 1)];

  if (cursorPos <= 1) {
    aroundPositions.push(Math.min(size, cursorPos + 2));
  }

  if (cursorPos >= size - 1) {
    aroundPositions.push(Math.max(1, cursorPos - 2));
  }

  aroundPositions.forEach((pos) => {
    const marks = doc.resolve(pos).marks();
    const linkMark = linkType.isInSet(marks);

    if (!linkMark) {
      return;
    }

    if (linkMark.attrs.anchorId && !linkMark.attrs.linkUrl) {
      toolbarState.anchor = { active: true };
    } else {
      toolbarState.link = { active: true };
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

  setBoundaryLinkStates(selection, doc, schema, toolbarState);

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
