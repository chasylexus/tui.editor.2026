import { ProsemirrorNode, DOMOutputSpec } from 'prosemirror-model';

import NodeSchema from '@/spec/node';
import { escapeXml } from '@/utils/common';
import { sanitizeHTML } from '@/sanitizer/htmlSanitizer';
import {
  isAudioReference,
  isVideoFileReference,
  parseVideoEmbedUrl,
  parseInlineRecorderSource,
} from '@/utils/media';

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
        const imageUrl = String(attrs.imageUrl || '');
        const altText = String(attrs.altText || 'video');
        const inlineRecorder = parseInlineRecorderSource(imageUrl);
        const embeddedVideo = parseVideoEmbedUrl(imageUrl);

        if (inlineRecorder) {
          const recorderId = inlineRecorder.id || '';

          return [
            'span',
            {
              class: 'toastui-inline-recorder',
              'data-recorder-id': recorderId,
              'data-recorder-label': altText || 'audio',
            },
            [
              'span',
              {
                class: 'toastui-inline-recorder-action',
                role: 'button',
                tabindex: '0',
                'data-recorder-id': recorderId,
                'data-recorder-action': 'start',
              },
              'Record',
            ],
            [
              'span',
              {
                class: 'toastui-inline-recorder-action',
                role: 'button',
                tabindex: '0',
                'data-recorder-id': recorderId,
                'data-recorder-action': 'pause',
                'data-disabled': 'true',
              },
              'Pause',
            ],
            [
              'span',
              {
                class: 'toastui-inline-recorder-action',
                role: 'button',
                tabindex: '0',
                'data-recorder-id': recorderId,
                'data-recorder-action': 'stop',
                'data-disabled': 'true',
              },
              'Stop',
            ],
            [
              'span',
              {
                class: 'toastui-inline-recorder-dot',
                'aria-hidden': 'true',
              },
            ],
            [
              'span',
              {
                class: 'toastui-inline-recorder-status',
                'data-recorder-status': recorderId,
              },
              'Ready 000:00:00',
            ],
          ];
        }

        if (embeddedVideo) {
          return [
            'iframe',
            {
              src: embeddedVideo.embedUrl,
              title: altText,
              loading: 'lazy',
              allow:
                'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
              allowfullscreen: '',
              referrerpolicy: 'strict-origin-when-cross-origin',
              ...(attrs.imageWidth && { width: attrs.imageWidth }),
              ...(attrs.imageHeight && { height: attrs.imageHeight }),
            },
          ];
        }

        if (isAudioReference(imageUrl)) {
          return [
            'audio',
            {
              controls: '',
              preload: 'metadata',
              src: imageUrl,
            },
          ];
        }

        if (isVideoFileReference(imageUrl)) {
          return [
            'video',
            {
              controls: '',
              preload: 'metadata',
              playsinline: '',
              src: imageUrl,
              ...(attrs.imageWidth && { width: attrs.imageWidth }),
              ...(attrs.imageHeight && { height: attrs.imageHeight }),
            },
          ];
        }

        return [
          attrs.rawHTML || 'img',
          {
            src: escapeXml(imageUrl),
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
