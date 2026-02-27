import {
  hasFootnoteSyntax,
  hasTransformedFootnoteMarkup,
  restoreTransformedFootnotes,
  transformMarkdownFootnotes,
} from '@/utils/footnote';

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

  it('restores transformed footnotes back to markdown footnote syntax', () => {
    const source = ['Footnote 1 link[^first].', '', '[^first]: Footnote text.'].join('\n');
    const transformed = transformMarkdownFootnotes(source).markdown;
    const restored = restoreTransformedFootnotes(transformed);

    expect(hasTransformedFootnoteMarkup(transformed)).toBe(true);
    expect(restored.restored).toBe(true);
    expect(restored.markdown).toContain('Footnote 1 link[^first].');
    expect(restored.markdown).toContain('[^first]: Footnote text.');
    expect(restored.markdown).not.toContain('<sup class="footnote-ref">');
  });

  it('returns source-to-rendered line mapping for transformed footnotes', () => {
    const source = [
      'Intro',
      '',
      'Ref[^a]',
      'Mid',
      '[^a]: first line',
      '    second line',
      'Tail',
    ].join('\n');
    const result = transformMarkdownFootnotes(source);

    expect(result.sourceToRenderedLineMap[1]).toBe(1);
    expect(result.sourceToRenderedLineMap[2]).toBe(2);
    expect(result.sourceToRenderedLineMap[3]).toBe(3);
    expect(result.sourceToRenderedLineMap[4]).toBe(4);
    expect(result.sourceToRenderedLineMap[7]).toBe(5);
    expect(result.sourceToRenderedLineMap[5]).toBe(11);
    expect(result.sourceToRenderedLineMap[6]).toBe(12);
  });
});
