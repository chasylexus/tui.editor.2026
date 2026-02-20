import { EditorView, NodeView } from 'prosemirror-view';
import { ProsemirrorNode } from 'prosemirror-model';
import { StepMap } from 'prosemirror-transform';
import { EditorState, TextSelection, Transaction } from 'prosemirror-state';
import { newlineInCode, selectAll } from 'prosemirror-commands';
import { redo, undo, undoDepth, history } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import isFunction from 'tui-code-snippet/type/isFunction';
import css from 'tui-code-snippet/domUtil/css';
import { ToDOMAdaptor } from '@t/convertor';
import { createTextSelection } from '@/helper/manipulation';
import { cls, removeNode } from '@/utils/dom';

const CODE_FENCE_KINDS = new Set(['mermaid', 'uml', 'chart']);

interface EventLike {
  emit(event: string, ...args: any[]): void;
}

type GetPos = (() => number) | boolean;

export class CustomBlockView implements NodeView {
  dom: HTMLElement;

  private node: ProsemirrorNode;

  private toDOMAdaptor: ToDOMAdaptor;

  private editorView: EditorView;

  private eventEmitter: EventLike;

  private innerEditorView: EditorView | null;

  private wrapper: HTMLElement;

  private innerViewContainer!: HTMLElement;

  private getPos: GetPos;

  private canceled: boolean;

  private typeEditorEl: HTMLElement | null = null;

  constructor(
    node: ProsemirrorNode,
    view: EditorView,
    getPos: GetPos,
    toDOMAdaptor: ToDOMAdaptor,
    eventEmitter: EventLike
  ) {
    this.node = node;
    this.editorView = view;
    this.getPos = getPos;
    this.toDOMAdaptor = toDOMAdaptor;
    this.eventEmitter = eventEmitter;
    this.innerEditorView = null;
    this.canceled = false;

    this.dom = document.createElement('div');
    this.dom.className = cls('custom-block');
    this.wrapper = document.createElement('div');
    this.wrapper.className = cls('custom-block-view');

    this.createInnerViewContainer();
    this.renderCustomBlock();

    this.dom.appendChild(this.innerViewContainer);
    this.dom.appendChild(this.wrapper);
    this.dom.addEventListener('dblclick', this.handleDblClick);
  }

  private handleDblClick = (ev: Event) => {
    ev.preventDefault();
    this.openEditor();
  };

  private renderToolArea() {
    const tool = document.createElement('div');
    const span = document.createElement('span');
    const button = document.createElement('button');

    tool.className = 'tool';
    span.textContent = this.node.attrs.info;
    span.className = 'info';
    button.type = 'button';
    button.addEventListener('click', () => {
      if (this.isCodeFenceBlock()) {
        this.openTypeEditor();
      } else {
        this.openEditor();
      }
    });

    tool.appendChild(span);
    tool.appendChild(button);
    this.wrapper.appendChild(tool);
  }

  private isCodeFenceBlock() {
    const info = String(this.node.attrs.info || '')
      .trim()
      .toLowerCase();

    return CODE_FENCE_KINDS.has(info);
  }

  private renderCustomBlock() {
    const toDOMNode = this.toDOMAdaptor.getToDOMNode(this.node.attrs.info);

    if (toDOMNode) {
      const node = toDOMNode(this.node);

      while (this.wrapper.hasChildNodes()) {
        this.wrapper.removeChild(this.wrapper.lastChild!);
      }

      if (node) {
        this.wrapper.appendChild(node);
      }
      this.renderToolArea();
    }
  }

  private createInnerViewContainer() {
    this.innerViewContainer = document.createElement('div');
    this.innerViewContainer.className = cls('custom-block-editor');
    this.innerViewContainer.style.display = 'none';
  }

  private openEditor = () => {
    if (this.innerEditorView) {
      return;
    }

    this.dom.draggable = false;
    this.wrapper.style.display = 'none';
    this.innerViewContainer.style.display = 'block';

    this.innerEditorView = new EditorView(this.innerViewContainer, {
      state: EditorState.create({
        doc: this.node,
        plugins: [
          keymap({
            'Mod-z': () => undo(this.innerEditorView!.state, this.innerEditorView!.dispatch),
            'Shift-Mod-z': () => redo(this.innerEditorView!.state, this.innerEditorView!.dispatch),
            Tab: (state: EditorState, dispatch?: (tr: Transaction) => void) => {
              dispatch!(state.tr.insertText('\t'));
              return true;
            },
            Enter: newlineInCode,
            Escape: () => {
              this.cancelEditing();
              return true;
            },
            'Ctrl-Enter': () => {
              this.saveAndFinishEditing();
              return true;
            },
            'Mod-a': selectAll,
          }),
          history(),
        ],
      }),
      dispatchTransaction: (tr: Transaction) => this.dispatchInner(tr),
      handleDOMEvents: {
        mousedown: () => {
          if (this.editorView.hasFocus()) {
            this.innerEditorView!.focus();
          }
          return true;
        },
        blur: () => {
          this.saveAndFinishEditing();
          return true;
        },
      },
    });
    setTimeout(() => {
      if (this.innerEditorView) {
        this.innerEditorView.focus();
      }
    });
  };

  private closeEditor() {
    if (this.innerEditorView) {
      this.innerEditorView.destroy();
      this.innerEditorView = null;
      this.innerViewContainer.style.display = 'none';
    }
    this.wrapper.style.display = 'block';
  }

  private saveAndFinishEditing() {
    const { to } = this.editorView.state.selection;
    const outerState: EditorState = this.editorView.state;

    this.editorView.dispatch(outerState.tr.setSelection(createTextSelection(outerState.tr, to)));
    this.editorView.focus();

    this.renderCustomBlock();
    this.closeEditor();
    this.eventEmitter.emit('change', 'wysiwyg');
  }

  private cancelEditing() {
    let undoableCount = undoDepth(this.innerEditorView!.state);

    this.canceled = true;

    // should undo editing result
    // eslint-disable-next-line no-plusplus
    while (undoableCount--) {
      undo(this.innerEditorView!.state, this.innerEditorView!.dispatch);
      undo(this.editorView.state, this.editorView.dispatch);
    }
    this.canceled = false;

    const { to } = this.editorView.state.selection;
    const outerState: EditorState = this.editorView.state;

    this.editorView.dispatch(outerState.tr.setSelection(TextSelection.create(outerState.doc, to)));
    this.editorView.focus();

    this.closeEditor();
  }

  private dispatchInner(tr: Transaction) {
    const { state, transactions } = this.innerEditorView!.state.applyTransaction(tr);

    this.innerEditorView!.updateState(state);

    if (!this.canceled && isFunction(this.getPos)) {
      const outerTr = this.editorView.state.tr;
      const offsetMap = StepMap.offset(this.getPos() + 1);

      for (let i = 0; i < transactions.length; i += 1) {
        const { steps } = transactions[i];

        for (let j = 0; j < steps.length; j += 1) {
          outerTr.step(steps[j].map(offsetMap)!);
        }
      }
      if (outerTr.docChanged) {
        this.editorView.dispatch(outerTr);
      }
    }
  }

  update(node: ProsemirrorNode) {
    if (!node.sameMarkup(this.node)) {
      return false;
    }

    this.node = node;

    if (!this.innerEditorView) {
      this.renderCustomBlock();
    }

    return true;
  }

  selectNode() {
    this.dom.classList.add('ProseMirror-selectednode');

    if (this.isLatexBlock() && !this.innerEditorView) {
      requestAnimationFrame(() => {
        if (!this.innerEditorView) {
          this.openEditor();
        }
      });
    }
  }

  deselectNode() {
    this.dom.classList.remove('ProseMirror-selectednode');
  }

  private isLatexBlock() {
    const info = String(this.node.attrs.info || '').trim();
    const [kind] = info.split(/\s+/);

    return !kind || kind === 'latex';
  }

  private openTypeEditor() {
    if (this.typeEditorEl || !isFunction(this.getPos)) return;

    const pos = this.getPos();
    const { top, right } = this.editorView.coordsAtPos(pos);
    const wrapper = document.createElement('span');

    wrapper.className = 'toastui-editor-ww-code-block-language';

    const label = document.createElement('label');

    label.textContent = 'Type:';
    label.className = 'toastui-editor-ww-code-block-label';

    const input = document.createElement('input');

    input.type = 'text';
    input.value = this.node.attrs.info || '';
    input.className = 'toastui-editor-ww-code-block-lang-input';

    wrapper.appendChild(label);
    wrapper.appendChild(input);
    this.editorView.dom.parentElement!.appendChild(wrapper);

    const wrapperWidth = wrapper.clientWidth;

    css(wrapper, {
      top: `${top + 10}px`,
      left: `${right - wrapperWidth - 10}px`,
    });

    this.typeEditorEl = wrapper;

    const commit = () => {
      if (!this.typeEditorEl) return;
      this.commitTypeChange(input.value);
    };

    input.addEventListener('keydown', (ev: KeyboardEvent) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        commit();
      }
    });

    wrapper.addEventListener('focusout', (ev: FocusEvent) => {
      const related = ev.relatedTarget as HTMLElement | null;

      if (!related || !wrapper.contains(related)) {
        commit();
      }
    });

    setTimeout(() => input.focus());
  }

  private commitTypeChange(newType: string) {
    if (!isFunction(this.getPos)) return;

    const lang = newType.trim().toLowerCase();

    this.resetTypeEditor();

    const pos = this.getPos();
    const { tr } = this.editorView.state;

    if (CODE_FENCE_KINDS.has(lang) || lang === 'latex' || lang === '') {
      const info = lang || 'latex';

      tr.setNodeMarkup(pos, null, { ...this.node.attrs, info });
    } else {
      const { codeBlock } = this.editorView.state.schema.nodes;

      if (!codeBlock) return;

      const { content } = this.node;
      const newNode = codeBlock.create(
        { language: lang, lineNumber: null },
        content.size > 0 ? content : null
      );

      tr.replaceWith(pos, pos + this.node.nodeSize, newNode);
    }

    this.editorView.dispatch(tr);
    this.editorView.focus();
  }

  private resetTypeEditor() {
    if (this.typeEditorEl) {
      removeNode(this.typeEditorEl);
      this.typeEditorEl = null;
    }
  }

  stopEvent(event: Event): boolean {
    if (
      this.typeEditorEl &&
      event.target instanceof Node &&
      this.typeEditorEl.contains(event.target)
    ) {
      return true;
    }

    return (
      !!this.innerEditorView &&
      !!event.target &&
      this.innerEditorView.dom.contains(event.target as Node)
    );
  }

  ignoreMutation() {
    return true;
  }

  destroy() {
    this.dom.removeEventListener('dblclick', this.handleDblClick);
    this.resetTypeEditor();
    this.closeEditor();
  }
}
