import { ProsemirrorNode, DOMOutputSpec } from 'prosemirror-model';

import NodeSchema from '@/spec/node';
import { escapeXml } from '@/utils/common';
import { sanitizeHTML } from '@/sanitizer/htmlSanitizer';

import { EditorCommand } from '@t/spec';
import { getCustomAttrs, getDefaultCustomAttrs } from '../helper/node';

export class Image extends NodeSchema {
  get name() {
    return 'image';
  }

  get schema() {
    return {
      inline: true,
      attrs: {
        imageUrl: { default: '' },
        altText: { default: null },
        imageWidth: { default: null },
        imageHeight: { default: null },
        rawHTML: { default: null },
        ...getDefaultCustomAttrs(),
      },
      group: 'inline',
      selectable: false,
      parseDOM: [
        {
          tag: 'img[src]',
          getAttrs(dom: Node | string) {
            const sanitizedDOM = sanitizeHTML<DocumentFragment>(dom, { RETURN_DOM_FRAGMENT: true })
              .firstChild as HTMLElement;
            const imageUrl = sanitizedDOM.getAttribute('src') || '';
            const rawHTML = sanitizedDOM.getAttribute('data-raw-html');
            const altText = sanitizedDOM.getAttribute('alt');
            const widthAttr = sanitizedDOM.getAttribute('width');
            const heightAttr = sanitizedDOM.getAttribute('height');
            const parsedWidth = widthAttr ? Number.parseInt(widthAttr, 10) : null;
            const parsedHeight = heightAttr ? Number.parseInt(heightAttr, 10) : null;
            const imageWidth =
              Number.isFinite(parsedWidth) && parsedWidth !== null && parsedWidth > 0
                ? parsedWidth
                : null;
            const imageHeight =
              Number.isFinite(parsedHeight) && parsedHeight !== null && parsedHeight > 0
                ? parsedHeight
                : null;

            return {
              imageUrl,
              altText,
              ...(imageWidth !== null && { imageWidth }),
              ...(imageHeight !== null && { imageHeight }),
              ...(rawHTML && { rawHTML }),
            };
          },
        },
      ],
      toDOM({ attrs }: ProsemirrorNode): DOMOutputSpec {
        return [
          attrs.rawHTML || 'img',
          {
            src: escapeXml(attrs.imageUrl),
            ...(attrs.altText && { alt: attrs.altText }),
            ...(attrs.imageWidth && { width: attrs.imageWidth }),
            ...(attrs.imageHeight && { height: attrs.imageHeight }),
            ...getCustomAttrs(attrs),
            referrerpolicy: 'no-referrer',
          },
        ];
      },
    };
  }

  private addImage(): EditorCommand {
    return (payload) => ({ schema, tr }, dispatch) => {
      const { imageUrl, altText, imageWidth, imageHeight } = payload || {};

      if (!imageUrl) {
        return false;
      }

      const node = schema.nodes.image.createAndFill({
        imageUrl,
        ...(altText && { altText }),
        ...(typeof imageWidth === 'number' && imageWidth > 0 && { imageWidth }),
        ...(typeof imageHeight === 'number' && imageHeight > 0 && { imageHeight }),
      });

      dispatch!(tr.replaceSelectionWith(node!).scrollIntoView());

      return true;
    };
  }

  commands() {
    return {
      addImage: this.addImage(),
    };
  }
}
