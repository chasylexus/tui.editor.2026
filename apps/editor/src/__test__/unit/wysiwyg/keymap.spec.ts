import { oneLineTrim } from 'common-tags';

import { DOMParser } from 'prosemirror-model';
import {
  chainCommands,
  deleteSelection,
  joinBackward,
  selectNodeBackward,
} from 'prosemirror-commands';

import WysiwygEditor from '@/wysiwyg/wwEditor';
import EventEmitter from '@/event/eventEmitter';
import { WwToDOMAdaptor } from '@/wysiwyg/adaptor/wwToDOMAdaptor';
import CellSelection from '@/wysiwyg/plugins/selection/cellSelection';
import { cls } from '@/utils/dom';

const CELL_SELECTION_CLS = cls('cell-selected');
const CODE_BLOCK_CLS = cls('ww-code-block');

describe('keymap', () => {
  let wwe: WysiwygEditor, em: EventEmitter;
  let html;

  function setContent(content: string) {
    const wrapper = document.createElement('div');

    wrapper.innerHTML = content;

    const nodes = DOMParser.fromSchema(wwe.schema).parse(wrapper);

    wwe.setModel(nodes);
  }

  function forceKeymapFn(type: string, methodName: string, args: any[] = []) {
    const { specs, view } = wwe;
    // @ts-ignore
    const [keymapFn] = specs.specs.filter((spec) => spec.name === type);

    // @ts-ignore
    return keymapFn[methodName](...args)(view.state, view.dispatch, view);
  }

  function forceTextInput(text: string) {
    const { view } = wwe;
    const { from, to } = view.state.selection;
    let handled = false;

    view.someProp('handleTextInput', (handleTextInput) => {
      handled = handleTextInput(view, from, to, text);

      return handled;
    });

    return handled;
  }

  function insertTextAtSelection(text: string) {
    const { state, dispatch } = wwe.view;
    const { from, to } = state.selection;

    dispatch!(state.tr.insertText(text, from, to));
  }

  function setStoredCodeMark() {
    const { state, dispatch } = wwe.view;

    dispatch!(state.tr.setStoredMarks([state.schema.marks.code.create()]));
  }

  function setStoredPlainMark() {
    const { state, dispatch } = wwe.view;

    dispatch!(state.tr.setStoredMarks([]));
  }

  function isDomSelectionInsideCode() {
    const selection =
      'getSelection' in wwe.view.root
        ? (wwe.view.root as Document).getSelection()
        : wwe.view.dom.ownerDocument.getSelection();

    if (!selection || !selection.anchorNode) {
      return false;
    }

    const anchorElement =
      selection.anchorNode.nodeType === Node.ELEMENT_NODE
        ? (selection.anchorNode as Element)
        : selection.anchorNode.parentElement;

    return Boolean(anchorElement && anchorElement.closest('code'));
  }

  function selectCells(from: number, to: number) {
    const { state, dispatch } = wwe.view;
    const { doc, tr } = state;

    const startCellPos = doc.resolve(from);
    const endCellPos = doc.resolve(to);
    const selection = new CellSelection(startCellPos, endCellPos);

    dispatch!(tr.setSelection(selection));
  }

  beforeEach(() => {
    const toDOMAdaptor = new WwToDOMAdaptor({}, {});

    em = new EventEmitter();
    wwe = new WysiwygEditor(em, { toDOMAdaptor });
  });

  afterEach(() => {
    wwe.destroy();
  });

  describe('table', () => {
    beforeEach(() => {
      html = oneLineTrim`
        <table>
          <thead>
            <tr>
              <th><p>foo</p></th>
              <th><p>bar</p></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><p>baz</p></td>
              <td><p>qux</p></td>
            </tr>
          </tbody>
        </table>
      `;

      setContent(html);
    });

    describe('moveToCell keymap with right (tab key)', () => {
      it('should move to start of right cell', () => {
        wwe.setSelection(7, 7); // in 'foo' cell

        forceKeymapFn('table', 'moveToCell', ['right']);

        expect(wwe.getSelection()).toEqual([12, 12]);
      });

      it('should move to first cell of next line', () => {
        wwe.setSelection(13, 13); // in 'bar' cell

        forceKeymapFn('table', 'moveToCell', ['right']);

        expect(wwe.getSelection()).toEqual([23, 23]);
      });
    });

    describe('moveToCell keymap with left (shift + tab key)', () => {
      it('should move to end of left cell', () => {
        wwe.setSelection(13, 13); // in 'bar' cell

        forceKeymapFn('table', 'moveToCell', ['left']);

        expect(wwe.getSelection()).toEqual([8, 8]);
      });

      it('should move to last cell of previous line', () => {
        wwe.setSelection(24, 24); // in 'baz' cell

        forceKeymapFn('table', 'moveToCell', ['left']);

        expect(wwe.getSelection()).toEqual([15, 15]);
      });
    });

    describe('moveInCell keymap with up', () => {
      it('should move to end of up cell', () => {
        wwe.setSelection(26, 26); // in 'baz' cell

        forceKeymapFn('table', 'moveInCell', ['up']);

        expect(wwe.getSelection()).toEqual([8, 8]);
      });

      it('should add paragraph when there is no content before table and cursor is in first row', () => {
        wwe.setSelection(13, 13); // in 'bar' cell

        forceKeymapFn('table', 'moveInCell', ['up']);

        const expected = oneLineTrim`
          <p><br></p>
          <table>
            <thead>
              <tr>
                <th><p>foo</p></th>
                <th><p>bar</p></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><p>baz</p></td>
                <td><p>qux</p></td>
              </tr>
            </tbody>
          </table>
        `;

        expect(wwe.getHTML()).toBe(expected);
      });

      it('should move to before table content when cursor is in first row', () => {
        html = oneLineTrim`
          <p>before</p>
          <table>
            <thead>
              <tr>
                <th><p>foo</p></th>
                <th><p>bar</p></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><p>baz</p></td>
                <td><p>qux</p></td>
              </tr>
            </tbody>
          </table>
        `;

        setContent(html);

        wwe.setSelection(15, 15); // in 'foo' cell
        forceKeymapFn('table', 'moveInCell', ['up']);

        expect(wwe.getSelection()).toEqual([7, 7]); // 'before' paragraph
      });
    });

    describe('moveInCell keymap with down', () => {
      it('should move to start of down cell', () => {
        wwe.setSelection(7, 7); // in 'foo' cell

        forceKeymapFn('table', 'moveInCell', ['down']);

        expect(wwe.getSelection()).toEqual([23, 23]);
      });

      it('should add paragraph when there is no content after table and cursor is in last row', () => {
        wwe.setSelection(26, 26); // in 'baz' cell

        forceKeymapFn('table', 'moveInCell', ['down']);

        const expected = oneLineTrim`
          <table>
            <thead>
              <tr>
                <th><p>foo</p></th>
                <th><p>bar</p></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><p>baz</p></td>
                <td><p>qux</p></td>
              </tr>
            </tbody>
          </table>
          <p><br></p>
        `;

        expect(wwe.getHTML()).toBe(expected);
      });

      it('should move to after table content when cursor is in last row', () => {
        html = oneLineTrim`
          <table>
            <thead>
              <tr>
                <th><p>foo</p></th>
                <th><p>bar</p></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><p>baz</p></td>
                <td><p>qux</p></td>
              </tr>
            </tbody>
          </table>
          <p>after</p>
        `;

        setContent(html);

        wwe.setSelection(32, 32); // in 'qux' cell
        forceKeymapFn('table', 'moveInCell', ['down']);

        expect(wwe.getSelection()).toEqual([39, 39]); // 'after' paragraph
      });
    });

    describe('moveInCell keymap with left and right', () => {
      let expected: string;

      beforeEach(() => {
        expected = oneLineTrim`
          <table class="ProseMirror-selectednode" draggable="true">
            <thead>
              <tr>
                <th><p>foo</p></th>
                <th><p>bar</p></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><p>baz</p></td>
                <td><p>qux</p></td>
              </tr>
            </tbody>
          </table>
        `;
      });

      it('should select table when cursor is in start of first cell', () => {
        wwe.setSelection(5, 5); // in 'foo' cell

        forceKeymapFn('table', 'moveInCell', ['left']);

        expect(wwe.getHTML()).toBe(expected);
      });

      it('should select table when cursor is in end of last cell', () => {
        wwe.setSelection(33, 33); // in 'qux' cell

        forceKeymapFn('table', 'moveInCell', ['right']);

        expect(wwe.getHTML()).toBe(expected);
      });
    });

    it('deleteCells keymap should delete cells in selection', () => {
      selectCells(3, 28);

      forceKeymapFn('table', 'deleteCells');

      const expected = oneLineTrim`
        <table>
          <thead>
            <tr>
              <th class="${CELL_SELECTION_CLS}"><p><br></p></th>
              <th class="${CELL_SELECTION_CLS}"><p><br></p></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="${CELL_SELECTION_CLS}"><p><br></p></td>
              <td class="${CELL_SELECTION_CLS}"><p><br></p></td>
            </tr>
          </tbody>
        </table>
      `;

      expect(wwe.getHTML()).toBe(expected);
    });

    describe('exitTable keymap', () => {
      it('should exit the table node and add paragraph', () => {
        wwe.setSelection(5, 5); // in 'foo' cell

        forceKeymapFn('table', 'exitTable');

        const expected = oneLineTrim`
          <table>
            <thead>
              <tr>
                <th><p>foo</p></th>
                <th><p>bar</p></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><p>baz</p></td>
                <td><p>qux</p></td>
              </tr>
            </tbody>
          </table>
          <p><br></p>
        `;

        expect(wwe.getHTML()).toBe(expected);
        expect(wwe.getSelection()).toEqual([39, 39]); // in added paragraph
      });
    });
  });

  describe('table with list and multiple lines', () => {
    beforeEach(() => {
      html = oneLineTrim`
        <table>
          <thead>
            <tr>
              <th>
                <p>foo</p>
                <p>bar</p>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <ul>
                  <li><p>baz</p></li>
                  <li><p>qux</p></li>
                </ul>
              </td>
            </tr>
            <tr>
              <td>
                <ul>
                  <li>
                    <p>quux</p>
                    <ul>
                      <li><p>quuz</p></li>
                    </ul>
                  </li>
                </ul>
              </td>
            </tr>
            <tr>
              <td>
                <p>corge</p>
              </td>
            </tr>
          </tbody>
        </table>
      `;

      setContent(html);
    });

    describe('moveInCell keymap with up', () => {
      it('should move from first paragraph to end list item of up cell', () => {
        wwe.setSelection(65, 65); // in 'corge' cell

        forceKeymapFn('table', 'moveInCell', ['up']);

        expect(wwe.getSelection()).toEqual([55, 55]); // in 'quux'
      });

      it('should move from first list item to end list item of up cell', () => {
        wwe.setSelection(44, 44); // in 'quux' cell

        forceKeymapFn('table', 'moveInCell', ['up']);

        expect(wwe.getSelection()).toEqual([33, 33]); // in 'qux'
      });
    });

    describe('moveInCell keymap with down', () => {
      it('should move from last paragraph to start list item of down cell', () => {
        wwe.setSelection(10, 10); // in 'bar'

        forceKeymapFn('table', 'moveInCell', ['down']);

        expect(wwe.getSelection()).toEqual([23, 23]); // in 'baz'
      });

      it('should move from last list item to start list item of down cell', () => {
        wwe.setSelection(30, 30); // in 'qux'

        forceKeymapFn('table', 'moveInCell', ['down']);

        expect(wwe.getSelection()).toEqual([43, 43]); // in 'quux'
      });
    });
  });

  describe('code block', () => {
    beforeEach(() => {
      html = oneLineTrim`
        <div data-language="text" class="${CODE_BLOCK_CLS}">
          <pre>
            <code>foo\nbar\nbaz</code>
          </pre>
        </div>
      `;

      setContent(html);
    });

    describe('moveCursor keymap with up', () => {
      it('should add paragraph when there is no content before code block and cursor is in first line', () => {
        wwe.setSelection(4, 4); // in 'foo' text

        forceKeymapFn('codeBlock', 'moveCursor', ['up']);

        const expected = oneLineTrim`
          <p><br></p>
          <div data-language="text" class="${CODE_BLOCK_CLS}">
            <pre>
              <code>foo\nbar\nbaz</code>
            </pre>
          </div>
        `;

        expect(wwe.getHTML()).toBe(expected);
      });
    });

    describe('moveCursor keymap with down', () => {
      it('should add paragraph when there is no content after code block and cursor is in last line', () => {
        wwe.setSelection(10, 10); // in 'baz' text

        forceKeymapFn('codeBlock', 'moveCursor', ['down']);

        const expected = oneLineTrim`
          <div data-language="text" class="${CODE_BLOCK_CLS}">
            <pre>
              <code>foo\nbar\nbaz</code>
            </pre>
          </div>
          <p><br></p>
        `;

        expect(wwe.getHTML()).toBe(expected);
      });
    });
  });

  describe('code mark', () => {
    it('should leave code mark from right edge by ArrowRight', () => {
      setContent('<p><code>foo</code> bar</p>');
      wwe.setSelection(4, 4); // right edge of "foo"
      setStoredCodeMark();

      const moved = forceKeymapFn('code', 'moveCursorOutOfCode', ['right']);

      expect(moved).toBe(true);

      insertTextAtSelection('X');

      expect(wwe.getHTML()).toBe('<p><code>foo</code>X bar</p>');
    });

    it('should leave code mark from left edge by ArrowLeft', () => {
      setContent('<p>a <code>foo</code></p>');
      wwe.setSelection(3, 3); // left edge of "foo"
      setStoredCodeMark();

      const moved = forceKeymapFn('code', 'moveCursorOutOfCode', ['left']);

      expect(moved).toBe(true);

      insertTextAtSelection('X');

      expect(wwe.getHTML()).toBe('<p>a X<code>foo</code></p>');
    });

    it('should not leave code mark when cursor is not at code edge', () => {
      setContent('<p><code>foo</code></p>');
      wwe.setSelection(3, 3); // inside "foo"

      const moved = forceKeymapFn('code', 'moveCursorOutOfCode', ['right']);

      expect(moved).toBe(false);
    });

    it('should place caret outside code from right edge with next text', () => {
      setContent('<p><code>code</code>a</p>');
      wwe.setSelection(5, 5); // right edge of "code"
      setStoredCodeMark();

      const moved = forceKeymapFn('code', 'moveCursorOutOfCode', ['right']);

      expect(moved).toBe(true);
      expect(isDomSelectionInsideCode()).toBe(false);
    });

    it('should place caret outside code from right edge at paragraph end', () => {
      setContent('<p><code>code</code></p>');
      wwe.setSelection(5, 5); // right edge of "code"
      setStoredCodeMark();

      const moved = forceKeymapFn('code', 'moveCursorOutOfCode', ['right']);

      expect(moved).toBe(true);
      expect(isDomSelectionInsideCode()).toBe(false);
    });

    it('should enter and leave code at paragraph start by horizontal arrows', () => {
      setContent('<p><code>code</code></p>');
      wwe.setSelection(1, 1); // outside before "code"

      const entered = forceKeymapFn('code', 'moveCursorOutOfCode', ['right']);

      expect(entered).toBe(true);

      const left = forceKeymapFn('code', 'moveCursorOutOfCode', ['left']);

      expect(left).toBe(true);
      expect(isDomSelectionInsideCode()).toBe(false);

      insertTextAtSelection('X');

      expect(wwe.getHTML()).toBe('<p>X<code>code</code></p>');
    });

    it('should enter code near left edge with previous text', () => {
      setContent('<p>a<code>code</code></p>');
      wwe.setSelection(2, 2); // between "a" and "code"

      expect(isDomSelectionInsideCode()).toBe(false);

      const entered = forceKeymapFn('code', 'moveCursorOutOfCode', ['right']);

      expect(entered).toBe(true);

      insertTextAtSelection('X');

      expect(wwe.getHTML()).toBe('<p>a<code>Xcode</code></p>');
    });

    it('should enter and leave code at right boundary by horizontal arrows', () => {
      setContent('<p><code>code</code>a</p>');
      wwe.setSelection(5, 5); // between code and "a", outside by default

      expect(isDomSelectionInsideCode()).toBe(false);

      const entered = forceKeymapFn('code', 'moveCursorOutOfCode', ['left']);

      expect(entered).toBe(true);
      insertTextAtSelection('X');

      expect(wwe.getHTML()).toBe('<p><code>codeX</code>a</p>');
      setStoredCodeMark();

      const exited = forceKeymapFn('code', 'moveCursorOutOfCode', ['right']);

      expect(exited).toBe(true);
      expect(isDomSelectionInsideCode()).toBe(false);
      insertTextAtSelection('Y');

      expect(wwe.getHTML()).toBe('<p><code>codeX</code>Ya</p>');
    });

    it('should prioritize stored marks over DOM affinity at right boundary', () => {
      setContent('<p><code>code</code>a</p>');
      wwe.setSelection(5, 5); // between code and "a"
      setStoredPlainMark(); // explicit outside state

      const codeTextNode = wwe.view.dom.querySelector('code')!.firstChild!;
      const selection =
        'getSelection' in wwe.view.root
          ? (wwe.view.root as Document).getSelection()
          : wwe.view.dom.ownerDocument.getSelection();
      const range = wwe.view.dom.ownerDocument.createRange();

      // Simulate browser affinity that still reports boundary as inside <code>.
      range.setStart(codeTextNode, codeTextNode.textContent!.length);
      range.collapse(true);
      selection!.removeAllRanges();
      selection!.addRange(range);

      const entered = forceKeymapFn('code', 'moveCursorOutOfCode', ['left']);

      expect(entered).toBe(true);

      insertTextAtSelection('X');

      expect(wwe.getHTML()).toBe('<p><code>codeX</code>a</p>');
    });

    it('should keep outside-right-boundary stop by ArrowLeft before entering code', () => {
      setContent('<p>123<code>code</code>456</p>');
      wwe.setSelection(9, 9); // between "4" and "5"

      const moved = forceKeymapFn('code', 'moveCursorOutOfCode', ['left']);

      expect(moved).toBe(true);
      expect(isDomSelectionInsideCode()).toBe(false);

      insertTextAtSelection('X');

      expect(wwe.getHTML()).toBe('<p>123<code>code</code>X456</p>');
    });

    it('should keep inside-left-boundary stop by ArrowLeft before leaving code', () => {
      setContent('<p>123<code>code</code>456</p>');
      wwe.setSelection(5, 5); // between "c" and "o"

      const moved = forceKeymapFn('code', 'moveCursorOutOfCode', ['left']);

      expect(moved).toBe(true);

      insertTextAtSelection('X');

      expect(wwe.getHTML()).toBe('<p>123<code>Xcode</code>456</p>');
    });

    it('should not skip inside-left boundary for one-char inline code on ArrowLeft', () => {
      setContent('<p>1<code>2</code>3</p>');
      wwe.setSelection(3, 3); // right edge of "2"
      setStoredCodeMark(); // inside code at boundary

      const moved = forceKeymapFn('code', 'moveCursorOutOfCode', ['left']);

      expect(moved).toBe(true);

      insertTextAtSelection('X');

      expect(wwe.getHTML()).toBe('<p>1<code>X2</code>3</p>');
    });

    it('should keep both left-boundary states for one-char inline code', () => {
      setContent('<p>1<code>2</code>3</p>');
      wwe.setSelection(2, 2); // between "1" and code
      setStoredPlainMark(); // outside-left

      const entered = forceKeymapFn('code', 'moveCursorOutOfCode', ['right']);

      expect(entered).toBe(true);
      insertTextAtSelection('X');

      expect(wwe.getHTML()).toBe('<p>1<code>X2</code>3</p>');
      setContent('<p>1<code>2</code>3</p>');
      wwe.setSelection(2, 2);
      setStoredPlainMark();
      forceKeymapFn('code', 'moveCursorOutOfCode', ['right']);

      const exited = forceKeymapFn('code', 'moveCursorOutOfCode', ['left']);

      expect(exited).toBe(true);
      insertTextAtSelection('Y');

      expect(wwe.getHTML()).toBe('<p>1Y<code>2</code>3</p>');
    });

    it('should keep both right-boundary states for one-char inline code', () => {
      setContent('<p>1<code>2</code>3</p>');
      wwe.setSelection(3, 3); // between code and "3"
      setStoredPlainMark(); // outside-right

      const entered = forceKeymapFn('code', 'moveCursorOutOfCode', ['left']);

      expect(entered).toBe(true);
      insertTextAtSelection('X');

      expect(wwe.getHTML()).toBe('<p>1<code>2X</code>3</p>');
      setContent('<p>1<code>2</code>3</p>');
      wwe.setSelection(3, 3);
      setStoredCodeMark(); // inside-right

      const exited = forceKeymapFn('code', 'moveCursorOutOfCode', ['right']);

      expect(exited).toBe(true);
      insertTextAtSelection('Y');

      expect(wwe.getHTML()).toBe('<p>1<code>2</code>Y3</p>');
    });

    it('should create cursor wrapper with correct marks at right boundary (outside)', () => {
      setContent('<p><code>code</code>abc</p>');
      wwe.setSelection(5, 5);

      forceKeymapFn('code', 'moveCursorOutOfCode', ['left']);

      const view = wwe.view as any;

      expect(view.cursorWrapper).not.toBeNull();
      expect(view.cursorWrapper.dom.getAttribute('mark-placeholder')).toBe('true');

      const wrapperMarks = view.cursorWrapper.deco.spec.marks;

      expect(wrapperMarks.some((m: any) => m.type.name === 'code')).toBe(true);
    });

    it('should create cursor wrapper without code mark at right boundary (outside)', () => {
      setContent('<p><code>code</code>abc</p>');
      wwe.setSelection(5, 5);
      setStoredCodeMark();

      forceKeymapFn('code', 'moveCursorOutOfCode', ['right']);

      const view = wwe.view as any;

      expect(view.cursorWrapper).not.toBeNull();

      const wrapperMarks = view.cursorWrapper.deco.spec.marks;

      expect(wrapperMarks.some((m: any) => m.type.name === 'code')).toBe(false);
    });

    it('should clear cursor wrapper on next state update after boundary transition', () => {
      setContent('<p><code>code</code>abc</p>');
      wwe.setSelection(5, 5);

      forceKeymapFn('code', 'moveCursorOutOfCode', ['left']);

      const view = wwe.view as any;

      expect(view.cursorWrapper).not.toBeNull();

      insertTextAtSelection('X');

      expect(view.cursorWrapper).toBeNull();
    });

    it('should exit code on ArrowRight at right boundary without stored marks', () => {
      setContent('<p>1<code>2</code></p>');
      wwe.setSelection(3, 3); // right boundary of code, end of paragraph

      const handled = forceKeymapFn('code', 'moveCursorOutOfCode', ['right']);

      expect(handled).toBe(true);

      insertTextAtSelection('X');

      expect(wwe.getHTML()).toBe('<p>1<code>2</code>X</p>');
    });

  });

  describe('paragraph', () => {
    it('should change marker text to bullet list by space keymap', () => {
      setContent('<p>-</p>');
      wwe.setSelection(2, 2); // after '-'

      const changed = forceKeymapFn('paragraph', 'makeBulletListByMarker');

      expect(changed).toBe(true);
      expect(wwe.getHTML()).toBe(oneLineTrim`
        <ul>
          <li><p><br></p></li>
        </ul>
      `);
      expect(wwe.getSelection()).toEqual([3, 3]);
    });

    it('should not change paragraph when marker text does not match', () => {
      setContent('<p>foo-</p>');
      wwe.setSelection(5, 5); // after '-'

      const changed = forceKeymapFn('paragraph', 'makeBulletListByMarker');

      expect(changed).toBe(false);
      expect(wwe.getHTML()).toBe('<p>foo-</p>');
    });

    it('should insert paired backticks and place cursor between them', () => {
      setContent('<p><br></p>');
      wwe.setSelection(1, 1);

      const changed = forceKeymapFn('paragraph', 'makeCodeByBacktick');

      expect(changed).toBe(true);
      expect(wwe.getHTML()).toBe('<p>``</p>');
      expect(wwe.getSelection()).toEqual([2, 2]);
    });

    it('should move cursor over auto-inserted closing backtick', () => {
      setContent('<p>``</p>');
      wwe.setSelection(2, 2); // between paired backticks

      const changed = forceKeymapFn('paragraph', 'makeCodeByBacktick');

      expect(changed).toBe(true);
      expect(wwe.getHTML()).toBe('<p>``</p>');
      expect(wwe.getSelection()).toEqual([3, 3]);
    });

    it('should change paired backticks to empty code block by third backtick', () => {
      setContent('<p>``</p>');
      wwe.setSelection(3, 3); // after paired backticks

      const changed = forceKeymapFn('paragraph', 'makeCodeByBacktick');

      expect(changed).toBe(true);
      expect(wwe.getModel().firstChild?.type.name).toBe('codeBlock');
      expect(wwe.getModel().firstChild?.textContent).toBe('');
    });

    it('should convert text input between paired backticks to inline code', () => {
      setContent('<p>``</p>');
      wwe.setSelection(2, 2); // between paired backticks

      const handled = forceTextInput('a');

      expect(handled).toBe(true);
      expect(wwe.getHTML()).toBe('<p><code>a</code></p>');
      expect(wwe.getSelection()).toEqual([2, 2]);
    });
  });

  describe('list item', () => {
    function forceBackspaceKeymap() {
      const { view } = wwe;
      const { state, dispatch } = view;

      chainCommands(deleteSelection, joinBackward, selectNodeBackward)(state, dispatch, view);
    }

    it('should remove list item and lift up to previous list item by backspace keymap ', () => {
      html = oneLineTrim`
        <ul>
          <li>item1</li>
          <li></li>
        </ul>
      `;

      setContent(html);
      wwe.setSelection(9, 10); // in second list item

      forceBackspaceKeymap();
      forceKeymapFn('listItem', 'liftToPrevListItem');

      const expected = oneLineTrim`
        <ul>
          <li><p>item1</p></li>
        </ul>
      `;

      expect(wwe.getHTML()).toBe(expected);
    });

    it('should remove list item and lift up to parent list item by backspace keymap ', () => {
      html = oneLineTrim`
        <ul>
          <li>item1</li>
          <li>
            item2
            <ul>
              <li></li>
            </ul>
          </li>
        </ul>
      `;

      setContent(html);
      wwe.setSelection(19, 20); // in nested last child list item

      forceBackspaceKeymap();
      forceKeymapFn('listItem', 'liftToPrevListItem');

      const expected = oneLineTrim`
        <ul>
          <li><p>item1</p></li>
          <li><p>item2</p></li>
        </ul>
      `;

      expect(wwe.getHTML()).toBe(expected);
    });
  });
});
