import { source } from 'common-tags';
import type { Node as ProsemirrorNode } from 'prosemirror-model';

import Editor from '@techie_doubts/tui.editor.2026';
import codeSyntaxHighlightPlugin from '@/index';

import Prism from 'prismjs';
import 'prismjs/components/prism-yaml.js';

describe('codeSyntaxHighlightPlugin', () => {
  let container: HTMLElement, mdPreview: HTMLElement, wwEditor: HTMLElement, editor: Editor;

  const initialValue = source`
    \`\`\`yaml
    martin:
      name: Martin D'vloper
      job: Developer
      skill: Elite
    \`\`\`
  `;

  function getPreviewHTML() {
    return mdPreview
      .querySelector('.toastui-editor-contents')!
      .innerHTML.replace(/\sdata-nodeid="\d+"|\n/g, '')
      .trim();
  }

  function getWwEditorHTML() {
    return wwEditor.firstElementChild!.innerHTML;
  }

  beforeEach(() => {
    container = document.createElement('div');
    editor = new Editor({
      el: container,
      previewStyle: 'vertical',
      initialValue,
      plugins: [[codeSyntaxHighlightPlugin, { highlighter: Prism }]],
    });

    const elements = editor.getEditorElements();

    mdPreview = elements.mdPreview!;
    wwEditor = elements.wwEditor!;

    document.body.appendChild(container);
  });

  afterEach(() => {
    editor.destroy();
    document.body.removeChild(container);
  });

  it('should render highlighted codeblock element in markdown preview', () => {
    const previewHTML = getPreviewHTML();

    expect(previewHTML).toMatchSnapshot();
  });

  it('should render highlighted codeblock element in wysiwyg', () => {
    editor.changeMode('wysiwyg');

    const wwEditorHTML = getWwEditorHTML();

    expect(wwEditorHTML).toMatchSnapshot();
  });

  it('should select current code block content by Mod-a in wysiwyg', () => {
    interface WysiwygCore {
      view: {
        state: {
          doc: ProsemirrorNode;
          selection: { from: number; to: number };
        };
      };
      setSelection: (start: number, end: number) => void;
    }

    editor.changeMode('wysiwyg');

    const wwCore = ((editor as unknown) as { wwEditor: WysiwygCore }).wwEditor;
    let codeBlockPos = -1;
    let codeBlockNodeSize = 0;
    let codeText = '';

    wwCore.view.state.doc.descendants((node: ProsemirrorNode, pos: number) => {
      if (node.type.name === 'codeBlock') {
        codeBlockPos = pos;
        codeBlockNodeSize = node.nodeSize;
        codeText = node.textContent;

        return false;
      }

      return true;
    });

    expect(codeBlockPos).toBeGreaterThan(-1);

    wwCore.setSelection(codeBlockPos + 2, codeBlockPos + 2);

    const codeEl = wwEditor.querySelector('pre code') as HTMLElement;

    codeEl.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'a',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      })
    );

    const { from, to } = wwCore.view.state.selection;
    const selectedText = wwCore.view.state.doc.textBetween(from, to, '\n');

    expect([from, to]).toEqual([codeBlockPos + 1, codeBlockPos + codeBlockNodeSize - 1]);
    expect(selectedText).toBe(codeText);
  });

  it('should render codeblock element with no language info in markdown preview', () => {
    const markdown = source`
      \`\`\`
        console.log(123);
      \`\`\`
    `;

    editor.setMarkdown(markdown);

    const previewHTML = getPreviewHTML();

    expect(previewHTML).toMatchSnapshot();
  });

  it('should continue line numbers with =+ from previous code block', () => {
    const markdown = source`
      \`\`\`yaml=10
      one: 1
      two: 2
      \`\`\`

      \`\`\`yaml=+
      three: 3
      four: 4
      \`\`\`
    `;

    editor.setMarkdown(markdown);

    const preBlocks = Array.from(mdPreview.querySelectorAll('pre.line-numbers'));
    const lineNumbers = preBlocks.map((el) => el.getAttribute('data-line-numbers'));

    expect(preBlocks).toHaveLength(2);
    expect(lineNumbers[0]).toBe('10\n11');
    expect(lineNumbers[1]).toBe('12\n13');
  });

  it('should render ```! as wrapped monospace block without line numbers', () => {
    const markdown = source`
      \`\`\`!
      plain line 1
      plain line 2
      \`\`\`
    `;

    editor.setMarkdown(markdown);

    const pre = mdPreview.querySelector('pre') as HTMLElement;
    const code = pre.querySelector('code') as HTMLElement;

    expect(pre.classList.contains('line-wrap')).toBe(true);
    expect(pre.classList.contains('line-numbers')).toBe(false);
    expect(code.getAttribute('data-language')).toBeNull();
  });
});
