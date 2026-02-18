import { EditorView, NodeView } from 'prosemirror-view';
import { ProsemirrorNode } from 'prosemirror-model';

import isFunction from 'tui-code-snippet/type/isFunction';
import css from 'tui-code-snippet/domUtil/css';

import { removeNode, setAttributes } from '@/utils/dom';
import { getCustomAttrs } from '@/wysiwyg/helper/node';

import { Emitter } from '@t/event';

type GetPos = (() => number) | boolean;

type InputPos = {
  top: number;
  right: number;
};

const WRAPPER_CLASS_NAME = 'toastui-editor-ww-code-block';
const CODE_BLOCK_LANG_CLASS_NAME = 'toastui-editor-ww-code-block-language';
const GUTTER_CLASS_NAME = 'toastui-editor-ww-code-block-gutter';

export class CodeBlockView implements NodeView {
  dom!: HTMLElement;

  contentDOM: HTMLElement | null = null;

  private node: ProsemirrorNode;

  private view: EditorView;

  private getPos: GetPos;

  private eventEmitter: Emitter;

  private input: HTMLElement | null = null;

  private editorWrapper: HTMLElement | null = null;

  private gutter: HTMLElement | null = null;

  private timer: NodeJS.Timeout | null = null;

  constructor(node: ProsemirrorNode, view: EditorView, getPos: GetPos, eventEmitter: Emitter) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    this.eventEmitter = eventEmitter;

    this.createElement();
    this.bindDOMEvent();
    this.bindEvent();
  }

  private createElement() {
    const { language, lineNumber } = this.node.attrs;
    const wrapper = document.createElement('div');

    wrapper.setAttribute('data-language', language || 'text');
    if (lineNumber !== null) {
      wrapper.setAttribute('data-line-number', String(lineNumber));
    }
    wrapper.className = WRAPPER_CLASS_NAME;

    if (lineNumber !== null) {
      wrapper.classList.add('has-line-numbers');
    }

    const pre = this.createCodeBlockElement();
    const code = pre.firstChild as HTMLElement;

    if (lineNumber !== null) {
      this.gutter = this.createGutter();
      wrapper.appendChild(this.gutter);
    }

    wrapper.appendChild(pre);

    this.dom = wrapper;
    this.contentDOM = code;
  }

  private createCodeBlockElement() {
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    const { language, lineNumber } = this.node.attrs;
    const attrs = getCustomAttrs(this.node.attrs);

    if (language) {
      code.setAttribute('data-language', language);
    }
    if (lineNumber !== null) {
      code.setAttribute('data-line-number', String(lineNumber));
    }
    setAttributes(attrs, pre);

    pre.appendChild(code);

    return pre;
  }

  private createGutter(): HTMLElement {
    const gutter = document.createElement('div');

    gutter.className = GUTTER_CLASS_NAME;
    gutter.contentEditable = 'false';
    this.fillGutter(gutter);

    return gutter;
  }

  private fillGutter(gutter: HTMLElement) {
    const { lineNumber } = this.node.attrs;

    if (lineNumber === null) return;

    const text = this.node.textContent;
    const lineCount = text.split('\n').length;
    const lines: string[] = [];

    for (let i = 0; i < lineCount; i += 1) {
      lines.push(String(lineNumber + i));
    }

    gutter.textContent = lines.join('\n');
  }

  private updateGutter() {
    if (this.node.attrs.lineNumber === null) {
      if (this.gutter) {
        removeNode(this.gutter);
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

  private createLanguageEditor({ top, right }: InputPos) {
    const wrapper = document.createElement('span');

    wrapper.className = CODE_BLOCK_LANG_CLASS_NAME;

    const langLabel = document.createElement('label');

    langLabel.textContent = 'Lang:';
    langLabel.className = 'toastui-editor-ww-code-block-label';

    const langInput = document.createElement('input');

    langInput.type = 'text';
    langInput.value = this.node.attrs.language || '';
    langInput.className = 'toastui-editor-ww-code-block-lang-input';

    const lineLabel = document.createElement('label');

    lineLabel.textContent = 'Line#:';
    lineLabel.className = 'toastui-editor-ww-code-block-label';

    const lineInput = document.createElement('input');

    lineInput.type = 'text';
    lineInput.placeholder = 'off';
    lineInput.className = 'toastui-editor-ww-code-block-line-input';

    const { lineNumber } = this.node.attrs;

    if (lineNumber !== null) {
      lineInput.value = lineNumber === 1 ? '' : String(lineNumber);
    }

    wrapper.appendChild(langLabel);
    wrapper.appendChild(langInput);
    wrapper.appendChild(lineLabel);
    wrapper.appendChild(lineInput);
    this.view.dom.parentElement!.appendChild(wrapper);

    const wrapperWidth = wrapper.clientWidth;

    css(wrapper, {
      top: `${top + 10}px`,
      left: `${right - wrapperWidth - 10}px`,
    });

    this.input = langInput;
    this.editorWrapper = wrapper;

    const commitChanges = () => {
      if (!this.editorWrapper) return;
      this.commitAttrs(langInput, lineInput);
    };

    langInput.addEventListener('keydown', (ev: KeyboardEvent) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        commitChanges();
      }
      if (ev.key === 'Tab') {
        ev.preventDefault();
        lineInput.focus();
      }
    });

    lineInput.addEventListener('keydown', (ev: KeyboardEvent) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        commitChanges();
      }
    });

    wrapper.addEventListener('focusout', (ev: FocusEvent) => {
      const related = ev.relatedTarget as HTMLElement | null;

      if (!related || !wrapper.contains(related)) {
        commitChanges();
      }
    });

    this.clearTimer();
    this.timer = setTimeout(() => {
      langInput.focus();
    });
  }

  private commitAttrs(langInput: HTMLInputElement, lineInput: HTMLInputElement) {
    if (!isFunction(this.getPos)) return;

    const language = langInput.value || null;
    const lineVal = lineInput.value.trim();
    let lineNumber: number | null = null;

    if (this.node.attrs.lineNumber !== null || lineVal !== '') {
      lineNumber = lineVal === '' ? 1 : Number(lineVal) || 1;
    }
    if (lineVal === 'off' || lineVal === '-') {
      lineNumber = null;
    }

    this.resetEditor();

    const pos = this.getPos();
    const { tr } = this.view.state;

    tr.setNodeMarkup(pos, null, {
      ...this.node.attrs,
      language,
      lineNumber,
    });
    this.view.dispatch(tr);
  }

  private bindDOMEvent() {
    if (this.dom) {
      this.dom.addEventListener('click', this.handleMousedown);
    }
  }

  private bindEvent() {
    this.eventEmitter.listen('scroll', () => {
      if (this.input) {
        this.resetEditor();
      }
    });
  }

  private handleMousedown = (ev: MouseEvent) => {
    const target = ev.target as HTMLElement;
    const style = getComputedStyle(target, ':after');

    if (style.backgroundImage !== 'none' && isFunction(this.getPos)) {
      const { top, right } = this.view.coordsAtPos(this.getPos());

      this.createLanguageEditor({ top, right });
    }
  };

  private resetEditor() {
    if (this.editorWrapper?.parentElement) {
      removeNode(this.editorWrapper);
    }
    this.input = null;
    this.editorWrapper = null;
  }

  private reset() {
    this.resetEditor();
  }

  private clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
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
    this.clearTimer();

    if (this.dom) {
      this.dom.removeEventListener('click', this.handleMousedown);
    }
  }
}
