import { Mark as ProsemirrorMark, DOMOutputSpec, Node as ProsemirrorNode } from 'prosemirror-model';
import { toggleMark } from 'prosemirror-commands';

import Mark from '@/spec/mark';
import { escapeXml } from '@/utils/common';
import {
  createAnchorIdFromText,
  collectExistingAnchorIds,
  createUniqueAnchorId,
  collectExistingCustomAnchorIds,
  createUniqueAnchorIdFromInput,
} from '@/utils/link';
import { sanitizeHTML } from '@/sanitizer/htmlSanitizer';
import { createTextNode } from '@/helper/manipulation';
import { getCustomAttrs, getDefaultCustomAttrs } from '@/wysiwyg/helper/node';

import { EditorCommand } from '@t/spec';
import { LinkAttributes } from '@t/editor';

interface AnchorPayload {
  anchorId?: string;
  anchorText?: string;
}

export class Link extends Mark {
  private linkAttributes: LinkAttributes;

  constructor(linkAttributes: LinkAttributes) {
    super();
    this.linkAttributes = linkAttributes;
  }

  get name() {
    return 'link';
  }

  get schema() {
    return {
      attrs: {
        linkUrl: { default: '' },
        title: { default: null },
        rawHTML: { default: null },
        anchorId: { default: null },
        ...getDefaultCustomAttrs(),
      },
      inclusive: false,
      parseDOM: [
        {
          tag: 'a',
          getAttrs(dom: Node | string) {
            const sanitizedDOM = sanitizeHTML<DocumentFragment>(dom, { RETURN_DOM_FRAGMENT: true })
              .firstChild as HTMLElement;
            const href = sanitizedDOM.getAttribute('href') || '';
            const title = sanitizedDOM.getAttribute('title') || '';
            const anchorId = sanitizedDOM.getAttribute('id');
            const rawHTML = sanitizedDOM.getAttribute('data-raw-html');

            return {
              linkUrl: href,
              title,
              ...(anchorId && { anchorId }),
              ...(rawHTML && { rawHTML }),
            };
          },
        },
      ],
      toDOM: ({ attrs }: ProsemirrorMark): DOMOutputSpec => {
        const customAttrs = getCustomAttrs(attrs);

        if (attrs.anchorId) {
          return [
            attrs.rawHTML || 'a',
            {
              id: escapeXml(attrs.anchorId),
              ...this.linkAttributes,
              ...customAttrs,
            },
          ];
        }

        return [
          attrs.rawHTML || 'a',
          {
            href: escapeXml(attrs.linkUrl),
            ...this.linkAttributes,
            ...customAttrs,
          },
        ];
      },
    };
  }

  private addLink(): EditorCommand {
    return (payload) => (state, dispatch) => {
      const { linkUrl, linkText = '' } = payload!;
      const rawLinkUrl = linkUrl;
      const { schema, tr, selection } = state;
      const { empty, from, to } = selection;

      if (from && to && rawLinkUrl) {
        const attrs = { linkUrl: rawLinkUrl };
        const mark = schema.mark('link', attrs);

        if (empty && linkText) {
          const node = createTextNode(schema, linkText, mark);

          tr.replaceRangeWith(from, to, node);
        } else {
          tr.addMark(from, to, mark);
        }

        dispatch!(tr.scrollIntoView());

        return true;
      }

      return false;
    };
  }

  private addCustomAnchor(): EditorCommand<AnchorPayload> {
    return (payload) => (state, dispatch) => {
      const { schema, tr, selection } = state;
      const { from, to } = selection;

      if (from === to) {
        return false;
      }

      const selectedText = tr.doc.textBetween(from, to, ' ').trim();

      if (!selectedText) {
        return false;
      }

      const [queriedMarkdown] = this.context.eventEmitter.emit('query', 'getCurrentMarkdown');
      const markdownSource =
        typeof queriedMarkdown === 'string' && queriedMarkdown
          ? queriedMarkdown
          : tr.doc.textBetween(0, tr.doc.content.size, '\n');
      const requestedAnchorId = payload?.anchorId;
      const anchorId = requestedAnchorId
        ? createUniqueAnchorIdFromInput(
            requestedAnchorId,
            collectExistingCustomAnchorIds(markdownSource)
          )
        : createUniqueAnchorId(
            createAnchorIdFromText(selectedText),
            collectExistingAnchorIds(markdownSource)
          );
      const attrs = {
        linkUrl: '',
        anchorId,
        rawHTML: 'a',
        htmlAttrs: {
          id: anchorId,
        },
      };
      const mark = schema.mark('link', attrs);

      dispatch!(tr.addMark(from, to, mark).scrollIntoView());

      return true;
    };
  }

  private removeCustomAnchor(): EditorCommand {
    return () => (state, dispatch) => {
      const { schema, tr, selection, doc } = state;
      const { from, to } = selection;

      if (from === to) {
        return false;
      }

      let hasCustomAnchor = false;

      doc.nodesBetween(from, to, (node: ProsemirrorNode) => {
        if (!node.isText) {
          return true;
        }

        const mark = schema.marks.link.isInSet(node.marks);

        if (mark && mark.attrs.anchorId && !mark.attrs.linkUrl) {
          hasCustomAnchor = true;
        }

        return true;
      });

      if (!hasCustomAnchor) {
        return false;
      }

      dispatch!(tr.removeMark(from, to, schema.marks.link).scrollIntoView());

      return true;
    };
  }

  private toggleLink(): EditorCommand {
    return (payload) => (state, dispatch) =>
      toggleMark(state.schema.marks.link, payload)(state, dispatch);
  }

  private removeLink(): EditorCommand {
    return () => (state, dispatch) => {
      const { schema, tr, selection } = state;
      const { empty, from, to } = selection;

      if (empty || from === to) {
        return false;
      }

      dispatch!(tr.removeMark(from, to, schema.marks.link).scrollIntoView());

      return true;
    };
  }

  commands() {
    return {
      addLink: this.addLink(),
      toggleLink: this.toggleLink(),
      removeLink: this.removeLink(),
      addCustomAnchor: this.addCustomAnchor(),
      removeCustomAnchor: this.removeCustomAnchor(),
    };
  }
}
