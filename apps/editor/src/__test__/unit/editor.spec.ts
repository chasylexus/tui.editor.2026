import '@/i18n/en-us';
import { oneLineTrim, stripIndents, source } from 'common-tags';
import { Emitter } from '@t/event';
import { EditorOptions } from '@t/editor';
import type { OpenTagToken } from '@techie_doubts/toastmark';
import i18n from '@/i18n/i18n';
import Editor from '@/editor';
import Viewer from '@/viewer';
import * as commonUtil from '@/utils/common';
import { createHTMLrenderer } from './markdown/util';
import { cls } from '@/utils/dom';
import * as imageHelper from '@/helper/image';
import { getEditorToMdPos, getMdToEditorPos } from '@/markdown/helper/pos';

const HEADING_CLS = `${cls('md-heading')} ${cls('md-heading1')}`;
const DELIM_CLS = cls('md-delimiter');

describe('editor', () => {
  let container: HTMLElement,
    mdEditor: HTMLElement,
    mdPreview: HTMLElement,
    wwEditor: HTMLElement,
    editor: Editor;

  function getPreviewHTML() {
    return mdPreview
      .querySelector(`.${cls('contents')}`)!
      .innerHTML.replace(/\sdata-nodeid="\d+"|\n/g, '')
      .trim();
  }

  function dispatchPlainTextPaste(target: HTMLElement, text: string, withItems = true) {
    const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    const clipboardData = {
      getData: jest.fn((type: string) => (type === 'text/plain' ? text : '')),
    } as any;

    if (withItems) {
      clipboardData.items = [{ kind: 'string', type: 'text/plain' }] as unknown as DataTransferItemList;
    }

    Object.defineProperty(event, 'clipboardData', {
      value: clipboardData as DataTransfer,
    });

    target.dispatchEvent(event);

    return { event, clipboardData };
  }

  describe('instance API', () => {
    beforeEach(() => {
      container = document.createElement('div');
      editor = new Editor({
        el: container,
        previewHighlight: false,
        widgetRules: [
          {
            rule: /@\S+/,
            toDOM(text) {
              const span = document.createElement('span');

              span.innerHTML = `<a href="www.google.com">${text}</a>`;
              return span;
            },
          },
        ],
      });

      const elements = editor.getEditorElements();

      mdEditor = elements.mdEditor;
      mdPreview = elements.mdPreview!;
      wwEditor = elements.wwEditor!;

      document.body.appendChild(container);
    });

    afterEach(() => {
      editor.destroy();
      document.body.removeChild(container);
    });

    describe('convertPosToMatchEditorMode', () => {
      const mdPos: [number, number] = [2, 1];
      const wwPos = 14;

      it('should convert position to match editor mode', () => {
        editor.setMarkdown('Hello World\nwelcome to the world');

        editor.changeMode('wysiwyg');
        expect(editor.convertPosToMatchEditorMode(mdPos)).toEqual([wwPos, wwPos]);

        editor.changeMode('markdown');
        expect(editor.convertPosToMatchEditorMode(wwPos)).toEqual([mdPos, mdPos]);
      });

      it('should occurs error when types of parameters is not matched', () => {
        expect(() => {
          editor.convertPosToMatchEditorMode(mdPos, wwPos);
        }).toThrowError();
      });
    });

    it('setPlaceholder()', () => {
      editor.setPlaceholder('Please input text');

      const expected = '<span class="placeholder ProseMirror-widget">Please input text</span>';

      expect(mdEditor).toContainHTML(expected);
      expect(wwEditor).toContainHTML(expected);
    });

    describe('getHTML()', () => {
      it('basic', () => {
        editor.setMarkdown('# heading\n* bullet');

        const result = oneLineTrim`
          <h1>heading</h1>
          <ul>
            <li>
              <p>bullet</p>
            </li>
          </ul>
        `;

        expect(editor.getHTML()).toBe(result);
      });

      it('should not trigger change event when the mode is wysiwyg', () => {
        const spy = jest.fn();

        editor.changeMode('wysiwyg');
        editor.on('change', spy);
        editor.getHTML();

        expect(spy).not.toHaveBeenCalled();
      });

      it('should be the same as wysiwyg contents', () => {
        const input = source`
          <p>first line</p>
          <p>second line</p>
          <p><br>\nthird line</p>
          <p><br>\n<br>\nfourth line</p>
        `;
        const expected = oneLineTrim`
          <p>first line</p>
          <p>second line</p>
          <p><br></p>
          <p>third line</p>
          <p><br></p>
          <p><br></p>
          <p>fourth line</p>
        `;

        editor.setHTML(input);

        expect(editor.getHTML()).toBe(expected);
      });

      it('placeholder should be removed', () => {
        editor.changeMode('wysiwyg');
        editor.setPlaceholder('placeholder');

        const result = oneLineTrim`
          <p><br></p>
        `;

        expect(editor.getHTML()).toBe(result);
      });
    });

    it('changeMode()', () => {
      const spy = jest.fn();

      expect(editor.isMarkdownMode()).toBe(true);
      expect(editor.isWysiwygMode()).toBe(false);

      editor.on('changeMode', spy);
      editor.changeMode('wysiwyg');

      expect(spy).toHaveBeenCalledWith('wysiwyg');
      expect(editor.isMarkdownMode()).toBe(false);
      expect(editor.isWysiwygMode()).toBe(true);
    });

    it('should keep inline math softbreak after editing in wysiwyg', () => {
      editor.setMarkdown('Inline: $a\nb$ test');
      editor.changeMode('wysiwyg');

      const doc = (editor as any).wwEditor.view.state.doc;
      let posInMath: number | null = null;

      doc.descendants((node: any, pos: number) => {
        if (!node.isText) {
          return true;
        }

        const text = node.text || '';
        const idx = text.indexOf('$a\nb$');

        if (idx >= 0) {
          posInMath = pos + idx + 2;
          return false;
        }

        return true;
      });

      expect(posInMath).not.toBeNull();
      editor.setSelection(posInMath!, posInMath!);
      editor.insertText('1');

      expect(editor.getMarkdown()).toContain('$a1\nb$');
    });

    it('should keep multiline inline latex breaks after editing in wysiwyg', () => {
      const multiline = source`
        The *Gamma function*: $\\Gamma(n) = \\begin{cases}
          \\displaystyle (n-1)!\\quad\\forall n\\in\\mathbb N\\\\
          \\displaystyle \\int_0^\\infty t^{n-1}e^{-t}dt\\quad\\forall n\\in\\mathbb R^*_+
          \\end{cases}$
      `;

      editor.setMarkdown(multiline);
      editor.changeMode('wysiwyg');

      const doc = (editor as any).wwEditor.view.state.doc;
      let posInMath: number | null = null;

      doc.descendants((node: any, pos: number) => {
        if (!node.isText) {
          return true;
        }

        const text = node.text || '';
        const idx = text.indexOf('\\begin{cases}\n');

        if (idx >= 0) {
          posInMath = pos + idx + 3;
          return false;
        }

        return true;
      });

      expect(posInMath).not.toBeNull();
      editor.setSelection(posInMath!, posInMath!);
      editor.insertText('1');

      const markdown = editor.getMarkdown();

      expect(markdown).toContain('\\be');
      expect(markdown).toContain('gin{cases}\n');
      expect(markdown).toContain('\\mathbb N\\\\\n');
      expect(markdown).toMatch(/\\mathbb N\\\\\n\s*\\\\displaystyle/);
      expect(/\n\s*\\\\displaystyle\s*\(n-1\)!\\\\quad\\\\forall n\\\\in\\\\mathbb N\\\\/.test(markdown)).toBe(
        true
      );
      expect((markdown.match(/\n/g) || []).length).toBeGreaterThanOrEqual(3);
    });

    it('should keep middle inline latex break after editing inside cases body', () => {
      const multiline = source`
        The *Gamma function*: $\\Gamma(n) = \\begin{cases}
          \\displaystyle (n-1)!\\quad\\forall n\\in\\mathbb N\\\\
          \\displaystyle \\int_0^\\infty t^{n-1}e^{-t}dt\\quad\\forall n\\in\\mathbb R^*_+
          \\end{cases}$
      `;

      editor.setMarkdown(multiline);
      editor.changeMode('wysiwyg');

      const doc = (editor as any).wwEditor.view.state.doc;
      let posInMiddleLine: number | null = null;

      doc.descendants((node: any, pos: number) => {
        if (!node.isText) {
          return true;
        }

        const text = node.text || '';
        const idx = text.indexOf('\\mathbb N\\\n\\displaystyle');

        if (idx >= 0) {
          posInMiddleLine = pos + idx + 4;
          return false;
        }

        return true;
      });

      expect(posInMiddleLine).not.toBeNull();
      editor.setSelection(posInMiddleLine!, posInMiddleLine!);
      editor.insertText('1');

      const markdown = editor.getMarkdown();

      expect(markdown).toMatch(/\\\\\n\s*\\\\displaystyle/);
      expect((markdown.match(/\n/g) || []).length).toBeGreaterThanOrEqual(3);
    });

    it('should keep break before end-cases when editing near penultimate line end', () => {
      const multiline = source`
        The *Gamma function*: $\\Gamma(n) = \\begin{cases}
          \\displaystyle (n-1)!\\quad\\forall n\\in\\mathbb N\\\\
          \\displaystyle \\int_0^\\infty t^{n-1}e^{-t}dt\\quad\\forall n\\in\\mathbb R^*_+
          \\end{cases}$
      `;

      editor.setMarkdown(multiline);
      editor.changeMode('wysiwyg');

      const doc = (editor as any).wwEditor.view.state.doc;
      let posNearPenultimateEnd: number | null = null;

      doc.descendants((node: any, pos: number) => {
        if (!node.isText) {
          return true;
        }

        const text = node.text || '';
        const idx = text.indexOf('\\mathbb R');

        if (idx >= 0) {
          posNearPenultimateEnd = pos + idx + '\\mathbb R'.length;
          return false;
        }

        return true;
      });

      expect(posNearPenultimateEnd).not.toBeNull();
      editor.setSelection(posNearPenultimateEnd!, posNearPenultimateEnd!);
      editor.insertText('1');

      const markdown = editor.getMarkdown();

      expect(markdown).toMatch(/\n\s*\\\\end\{cases\}\$/);
      expect((markdown.match(/\n/g) || []).length).toBeGreaterThanOrEqual(3);
    });

    it('should not move cursor to end when changing mode from wysiwyg to markdown', () => {
      editor.setMarkdown('line1\nline2');
      editor.changeMode('wysiwyg');
      editor.setSelection(3, 3);

      const moveCursorToEndSpy = jest.spyOn((editor as any).mdEditor, 'moveCursorToEnd');

      editor.changeMode('markdown');

      expect(moveCursorToEndSpy).not.toHaveBeenCalled();
    });

    it('should preserve mapped selection when changing mode from wysiwyg to markdown', () => {
      editor.setMarkdown('line1\nline2');
      editor.changeMode('wysiwyg');
      editor.setSelection(2, 8);

      const [from, to] = editor.getSelection() as [number, number];
      const expected = getEditorToMdPos((editor as any).wwEditor.view.state.doc, from, to);

      editor.changeMode('markdown');

      expect(editor.getSelection()).toEqual(expected);
    });

    it('should not call mdEditor.focus when changing mode from wysiwyg to markdown', () => {
      editor.setMarkdown('line1\nline2');
      editor.changeMode('wysiwyg');

      const focusSpy = jest.spyOn((editor as any).mdEditor, 'focus');

      editor.changeMode('markdown');

      expect(focusSpy).not.toHaveBeenCalled();
    });

    it('should set markdown selection without scroll when changing mode from wysiwyg', () => {
      editor.setMarkdown('line1\nline2');
      editor.changeMode('wysiwyg');
      editor.setSelection(3, 8);

      const selectionSpy = jest.spyOn((editor as any).mdEditor, 'setSelection');

      editor.changeMode('markdown');

      expect(selectionSpy).toHaveBeenCalledWith(expect.any(Array), expect.any(Array), false);
    });

    it('should preserve mapped selection when changing mode from markdown to wysiwyg', () => {
      editor.setMarkdown('line1\nline2');

      const sourceSelection: [[number, number], [number, number]] = [
        [1, 3],
        [2, 2],
      ];

      editor.setSelection(sourceSelection[0], sourceSelection[1]);
      editor.changeMode('wysiwyg');

      const expected = getMdToEditorPos(
        (editor as any).wwEditor.view.state.doc,
        sourceSelection[0],
        sourceSelection[1]
      );

      expect(editor.getSelection()).toEqual(expected);
    });

    it('should keep selection stable on ww->md mode switch for multiline fenced content', () => {
      const markdown = source`
        Intro

        \`\`\`bash
        echo first
        echo second
        \`\`\`

        Tail
      `;

      editor.setMarkdown(markdown);
      editor.setSelection([8, 3], [8, 3]);
      editor.changeMode('wysiwyg');
      editor.changeMode('markdown');

      expect(editor.getSelection()).toEqual([
        [8, 3],
        [8, 3],
      ]);
    });

    it('should keep cursor position stable on md->ww->md switch for large markdown documents', () => {
      const lines: string[] = ['# Large doc', ''];

      for (let i = 1; i <= 450; i += 1) {
        lines.push(`Section ${i}`);
        lines.push(`- item ${i}.1`);
        lines.push(`- item ${i}.2 with \`code-${i}\``);
        lines.push('');
      }

      const markdown = lines.join('\n');

      editor.setMarkdown(markdown);
      editor.setSelection([800, 12], [800, 12]);
      editor.changeMode('wysiwyg');
      editor.changeMode('markdown');

      expect(editor.getSelection()).toEqual([
        [800, 12],
        [800, 12],
      ]);
    });

    it('should preserve a blank line between a list and the following heading after md->ww->md switch', () => {
      const markdown = ['## A', '* 1', '* 2', '', '## B', '```', '1', '```'].join('\n');

      editor.setMarkdown('');
      editor.setSelection([1, 1], [1, 1]);
      editor.replaceSelection(markdown);

      expect(editor.getMarkdown().replace(/\n$/, '')).toBe(markdown);

      editor.changeMode('wysiwyg');
      editor.changeMode('markdown');

      expect(editor.getMarkdown().replace(/\n$/, '')).toBe(markdown);
      expect(editor.getMarkdown()).toContain('* 2\n\n## B');
    });

    it('should keep the list-heading separator when content is pasted in markdown then switched md->ww->md', () => {
      const markdown = ['## A', '* 1', '* 2', '', '## B', '```', '1', '```'].join('\n');
      const mdProsemirror = mdEditor.querySelector('.ProseMirror') as HTMLElement;

      editor.setMarkdown('');
      editor.setSelection([1, 1], [1, 1]);
      dispatchPlainTextPaste(mdProsemirror, markdown);

      expect(editor.getMarkdown().replace(/\n$/, '')).toBe(markdown);

      editor.changeMode('wysiwyg');
      editor.changeMode('markdown');

      expect(editor.getMarkdown().replace(/\n$/, '')).toBe(markdown);
      expect(editor.getMarkdown()).toContain('* 2\n\n## B');
    });

    it('should preserve markdown paste separators even when clipboardData.items is unavailable', () => {
      const markdown = ['## A', '* 1', '* 2', '', '## B', '```', '1', '```'].join('\n');
      const mdProsemirror = mdEditor.querySelector('.ProseMirror') as HTMLElement;

      editor.setMarkdown('');
      editor.setSelection([1, 1], [1, 1]);
      dispatchPlainTextPaste(mdProsemirror, markdown, false);

      editor.changeMode('wysiwyg');
      editor.changeMode('markdown');

      expect(editor.getMarkdown()).toContain('* 2\n\n## B');
      expect(editor.getMarkdown()).not.toContain('* 2## B');
    });

    it('should keep a blank line before heading after a wysiwyg edit near the second list item end', () => {
      const markdown = ['## A', '* 1', '* 2', '', '## B', '```', '1', '```'].join('\n');

      editor.setMarkdown(markdown);
      editor.changeMode('wysiwyg');

      const [insertPos] = editor.convertPosToMatchEditorMode([3, 4]) as [number, number];
      editor.setSelection(insertPos, insertPos);
      editor.insertText('x');
      editor.changeMode('markdown');

      const result = editor.getMarkdown();

      expect(result).toContain('* 2\n\n## B');
      expect(result).not.toContain('* 2## B');
    });

    it('should keep a blank line before heading after editing the second list item in markdown', () => {
      const markdown = ['## A', '* 1', '* 2', '', '## B', '```', '1', '```'].join('\n');

      editor.setMarkdown(markdown);
      editor.setSelection([3, 4], [3, 4]);
      editor.insertText('x');
      editor.changeMode('wysiwyg');
      editor.changeMode('markdown');

      const result = editor.getMarkdown();

      expect(result).toContain('* 2x\n\n## B');
      expect(result).not.toContain('* 2x## B');
    });

    it('should keep list-heading separator after a prior md->ww->md cycle and markdown edit', () => {
      const markdown = ['## A', '* 1', '* 2', '', '## B', '```', '1', '```'].join('\n');

      editor.setMarkdown(markdown);
      editor.changeMode('wysiwyg');
      editor.changeMode('markdown');
      editor.setSelection([3, 4], [3, 4]);
      editor.insertText('x');
      editor.changeMode('wysiwyg');
      editor.changeMode('markdown');

      const result = editor.getMarkdown();

      expect(result).toContain('* 2x\n\n## B');
      expect(result).not.toContain('* 2x## B');
    });

    it('should set wysiwyg selection without scroll when changing mode from markdown', () => {
      editor.setMarkdown('line1\nline2');
      editor.setSelection([1, 3], [2, 2]);

      const selectionSpy = jest.spyOn((editor as any).wwEditor, 'setSelection');

      editor.changeMode('wysiwyg');

      expect(selectionSpy).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), false);
    });

    it('changePreviewStyle()', () => {
      const spy = jest.fn();

      expect(editor.getCurrentPreviewStyle()).toBe('tab');

      editor.on('changePreviewStyle', spy);
      editor.changePreviewStyle('vertical');

      expect(spy).toHaveBeenCalledWith('vertical');
      expect(editor.getCurrentPreviewStyle()).toBe('vertical');
    });

    describe('setMarkdown()', () => {
      it('basic', () => {
        editor.setMarkdown('# heading');

        expect(mdEditor).toContainHTML(
          `<div><span class="${HEADING_CLS}"><span class="${DELIM_CLS}">#</span> heading</span></div>`
        );
        expect(getPreviewHTML()).toBe('<h1>heading</h1>');
      });

      it('should parse the CRLF properly in markdown', () => {
        editor.setMarkdown('# heading\r\nCRLF');

        expect(mdEditor).toContainHTML(
          `<div><span class="${HEADING_CLS}"><span class="${DELIM_CLS}">#</span> heading</span></div><div>CRLF</div>`
        );
        expect(getPreviewHTML()).toBe('<h1>heading</h1><p>CRLF</p>');
      });

      it('should render images with no-referrer policy in markdown and wysiwyg', () => {
        editor.setMarkdown('![imgur](https://i.imgur.com/9cgQVqD.png)');

        const previewImg = mdPreview.querySelector('img') as HTMLImageElement;

        expect(previewImg.getAttribute('referrerpolicy')).toBe('no-referrer');

        editor.changeMode('wysiwyg');

        const wwImg = wwEditor.querySelector('img') as HTMLImageElement;

        expect(wwImg.getAttribute('referrerpolicy')).toBe('no-referrer');
      });

      it('should support markdown image size shorthand =WxH in markdown and wysiwyg', () => {
        const markdown = '![Minion](https://octodex.github.com/images/minion.png =200x200)';

        editor.setMarkdown(markdown);

        const previewImg = mdPreview.querySelector('img') as HTMLImageElement;

        expect(previewImg.getAttribute('width')).toBe('200');
        expect(previewImg.getAttribute('height')).toBe('200');
        expect(previewImg.getAttribute('title')).toBeNull();

        editor.changeMode('wysiwyg');

        const wwImg = wwEditor.querySelector('img') as HTMLImageElement;

        expect(wwImg.getAttribute('width')).toBe('200');
        expect(wwImg.getAttribute('height')).toBe('200');
        expect(editor.getMarkdown()).toContain('![Minion](https://octodex.github.com/images/minion.png =200x200)');
      });

      it('should keep ```! as wrapped code block when changing to wysiwyg', () => {
        const markdown = source`
          \`\`\`!
          first line
          second line
          \`\`\`
        `;

        editor.setMarkdown(markdown);
        editor.changeMode('wysiwyg');

        const wwDoc = (editor as any).wwEditor.view.state.doc.toJSON() as {
          content?: Array<{ type?: string; attrs?: Record<string, any> }>;
        };
        const codeBlock = wwDoc.content?.find((node) => node.type === 'codeBlock');

        expect(codeBlock?.attrs?.lineWrap).toBe(true);
        expect(codeBlock?.attrs?.language).toBeNull();
      });
    });

    describe('setHTML()', () => {
      it('basic', () => {
        editor.setHTML('<h1>heading</h1>');

        expect(mdEditor).toContainHTML(
          `<div><span class="${HEADING_CLS}"><span class="${DELIM_CLS}">#</span> heading</span></div>`
        );
        expect(getPreviewHTML()).toBe('<h1>heading</h1>');
      });

      it('should parse the br tag as the empty block to separate between blocks', () => {
        editor.setHTML('<p>a<br/>b</p>');

        expect(mdEditor).toContainHTML('<div>a</div><div>b</div>');
        expect(getPreviewHTML()).toBe('<p>a<br>b</p>');
      });

      it('should parse the br tag with the paragraph block to separate between blocks in wysiwyg', () => {
        editor.setHTML(
          '<h1>test title</h1><p><strong>test bold</strong><br><em>test italic</em><br>normal text</p>'
        );
        editor.changeMode('wysiwyg');

        const expected = oneLineTrim`
          <h1>test title</h1>
          <p><strong>test bold</strong></p>
          <p><em>test italic</em></p>
          <p>normal text</p>
        `;

        expect(wwEditor).toContainHTML(expected);
      });

      it('should parse the br tag with the paragraph block to separate between blocks', () => {
        const input = source`
          <p>first line</p>
          <p>second line</p>
          <p><br>\nthird line</p>
          <p><br>\n<br>\nfourth line</p>
        `;
        const expected = oneLineTrim`
          <p>first line<br>second line</p>
          <p>third line</p>
          <p><br>fourth line</p>
        `;

        editor.setHTML(input);

        expect(getPreviewHTML()).toBe(expected);
      });

      it('should convert single empty paragraph to markdown blank line without <br>', () => {
        const input = source`
          <p>first line</p>
          <p><br></p>
          <p>second line</p>
        `;

        editor.setHTML(input);

        expect(editor.getMarkdown()).toBe('first line\n\nsecond line');
      });

      it('should keep an empty inline code pair as plain double backticks in markdown', () => {
        editor.setHTML('<p>``</p>');

        expect(editor.getMarkdown()).toBe('``');
      });

      it('should still escape a single backtick in markdown text', () => {
        editor.setHTML('<p>`</p>');

        expect(editor.getMarkdown()).toBe('\\`');
      });

      it('should be parsed with the same content when calling setHTML() with getHTML() API result', () => {
        const input = source`
          <p>first line</p>
          <p>second line</p>
          <p><br>\nthird line</p>
          <p><br>\n<br>\nfourth line</p>
        `;

        editor.setHTML(input);

        const mdEditorHTML = mdEditor.innerHTML;
        const mdPreviewHTML = getPreviewHTML();

        editor.setHTML(editor.getHTML());

        expect(mdEditor).toContainHTML(mdEditorHTML);
        expect(getPreviewHTML()).toBe(mdPreviewHTML);
      });
    });

    it('reset()', () => {
      editor.setMarkdown('# heading');
      editor.reset();

      expect(mdEditor).not.toContainHTML(
        `<div><span class="${HEADING_CLS}"><span class="${DELIM_CLS}">#</span> heading</span></div>`
      );
      expect(getPreviewHTML()).toBe('');
    });

    describe('setMinHeight()', () => {
      it('should set height with pixel option', () => {
        editor.setMinHeight('200px');

        expect(mdEditor).toHaveStyle({ minHeight: '200px' });
        expect(mdPreview).toHaveStyle({ minHeight: '200px' });
        expect(wwEditor).toHaveStyle({ minHeight: '200px' });
      });

      it('should be less than the editor height', () => {
        editor.setMinHeight('400px');

        expect(mdEditor).toHaveStyle({ minHeight: '225px' });
        expect(mdPreview).toHaveStyle({ minHeight: '225px' });
        expect(wwEditor).toHaveStyle({ minHeight: '225px' });
      });
    });

    describe('setHeight()', () => {
      it('should set height with pixel option', () => {
        editor.setHeight('300px');

        expect(container).not.toHaveClass('auto-height');
        expect(container).toHaveStyle({ height: '300px' });
        expect(mdEditor).toHaveStyle({ minHeight: '200px' });
        expect(mdPreview).toHaveStyle({ minHeight: '200px' });
        expect(wwEditor).toHaveStyle({ minHeight: '200px' });
      });

      it('should set height with auto option', () => {
        editor.setHeight('auto');

        expect(container).toHaveClass('auto-height');
        expect(container).toHaveStyle({ height: 'auto' });
        expect(mdEditor).toHaveStyle({ minHeight: '200px' });
        expect(mdPreview).toHaveStyle({ minHeight: '200px' });
        expect(wwEditor).toHaveStyle({ minHeight: '200px' });
      });
    });

    it('addWidget()', () => {
      const node = document.createElement('div');

      node.innerHTML = 'widget';

      editor.addWidget(node, 'top');

      expect(document.body).toContainElement(node);

      editor.changeMode('wysiwyg');

      expect(document.body).not.toContainElement(node);
    });

    describe('replaceWithWidget()', () => {
      it('in markdown', () => {
        editor.replaceWithWidget([1, 1], [1, 1], '@test');

        const expectedEditor = oneLineTrim`
          <span class="tui-widget">
            <span><a href="www.google.com">@test</a></span>
          </span>
        `;
        const expectedPreview = oneLineTrim`
          <p>
            <span class="tui-widget">
              <span><a href="www.google.com">@test</a></span>
            </span>
          </p>
        `;

        expect(mdEditor).toContainHTML(expectedEditor);
        expect(getPreviewHTML()).toBe(expectedPreview);
      });

      it('in wysiwyg', () => {
        editor.changeMode('wysiwyg');
        editor.replaceWithWidget(1, 1, '@test');

        const expected = oneLineTrim`
          <span class="tui-widget">
            <span><a href="www.google.com">@test</a></span>
          </span>
        `;

        expect(wwEditor).toContainHTML(expected);
      });
    });

    it('exec()', () => {
      // @ts-ignore
      jest.spyOn(editor.commandManager, 'exec');

      editor.exec('bold');

      // @ts-ignore
      // eslint-disable-next-line no-undefined
      expect(editor.commandManager.exec).toHaveBeenCalledWith('bold', undefined);
    });

    it('should clear inline style attrs in selected wysiwyg content', () => {
      editor.setMarkdown('Alpha Beta');
      editor.changeMode('wysiwyg');

      // @ts-ignore
      const wwView = editor.wwEditor.view;
      let paragraphPos = -1;

      wwView.state.doc.descendants((node: any, pos: number) => {
        if (paragraphPos < 0 && node.type.name === 'paragraph') {
          paragraphPos = pos;
          return false;
        }
        return true;
      });

      expect(paragraphPos).toBeGreaterThanOrEqual(0);

      const paragraph = wwView.state.doc.nodeAt(paragraphPos);

      expect(paragraph).not.toBeNull();

      const tr = wwView.state.tr;

      tr.setNodeMarkup(paragraphPos, null, {
        ...paragraph!.attrs,
        htmlAttrs: {
          ...(paragraph!.attrs.htmlAttrs || {}),
          style: 'font-family:Papyrus;color:#f00;',
        },
      });
      wwView.dispatch(tr);

      expect(editor.getHTML()).toContain('style=');

      editor.exec('selectAll');
      editor.exec('clearStyle');

      expect(editor.getHTML()).toContain('Alpha');
      expect(editor.getHTML()).toContain('Beta');
      expect(editor.getHTML()).not.toContain('style=');
      expect(() => editor.getMarkdown()).not.toThrow();
    });

    it('should not throw clearStyle command in markdown mode', () => {
      editor.setMarkdown('line');

      expect(() => editor.exec('clearStyle')).not.toThrow();
    });

    it('addCommand()', () => {
      const spy = jest.fn();
      // @ts-ignore
      const { view } = editor.mdEditor;
      const { state, dispatch } = view;

      editor.addCommand('markdown', 'custom', spy);
      editor.exec('custom', { prop: 'prop' });

      expect(spy).toHaveBeenCalledWith({ prop: 'prop' }, state, dispatch, view);
      expect(spy).toHaveBeenCalled();
    });

    it('should be triggered only once when the event registered by addHook()', () => {
      const spy = jest.fn();
      const { eventEmitter } = editor;

      eventEmitter.addEventType('custom');

      editor.addHook('custom', spy);
      editor.addHook('custom', spy);

      eventEmitter.emit('custom');

      expect(spy).toHaveBeenCalledTimes(1);
    });

    describe('insertText()', () => {
      it('in markdown', () => {
        editor.insertText('test');

        expect(mdEditor).toContainHTML('<div>test</div>');
        expect(getPreviewHTML()).toBe('<p>test</p>');
      });

      it('in wysiwyg', () => {
        editor.changeMode('wysiwyg');
        editor.insertText('test');

        expect(wwEditor).toContainHTML('<p>test</p>');
      });
    });

    describe('setSelection(), getSelection()', () => {
      it('in markdown', () => {
        expect(editor.getSelection()).toEqual([
          [1, 1],
          [1, 1],
        ]);

        editor.setMarkdown('line1\nline2');
        editor.setSelection([1, 2], [2, 4]);

        expect(editor.getSelection()).toEqual([
          [1, 2],
          [2, 4],
        ]);
      });

      it('in wysiwyg', () => {
        editor.changeMode('wysiwyg');

        expect(editor.getSelection()).toEqual([1, 1]);

        editor.setMarkdown('line1\nline2');
        editor.setSelection(2, 8);

        expect(editor.getSelection()).toEqual([2, 8]);
      });
    });

    describe('getSelectedText()', () => {
      beforeEach(() => {
        editor.setMarkdown('line1\nline2');
        editor.setSelection([1, 2], [2, 4]);
      });

      it('in markdown', () => {
        expect(editor.getSelectedText()).toEqual('ine1\nlin');
        expect(editor.getSelectedText([1, 2], [2, 6])).toEqual('ine1\nline2');
      });

      it('in wysiwyg', () => {
        editor.changeMode('wysiwyg');
        editor.setSelection(2, 11);

        expect(editor.getSelectedText()).toEqual('ine1\nlin');
        expect(editor.getSelectedText(2, 13)).toEqual('ine1\nline2');
      });
    });

    describe('replaceSelection()', () => {
      beforeEach(() => {
        editor.setMarkdown('line1\nline2');
        editor.setSelection([1, 2], [2, 4]);
      });

      it('should replace current selection in markdown', () => {
        editor.replaceSelection('Replaced');

        expect(mdEditor).toContainHTML('<div>lReplacede2</div>');
        expect(getPreviewHTML()).toBe('<p>lReplacede2</p>');
      });

      it('should replace current selection in wysiwyg', () => {
        editor.changeMode('wysiwyg');
        editor.setSelection(2, 11);
        editor.replaceSelection('Replaced');

        expect(wwEditor).toContainHTML('<p>lReplacede2</p>');
      });

      it('should replace given selection in markdown', () => {
        editor.replaceSelection('Replaced', [1, 1], [2, 1]);

        expect(mdEditor).toContainHTML('<div>Replacedline2</div>');
        expect(getPreviewHTML()).toBe('<p>Replacedline2</p>');
      });

      it('should replace given selection in wysiwyg', () => {
        editor.changeMode('wysiwyg');
        editor.replaceSelection('Replaced', 1, 7);

        expect(wwEditor).toContainHTML('<p>Replaced</p><p>line2</p>');
      });

      it('should parse the CRLF properly in markdown', () => {
        editor.replaceSelection('text\r\nCRLF');

        expect(mdEditor).toContainHTML('<div>ltext</div><div>CRLFe2</div>');
        expect(getPreviewHTML()).toBe('<p>ltext<br>CRLFe2</p>');
      });
    });

    describe('paste markdown in wysiwyg', () => {
      it('should append a second markdown paste after multiline fenced content without splitting first paste', () => {
        const first = source`
          Debian setup

          \`\`\`bash
          sudo apt update
          sudo apt install -y ca-certificates curl gnupg
          sudo install -m 0755 -d /etc/apt/keyrings
          \`\`\`

          Continue
        `;
        const second = source`
          Keycloak setup

          \`\`\`bash
          docker compose up -d
          docker compose ps
          \`\`\`

          Done
        `;

        editor.changeMode('wysiwyg');

        const firstHandled = (editor as any).eventEmitter
          .emit('pasteMarkdownInWysiwyg', first)
          .some(Boolean);
        const secondHandled = (editor as any).eventEmitter
          .emit('pasteMarkdownInWysiwyg', second)
          .some(Boolean);

        expect(firstHandled).toBe(true);
        expect(secondHandled).toBe(true);
        expect(editor.getMarkdown()).toBe(`${first}${second}`);
      });

      it('should keep insertion position after adding blank lines before second markdown paste', () => {
        const first = source`
          Intro

          \`\`\`bash
          echo 1
          \`\`\`

          Tail
        `;
        const second = source`
          Next

          \`\`\`bash
          echo 2
          \`\`\`
        `;

        editor.changeMode('wysiwyg');
        (editor as any).eventEmitter.emit('pasteMarkdownInWysiwyg', first).some(Boolean);
        editor.replaceSelection('\n\n');
        (editor as any).eventEmitter.emit('pasteMarkdownInWysiwyg', second).some(Boolean);

        const markdown = editor.getMarkdown();

        expect(markdown).toContain('```bash\necho 1\n```');
        expect(markdown).toContain('Tail');
        expect(markdown).toContain('```bash\necho 2\n```');
        expect(markdown).toContain('Next');
        expect(markdown.indexOf('Tail')).toBeLessThan(markdown.indexOf('Next'));
      });

      it('should insert markdown paste at the current middle cursor position in wysiwyg', () => {
        const first = 'START\nmiddle\nEND';
        const second = 'X\nY';

        editor.changeMode('wysiwyg');
        (editor as any).eventEmitter.emit('pasteMarkdownInWysiwyg', first).some(Boolean);
        editor.changeMode('markdown');
        editor.setSelection([2, 4], [2, 4]);
        editor.changeMode('wysiwyg');
        (editor as any).eventEmitter.emit('pasteMarkdownInWysiwyg', second).some(Boolean);

        expect(editor.getMarkdown()).toBe('START\nmidX\nYdle\nEND');
      });

      it('should keep footnote markdown syntax without transforming to rendered html', () => {
        const footnoteMd = source`
          Footnote 1 link[^first].

          [^first]: Footnote text.
        `;

        editor.changeMode('wysiwyg');

        const handled = (editor as any).eventEmitter
          .emit('pasteMarkdownInWysiwyg', footnoteMd)
          .some(Boolean);

        expect(handled).toBe(true);
        expect(editor.getMarkdown()).toContain('Footnote 1 link[^first].');
        expect(editor.getMarkdown()).toContain('[^first]: Footnote text.');
        expect(editor.getMarkdown()).not.toContain('<sup class="footnote-ref">');
      });

      it('should preserve footnote markdown syntax after wysiwyg edits and mode switch', () => {
        const footnoteMd = source`
          Footnote 1 link[^first].

          [^first]: Footnote text.
        `;

        editor.setMarkdown(footnoteMd);
        editor.changeMode('wysiwyg');
        editor.setSelection(1, 1);
        editor.replaceSelection('Edited ');
        editor.changeMode('markdown');

        const markdown = editor.getMarkdown();

        expect(markdown).toContain('Edited Footnote 1 link[^first].');
        expect(markdown).toContain('[^first]: Footnote text.');
        expect(markdown).not.toContain('<sup class="footnote-ref">');
        expect(markdown).not.toContain('<a id="fn-first">');
      });

      it('should refresh markdown preview even when markdown has transformed footnote markup', () => {
        const transformed = source`
          Footnote 1 link<sup class="footnote-ref"><a id="fnref-first-1" href="#fn-first">1</a></sup>.

          ---

          #### Footnotes

          1. <a id="fn-first">[1]</a> Footnote text. [↩](#fnref-first-1)
        `;

        editor.setMarkdown(transformed);
        editor.replaceSelection('Updated ', [1, 1], [1, 1]);

        expect(getPreviewHTML()).toContain('<p>Updated Footnote 1 link');
      });

      it('should clear preview after deleting all markdown from a transformed footnote document', () => {
        const markdown = source`
          \`\`\`chart
          Месяц,План,Факт
          янв,1000,800
          фев,2500,2100
          мар,5000,4900

          type: line
          \`\`\`

          Footnote 1 link[^first].

          [^first]: Footnote text.
        `;

        editor.setMarkdown(markdown);
        expect(getPreviewHTML()).toContain('<h4>Footnotes</h4>');

        const lines = editor.getMarkdown().split('\n');
        const endLine = lines.length;
        const endCh = (lines[endLine - 1] || '').length + 1;

        editor.deleteSelection([1, 1], [endLine, endCh]);

        expect(editor.getMarkdown().trim()).toBe('');
        expect(getPreviewHTML()).not.toContain('<h4>Footnotes</h4>');
        expect(getPreviewHTML()).toBe('');
      });
    });

    describe('deleteSelection()', () => {
      beforeEach(() => {
        editor.setMarkdown('line1\nline2');
        editor.setSelection([1, 2], [2, 4]);
      });

      it('should delete current selection in markdown', () => {
        editor.deleteSelection();

        expect(mdEditor).toContainHTML('<div>le2</div>');
        expect(getPreviewHTML()).toBe('<p>le2</p>');
      });

      it('should delete current selection in wysiwyg', () => {
        editor.changeMode('wysiwyg');
        editor.setSelection(2, 11);
        editor.deleteSelection();

        expect(wwEditor).toContainHTML('<p>le2</p>');
      });

      it('should delete given selection in markdown', () => {
        editor.deleteSelection([1, 1], [2, 1]);

        expect(mdEditor).toContainHTML('<div>line2</div>');
        expect(getPreviewHTML()).toBe('<p>line2</p>');
      });

      it('should delete given selection in wysiwyg', () => {
        editor.changeMode('wysiwyg');
        editor.deleteSelection(1, 7);

        expect(wwEditor).toContainHTML('<p>line2</p>');
      });
    });

    describe('getRangeOfNode()', () => {
      beforeEach(() => {
        editor.setMarkdown('line1\nline2 **strong**');
        editor.setSelection([2, 10], [2, 12]);
      });

      it('should get the range of the current selected node in markdown', () => {
        const rangeInfo = editor.getRangeInfoOfNode();
        const [start, end] = rangeInfo.range;

        expect(rangeInfo).toEqual({
          range: [
            [2, 7],
            [2, 17],
          ],
          type: 'strong',
        });

        editor.replaceSelection('Replaced', start, end);

        expect(getPreviewHTML()).toBe('<p>line1<br>line2 Replaced</p>');
      });

      it('should get the range of the current selected node in wysiwyg', () => {
        editor.changeMode('wysiwyg');
        editor.setSelection(15, 15);

        const rangeInfo = editor.getRangeInfoOfNode();
        const [start, end] = rangeInfo.range;

        expect(rangeInfo).toEqual({ range: [14, 20], type: 'strong' });

        editor.replaceSelection('Replaced', start, end);

        expect(wwEditor).toContainHTML('<p>line1</p><p>line2 Replaced</p>');
      });

      it('should get the range of selection with given position in markdown', () => {
        const rangeInfo = editor.getRangeInfoOfNode([2, 2]);
        const [start, end] = rangeInfo.range;

        expect(rangeInfo).toEqual({
          range: [
            [2, 1],
            [2, 7],
          ],
          type: 'text',
        });

        editor.replaceSelection('Replaced', start, end);

        expect(getPreviewHTML()).toBe('<p>line1<br>Replaced<strong>strong</strong></p>');
      });

      it('should get the range of selection with given position in wysiwyg', () => {
        editor.changeMode('wysiwyg');

        const rangeInfo = editor.getRangeInfoOfNode(10);
        const [start, end] = rangeInfo.range;

        expect(rangeInfo).toEqual({ range: [8, 14], type: 'text' });

        editor.replaceSelection('Replaced', start, end);

        expect(wwEditor).toContainHTML('<p>line1</p><p>Replaced<strong>strong</strong></p>');
      });
    });
  });

  describe('static API', () => {
    it('factory()', () => {
      const editorInst = Editor.factory({ el: document.createElement('div'), viewer: false });
      const viewerInst = Editor.factory({ el: document.createElement('div'), viewer: true });

      expect(editorInst).toBeInstanceOf(Editor);
      expect(viewerInst).toBeInstanceOf(Viewer);
    });

    it('setLanguage()', () => {
      const data = {};

      jest.spyOn(i18n, 'setLanguage');

      Editor.setLanguage('ko', data);

      expect(i18n.setLanguage).toHaveBeenCalledWith('ko', data);
    });
  });

  describe('options', () => {
    beforeEach(() => {
      container = document.createElement('div');

      document.body.appendChild(container);
    });

    afterEach(() => {
      editor.destroy();
      document.body.removeChild(container);
    });

    function createEditor(options: EditorOptions) {
      editor = new Editor(options);

      const elements = editor.getEditorElements();

      mdEditor = elements.mdEditor;
      mdPreview = elements.mdPreview!;
      wwEditor = elements.wwEditor!;
    }

    describe('plugins', () => {
      it('should invoke plugin functions', () => {
        const fooPlugin = jest.fn().mockReturnValue({});
        const barPlugin = jest.fn().mockReturnValue({});

        createEditor({ el: container, plugins: [fooPlugin, barPlugin] });

        // @ts-ignore
        const { eventEmitter } = editor;

        expect(fooPlugin).toHaveBeenCalledWith(expect.objectContaining({ eventEmitter }));
        expect(barPlugin).toHaveBeenCalledWith(expect.objectContaining({ eventEmitter }));
      });

      it('should invoke plugin function with options of plugin', () => {
        const plugin = jest.fn().mockReturnValue({});
        const options = {};

        createEditor({ el: container, plugins: [[plugin, options]] });

        // @ts-ignore
        const { eventEmitter } = editor;

        expect(plugin).toHaveBeenCalledWith(
          expect.objectContaining({ eventEmitter }),
          expect.objectContaining(options)
        );
      });

      it(`should add command to command manager when plugin return 'markdownCommands' value`, () => {
        const spy = jest.fn();
        const plugin = () => {
          return {
            markdownCommands: {
              foo: () => {
                spy();
                return true;
              },
            },
          };
        };

        createEditor({ el: container, plugins: [plugin] });

        editor.exec('foo');

        expect(spy).toHaveBeenCalled();
      });

      it(`should add command to command manager when plugin return 'wysiwygCommands' value`, () => {
        const spy = jest.fn();
        const plugin = () => {
          return {
            wysiwygCommands: {
              foo: () => {
                spy();
                return true;
              },
            },
          };
        };

        createEditor({ el: container, plugins: [plugin] });

        editor.changeMode('wysiwyg');
        editor.exec('foo');

        expect(spy).toHaveBeenCalled();
      });

      it(`should add toolbar item when plugin return 'toolbarItems' value`, () => {
        const toolbarItem = {
          name: 'color',
          tooltip: 'Text color',
          className: 'toastui-editor-toolbar-icons color',
        };
        const plugin = () => {
          return {
            toolbarItems: [{ groupIndex: 1, itemIndex: 2, item: toolbarItem }],
          };
        };

        createEditor({ el: container, plugins: [plugin] });

        const toolbar = document.querySelector(`.${cls('toolbar-icons.color')}`);

        expect(toolbar).toBeInTheDocument();
      });
    });

    describe('usageStatistics', () => {
      it('should send request hostname in payload by default', () => {
        spyOn(commonUtil, 'sendHostName');

        createEditor({ el: container });

        expect(commonUtil.sendHostName).toHaveBeenCalled();
      });

      it('should not send request if the option is set to false', () => {
        spyOn(commonUtil, 'sendHostName');

        createEditor({ el: container, usageStatistics: false });

        expect(commonUtil.sendHostName).not.toHaveBeenCalled();
      });
    });

    describe('hideModeSwitch', () => {
      it('should hide mode switch if the option value is true', () => {
        createEditor({ el: container, hideModeSwitch: true });

        const modeSwitch = document.querySelector(`.${cls('mode-switch')}`);

        expect(modeSwitch).not.toBeInTheDocument();
      });
    });

    describe('extendedAutolinks option', () => {
      it('should convert url-like strings to anchor tags', () => {
        createEditor({
          el: container,
          initialValue: 'http://nhn.com',
          extendedAutolinks: true,
          previewHighlight: false,
        });

        expect(getPreviewHTML()).toBe('<p><a href="http://nhn.com">http://nhn.com</a></p>');
      });
    });

    describe('disallowDeepHeading internal parsing option', () => {
      it('should disallow the nested seTextHeading in list', () => {
        createEditor({
          el: container,
          initialValue: '- item1\n\t-',
          previewHighlight: false,
        });

        const result = oneLineTrim`
          <ul>
            <li>
              <p>item1<br>
              -</p>
            </li>
          </ul>
        `;

        expect(getPreviewHTML()).toBe(result);
      });

      it('should disallow the nested atxHeading in list', () => {
        createEditor({
          el: container,
          initialValue: '- # item1',
          previewHighlight: false,
        });

        const result = oneLineTrim`
          <ul>
            <li>
              <p># item1</p>
            </li>
          </ul>
        `;

        expect(getPreviewHTML()).toBe(result);
      });

      it('should disallow the nested seTextHeading in blockquote', () => {
        createEditor({
          el: container,
          initialValue: '> item1\n> -',
          previewHighlight: false,
        });

        const result = oneLineTrim`
          <blockquote>
            <p>item1<br>
            -</p>
          </blockquote>
        `;

        expect(getPreviewHTML()).toBe(result);
      });

      it('should disallow the nested atxHeading in blockquote', () => {
        createEditor({
          el: container,
          initialValue: '> # item1',
          previewHighlight: false,
        });

        const result = oneLineTrim`
          <blockquote>
            <p># item1</p>
          </blockquote>
        `;

        expect(getPreviewHTML()).toBe(result);
      });
    });

    describe('frontMatter option', () => {
      it('should parse the front matter as the paragraph in WYSIWYG', () => {
        createEditor({
          el: container,
          frontMatter: true,
          initialValue: '---\ntitle: front matter\n---',
          initialEditType: 'wysiwyg',
        });

        const result = stripIndents`
          <div data-front-matter="true">---
          title: front matter
          ---</div>
        `;

        expect(wwEditor).toContainHTML(result);
      });

      it('should keep the front matter after changing the mode', () => {
        createEditor({
          el: container,
          frontMatter: true,
          initialEditType: 'wysiwyg',
          initialValue: '---\ntitle: front matter\n---',
        });

        editor.changeMode('markdown');

        expect(editor.getMarkdown()).toBe('---\ntitle: front matter\n---');
      });
    });

    describe('customHTMLSanitizer option', () => {
      it('should replace default sanitizer with custom sanitizer', () => {
        const customHTMLSanitizer = jest.fn();

        createEditor({ el: container, customHTMLSanitizer });

        editor.changeMode('wysiwyg');

        expect(customHTMLSanitizer).toHaveBeenCalled();
      });
    });

    describe('customHTMLRenderer', () => {
      it('should pass customHTMLRender option for creating convertor instance', () => {
        createEditor({
          el: container,
          initialValue: 'Hello World',
          previewHighlight: false,
          customHTMLRenderer: {
            paragraph(_, { entering, origin }) {
              const result = origin!() as OpenTagToken;

              if (entering) {
                result.classNames = ['my-class'];
              }

              return result;
            },
          },
        });

        expect(getPreviewHTML()).toBe('<p class="my-class">Hello World</p>');
      });

      it('linkAttributes option should be applied to original renderer', () => {
        createEditor({
          el: container,
          initialValue: '[Hello](nhn.com)',
          linkAttributes: { target: '_blank' },
          previewHighlight: false,
          customHTMLRenderer: {
            link(_, { origin }) {
              return origin!();
            },
          },
        });

        expect(getPreviewHTML()).toBe('<p><a target="_blank" href="nhn.com">Hello</a></p>');
      });

      it('should render html block node regardless of the sanitizer', () => {
        createEditor({
          el: container,
          initialValue:
            '<iframe width="420" height="315" src="https://www.youtube.com/embed/XyenY12fzAk"></iframe>\n\ntest',
          previewHighlight: false,
          // add iframe html block renderer
          customHTMLRenderer: createHTMLrenderer(),
        });

        const result = oneLineTrim`
          <iframe src="https://www.youtube.com/embed/XyenY12fzAk" height="315" width="420"></iframe>
          <p>test</p>
        `;

        expect(getPreviewHTML()).toBe(result);
      });

      it('should keep the html block node after changing the mode', () => {
        createEditor({
          el: container,
          initialValue:
            '<iframe width="420" height="315" src="https://www.youtube.com/embed/XyenY12fzAk"></iframe>\n\ntest',
          previewHighlight: false,
          // add iframe html block renderer
          customHTMLRenderer: createHTMLrenderer(),
        });

        editor.changeMode('wysiwyg');

        const result = oneLineTrim`
          <iframe width="420" height="315" src="https://www.youtube.com/embed/XyenY12fzAk" class="html-block"></iframe>
          <p>test</p>
        `;

        expect(wwEditor.innerHTML).toContain(result);
      });

      it('should keep the html attributes with an empty string after changing the mode', () => {
        createEditor({
          el: container,
          initialValue: '<iframe width="" height="" src=""></iframe>',
          previewHighlight: false,
          // add iframe html block renderer
          customHTMLRenderer: createHTMLrenderer(),
        });

        editor.changeMode('wysiwyg');

        const result = oneLineTrim`
          <iframe width="" height="" src="" class="html-block"></iframe>
        `;

        expect(wwEditor.innerHTML).toContain(result);
      });

      it('should unwrap empty span html-inline mark after clearStyle', () => {
        createEditor({
          el: container,
          initialValue: '<span style="font-family:Papyrus;">Brand Lift</span>',
          customHTMLRenderer: {
            htmlInline: {
              // @ts-ignore
              span(node: any, { entering }: any) {
                return entering
                  ? { type: 'openTag', tagName: 'span', attributes: node.attrs }
                  : { type: 'closeTag', tagName: 'span' };
              },
            },
          },
        });

        editor.changeMode('wysiwyg');
        editor.exec('selectAll');
        editor.exec('clearStyle');

        expect(editor.getMarkdown()).toBe('Brand Lift');
        expect(editor.getHTML()).toContain('Brand Lift');
        expect(editor.getHTML()).not.toContain('<span');
      });
    });

    describe('hooks option', () => {
      const defaultImageBlobHookSpy = jest.fn();

      function mockDefaultImageBlobHook() {
        defaultImageBlobHookSpy.mockReset();

        jest
          .spyOn(imageHelper, 'addDefaultImageBlobHook')
          .mockImplementation((emitter: Emitter) => {
            emitter.listen('addImageBlobHook', defaultImageBlobHookSpy);
          });
      }

      it('should remove default `addImageBlobHook` event handler after registering hook', () => {
        const spy = jest.fn();

        mockDefaultImageBlobHook();

        createEditor({
          el: container,
          hooks: {
            addImageBlobHook: spy,
          },
        });

        editor.eventEmitter.emit('addImageBlobHook');

        expect(spy).toHaveBeenCalled();
        expect(defaultImageBlobHookSpy).not.toHaveBeenCalled();
      });

      it('should resolve media paths through `resolveMediaPath` hook in preview', () => {
        createEditor({
          el: container,
          previewHighlight: false,
          initialValue: stripIndents`
            ![image](~/Downloads/demo.png)

            ![audio](~/Downloads/demo.m4a)
          `,
          hooks: {
            resolveMediaPath: (source: string, mediaType: string) =>
              `/__local_media?path=${encodeURIComponent(source)}&type=${encodeURIComponent(
                mediaType
              )}`,
          },
        });

        const html = getPreviewHTML();

        expect(html).toContain(
          'src="/__local_media?path=~%2FDownloads%2Fdemo.png&amp;type=image"'
        );
        expect(html).toContain(
          'src="/__local_media?path=~%2FDownloads%2Fdemo.m4a&amp;type=audio"'
        );
      });
    });
  });
});
