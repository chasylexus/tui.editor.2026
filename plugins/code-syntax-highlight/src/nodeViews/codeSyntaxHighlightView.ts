import type { EditorView, NodeView } from 'prosemirror-view';
import type { Node as ProsemirrorNode } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';

import isFunction from 'tui-code-snippet/type/isFunction';
import addClass from 'tui-code-snippet/domUtil/addClass';

import { cls } from '@/utils/dom';
import { LanguageSelectBox } from '@/nodeViews/languageSelectBox';
import type { Emitter } from '@toast-ui/editor';

type GetPos = (() => number) | boolean;

type CodeBlockPos = { top: number; right: number };

const WRAPPER_CLASS_NAME = 'ww-code-block-highlighting';
const GUTTER_CLASS_NAME = 'toastui-editor-ww-code-block-gutter';
const TOOLBAR_CLASS = 'toastui-editor-code-block-toolbar';
const LANG_LABEL_CLASS = 'toastui-editor-code-block-lang-label';
const LINE_NUM_BADGE_CLASS = 'toastui-editor-line-number-badge';
const LINE_NUM_INPUT_CLASS = 'toastui-editor-line-number-input';
const COPY_BTN_CLASS = 'toastui-editor-code-block-copy';

function getCustomAttrs(attrs: Record<string, any>) {
  const { htmlAttrs, classNames } = attrs;

  return { ...htmlAttrs, class: classNames ? classNames.join(' ') : null };
}

class CodeSyntaxHighlightView implements NodeView {
  dom!: HTMLElement;

  contentDOM: HTMLElement | null = null;

  private languageSelectBox: LanguageSelectBox | null = null;

  private languageEditing = false;

  private gutter: HTMLElement | null = null;

  private toolbar: HTMLElement | null = null;

  private languageBadge: HTMLElement | null = null;

  private lineNumberBadge: HTMLElement | null = null;

  private lineNumberInput: HTMLInputElement | null = null;

  private copyBtn: HTMLButtonElement | null = null;

  // eslint-disable-next-line max-params
  constructor(
    private node: ProsemirrorNode,
    private view: EditorView,
    private getPos: GetPos,
    private eventEmitter: Emitter,
    private languages: string[]
  ) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    this.eventEmitter = eventEmitter;
    this.languages = languages;

    this.createElement();
    this.bindDOMEvent();
    this.bindEvent();
  }

  private createElement() {
    const { language, lineNumber } = this.node.attrs;
    const wrapper = document.createElement('div');

    wrapper.setAttribute('data-language', language || 'text');
    addClass(wrapper, cls(WRAPPER_CLASS_NAME));
    addClass(wrapper, 'has-toolbar');

    if (lineNumber !== null) {
      addClass(wrapper, 'has-line-numbers');
    }

    const pre = this.createCodeBlockElement();
    const code = pre.firstChild as HTMLElement;

    if (language) {
      addClass(pre, `language-${language}`);
      addClass(code, `language-${language}`);
    }

    if (lineNumber !== null) {
      this.gutter = this.createGutter();
      wrapper.appendChild(this.gutter);
    }

    wrapper.appendChild(pre);

    this.toolbar = document.createElement('div');
    this.toolbar.className = TOOLBAR_CLASS;
    this.toolbar.contentEditable = 'false';

    this.copyBtn = this.createCopyButton();
    this.toolbar.appendChild(this.copyBtn);

    this.lineNumberBadge = this.createLineNumberBadge();
    this.toolbar.appendChild(this.lineNumberBadge);

    this.languageBadge = document.createElement('div');
    this.languageBadge.className = LANG_LABEL_CLASS;
    this.languageBadge.textContent = language || 'text';
    this.toolbar.appendChild(this.languageBadge);

    wrapper.appendChild(this.toolbar);

    this.dom = wrapper;
    this.contentDOM = code;
  }

  private createCodeBlockElement() {
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    const { language } = this.node.attrs;
    const attrs = getCustomAttrs(this.node.attrs);

    if (language) {
      code.setAttribute('data-language', language);
    }

    Object.keys(attrs).forEach((attrName) => {
      if (attrs[attrName]) {
        pre.setAttribute(attrName, attrs[attrName]);
      }
    });

    pre.appendChild(code);

    return pre;
  }

  private createGutter(): HTMLElement {
    const el = document.createElement('div');

    el.className = GUTTER_CLASS_NAME;
    el.contentEditable = 'false';
    this.fillGutter(el);

    return el;
  }

  private fillGutter(el: HTMLElement) {
    const { lineNumber } = this.node.attrs;

    if (lineNumber === null) {
      return;
    }

    const text = this.node.textContent;
    const lineCount = text.split('\n').length;
    const lines: string[] = [];

    for (let i = 0; i < lineCount; i += 1) {
      lines.push(String(lineNumber + i));
    }

    el.textContent = lines.join('\n');
  }

  private updateGutter() {
    const { lineNumber } = this.node.attrs;

    if (lineNumber === null) {
      if (this.gutter && this.gutter.parentElement) {
        this.gutter.parentElement.removeChild(this.gutter);
        this.gutter = null;
        this.dom.classList.remove('has-line-numbers');
      }

      return;
    }

    if (!this.gutter) {
      this.gutter = this.createGutter();
      this.dom.insertBefore(this.gutter, this.dom.firstChild);
      this.dom.classList.add('has-line-numbers');
    } else {
      this.fillGutter(this.gutter);
    }
  }

  private createLineNumberBadge(): HTMLElement {
    const badge = document.createElement('div');

    badge.className = LINE_NUM_BADGE_CLASS;

    const label = document.createElement('span');

    label.textContent = '#';
    badge.appendChild(label);

    const input = document.createElement('input');
    const { lineNumber } = this.node.attrs;

    input.type = 'text';
    input.className = LINE_NUM_INPUT_CLASS;
    input.value = lineNumber !== null ? String(lineNumber) : 'off';
    input.placeholder = 'off';
    badge.appendChild(input);

    this.lineNumberInput = input;

    return badge;
  }

  private createCopyButton(): HTMLButtonElement {
    const btn = document.createElement('button');

    btn.className = COPY_BTN_CLASS;
    btn.type = 'button';
    btn.title = 'Copy code';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');

    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');

    p.setAttribute('fill', 'currentColor');
    p.setAttribute(
      'd',
      'M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z'
    );
    svg.appendChild(p);
    btn.appendChild(svg);

    return btn;
  }

  private onCopyClick = () => {
    const text = this.node.textContent;

    navigator.clipboard.writeText(text).then(() => {
      if (this.copyBtn) {
        this.copyBtn.classList.add('copied');
        setTimeout(() => {
          if (this.copyBtn) {
            this.copyBtn.classList.remove('copied');
          }
        }, 1500);
      }
    });
  };

  private commitLineNumber = () => {
    if (!this.lineNumberInput || !isFunction(this.getPos)) {
      return;
    }

    const raw = this.lineNumberInput.value.trim();
    const parsed = parseInt(raw, 10);
    const newLineNumber = Number.isNaN(parsed) || parsed < 0 ? null : parsed;
    const current = this.node.attrs.lineNumber;

    if (newLineNumber === current) {
      this.lineNumberInput.value = current !== null ? String(current) : 'off';

      return;
    }

    const pos = this.getPos();
    const { tr } = this.view.state;

    tr.setNodeMarkup(pos, null, { ...this.node.attrs, lineNumber: newLineNumber });
    this.view.dispatch(tr);
  };

  private onLineNumberKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.commitLineNumber();
    } else if (e.key === 'Escape' && this.lineNumberInput) {
      const { lineNumber } = this.node.attrs;

      this.lineNumberInput.value = lineNumber !== null ? String(lineNumber) : 'off';
      this.lineNumberInput.blur();
    }
  };

  private onToolbarMouseDown = (ev: MouseEvent) => {
    const tag = (ev.target as HTMLElement).tagName;

    if (tag !== 'INPUT' && tag !== 'BUTTON') {
      ev.preventDefault();
    }

    ev.stopPropagation();
  };

  private onClickLanguageBadge = (ev: MouseEvent) => {
    ev.stopPropagation();

    if (isFunction(this.getPos)) {
      const pos = this.view.coordsAtPos(this.getPos());

      this.openLanguageSelectBox(pos);
    }
  };

  private onCodeBlockKeyDown = (ev: KeyboardEvent) => {
    const isSelectAllShortcut =
      (ev.metaKey || ev.ctrlKey) && !ev.shiftKey && !ev.altKey && ev.key.toLowerCase() === 'a';

    if (!isSelectAllShortcut || !isFunction(this.getPos)) {
      return;
    }

    if (this.toolbar && ev.target instanceof Node && this.toolbar.contains(ev.target)) {
      return;
    }

    const pos = this.getPos();
    const { state } = this.view;
    const from = pos + 1;
    const to = pos + this.node.nodeSize - 1;
    const maxPos = state.doc.content.size;
    const safeFrom = Math.max(1, Math.min(from, maxPos));
    const safeTo = Math.max(safeFrom, Math.min(to, maxPos));

    this.view.focus();
    this.view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, safeFrom, safeTo)));
    ev.preventDefault();
  };

  private bindDOMEvent() {
    if (this.toolbar) {
      this.toolbar.addEventListener('mousedown', this.onToolbarMouseDown);
    }

    if (this.languageBadge) {
      this.languageBadge.addEventListener('click', this.onClickLanguageBadge);
    }

    if (this.copyBtn) {
      this.copyBtn.addEventListener('click', this.onCopyClick);
    }

    if (this.lineNumberInput) {
      this.lineNumberInput.addEventListener('blur', this.commitLineNumber);
      this.lineNumberInput.addEventListener('keydown', this.onLineNumberKeyDown);
    }

    this.dom.addEventListener('keydown', this.onCodeBlockKeyDown);
    this.view.dom.addEventListener('mousedown', this.finishLanguageEditing);
    window.addEventListener('resize', this.finishLanguageEditing);
  }

  private bindEvent() {
    this.eventEmitter.listen('selectLanguage', this.onSelectLanguage);
    this.eventEmitter.listen('scroll', this.finishLanguageEditing);
    this.eventEmitter.listen('finishLanguageEditing', this.finishLanguageEditing);
  }

  private onSelectLanguage = (language: string) => {
    if (this.languageEditing) {
      this.changeLanguage(language);
    }
  };

  private openLanguageSelectBox(pos: CodeBlockPos) {
    this.languageSelectBox = new LanguageSelectBox(
      this.view.dom.parentElement!,
      this.eventEmitter,
      this.languages
    );
    this.eventEmitter.emit('showCodeBlockLanguages', pos, this.node.attrs.language);
    this.languageEditing = true;
  }

  private changeLanguage(language: string) {
    if (isFunction(this.getPos)) {
      this.reset();

      const pos = this.getPos();
      const { tr } = this.view.state;

      tr.setNodeMarkup(pos, null, { ...this.node.attrs, language });
      this.view.dispatch(tr);
    }
  }

  private finishLanguageEditing = () => {
    if (this.languageEditing) {
      this.reset();
    }
  };

  private reset() {
    if (this.languageSelectBox) {
      this.languageSelectBox.destroy();
      this.languageSelectBox = null;
    }

    this.languageEditing = false;
  }

  stopEvent() {
    return true;
  }

  update(node: ProsemirrorNode) {
    if (!node.sameMarkup(this.node)) {
      return false;
    }

    this.node = node;
    this.updateGutter();

    return true;
  }

  destroy() {
    this.reset();

    if (this.toolbar) {
      this.toolbar.removeEventListener('mousedown', this.onToolbarMouseDown);
    }

    if (this.languageBadge) {
      this.languageBadge.removeEventListener('click', this.onClickLanguageBadge);
    }

    if (this.copyBtn) {
      this.copyBtn.removeEventListener('click', this.onCopyClick);
    }

    if (this.lineNumberInput) {
      this.lineNumberInput.removeEventListener('blur', this.commitLineNumber);
      this.lineNumberInput.removeEventListener('keydown', this.onLineNumberKeyDown);
    }

    this.dom.removeEventListener('keydown', this.onCodeBlockKeyDown);
    this.view.dom.removeEventListener('mousedown', this.finishLanguageEditing);
    window.removeEventListener('resize', this.finishLanguageEditing);

    this.eventEmitter.removeEventHandler('selectLanguage', this.onSelectLanguage);
    this.eventEmitter.removeEventHandler('scroll', this.finishLanguageEditing);
    this.eventEmitter.removeEventHandler('finishLanguageEditing', this.finishLanguageEditing);
  }
}

export function createCodeSyntaxHighlightView(languages: string[]) {
  return (node: ProsemirrorNode, view: EditorView, getPos: GetPos, emitter: Emitter) =>
    new CodeSyntaxHighlightView(node, view, getPos, emitter, languages);
}
