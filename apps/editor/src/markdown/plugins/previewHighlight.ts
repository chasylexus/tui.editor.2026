import { MdNode, MdPos } from '@toast-ui/toastmark';
import { Plugin } from 'prosemirror-state';
import { MdContext } from '@t/spec';
import { ToolbarStateMap, ToolbarStateKeys } from '@t/ui';
import { traverseParentNodes, isListNode } from '@/utils/markdown';
import { includes } from '@/utils/common';

const defaultToolbarStateKeys: ToolbarStateKeys[] = [
  'taskList',
  'orderedList',
  'bulletList',
  'table',
  'strong',
  'emph',
  'strike',
  'mark',
  'superscript',
  'subscript',
  'underline',
  'heading',
  'thematicBreak',
  'blockQuote',
  'code',
  'codeBlock',
  'indent',
  'outdent',
];

function getToolbarStateType(mdNode: MdNode) {
  const { type } = mdNode;

  if (isListNode(mdNode)) {
    if (mdNode.listData.task) {
      return 'taskList';
    }
    return mdNode.listData.type === 'ordered' ? 'orderedList' : 'bulletList';
  }

  if (type.indexOf('table') !== -1) {
    return 'table';
  }

  return includes(defaultToolbarStateKeys, type) ? (type as ToolbarStateKeys) : null;
}

function getToolbarState(targetNode: MdNode) {
  const toolbarState = {
    indent: { active: false, disabled: true },
    outdent: { active: false, disabled: true },
  } as ToolbarStateMap;

  let listEnabled = true;
  const activeTypes = new Set<ToolbarStateKeys>();

  traverseParentNodes(targetNode, (mdNode) => {
    const type = getToolbarStateType(mdNode);

    if (!type) {
      return;
    }

    if (type === 'bulletList' || type === 'orderedList') {
      // to apply the nearlist list state in the nested list
      if (listEnabled) {
        activeTypes.add(type);

        toolbarState.indent.disabled = false;
        toolbarState.outdent.disabled = false;

        listEnabled = false;
      }
    } else {
      activeTypes.add(type);
    }
  });

  activeTypes.forEach((type) => {
    toolbarState[type] = { active: true };
  });

  return toolbarState;
}

export function previewHighlight({ toastMark, eventEmitter }: MdContext) {
  return new Plugin({
    view() {
      return {
        update(view, prevState) {
          const { state } = view;
          const { doc, selection } = state;

          if (prevState && prevState.doc.eq(doc) && prevState.selection.eq(selection)) {
            return;
          }
          const { from } = selection;
          const startChOffset = state.doc.resolve(from).start();
          const line = state.doc.content.findIndex(from).index + 1;
          let ch = from - startChOffset;

          if (from === startChOffset) {
            ch += 1;
          }
          const cursorPos: MdPos = [line, ch];
          const mdNode = toastMark.findNodeAtPosition(cursorPos)!;
          const toolbarState = getToolbarState(mdNode);

          eventEmitter.emit('changeToolbarState', {
            cursorPos,
            mdNode,
            toolbarState,
          });
          eventEmitter.emit('setFocusedNode', mdNode);
        },
      };
    },
  });
}
