import { hasFootnoteSyntax, transformMarkdownFootnotes } from '@/utils/footnote';

describe('footnote utils', () => {
  it('transforms reference footnotes, inline footnotes, and duplicated references', () => {
    const source = [
      '#### Footnotes',
      '',
      'Footnote 1 link[^first].',
      'Footnote 2 link[^second].',
      'Inline footnote^[Text of inline footnote] definition.',
      'Duplicated footnote reference[^second].',
      '',
      '[^first]: Footnote **can have markup**',
      '    and multiple paragraphs.',
      '[^second]: Footnote text.',
    ].join('\n');

    const { markdown, hasFootnotes } = transformMarkdownFootnotes(source);

    expect(hasFootnotes).toBe(true);
    expect(markdown).toContain(
      '<sup class="footnote-ref"><a id="fnref-first-1" href="#fn-first">1</a></sup>'
    );
    expect(markdown).toContain(
      '<sup class="footnote-ref"><a id="fnref-second-1" href="#fn-second">2</a></sup>'
    );
    expect(markdown).toContain(
      '<sup class="footnote-ref"><a id="fnref-second-2" href="#fn-second">2</a></sup>'
    );
    expect(markdown).toContain('#### Footnotes');
    expect(markdown).toContain('[↩](#fnref-second-1) [↩2](#fnref-second-2)');
    expect(markdown).not.toContain('[^first]:');
    expect(markdown).not.toContain('[^second]:');
  });

  it('does not replace footnote-like syntax inside fenced code blocks', () => {
    const source = [
      '```markdown',
      '[^inside]: do-not-touch',
      'Reference [^inside]',
      '```',
      '',
      'Outside [^outside].',
      '',
      '[^outside]: Works',
    ].join('\n');

    const { markdown } = transformMarkdownFootnotes(source);

    expect(markdown).toContain('Reference [^inside]');
    expect(markdown).toContain(
      '<sup class="footnote-ref"><a id="fnref-outside-1" href="#fn-outside">1</a></sup>'
    );
  });

  it('returns original markdown when no footnote syntax is present', () => {
    const source = '# Hello\n\nNo footnotes here.';
    const result = transformMarkdownFootnotes(source);

    expect(hasFootnoteSyntax(source)).toBe(false);
    expect(result.hasFootnotes).toBe(false);
    expect(result.markdown).toBe(source);
  });
});
