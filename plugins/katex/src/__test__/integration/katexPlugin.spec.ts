import { source } from 'common-tags';

import Editor from '@techie_doubts/tui.editor.2026';
import katexPlugin from '@/index';

describe('katexPlugin inline math', () => {
  let container: HTMLElement;
  let mdPreview: HTMLElement;
  let editor: Editor;

  function getPreviewHTML() {
    return mdPreview
      .querySelector('.toastui-editor-contents')!
      .innerHTML.replace(/\sdata-nodeid="\d+"|\n/g, '')
      .trim();
  }

  function getNonWhitespaceTextOutsideKatex() {
    const p = mdPreview.querySelector('.toastui-editor-contents p');

    if (!p) return '';

    const textNodes = Array.from(p.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE);
    return textNodes.map((n) => n.textContent || '').join('').trim();
  }

  beforeEach(() => {
    container = document.createElement('div');
    editor = new Editor({
      el: container,
      previewStyle: 'vertical',
      initialValue: '',
      plugins: [katexPlugin],
    });

    const elements = editor.getEditorElements();
    mdPreview = elements.mdPreview!;

    document.body.appendChild(container);
  });

  afterEach(() => {
    editor.destroy();
    document.body.removeChild(container);
  });

  it('should render multiline inline math across softbreak nodes', () => {
    editor.setMarkdown(source`
      $\\Gamma(n) = \\begin{cases}
        \\displaystyle (n-1)!\\quad\\forall n\\in\\mathbb N\\\\
        \\displaystyle \\int_0^\\infty t^{n-1}e^{-t}dt\\quad\\forall n\\in\\mathbb R^*_+
      \\end{cases}$
    `);

    const previewHTML = getPreviewHTML();

    expect(previewHTML).toContain('class="katex"');
    expect(previewHTML).not.toContain('katex-error');
    expect(getNonWhitespaceTextOutsideKatex()).toBe('');
  });

  it('should render user sample with begin/end cases as inline math', () => {
    editor.setMarkdown(
      '$\\Gamma(n) = \\begin{cases}\n' +
        '  \\displaystyle (n-1)!\\quad\\forall n\\in\\mathbb N\\\\\n' +
        '  \\displaystyle \\int_0^\\infty t^{n-1}e^{-t}dt\\quad\\forall n\\in\\mathbb R^*_+\n' +
        '  \\end{cases}$'
    );

    const previewHTML = getPreviewHTML();

    expect(previewHTML).toContain('class="katex"');
    expect(previewHTML).not.toContain('katex-error');
    expect(getNonWhitespaceTextOutsideKatex()).toBe('');
  });

  it('should keep unmatched inline marker as plain text', () => {
    editor.setMarkdown('Price is $5 and not a formula');

    const previewHTML = getPreviewHTML();

    expect(previewHTML).not.toContain('class="katex"');
    expect(previewHTML).toContain('Price is $5 and not a formula');
  });

  it('should keep inline code literal and never render katex inside code span', () => {
    editor.setMarkdown('Inline code (should NOT render): `$\\sum$`');

    const previewHTML = getPreviewHTML();
    const codeEl = mdPreview.querySelector('.toastui-editor-contents p code');

    expect(codeEl?.textContent).toBe('$\\sum$');
    expect(previewHTML).not.toContain('class="katex"');
    expect(previewHTML).not.toContain('\uE000');
  });

  it('should render $a \\\\ b$ as inline katex without inserting markdown br node', () => {
    editor.setMarkdown('Inline newline test: $a \\\\ b$ should render b under a.');

    const p = mdPreview.querySelector('.toastui-editor-contents p')!;
    const previewHTML = getPreviewHTML();
    const directBrCount = Array.from(p.children).filter((el) => el.tagName === 'BR').length;

    expect(p.querySelector('.katex')).not.toBeNull();
    expect(directBrCount).toBe(0);
    expect(previewHTML).toContain('should render b under a.');
  });
});
