import { Mark as ProsemirrorMark, DOMOutputSpec } from 'prosemirror-model';
import { toggleMark } from 'prosemirror-commands';

import Mark from '@/spec/mark';
import { escapeXml } from '@/utils/common';
import { normalizeFragmentHref } from '@/utils/link';
import { sanitizeHTML } from '@/sanitizer/htmlSanitizer';
import { createTextNode } from '@/helper/manipulation';
import { getCustomAttrs, getDefaultCustomAttrs } from '@/wysiwyg/helper/node';

import { EditorCommand } from '@t/spec';
import { LinkAttributes } from '@t/editor';

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
        ...getDefaultCustomAttrs(),
      },
      inclusive: false,
      parseDOM: [
        {
          tag: 'a[href]',
          getAttrs(dom: Node | string) {
            const sanitizedDOM = sanitizeHTML<DocumentFragment>(dom, { RETURN_DOM_FRAGMENT: true })
              .firstChild as HTMLElement;
            const href = sanitizedDOM.getAttribute('href') || '';
            const title = sanitizedDOM.getAttribute('title') || '';
            const rawHTML = sanitizedDOM.getAttribute('data-raw-html');

            return {
              linkUrl: href,
              title,
              ...(rawHTML && { rawHTML }),
            };
          },
        },
      ],
      toDOM: ({ attrs }: ProsemirrorMark): DOMOutputSpec => [
        attrs.rawHTML || 'a',
        {
          href: escapeXml(attrs.linkUrl),
          ...this.linkAttributes,
          ...getCustomAttrs(attrs),
        },
      ],
    };
  }

  private addLink(): EditorCommand {
    return (payload) => (state, dispatch) => {
      const { linkUrl, linkText = '' } = payload!;
      const normalizedLinkUrl = normalizeFragmentHref(linkUrl);
      const { schema, tr, selection } = state;
      const { empty, from, to } = selection;

      if (from && to && normalizedLinkUrl) {
        const attrs = { linkUrl: normalizedLinkUrl };
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
    };
  }
}
