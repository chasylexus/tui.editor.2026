import { ToastMark } from '@techie_doubts/toastmark';
import MarkdownEditor from '@/markdown/mdEditor';
import EventEmitter from '@/event/eventEmitter';
import { getTextContent } from './util';

function getSelectedText() {
  return document.getSelection()!.toString();
}

function getEditorHTML(editor: MarkdownEditor) {
  return editor.view.dom.innerHTML;
}

function dispatchPlainTextPaste(editor: MarkdownEditor, text: string) {
  const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
  const clipboardData = ({
    getData: jest.fn((type: string) => (type === 'text/plain' ? text : '')),
    items: ([{ kind: 'string', type: 'text/plain' }] as unknown) as DataTransferItemList,
  } as unknown) as DataTransfer;

  Object.defineProperty(event, 'clipboardData', {
    value: clipboardData,
  });

  editor.view.dom.dispatchEvent(event);

  return { event, clipboardData };
}

jest.useFakeTimers();

describe('MarkdownEditor', () => {
  let mde: MarkdownEditor, em: EventEmitter, el: HTMLElement;

  beforeEach(() => {
    em = new EventEmitter();
    mde = new MarkdownEditor(em, { toastMark: new ToastMark() });
    el = mde.el;
    document.body.appendChild(el);
  });

  afterEach(() => {
    jest.clearAllTimers();

    mde.destroy();
    document.body.removeChild(el);
  });

  it('should emit updatePreview event when editing the content', () => {
    const spy = jest.fn();

    em.listen('updatePreview', spy);

    mde.setMarkdown('# myText');

    expect(spy).toHaveBeenCalled();
  });

  it('setMarkdown API', () => {
    mde.setMarkdown('# myText');

    expect(getTextContent(mde)).toBe('# myText');
  });

  it('getMarkdown API', () => {
    mde.setMarkdown('# myText');

    const markdown = mde.getMarkdown();

    expect(markdown).toBe('# myText');
  });

  it('setSelection API', () => {
    mde.setMarkdown('# myText');
    mde.setSelection([1, 1], [1, 2]);

    // run setTimeout function when focusing the editor
    jest.runAllTimers();

    expect(getSelectedText()).toBe('#');
  });

  it('getSelection API', () => {
    mde.setMarkdown('# myText');
    mde.setSelection([1, 1], [1, 2]);

    const selection = mde.getSelection();

    expect(selection).toEqual([
      [1, 1],
      [1, 2],
    ]);
  });

  it('setPlaceholder API', () => {
    mde.setPlaceholder('Write something');

    expect(getEditorHTML(mde)).toContain(
      '<span class="placeholder ProseMirror-widget">Write something</span>'
    );
  });

  it('replaceSelection API', () => {
    mde.setMarkdown('# myText');

    mde.setSelection([1, 1], [1, 2]);
    mde.replaceSelection('# newText\n#newLine');

    expect(getTextContent(mde)).toBe('# newText\n#newLine myText');
  });

  it('focus API', () => {
    mde.focus();

    // run setTimeout function when focusing the editor
    jest.runAllTimers();

    expect(document.activeElement).toEqual(mde.view.dom);
  });

  it('blur API', () => {
    mde.focus();
    mde.blur();

    expect(document.activeElement).not.toEqual(mde.view.dom);
  });

  it('setHeight API', () => {
    mde.setHeight(100);

    const { height } = mde.el.style;

    expect(height).toBe('100px');
  });

  it('setMinHeight API', () => {
    mde.setMinHeight(100);

    const { minHeight } = mde.el.style;

    expect(minHeight).toBe('100px');
  });

  it('addWidget API', () => {
    const ul = document.createElement('ul');

    ul.innerHTML = `
      <li>Ryu</li>
      <li>Lee</li>
    `;

    mde.addWidget(ul, 'top');

    expect(document.body).toContainElement(ul);

    mde.blur();

    expect(document.body).not.toContainElement(ul);
  });

  it('should preserve blank lines when pasting plain text in markdown mode', () => {
    const markdown = [
      '```chart',
      'Месяц,План,Факт',
      'янв,1000,800',
      'фев,2500,2100',
      'мар,5000,4900',
      '',
      'type: line',
      'y.thousands: "_"',
      'series.lineWidth: 2',
      'series.styles: {"План":{"lineStyle":"dashDot","lineWidth":4},"Факт":{"lineStyle":"dot","lineWidth":3}}',
      '```',
    ].join('\n');

    mde.setMarkdown('');
    mde.setSelection([1, 1], [1, 1]);

    const { clipboardData } = dispatchPlainTextPaste(mde, markdown);

    const pasted = mde.getMarkdown();

    expect(clipboardData.getData as jest.Mock).toHaveBeenCalledWith('text/plain');
    expect(pasted.replace(/\n$/, '')).toBe(markdown);
    expect(pasted).toContain('мар,5000,4900\n\ntype: line');
  });
});
