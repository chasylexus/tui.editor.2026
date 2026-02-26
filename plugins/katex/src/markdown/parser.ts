import type { CustomParserMap } from '@techie_doubts/toastmark';
import { protectInlineMathForParser, restoreInlineMathProtectedChars } from '../utils/inlineMath';

export const markdownParsers: CustomParserMap = {
  paragraph(node, { entering }) {
    const blockNode = (node as unknown) as { stringContent?: string };

    if (!entering || typeof blockNode.stringContent !== 'string') {
      return;
    }

    blockNode.stringContent = protectInlineMathForParser(blockNode.stringContent);
  },

  text(node, { entering }) {
    if (!entering || typeof node.literal !== 'string') {
      return;
    }

    node.literal = restoreInlineMathProtectedChars(node.literal);
  },

  code(node, { entering }) {
    if (!entering || typeof node.literal !== 'string') {
      return;
    }

    node.literal = restoreInlineMathProtectedChars(node.literal);
  },
};
