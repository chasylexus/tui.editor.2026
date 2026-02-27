import { EditorView } from 'prosemirror-view';
import { MdNode, ToastMark } from '@techie_doubts/toastmark';
import { Emitter } from '@t/event';
import { getMdStartLine } from '@/utils/markdown';
import { hasFootnoteSyntax } from '@/utils/footnote';
import MarkdownPreview from '../mdPreview';
import MdEditor from '../mdEditor';
import { animate } from './animation';
import { getAndSaveOffsetInfo } from './offset';
import {
  getAdditionalPos,
  findAncestorHavingId,
  getEditorRangeHeightInfo,
  getParentNodeObj,
  getTotalOffsetTop,
} from './dom';

const EDITOR_BOTTOM_PADDING = 18;

export interface SyncCallbacks {
  syncScrollTop: (scrollTop: number) => void;
  releaseEventBlock: () => void;
}

type ScrollFrom = 'editor' | 'preview';

export class ScrollSync {
  private previewRoot: HTMLElement;

  private previewEl: HTMLElement;

  private preview: MarkdownPreview;

  private editorView: EditorView;

  private toastMark: ToastMark;

  private eventEmitter: Emitter;

  private latestEditorScrollTop: number | null = null;

  private latestPreviewScrollTop: number | null = null;

  private blockedScroll: ScrollFrom | null = null;

  private active = true;

  private mdEditor: MdEditor;

  private timer: NodeJS.Timeout | null = null;

  private footnoteContext: {
    markdown: string;
    lineMap: number[];
    previewToastMark: ToastMark;
  } | null = null;

  constructor(mdEditor: MdEditor, preview: MarkdownPreview, eventEmitter: Emitter) {
    const { previewContent: previewRoot, el: previewEl } = preview;

    this.preview = preview;
    this.previewRoot = previewRoot;
    this.previewEl = previewEl!;
    this.mdEditor = mdEditor;
    this.editorView = mdEditor.view;
    this.toastMark = mdEditor.getToastMark();
    this.eventEmitter = eventEmitter;
    this.addScrollSyncEvent();
  }

  private addScrollSyncEvent() {
    this.eventEmitter.listen('afterPreviewRender', () => {
      this.clearTimer();
      // Immediately after the 'afterPreviewRender' event has occurred,
      // browser rendering is not yet complete.
      // So the size of elements can not be accurately measured.
      this.timer = setTimeout(() => {
        this.syncPreviewScrollTop(true);
      }, 200);
    });
    this.eventEmitter.listen('scroll', (type, data) => {
      if (this.active) {
        if (type === 'editor' && this.blockedScroll !== 'editor') {
          this.syncPreviewScrollTop();
        } else if (type === 'preview' && this.blockedScroll !== 'preview') {
          this.syncEditorScrollTop(data);
        }
      }
    });
    this.eventEmitter.listen('toggleScrollSync', (active: boolean) => {
      this.active = active;
    });
  }

  private getFirstVisibleLineIndex(children: HTMLCollection, scrollTop: number) {
    const last = children.length - 1;

    if (last < 0) {
      return -1;
    }

    let low = 0;
    let high = last;

    while (low <= high) {
      const mid = (low + high) >> 1;
      const lineEl = children[mid] as HTMLElement;

      if (lineEl.offsetTop + lineEl.clientHeight <= scrollTop) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return Math.min(Math.max(low, 0), last);
  }

  private getMdNodeByPos(pos: number) {
    const line = this.editorView.state.doc.content.findIndex(pos).index + 1;

    return this.toastMark.findFirstNodeAtLine(line) as MdNode | null;
  }

  private getPreviewScrollTopByViewportAnchor(children: HTMLCollection) {
    const editorRect = this.editorView.dom.getBoundingClientRect();
    const probeLeft = editorRect.left + Math.min(48, Math.max(16, editorRect.width * 0.15));
    const probeTop = editorRect.top + Math.min(24, Math.max(6, editorRect.height * 0.08));
    const posInfo = this.editorView.posAtCoords({ left: probeLeft, top: probeTop });

    if (!posInfo) {
      return null;
    }

    const mdNodeAtProbe = this.getMdNodeByPos(posInfo.pos);

    if (!mdNodeAtProbe) {
      return null;
    }

    const { el, mdNode } = getParentNodeObj(this.previewRoot, mdNodeAtProbe);
    const { doc } = this.editorView.state;
    const startLine = getMdStartLine(mdNode) - 1;
    const startLineEl = children[startLine] as HTMLElement | undefined;

    if (!startLineEl) {
      return null;
    }

    const { height, rect } = getEditorRangeHeightInfo(doc, mdNode, children);
    const blockHeight = Math.max(height, 1);
    const relativeInBlock = Math.min(Math.max(probeTop - rect.top, 0), blockHeight);
    const ratio = relativeInBlock / blockHeight;
    const totalOffsetTop = getTotalOffsetTop(el, this.previewRoot) || el.offsetTop;
    const nodeHeight = Math.max(el.clientHeight, 1);
    const target = totalOffsetTop + nodeHeight * ratio;

    return Number.isFinite(target) ? target : null;
  }

  private getMdNodeAtLine(line: number) {
    const lineTexts = this.toastMark.getLineTexts();
    const lineText = lineTexts[line - 1] || '';
    const ch = Math.max(lineText.length, 1);

    return (
      (this.toastMark.findNodeAtPosition([line, ch]) as MdNode | null) ||
      (this.toastMark.findFirstNodeAtLine(line) as MdNode | null)
    );
  }

  private getPreviewScrollTopByEditorPosition(children: HTMLCollection, scrollTop: number) {
    const firstVisibleLineIndex = this.getFirstVisibleLineIndex(children, scrollTop);
    const { doc } = this.editorView.state;

    if (firstVisibleLineIndex < 0) {
      return null;
    }

    const line = firstVisibleLineIndex + 1;
    const mdNode = this.getMdNodeAtLine(line);

    if (!mdNode) {
      return null;
    }

    const { el, mdNode: parentNode } = getParentNodeObj(this.previewRoot, mdNode);
    const startLine = getMdStartLine(parentNode) - 1;
    const startLineEl = children[startLine] as HTMLElement | undefined;

    if (!startLineEl) {
      return null;
    }

    const { height } = getEditorRangeHeightInfo(doc, parentNode, children);
    const editorNodeHeight = Math.max(height, 1);
    const editorOffsetTop = startLineEl.offsetTop;
    const ratio = Math.min(Math.max((scrollTop - editorOffsetTop) / editorNodeHeight, 0), 1);
    const { nodeHeight, offsetTop } = getAndSaveOffsetInfo(el, this.previewRoot, parentNode.id);

    return offsetTop + nodeHeight * ratio;
  }

  private getFootnoteContext(markdown: string) {
    if (this.footnoteContext && this.footnoteContext.markdown === markdown) {
      return this.footnoteContext;
    }

    const mappedMarkdown = this.preview.getSourceMarkdownForLineMap();
    const lineMap = this.preview.getSourceToRenderedLineMap() || [];
    const previewToastMark = this.preview.getRenderedToastMark();

    if (mappedMarkdown !== markdown || !previewToastMark || !lineMap.length) {
      this.footnoteContext = null;

      return null;
    }

    this.footnoteContext = {
      markdown,
      lineMap,
      previewToastMark,
    };

    return this.footnoteContext;
  }

  private findMappedLine(lineMap: number[], sourceLine: number) {
    if (!lineMap.length) {
      return 0;
    }

    if (lineMap[sourceLine]) {
      return lineMap[sourceLine];
    }

    for (let line = sourceLine - 1; line >= 1; line -= 1) {
      if (lineMap[line]) {
        return lineMap[line];
      }
    }

    for (let line = sourceLine + 1; line < lineMap.length; line += 1) {
      if (lineMap[line]) {
        return lineMap[line];
      }
    }

    return 0;
  }

  private getPreviewScrollTopByFootnoteLineMap(children: HTMLCollection, scrollTop: number) {
    const markdown = this.mdEditor.getMarkdown();
    const firstVisibleLineIndex = this.getFirstVisibleLineIndex(children, scrollTop);

    if (firstVisibleLineIndex < 0) {
      return null;
    }

    const sourceLine = firstVisibleLineIndex + 1;
    const context = this.getFootnoteContext(markdown);

    if (!context) {
      return null;
    }

    const renderedLine = this.findMappedLine(context.lineMap, sourceLine);

    if (!renderedLine) {
      return null;
    }

    const renderedNode =
      (context.previewToastMark.findNodeAtPosition([renderedLine, 1]) as MdNode | null) ||
      (context.previewToastMark.findFirstNodeAtLine(renderedLine) as MdNode | null);

    if (!renderedNode) {
      return null;
    }

    let node: MdNode | null = renderedNode;
    let hasMappedNode = false;

    while (node && node.type !== 'document') {
      if (this.previewRoot.querySelector(`[data-nodeid="${node.id}"]`)) {
        hasMappedNode = true;
        break;
      }
      node = node.parent as MdNode | null;
    }

    if (!hasMappedNode) {
      return null;
    }

    const { el } = getParentNodeObj(this.previewRoot, renderedNode);

    if (!el) {
      return null;
    }

    const lineEl = children[firstVisibleLineIndex] as HTMLElement;
    const lineHeight = Math.max(lineEl.clientHeight, 1);
    const ratio = Math.min(Math.max((scrollTop - lineEl.offsetTop) / lineHeight, 0), 1);
    const totalOffsetTop = getTotalOffsetTop(el, this.previewRoot) || el.offsetTop;
    const shift = Math.min(el.clientHeight, lineHeight) * ratio;

    return totalOffsetTop + shift;
  }

  private getScrollTopByCaretPos() {
    const pos = this.mdEditor.getSelection();
    const firstMdNode = this.toastMark.findFirstNodeAtLine(pos[0][0])!;
    const previewHeight = this.previewEl.clientHeight;
    const { el } = getParentNodeObj(this.previewRoot, firstMdNode);
    const totalOffsetTop = getTotalOffsetTop(el, this.previewRoot) || el.offsetTop;
    const nodeHeight = el.clientHeight;
    // multiply 0.5 for calculating the position in the middle of preview area
    const targetScrollTop = totalOffsetTop + nodeHeight - previewHeight * 0.5;

    this.latestEditorScrollTop = null;

    const diff = el.getBoundingClientRect().top - this.previewEl.getBoundingClientRect().top;

    return diff < previewHeight ? null : targetScrollTop;
  }

  private syncPreviewScrollTop(editing = false) {
    const { editorView, previewEl } = this;
    const curScrollTop = previewEl.scrollTop;
    const { scrollTop, scrollHeight, clientHeight } = editorView.dom;
    const maxEditorScrollTop = Math.max(scrollHeight - clientHeight, 0);
    const maxPreviewScrollTop = Math.max(previewEl.scrollHeight - previewEl.clientHeight, 0);
    const isBottomPos = maxEditorScrollTop - scrollTop <= EDITOR_BOTTOM_PADDING;

    let targetScrollTop = isBottomPos ? maxPreviewScrollTop : 0;

    if (scrollTop > 0 && !isBottomPos) {
      if (editing) {
        const scrollTopByEditing = this.getScrollTopByCaretPos();

        if (!scrollTopByEditing) {
          return;
        }
        targetScrollTop = scrollTopByEditing;
      } else {
        const { children } = editorView.dom;
        if (hasFootnoteSyntax(this.mdEditor.getMarkdown())) {
          const mappedTop = this.getPreviewScrollTopByFootnoteLineMap(children, scrollTop);

          if (typeof mappedTop === 'number') {
            targetScrollTop = mappedTop;
          } else {
            const ratio = maxEditorScrollTop > 0 ? scrollTop / maxEditorScrollTop : 0;

            targetScrollTop = Math.round(maxPreviewScrollTop * ratio);
          }
        } else {
          const viewportTop = this.getPreviewScrollTopByViewportAnchor(children);
          const anchoredTop =
            typeof viewportTop === 'number'
              ? viewportTop
              : this.getPreviewScrollTopByEditorPosition(children, scrollTop);

          if (typeof anchoredTop === 'number') {
            targetScrollTop = anchoredTop;
          } else {
            const ratio = maxEditorScrollTop > 0 ? scrollTop / maxEditorScrollTop : 0;

            targetScrollTop = Math.round(maxPreviewScrollTop * ratio);
          }
        }
      }
      targetScrollTop = Math.min(Math.max(targetScrollTop, 0), maxPreviewScrollTop);
      targetScrollTop = this.getResolvedScrollTop(
        'editor',
        scrollTop,
        targetScrollTop,
        curScrollTop
      );
      this.latestEditorScrollTop = scrollTop;
    }

    if (targetScrollTop !== curScrollTop) {
      this.run('editor', targetScrollTop, curScrollTop);
    }
  }

  syncEditorScrollTop(targetNode: HTMLElement) {
    const { toastMark, editorView, previewRoot, previewEl } = this;
    const { dom, state } = editorView;
    const { scrollTop, clientHeight, scrollHeight } = previewEl;
    const isBottomPos = scrollHeight - scrollTop <= clientHeight;

    const curScrollTop = dom.scrollTop;
    let targetScrollTop = isBottomPos ? dom.scrollHeight : 0;

    if (scrollTop && targetNode && !isBottomPos) {
      targetNode = findAncestorHavingId(targetNode, previewRoot);

      if (!targetNode.getAttribute('data-nodeid')) {
        return;
      }

      const { children } = dom;
      const mdNodeId = Number(targetNode.getAttribute('data-nodeid'));
      const { mdNode, el } = getParentNodeObj(this.previewRoot, toastMark.findNodeById(mdNodeId)!);
      const mdNodeStartLine = getMdStartLine(mdNode);

      targetScrollTop = (children[mdNodeStartLine - 1] as HTMLElement).offsetTop;

      const { height } = getEditorRangeHeightInfo(state.doc, mdNode, children);
      const { nodeHeight, offsetTop } = getAndSaveOffsetInfo(el, previewRoot, mdNodeId);

      targetScrollTop += getAdditionalPos(scrollTop, offsetTop, nodeHeight, height);
      targetScrollTop = this.getResolvedScrollTop(
        'preview',
        scrollTop,
        targetScrollTop,
        curScrollTop
      );
      this.latestPreviewScrollTop = scrollTop;
    }

    if (targetScrollTop !== curScrollTop) {
      this.run('preview', targetScrollTop, curScrollTop);
    }
  }

  private getResolvedScrollTop(
    from: ScrollFrom,
    scrollTop: number,
    targetScrollTop: number,
    curScrollTop: number
  ) {
    const latestScrollTop =
      from === 'editor' ? this.latestEditorScrollTop : this.latestPreviewScrollTop;

    if (latestScrollTop === null) {
      return targetScrollTop;
    }

    if (from === 'editor') {
      return targetScrollTop;
    }

    return latestScrollTop < scrollTop
      ? Math.max(targetScrollTop, curScrollTop)
      : Math.min(targetScrollTop, curScrollTop);
  }

  private run(from: ScrollFrom, targetScrollTop: number, curScrollTop: number) {
    let scrollTarget: Element;

    if (from === 'editor') {
      scrollTarget = this.previewEl;
      this.blockedScroll = 'preview';
    } else {
      scrollTarget = this.editorView.dom;
      this.blockedScroll = 'editor';
    }

    const syncCallbacks: SyncCallbacks = {
      syncScrollTop: (scrollTop) => (scrollTarget.scrollTop = scrollTop),
      releaseEventBlock: () => (this.blockedScroll = null),
    };

    animate(curScrollTop, targetScrollTop, syncCallbacks);
  }

  clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  destroy() {
    this.clearTimer();
    this.eventEmitter.removeEventHandler('scroll');
    this.eventEmitter.removeEventHandler('afterPreviewRender');
  }
}
