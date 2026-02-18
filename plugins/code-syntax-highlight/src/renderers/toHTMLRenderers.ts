import type { MdNode, CodeBlockMdNode } from '@toast-ui/editor';
import type { HTMLToken } from '@toast-ui/toastmark';
import { PrismJs } from '@t/index';

const BACKTICK_COUNT = 3;
const LINE_NUM_RE = /^(.+?)=(\d*)$/;

function parseInfoString(raw: string): { lang: string; lineNumber: number | null } {
  const match = raw.match(LINE_NUM_RE);

  if (match) {
    return { lang: match[1], lineNumber: match[2] ? Number(match[2]) : 1 };
  }
  return { lang: raw, lineNumber: null };
}

function buildGutterHTML(lineNumber: number, lineCount: number): string {
  const nums: string[] = [];

  for (let i = 0; i < lineCount; i += 1) {
    nums.push(String(lineNumber + i));
  }
  return nums.join('\n');
}

export function getHTMLRenderers(prism: PrismJs) {
  return {
    codeBlock(node: MdNode): HTMLToken[] {
      const { fenceLength, info } = node as CodeBlockMdNode;
      const infoWords = info ? info.split(/\s+/) : [];
      const preClasses: string[] = [];
      const codeAttrs: Record<string, any> = {};
      const preAttrs: Record<string, any> = {};
      let lineNumber: number | null = null;

      if (fenceLength > BACKTICK_COUNT) {
        codeAttrs['data-backticks'] = fenceLength;
      }

      let content = node.literal!;

      if (infoWords.length && infoWords[0].length) {
        const parsed = parseInfoString(infoWords[0]);
        const { lang } = parsed;

        lineNumber = parsed.lineNumber;

        preClasses.push(`lang-${lang}`);
        codeAttrs['data-language'] = lang;

        const registeredLang = prism.languages[lang];

        if (registeredLang) {
          content = prism.highlight(node.literal!, registeredLang, lang);
        }
      }

      if (lineNumber !== null) {
        const lineCount = (node.literal || '').replace(/\n$/, '').split('\n').length;
        const gutterText = buildGutterHTML(lineNumber, lineCount);

        preClasses.push('line-numbers');
        preAttrs['data-line-numbers'] = gutterText;
      }

      return [
        { type: 'openTag', tagName: 'pre', classNames: preClasses, attributes: preAttrs },
        { type: 'openTag', tagName: 'code', attributes: codeAttrs },
        { type: 'html', content },
        { type: 'closeTag', tagName: 'code' },
        { type: 'closeTag', tagName: 'pre' },
      ];
    },
  };
}
