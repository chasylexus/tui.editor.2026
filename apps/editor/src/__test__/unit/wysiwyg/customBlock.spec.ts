import { oneLineTrim } from 'common-tags';
import { HTMLConvertorMap } from '@techie_doubts/toastmark';
import { DOMParser } from 'prosemirror-model';
import { NodeSelection, TextSelection } from 'prosemirror-state';
import { ToDOMAdaptor } from '@t/convertor';
import { WwToDOMAdaptor } from '@/wysiwyg/adaptor/wwToDOMAdaptor';
import WysiwygEditor from '@/wysiwyg/wwEditor';
import EventEmitter from '@/event/eventEmitter';
import { cls } from '@/utils/dom';

let wwe: WysiwygEditor, em: EventEmitter, toDOMAdaptor: ToDOMAdaptor;

function createCustomBlockNode() {
  const customBlock = wwe.schema.nodes.customBlock.create(
    { info: 'myCustom' },
    wwe.schema.text('myCustom Node!!')
  );
  const doc = wwe.schema.nodes.doc.create(null, customBlock);

  return doc;
}

function createLatexCustomBlockNode() {
  const customBlock = wwe.schema.nodes.customBlock.create(
    { info: 'latex' },
    wwe.schema.text('E=mc^2')
  );
  const doc = wwe.schema.nodes.doc.create(null, customBlock);

  return doc;
}

function createMermaidCustomBlockNode() {
  const customBlock = wwe.schema.nodes.customBlock.create(
    { info: 'mermaid' },
    wwe.schema.text('graph TD; A-->B;')
  );
  const doc = wwe.schema.nodes.doc.create(null, customBlock);

  return doc;
}

beforeEach(() => {
  const convertors: HTMLConvertorMap = {
    myCustom(node) {
      const span = document.createElement('span');

      span.innerHTML = node.literal!;

      return [
        { type: 'openTag', tagName: 'div', attributes: { 'data-custom': 'myCustom' } },
        { type: 'html', content: span.outerHTML },
        { type: 'closeTag', tagName: 'div' },
      ];
    },
    mermaid(node) {
      const span = document.createElement('span');

      span.innerHTML = node.literal!;

      return [
        { type: 'openTag', tagName: 'div', attributes: { 'data-custom': 'mermaid' } },
        { type: 'html', content: span.outerHTML },
        { type: 'closeTag', tagName: 'div' },
      ];
    },
  };

  toDOMAdaptor = new WwToDOMAdaptor({}, convertors);
  em = new EventEmitter();
  wwe = new WysiwygEditor(em, { toDOMAdaptor });
  wwe.setModel(createCustomBlockNode());
});

afterEach(() => {
  wwe.destroy();
});

it('custom block node should be rendered in wysiwyg editor properly', () => {
  const expected = oneLineTrim`
    <div data-custom="myCustom">
      <span>myCustom Node!!</span>
    </div>
  `;

  expect(wwe.getHTML()).toContain(expected);
});

it('should select all text in custom block inner editor by Mod-a', () => {
  const wrapper = document.createElement('div');

  wrapper.innerHTML = oneLineTrim`
    <p>before</p>
    <div data-custom-info="myCustom">myCustom Node!!</div>
    <p>after</p>
  `;

  wwe.setModel(DOMParser.fromSchema(wwe.schema).parse(wrapper));

  const customBlockEl = wwe.view.dom.querySelector(`.${cls('custom-block')}`) as HTMLElement;
  const editButton = customBlockEl.querySelector('.tool button') as HTMLButtonElement;

  editButton.click();

  const { spec } = (customBlockEl as any).pmViewDesc as any;
  const { innerEditorView } = spec as any;

  expect(innerEditorView).toBeTruthy();

  innerEditorView.dom.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'a',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
  );

  const { from, to } = innerEditorView.state.selection;
  const selectedText = innerEditorView.state.doc.textBetween(from, to, '\n');

  expect(innerEditorView.state.selection).toBeInstanceOf(TextSelection);
  expect(selectedText).toBe(innerEditorView.state.doc.textContent);
});

it('should delete selected text in custom block inner editor by Backspace', () => {
  const wrapper = document.createElement('div');

  wrapper.innerHTML = oneLineTrim`
    <p>before</p>
    <div data-custom-info="myCustom">myCustom Node!!</div>
    <p>after</p>
  `;

  wwe.setModel(DOMParser.fromSchema(wwe.schema).parse(wrapper));

  const customBlockEl = wwe.view.dom.querySelector(`.${cls('custom-block')}`) as HTMLElement;
  const editButton = customBlockEl.querySelector('.tool button') as HTMLButtonElement;

  editButton.click();

  const { spec } = (customBlockEl as any).pmViewDesc as any;
  const { innerEditorView } = spec as any;

  innerEditorView.dom.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'a',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
  );

  innerEditorView.dom.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Backspace',
      bubbles: true,
      cancelable: true,
    })
  );

  expect(innerEditorView.state.doc.textContent).toBe('');
  expect(wwe.getModel().child(1).type.name).toBe('customBlock');
  expect(wwe.getModel().child(1).textContent).toBe('');
});

it('should keep preview visible while editing mermaid custom block', () => {
  wwe.setModel(createMermaidCustomBlockNode());

  const customBlockEl = wwe.view.dom.querySelector(`.${cls('custom-block')}`) as HTMLElement;
  const previewWrapper = customBlockEl.querySelector(`.${cls('custom-block-view')}`) as HTMLElement;
  const innerEditorContainer = customBlockEl.querySelector(
    `.${cls('custom-block-editor')}`
  ) as HTMLElement;
  const editButton = customBlockEl.querySelector('.tool button') as HTMLButtonElement;

  editButton.click();

  expect(innerEditorContainer.style.display).toBe('block');
  expect(previewWrapper.style.display).toBe('block');
});

it('should open inner editor when selecting latex custom block node', async () => {
  wwe.setModel(createLatexCustomBlockNode());

  const customBlockEl = wwe.view.dom.querySelector(`.${cls('custom-block')}`) as HTMLElement;
  const innerEditorContainer = customBlockEl.querySelector(
    `.${cls('custom-block-editor')}`
  ) as HTMLElement;

  expect(innerEditorContainer.style.display).toBe('none');

  wwe.view.dispatch(wwe.view.state.tr.setSelection(NodeSelection.create(wwe.view.state.doc, 0)));

  await new Promise((resolve) => {
    setTimeout(resolve, 30);
  });

  expect(innerEditorContainer.style.display).toBe('block');
});
