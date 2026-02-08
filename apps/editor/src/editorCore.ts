import { DOMParser, Node as ProsemirrorNode } from 'prosemirror-model';
import forEachOwnProperties from 'tui-code-snippet/collection/forEachOwnProperties';
import extend from 'tui-code-snippet/object/extend';
import css from 'tui-code-snippet/domUtil/css';
import addClass from 'tui-code-snippet/domUtil/addClass';
import removeClass from 'tui-code-snippet/domUtil/removeClass';
import isString from 'tui-code-snippet/type/isString';
import isNumber from 'tui-code-snippet/type/isNumber';

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
import { MdNode, ToastMark } from '@toast-ui/toastmark';

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
import { cls, removeProseMirrorHackNodes, replaceBRWithEmptyBlock } from './utils/dom';
import { sanitizeHTML } from './sanitizer/htmlSanitizer';
import { createHTMLSchemaMap } from './wysiwyg/nodes/html';
import { getHTMLRenderConvertors } from './markdown/htmlRenderConvertors';
import { buildQuery } from './queries/queryManager';
import { getEditorToMdPos, getMdToEditorPos } from './markdown/helper/pos';
import { getMdEndLine, getMdStartLine } from './utils/markdown';
import SnapshotHistory, { Snapshot, SnapshotSelection } from './history/snapshotHistory';

interface LineRange {
  startLine: number;
  endLine: number;
}

interface BlockRange {
  startIndex: number;
  endIndex: number;
}

interface WwEditRange {
  oldRange: BlockRange;
  newRange: BlockRange;
}

interface WwBlockRange {
  oldRange: BlockRange;
  newRange: BlockRange;
}

interface MdPatch {
  range: LineRange;
  text: string;
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
 *         @param {addImageBlobHook} [options.hooks.addImageBlobHook] - hook for image upload
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

  private pendingWwRanges: WwBlockRange[] = [];

  private readonly toastMarkOptions: Record<string, unknown>;

  private wwBaselineDoc: ProsemirrorNode | null = null;

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
    console.log({ phase: 'wwDirty', next, reason, mode: this.mode });
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

  eventEmitter: Emitter;

  protected options: Required<EditorOptions>;

  protected pluginInfo: PluginInfoResult;

  constructor(options: EditorOptions) {
    this.initialHTML = options.el.innerHTML;
    options.el.innerHTML = '';

    this.options = extend(
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
          ['ul', 'ol', 'task', 'indent', 'outdent'],
          ['table', 'image', 'link'],
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
    const wwToDOMAdaptor = new WwToDOMAdaptor(linkAttributes, rendererOptions.customHTMLRenderer);
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
      getHTMLRenderConvertors(linkAttributes, rendererOptions.customHTMLRenderer),
      this.eventEmitter
    );

    this.setMinHeight(this.options.minHeight);

    this.setHeight(this.options.height);

    this.eventEmitter.listen('wwUserEdit', (range?: WwEditRange) => {
      this.logWwDirty(true, 'wwUserEdit');
      this.wwDirty = true;
      if (range) {
        this.addWwEditRange(range);
      }
      this.scheduleWwSerialize();
    });
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
    });

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
      forEachOwnProperties(this.options.hooks, (fn, key) => this.addHook(key, fn));
    }

    if (this.options.events) {
      forEachOwnProperties(this.options.events, (fn, key) => this.on(key, fn));
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
      const mdNode = this.toastMark.getRootNode();
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
    }

    this.wwSerializeTimer = window.setTimeout(() => {
      this.wwSerializeTimer = null;
      this.flushSerializeAndMaybePush();
    }, this.wwSerializeDelay);
  }

  private flushSerialize() {
    if (!this.pendingWwRanges.length) {
      return this.canonicalMd;
    }

    const baseline = this.wwBaselineDoc;
    const wwDoc = this.wwEditor.getModel();

    if (baseline && wwDoc.eq(baseline)) {
      if (this.isSnapshotDebug()) {
        // eslint-disable-next-line no-console
        console.log({
          phase: 'ww-baseline-noop',
          hasBaseline: true,
          sameAsBaseline: true,
          wwDirtyBefore: this.wwDirty,
        });
      }
      this.clearPendingWwEdits();
      this.logWwDirty(false, 'ww-baseline-noop');
      this.wwDirty = false;
      return this.canonicalMd;
    }
    if (this.isSnapshotDebug()) {
      // eslint-disable-next-line no-console
      console.log({
        phase: 'ww-baseline-check',
        hasBaseline: Boolean(baseline),
        sameAsBaseline: baseline ? wwDoc.eq(baseline) : false,
      });
    }

    const toastMark = this.createToastMark(this.canonicalMd);
    let shouldSerializeAll = false;
    const patches = this.pendingWwRanges
      .slice()
      .sort((a, b) => a.oldRange.startIndex - b.oldRange.startIndex)
      .map((range) => {
        const patchRange = this.getBlockLineRangeForIndexRange(range.oldRange, toastMark);
        const text = this.serializeWwBlockRange(range.newRange);

        if (!patchRange || text === null) {
          shouldSerializeAll = true;
        }

        return patchRange ? { range: patchRange, text: text || '' } : null;
      })
      .filter((patch): patch is MdPatch => Boolean(patch));

    if (shouldSerializeAll) {
      const wwNode = this.wwEditor.getModel();

      this.pendingWwRanges = [];

      return this.convertor.toMarkdownText(wwNode);
    }

    const nextMd = this.applyMdPatches(this.canonicalMd, patches);

    this.pendingWwRanges = [];

    return nextMd;
  }

  private flushSerializeAndMaybePush() {
    const nextMd = this.flushSerialize();

    if (nextMd !== this.canonicalMd) {
      this.logCanonicalChange(nextMd, 'ww-flush-serialize');
      this.canonicalMd = nextMd;
      this.pushSnapshot(nextMd);
    }
    this.logWwDirty(false, 'ww-flush-serialize');
    this.wwDirty = false;
    this.setWwBaseline('ww-flush-serialize');

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
    this.pendingWwRanges = [];
  }

  private createToastMark(markdown: string) {
    return new ToastMark(markdown, this.toastMarkOptions);
  }

  private normalizeBlockRange(range: BlockRange): BlockRange {
    return {
      startIndex: Math.min(range.startIndex, range.endIndex),
      endIndex: Math.max(range.startIndex, range.endIndex),
    };
  }

  private rangesOverlapOrTouch(a: BlockRange, b: BlockRange) {
    return a.startIndex <= b.endIndex + 1 && b.startIndex <= a.endIndex + 1;
  }

  private mergeLineRange(a: BlockRange, b: BlockRange): BlockRange {
    return {
      startIndex: Math.min(a.startIndex, b.startIndex),
      endIndex: Math.max(a.endIndex, b.endIndex),
    };
  }

  private addWwEditRange(range: WwEditRange) {
    let next: WwBlockRange = {
      oldRange: this.normalizeBlockRange(range.oldRange),
      newRange: this.normalizeBlockRange(range.newRange),
    };

    const merged: WwBlockRange[] = [];

    this.pendingWwRanges.forEach((existing) => {
      if (
        this.rangesOverlapOrTouch(existing.oldRange, next.oldRange) ||
        this.rangesOverlapOrTouch(existing.newRange, next.newRange)
      ) {
        next = {
          oldRange: this.mergeLineRange(existing.oldRange, next.oldRange),
          newRange: this.mergeLineRange(existing.newRange, next.newRange),
        };
      } else {
        merged.push(existing);
      }
    });
    merged.push(next);

    this.pendingWwRanges = merged;
  }

  private getMdBlockByIndex(root: MdNode, index: number) {
    let node = root.firstChild as MdNode | null;
    let cursor = 0;

    while (node && cursor < index) {
      node = node.next as MdNode | null;
      cursor += 1;
    }

    return node || null;
  }

  private getBlockLineRangeForIndexRange(
    range: BlockRange,
    toastMark: ToastMark
  ): LineRange | null {
    const root = toastMark.getRootNode();
    const startNode = this.getMdBlockByIndex(root, range.startIndex);
    const endNode = this.getMdBlockByIndex(root, range.endIndex);

    if (!startNode || !endNode) {
      return null;
    }

    const resolvedStartLine = getMdStartLine(startNode);
    const resolvedEndLine = getMdEndLine(endNode);

    return {
      startLine: resolvedStartLine,
      endLine: Math.max(resolvedEndLine, resolvedStartLine),
    };
  }

  private serializeWwBlockRange(range: BlockRange) {
    const doc = this.wwEditor.getModel();

    if (doc.childCount === 0) {
      return '';
    }

    const { startIndex, endIndex } = range;

    if (startIndex < 0 || endIndex >= doc.childCount) {
      return null;
    }

    const lastIndex = Math.max(endIndex, startIndex);
    const nodes = [];

    for (let i = startIndex; i <= lastIndex; i += 1) {
      nodes.push(doc.child(i));
    }

    if (!nodes.length) {
      return '';
    }

    const rangeDoc = this.wwEditor.getSchema().nodes.doc.create(null, nodes);

    return this.convertor.toMarkdownText(rangeDoc);
  }

  private splitLines(text: string) {
    if (text === '') {
      return [];
    }

    return text.split('\n');
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

  private getSelectionForSnapshot(md: string): SnapshotSelection {
    let anchor: MdPos;
    let head: MdPos;

    if (this.isMarkdownMode()) {
      const selection = this.mdEditor.getSelection() as [MdPos, MdPos];

      anchor = selection[0];
      head = selection[1];
    } else {
      const [from, to] = this.wwEditor.getSelection();
      const selection = getEditorToMdPos(this.wwEditor.view.state.doc, from, to) as [MdPos, MdPos];

      anchor = selection[0];
      head = selection[1];
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
      this.mdEditor.setSelection(anchor, head);
    } else {
      const [from, to] = getMdToEditorPos(this.wwEditor.view.state.doc, anchor, head);

      this.wwEditor.setSelection(from, to);
    }
  }

  private applyProgrammatic(md: string, selection: SnapshotSelection, scrollTop?: number) {
    this.clearPendingWwEdits();
    this.logCanonicalChange(md, 'snapshot-apply');
    this.logWwDirty(false, 'snapshot-apply');
    this.canonicalMd = md;
    this.wwDirty = false;
    this.runProgrammatic(() => {
      this.setMarkdown(md, false, false, true);
    });
    this.setWwBaseline('snapshot-apply');
    this.restoreSelection(selection, md);
    if (isNumber(scrollTop)) {
      this.getCurrentModeEditor().setScrollTop(scrollTop);
    }
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
        const mdNode = this.toastMark.getRootNode();
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

    if (isString(height)) {
      if (height === 'auto') {
        addClass(el, 'auto-height');
      } else {
        removeClass(el, 'auto-height');
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

    this.mode = mode;

    if (this.isWysiwygMode()) {
      this.logSnapshotState('before-md-to-ww');
      const mdNode = this.toastMark.getRootNode();
      const wwNode = this.convertor.toWysiwygModel(mdNode);

      this.logWwDirty(false, 'mode-switch-md-to-ww');
      this.wwDirty = false;
      this.clearPendingWwEdits();
      this.runProgrammatic(() => {
        this.wwEditor.setModel(wwNode!, false, false, true);
      });
      this.setWwBaseline('mode-switch-md-to-ww');
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
        this.mdEditor.setMarkdown(this.canonicalMd, !withoutFocus, false, true);
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

      this.focus();

      if (this.isWysiwygMode() && isNumber(pos)) {
        this.wwEditor.setSelection(pos);
      } else if (Array.isArray(pos)) {
        this.mdEditor.setSelection(pos);
      }
    }
  }

  /**
   * Destroy TUIEditor from document
   */
  destroy() {
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
