import {
  convertHtmlTableToNormalizedMarkdownTable,
  convertTabularPlainTextToMarkdownTable,
  looksLikeMarkdownPaste,
  normalizeMarkdownTableShape,
  shouldPasteMarkdownInWysiwyg,
} from '@/wysiwyg/clipboard/markdownPaste';

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

  it('should detect footnote markdown syntax', () => {
    expect(looksLikeMarkdownPaste('Footnote ref[^first].')).toBe(true);
    expect(looksLikeMarkdownPaste('Inline footnote^[Text of inline footnote].')).toBe(true);
    expect(looksLikeMarkdownPaste('[^first]: Footnote text.')).toBe(true);
  });

  it('should ignore plain text', () => {
    expect(looksLikeMarkdownPaste('just a plain sentence without markdown')).toBe(false);
    expect(looksLikeMarkdownPaste('')).toBe(false);
    expect(looksLikeMarkdownPaste('  \n  ')).toBe(false);
  });
});

describe('shouldPasteMarkdownInWysiwyg()', () => {
  it('should keep markdown interception for plain markdown clipboard', () => {
    const plain = '# Heading\n\n[link](https://example.com)';
    const html = '<div># Heading</div><div></div><div>[link](https://example.com)</div>';

    expect(shouldPasteMarkdownInWysiwyg(plain, html)).toBe(true);
  });

  it('should skip markdown interception when clipboard has rich html content', () => {
    const plain = '| A | B |\n| - | - |\n| 1 | 2 |';
    const html = '<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>';

    expect(shouldPasteMarkdownInWysiwyg(plain, html)).toBe(false);
  });
});

describe('convertTabularPlainTextToMarkdownTable()', () => {
  it('should convert tabular plain text (tsv-like) into markdown table', () => {
    const input = 'Name\tScore\nAlice\t10\nBob\t20';

    expect(convertTabularPlainTextToMarkdownTable(input)).toBe(
      '| Name | Score |\n| --- | --- |\n| Alice | 10 |\n| Bob | 20 |'
    );
  });

  it('should escape pipe and keep empty cells', () => {
    const input = 'A\tB\none|two\t';

    expect(convertTabularPlainTextToMarkdownTable(input)).toBe(
      '| A | B |\n| --- | --- |\n| one\\|two |  |'
    );
  });

  it('should return null for non-tabular plain text', () => {
    expect(convertTabularPlainTextToMarkdownTable('just text')).toBeNull();
    expect(convertTabularPlainTextToMarkdownTable('A\tB\nno tab row')).toBeNull();
    expect(convertTabularPlainTextToMarkdownTable('A\tB')).toBeNull();
  });
});

describe('convertHtmlTableToNormalizedMarkdownTable()', () => {
  it('should flatten merged html table into a rectangular markdown table', () => {
    const html = `
      <table>
        <tr>
          <th>Feature</th>
          <th>Value</th>
        </tr>
        <tr>
          <td rowspan="2">Brand Lift</td>
          <td>Sales Lift</td>
        </tr>
        <tr>
          <td>Search Lift</td>
        </tr>
      </table>
    `;

    expect(convertHtmlTableToNormalizedMarkdownTable(html)).toBe(
      [
        '| Feature | Value |',
        '| --- | --- |',
        '| Brand Lift | Sales Lift |',
        '|  | Search Lift |',
      ].join('\n')
    );
  });

  it('should normalize ragged html table rows by adding empty cells', () => {
    const html = `
      <table>
        <tr><th>A</th><th>B</th></tr>
        <tr><td>1</td></tr>
      </table>
    `;

    expect(convertHtmlTableToNormalizedMarkdownTable(html)).toBe(
      ['| A | B |', '| --- | --- |', '| 1 |  |'].join('\n')
    );
  });

  it('should convert regular rectangular html table to markdown table', () => {
    const html = `
      <table>
        <tr><th>A</th><th>B</th></tr>
        <tr><td>1</td><td>2</td></tr>
      </table>
    `;

    expect(convertHtmlTableToNormalizedMarkdownTable(html)).toBe(
      ['| A | B |', '| --- | --- |', '| 1 | 2 |'].join('\n')
    );
  });

  it('should flatten top-row merge without adding synthetic header for html table', () => {
    const html = `
      <table>
        <tr><td rowspan="3">Merged</td><td>R1</td></tr>
        <tr><td>R2</td></tr>
        <tr><td>R3</td></tr>
      </table>
    `;

    expect(convertHtmlTableToNormalizedMarkdownTable(html)).toBe(
      ['| Merged | R1 |', '| --- | --- |', '| Merged | R2 |', '| Merged | R3 |'].join('\n')
    );
  });

  it('should normalize dangling tr/td html fragment by wrapping it as table', () => {
    const html = `
      <tr><td rowspan="2">A</td><td>B</td></tr>
      <tr><td>C</td></tr>
    `;

    expect(convertHtmlTableToNormalizedMarkdownTable(html)).toBe(
      ['| A | B |', '| --- | --- |', '| A | C |'].join('\n')
    );
  });

  it('should keep first row as header when html table has no explicit header and no merged cells', () => {
    const html = `
      <table>
        <tr><td>A</td><td>B</td></tr>
        <tr><td>1</td><td>2</td></tr>
      </table>
    `;

    expect(convertHtmlTableToNormalizedMarkdownTable(html)).toBe(
      ['| A | B |', '| --- | --- |', '| 1 | 2 |'].join('\n')
    );
  });

  it('should return null for mixed html content with multiple tables and text', () => {
    const html = `
      <table>
        <tr><th>A</th><th>B</th></tr>
        <tr><td>1</td><td>2</td></tr>
      </table>
      <p>between</p>
      <table>
        <tr><th>C</th><th>D</th></tr>
        <tr><td>3</td><td>4</td></tr>
      </table>
    `;

    expect(convertHtmlTableToNormalizedMarkdownTable(html)).toBeNull();
  });

  it('should treat wrapper-only html (like docs clipboard) as single-table payload', () => {
    const html = `
      <meta charset="utf-8" />
      <style>.x { color: red; }</style>
      <b id="docs-internal-guid-1">
        <table>
          <tr><td rowspan="2">1</td><td>1</td></tr>
          <tr><td>1</td></tr>
        </table>
      </b>
    `;

    expect(convertHtmlTableToNormalizedMarkdownTable(html)).toBe(
      ['| 1 | 1 |', '| --- | --- |', '| 1 | 1 |'].join('\n')
    );
  });
});

describe('normalizeMarkdownTableShape()', () => {
  it('should pad malformed markdown table rows to rectangular shape', () => {
    const input = [
      "| <span style=\"font-size: 9pt;\">1. Аналитические продукты</span> | <span style=\"font-size: 9pt;\">Brand Lift</span> |",
      '| ------------------------- | ---------- |',
      "| <span style=\"font-size: 9pt;\">Sales Lift</span> |",
      "| <span style=\"font-size: 9pt;\">Search Lift</span> |",
    ].join('\n');

    expect(normalizeMarkdownTableShape(input)).toBe(
      [
        "| <span style=\"font-size: 9pt;\">1. Аналитические продукты</span> | <span style=\"font-size: 9pt;\">Brand Lift</span> |",
        '| --- | --- |',
        "| <span style=\"font-size: 9pt;\">Sales Lift</span> |  |",
        "| <span style=\"font-size: 9pt;\">Search Lift</span> |  |",
      ].join('\n')
    );
  });

  it('should pad malformed markdown table rows even when some lines miss trailing pipes', () => {
    const input = ['| A | B |', '| --- | --- |', '| Sales Lift', '| Search Lift'].join('\n');

    expect(normalizeMarkdownTableShape(input)).toBe(
      ['| A | B |', '| --- | --- |', '| Sales Lift |  |', '| Search Lift |  |'].join('\n')
    );
  });

  it('should return null for already valid markdown table', () => {
    const input = ['| A | B |', '| --- | --- |', '| 1 | 2 |'].join('\n');

    expect(normalizeMarkdownTableShape(input)).toBeNull();
  });

  it('should not normalize merged-cell markdown table syntax', () => {
    const input = [
      '| A | B |',
      '| --- | --- |',
      '| @rows=3:Merged | R1 |',
      '| R2 |',
      '| R3 |',
    ].join('\n');

    expect(normalizeMarkdownTableShape(input)).toBeNull();
  });

  it('should degrade merged syntax in header row to non-merged rectangular table', () => {
    const input = ['| @cols=1:<span>1</span> | 1 |', '| --- | --- |', '| 1 |'].join('\n');

    expect(normalizeMarkdownTableShape(input)).toBe(
      ['| <span>1</span> | 1 |', '| --- | --- |', '| <span>1</span> | 1 |'].join('\n')
    );
  });
});
