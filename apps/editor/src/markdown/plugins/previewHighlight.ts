import { MdNode, MdPos, ToastMark } from '@techie_doubts/toastmark';
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
  'link',
  'anchor',
];

type MdRange = [MdPos, MdPos];

function comparePos(a: MdPos, b: MdPos) {
  if (a[0] !== b[0]) {
    return a[0] - b[0];
  }

  return a[1] - b[1];
}

function normalizeRange(range: MdRange): MdRange {
  const [start, end] = range;

  return comparePos(start, end) <= 0 ? [start, end] : [end, start];
}

function isEmptyRange(range: MdRange) {
  return comparePos(range[0], range[1]) === 0;
}

function rangeContains(container: MdRange, target: MdRange) {
  const [containerStart, containerEnd] = container;
  const [targetStart, targetEnd] = target;

  return comparePos(containerStart, targetStart) <= 0 && comparePos(containerEnd, targetEnd) >= 0;
}

function posInRange(range: MdRange, pos: MdPos) {
  const [start, end] = range;

  return comparePos(start, pos) <= 0 && comparePos(end, pos) >= 0;
}

function toSelectionRange(sourceRange: MdRange): MdRange {
  const [start, end] = sourceRange;

  return [start, [end[0], end[1] + 1]];
}

function getLinkRanges(toastMark: ToastMark) {
  const ranges: MdRange[] = [];
  const walker = toastMark.getRootNode().walker();
  let event = walker.next();

  while (event) {
    const { node, entering } = event;

    if (entering && node.type === 'link' && node.sourcepos) {
      ranges.push(toSelectionRange(node.sourcepos as MdRange));
    }
    event = walker.next();
  }

  return ranges;
}

function getLineStartOffsets(markdown: string) {
  const offsets = [0];

  for (let i = 0; i < markdown.length; i += 1) {
    if (markdown[i] === '\n') {
      offsets.push(i + 1);
    }
  }

  return offsets;
}

function toMdPosFromIndex(lineOffsets: number[], index: number): MdPos {
  let line = 0;

  while (line + 1 < lineOffsets.length && lineOffsets[line + 1] <= index) {
    line += 1;
  }

  return [line + 1, index - lineOffsets[line] + 1];
}

function getCustomAnchorRanges(markdownSource: string) {
  const ranges: MdRange[] = [];
  const reAnchor = /<a\s+[^>]*id\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*>[\s\S]*?<\/a>/gi;
  const lineOffsets = getLineStartOffsets(markdownSource);
  let match = reAnchor.exec(markdownSource);

  while (match) {
    const anchorId = (match[1] || match[2] || '').trim();

    if (anchorId) {
      const start = toMdPosFromIndex(lineOffsets, match.index);
      const end = toMdPosFromIndex(lineOffsets, match.index + match[0].length);

      ranges.push([start, end]);
    }

    match = reAnchor.exec(markdownSource);
  }

  return ranges;
}

function toMdPos(doc: any, pos: number): MdPos {
  const startChOffset = doc.resolve(pos).start();
  const line = doc.content.findIndex(pos).index + 1;
  let ch = pos - startChOffset;

  if (pos === startChOffset) {
    ch += 1;
  }

  return [line, ch];
}

function isSingleLinkSelection(toastMark: ToastMark, range: MdRange) {
  const normalizedRange = normalizeRange(range);
  const linkRanges = getLinkRanges(toastMark);

  if (isEmptyRange(normalizedRange)) {
    const [cursor] = normalizedRange;

    return linkRanges.some((linkRange) => posInRange(linkRange, cursor));
  }

  const containedLinks = linkRanges.filter((linkRange) =>
    rangeContains(linkRange, normalizedRange)
  );

  return containedLinks.length === 1;
}

function isSingleAnchorSelection(markdownSource: string, range: MdRange) {
  const normalizedRange = normalizeRange(range);
  const anchorRanges = getCustomAnchorRanges(markdownSource);

  if (isEmptyRange(normalizedRange)) {
    const [cursor] = normalizedRange;

    return anchorRanges.some((anchorRange) => posInRange(anchorRange, cursor));
  }

  const containedAnchors = anchorRanges.filter((anchorRange) =>
    rangeContains(anchorRange, normalizedRange)
  );

  return containedAnchors.length === 1;
}

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
          const cursorPos = toMdPos(doc, selection.from);
          const range = normalizeRange([
            toMdPos(doc, selection.from),
            toMdPos(doc, selection.to),
          ] as MdRange);
          const markdownSource = doc.textBetween(0, doc.content.size, '\n');
          const mdNode = toastMark.findNodeAtPosition(cursorPos)!;
          const toolbarState = getToolbarState(mdNode);

          toolbarState.link = {
            active: isSingleLinkSelection(toastMark, range),
          };
          toolbarState.anchor = {
            active: isSingleAnchorSelection(markdownSource, range),
          };

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
