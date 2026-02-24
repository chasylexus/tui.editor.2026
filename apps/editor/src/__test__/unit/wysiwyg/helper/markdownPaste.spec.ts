import { looksLikeMarkdownPaste } from '@/wysiwyg/clipboard/markdownPaste';

describe('looksLikeMarkdownPaste()', () => {
  it('should detect structural markdown text', () => {
    expect(looksLikeMarkdownPaste('# Heading\n\n- item')).toBe(true);
    expect(looksLikeMarkdownPaste('```js\nconsole.log(1)\n```')).toBe(true);
    expect(looksLikeMarkdownPaste('| A | B |\n| - | - |\n| 1 | 2 |')).toBe(true);
  });

  it('should detect inline markdown text with multiple signals', () => {
    expect(looksLikeMarkdownPaste('A [link](https://example.com) and `code` snippet')).toBe(true);
    expect(looksLikeMarkdownPaste('before **bold** and ~~strike~~ after')).toBe(true);
  });

  it('should ignore plain text', () => {
    expect(looksLikeMarkdownPaste('just a plain sentence without markdown')).toBe(false);
    expect(looksLikeMarkdownPaste('')).toBe(false);
    expect(looksLikeMarkdownPaste('  \n  ')).toBe(false);
  });
});
