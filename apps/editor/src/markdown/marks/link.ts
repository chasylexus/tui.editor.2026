import { DOMOutputSpec, Mark as ProsemirrorMark } from 'prosemirror-model';
import { EditorCommand } from '@t/spec';
import { clsWithMdPrefix } from '@/utils/dom';
import { escapeTextForLink, escapeXml } from '@/utils/common';
import {
  createAnchorIdFromText,
  collectExistingAnchorIds,
  createUniqueAnchorId,
  collectExistingCustomAnchorIds,
  createUniqueAnchorIdFromInput,
} from '@/utils/link';
import Mark from '@/spec/mark';
import { createTextNode } from '@/helper/manipulation';
import { resolveSelectionPos } from '../helper/pos';

type CommandType = 'image' | 'link';

interface Payload {
  linkText: string;
  altText: string;
  linkUrl: string;
  imageUrl: string;
}

interface AnchorPayload {
  anchorId?: string;
  anchorText?: string;
}

export class Link extends Mark {
  get name() {
    return 'link';
  }

  get schema() {
    return {
      attrs: {
        url: { default: false },
        desc: { default: false },
      },
      toDOM({ attrs }: ProsemirrorMark): DOMOutputSpec {
        const { url, desc } = attrs;
        let classNames = 'link';

        if (url) {
          classNames += '|link-url|marked-text';
        }
        if (desc) {
          classNames += '|link-desc|marked-text';
        }

        return ['span', { class: clsWithMdPrefix(...classNames.split('|')) }, 0];
      },
    };
  }

  private addLinkOrImage(commandType: CommandType): EditorCommand<Payload> {
    return (payload) => ({ selection, tr, schema }, dispatch) => {
      const [from, to] = resolveSelectionPos(selection);
      const { linkText, altText, linkUrl, imageUrl } = payload!;
      let text = linkText;
      let url = linkUrl;
      let syntax = '';

      if (commandType === 'image') {
        text = altText;
        url = imageUrl;
        syntax = '!';
      }

      text = escapeTextForLink(text);
      syntax += `[${text}](${url})`;

      dispatch!(tr.replaceWith(from, to, createTextNode(schema, syntax)));

      return true;
    };
  }

  private removeLink(): EditorCommand<Payload> {
    return (payload) => ({ selection, tr, schema }, dispatch) => {
      const [from, to] = resolveSelectionPos(selection);
      const text = payload?.linkText || '';

      dispatch!(tr.replaceWith(from, to, createTextNode(schema, text)));

      return true;
    };
  }

  private addCustomAnchor(): EditorCommand<AnchorPayload> {
    return (payload) => ({ selection, tr, schema }, dispatch) => {
      const [from, to] = resolveSelectionPos(selection);

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
      const anchorSyntax = `<a id="${escapeXml(anchorId)}">${escapeXml(selectedText)}</a>`;

      dispatch!(tr.replaceWith(from, to, createTextNode(schema, anchorSyntax)));

      return true;
    };
  }

  private removeCustomAnchor(): EditorCommand<AnchorPayload> {
    return (payload) => ({ selection, tr, schema }, dispatch) => {
      const [from, to] = resolveSelectionPos(selection);

      if (from === to) {
        return false;
      }

      const selectedMarkdown = tr.doc.textBetween(from, to, '\n').trim();
      const extracted = selectedMarkdown.match(
        /^<a\s+[^>]*id\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*>([\s\S]*?)<\/a>$/i
      );
      const text = payload?.anchorText ?? extracted?.[3] ?? tr.doc.textBetween(from, to, ' ');

      dispatch!(tr.replaceWith(from, to, createTextNode(schema, text)));

      return true;
    };
  }

  commands() {
    return {
      addImage: this.addLinkOrImage('image'),
      addLink: this.addLinkOrImage('link'),
      removeLink: this.removeLink(),
      addCustomAnchor: this.addCustomAnchor(),
      removeCustomAnchor: this.removeCustomAnchor(),
    };
  }
}
