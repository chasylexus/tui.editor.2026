import { HTMLConvertorMap } from '@t/renderer';
import { Parser } from '../../blocks';
import { Renderer } from '../../../html/renderer';
import { source } from 'common-tags';

const convertors: HTMLConvertorMap = {
  latex(node) {
    return [
      { type: 'openTag', tagName: 'div', outerNewLine: true, classNames: ['latex-block'] },
      { type: 'html', content: node.literal! },
      { type: 'closeTag', tagName: 'div', outerNewLine: true },
    ];
  },
};
const reader = new Parser();
const renderer = new Renderer({ gfm: true, convertors });

describe('customBlock', () => {
  it('basic with $$latex', () => {
    const input = source`
      $$latex
      E = mc^2
      $$
    `;
    const output = source`
      <div class="latex-block">E = mc^2
      </div>
    `;

    const root = reader.parse(input);
    const html = renderer.render(root);
    expect(html).toBe(`${output}\n`);
  });

  it('$$ alone should be parsed as latex custom block', () => {
    const input = source`
      $$
      E = mc^2
      $$
    `;
    const output = source`
      <div class="latex-block">E = mc^2
      </div>
    `;

    const root = reader.parse(input);
    const html = renderer.render(root);
    expect(html).toBe(`${output}\n`);
  });

  it('should be case insensitive for latex keyword', () => {
    const input = source`
      $$LaTeX
      a^2 + b^2
      $$
    `;
    const output = source`
      <div class="latex-block">a^2 + b^2
      </div>
    `;

    const root = reader.parse(input);
    const html = renderer.render(root);
    expect(html).toBe(`${output}\n`);
  });

  it('$$mermaid should NOT be parsed as custom block', () => {
    const input = source`
      $$mermaid
      graph TD
      $$
    `;
    // $$mermaid is not recognized, so the first two lines become a paragraph.
    // The trailing $$ starts a new (empty) latex block.
    const output = source`
      <p>$$mermaid
      graph TD</p>
      <div class="latex-block"></div>
    `;

    const root = reader.parse(input);
    const html = renderer.render(root);
    expect(html).toBe(`${output}\n`);
  });

  it('should handle whitespace around latex keyword', () => {
    const input = source`
      $$  latex
      x^2 + y^2
      $$
    `;
    const output = source`
      <div class="latex-block">x^2 + y^2
      </div>
    `;

    const root = reader.parse(input);
    const html = renderer.render(root);
    expect(html).toBe(`${output}\n`);
  });

  it('multiline content with blank lines', () => {
    const input = source`
      $$
      first line

      second line
      $$
    `;
    const output = source`
      <div class="latex-block">first line

      second line
      </div>
    `;

    const root = reader.parse(input);
    const html = renderer.render(root);
    expect(html).toBe(`${output}\n`);
  });
});
