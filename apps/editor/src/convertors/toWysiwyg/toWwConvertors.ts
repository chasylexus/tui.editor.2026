import {
  MdNode,
  HeadingMdNode,
  CodeBlockMdNode,
  ListItemMdNode,
  LinkMdNode,
  TableCellMdNode,
  CustomBlockMdNode,
  CustomInlineMdNode,
  TableMdNode,
  HTMLConvertorMap,
  OpenTagToken,
  Renderer,
} from '@techie_doubts/toastmark';
import { isElemNode } from '@/utils/dom';

import {
  htmlToWwConvertors,
  getTextWithoutTrailingNewline,
  isInlineNode,
  isCustomHTMLInlineNode,
} from './htmlToWwConvertors';

import { ToWwConvertorMap } from '@t/convertor';
import { createWidgetContent, getWidgetContent } from '@/widget/rules';
import { getChildrenHTML, getHTMLAttrsByHTMLString } from '@/wysiwyg/nodes/html';
import { includes } from '@/utils/common';
import { reBR, reHTMLTag, reHTMLComment } from '@/utils/constants';
import { sanitizeHTML } from '@/sanitizer/htmlSanitizer';
import { parseCodeBlockInfo, resolveCodeBlockLineNumber } from '@/convertors/codeBlockInfo';
import { parseImageSizeSpec } from '@/convertors/imageSize';

function isBRTag(node: MdNode) {
  return node.type === 'htmlInline' && reBR.test(node.literal!);
}

function isEscapedDollar(text: string, index: number) {
  let count = 0;

  for (let i = index - 1; i >= 0 && text[i] === '\\'; i -= 1) {
    count += 1;
  }

  return count % 2 === 1;
}

function isInlineMathWhitespace(ch?: string) {
  return ch === ' ' || ch === '\t' || ch === '\n';
}

function isDigit(ch?: string) {
  return !!ch && ch >= '0' && ch <= '9';
}

interface InlineMathScanState {
  inInlineMath: boolean;
  segment: string;
}

function processInlineMathTextSegment(text: string, state: InlineMathScanState) {
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (ch !== '$') {
      if (state.inInlineMath) {
        state.segment += ch;
      }
      continue;
    }

    if (!state.inInlineMath) {
      const next = text[i + 1];

      if (!isEscapedDollar(text, i) && next !== '$' && !isInlineMathWhitespace(next)) {
        state.inInlineMath = true;
        state.segment = '';
      }
      continue;
    }

    const prev = state.segment[state.segment.length - 1];
    const next = text[i + 1];

    if (!isEscapedDollar(text, i) && !isInlineMathWhitespace(prev) && !isDigit(next)) {
      state.inInlineMath = false;
      state.segment = '';
      continue;
    }

    state.segment += '$';
  }
}

function isSoftbreakInsideInlineMath(node: MdNode) {
  if (node.type !== 'softbreak' || node.parent?.type !== 'paragraph') {
    return false;
  }

  let sibling = node.parent.firstChild;
  const state: InlineMathScanState = { inInlineMath: false, segment: '' };

  while (sibling && sibling !== node) {
    if (sibling.type === 'text') {
      processInlineMathTextSegment(sibling.literal || '', state);
    }

    sibling = sibling.next;
  }

  return state.inInlineMath;
}

function addRawHTMLAttributeToDOM(parent: Node) {
  Array.from(parent.childNodes).forEach((child) => {
    if (isElemNode(child)) {
      const openTagName = child.nodeName.toLowerCase();

      (child as HTMLElement).setAttribute('data-raw-html', openTagName);

      if (child.childNodes) {
        addRawHTMLAttributeToDOM(child);
      }
    }
  });
}

const toWwConvertors: ToWwConvertorMap = {
  text(state, node) {
    state.addText(node.literal || '');
  },

  paragraph(state, node, { entering }, customAttrs) {
    if (entering) {
      const { paragraph } = state.schema.nodes;

      // The `\n\n` entered in markdown separates the paragraph.
      // When changing to wysiwyg, a newline is added between the two paragraphs.
      if (node.prev?.type === 'paragraph') {
        state.openNode(paragraph, customAttrs);
        state.closeNode();
      }

      state.openNode(paragraph, customAttrs);
    } else {
      state.closeNode();
    }
  },

  heading(state, node, { entering }, customAttrs) {
    if (entering) {
      const { level, headingType } = node as HeadingMdNode;

      state.openNode(state.schema.nodes.heading, { level, headingType, ...customAttrs });
    } else {
      state.closeNode();
    }
  },

  codeBlock(state, node, customAttrs) {
    const { codeBlock, customBlock, paragraph } = state.schema.nodes;
    const { info, literal } = node as CodeBlockMdNode;
    const CUSTOM_BLOCK_LANGUAGES = [
      'mermaid',
      'uml',
      'chart',
      'sequence',
      'flow',
      'flowchart',
      'graphviz',
      'dot',
      'abc',
    ];
    const parsedInfo = parseCodeBlockInfo(info);
    const baseLang = parsedInfo.normalizedLanguage;

    if (customBlock && CUSTOM_BLOCK_LANGUAGES.includes(baseLang)) {
      state.openNode(customBlock, { info: baseLang });
      state.addText(getTextWithoutTrailingNewline(literal || ''));
      state.closeNode();
      if (!node.next) {
        state.openNode(paragraph);
        state.closeNode();
      }
      return;
    }

    const { language, lineWrap } = parsedInfo;
    const lineNumber = resolveCodeBlockLineNumber(node as CodeBlockMdNode, parsedInfo);

    state.openNode(codeBlock, {
      language,
      lineNumber,
      lineWrap,
      ...customAttrs,
    });
    state.addText(getTextWithoutTrailingNewline(literal || ''));
    state.closeNode();
  },

  list(state, node, { entering }, customAttrs) {
    if (entering) {
      const { bulletList, orderedList } = state.schema.nodes;
      const { type, start, bulletChar } = (node as ListItemMdNode).listData;

      if (type === 'bullet') {
        state.openNode(bulletList, { bulletChar, ...customAttrs });
      } else {
        state.openNode(orderedList, { order: start, ...customAttrs });
      }
    } else {
      state.closeNode();
    }
  },

  item(state, node, { entering }, customAttrs) {
    const { listItem } = state.schema.nodes;
    const { task, checked } = (node as ListItemMdNode).listData;

    if (entering) {
      const attrs = {
        ...(task && { task }),
        ...(checked && { checked }),
        ...customAttrs,
      };

      state.openNode(listItem, attrs);
    } else {
      state.closeNode();
    }
  },

  blockQuote(state, _, { entering }, customAttrs) {
    if (entering) {
      state.openNode(state.schema.nodes.blockQuote, customAttrs);
    } else {
      state.closeNode();
    }
  },

  image(state, node, { entering, skipChildren }, customAttrs) {
    const { image } = state.schema.nodes;
    const { destination, firstChild, title } = node as LinkMdNode;
    const size = parseImageSizeSpec(title);

    if (entering && skipChildren) {
      skipChildren();
    }

    state.addNode(image, {
      imageUrl: destination,
      ...(firstChild && { altText: firstChild.literal }),
      ...(typeof size?.width === 'number' && { imageWidth: size.width }),
      ...(typeof size?.height === 'number' && { imageHeight: size.height }),
      ...customAttrs,
    });
  },

  thematicBreak(state, node, _, customAttrs) {
    state.addNode(state.schema.nodes.thematicBreak, customAttrs);
  },

  strong(state, _, { entering }, customAttrs) {
    const { strong } = state.schema.marks;

    if (entering) {
      state.openMark(strong.create(customAttrs));
    } else {
      state.closeMark(strong);
    }
  },

  emph(state, _, { entering }, customAttrs) {
    const { emph } = state.schema.marks;

    if (entering) {
      state.openMark(emph.create(customAttrs));
    } else {
      state.closeMark(emph);
    }
  },

  link(state, node, { entering }, customAttrs) {
    const { link } = state.schema.marks;
    const { destination, title } = node as LinkMdNode;

    if (entering) {
      const attrs = {
        linkUrl: destination,
        title,
        ...customAttrs,
      };

      state.openMark(link.create(attrs));
    } else {
      state.closeMark(link);
    }
  },

  softbreak(state, node) {
    if (node.parent!.type === 'paragraph') {
      if (isSoftbreakInsideInlineMath(node)) {
        return;
      }

      const { prev, next } = node;

      if (prev && !isBRTag(prev)) {
        state.closeNode();
      }

      if (next && !isBRTag(next)) {
        state.openNode(state.schema.nodes.paragraph);
      }
    }
  },

  // GFM specifications node
  table(state, _, { entering }, customAttrs) {
    if (entering) {
      state.openNode(state.schema.nodes.table, customAttrs);
    } else {
      state.closeNode();
    }
  },

  tableHead(state, _, { entering }, customAttrs) {
    if (entering) {
      state.openNode(state.schema.nodes.tableHead, customAttrs);
    } else {
      state.closeNode();
    }
  },

  tableBody(state, _, { entering }, customAttrs) {
    if (entering) {
      state.openNode(state.schema.nodes.tableBody, customAttrs);
    } else {
      state.closeNode();
    }
  },

  tableRow(state, _, { entering }, customAttrs) {
    if (entering) {
      state.openNode(state.schema.nodes.tableRow, customAttrs);
    } else {
      state.closeNode();
    }
  },

  tableCell(state, node, { entering }) {
    if (!(node as TableCellMdNode).ignored) {
      const hasParaNode = (childNode: MdNode | null) =>
        childNode && (isInlineNode(childNode) || isCustomHTMLInlineNode(state, childNode));

      if (entering) {
        const { tableHeadCell, tableBodyCell, paragraph } = state.schema.nodes;
        const tablePart = node.parent!.parent!;
        const cell = tablePart.type === 'tableHead' ? tableHeadCell : tableBodyCell;

        const table = tablePart.parent as TableMdNode;
        const { align } = table.columns[(node as TableCellMdNode).startIdx] || {};
        const attrs: Record<string, string | number> = { ...(node as TableCellMdNode).attrs };

        if (align) {
          attrs.align = align;
        }

        state.openNode(cell, attrs);

        if (hasParaNode(node.firstChild)) {
          state.openNode(paragraph);
        }
      } else {
        if (hasParaNode(node.lastChild)) {
          state.closeNode();
        }
        state.closeNode();
      }
    }
  },

  strike(state, _, { entering }, customAttrs) {
    const { strike } = state.schema.marks;

    if (entering) {
      state.openMark(strike.create(customAttrs));
    } else {
      state.closeMark(strike);
    }
  },

  mark(state, _, { entering }, customAttrs) {
    const { mark } = state.schema.marks;

    if (entering) {
      state.openMark(mark.create(customAttrs));
    } else {
      state.closeMark(mark);
    }
  },

  superscript(state, _, { entering }, customAttrs) {
    const { superscript } = state.schema.marks;

    if (entering) {
      state.openMark(superscript.create(customAttrs));
    } else {
      state.closeMark(superscript);
    }
  },

  subscript(state, _, { entering }, customAttrs) {
    const { subscript } = state.schema.marks;

    if (entering) {
      state.openMark(subscript.create(customAttrs));
    } else {
      state.closeMark(subscript);
    }
  },

  underline(state, _, { entering }, customAttrs) {
    const { underline } = state.schema.marks;

    if (entering) {
      state.openMark(underline.create(customAttrs));
    } else {
      state.closeMark(underline);
    }
  },

  code(state, node, _, customAttrs) {
    const { code } = state.schema.marks;

    state.openMark(code.create(customAttrs));
    state.addText(getTextWithoutTrailingNewline(node.literal || ''));
    state.closeMark(code);
  },

  customBlock(state, node) {
    const { customBlock, paragraph } = state.schema.nodes;
    const { info, literal } = node as CustomBlockMdNode;

    state.openNode(customBlock, { info: info || 'latex' });
    state.addText(getTextWithoutTrailingNewline(literal || ''));
    state.closeNode();
    // add empty line to edit the content in next line
    if (!node.next) {
      state.openNode(paragraph);
      state.closeNode();
    }
  },

  frontMatter(state, node) {
    state.openNode(state.schema.nodes.frontMatter);
    state.addText(node.literal!);
    state.closeNode();
  },

  htmlInline(state, node) {
    const html = node.literal!;
    const matched = html.match(reHTMLTag)!;
    const [, openTagName, , closeTagName] = matched;
    const typeName = (openTagName || closeTagName).toLowerCase();
    const markType = state.schema.marks[typeName];
    const sanitizedHTML = sanitizeHTML(html);

    // for user defined html schema
    if (markType?.spec.attrs!.htmlInline) {
      if (openTagName) {
        const htmlAttrs = getHTMLAttrsByHTMLString(sanitizedHTML);

        state.openMark(markType.create({ htmlAttrs }));
      } else {
        state.closeMark(markType);
      }
    } else {
      const htmlToWwConvertor = htmlToWwConvertors[typeName];

      if (htmlToWwConvertor) {
        htmlToWwConvertor(state, node, openTagName);
      }
    }
  },

  htmlBlock(state, node) {
    const html = node.literal!;
    const container = document.createElement('div');
    const isHTMLComment = reHTMLComment.test(html);

    if (isHTMLComment) {
      state.openNode(state.schema.nodes.htmlComment);
      state.addText(node.literal!);
      state.closeNode();
    } else {
      const matched = html.match(reHTMLTag)!;
      const [, openTagName, , closeTagName] = matched;

      const typeName = (openTagName || closeTagName).toLowerCase();
      const nodeType = state.schema.nodes[typeName];
      const sanitizedHTML = sanitizeHTML(html);

      // for user defined html schema
      if (nodeType?.spec.attrs!.htmlBlock) {
        const htmlAttrs = getHTMLAttrsByHTMLString(sanitizedHTML);
        const childrenHTML = getChildrenHTML(node, typeName);

        state.addNode(nodeType, { htmlAttrs, childrenHTML });
      } else {
        container.innerHTML = sanitizedHTML;
        addRawHTMLAttributeToDOM(container);

        state.convertByDOMParser(container as HTMLElement);
      }
    }
  },

  customInline(state, node, { entering, skipChildren }) {
    const { info, firstChild } = node as CustomInlineMdNode;
    const { schema } = state;

    if (info.indexOf('widget') !== -1 && entering) {
      const content = getWidgetContent(node as CustomInlineMdNode);

      skipChildren();

      state.addNode(schema.nodes.widget, { info }, [
        schema.text(createWidgetContent(info, content)),
      ]);
    } else {
      let text = '$$';

      if (entering) {
        text += firstChild ? `${info} ` : info;
      }

      state.addText(text);
    }
  },
};

export function createWwConvertors(customConvertors: HTMLConvertorMap) {
  const customConvertorTypes = Object.keys(customConvertors);
  const convertors = { ...toWwConvertors };
  const renderer = new Renderer({
    gfm: true,
    nodeId: true,
    convertors: customConvertors,
  });
  const orgConvertors = renderer.getConvertors();

  customConvertorTypes.forEach((type) => {
    const wwConvertor = toWwConvertors[type];

    if (wwConvertor && !includes(['htmlBlock', 'htmlInline'], type)) {
      convertors[type] = (state, node, context) => {
        context.origin = () => orgConvertors[type]!(node, context, orgConvertors);
        const tokens = customConvertors[type]!(node, context) as OpenTagToken;
        let attrs;

        if (tokens) {
          const { attributes: htmlAttrs, classNames } = Array.isArray(tokens) ? tokens[0] : tokens;

          attrs = { htmlAttrs, classNames };
        }

        wwConvertor(state, node, context, attrs);
      };
    }
  });

  return convertors;
}
