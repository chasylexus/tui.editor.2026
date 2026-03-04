import { DOMParser, Node as ProsemirrorNode } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Emitter, Handler } from '@t/event';
import {
  Base,
  EditorOptions,
  EditorPos,
  EditorType,
  PreviewStyle,
  ViewerOptions,
  WidgetStyle,
} from '@t/editor';
import { PluginCommandMap, PluginInfoResult, CommandFn } from '@t/plugin';
import { Pos, MdPos } from '@t/toastmark';
import { MdNode, ToastMark } from '@techie_doubts/toastmark';

import { sendHostName, sanitizeLinkAttribute, deepMergedCopy } from './utils/common';

import MarkdownEditor from './markdown/mdEditor';
import MarkdownPreview from './markdown/mdPreview';

import WysiwygEditor from './wysiwyg/wwEditor';

import EventEmitter from './event/eventEmitter';
import CommandManager from './commands/commandManager';
import Convertor from './convertors/convertor';
import Viewer from './viewer';
import i18n, { I18n } from './i18n/i18n';
import { getPluginInfo } from './helper/plugin';
import { WwToDOMAdaptor } from './wysiwyg/adaptor/wwToDOMAdaptor';
import { ScrollSync } from './markdown/scroll/scrollSync';
import { addDefaultImageBlobHook } from './helper/image';
import { setWidgetRules } from './widget/rules';
import { cls, css, removeProseMirrorHackNodes, replaceBRWithEmptyBlock } from './utils/dom';
import { sanitizeHTML } from './sanitizer/htmlSanitizer';
import { createHTMLSchemaMap } from './wysiwyg/nodes/html';
import { getHTMLRenderConvertors } from './markdown/htmlRenderConvertors';
import { buildQuery } from './queries/queryManager';
import { getEditorToMdPos, getMdToEditorPos } from './markdown/helper/pos';
import SnapshotHistory, { Snapshot, SnapshotSelection } from './history/snapshotHistory';
import {
  hasFootnoteSyntax,
  hasTransformedFootnoteMarkup,
  restoreTransformedFootnotes,
  transformMarkdownFootnotes,
} from './utils/footnote';
import { createInlineRecorderSource } from './utils/media';

interface LineRange {
  startLine: number;
  endLine: number;
}

interface BlockRange {
  startIndex: number;
  endIndex: number;
}

interface WwEditRange {
  mdBlockIds: number[];
  wwRange: BlockRange;
  hasMissingId?: boolean;
}

interface MdPatch {
  range: LineRange;
  text: string;
}

interface MdBlockSlice {
  content: string;
  separator: string;
  type: string;
}

interface MdRootBlockInfo {
  blockId: number;
  startOffset: number;
}

interface MdRootBlockRange {
  blockId: number;
  startOffset: number;
  endOffset: number;
}

interface WwBlockRange {
  start: number;
  end: number;
}

type InlineRecorderViewState = 'idle' | 'recording' | 'paused' | 'processing';

interface InlineRecorderLike {
  state: 'inactive' | 'recording' | 'paused' | string;
  mimeType: string;
  start: (timeslice?: number) => void;
  stop: () => void;
  pause?: () => void;
  resume?: () => void;
  addEventListener: (type: string, listener: (...args: any[]) => void) => void;
}

interface InlineRecorderCtor {
  new (stream: MediaStream, options?: { mimeType?: string }): InlineRecorderLike;
  isTypeSupported?: (mimeType: string) => boolean;
}

interface InlineRecorderSession {
  recorder: InlineRecorderLike;
  stream: MediaStream;
  chunks: Blob[];
  label: string;
  elapsedSeconds: number;
  timerId: ReturnType<typeof setInterval> | null;
}

interface InlineRecorderDomStatus {
  viewState: InlineRecorderViewState;
  message: string;
  isError: boolean;
}

/**
 * ToastUIEditorCore
 * @param {Object} options Option object
 *     @param {HTMLElement} options.el - container element
 *     @param {string} [options.height='300px'] - Editor's height style value. Height is applied as border-box ex) '300px', '100%', 'auto'
 *     @param {string} [options.minHeight='200px'] - Editor's min-height style value in pixel ex) '300px'
 *     @param {string} [options.initialValue] - Editor's initial value
 *     @param {string} [options.previewStyle] - Markdown editor's preview style (tab, vertical)
 *     @param {boolean} [options.previewHighlight = true] - Highlight a preview element corresponds to the cursor position in the markdown editor
 *     @param {string} [options.initialEditType] - Initial editor type (markdown, wysiwyg)
 *     @param {Object} [options.events] - Events
 *         @param {function} [options.events.load] - It would be emitted when editor fully load
 *         @param {function} [options.events.change] - It would be emitted when content changed
 *         @param {function} [options.events.caretChange] - It would be emitted when format change by cursor position
 *         @param {function} [options.events.focus] - It would be emitted when editor get focus
 *         @param {function} [options.events.blur] - It would be emitted when editor loose focus
 *         @param {function} [options.events.keydown] - It would be emitted when the key is pressed in editor
 *         @param {function} [options.events.keyup] - It would be emitted when the key is released in editor
 *         @param {function} [options.events.beforePreviewRender] - It would be emitted before rendering the markdown preview with html string
 *         @param {function} [options.events.beforeConvertWysiwygToMarkdown] - It would be emitted before converting wysiwyg to markdown with markdown text
 *     @param {Object} [options.hooks] - Hooks
 *         @param {addImageBlobHook} [options.hooks.addImageBlobHook] - hook for image/audio/video upload
 *     @param {string} [options.language='en-US'] - language
 *     @param {boolean} [options.useCommandShortcut=true] - whether use keyboard shortcuts to perform commands
 *     @param {boolean} [options.usageStatistics=true] - send hostname to google analytics
 *     @param {Array.<string|toolbarItemsValue>} [options.toolbarItems] - toolbar items.
 *     @param {boolean} [options.hideModeSwitch=false] - hide mode switch tab bar
 *     @param {Array.<function|Array>} [options.plugins] - Array of plugins. A plugin can be either a function or an array in the form of [function, options].
 *     @param {Object} [options.extendedAutolinks] - Using extended Autolinks specified in GFM spec
 *     @param {string} [options.placeholder] - The placeholder text of the editable element.
 *     @param {Object} [options.linkAttributes] - Attributes of anchor element that should be rel, target, hreflang, type
 *     @param {Object} [options.customHTMLRenderer=null] - Object containing custom renderer functions correspond to change markdown node to preview HTML or wysiwyg node
 *     @param {Object} [options.customMarkdownRenderer=null] - Object containing custom renderer functions correspond to change wysiwyg node to markdown text
 *     @param {boolean} [options.referenceDefinition=false] - whether use the specification of link reference definition
 *     @param {function} [options.customHTMLSanitizer=null] - custom HTML sanitizer
 *     @param {boolean} [options.previewHighlight=false] - whether highlight preview area
 *     @param {boolean} [options.frontMatter=false] - whether use the front matter
 *     @param {Array.<object>} [options.widgetRules=[]] - The rules for replacing the text with widget node
 *     @param {string} [options.theme] - The theme to style the editor with. The default is included in toastui-editor.css.
 *     @param {autofocus} [options.autofocus=true] - automatically focus the editor on creation.
 */
class ToastUIEditorCore {
  private initialHTML: string;

  private toastMark: ToastMark;

  private mdEditor: MarkdownEditor;

  private wwEditor: WysiwygEditor;

  private preview: MarkdownPreview;

  private convertor: Convertor;

  private commandManager: CommandManager;

  private height!: string;

  private minHeight!: string;

  private mode!: EditorType;

  private mdPreviewStyle: PreviewStyle;

  private i18n: I18n;

  private scrollSync: ScrollSync;

  private placeholder?: string;

  private canonicalMd = '';

  private wwDirty = false;

  private suppressSnapshot = false;

  private snapshotHistory = new SnapshotHistory();

  private wwSerializeTimer: number | null = null;

  private readonly wwSerializeDelay = 300;

  private pendingMdBlockIds: Set<number> = new Set();

  private pendingWwRange: BlockRange | null = null;

  private pendingWwInvalidMapping = false;

  private readonly toastMarkOptions: Record<string, unknown>;

  private readonly previewSanitizer: (html: string) => string;

  private wwBaselineDoc: ProsemirrorNode | null = null;

  private baselineCanonicalMd: string | null = null;

  private lastWysiwygMdSelection: SnapshotSelection | null = null;

  private mdSelectionAtWwEntry: SnapshotSelection | null = null;

  private wwSelectionAtWwEntry: [number, number] | null = null;

  private inlineRecorderSessions = new Map<string, InlineRecorderSession>();

  private inlineRecorderStatus = new Map<string, InlineRecorderDomStatus>();

  private inlineRecorderClickHandler: ((ev: Event) => void) | null = null;

  private hashMd(text: string) {
    let hash = 0;

    for (let i = 0; i < text.length; i += 1) {
      hash = (hash * 31 + text.charCodeAt(i)) | 0;
    }

    return `h${hash >>> 0}`;
  }

  private isSnapshotDebug() {
    return typeof window !== 'undefined' && Boolean((window as any).__TOASTUI_SNAPSHOT_DEBUG__);
  }

  private tailText(text: string, limit = 80) {
    if (text.length <= limit) {
      return text;
    }

    return text.slice(text.length - limit);
  }

  private logSnapshotState(phase: string, extra?: Record<string, unknown>) {
    if (!this.isSnapshotDebug()) {
      return;
    }

    const canonical = this.canonicalMd;
    const editorMd = this.mdEditor.getMarkdown();

    // eslint-disable-next-line no-console
    console.log({
      phase,
      mode: this.mode,
      wwDirty: this.wwDirty,
      canonicalLen: canonical.length,
      canonicalTail80: this.tailText(canonical, 80),
      editorLen: editorMd.length,
      editorTail80: this.tailText(editorMd, 80),
      hash: this.hashMd(canonical),
      ...(extra || {}),
    });
  }

  private logWwDirty(next: boolean, reason: string) {
    if (!this.isSnapshotDebug()) {
      return;
    }

    // eslint-disable-next-line no-console
    console.log({ phase: 'wwDirty', next, reason, mode: this.mode, stack: new Error().stack });
  }

  private logCanonicalChange(nextMd: string, reason: string) {
    if (!this.isSnapshotDebug()) {
      return;
    }

    // eslint-disable-next-line no-console
    console.log({
      phase: 'canonicalMd',
      reason,
      prevLen: this.canonicalMd.length,
      nextLen: nextMd.length,
      prevTail: this.tailText(this.canonicalMd, 80),
      nextTail: this.tailText(nextMd, 80),
    });
  }

  private setWwBaseline(reason: string) {
    if (!this.isWysiwygMode()) {
      return;
    }

    this.wwBaselineDoc = this.wwEditor.getModel();
    if (this.isSnapshotDebug()) {
      // eslint-disable-next-line no-console
      console.log({ phase: 'ww-baseline-set', reason });
    }
  }

  private setBaselineCanonicalMd(reason: string) {
    this.baselineCanonicalMd = this.canonicalMd;
    if (this.isSnapshotDebug()) {
      // eslint-disable-next-line no-console
      console.log({ phase: 'baseline-canonical-set', reason });
    }
  }

  private preserveWindowScroll(task: () => void) {
    if (typeof window === 'undefined') {
      task();
      return;
    }

    const { scrollX, scrollY } = window;

    task();

    if (window.scrollX !== scrollX || window.scrollY !== scrollY) {
      window.scrollTo(scrollX, scrollY);
    }
  }

  private clampNumber(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
  }

  private ensureSelectionVisibleInEditor(view: EditorView, ratio = 0.33) {
    const container = view?.dom as HTMLElement | undefined;

    if (!container || container.clientHeight <= 0) {
      return;
    }

    const maxScrollTop = Math.max(container.scrollHeight - container.clientHeight, 0);

    if (maxScrollTop <= 0) {
      return;
    }

    const minPos = 1;
    const maxPos = Math.max(view.state.doc.content.size - 1, minPos);
    const selectionPos = this.clampNumber(view.state.selection.head, minPos, maxPos);
    let coords: { top: number; bottom: number };

    try {
      coords = view.coordsAtPos(selectionPos);
    } catch (_error) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const caretTop = container.scrollTop + (coords.top - containerRect.top);
    const targetTop = this.clampNumber(
      caretTop - container.clientHeight * ratio,
      0,
      maxScrollTop
    );
    const viewTop = container.scrollTop;
    const viewBottom = viewTop + container.clientHeight;
    const padding = Math.max(8, Math.round(container.clientHeight * 0.04));
    const inViewport = caretTop >= viewTop + padding && caretTop <= viewBottom - padding;
    const farFromTarget =
      Math.abs(container.scrollTop - targetTop) > Math.max(24, Math.round(container.clientHeight * 0.12));

    if (!inViewport || farFromTarget) {
      container.scrollTop = targetTop;
    }
  }

  private ensureSelectionVisibleInCurrentMode() {
    if (this.isWysiwygMode()) {
      this.ensureSelectionVisibleInEditor(this.wwEditor.view);
    } else {
      this.ensureSelectionVisibleInEditor(this.mdEditor.view);
    }
  }

  private compareMdPos(a: MdPos, b: MdPos) {
    if (a[0] !== b[0]) {
      return a[0] - b[0];
    }

    return a[1] - b[1];
  }

  private getMdRootBlockInfoAtPos(md: string, pos: MdPos): MdRootBlockInfo | null {
    const toastMark = this.createToastMark(md);
    const root = toastMark.getRootNode();
    const target = this.clampMdPos(md, pos);
    let blockId = 0;
    let node = root.firstChild as MdNode | null;

    while (node) {
      const source = node.sourcepos;

      if (source) {
        const start = source[0] as MdPos;
        const end = source[1] as MdPos;
        const inRange = this.compareMdPos(target, start) >= 0 && this.compareMdPos(target, end) <= 0;

        if (inRange) {
          return {
            blockId,
            startOffset: this.mdPosToOffset(md, start),
          };
        }
      }

      blockId += 1;
      node = node.next as MdNode | null;
    }

    return null;
  }

  private getMdRootBlockRangeById(md: string, blockId: number): MdRootBlockRange | null {
    const toastMark = this.createToastMark(md);
    const root = toastMark.getRootNode();
    let node = root.firstChild as MdNode | null;
    let index = 0;
    let startOffset: number | null = null;
    let nextStartOffset: number | null = null;

    while (node) {
      const source = node.sourcepos;

      if (source) {
        const nodeStart = this.mdPosToOffset(md, source[0] as MdPos);

        if (index === blockId) {
          startOffset = nodeStart;
        } else if (index === blockId + 1) {
          nextStartOffset = nodeStart;
          break;
        }
      }

      index += 1;
      node = node.next as MdNode | null;
    }

    if (startOffset === null) {
      return null;
    }

    return {
      blockId,
      startOffset,
      endOffset: Math.max(startOffset, nextStartOffset ?? md.length),
    };
  }

  private getMdBlockIdAtWysiwygPos(pos: number) {
    const { doc } = this.wwEditor.view.state;
    const minPos = 1;
    const maxPos = Math.max(doc.content.size - 1, minPos);
    const safePos = this.clampNumber(pos, minPos, maxPos);
    const $pos = doc.resolve(safePos);

    for (let depth = $pos.depth; depth >= 0; depth -= 1) {
      const node = $pos.node(depth);
      const blockId = node.attrs?.mdBlockId;

      if (typeof blockId === 'number') {
        return blockId;
      }
    }

    return null;
  }

  private commonPrefixLength(a: string, b: string) {
    const max = Math.min(a.length, b.length);
    let i = 0;

    while (i < max && a.charCodeAt(i) === b.charCodeAt(i)) {
      i += 1;
    }

    return i;
  }

  private commonSuffixLength(a: string, b: string) {
    const max = Math.min(a.length, b.length);
    let i = 0;

    while (i < max && a.charCodeAt(a.length - 1 - i) === b.charCodeAt(b.length - 1 - i)) {
      i += 1;
    }

    return i;
  }

  private refineCanonicalOffsetByContext(
    serializedMarkdown: string,
    serializedOffset: number,
    approxCanonicalOffset: number,
    canonicalStart: number,
    canonicalEnd: number
  ) {
    const canonical = this.canonicalMd;
    const window = 24;
    const safeSerializedOffset = this.clampNumber(serializedOffset, 0, serializedMarkdown.length);
    const pre = serializedMarkdown.slice(Math.max(0, safeSerializedOffset - window), safeSerializedOffset);
    const post = serializedMarkdown.slice(
      safeSerializedOffset,
      Math.min(serializedMarkdown.length, safeSerializedOffset + window)
    );
    const start = this.clampNumber(canonicalStart, 0, canonical.length);
    const end = this.clampNumber(canonicalEnd, start, canonical.length);
    const radius = 512;
    const lo = this.clampNumber(approxCanonicalOffset - radius, start, end);
    const hi = this.clampNumber(approxCanonicalOffset + radius, lo, end);
    let bestOffset = this.clampNumber(approxCanonicalOffset, lo, hi);
    let bestScore = -1;

    for (let candidate = lo; candidate <= hi; candidate += 1) {
      const beforeCandidate = canonical.slice(Math.max(start, candidate - pre.length), candidate);
      const afterCandidate = canonical.slice(candidate, Math.min(end, candidate + post.length));
      const suffix = this.commonSuffixLength(beforeCandidate, pre);
      const prefix = this.commonPrefixLength(afterCandidate, post);
      const score = suffix + prefix;

      if (
        score > bestScore ||
        (score === bestScore &&
          Math.abs(candidate - approxCanonicalOffset) < Math.abs(bestOffset - approxCanonicalOffset))
      ) {
        bestScore = score;
        bestOffset = candidate;
      }
    }

    return bestOffset;
  }

  private mapSerializedOffsetToCanonicalByWysiwygPos(
    serializedMarkdown: string,
    serializedOffset: number,
    wwPos: number
  ) {
    const safeSerializedOffset = this.clampNumber(serializedOffset, 0, serializedMarkdown.length);
    const blockId = this.getMdBlockIdAtWysiwygPos(wwPos);

    if (typeof blockId !== 'number') {
      return this.clampNumber(safeSerializedOffset, 0, this.canonicalMd.length);
    }

    const canonicalBlock = this.getMdRootBlockRangeById(this.canonicalMd, blockId);

    if (!canonicalBlock) {
      return this.clampNumber(safeSerializedOffset, 0, this.canonicalMd.length);
    }

    const wwRange = this.getFirstWwBlockRangeByMdBlockId(blockId);

    if (!wwRange) {
      return this.clampNumber(
        safeSerializedOffset,
        canonicalBlock.startOffset,
        canonicalBlock.endOffset
      );
    }

    const serializedBlockStart = this.getMdOffsetForWysiwygPos(wwRange.start);
    const serializedBlockEnd = this.getMdOffsetForWysiwygPos(wwRange.end);

    if (typeof serializedBlockStart !== 'number') {
      return this.clampNumber(
        safeSerializedOffset,
        canonicalBlock.startOffset,
        canonicalBlock.endOffset
      );
    }

    let adjustedOffset = safeSerializedOffset - (serializedBlockStart - canonicalBlock.startOffset);

    if (typeof serializedBlockEnd === 'number' && serializedBlockEnd > serializedBlockStart) {
      const serializedSpan = Math.max(serializedBlockEnd - serializedBlockStart, 1);
      const canonicalSpan = Math.max(canonicalBlock.endOffset - canonicalBlock.startOffset, 1);
      const relative = this.clampNumber(
        safeSerializedOffset - serializedBlockStart,
        0,
        serializedSpan
      );

      adjustedOffset =
        canonicalBlock.startOffset + Math.round((relative / serializedSpan) * canonicalSpan);
    }

    const clampedAdjusted = this.clampNumber(
      adjustedOffset,
      canonicalBlock.startOffset,
      canonicalBlock.endOffset
    );

    if (serializedMarkdown === this.canonicalMd) {
      return clampedAdjusted;
    }

    return this.refineCanonicalOffsetByContext(
      serializedMarkdown,
      safeSerializedOffset,
      clampedAdjusted,
      canonicalBlock.startOffset,
      canonicalBlock.endOffset
    );
  }

  private getWwBlockRangesByMdBlockId(blockId: number): WwBlockRange[] {
    const ranges: WwBlockRange[] = [];
    const { doc } = this.wwEditor.view.state;

    doc.descendants((node: ProsemirrorNode, pos: number) => {
      if (!node.isBlock) {
        return true;
      }

      if (node.attrs?.mdBlockId === blockId) {
        const start = pos + 1;
        const end = pos + node.nodeSize - 1;

        if (end >= start) {
          ranges.push({ start, end });
        }
      }

      return true;
    });

    return ranges;
  }

  private getNearestWwBlockRangeByMdBlockId(blockId: number, nearPos: number): WwBlockRange | null {
    const ranges = this.getWwBlockRangesByMdBlockId(blockId);

    if (!ranges.length) {
      return null;
    }

    let best = ranges[0];
    let bestDistance = Number.POSITIVE_INFINITY;

    ranges.forEach((range) => {
      const distance =
        nearPos < range.start ? range.start - nearPos : nearPos > range.end ? nearPos - range.end : 0;

      if (distance < bestDistance) {
        best = range;
        bestDistance = distance;
      }
    });

    return best;
  }

  private getFirstWwBlockRangeByMdBlockId(blockId: number): WwBlockRange | null {
    const ranges = this.getWwBlockRangesByMdBlockId(blockId);

    if (!ranges.length) {
      return null;
    }

    return ranges.reduce((best, current) => (current.start < best.start ? current : best), ranges[0]);
  }

  eventEmitter: Emitter;

  protected options: Required<EditorOptions>;

  protected pluginInfo: PluginInfoResult;

  constructor(options: EditorOptions) {
    this.initialHTML = options.el.innerHTML;
    options.el.innerHTML = '';

    this.options = Object.assign(
      {
        previewStyle: 'tab',
        previewHighlight: true,
        initialEditType: 'markdown',
        height: '300px',
        minHeight: '200px',
        language: 'en-US',
        useCommandShortcut: true,
        usageStatistics: true,
        toolbarItems: [
          ['heading', 'bold', 'italic', 'strike', 'mark', 'superscript', 'subscript', 'underline'],
          ['hr', 'quote'],
          ['ul', 'ol', 'task'],
          ['table', 'image', 'link', 'anchor'],
          ['code', 'codeblock'],
          ['scrollSync'],
        ],
        hideModeSwitch: false,
        linkAttributes: null,
        extendedAutolinks: false,
        customHTMLRenderer: null,
        customMarkdownRenderer: null,
        referenceDefinition: false,
        customHTMLSanitizer: null,
        frontMatter: false,
        widgetRules: [],
        theme: 'light',
        autofocus: true,
      },
      options
    );

    const {
      customHTMLRenderer,
      extendedAutolinks,
      referenceDefinition,
      frontMatter,
      customMarkdownRenderer,
      useCommandShortcut,
      initialEditType,
      widgetRules,
      customHTMLSanitizer,
    } = this.options;

    this.mode = initialEditType || 'markdown';
    this.mdPreviewStyle = this.options.previewStyle;

    this.i18n = i18n;
    this.i18n.setCode(this.options.language);

    this.eventEmitter = new EventEmitter();

    setWidgetRules(widgetRules);

    const linkAttributes = sanitizeLinkAttribute(this.options.linkAttributes);

    this.pluginInfo = getPluginInfo({
      plugins: this.options.plugins,
      eventEmitter: this.eventEmitter,
      usageStatistics: this.options.usageStatistics,
      instance: this,
    });
    const {
      toHTMLRenderers,
      toMarkdownRenderers,
      mdPlugins,
      wwPlugins,
      wwNodeViews,
      mdCommands,
      wwCommands,
      markdownParsers,
    } = this.pluginInfo;
    const rendererOptions = {
      linkAttributes,
      customHTMLRenderer: deepMergedCopy(toHTMLRenderers, customHTMLRenderer),
      extendedAutolinks,
      referenceDefinition,
      frontMatter,
      sanitizer: customHTMLSanitizer || sanitizeHTML,
    };
    const resolveMediaPath = (path: string, mediaType: 'image' | 'audio' | 'video' | 'embed') =>
      this.eventEmitter.emitReduce('resolveMediaPath', path, mediaType);

    this.previewSanitizer = rendererOptions.sanitizer;
    const wwToDOMAdaptor = new WwToDOMAdaptor(
      linkAttributes,
      rendererOptions.customHTMLRenderer,
      resolveMediaPath
    );
    const htmlSchemaMap = createHTMLSchemaMap(
      rendererOptions.customHTMLRenderer,
      rendererOptions.sanitizer,
      wwToDOMAdaptor
    );

    this.toastMarkOptions = {
      disallowedHtmlBlockTags: ['br', 'img'],
      extendedAutolinks,
      referenceDefinition,
      disallowDeepHeading: true,
      frontMatter,
      customParser: markdownParsers,
    };
    this.toastMark = new ToastMark('', this.toastMarkOptions);

    this.mdEditor = new MarkdownEditor(this.eventEmitter, {
      toastMark: this.toastMark,
      useCommandShortcut,
      mdPlugins,
    });

    this.preview = new MarkdownPreview(this.eventEmitter, {
      ...rendererOptions,
      isViewer: false,
      highlight: this.options.previewHighlight,
      resolveMediaPath,
    });

    this.wwEditor = new WysiwygEditor(this.eventEmitter, {
      toDOMAdaptor: wwToDOMAdaptor,
      useCommandShortcut,
      htmlSchemaMap,
      linkAttributes,
      wwPlugins,
      wwNodeViews,
    });

    this.convertor = new Convertor(
      this.wwEditor.getSchema(),
      { ...toMarkdownRenderers, ...customMarkdownRenderer },
      getHTMLRenderConvertors(linkAttributes, rendererOptions.customHTMLRenderer, resolveMediaPath),
      this.eventEmitter
    );

    this.setMinHeight(this.options.minHeight);

    this.setHeight(this.options.height);

    this.eventEmitter.listen('wwUserEdit', (range?: WwEditRange) => {
      this.logWwDirty(true, 'wwUserEdit');
      this.wwDirty = true;
      this.mdSelectionAtWwEntry = null;
      this.wwSelectionAtWwEntry = null;
      if (range) {
        this.addWwEditRange(range);
      }
      this.scheduleWwSerialize();
    });
    this.eventEmitter.listen('wwSelectionChange', ({ from, to }: { from: number; to: number }) => {
      if (!this.isWysiwygMode()) {
        return;
      }

      const isEntrySelection =
        Boolean(this.wwSelectionAtWwEntry) &&
        this.wwSelectionAtWwEntry![0] === from &&
        this.wwSelectionAtWwEntry![1] === to;

      if (!isEntrySelection) {
        this.mdSelectionAtWwEntry = null;
      }
      const mapped = getEditorToMdPos(this.wwEditor.view.state.doc, from, to) as [MdPos, MdPos];

      this.lastWysiwygMdSelection = this.getClampedSelectionForMd(this.canonicalMd, mapped);
    });
    this.eventEmitter.listen('pasteMarkdownInWysiwyg', (markdownText: string) =>
      this.pasteMarkdownInWysiwyg(markdownText)
    );
    this.eventEmitter.listen('updatePreview', () => {
      this.renderFootnotePreviewIfNeeded();
      this.refreshInlineRecorderDomState();
    });
    this.eventEmitter.listen('changeMode', () => this.refreshInlineRecorderDomState());
    this.eventEmitter.listen('change', (editorType: EditorType) => {
      if (editorType === 'markdown') {
        const nextMd = this.mdEditor.getMarkdown();

        this.logCanonicalChange(nextMd, 'md-change');
        this.canonicalMd = nextMd;
        this.logWwDirty(false, 'md-change');
        this.wwDirty = false;
        this.logSnapshotState('md-change');
        if (!this.suppressSnapshot) {
          this.pushSnapshot(this.canonicalMd);
        }
      }
      this.refreshInlineRecorderDomState();
    });

    if (this.options.hooks?.resolveMediaPath) {
      this.addHook('resolveMediaPath', this.options.hooks.resolveMediaPath);
    }

    this.runProgrammatic(() => {
      this.setMarkdown(this.options.initialValue, false, false, true);
    });
    this.canonicalMd = this.options.initialValue || '';

    if (this.options.placeholder) {
      this.setPlaceholder(this.options.placeholder);
    }

    if (!this.options.initialValue) {
      this.runProgrammatic(() => {
        this.setHTML(this.initialHTML, false, false, true);
      });
      this.canonicalMd = this.mdEditor.getMarkdown();
    }
    this.pushSnapshot(this.canonicalMd);
    this.lastWysiwygMdSelection = this.getClampedSelectionForMd(
      this.canonicalMd,
      this.mdEditor.getSelection() as [MdPos, MdPos]
    );
    if (this.isWysiwygMode()) {
      this.setWwBaseline('init');
      this.setBaselineCanonicalMd('init');
    }

    this.commandManager = new CommandManager(
      this.eventEmitter,
      this.mdEditor.commands,
      this.wwEditor.commands,
      () => this.mode
    );

    if (this.options.usageStatistics) {
      sendHostName();
    }

    this.scrollSync = new ScrollSync(this.mdEditor, this.preview, this.eventEmitter);
    this.addInitEvent();
    this.addInitCommand(mdCommands, wwCommands);
    this.addSnapshotCommands();
    buildQuery(this);

    if (this.options.hooks) {
      Object.entries(this.options.hooks).forEach(([key, fn]) => {
        if (fn) {
          this.addHook(key, fn);
        }
      });
    }

    if (this.options.events) {
      Object.entries(this.options.events).forEach(([key, fn]) => this.on(key, fn));
    }

    this.eventEmitter.emit('load', this);
    this.moveCursorToStart(this.options.autofocus);
  }

  private addInitEvent() {
    this.on('needChangeMode', this.changeMode.bind(this));
    this.on('loadUI', () => {
      if (this.height !== 'auto') {
        // 75px equals default editor ui height - the editing area height
        const minHeight = `${Math.min(
          parseInt(this.minHeight, 10),
          parseInt(this.height, 10) - 75
        )}px`;

        this.setMinHeight(minHeight);
      }
    });
    addDefaultImageBlobHook(this.eventEmitter);
    this.bindInlineRecorderEvents();
  }

  private bindInlineRecorderEvents() {
    if (this.inlineRecorderClickHandler) {
      return;
    }

    this.inlineRecorderClickHandler = (ev: Event) => {
      const target = ev.target as HTMLElement | null;
      const actionNode = target?.closest?.('.toastui-inline-recorder-action') as
        | HTMLElement
        | null;

      if (!actionNode) {
        return;
      }

      const recorderId = String(actionNode.dataset.recorderId || '').trim();
      const action = String(actionNode.dataset.recorderAction || '').trim();
      const wrapper = actionNode.closest('.toastui-inline-recorder') as HTMLElement | null;
      const label = String(wrapper?.dataset.recorderLabel || 'audio').trim() || 'audio';

      if (!recorderId || !action) {
        return;
      }

      if (actionNode.dataset.disabled === 'true') {
        return;
      }

      ev.preventDefault();
      ev.stopPropagation();

      if (action === 'start') {
        const currentViewState = this.inlineRecorderStatus.get(recorderId)?.viewState;

        if (currentViewState === 'recording') {
          this.pauseInlineRecorder(recorderId);
          return;
        }

        void this.startOrResumeInlineRecorder(recorderId, label);
        return;
      }

      if (action === 'pause') {
        this.pauseInlineRecorder(recorderId);
        return;
      }

      if (action === 'stop') {
        this.stopInlineRecorder(recorderId);
      }
    };

    this.options.el.addEventListener('click', this.inlineRecorderClickHandler);
    this.refreshInlineRecorderDomState();
  }

  private unbindInlineRecorderEvents() {
    if (this.inlineRecorderClickHandler) {
      this.options.el.removeEventListener('click', this.inlineRecorderClickHandler);
      this.inlineRecorderClickHandler = null;
    }
  }

  private getPreferredInlineRecorderMimeType(recorderCtor: InlineRecorderCtor) {
    if (typeof recorderCtor.isTypeSupported !== 'function') {
      return '';
    }

    const candidates = [
      'audio/mp4;codecs=mp4a.40.2',
      'audio/mp4',
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/wav',
    ];

    const matched = candidates.find((mimeType) => recorderCtor.isTypeSupported!(mimeType));

    return matched || '';
  }

  private guessAudioExtension(mimeType: string) {
    const normalized = String(mimeType || '').toLowerCase();

    if (normalized.includes('audio/mp4') || normalized.includes('m4a')) {
      return 'm4a';
    }
    if (normalized.includes('audio/mpeg') || normalized.includes('mp3')) {
      return 'mp3';
    }
    if (normalized.includes('audio/ogg')) {
      return 'ogg';
    }
    if (normalized.includes('audio/wav')) {
      return 'wav';
    }
    if (normalized.includes('audio/webm')) {
      return 'webm';
    }

    return 'm4a';
  }

  private formatInlineRecorderDuration(totalSeconds: number) {
    const safeTotal = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0;
    const hours = Math.min(999, Math.floor(safeTotal / 3600));
    const minutes = Math.floor((safeTotal % 3600) / 60);
    const seconds = safeTotal % 60;

    return `${String(hours).padStart(3, '0')}:${String(minutes).padStart(2, '0')}:${String(
      seconds
    ).padStart(2, '0')}`;
  }

  private getInlineRecorderStateMessage(viewState: InlineRecorderViewState, elapsedSeconds = 0) {
    const duration = this.formatInlineRecorderDuration(elapsedSeconds);

    if (viewState === 'recording') {
      return `Recording ${duration}`;
    }
    if (viewState === 'paused') {
      return `Paused ${duration}`;
    }
    if (viewState === 'processing') {
      return `Processing ${duration}`;
    }

    return `Ready ${duration}`;
  }

  private stopInlineRecorderTimer(recorderId: string) {
    const normalizedId = String(recorderId || '').trim();
    const session = this.inlineRecorderSessions.get(normalizedId);

    if (!session || !session.timerId) {
      return;
    }

    clearInterval(session.timerId);
    session.timerId = null;
  }

  private startInlineRecorderTimer(recorderId: string) {
    const normalizedId = String(recorderId || '').trim();
    const session = this.inlineRecorderSessions.get(normalizedId);

    if (!session || session.timerId) {
      return;
    }

    session.timerId = setInterval(() => {
      const activeSession = this.inlineRecorderSessions.get(normalizedId);

      if (!activeSession) {
        return;
      }

      if (activeSession.recorder.state !== 'recording') {
        return;
      }

      activeSession.elapsedSeconds += 1;
      this.setInlineRecorderDomState(
        normalizedId,
        'recording',
        this.getInlineRecorderStateMessage('recording', activeSession.elapsedSeconds)
      );
    }, 1000);
  }

  private setInlineRecorderDomState(
    recorderId: string,
    viewState: InlineRecorderViewState,
    message: string,
    isError = false
  ) {
    const normalizedId = String(recorderId || '').trim();

    if (!normalizedId) {
      return;
    }

    this.inlineRecorderStatus.set(normalizedId, {
      viewState,
      message,
      isError,
    });
    this.applyInlineRecorderDomState(normalizedId);
  }

  private applyInlineRecorderDomState(recorderId: string) {
    const normalizedId = String(recorderId || '').trim();

    if (!normalizedId) {
      return;
    }

    const state = this.inlineRecorderStatus.get(normalizedId) || {
      viewState: 'idle' as InlineRecorderViewState,
      message: this.getInlineRecorderStateMessage('idle', 0),
      isError: false,
    };

    const wrapperNodes = this.options.el.querySelectorAll(
      `.toastui-inline-recorder[data-recorder-id="${normalizedId}"]`
    );
    wrapperNodes.forEach((node) => {
      if (!(node instanceof HTMLElement)) {
        return;
      }

      node.dataset.recorderState = state.viewState;
      node.classList.toggle('is-recording', state.viewState === 'recording');
      node.classList.toggle('is-paused', state.viewState === 'paused');
      node.classList.toggle('is-processing', state.viewState === 'processing');
    });

    const statusNodes = this.options.el.querySelectorAll(
      `.toastui-inline-recorder-status[data-recorder-status="${normalizedId}"]`
    );
    statusNodes.forEach((node) => {
      if (!(node instanceof HTMLElement)) {
        return;
      }
      node.textContent = state.message;
      node.classList.toggle('is-error', state.isError);
    });

    const buttonNodes = this.options.el.querySelectorAll(
      `.toastui-inline-recorder-action[data-recorder-id="${normalizedId}"]`
    );
    buttonNodes.forEach((node) => {
      if (!(node instanceof HTMLElement)) {
        return;
      }

      const action = String(node.dataset.recorderAction || '');
      const isStart = action === 'start';
      const isStop = action === 'stop';

      if (isStart) {
        if (state.viewState === 'paused') {
          node.textContent = 'Resume';
          node.dataset.recorderVisual = 'resume';
        } else if (state.viewState === 'recording') {
          node.textContent = '';
          node.dataset.recorderVisual = 'pause';
        } else {
          node.textContent = '';
          node.dataset.recorderVisual = 'record';
        }
      }
      if (isStop) {
        node.textContent = '';
        node.dataset.recorderVisual = 'stop';
      }

      let disabled = false;

      if (state.viewState === 'recording') {
        disabled = false;
      } else if (state.viewState === 'paused') {
        disabled = false;
      } else if (state.viewState === 'processing') {
        disabled = true;
      } else {
        disabled = isStop;
      }

      node.dataset.disabled = disabled ? 'true' : 'false';
      node.classList.toggle('is-disabled', disabled);
    });
  }

  private refreshInlineRecorderDomState() {
    this.inlineRecorderStatus.forEach((_state, recorderId) => {
      this.applyInlineRecorderDomState(recorderId);
    });
  }

  private async startOrResumeInlineRecorder(recorderId: string, label: string) {
    const normalizedId = String(recorderId || '').trim();

    if (!normalizedId) {
      return;
    }

    const existing = this.inlineRecorderSessions.get(normalizedId);

    if (existing) {
      if (existing.recorder.state === 'paused' && typeof existing.recorder.resume === 'function') {
        existing.recorder.resume();
        this.startInlineRecorderTimer(normalizedId);
        this.setInlineRecorderDomState(
          normalizedId,
          'recording',
          this.getInlineRecorderStateMessage('recording', existing.elapsedSeconds)
        );
      }
      return;
    }

    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      this.setInlineRecorderDomState(normalizedId, 'idle', 'recording unavailable', true);
      return;
    }

    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      this.setInlineRecorderDomState(normalizedId, 'idle', 'microphone unavailable', true);
      return;
    }

    const recorderCtor = (window as Window & { MediaRecorder?: InlineRecorderCtor }).MediaRecorder;

    if (!recorderCtor) {
      this.setInlineRecorderDomState(normalizedId, 'idle', 'MediaRecorder unavailable', true);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = this.getPreferredInlineRecorderMimeType(recorderCtor);
      const recorder = mimeType ? new recorderCtor(stream, { mimeType }) : new recorderCtor(stream);
      const session: InlineRecorderSession = {
        recorder,
        stream,
        chunks: [],
        label: label || 'audio',
        elapsedSeconds: 0,
        timerId: null,
      };

      recorder.addEventListener('dataavailable', (event: { data?: Blob }) => {
        if (event?.data && event.data.size > 0) {
          session.chunks.push(event.data);
        }
      });
      recorder.addEventListener('stop', () => {
        void this.handleInlineRecorderStop(normalizedId);
      });

      this.inlineRecorderSessions.set(normalizedId, session);
      recorder.start(250);
      this.startInlineRecorderTimer(normalizedId);
      this.setInlineRecorderDomState(
        normalizedId,
        'recording',
        this.getInlineRecorderStateMessage('recording', session.elapsedSeconds)
      );
    } catch (_error) {
      this.setInlineRecorderDomState(normalizedId, 'idle', 'recording failed', true);
    }
  }

  private pauseInlineRecorder(recorderId: string) {
    const normalizedId = String(recorderId || '').trim();
    const session = this.inlineRecorderSessions.get(normalizedId);

    if (!session || session.recorder.state !== 'recording' || typeof session.recorder.pause !== 'function') {
      return;
    }

    session.recorder.pause();
    this.stopInlineRecorderTimer(normalizedId);
    this.setInlineRecorderDomState(
      normalizedId,
      'paused',
      this.getInlineRecorderStateMessage('paused', session.elapsedSeconds)
    );
  }

  private stopInlineRecorder(recorderId: string) {
    const normalizedId = String(recorderId || '').trim();
    const session = this.inlineRecorderSessions.get(normalizedId);

    if (!session) {
      return;
    }

    if (session.recorder.state !== 'recording' && session.recorder.state !== 'paused') {
      return;
    }

    this.stopInlineRecorderTimer(normalizedId);
    this.setInlineRecorderDomState(
      normalizedId,
      'processing',
      this.getInlineRecorderStateMessage('processing', session.elapsedSeconds)
    );
    session.recorder.stop();
  }

  private stopAllInlineRecorders() {
    this.inlineRecorderSessions.forEach((session, recorderId) => {
      this.stopInlineRecorderTimer(recorderId);

      try {
        if (session.recorder.state === 'recording' || session.recorder.state === 'paused') {
          session.recorder.stop();
        }
      } catch (_error) {
        // Ignore recorder stop errors.
      }

      try {
        session.stream.getTracks().forEach((track) => track.stop());
      } catch (_error) {
        // Ignore stream stop errors.
      }

      this.setInlineRecorderDomState(
        recorderId,
        'idle',
        this.getInlineRecorderStateMessage('idle', session.elapsedSeconds)
      );
    });

    this.inlineRecorderSessions.clear();
  }

  private resolveInlineRecorderBlob(file: File): Promise<{ url: string; text?: string }> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timeoutId: ReturnType<typeof setTimeout> = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        reject(new Error('Media hook timeout'));
      }, 20000);

      const callback = (url: string, text?: string) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeoutId);

        if (!String(url || '').trim()) {
          reject(new Error('Media hook returned empty URL'));
          return;
        }

        resolve({ url, text });
      };

      try {
        this.eventEmitter.emit('addImageBlobHook', file, callback, 'inline-recorder');
      } catch (error) {
        if (!settled) {
          settled = true;
          clearTimeout(timeoutId);
          reject(error);
        }
      }
    });
  }

  private escapeForRegExp(value: string) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private replaceInlineRecorderWithAudioLink(recorderId: string, nextSource: string, fallbackLabel = 'audio') {
    const normalizedId = String(recorderId || '').trim();
    const normalizedSource = String(nextSource || '').trim();

    if (!normalizedId || !normalizedSource) {
      return false;
    }

    const markdown = this.getMarkdown();
    const recorderSource = createInlineRecorderSource(normalizedId);
    const regex = new RegExp(`!\\[([^\\]]*)\\]\\(${this.escapeForRegExp(recorderSource)}\\)`);
    const match = markdown.match(regex);

    if (!match) {
      return false;
    }

    const label = String(match[1] || fallbackLabel || 'audio').trim() || 'audio';
    const replacement = `![${label}](${normalizedSource})`;
    const nextMarkdown = markdown.replace(regex, replacement);

    if (nextMarkdown === markdown) {
      return false;
    }

    this.runProgrammatic(() => {
      this.setMarkdown(nextMarkdown, false, false, true);
    });

    return true;
  }

  private async handleInlineRecorderStop(recorderId: string) {
    const normalizedId = String(recorderId || '').trim();
    const session = this.inlineRecorderSessions.get(normalizedId);

    if (!session) {
      this.setInlineRecorderDomState(normalizedId, 'idle', this.getInlineRecorderStateMessage('idle', 0));
      return;
    }

    this.stopInlineRecorderTimer(normalizedId);
    this.inlineRecorderSessions.delete(normalizedId);
    session.stream.getTracks().forEach((track) => track.stop());

    if (!session.chunks.length) {
      this.setInlineRecorderDomState(normalizedId, 'idle', 'no audio', true);
      return;
    }

    const mimeType = session.recorder.mimeType || session.chunks[0]?.type || 'audio/webm';
    const blob = new Blob(session.chunks, { type: mimeType });

    if (!blob.size) {
      this.setInlineRecorderDomState(normalizedId, 'idle', 'empty recording', true);
      return;
    }

    try {
      this.setInlineRecorderDomState(
        normalizedId,
        'processing',
        `Saving ${this.formatInlineRecorderDuration(session.elapsedSeconds)}...`
      );
      const extension = this.guessAudioExtension(mimeType);
      const fileName = `audio-${Date.now()}.${extension}`;
      const file = new File([blob], fileName, { type: mimeType });
      const payload = await this.resolveInlineRecorderBlob(file);
      const replaced = this.replaceInlineRecorderWithAudioLink(
        normalizedId,
        payload.url,
        payload.text || session.label || 'audio'
      );

      this.setInlineRecorderDomState(
        normalizedId,
        'idle',
        replaced
          ? `Saved ${this.formatInlineRecorderDuration(session.elapsedSeconds)}`
          : `Saved (refresh) ${this.formatInlineRecorderDuration(session.elapsedSeconds)}`
      );
    } catch (_error) {
      this.setInlineRecorderDomState(normalizedId, 'idle', 'save failed', true);
    }
  }

  private addInitCommand(mdCommands: PluginCommandMap, wwCommands: PluginCommandMap) {
    const addPluginCommands = (type: EditorType, commandMap: PluginCommandMap) => {
      Object.keys(commandMap).forEach((name) => {
        this.addCommand(type, name, commandMap[name]);
      });
    };

    this.addCommand('markdown', 'toggleScrollSync', (payload) => {
      this.eventEmitter.emit('toggleScrollSync', payload!.active);
      return true;
    });
    addPluginCommands('markdown', mdCommands);
    addPluginCommands('wysiwyg', wwCommands);
  }

  private addSnapshotCommands() {
    const undoCommand = () => {
      this.undoBySnapshot();
      return true;
    };
    const redoCommand = () => {
      this.redoBySnapshot();
      return true;
    };

    this.addCommand('markdown', 'undo', undoCommand);
    this.addCommand('markdown', 'redo', redoCommand);
    this.addCommand('wysiwyg', 'undo', undoCommand);
    this.addCommand('wysiwyg', 'redo', redoCommand);
  }

  private getCurrentModeEditor() {
    return (this.isMarkdownMode() ? this.mdEditor : this.wwEditor) as Base;
  }

  /**
   * Factory method for Editor
   * @param {object} options Option for initialize TUIEditor
   * @returns {object} ToastUIEditorCore or ToastUIEditorViewer
   */
  static factory(options: (EditorOptions | ViewerOptions) & { viewer?: boolean }) {
    return options.viewer ? new Viewer(options) : new ToastUIEditorCore(options as EditorOptions);
  }

  /**
   * Set language
   * @param {string|string[]} code - code for I18N language
   * @param {object} data - language set
   */
  static setLanguage(code: string | string[], data: Record<string, string>) {
    i18n.setLanguage(code, data);
  }

  /**
   * change preview style
   * @param {string} style - 'tab'|'vertical'
   */
  changePreviewStyle(style: PreviewStyle) {
    if (this.mdPreviewStyle !== style) {
      this.mdPreviewStyle = style;
      this.eventEmitter.emit('changePreviewStyle', style);
    }
  }

  /**
   * execute editor command
   * @param {string} name - command name
   * @param {object} [payload] - payload for command
   */
  exec(name: string, payload?: Record<string, any>) {
    this.commandManager.exec(name, payload);
  }

  /**
   * @param {string} type - editor type
   * @param {string} name - command name
   * @param {function} command - command handler
   */
  addCommand(type: EditorType, name: string, command: CommandFn) {
    const commandHoc = (paylaod: Record<string, any> = {}) => {
      const { view } = type === 'markdown' ? this.mdEditor : this.wwEditor;

      command(paylaod, view.state, view.dispatch, view);
    };

    this.commandManager.addCommand(type, name, commandHoc);
  }

  /**
   * Bind eventHandler to event type
   * @param {string} type Event type
   * @param {function} handler Event handler
   */
  on(type: string, handler: Handler) {
    this.eventEmitter.listen(type, handler);
  }

  /**
   * Unbind eventHandler from event type
   * @param {string} type Event type
   */
  off(type: string) {
    this.eventEmitter.removeEventHandler(type);
  }

  /**
   * Add hook to TUIEditor event
   * @param {string} type Event type
   * @param {function} handler Event handler
   */
  addHook(type: string, handler: Handler) {
    this.eventEmitter.removeEventHandler(type);
    this.eventEmitter.listen(type, handler);
  }

  /**
   * Remove hook from TUIEditor event
   * @param {string} type Event type
   */
  removeHook(type: string) {
    this.eventEmitter.removeEventHandler(type);
  }

  /**
   * Set focus to current Editor
   */
  focus() {
    this.getCurrentModeEditor().focus();
  }

  /**
   * Remove focus of current Editor
   */
  blur() {
    this.getCurrentModeEditor().blur();
  }

  /**
   * Set cursor position to end
   * @param {boolean} [focus] - automatically focus the editor
   */
  moveCursorToEnd(focus = true) {
    this.getCurrentModeEditor().moveCursorToEnd(focus);
  }

  /**
   * Set cursor position to start
   * @param {boolean} [focus] - automatically focus the editor
   */
  moveCursorToStart(focus = true) {
    this.getCurrentModeEditor().moveCursorToStart(focus);
  }

  /**
   * Set markdown syntax text.
   * @param {string} markdown - markdown syntax text.
   * @param {boolean} [cursorToEnd=true] - move cursor to contents end
   */
  setMarkdown(markdown = '', cursorToEnd = true, addToHistory = true, programmatic = false) {
    this.mdEditor.setMarkdown(markdown, cursorToEnd, addToHistory, programmatic);

    if (this.isWysiwygMode()) {
      const sourceMarkdown = this.mdEditor.getMarkdown();
      const mdNode = this.createToastMark(this.toRenderableMarkdown(sourceMarkdown)).getRootNode();
      const wwNode = this.convertor.toWysiwygModel(mdNode);

      this.wwEditor.setModel(wwNode!, cursorToEnd, addToHistory, programmatic);
    }
  }

  /**
   * Set html value.
   * @param {string} html - html syntax text
   * @param {boolean} [cursorToEnd=true] - move cursor to contents end
   */
  setHTML(html = '', cursorToEnd = true, addToHistory = true, programmatic = false) {
    const container = document.createElement('div');

    // the `br` tag should be replaced with empty block to separate between blocks
    container.innerHTML = replaceBRWithEmptyBlock(html);
    const wwNode = DOMParser.fromSchema(this.wwEditor.schema).parse(container);

    if (this.isMarkdownMode()) {
      this.mdEditor.setMarkdown(
        this.convertor.toMarkdownText(wwNode),
        cursorToEnd,
        addToHistory,
        programmatic
      );
    } else {
      this.wwEditor.setModel(wwNode, cursorToEnd, addToHistory, programmatic);
    }
  }

  private runProgrammatic(task: () => void) {
    this.suppressSnapshot = true;
    try {
      task();
    } finally {
      this.suppressSnapshot = false;
    }
  }

  private scheduleWwSerialize() {
    if (this.wwSerializeTimer) {
      clearTimeout(this.wwSerializeTimer);
      if (this.isSnapshotDebug()) {
        // eslint-disable-next-line no-console
        console.log({ phase: 'ww-flush-cancel' });
      }
    }

    this.wwSerializeTimer = window.setTimeout(() => {
      this.wwSerializeTimer = null;
      if (this.isSnapshotDebug()) {
        // eslint-disable-next-line no-console
        console.log({ phase: 'ww-flush-fired' });
      }
      this.flushSerializeAndMaybePush();
    }, this.wwSerializeDelay);
    if (this.isSnapshotDebug()) {
      // eslint-disable-next-line no-console
      console.log({ phase: 'ww-flush-scheduled', delay: this.wwSerializeDelay });
    }
  }

  private flushSerialize() {
    if (!this.pendingMdBlockIds.size && !this.pendingWwInvalidMapping) {
      return this.canonicalMd;
    }

    const baselineDoc = this.wwBaselineDoc;
    const baselineMd = this.baselineCanonicalMd;
    const wwDoc = this.wwEditor.getModel();

    if (baselineDoc && wwDoc.eq(baselineDoc)) {
      if (this.isSnapshotDebug()) {
        // eslint-disable-next-line no-console
        console.log({
          phase: 'ww-baseline-noop',
          wwDirtyBefore: this.wwDirty,
          hasBaseline: true,
        });
      }
      this.clearPendingWwEdits();
      if (baselineMd !== null && this.canonicalMd !== baselineMd) {
        this.logCanonicalChange(baselineMd, 'ww-baseline-noop');
        this.canonicalMd = baselineMd;
      }
      this.logWwDirty(false, 'ww-baseline-noop');
      this.wwDirty = false;
      return this.canonicalMd;
    }

    let shouldSerializeAll = this.pendingWwInvalidMapping;
    const mdBlocks = this.buildMdBlockSlices(this.canonicalMd);
    const nextBlocks = mdBlocks ? mdBlocks.slice() : null;
    const mdBlockIds = Array.from(this.pendingMdBlockIds).sort((a, b) => a - b);

    if (!mdBlocks || !nextBlocks) {
      shouldSerializeAll = true;
    } else {
      mdBlockIds.forEach((mdBlockId) => {
        if (mdBlockId < 0 || mdBlockId >= nextBlocks.length) {
          shouldSerializeAll = true;
          return;
        }

        const newBlock = this.serializeWwBlocksById(mdBlockId);

        if (!newBlock) {
          shouldSerializeAll = true;
          return;
        }

        const oldSlice = nextBlocks[mdBlockId];
        // Replace exact mdBlockId slice with full serialized content. No heuristics: all WW blocks
        // with this mdBlockId were serialized together, so newBlock is the full slice (avoids tail loss).
        const nextContent = newBlock;

        nextBlocks[mdBlockId] = {
          content: nextContent,
          separator: oldSlice.separator,
          type: oldSlice.type,
        };
      });
    }

    let nextMd = nextBlocks ? this.joinMdBlocks(nextBlocks) : this.canonicalMd;

    if (shouldSerializeAll) {
      nextMd = this.convertor.toMarkdownText(wwDoc);
    }

    if (
      hasFootnoteSyntax(this.canonicalMd) ||
      hasTransformedFootnoteMarkup(this.canonicalMd) ||
      hasTransformedFootnoteMarkup(nextMd)
    ) {
      nextMd = restoreTransformedFootnotes(nextMd).markdown;
    }

    if (baselineMd && nextMd === baselineMd) {
      if (this.isSnapshotDebug()) {
        // eslint-disable-next-line no-console
        console.log({
          phase: 'baseline-md-noop',
          wwDirtyBefore: this.wwDirty,
        });
      }
      this.clearPendingWwEdits();
      this.logWwDirty(false, 'baseline-md-noop');
      this.wwDirty = false;
      return this.canonicalMd;
    }

    if (this.isSnapshotDebug() && mdBlocks && nextBlocks) {
      const oldLens = this.getBlockLenInfo(mdBlocks, mdBlockIds);
      const newLens = this.getBlockLenInfo(nextBlocks, mdBlockIds);
      const outsideHash = this.getOutsideBlocksHash(mdBlocks, nextBlocks, mdBlockIds);
      const wwBlockCounts = mdBlockIds.map((id) => this.getWwBlockCountById(id));
      const sliceInfo = mdBlockIds.map((id) => {
        const oldSlice = mdBlocks[id];
        const newSlice = nextBlocks[id];

        return {
          mdBlockId: id,
          oldSliceLen: oldSlice ? oldSlice.content.length : null,
          newSliceLen: newSlice ? newSlice.content.length : null,
          wwBlocksCaptured: this.getWwBlockCountById(id),
          tailPreserved:
            !oldSlice?.content.includes('\n') ||
            (!!newSlice && newSlice.content.length >= oldSlice.content.length),
        };
      });

      // eslint-disable-next-line no-console
      console.log({
        phase: 'patch-debug',
        affectedWwBlockIndices: this.pendingWwRange,
        derivedMdBlockIds: mdBlockIds,
        wwBlockCountsPerId: wwBlockCounts,
        oldLens,
        newLens,
        sliceInfo,
        outsideHash,
        tailPreserved: sliceInfo.every((s) => s.tailPreserved !== false),
      });
    }

    this.pendingMdBlockIds.clear();
    this.pendingWwInvalidMapping = false;
    this.pendingWwRange = null;

    return nextMd;
  }

  private flushSerializeAndMaybePush() {
    if (this.isSnapshotDebug()) {
      // eslint-disable-next-line no-console
      console.log({ phase: 'ww-flush-start', wwDirty: this.wwDirty });
    }
    const prevMd = this.canonicalMd;
    const prevSelection = this.getWysiwygSelectionForMd(prevMd);
    const nextMd = this.flushSerialize();

    if (nextMd !== prevMd) {
      this.lastWysiwygMdSelection = this.transformSelectionByDiff(prevMd, nextMd, prevSelection);
      this.logCanonicalChange(nextMd, 'ww-flush-serialize');
      this.canonicalMd = nextMd;
      this.pushSnapshot(nextMd);
    }
    this.logWwDirty(false, 'ww-flush-serialize');
    this.wwDirty = false;

    return nextMd;
  }

  private flushPendingWwSerialize() {
    if (this.wwSerializeTimer) {
      clearTimeout(this.wwSerializeTimer);
      this.wwSerializeTimer = null;
    }

    if (this.wwDirty) {
      this.flushSerializeAndMaybePush();
    }
  }

  private clearPendingWwEdits() {
    if (this.wwSerializeTimer) {
      clearTimeout(this.wwSerializeTimer);
      this.wwSerializeTimer = null;
    }
    this.pendingMdBlockIds.clear();
    this.pendingWwInvalidMapping = false;
    this.pendingWwRange = null;
  }

  private createToastMark(markdown: string) {
    return new ToastMark(markdown, this.toastMarkOptions);
  }

  private toRenderableMarkdown(markdown: string) {
    return transformMarkdownFootnotes(markdown).markdown;
  }

  private renderFullPreview(
    markdown: string,
    sourceToRenderedLineMap: number[] | null = null,
    sourceMarkdownForLineMap: string | null = null
  ) {
    const previewToastMark = this.createToastMark(markdown);
    const rootNode = previewToastMark.getRootNode();
    const renderer = this.preview.getRenderer();
    const rendered: string[] = [];
    let node = rootNode.firstChild as MdNode | null;

    this.preview.setRenderedToastMark(
      previewToastMark,
      sourceToRenderedLineMap,
      sourceMarkdownForLineMap
    );

    while (node) {
      rendered.push(renderer.render(node));
      node = node.next as MdNode | null;
    }

    const html = this.eventEmitter.emitReduce(
      'beforePreviewRender',
      this.previewSanitizer(rendered.join(''))
    );

    this.preview.setHTML(html);
    this.eventEmitter.emit('afterPreviewRender', this.preview);
  }

  private renderFootnotePreviewIfNeeded() {
    const sourceMarkdown = this.mdEditor.getMarkdown();
    const hasRenderedLineMap = Boolean(this.preview.getSourceToRenderedLineMap());
    const hasMappedSourceMarkdown = this.preview.getSourceMarkdownForLineMap() !== null;

    if (hasFootnoteSyntax(sourceMarkdown)) {
      const transformed = transformMarkdownFootnotes(sourceMarkdown);

      this.renderFullPreview(
        transformed.markdown,
        transformed.sourceToRenderedLineMap || null,
        sourceMarkdown
      );
      return;
    }

    if (hasTransformedFootnoteMarkup(sourceMarkdown)) {
      this.renderFullPreview(sourceMarkdown, null, null);
      return;
    }

    // When we leave the transformed-footnote path (e.g. delete all markdown), incremental
    // preview patches may target stale node ids from transformed content. Force a single
    // full render to reset preview and line mapping back to source markdown.
    if (hasRenderedLineMap || hasMappedSourceMarkdown) {
      this.renderFullPreview(sourceMarkdown, null, null);
    }
  }

  private replaceMdRange(md: string, start: MdPos, end: MdPos, text: string) {
    const lines = md.split('\n');
    const startLineIndex = Math.max(start[0] - 1, 0);
    const endLineIndex = Math.max(end[0] - 1, 0);
    const startLineText = lines[startLineIndex] ?? '';
    const endLineText = lines[endLineIndex] ?? '';
    const startChIndex = Math.min(Math.max(start[1] - 1, 0), startLineText.length);
    const endChIndex = Math.min(Math.max(end[1] - 1, 0), endLineText.length);
    const prefix = startLineText.slice(0, startChIndex);
    const suffix = endLineText.slice(endChIndex);
    const insertedLines = text.split('\n');
    let cursor: MdPos;

    if (insertedLines.length === 1) {
      const replacedLine = `${prefix}${insertedLines[0]}${suffix}`;

      lines.splice(startLineIndex, endLineIndex - startLineIndex + 1, replacedLine);
      cursor = [startLineIndex + 1, prefix.length + insertedLines[0].length + 1];
    } else {
      const firstLine = `${prefix}${insertedLines[0]}`;
      const middleLines = insertedLines.slice(1, -1);
      const lastInsertedLine = insertedLines[insertedLines.length - 1];
      const lastLine = `${lastInsertedLine}${suffix}`;
      const replacement = [firstLine, ...middleLines, lastLine];

      lines.splice(startLineIndex, endLineIndex - startLineIndex + 1, ...replacement);
      cursor = [startLineIndex + insertedLines.length, lastInsertedLine.length + 1];
    }

    return {
      markdown: lines.join('\n'),
      selection: {
        anchor: cursor,
        head: cursor,
        collapsed: true,
      } as SnapshotSelection,
    };
  }

  private pasteMarkdownInWysiwyg(markdownText: string) {
    if (!this.isWysiwygMode()) {
      return false;
    }

    const normalized = markdownText.replace(/\r\n/g, '\n');
    const trimmed = normalized.trim();

    if (!trimmed) {
      return false;
    }

    const fallbackSelection = this.getWysiwygSelectionForMd(this.canonicalMd);
    const anchor = this.createPasteAnchor();
    const marked = this.serializeWysiwygMarkdownWithAnchor(anchor);
    const serialized = marked?.markdown ?? '';
    const anchorIndex = marked?.anchorIndex ?? -1;

    if (anchorIndex < 0) {
      const next = this.replaceMdRange(
        this.canonicalMd,
        fallbackSelection.anchor,
        fallbackSelection.head,
        normalized
      );

      this.applyProgrammatic(next.markdown, next.selection);
      this.pushSnapshot(next.markdown);

      return true;
    }

    const markdown = `${serialized.slice(0, anchorIndex)}${normalized}${serialized.slice(
      anchorIndex + anchor.length
    )}`;
    const cursorOffset = anchorIndex + normalized.length;
    const cursor = this.clampMdPos(markdown, this.mdOffsetToPos(markdown, cursorOffset));
    const selection = this.createSnapshotSelection(cursor, cursor);

    this.applyProgrammatic(markdown, selection);
    this.pushSnapshot(markdown);

    return true;
  }

  private createPasteAnchor() {
    return `TOASTUIPASTEANCHOR${Date.now()}${Math.random().toString(36).slice(2)}`;
  }

  private serializeWysiwygDocToMarkdown(doc: ProsemirrorNode) {
    let markdown = this.convertor.toMarkdownText(doc);

    if (
      hasFootnoteSyntax(this.canonicalMd) ||
      hasTransformedFootnoteMarkup(this.canonicalMd) ||
      hasTransformedFootnoteMarkup(markdown)
    ) {
      markdown = restoreTransformedFootnotes(markdown).markdown;
    }

    return markdown;
  }

  private serializeWysiwygMarkdownWithAnchor(anchor: string) {
    const { view } = this.wwEditor;
    const { state } = view;
    const selection =
      state.selection instanceof TextSelection
        ? state.selection
        : TextSelection.create(state.doc, state.selection.from, state.selection.to);
    const markedDoc = state.tr.setSelection(selection).insertText(anchor, selection.from, selection.to).doc;
    const markdown = this.serializeWysiwygDocToMarkdown(markedDoc);
    const anchorIndex = markdown.indexOf(anchor);

    if (anchorIndex < 0) {
      return null;
    }

    return { markdown, anchorIndex };
  }

  private getMdOffsetForWysiwygPos(pos: number) {
    const { state } = this.wwEditor.view;
    const minPos = 1;
    const maxPos = Math.max(state.doc.content.size - 1, minPos);
    const safePos = this.clampNumber(pos, minPos, maxPos);
    const marker = this.createPasteAnchor();
    const markedDoc = state.tr.insertText(marker, safePos, safePos).doc;
    const markdown = this.serializeWysiwygDocToMarkdown(markedDoc);
    const markerIndex = markdown.indexOf(marker);

    return markerIndex >= 0 ? markerIndex : null;
  }

  private refineWysiwygCursorPosByMdOffset(
    targetMdOffset: number,
    initialPos: number,
    boundStart?: number,
    boundEnd?: number
  ) {
    const { state } = this.wwEditor.view;
    const hardMinPos = 1;
    const hardMaxPos = Math.max(state.doc.content.size - 1, hardMinPos);
    const minPos = this.clampNumber(
      typeof boundStart === 'number' ? boundStart : hardMinPos,
      hardMinPos,
      hardMaxPos
    );
    const maxPos = this.clampNumber(
      typeof boundEnd === 'number' ? boundEnd : hardMaxPos,
      minPos,
      hardMaxPos
    );
    const startPos = this.clampNumber(initialPos, minPos, maxPos);
    const offsetCache = new Map<number, number | null>();
    const getOffset = (candidatePos: number) => {
      const safePos = this.clampNumber(candidatePos, minPos, maxPos);

      if (offsetCache.has(safePos)) {
        return offsetCache.get(safePos) as number | null;
      }

      const offset = this.getMdOffsetForWysiwygPos(safePos);

      offsetCache.set(safePos, offset);

      return offset;
    };
    const evalDistance = (candidatePos: number) => {
      const offset = getOffset(candidatePos);

      return offset === null ? null : Math.abs(offset - targetMdOffset);
    };
    let bestPos = startPos;
    let bestDistance = evalDistance(startPos);

    if (bestDistance === null || bestDistance === 0) {
      return startPos;
    }

    let lo = minPos;
    let hi = maxPos;
    let iteration = 0;
    const maxIterations = 32;

    while (lo <= hi && iteration < maxIterations) {
      const mid = Math.floor((lo + hi) / 2);
      const midOffset = getOffset(mid);

      if (midOffset === null) {
        break;
      }

      const midDistance = Math.abs(midOffset - targetMdOffset);
      if (
        midDistance < (bestDistance as number) ||
        (midDistance === bestDistance && Math.abs(mid - startPos) < Math.abs(bestPos - startPos))
      ) {
        bestPos = mid;
        bestDistance = midDistance;
      }

      if (midOffset === targetMdOffset) {
        return mid;
      }

      if (midOffset < targetMdOffset) {
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }

      iteration += 1;
    }

    const fineRadius = 24;
    const fineStart = this.clampNumber(bestPos - fineRadius, minPos, maxPos);
    const fineEnd = this.clampNumber(bestPos + fineRadius, minPos, maxPos);

    for (let candidatePos = fineStart; candidatePos <= fineEnd; candidatePos += 1) {
      const candidateDistance = evalDistance(candidatePos);

      if (candidateDistance === null) {
        continue;
      }

      if (
        candidateDistance < (bestDistance as number) ||
        (candidateDistance === bestDistance &&
          Math.abs(candidatePos - startPos) < Math.abs(bestPos - startPos))
      ) {
        bestPos = candidatePos;
        bestDistance = candidateDistance;
      }
    }

    return bestPos;
  }

  private getExactMdSelectionFromWysiwyg(): SnapshotSelection | null {
    const { view } = this.wwEditor;
    const { state } = view;
    const { from, to } = state.selection;
    const markerStart = this.createPasteAnchor();
    const markerEnd = this.createPasteAnchor();
    const selection =
      state.selection instanceof TextSelection
        ? state.selection
        : TextSelection.create(state.doc, from, to);
    let tr = state.tr.setSelection(selection);
    const collapsed = from === to;

    if (collapsed) {
      tr = tr.insertText(markerStart, from, to);
    } else {
      tr = tr.insertText(markerEnd, to, to);
      tr = tr.insertText(markerStart, from, from);
    }

    const markedMarkdown = this.serializeWysiwygDocToMarkdown(tr.doc);
    const startIndex = markedMarkdown.indexOf(markerStart);

    if (startIndex < 0) {
      return null;
    }

    if (collapsed) {
      const withoutMarker = markedMarkdown.replace(markerStart, '');
      const canonicalOffset = this.mapSerializedOffsetToCanonicalByWysiwygPos(
        withoutMarker,
        startIndex,
        from
      );
      const cursor = this.clampMdPos(this.canonicalMd, this.mdOffsetToPos(this.canonicalMd, canonicalOffset));

      return this.createSnapshotSelection(cursor, cursor);
    }

    const endIndex = markedMarkdown.indexOf(markerEnd);

    if (endIndex < 0 || endIndex < startIndex) {
      return null;
    }

    const withoutMarkers = markedMarkdown.replace(markerStart, '').replace(markerEnd, '');
    const anchorOffset = startIndex;
    const headOffset = endIndex - markerStart.length;
    const anchor = this.clampMdPos(withoutMarkers, this.mdOffsetToPos(withoutMarkers, anchorOffset));
    const head = this.clampMdPos(withoutMarkers, this.mdOffsetToPos(withoutMarkers, headOffset));

    return this.createSnapshotSelection(anchor, head);
  }

  private addWwEditRange(range: WwEditRange) {
    if (range.hasMissingId || hasFootnoteSyntax(this.canonicalMd)) {
      this.pendingWwInvalidMapping = true;
    }
    range.mdBlockIds.forEach((id) => this.pendingMdBlockIds.add(id));
    this.pendingWwRange = range.wwRange;
  }

  private splitLines(text: string) {
    if (text === '') {
      return [];
    }

    return text.split('\n');
  }

  private getRootBlocks(toastMark: ToastMark) {
    const root = toastMark.getRootNode();
    const blocks: MdNode[] = [];
    let node = root.firstChild as MdNode | null;

    while (node) {
      blocks.push(node);
      node = node.next as MdNode | null;
    }

    return blocks;
  }

  private getLineOffsets(lineTexts: string[]) {
    const offsets = [];
    let acc = 0;

    for (let i = 0; i < lineTexts.length; i += 1) {
      offsets.push(acc);
      acc += lineTexts[i].length + 1;
    }

    return offsets;
  }

  private getOffsetForPos(lineOffsets: number[], line: number, ch: number) {
    const lineIndex = Math.max(line - 1, 0);
    const base = lineOffsets[lineIndex] ?? 0;
    const col = Math.max(ch - 1, 0);

    return base + col;
  }

  private buildMdBlockSlices(md: string): MdBlockSlice[] | null {
    const toastMark = this.createToastMark(md);
    const lineTexts = toastMark.getLineTexts();
    const lineOffsets = this.getLineOffsets(lineTexts);
    const blocks = this.getRootBlocks(toastMark);

    if (!blocks.length) {
      return [{ content: md, separator: '', type: 'paragraph' }];
    }

    const slices: MdBlockSlice[] = [];
    const startOffsets = blocks.map((block) => {
      const startPos = block.sourcepos && block.sourcepos[0];

      if (!startPos) {
        return null;
      }

      return this.getOffsetForPos(lineOffsets, startPos[0], startPos[1]);
    });
    const endOffsets = blocks.map((block) => {
      const endPos = block.sourcepos && block.sourcepos[1];

      if (!endPos) {
        return null;
      }

      return Math.min(this.getOffsetForPos(lineOffsets, endPos[0], endPos[1]) + 1, md.length);
    });

    if (
      startOffsets.some((offset) => offset === null) ||
      endOffsets.some((offset) => offset === null)
    ) {
      return null;
    }

    for (let i = 0; i < blocks.length; i += 1) {
      const startOffset = startOffsets[i] as number;
      const endOffset = endOffsets[i] as number;
      const nextStart = i + 1 < startOffsets.length ? (startOffsets[i + 1] as number) : md.length;

      if (startOffset > nextStart) {
        return null;
      }

      const content = md.slice(startOffset, endOffset);
      const separator = md.slice(endOffset, nextStart);
      const { type } = blocks[i];

      slices.push({ content, separator, type });
    }

    return slices;
  }

  private joinMdBlocks(blocks: MdBlockSlice[]) {
    return blocks.map((block) => `${block.content}${block.separator}`).join('');
  }

  private normalizeBlockText(text: string) {
    return text.replace(/\s+/g, ' ');
  }

  private buildNormalizedMapping(text: string) {
    const mapping: number[] = [];
    let normalized = '';
    let inWhitespace = false;

    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      const isWs = /\s/.test(ch);

      if (isWs) {
        if (!inWhitespace) {
          normalized += ' ';
          mapping.push(i);
          inWhitespace = true;
        }
      } else {
        normalized += ch;
        mapping.push(i);
        inWhitespace = false;
      }
    }

    return { normalized, mapping };
  }

  private getNormIndexToSrcIndex(mapping: number[], normIndex: number, textLength: number) {
    if (normIndex <= 0) {
      return 0;
    }
    if (normIndex >= mapping.length) {
      return textLength;
    }

    return mapping[normIndex];
  }

  private computeCommonAffix(oldText: string, newText: string) {
    const oldLen = oldText.length;
    const newLen = newText.length;
    let prefixLen = 0;

    while (prefixLen < oldLen && prefixLen < newLen && oldText[prefixLen] === newText[prefixLen]) {
      prefixLen += 1;
    }

    let suffixLen = 0;

    while (
      suffixLen < oldLen - prefixLen &&
      suffixLen < newLen - prefixLen &&
      oldText[oldLen - 1 - suffixLen] === newText[newLen - 1 - suffixLen]
    ) {
      suffixLen += 1;
    }

    return { prefixLen, suffixLen };
  }

  private patchParagraphSoftBreaks(oldSlice: MdBlockSlice, newSerialized: string, debug: boolean) {
    if (oldSlice.type !== 'paragraph' || !oldSlice.content.includes('\n')) {
      return newSerialized;
    }

    const oldNormData = this.buildNormalizedMapping(oldSlice.content);
    const newNorm = this.normalizeBlockText(newSerialized);
    const oldNorm = oldNormData.normalized;
    const { prefixLen, suffixLen } = this.computeCommonAffix(oldNorm, newNorm);
    const oldMidStart = prefixLen;
    const oldMidEnd = oldNorm.length - suffixLen;
    const newMidStart = prefixLen;
    const newMidEnd = newNorm.length - suffixLen;

    if (oldMidStart > oldMidEnd || newMidStart > newMidEnd) {
      if (debug) {
        // eslint-disable-next-line no-console
        console.log({ phase: 'softbreak-patch', preserveApplied: false, reason: 'invalid-span' });
      }
      return newSerialized;
    }

    const startIdx = this.getNormIndexToSrcIndex(
      oldNormData.mapping,
      oldMidStart,
      oldSlice.content.length
    );
    const endIdx =
      oldMidEnd <= oldMidStart
        ? startIdx
        : this.getNormIndexToSrcIndex(oldNormData.mapping, oldMidEnd, oldSlice.content.length);

    if (startIdx > endIdx) {
      if (debug) {
        // eslint-disable-next-line no-console
        console.log({ phase: 'softbreak-patch', preserveApplied: false, reason: 'index-order' });
      }
      return newSerialized;
    }

    const replacement = newNorm.slice(newMidStart, newMidEnd);
    const patched =
      oldSlice.content.slice(0, startIdx) + replacement + oldSlice.content.slice(endIdx);

    if (debug) {
      // eslint-disable-next-line no-console
      console.log({
        phase: 'softbreak-patch',
        oldBlock: oldSlice.content.slice(0, 200),
        newSerialized: newSerialized.slice(0, 200),
        oldNorm: oldNorm.slice(0, 200),
        newNorm: newNorm.slice(0, 200),
        prefixLen,
        suffixLen,
        oldSpan: [oldMidStart, oldMidEnd],
        newSpan: [newMidStart, newMidEnd],
        preserveApplied: true,
      });
    }

    return patched;
  }

  private serializeWwBlocksById(mdBlockId: number) {
    const doc = this.wwEditor.getModel();
    const nodes: ProsemirrorNode[] = [];

    for (let i = 0; i < doc.childCount; i += 1) {
      const node = doc.child(i);
      const nodeId = node.attrs && node.attrs.mdBlockId;

      if (nodeId === mdBlockId) {
        nodes.push(node);
      }
    }

    if (!nodes.length) {
      return null;
    }

    const rangeDoc = this.wwEditor.getSchema().nodes.doc.create(null, nodes);

    return this.convertor.toMarkdownText(rangeDoc);
  }

  private getWwBlockCountById(mdBlockId: number) {
    const doc = this.wwEditor.getModel();
    let count = 0;

    for (let i = 0; i < doc.childCount; i += 1) {
      const node = doc.child(i);
      const nodeId = node.attrs && node.attrs.mdBlockId;

      if (nodeId === mdBlockId) {
        count += 1;
      }
    }

    return count;
  }

  private getBlockLenInfo(blocks: MdBlockSlice[], ids: number[]) {
    return ids.map((id) => (blocks[id] ? blocks[id].content.length : null));
  }

  private hashBlocks(blocks: MdBlockSlice[], start: number, end: number) {
    let hash = 0;

    for (let i = start; i <= end; i += 1) {
      const block = blocks[i];

      if (block) {
        hash = (hash * 31 + this.hashMd(block.content).charCodeAt(1)) | 0;
      }
    }
    return hash >>> 0;
  }

  private getOutsideBlocksHash(
    beforeBlocks: MdBlockSlice[],
    afterBlocks: MdBlockSlice[],
    ids: number[]
  ) {
    const idSet = new Set(ids);
    let beforeHash = 0;
    let afterHash = 0;

    for (let i = 0; i < beforeBlocks.length; i += 1) {
      if (!idSet.has(i)) {
        beforeHash = (beforeHash * 31 + this.hashMd(beforeBlocks[i].content).charCodeAt(1)) | 0;
      }
    }

    for (let i = 0; i < afterBlocks.length; i += 1) {
      if (!idSet.has(i)) {
        afterHash = (afterHash * 31 + this.hashMd(afterBlocks[i].content).charCodeAt(1)) | 0;
      }
    }

    return { before: beforeHash >>> 0, after: afterHash >>> 0 };
  }

  private applyMdPatches(md: string, patches: MdPatch[]) {
    const lines = md.split('\n');
    const ordered = patches.slice().sort((a, b) => a.range.startLine - b.range.startLine);
    let lineOffset = 0;

    ordered.forEach((patch) => {
      const startIndex = patch.range.startLine - 1 + lineOffset;
      const endIndex = patch.range.endLine - 1 + lineOffset;
      const replacementLines = this.splitLines(patch.text);

      lines.splice(startIndex, endIndex - startIndex + 1, ...replacementLines);
      lineOffset += replacementLines.length - (endIndex - startIndex + 1);
    });

    if (!lines.length) {
      return '';
    }

    return lines.join('\n');
  }

  private clampMdPos(md: string, pos: MdPos): MdPos {
    const lines = md.split('\n');
    const lineIndex = Math.min(Math.max(pos[0], 1), Math.max(lines.length, 1));
    const lineText = lines[lineIndex - 1] ?? '';
    const maxCh = Math.max(lineText.length + 1, 1);
    const ch = Math.min(Math.max(pos[1], 1), maxCh);

    return [lineIndex, ch];
  }

  private createSnapshotSelection(anchor: MdPos, head: MdPos): SnapshotSelection {
    return {
      anchor,
      head,
      collapsed: anchor[0] === head[0] && anchor[1] === head[1],
    };
  }

  private getClampedSelectionForMd(md: string, selection: [MdPos, MdPos]): SnapshotSelection {
    const anchor = this.clampMdPos(md, selection[0]);
    const head = this.clampMdPos(md, selection[1]);

    return this.createSnapshotSelection(anchor, head);
  }

  private getWysiwygSelectionForMd(md: string): SnapshotSelection {
    if (this.lastWysiwygMdSelection) {
      const anchor = this.clampMdPos(md, this.lastWysiwygMdSelection.anchor);
      const head = this.clampMdPos(md, this.lastWysiwygMdSelection.head);

      return this.createSnapshotSelection(anchor, head);
    }

    const [from, to] = this.wwEditor.getSelection();
    const selection = getEditorToMdPos(this.wwEditor.view.state.doc, from, to) as [MdPos, MdPos];

    return this.getClampedSelectionForMd(md, selection);
  }

  private mdPosToOffset(md: string, pos: MdPos) {
    const lines = md.split('\n');
    const lineIndex = Math.min(Math.max(pos[0] - 1, 0), Math.max(lines.length - 1, 0));
    let offset = 0;

    for (let i = 0; i < lineIndex; i += 1) {
      offset += (lines[i] ?? '').length + 1;
    }

    const lineText = lines[lineIndex] ?? '';
    const chIndex = Math.min(Math.max(pos[1] - 1, 0), lineText.length);

    return offset + chIndex;
  }

  private mdOffsetToPos(md: string, offset: number): MdPos {
    const lines = md.split('\n');
    let remaining = Math.min(Math.max(offset, 0), md.length);

    for (let i = 0; i < lines.length; i += 1) {
      const lineLength = (lines[i] ?? '').length;

      if (remaining <= lineLength) {
        return [i + 1, remaining + 1];
      }

      remaining -= lineLength;
      if (remaining > 0) {
        remaining -= 1;
      }
    }

    const lastLine = lines[lines.length - 1] ?? '';

    return [Math.max(lines.length, 1), lastLine.length + 1];
  }

  private transformOffsetByDiff(prevMd: string, nextMd: string, offset: number) {
    const minLength = Math.min(prevMd.length, nextMd.length);
    let start = 0;

    while (start < minLength && prevMd.charCodeAt(start) === nextMd.charCodeAt(start)) {
      start += 1;
    }

    let prevEnd = prevMd.length;
    let nextEnd = nextMd.length;

    while (
      prevEnd > start &&
      nextEnd > start &&
      prevMd.charCodeAt(prevEnd - 1) === nextMd.charCodeAt(nextEnd - 1)
    ) {
      prevEnd -= 1;
      nextEnd -= 1;
    }

    if (offset < start) {
      return offset;
    }

    if (offset > prevEnd) {
      return nextEnd + (offset - prevEnd);
    }

    if (prevEnd === start) {
      return nextEnd;
    }

    return nextEnd;
  }

  private transformSelectionByDiff(
    prevMd: string,
    nextMd: string,
    selection: SnapshotSelection
  ): SnapshotSelection {
    const anchorOffset = this.mdPosToOffset(prevMd, this.clampMdPos(prevMd, selection.anchor));
    const headOffset = this.mdPosToOffset(prevMd, this.clampMdPos(prevMd, selection.head));
    const nextAnchorOffset = this.transformOffsetByDiff(prevMd, nextMd, anchorOffset);
    const nextHeadOffset = this.transformOffsetByDiff(prevMd, nextMd, headOffset);
    const anchor = this.clampMdPos(nextMd, this.mdOffsetToPos(nextMd, nextAnchorOffset));
    const head = this.clampMdPos(nextMd, this.mdOffsetToPos(nextMd, nextHeadOffset));

    return this.createSnapshotSelection(anchor, head);
  }

  private getSelectionForSnapshot(md: string): SnapshotSelection {
    let anchor: MdPos;
    let head: MdPos;

    if (this.isMarkdownMode()) {
      const selection = this.mdEditor.getSelection() as [MdPos, MdPos];

      anchor = selection[0];
      head = selection[1];
    } else {
      const selection = this.getWysiwygSelectionForMd(md);

      anchor = selection.anchor;
      head = selection.head;
    }

    const clampedAnchor = this.clampMdPos(md, anchor);
    const clampedHead = this.clampMdPos(md, head);

    return {
      anchor: clampedAnchor,
      head: clampedHead,
      collapsed: clampedAnchor[0] === clampedHead[0] && clampedAnchor[1] === clampedHead[1],
    };
  }

  private createSnapshot(md: string): Snapshot {
    const selection = this.getSelectionForSnapshot(md);

    return {
      md,
      selection,
      scrollTop: this.getCurrentModeEditor().getScrollTop(),
      mode: this.mode,
      time: Date.now(),
    };
  }

  private pushSnapshot(md: string) {
    this.snapshotHistory.push(this.createSnapshot(md));
  }

  private restoreSelection(selection: SnapshotSelection, md: string) {
    const anchor = this.clampMdPos(md, selection.anchor);
    const head = this.clampMdPos(md, selection.head);

    if (this.isMarkdownMode()) {
      this.mdEditor.setSelection(anchor, head, false);
    } else {
      const [from, to] = getMdToEditorPos(this.wwEditor.view.state.doc, anchor, head);

      this.wwEditor.setSelection(from, to, false);
    }
  }

  private applyProgrammatic(md: string, selection: SnapshotSelection, scrollTop?: number) {
    this.clearPendingWwEdits();
    this.logCanonicalChange(md, 'snapshot-apply');
    this.logWwDirty(false, 'snapshot-apply');
    this.canonicalMd = md;
    this.wwDirty = false;
    this.preserveWindowScroll(() => {
      this.runProgrammatic(() => {
        this.setMarkdown(md, false, false, true);
      });
      this.setWwBaseline('snapshot-apply');
      this.setBaselineCanonicalMd('snapshot-apply');
      this.restoreSelection(selection, md);
      this.lastWysiwygMdSelection = this.createSnapshotSelection(
        this.clampMdPos(md, selection.anchor),
        this.clampMdPos(md, selection.head)
      );
      if (typeof scrollTop === 'number') {
        this.getCurrentModeEditor().setScrollTop(scrollTop);
      }
    });
  }

  private undoBySnapshot() {
    this.flushPendingWwSerialize();
    const snapshot = this.snapshotHistory.undo();

    if (snapshot) {
      this.snapshotHistory.applySnapshot(snapshot, (next) => {
        this.applyProgrammatic(next.md, next.selection, next.scrollTop);
      });
    }
  }

  private redoBySnapshot() {
    this.flushPendingWwSerialize();
    const snapshot = this.snapshotHistory.redo();

    if (snapshot) {
      this.snapshotHistory.applySnapshot(snapshot, (next) => {
        this.applyProgrammatic(next.md, next.selection, next.scrollTop);
      });
    }
  }

  /**
   * Get content to markdown
   * @returns {string} markdown text
   */
  getMarkdown() {
    if (this.isMarkdownMode()) {
      return this.canonicalMd;
    }

    this.flushPendingWwSerialize();

    return this.canonicalMd;
  }

  /**
   * Get content to html
   * @returns {string} html string
   */
  getHTML() {
    this.eventEmitter.holdEventInvoke(() => {
      if (this.isMarkdownMode()) {
        const sourceMarkdown = this.mdEditor.getMarkdown();
        const mdNode = this.createToastMark(
          this.toRenderableMarkdown(sourceMarkdown)
        ).getRootNode();
        const wwNode = this.convertor.toWysiwygModel(mdNode);

        this.wwEditor.setModel(wwNode!, false, false, true);
      }
    });
    const html = removeProseMirrorHackNodes(this.wwEditor.view.dom.innerHTML);

    if (this.placeholder) {
      const rePlaceholder = new RegExp(
        `<span class="placeholder[^>]+>${this.placeholder}</span>`,
        'i'
      );

      return html.replace(rePlaceholder, '');
    }

    return html;
  }

  /**
   * Insert text
   * @param {string} text - text content
   */
  insertText(text: string) {
    this.getCurrentModeEditor().replaceSelection(text);
  }

  /**
   * Set selection range
   * @param {number|Array.<number>} start - start position
   * @param {number|Array.<number>} end - end position
   */
  setSelection(start: EditorPos, end?: EditorPos) {
    this.getCurrentModeEditor().setSelection(start, end);
  }

  /**
   * Replace selection range with given text content
   * @param {string} text - text content
   * @param {number|Array.<number>} [start] - start position
   * @param {number|Array.<number>} [end] - end position
   */
  replaceSelection(text: string, start?: EditorPos, end?: EditorPos) {
    this.getCurrentModeEditor().replaceSelection(text, start, end);
  }

  /**
   * Delete the content of selection range
   * @param {number|Array.<number>} [start] - start position
   * @param {number|Array.<number>} [end] - end position
   */
  deleteSelection(start?: EditorPos, end?: EditorPos) {
    this.getCurrentModeEditor().deleteSelection(start, end);
  }

  /**
   * Get selected text content
   * @param {number|Array.<number>} [start] - start position
   * @param {number|Array.<number>} [end] - end position
   * @returns {string} - selected text content
   */
  getSelectedText(start?: EditorPos, end?: EditorPos) {
    return this.getCurrentModeEditor().getSelectedText(start, end);
  }

  /**
   * Get range of the node
   * @param {number|Array.<number>} [pos] - position
   * @returns {Array.<number[]>|Array.<number>} - node [start, end] range
   * @example
   * // Markdown mode
   * const rangeInfo = editor.getRangeInfoOfNode();
   *
   * console.log(rangeInfo); // { range: [[startLineOffset, startCurorOffset], [endLineOffset, endCurorOffset]], type: 'emph' }
   *
   * // WYSIWYG mode
   * const rangeInfo = editor.getRangeInfoOfNode();
   *
   * console.log(rangeInfo); // { range: [startCursorOffset, endCursorOffset], type: 'emph' }
   */
  getRangeInfoOfNode(pos?: EditorPos) {
    return this.getCurrentModeEditor().getRangeInfoOfNode(pos);
  }

  /**
   * Add widget to selection
   * @param {Node} node - widget node
   * @param {string} style - Adding style "top" or "bottom"
   * @param {number|Array.<number>} [pos] - position
   */
  addWidget(node: Node, style: WidgetStyle, pos?: EditorPos) {
    this.getCurrentModeEditor().addWidget(node, style, pos);
  }

  /**
   * Replace node with widget to range
   * @param {number|Array.<number>} start - start position
   * @param {number|Array.<number>} end - end position
   * @param {string} text - widget text content
   */
  replaceWithWidget(start: EditorPos, end: EditorPos, text: string) {
    this.getCurrentModeEditor().replaceWithWidget(start, end, text);
  }

  /**
   * Set editor height
   * @param {string} height - editor height in pixel
   */
  setHeight(height: string) {
    const { el } = this.options;

    if (typeof height === 'string') {
      if (height === 'auto') {
        el.classList.add('auto-height');
      } else {
        el.classList.remove('auto-height');
      }
      this.setMinHeight(this.getMinHeight());
    }

    css(el, { height });
    this.height = height;
  }

  /**
   * Get editor height
   * @returns {string} editor height in pixel
   */
  getHeight() {
    return this.height;
  }

  /**
   * Set minimum height to editor content
   * @param {string} minHeight - min content height in pixel
   */
  setMinHeight(minHeight: string) {
    if (minHeight !== this.minHeight) {
      const height = this.height || this.options.height;

      if (height !== 'auto' && this.options.el.querySelector(`.${cls('main')}`)) {
        // 75px equals default editor ui height - the editing area height
        minHeight = `${Math.min(parseInt(minHeight, 10), parseInt(height, 10) - 75)}px`;
      }

      const minHeightNum = parseInt(minHeight, 10);

      this.minHeight = minHeight;

      this.wwEditor.setMinHeight(minHeightNum);
      this.mdEditor.setMinHeight(minHeightNum);
      this.preview.setMinHeight(minHeightNum);
    }
  }

  /**
   * Get minimum height of editor content
   * @returns {string} min height in pixel
   */
  getMinHeight() {
    return this.minHeight;
  }

  /**
   * Return true if current editor mode is Markdown
   * @returns {boolean}
   */
  isMarkdownMode() {
    return this.mode === 'markdown';
  }

  /**
   * Return true if current editor mode is WYSIWYG
   * @returns {boolean}
   */
  isWysiwygMode() {
    return this.mode === 'wysiwyg';
  }

  /**
   * Return false
   * @returns {boolean}
   */
  isViewer() {
    return false;
  }

  /**
   * Get current Markdown editor's preview style
   * @returns {string}
   */
  getCurrentPreviewStyle() {
    return this.mdPreviewStyle;
  }

  /**
   * Get current theme
   * @returns {string}
   */
  getTheme() {
    return this.options.theme;
  }

  /**
   * Change editor theme
   * @param {string} theme - theme name
   */
  setTheme(theme: string) {
    if (this.options.theme === theme) {
      return;
    }

    this.options.theme = theme;
    this.eventEmitter.emit('changeTheme', theme);
  }

  /**
   * Change editor's mode to given mode string
   * @param {string} mode - Editor mode name of want to change
   * @param {boolean} [withoutFocus] - Change mode without focus
   */
  changeMode(mode: EditorType, withoutFocus?: boolean) {
    if (this.mode === mode) {
      return;
    }

    const prevMode = this.mode;
    let mappedMdSelection: [MdPos, MdPos] | null = null;
    let mappedWwSelection: [MdPos, MdPos] | null = null;
    let mappedWwTargetMdOffset: number | null = null;
    let mappedWwBlockInfo: MdRootBlockInfo | null = null;
    let nextWwEntrySelection: SnapshotSelection | null = null;
    let nextWwEntrySelectionPos: [number, number] | null = null;

    if (prevMode === 'wysiwyg' && mode === 'markdown') {
      if (!this.wwDirty && this.mdSelectionAtWwEntry) {
        mappedMdSelection = [this.mdSelectionAtWwEntry.anchor, this.mdSelectionAtWwEntry.head];
      } else {
        const exactSelection = this.getExactMdSelectionFromWysiwyg();

        if (exactSelection) {
          mappedMdSelection = [exactSelection.anchor, exactSelection.head];
        } else {
          const selection = this.getWysiwygSelectionForMd(this.canonicalMd);

          mappedMdSelection = [selection.anchor, selection.head];
        }
      }
    } else if (prevMode === 'markdown' && mode === 'wysiwyg') {
      const sourceMd = this.mdEditor.getMarkdown();
      const [anchor, head] = this.mdEditor.getSelection() as [MdPos, MdPos];
      const clampedAnchor = this.clampMdPos(sourceMd, anchor);
      const clampedHead = this.clampMdPos(sourceMd, head);

      mappedWwSelection = [clampedAnchor, clampedHead];
      this.lastWysiwygMdSelection = this.createSnapshotSelection(
        mappedWwSelection[0],
        mappedWwSelection[1]
      );
      nextWwEntrySelection = this.createSnapshotSelection(clampedAnchor, clampedHead);
      mappedWwBlockInfo = this.getMdRootBlockInfoAtPos(sourceMd, clampedAnchor);
      if (clampedAnchor[0] === clampedHead[0] && clampedAnchor[1] === clampedHead[1]) {
        mappedWwTargetMdOffset = this.mdPosToOffset(sourceMd, clampedAnchor);
      }
    }

    this.mode = mode;

    if (this.isWysiwygMode()) {
      this.logSnapshotState('before-md-to-ww');
      const sourceMarkdown = this.mdEditor.getMarkdown();
      const mdNode = this.createToastMark(this.toRenderableMarkdown(sourceMarkdown)).getRootNode();
      const wwNode = this.convertor.toWysiwygModel(mdNode);

      this.logWwDirty(false, 'mode-switch-md-to-ww');
      this.wwDirty = false;
      this.clearPendingWwEdits();
      this.runProgrammatic(() => {
        this.wwEditor.setModel(wwNode!, false, false, true);
      });
      this.setWwBaseline('mode-switch-md-to-ww');
      this.setBaselineCanonicalMd('mode-switch-md-to-ww');
    } else {
      this.logSnapshotState('before-ww-to-md');
      if (this.wwDirty) {
        this.logSnapshotState('wwDirty-true-path');
        this.flushPendingWwSerialize();
        this.clearPendingWwEdits();
      } else {
        this.logSnapshotState('wwDirty-false-path');
      }
      this.runProgrammatic(() => {
        this.mdEditor.setMarkdown(this.canonicalMd, false, false, true);
      });
      this.logSnapshotState('after-md-set');

      const editorMd = this.mdEditor.getMarkdown();

      if (editorMd !== this.canonicalMd) {
        // eslint-disable-next-line no-console
        console.log({
          phase: 'after-md-set-mismatch',
          canonicalHash: this.hashMd(this.canonicalMd),
          editorHash: this.hashMd(editorMd),
          canonicalTail120: this.tailText(this.canonicalMd, 120),
          editorTail120: this.tailText(editorMd, 120),
        });
      }
    }

    this.eventEmitter.emit('removePopupWidget');
    this.eventEmitter.emit('changeMode', mode);

    if (!withoutFocus) {
      const pos = this.convertor.getMappedPos();

      if (this.isWysiwygMode() && mappedWwSelection) {
        const [from, to] = getMdToEditorPos(
          this.wwEditor.view.state.doc,
          mappedWwSelection[0],
          mappedWwSelection[1]
        );
        const shouldRefine = mappedWwTargetMdOffset !== null && from === to;
        let refinedFrom = from;

        if (shouldRefine) {
          const targetOffset = mappedWwTargetMdOffset as number;
          const blockInfo = mappedWwBlockInfo;
          const initialOffset = this.getMdOffsetForWysiwygPos(from);

          if (typeof initialOffset === 'number' && Math.abs(initialOffset - targetOffset) <= 1) {
            refinedFrom = from;
          } else if (blockInfo) {
            const blockRange = this.getNearestWwBlockRangeByMdBlockId(blockInfo.blockId, from);

            if (blockRange) {
              const blockStartOffsetInSerialized = this.getMdOffsetForWysiwygPos(blockRange.start);

              if (typeof blockStartOffsetInSerialized === 'number') {
                const drift = blockStartOffsetInSerialized - blockInfo.startOffset;
                const adjustedTargetOffset = targetOffset + drift;

                refinedFrom = this.refineWysiwygCursorPosByMdOffset(
                  adjustedTargetOffset,
                  from,
                  blockRange.start,
                  blockRange.end
                );
              } else {
                refinedFrom = this.refineWysiwygCursorPosByMdOffset(targetOffset, from);
              }
            } else {
              refinedFrom = this.refineWysiwygCursorPosByMdOffset(targetOffset, from);
            }
          } else {
            refinedFrom = this.refineWysiwygCursorPosByMdOffset(targetOffset, from);
          }
        }
        const refinedTo = shouldRefine ? refinedFrom : to;

        this.wwEditor.setSelection(refinedFrom, refinedTo, false);
        if (nextWwEntrySelection) {
          nextWwEntrySelectionPos = [refinedFrom, refinedTo];
        }
      } else if (this.isWysiwygMode() && typeof pos === 'number') {
        this.wwEditor.setSelection(pos, pos, false);
      } else if (!this.isWysiwygMode() && mappedMdSelection) {
        const anchor = this.clampMdPos(this.canonicalMd, mappedMdSelection[0]);
        const head = this.clampMdPos(this.canonicalMd, mappedMdSelection[1]);

        this.mdEditor.setSelection(anchor, head, false);
      } else if (!this.isWysiwygMode() && Array.isArray(pos)) {
        this.mdEditor.setSelection(pos, pos, false);
      }

      if (this.isWysiwygMode()) {
        this.wwEditor.view.focus();
      } else {
        this.mdEditor.view.focus();
      }

      this.ensureSelectionVisibleInCurrentMode();
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => this.ensureSelectionVisibleInCurrentMode());
      }
    }

    if (this.isWysiwygMode()) {
      this.mdSelectionAtWwEntry = nextWwEntrySelection;
      this.wwSelectionAtWwEntry = nextWwEntrySelectionPos;
    } else {
      this.mdSelectionAtWwEntry = null;
      this.wwSelectionAtWwEntry = null;
    }
  }

  /**
   * Destroy TUIEditor from document
   */
  destroy() {
    this.stopAllInlineRecorders();
    this.unbindInlineRecorderEvents();
    this.wwEditor.destroy();
    this.mdEditor.destroy();
    this.preview.destroy();
    this.scrollSync.destroy();
    this.eventEmitter.emit('destroy');
    this.eventEmitter.getEvents().forEach((_, type: string) => this.off(type));
  }

  /**
   * Hide TUIEditor
   */
  hide() {
    this.eventEmitter.emit('hide');
  }

  /**
   * Show TUIEditor
   */
  show() {
    this.eventEmitter.emit('show');
  }

  /**
   * Move on scroll position of the editor container
   * @param {number} value scrollTop value of editor container
   */
  setScrollTop(value: number) {
    this.getCurrentModeEditor().setScrollTop(value);
  }

  /**
   * Get scroll position value of editor container
   * @returns {number} scrollTop value of editor container
   */
  getScrollTop() {
    return this.getCurrentModeEditor().getScrollTop();
  }

  /**
   * Reset TUIEditor
   */
  reset() {
    this.runProgrammatic(() => {
      this.wwEditor.setModel([], false, false, true);
      this.mdEditor.setMarkdown('', false, false, true);
    });
    this.clearPendingWwEdits();
    this.logCanonicalChange('', 'reset');
    this.logWwDirty(false, 'reset');
    this.canonicalMd = '';
    this.wwDirty = false;
    this.wwBaselineDoc = null;
    this.baselineCanonicalMd = null;
    this.lastWysiwygMdSelection = null;
    this.mdSelectionAtWwEntry = null;
    this.wwSelectionAtWwEntry = null;
  }

  /**
   * Get current selection range
   * @returns {Array.<number[]>|Array.<number>} Returns the range of the selection depending on the editor mode
   * @example
   * // Markdown mode
   * const mdSelection = editor.getSelection();
   *
   * console.log(mdSelection); // [[startLineOffset, startCurorOffset], [endLineOffset, endCurorOffset]]
   *
   * // WYSIWYG mode
   * const wwSelection = editor.getSelection();
   *
   * console.log(wwSelection); // [startCursorOffset, endCursorOffset]
   */
  getSelection() {
    return this.getCurrentModeEditor().getSelection();
  }

  getSnapshotDebugInfo() {
    return {
      mode: this.mode,
      canonicalMd: this.canonicalMd,
      wwDirty: this.wwDirty,
      snapshotSize: this.snapshotHistory.size(),
      selection: this.getSelectionForSnapshot(this.canonicalMd),
    };
  }

  /**
   * Set the placeholder on all editors
   * @param {string} placeholder - placeholder to set
   */
  setPlaceholder(placeholder: string) {
    this.placeholder = placeholder;
    this.mdEditor.setPlaceholder(placeholder);
    this.wwEditor.setPlaceholder(placeholder);
  }

  /**
   * Get markdown editor, preview, wysiwyg editor DOM elements
   */
  getEditorElements() {
    return {
      mdEditor: this.mdEditor.getElement(),
      mdPreview: this.preview.getElement(),
      wwEditor: this.wwEditor.getElement(),
    };
  }

  /**
   * Convert position to match editor mode
   * @param {number|Array.<number>} start - start position
   * @param {number|Array.<number>} end - end position
   * @param {string} mode - Editor mode name of want to match converted position to
   */
  convertPosToMatchEditorMode(start: EditorPos, end = start, mode = this.mode) {
    const { doc } = this.mdEditor.view.state;
    const isFromArray = Array.isArray(start);
    const isToArray = Array.isArray(end);

    let convertedFrom = start;
    let convertedTo = end;

    if (isFromArray !== isToArray) {
      throw new Error('Types of arguments must be same');
    }

    if (mode === 'markdown' && !isFromArray && !isToArray) {
      [convertedFrom, convertedTo] = getEditorToMdPos(doc, start as number, end as number);
    } else if (mode === 'wysiwyg' && isFromArray && isToArray) {
      [convertedFrom, convertedTo] = getMdToEditorPos(doc, start as Pos, end as Pos);
    }

    return [convertedFrom, convertedTo];
  }
}

// // (Not an official API)
// // Create a function converting markdown to HTML using the internal parser and renderer.
// ToastUIEditor._createMarkdownToHTML = createMarkdownToHTML;

export default ToastUIEditorCore;
