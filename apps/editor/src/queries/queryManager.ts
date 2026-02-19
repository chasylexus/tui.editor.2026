import type { EditorCore as Editor, EditorPos, EditorType } from '@t/editor';
import type { LinkMdNode, MdNode, MdPos } from '@toast-ui/toastmark';
import { MarkType, Node as ProsemirrorNode } from 'prosemirror-model';
import { getChildrenText } from '@/utils/markdown';
import {
  createAnchorIdFromText,
  collectExistingAnchorIds,
  createUniqueAnchorId,
} from '@/utils/link';

type QueryFn = (editor: Editor, payload?: Record<string, any>) => any;

type MdRange = [MdPos, MdPos];

interface LinkInfo {
  range: MdRange;
  linkUrl: string;
  linkText: string;
}

interface LinkInitialValues {
  linkUrl: string;
  linkText: string;
}

interface AnchorInfo {
  range: MdRange;
  anchorId: string;
  anchorText: string;
}

interface AnchorInitialValues {
  anchorId: string;
  anchorText?: string;
  existingAnchor?: boolean;
}

interface WwLinkSpan {
  from: number;
  to: number;
  linkUrl: string;
  linkText: string;
}

interface WwAnchorSpan {
  from: number;
  to: number;
  anchorId: string;
  anchorText: string;
}

interface QueryEditor extends Editor {
  toastMark: {
    getRootNode(): MdNode;
  };
  wwEditor: {
    view: {
      state: {
        doc: ProsemirrorNode;
        schema: {
          marks: Record<string, MarkType>;
        };
        selection: {
          from: number;
          to: number;
          empty: boolean;
        };
      };
    };
  };
}

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
  const [start, end] = range;

  return comparePos(start, end) === 0;
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

function getCurrentMode(editor: Editor) {
  return (editor.isMarkdownMode() ? 'markdown' : 'wysiwyg') as EditorType;
}

function getSelectionInMarkdown(editor: Editor): MdRange {
  const [anchor, head] = editor.getSelection() as MdRange;

  return normalizeRange([anchor, head]);
}

function setSelectionFromMarkdownRange(editor: Editor, range: MdRange) {
  const mode = getCurrentMode(editor);
  const [start, end] = editor.convertPosToMatchEditorMode(range[0], range[1], mode) as [
    EditorPos,
    EditorPos
  ];

  editor.setSelection(start, end);
}

function collectLinks(root: MdNode) {
  const links: LinkInfo[] = [];
  const walker = root.walker();
  let event = walker.next();

  while (event) {
    const { node, entering } = event;

    if (entering && node.type === 'link' && node.sourcepos) {
      const linkNode = node as LinkMdNode;

      links.push({
        range: toSelectionRange(node.sourcepos as MdRange),
        linkUrl: linkNode.destination || '',
        linkText: getChildrenText(linkNode),
      });
    }

    event = walker.next();
  }

  return links;
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

function collectCustomAnchors(markdown: string) {
  const anchors: AnchorInfo[] = [];
  const reAnchor = /<a\s+[^>]*id\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*>[\s\S]*?<\/a>/gi;
  const lineOffsets = getLineStartOffsets(markdown);
  let match = reAnchor.exec(markdown);

  while (match) {
    const anchorId = (match[1] || match[2] || '').trim();

    if (anchorId) {
      const startIndex = match.index;
      const endIndex = match.index + match[0].length;

      const anchorText = (
        match[0].replace(/<a\s+[^>]*>/i, '').replace(/<\/a>$/i, '') || ''
      ).replace(/<[^>]+>/g, '');

      anchors.push({
        range: [toMdPosFromIndex(lineOffsets, startIndex), toMdPosFromIndex(lineOffsets, endIndex)],
        anchorId,
        anchorText,
      });
    }

    match = reAnchor.exec(markdown);
  }

  return anchors;
}

function getMarkdownAnchorInitialValues(editor: QueryEditor): AnchorInitialValues | null {
  const selectionRange = getSelectionInMarkdown(editor);
  const markdownSource = editor.getMarkdown();
  const anchors = collectCustomAnchors(markdownSource);

  if (isEmptyRange(selectionRange)) {
    const [cursor] = selectionRange;
    const found = anchors.find(({ range }) => posInRange(range, cursor));

    if (!found) {
      return null;
    }

    setSelectionFromMarkdownRange(editor, found.range);

    return { anchorId: found.anchorId, anchorText: found.anchorText, existingAnchor: true };
  }

  const containedAnchors = anchors.filter(({ range }) => rangeContains(range, selectionRange));

  if (containedAnchors.length === 1) {
    const [found] = containedAnchors;

    setSelectionFromMarkdownRange(editor, found.range);

    return { anchorId: found.anchorId, anchorText: found.anchorText, existingAnchor: true };
  }

  if (containedAnchors.length > 1) {
    const hasMultipleIds = new Set(containedAnchors.map(({ anchorId }) => anchorId)).size > 1;

    if (hasMultipleIds) {
      return { anchorId: '' };
    }
  }

  return null;
}

function collectWysiwygAnchorSpans(doc: ProsemirrorNode, linkType: MarkType) {
  const spans: WwAnchorSpan[] = [];

  doc.descendants((node, pos) => {
    if (!node.isText) {
      return true;
    }

    const mark = linkType.isInSet(node.marks);

    if (!mark) {
      return true;
    }

    const anchorId = mark.attrs.anchorId || '';
    const linkUrl = mark.attrs.linkUrl || '';

    if (!anchorId || linkUrl) {
      return true;
    }

    const from = pos;
    const to = pos + node.nodeSize;
    const text = node.text || '';
    const last = spans[spans.length - 1];

    if (last && last.to === from && last.anchorId === anchorId) {
      last.to = to;
      last.anchorText += text;
    } else {
      spans.push({ from, to, anchorId, anchorText: text });
    }

    return true;
  });

  return spans;
}

function getWysiwygAnchorInitialValues(editor: QueryEditor): AnchorInitialValues | null {
  const { state } = editor.wwEditor.view;
  const { from, to, empty } = state.selection;
  const linkType = state.schema.marks.link;

  if (!linkType) {
    return null;
  }

  const spans = collectWysiwygAnchorSpans(state.doc, linkType);

  if (empty) {
    const found = spans.find((span) => span.from <= from && from <= span.to);

    if (!found) {
      return null;
    }

    editor.setSelection(found.from, found.to);

    return { anchorId: found.anchorId, anchorText: found.anchorText, existingAnchor: true };
  }

  const covered = spans.filter((span) => span.from <= from && to <= span.to);

  if (covered.length === 1) {
    const [found] = covered;

    editor.setSelection(found.from, found.to);

    return { anchorId: found.anchorId, anchorText: found.anchorText, existingAnchor: true };
  }

  if (covered.length > 1) {
    const hasMultipleIds = new Set(covered.map(({ anchorId }) => anchorId)).size > 1;

    if (hasMultipleIds) {
      return { anchorId: '' };
    }
  }

  return null;
}

function getMarkdownLinkInitialValues(editor: QueryEditor): LinkInitialValues | null {
  const selectionRange = getSelectionInMarkdown(editor);
  const links = collectLinks(editor.toastMark.getRootNode());

  if (isEmptyRange(selectionRange)) {
    const [cursor] = selectionRange;
    const found = links.find(({ range }) => posInRange(range, cursor));

    if (!found) {
      return null;
    }

    setSelectionFromMarkdownRange(editor, found.range);

    return {
      linkUrl: found.linkUrl,
      linkText: found.linkText,
    };
  }

  const containedLinks = links.filter(({ range }) => rangeContains(range, selectionRange));

  if (containedLinks.length === 1) {
    const [found] = containedLinks;

    setSelectionFromMarkdownRange(editor, found.range);

    return {
      linkUrl: found.linkUrl,
      linkText: found.linkText,
    };
  }

  if (containedLinks.length > 1) {
    const hasMultipleUrls = new Set(containedLinks.map(({ linkUrl }) => linkUrl)).size > 1;

    if (hasMultipleUrls) {
      return { linkUrl: '', linkText: editor.getSelectedText() };
    }
  }

  return null;
}

function collectWysiwygLinkSpans(doc: ProsemirrorNode, linkType: MarkType) {
  const spans: WwLinkSpan[] = [];

  doc.descendants((node, pos) => {
    if (!node.isText) {
      return true;
    }

    const mark = linkType.isInSet(node.marks);

    if (!mark) {
      return true;
    }

    const from = pos;
    const to = pos + node.nodeSize;
    const text = node.text || '';
    const linkUrl = mark.attrs.linkUrl || '';

    if (mark.attrs.anchorId && !linkUrl) {
      return true;
    }

    const last = spans[spans.length - 1];

    if (last && last.to === from && last.linkUrl === linkUrl) {
      last.to = to;
      last.linkText += text;
    } else {
      spans.push({ from, to, linkUrl, linkText: text });
    }

    return true;
  });

  return spans;
}

function getWysiwygLinkInitialValues(editor: QueryEditor): LinkInitialValues | null {
  const { state } = editor.wwEditor.view;
  const { from, to, empty } = state.selection;
  const linkType = state.schema.marks.link;

  if (!linkType) {
    return null;
  }

  const spans = collectWysiwygLinkSpans(state.doc, linkType);

  if (empty) {
    const found = spans.find((span) => span.from <= from && from <= span.to);

    if (!found) {
      return null;
    }

    editor.setSelection(found.from, found.to);

    return {
      linkUrl: found.linkUrl,
      linkText: found.linkText,
    };
  }

  const covered = spans.filter((span) => span.from <= from && to <= span.to);

  if (covered.length === 1) {
    const [found] = covered;

    editor.setSelection(found.from, found.to);

    return {
      linkUrl: found.linkUrl,
      linkText: found.linkText,
    };
  }

  if (covered.length > 1) {
    const hasMultipleUrls = new Set(covered.map((span) => span.linkUrl)).size > 1;

    if (hasMultipleUrls) {
      return { linkUrl: '', linkText: editor.getSelectedText() };
    }
  }

  return null;
}

function getLinkInitialValues(editor: QueryEditor): LinkInitialValues | null {
  if (editor.isMarkdownMode()) {
    return getMarkdownLinkInitialValues(editor);
  }

  return getWysiwygLinkInitialValues(editor);
}

function getAnchorInitialValues(editor: QueryEditor) {
  const existingAnchorValues = editor.isMarkdownMode()
    ? getMarkdownAnchorInitialValues(editor)
    : getWysiwygAnchorInitialValues(editor);

  if (existingAnchorValues) {
    return existingAnchorValues;
  }

  const selectedText = editor.getSelectedText().trim();

  if (!selectedText) {
    return { anchorId: '' };
  }

  const markdownSource = editor.getMarkdown();
  const existingIds = collectExistingAnchorIds(markdownSource);
  const anchorId = createUniqueAnchorId(createAnchorIdFromText(selectedText), existingIds);

  return { anchorId };
}

const queryMap: Record<string, QueryFn> = {
  getCurrentMarkdown(editor) {
    return editor.getMarkdown();
  },

  getPopupInitialValues(editor, payload) {
    const { popupName } = payload!;

    if (popupName === 'link') {
      const initialValues = getLinkInitialValues(editor as QueryEditor);

      if (initialValues) {
        return initialValues;
      }

      return { linkText: editor.getSelectedText() };
    }

    if (popupName === 'anchor') {
      return getAnchorInitialValues(editor as QueryEditor);
    }

    return {};
  },
};

export function buildQuery(editor: Editor) {
  editor.eventEmitter.listen('query', (query: string, payload?: Record<string, any>) =>
    queryMap[query](editor, payload)
  );
}
