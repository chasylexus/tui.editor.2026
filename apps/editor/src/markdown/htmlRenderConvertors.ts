import {
  HTMLConvertorMap,
  MdNode,
  ListItemMdNode,
  CodeMdNode,
  CodeBlockMdNode,
  CustomInlineMdNode,
  LinkMdNode,
  OpenTagToken,
  Context,
  HTMLConvertor,
  HTMLToken,
} from '@t/toastmark';
import { LinkAttributes, CustomHTMLRenderer } from '@t/editor';
import { HTMLMdNode } from '@t/markdown';
import { getWidgetContent, widgetToDOM } from '@/widget/rules';
import { getChildrenHTML, getHTMLAttrsByHTMLString } from '@/wysiwyg/nodes/html';
import { includes } from '@/utils/common';
import { reHTMLTag } from '@/utils/constants';
import {
  parseCodeBlockInfo,
  resolveCodeBlockLineNumber,
  getCodeBlockLineCount,
} from '@/convertors/codeBlockInfo';
import { parseImageSizeSpec } from '@/convertors/imageSize';
import {
  parseVideoEmbedUrl,
  isAudioReference,
  isVideoFileReference,
  parseInlineRecorderSource,
  isDrawioReference,
  createDrawioViewerUrl,
  createDrawioResponsiveStyle,
  isExcalidrawReference,
  createExcalidrawViewerUrl,
  createExcalidrawResponsiveStyle,
  normalizeMediaReference,
} from '@/utils/media';
import { registerTagWhitelistIfPossible } from '@/sanitizer/htmlSanitizer';

type TokenAttrs = Record<string, any>;
type MediaType = 'image' | 'audio' | 'video' | 'embed' | 'drawio' | 'excalidraw';
type ResolveMediaPath = (path: string, mediaType: MediaType) => string;

const reCloseTag = /^\s*<\s*\//;

function extractNodeText(node: MdNode | null | undefined): string {
  if (!node) {
    return '';
  }

  let text = '';
  let cursor: MdNode | null | undefined = node;

  while (cursor) {
    if (typeof cursor.literal === 'string') {
      text += cursor.literal;
    }

    if (cursor.firstChild) {
      text += extractNodeText(cursor.firstChild);
    }

    cursor = cursor.next;
  }

  return text;
}

function createInlineRecorderTokens(recorderId: string, label: string): HTMLToken[] {
  return [
    {
      type: 'openTag',
      tagName: 'span',
      classNames: ['toastui-inline-recorder'],
      attributes: {
        'data-recorder-id': recorderId,
        'data-recorder-label': label,
      },
    },
    {
      type: 'openTag',
      tagName: 'span',
      classNames: ['toastui-inline-recorder-action', 'toastui-inline-recorder-action-primary'],
      attributes: {
        role: 'button',
        tabindex: '0',
        'data-recorder-id': recorderId,
        'data-recorder-action': 'start',
        'data-recorder-visual': 'record',
      },
    },
    { type: 'text', content: '' },
    { type: 'closeTag', tagName: 'span' },
    {
      type: 'openTag',
      tagName: 'span',
      classNames: ['toastui-inline-recorder-action', 'toastui-inline-recorder-action-stop'],
      attributes: {
        role: 'button',
        tabindex: '0',
        'data-recorder-id': recorderId,
        'data-recorder-action': 'stop',
        'data-recorder-visual': 'stop',
        'data-disabled': 'true',
      },
    },
    { type: 'text', content: '' },
    { type: 'closeTag', tagName: 'span' },
    {
      type: 'openTag',
      tagName: 'span',
      classNames: ['toastui-inline-recorder-dot'],
      attributes: {
        'aria-hidden': 'true',
      },
    },
    { type: 'closeTag', tagName: 'span' },
    {
      type: 'openTag',
      tagName: 'span',
      classNames: ['toastui-inline-recorder-status'],
      attributes: {
        'data-recorder-status': recorderId,
      },
    },
    { type: 'text', content: 'Ready 000:00:00' },
    { type: 'closeTag', tagName: 'span' },
    { type: 'closeTag', tagName: 'span' },
  ] as HTMLToken[];
}

const baseConvertors: HTMLConvertorMap = {
  paragraph(_, { entering, origin, options }: Context) {
    if (options.nodeId) {
      return {
        type: entering ? 'openTag' : 'closeTag',
        outerNewLine: true,
        tagName: 'p',
      };
    }

    return origin!();
  },

  softbreak(node: MdNode) {
    const isPrevNodeHTML = node.prev && node.prev.type === 'htmlInline';
    const isPrevBR = isPrevNodeHTML && /<br ?\/?>/.test(node.prev!.literal!);
    const content = isPrevBR ? '\n' : '<br>\n';

    return { type: 'html', content };
  },

  item(node: MdNode, { entering }: Context) {
    if (entering) {
      const attributes: TokenAttrs = {};
      const classNames = [];

      if ((node as ListItemMdNode).listData.task) {
        attributes['data-task'] = '';
        classNames.push('task-list-item');
        if ((node as ListItemMdNode).listData.checked) {
          classNames.push('checked');
          attributes['data-task-checked'] = '';
        }
      }

      return {
        type: 'openTag',
        tagName: 'li',
        classNames,
        attributes,
        outerNewLine: true,
      };
    }

    return {
      type: 'closeTag',
      tagName: 'li',
      outerNewLine: true,
    };
  },

  code(node: MdNode) {
    const attributes = { 'data-backticks': String((node as CodeMdNode).tickCount) };

    return [
      { type: 'openTag', tagName: 'code', attributes },
      { type: 'text', content: node.literal! },
      { type: 'closeTag', tagName: 'code' },
    ];
  },

  image(node: MdNode, { origin, entering, skipChildren }: Context) {
    if (!entering) {
      return [];
    }

    if (skipChildren) {
      skipChildren();
    }

    const linkNode = node as LinkMdNode;
    const destination = normalizeMediaReference(String(linkNode.destination || '').trim());
    const altText = extractNodeText(linkNode.firstChild).trim() || 'media';
    const size = parseImageSizeSpec(linkNode.title);
    const inlineRecorder = parseInlineRecorderSource(destination);
    const embeddedVideo = parseVideoEmbedUrl(destination);

    if (inlineRecorder) {
      return createInlineRecorderTokens(inlineRecorder.id, altText || 'audio');
    }

    if (embeddedVideo) {
      registerTagWhitelistIfPossible('iframe');
      const iframeAttributes: TokenAttrs = {
        src: embeddedVideo.embedUrl,
        title: altText,
        loading: 'lazy',
        allow:
          'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
        allowfullscreen: '',
        referrerpolicy: 'strict-origin-when-cross-origin',
      };

      if (size && size.width !== null) {
        iframeAttributes.width = String(size.width);
      }

      if (size && size.height !== null) {
        iframeAttributes.height = String(size.height);
      }

      return [
        {
          type: 'openTag',
          tagName: 'iframe',
          classNames: ['toastui-media', 'toastui-media-video-host'],
          attributes: iframeAttributes,
        },
        { type: 'closeTag', tagName: 'iframe' },
      ];
    }

    if (isAudioReference(destination)) {
      registerTagWhitelistIfPossible('audio');

      return [
        {
          type: 'openTag',
          tagName: 'audio',
          classNames: ['toastui-media', 'toastui-media-audio'],
          attributes: {
            controls: '',
            preload: 'metadata',
            src: destination,
          },
        },
        { type: 'closeTag', tagName: 'audio' },
      ];
    }

    if (isVideoFileReference(destination)) {
      registerTagWhitelistIfPossible('video');

      const attributes: TokenAttrs = {
        controls: '',
        preload: 'metadata',
        playsinline: '',
        src: destination,
      };

      if (size && size.width !== null) {
        attributes.width = String(size.width);
      }

      if (size && size.height !== null) {
        attributes.height = String(size.height);
      }

      return [
        {
          type: 'openTag',
          tagName: 'video',
          classNames: ['toastui-media', 'toastui-media-video-file'],
          attributes,
        },
        { type: 'closeTag', tagName: 'video' },
      ];
    }

    if (isDrawioReference(destination)) {
      registerTagWhitelistIfPossible('iframe');
      const resolvedDrawio = destination;
      const iframeAttributes: TokenAttrs = {
        src: createDrawioViewerUrl(resolvedDrawio, altText || 'draw.io'),
        title: altText || 'draw.io',
        loading: 'lazy',
        sandbox: 'allow-scripts allow-same-origin allow-popups',
        style: createDrawioResponsiveStyle(size && size.width, size && size.height),
      };

      if (size && size.width !== null) {
        iframeAttributes.width = String(size.width);
      }

      if (size && size.height !== null) {
        iframeAttributes.height = String(size.height);
      }

      return [
        {
          type: 'openTag',
          tagName: 'iframe',
          classNames: ['toastui-media', 'toastui-media-drawio'],
          attributes: iframeAttributes,
        },
        { type: 'closeTag', tagName: 'iframe' },
      ];
    }

    if (isExcalidrawReference(destination)) {
      registerTagWhitelistIfPossible('iframe');
      const iframeAttributes: TokenAttrs = {
        src: createExcalidrawViewerUrl(destination, altText || 'Excalidraw'),
        title: altText || 'Excalidraw',
        loading: 'lazy',
        sandbox: 'allow-scripts allow-same-origin allow-popups',
        style: createExcalidrawResponsiveStyle(size?.width, size?.height),
      };

      if (size && size.width !== null) {
        iframeAttributes.width = String(size.width);
      }

      if (size && size.height !== null) {
        iframeAttributes.height = String(size.height);
      }

      return [
        {
          type: 'openTag',
          tagName: 'iframe',
          classNames: ['toastui-media', 'toastui-media-excalidraw'],
          attributes: iframeAttributes,
        },
        { type: 'closeTag', tagName: 'iframe' },
      ];
    }

    const result = origin!() as OpenTagToken | null;

    if (result && result.type === 'openTag') {
      const nodeTitle = linkNode.title;

      result.attributes = {
        ...(result.attributes || {}),
        referrerpolicy: 'no-referrer',
      };

      if (size) {
        if (size.width !== null) {
          result.attributes.width = String(size.width);
        }

        if (size.height !== null) {
          result.attributes.height = String(size.height);
        }

        if (result.attributes.title === nodeTitle) {
          delete result.attributes.title;
        }
      }
    }

    return result;
  },

  codeBlock(node: MdNode) {
    const { fenceLength, info } = node as CodeBlockMdNode;
    const parsedInfo = parseCodeBlockInfo(info);
    const preClasses = [];
    const codeAttrs: TokenAttrs = {};
    const preAttrs: TokenAttrs = {};
    let lineNumber: number | null = resolveCodeBlockLineNumber(node as CodeBlockMdNode, parsedInfo);

    if (fenceLength > 3) {
      codeAttrs['data-backticks'] = fenceLength;
    }

    if (parsedInfo.lineWrap) {
      preClasses.push('line-wrap');
      preAttrs['data-line-wrap'] = 'true';
      codeAttrs['data-line-wrap'] = 'true';
      lineNumber = null;
    }

    if (parsedInfo.language) {
      const lang = parsedInfo.language;

      preClasses.push(`lang-${lang}`);
      codeAttrs['data-language'] = lang;
    }

    if (lineNumber !== null) {
      preClasses.push('line-numbers');
      const lineCount = getCodeBlockLineCount(node.literal);
      const nums: string[] = [];

      for (let i = 0; i < lineCount; i += 1) {
        nums.push(String(lineNumber + i));
      }
      preAttrs['data-line-numbers'] = nums.join('\n');

      return [
        { type: 'openTag', tagName: 'pre', classNames: preClasses, attributes: preAttrs },
        { type: 'openTag', tagName: 'code', attributes: codeAttrs },
        { type: 'text', content: node.literal! },
        { type: 'closeTag', tagName: 'code' },
        { type: 'closeTag', tagName: 'pre' },
      ];
    }

    return [
      { type: 'openTag', tagName: 'pre', classNames: preClasses },
      { type: 'openTag', tagName: 'code', attributes: codeAttrs },
      { type: 'text', content: node.literal! },
      { type: 'closeTag', tagName: 'code' },
      { type: 'closeTag', tagName: 'pre' },
    ];
  },

  customInline(node: MdNode, { origin, entering, skipChildren }: Context) {
    const { info } = node as CustomInlineMdNode;

    if (info.indexOf('widget') !== -1 && entering) {
      skipChildren();
      const content = getWidgetContent(node as CustomInlineMdNode);
      const htmlInline = widgetToDOM(info, content).outerHTML;

      return [
        { type: 'openTag', tagName: 'span', classNames: ['tui-widget'] },
        { type: 'html', content: htmlInline },
        { type: 'closeTag', tagName: 'span' },
      ];
    }
    return origin!();
  },
};

const PLUGIN_LANGUAGES = [
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

export function getHTMLRenderConvertors(
  linkAttributes: LinkAttributes | null,
  customConvertors: CustomHTMLRenderer,
  resolveMediaPath?: ResolveMediaPath
) {
  const convertors = { ...baseConvertors };
  const resolvePath: ResolveMediaPath = resolveMediaPath || ((path) => path);

  convertors.image = (node: MdNode, { origin, entering, skipChildren }: Context) => {
    if (!entering) {
      return [];
    }

    if (skipChildren) {
      skipChildren();
    }

    const linkNode = node as LinkMdNode;
    const destination = normalizeMediaReference(String(linkNode.destination || '').trim());
    const altText = extractNodeText(linkNode.firstChild).trim() || 'media';
    const size = parseImageSizeSpec(linkNode.title);
    const inlineRecorder = parseInlineRecorderSource(destination);
    const embeddedVideo = parseVideoEmbedUrl(destination);

    if (inlineRecorder) {
      return createInlineRecorderTokens(inlineRecorder.id, altText || 'audio');
    }

    if (embeddedVideo) {
      registerTagWhitelistIfPossible('iframe');
      const iframeAttributes: TokenAttrs = {
        src: resolvePath(embeddedVideo.embedUrl, 'embed'),
        title: altText,
        loading: 'lazy',
        allow:
          'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
        allowfullscreen: '',
        referrerpolicy: 'strict-origin-when-cross-origin',
      };

      if (size && size.width !== null) {
        iframeAttributes.width = String(size.width);
      }

      if (size && size.height !== null) {
        iframeAttributes.height = String(size.height);
      }

      return [
        {
          type: 'openTag',
          tagName: 'iframe',
          classNames: ['toastui-media', 'toastui-media-video-host'],
          attributes: iframeAttributes,
        },
        { type: 'closeTag', tagName: 'iframe' },
      ];
    }

    if (isAudioReference(destination)) {
      registerTagWhitelistIfPossible('audio');
      const resolvedAudio = resolvePath(destination, 'audio');

      return [
        {
          type: 'openTag',
          tagName: 'audio',
          classNames: ['toastui-media', 'toastui-media-audio'],
          attributes: {
            controls: '',
            preload: 'metadata',
            src: resolvedAudio,
          },
        },
        { type: 'closeTag', tagName: 'audio' },
      ];
    }

    if (isVideoFileReference(destination)) {
      registerTagWhitelistIfPossible('video');
      const resolvedVideo = resolvePath(destination, 'video');

      const attributes: TokenAttrs = {
        controls: '',
        preload: 'metadata',
        playsinline: '',
        src: resolvedVideo,
      };

      if (size && size.width !== null) {
        attributes.width = String(size.width);
      }

      if (size && size.height !== null) {
        attributes.height = String(size.height);
      }

      return [
        {
          type: 'openTag',
          tagName: 'video',
          classNames: ['toastui-media', 'toastui-media-video-file'],
          attributes,
        },
        { type: 'closeTag', tagName: 'video' },
      ];
    }

    if (isDrawioReference(destination)) {
      registerTagWhitelistIfPossible('iframe');
      const resolvedDrawio = resolvePath(destination, 'drawio');
      const iframeAttributes: TokenAttrs = {
        src: createDrawioViewerUrl(resolvedDrawio, altText || 'draw.io'),
        title: altText || 'draw.io',
        loading: 'lazy',
        sandbox: 'allow-scripts allow-same-origin allow-popups',
        style: createDrawioResponsiveStyle(size && size.width, size && size.height),
      };

      if (size && size.width !== null) {
        iframeAttributes.width = String(size.width);
      }

      if (size && size.height !== null) {
        iframeAttributes.height = String(size.height);
      }

      return [
        {
          type: 'openTag',
          tagName: 'iframe',
          classNames: ['toastui-media', 'toastui-media-drawio'],
          attributes: iframeAttributes,
        },
        { type: 'closeTag', tagName: 'iframe' },
      ];
    }

    if (isExcalidrawReference(destination)) {
      registerTagWhitelistIfPossible('iframe');
      const resolvedExcalidraw = resolvePath(destination, 'excalidraw');
      const iframeAttributes: TokenAttrs = {
        src: createExcalidrawViewerUrl(resolvedExcalidraw, altText || 'Excalidraw'),
        title: altText || 'Excalidraw',
        loading: 'lazy',
        sandbox: 'allow-scripts allow-same-origin allow-popups',
        style: createExcalidrawResponsiveStyle(size && size.width, size && size.height),
      };

      if (size && size.width !== null) {
        iframeAttributes.width = String(size.width);
      }

      if (size && size.height !== null) {
        iframeAttributes.height = String(size.height);
      }

      return [
        {
          type: 'openTag',
          tagName: 'iframe',
          classNames: ['toastui-media', 'toastui-media-excalidraw'],
          attributes: iframeAttributes,
        },
        { type: 'closeTag', tagName: 'iframe' },
      ];
    }

    const result = origin!() as OpenTagToken | null;

    if (result && result.type === 'openTag') {
      const nodeTitle = linkNode.title;

      result.attributes = {
        ...(result.attributes || {}),
        src: resolvePath(destination, 'image'),
        referrerpolicy: 'no-referrer',
      };

      if (size) {
        if (size.width !== null) {
          result.attributes.width = String(size.width);
        }

        if (size.height !== null) {
          result.attributes.height = String(size.height);
        }

        if (result.attributes.title === nodeTitle) {
          delete result.attributes.title;
        }
      }
    }

    return result;
  };

  if (linkAttributes) {
    convertors.link = (_, { entering, origin }: Context) => {
      const result = origin!();

      if (entering) {
        (result as OpenTagToken).attributes = {
          ...(result as OpenTagToken).attributes,
          ...linkAttributes,
        } as TokenAttrs;
      }
      return result;
    };
  }

  if (customConvertors) {
    Object.keys(customConvertors).forEach((nodeType: string) => {
      const orgConvertor = convertors[nodeType];
      const customConvertor = customConvertors[nodeType]!;

      if (orgConvertor && typeof customConvertor === 'function') {
        convertors[nodeType] = (node, context) => {
          const newContext = { ...context };

          newContext.origin = () => orgConvertor(node, context);
          return customConvertor(node, newContext);
        };
      } else if (
        includes(['htmlBlock', 'htmlInline'], nodeType) &&
        typeof customConvertor !== 'function'
      ) {
        convertors[nodeType] = (node, context) => {
          const matched = node.literal!.match(reHTMLTag);

          if (matched) {
            const [rootHTML, openTagName, , closeTagName] = matched;
            const typeName = (openTagName || closeTagName).toLowerCase();
            const htmlConvertor = customConvertor[typeName];
            const childrenHTML = getChildrenHTML(node, typeName);

            if (htmlConvertor) {
              // copy for preventing to overwrite the originial property
              const newNode: HTMLMdNode = { ...node };

              newNode.attrs = getHTMLAttrsByHTMLString(rootHTML);
              newNode.childrenHTML = childrenHTML;
              newNode.type = typeName;
              context.entering = !reCloseTag.test(node.literal!);

              return htmlConvertor(newNode, context);
            }
          }
          return context.origin!();
        };
      } else {
        convertors[nodeType] = customConvertor as HTMLConvertor;
      }
    });

    const mergedCodeBlock = convertors.codeBlock!;

    convertors.codeBlock = (node: MdNode, context: Context) => {
      const { info } = node as CodeBlockMdNode;
      const lang = parseCodeBlockInfo(info).normalizedLanguage;

      if (PLUGIN_LANGUAGES.includes(lang) && typeof customConvertors[lang] === 'function') {
        return (customConvertors[lang] as HTMLConvertor)(node, context);
      }

      return mergedCodeBlock(node, context);
    };
  }

  return convertors;
}
