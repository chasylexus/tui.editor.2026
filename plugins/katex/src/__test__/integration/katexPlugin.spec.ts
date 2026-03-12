import { source } from 'common-tags';

import Editor from '@techie_doubts/tui.editor.2026';
import katexPlugin from '@/index';
import { fixInlineMathBackslashes, normalizeInlineMathEscapes } from '@/utils/inlineMath';
import { repairCollapsedInlineLatexLineBreaks } from '@/wysiwyg/inlineLatexWysiwygPlugin';

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

    return textNodes
      .map((n) => n.textContent || '')
      .join('')
      .trim();
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

  it('should not add extra slash in inline linebreak latex after wysiwyg edit', () => {
    const base = 'Inline newline test: $a \\\\ b$ should render b under a (inline stacked layout).';

    editor.setMarkdown(base);
    editor.changeMode('wysiwyg');
    editor.moveCursorToEnd();
    editor.insertText('1');
    editor.changeMode('markdown');

    const markdown = editor.getMarkdown();

    expect(markdown).toContain('$a \\\\ b$');
    expect(markdown).not.toContain('$a \\\\\\ b$');
    expect(markdown.endsWith('.1')).toBe(true);
  });

  it('should keep inline latex editing decoration after typing', () => {
    editor.setMarkdown('Inline: $a \\\\ b$ test');
    editor.changeMode('wysiwyg');

    const { wwEditor } = editor as any;
    const { doc } = wwEditor.view.state;
    let posInFormula: number | null = null;

    doc.descendants((node: any, pos: number) => {
      if (!node.isText) {
        return true;
      }

      const text = node.text || '';
      const index = text.indexOf('$a \\\\ b$');

      if (index >= 0) {
        posInFormula = pos + index + 3;
        return false;
      }

      return true;
    });

    expect(posInFormula).not.toBeNull();
    editor.setSelection(posInFormula!, posInFormula!);
    editor.insertText('1');

    const wwRoot = editor.getEditorElements().wwEditor!;
    const editingSpan = wwRoot.querySelector('.toastui-inline-latex-editing') as HTMLElement | null;

    expect(editingSpan).not.toBeNull();
  });

  it('should preserve inline latex commands when editing adjacent plain text in a list item', () => {
    editor.setMarkdown(
      [
        "* The Euler's identity: $e^{i\\pi} + 1 = 0$",
        '* The solution of $f(x)=ax^2+bx+c$ where $a \\neq 0$ and $a, b, c \\in R$ is',
      ].join('\n')
    );
    editor.changeMode('wysiwyg');

    const { wwEditor } = editor as any;
    const { doc } = wwEditor.view.state;
    let insertPos: number | null = null;

    doc.descendants((node: any, pos: number) => {
      if (!node.isText) {
        return true;
      }

      const text = node.text || '';
      const index = text.indexOf("The Euler's identity:");

      if (index >= 0) {
        insertPos = pos + index + "The Euler's identity:".length;
        return false;
      }

      return true;
    });

    expect(insertPos).not.toBeNull();
    editor.setSelection(insertPos!, insertPos!);
    editor.insertText('1');
    editor.changeMode('markdown');

    const markdown = editor.getMarkdown();

    expect(markdown).toContain('$e^{i\\pi} + 1 = 0$');
    expect(markdown).toContain('$f(x)=ax^2+bx+c$ where $a \\neq 0$ and $a, b, c \\in R$ is');
    expect(markdown).not.toContain('\\\\pi');
    expect(markdown).not.toContain('\\\\neq');
    expect(markdown).not.toContain('\\\\in');
  });

  it('should preserve inline latex commands when editing plain text around multiple inline formulas', () => {
    editor.setMarkdown(
      [
        "* The Euler's identity: $e^{i\\pi} + 1 = 0$",
        '* The solution of $f(x)=ax^2+bx+c$ where $a \\neq 0$ and $a, b, c \\in R$ is',
      ].join('\n')
    );
    editor.changeMode('wysiwyg');

    const { wwEditor } = editor as any;
    const { doc } = wwEditor.view.state;
    let insertPos: number | null = null;

    doc.descendants((node: any, pos: number) => {
      if (!node.isText) {
        return true;
      }

      const text = node.text || '';
      const index = text.indexOf(' where ');

      if (index >= 0) {
        insertPos = pos + index + ' where'.length;
        return false;
      }

      return true;
    });

    expect(insertPos).not.toBeNull();
    editor.setSelection(insertPos!, insertPos!);
    editor.insertText('1');
    editor.changeMode('markdown');

    const markdown = editor.getMarkdown();

    expect(markdown).toContain('$f(x)=ax^2+bx+c$ where1 $a \\neq 0$ and $a, b, c \\in R$ is');
    expect(markdown).not.toContain('\\\\neq');
    expect(markdown).not.toContain('\\\\in');
  });

  it('should collapse over-escaped inline latex commands from safari markdown conversion', () => {
    const markdown = [
      "* The Euler's identity: $e^{i\\\\pi} + 1 = 0$",
      '* The solution of $f(x)=ax^2+bx+c$ where $a \\\\neq 0$ and $a, b, c \\\\in R$ is',
    ].join('\n');

    const fixed = fixInlineMathBackslashes(markdown);

    expect(fixed).toContain('$e^{i\\pi} + 1 = 0$');
    expect(fixed).toContain('$f(x)=ax^2+bx+c$ where $a \\neq 0$ and $a, b, c \\in R$ is');
    expect(fixed).not.toContain('\\\\pi');
    expect(fixed).not.toContain('\\\\neq');
    expect(fixed).not.toContain('\\\\in');
  });

  it('should collapse repeated safari-style escaping runs before inline latex commands', () => {
    const markdown = [
      "* The Euler's identity: $e^{i\\\\\\\\pi} + 1 = 0$",
      '* The solution of $f(x)=ax^2+bx+c$ where $a \\\\\\\\neq 0$ and $a, b, c \\\\\\\\in R$ is',
      'Inline newline test: $a \\\\ b$ should render b under a.',
    ].join('\n');

    const fixed = fixInlineMathBackslashes(markdown);

    expect(fixed).toContain('$e^{i\\pi} + 1 = 0$');
    expect(fixed).toContain('$f(x)=ax^2+bx+c$ where $a \\neq 0$ and $a, b, c \\in R$ is');
    expect(fixed).toContain('$a \\\\ b$');
    expect(fixed).not.toContain('\\\\pi');
    expect(fixed).not.toContain('\\\\\\\\pi');
    expect(fixed).not.toContain('\\\\neq');
    expect(fixed).not.toContain('\\\\\\\\neq');
    expect(fixed).not.toContain('\\\\in');
    expect(fixed).not.toContain('\\\\\\\\in');
  });

  it('should normalize escaped asterisk and underscore inside inline latex', () => {
    expect(normalizeInlineMathEscapes('$R^\\*_+$')).toBe('$R^*_+$');
    expect(normalizeInlineMathEscapes('$R^\\*\\_+$')).toBe('$R^*_+$');
  });

  it('should keep $R^*_+$ stable across markdown to wysiwyg roundtrip', () => {
    editor.setMarkdown('$R^*_+$');
    editor.changeMode('wysiwyg');
    editor.changeMode('markdown');

    expect(editor.getMarkdown()).toBe('$R^*_+$');
  });

  it('should keep block latex delimiters from shifting inline-latex normalization state', () => {
    const markdown = [
      '$$',
      '',
      '### Math',
      '',
      "* The Euler's identity: $e^{i\\\\pi} + 1 = 0$",
      '* The solution of $f(x)=ax^2+bx+c$ where $a \\\\neq 0$ and $a, b, c \\\\in R$ is',
    ].join('\n');

    const fixed = fixInlineMathBackslashes(markdown);

    expect(fixed).toContain('$$');
    expect(fixed).toContain('$e^{i\\pi} + 1 = 0$');
    expect(fixed).toContain('$f(x)=ax^2+bx+c$ where $a \\neq 0$ and $a, b, c \\in R$ is');
    expect(fixed).not.toContain('\\\\pi');
    expect(fixed).not.toContain('\\\\neq');
    expect(fixed).not.toContain('\\\\in');
  });

  it('should keep multiline inline latex line breaks and render preview below raw code while editing', () => {
    const multiline = source`
      * The *Gamma function*: $\\Gamma(n) = \\begin{cases}
        \\displaystyle (n-1)!\\quad\\forall n\\in\\mathbb N\\\\
        \\displaystyle \\int_0^\\infty t^{n-1}e^{-t}dt\\quad\\forall n\\in\\mathbb R^*_+
        \\end{cases}$
    `;

    editor.setMarkdown(multiline);
    editor.changeMode('wysiwyg');

    const wwRoot = editor.getEditorElements().wwEditor!;
    const { wwEditor } = editor as any;
    const { doc } = wwEditor.view.state;
    let posInMiddleLine: number | null = null;

    doc.descendants((node: any, pos: number) => {
      if (!node.isText) {
        return true;
      }

      const text = node.text || '';
      const idx = text.indexOf('t^{n-1}');

      if (idx >= 0) {
        posInMiddleLine = pos + idx + 't^{n-1'.length;
        return false;
      }

      return true;
    });

    expect(posInMiddleLine).not.toBeNull();
    editor.setSelection(posInMiddleLine!, posInMiddleLine!);

    let livePreview = wwRoot.querySelector(
      '.toastui-inline-latex-live-preview'
    ) as HTMLElement | null;

    expect(wwRoot.querySelectorAll('.toastui-inline-latex-editing-break').length).toBe(3);
    expect(livePreview).not.toBeNull();

    editor.insertText('1');

    livePreview = wwRoot.querySelector('.toastui-inline-latex-live-preview') as HTMLElement | null;

    expect(wwRoot.querySelectorAll('.toastui-inline-latex-editing-break').length).toBe(3);
    expect(livePreview).not.toBeNull();
    expect(livePreview?.classList.contains('toastui-inline-latex-tooltip')).toBe(false);

    const markdown = editor.getMarkdown();

    expect(markdown).toContain('t^{n-11}');
    expect((markdown.match(/\n/g) || []).length).toBeGreaterThanOrEqual(3);
    expect(markdown).toContain('\\mathbb N\\\\');
    expect(markdown).toContain('\n    \\displaystyle \\int_0^\\infty');
    expect(markdown).toContain('\n    \\end{cases}$');
  });

  it('should repair browser-collapsed line breaks inside multiline inline latex', () => {
    const previousContent = source`
      \\Gamma(n) = \\begin{cases}
      \\displaystyle (n-1)!\\quad\\forall n\\in\\mathbb N\\\\
      \\displaystyle \\int_0^\\infty t^{n-1}e^{-t}dt\\quad\\forall n\\in\\mathbb R^*_+
      \\end{cases}
    `;
    const collapsedContent = source`
      \\Gamma(n) = \\begin{cases}
      \\displaystyle (n-11)!\\quad\\forall n\\in\\mathbb N\\\\ \\displaystyle \\int_0^\\infty t^{n-11}e^{-t}dt\\quad\\forall n\\in\\mathbb R^*_+ \\end{cases}
    `;

    const repaired = repairCollapsedInlineLatexLineBreaks(previousContent, collapsedContent);

    expect(repaired).toContain('\\mathbb N\\\\\n\\displaystyle');
    expect(repaired).toContain('\\mathbb R^*_+\n\\end{cases}');
    expect(repaired).toContain('t^{n-11}');
  });

  it('should repair collapsed line break when the first displaystyle line is edited', () => {
    const previousContent = source`
      \\Gamma(n) = \\begin{cases}
      \\displaystyle (n-1)!\\quad\\forall n\\in\\mathbb N\\\\
      \\displaystyle \\int_0^\\infty t^{n-1}e^{-t}dt\\quad\\forall n\\in\\mathbb R^*_+
      \\end{cases}
    `;
    const collapsedContent = source`
      \\Gamma(n) = \\begin{cases}
      \\displaystyle (n-11)!\\quad\\forall n\\in\\mathbb N\\\\ \\displaystyle \\int_0^\\infty t^{n-1}e^{-t}dt\\quad\\forall n\\in\\mathbb R^*_+
      \\end{cases}
    `;

    const repaired = repairCollapsedInlineLatexLineBreaks(previousContent, collapsedContent);

    expect(repaired).toContain('\\mathbb N\\\\\n\\displaystyle');
    expect(repaired).toContain('(n-11)!');
    expect(repaired).toContain('\\mathbb R^*_+\n\\end{cases}');
  });

  it('should keep multiline inline latex stable across repeated edits in the first displaystyle line', () => {
    const multiline = source`
      * The *Gamma function*: $\\Gamma(n) = \\begin{cases}
        \\displaystyle (n-1)!\\quad\\forall n\\in\\mathbb N\\\\
        \\displaystyle \\int_0^\\infty t^{n-1}e^{-t}dt\\quad\\forall n\\in\\mathbb R^*_+
        \\end{cases}$
    `;

    editor.setMarkdown(multiline);
    editor.changeMode('wysiwyg');

    const { wwEditor } = editor as any;
    const { doc } = wwEditor.view.state;
    let posInFirstDisplayStyleLine: number | null = null;

    doc.descendants((node: any, pos: number) => {
      if (!node.isText) {
        return true;
      }

      const text = node.text || '';
      const idx = text.indexOf('(n-1)!');

      if (idx >= 0) {
        posInFirstDisplayStyleLine = pos + idx + '(n-1'.length;
        return false;
      }

      return true;
    });

    expect(posInFirstDisplayStyleLine).not.toBeNull();
    editor.setSelection(posInFirstDisplayStyleLine!, posInFirstDisplayStyleLine!);
    editor.insertText('1');
    editor.insertText('1');

    const markdown = editor.getMarkdown();

    expect(markdown).toContain('(n-111)!');
    expect(markdown).toContain('\\mathbb N\\\\\n');
    expect(markdown).toContain('\n    \\displaystyle \\int_0^\\infty');
    expect(markdown).toContain('\n    \\end{cases}$');
  });
});
