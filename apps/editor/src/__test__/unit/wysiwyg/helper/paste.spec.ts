import { DOMParser } from 'prosemirror-model';

import WysiwygEditor from '@/wysiwyg/wwEditor';
import EventEmitter from '@/event/eventEmitter';
import { WwToDOMAdaptor } from '@/wysiwyg/adaptor/wwToDOMAdaptor';
import { createHTMLSchemaMap } from '@/wysiwyg/nodes/html';
import { sanitizeHTML } from '@/sanitizer/htmlSanitizer';
import { changePastedSlice } from '@/wysiwyg/clipboard/paste';
import { createHTMLrenderer } from '../../markdown/util';

describe('changePastedSlice()', () => {
  let wwe: WysiwygEditor;
  let em: EventEmitter;
  let el: HTMLElement;

  beforeEach(() => {
    const htmlRenderer = createHTMLrenderer();
    const toDOMAdaptor = new WwToDOMAdaptor({}, htmlRenderer);
    const htmlSchemaMap = createHTMLSchemaMap(htmlRenderer, sanitizeHTML, toDOMAdaptor);

    em = new EventEmitter();
    wwe = new WysiwygEditor(em, { toDOMAdaptor, htmlSchemaMap });
    el = wwe.el;
    document.body.appendChild(el);
  });

  afterEach(() => {
    if (Object.keys(wwe).length) {
      wwe.destroy();
    }
    document.body.removeChild(el);
  });

  it('should pad malformed pasted html table rows to rectangular shape', () => {
    const wrapper = document.createElement('div');

    wrapper.innerHTML = `
      <table>
        <thead>
          <tr><th>A</th><th>B</th></tr>
        </thead>
        <tbody>
          <tr><td>Sales Lift</td></tr>
          <tr><td>Search Lift</td></tr>
        </tbody>
      </table>
    `;

    const slice = DOMParser.fromSchema(wwe.schema).parseSlice(wrapper);
    const changed = changePastedSlice(slice, wwe.schema, false);
    const table = changed.content.firstChild!;
    const headRow = table.firstChild!.firstChild!;
    const firstBodyRow = table.lastChild!.firstChild!;
    const secondBodyRow = table.lastChild!.child(1);

    expect(headRow.childCount).toBe(2);
    expect(firstBodyRow.childCount).toBe(2);
    expect(secondBodyRow.childCount).toBe(2);
  });

  it('should flatten merged html table into a rectangular shape', () => {
    const wrapper = document.createElement('div');

    wrapper.innerHTML = `
      <table>
        <thead>
          <tr><th>A</th><th>B</th></tr>
        </thead>
        <tbody>
          <tr><td rowspan="3">Merged</td><td>R1</td></tr>
          <tr><td>R2</td></tr>
          <tr><td>R3</td></tr>
        </tbody>
      </table>
    `;

    const slice = DOMParser.fromSchema(wwe.schema).parseSlice(wrapper);
    const changed = changePastedSlice(slice, wwe.schema, false);
    const table = changed.content.firstChild!;
    const body = table.lastChild!;
    const firstBodyRow = body.firstChild!;
    const secondBodyRow = body.child(1);
    const thirdBodyRow = body.child(2);

    expect(firstBodyRow.childCount).toBe(2);
    expect(secondBodyRow.childCount).toBe(2);
    expect(thirdBodyRow.childCount).toBe(2);
    expect(secondBodyRow.child(0).textContent).toBe('Merged');
    expect(thirdBodyRow.child(0).textContent).toBe('Merged');
  });
});
