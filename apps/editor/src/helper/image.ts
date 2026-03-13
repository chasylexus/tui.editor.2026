import { HookCallback } from '@t/editor';
import { Emitter } from '@t/event';

const FILE_MEDIA_EXTENSIONS = ['drawio', 'dio', 'drawio.xml', 'excalidraw', 'excalidraw.json'];

function hasMeaningfulHtmlClipboard(htmlText: string) {
  if (!htmlText.trim()) {
    return false;
  }

  if (typeof DOMParser === 'undefined') {
    return /<(table|div|p|span|ul|ol|li|blockquote|pre|code|h[1-6]|a|strong|b|em|i|u|s|del|td|th)\b/i.test(
      htmlText
    );
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlText, 'text/html');
  const text = (doc.body?.textContent || '').replace(/\u00a0/g, ' ').trim();

  if (text) {
    return true;
  }

  return Boolean(
    doc.body?.querySelector(
      'table,div,p,span,ul,ol,li,blockquote,pre,code,h1,h2,h3,h4,h5,h6,a,strong,b,em,i,u,s,del,td,th'
    )
  );
}

export function hasMeaningfulClipboardText(clipboardData?: DataTransfer | null) {
  if (!clipboardData) {
    return false;
  }

  const plainText = clipboardData.getData('text/plain') || '';

  if (plainText.trim()) {
    return true;
  }

  const htmlText = clipboardData.getData('text/html') || '';

  return hasMeaningfulHtmlClipboard(htmlText);
}

export function addDefaultImageBlobHook(eventEmitter: Emitter) {
  eventEmitter.listen('addImageBlobHook', (blob: File, callback: HookCallback) => {
    const reader = new FileReader();

    reader.onload = ({ target }) => callback(target!.result as string, blob.name);
    reader.readAsDataURL(blob);
  });
}

export function emitImageBlobHook(eventEmitter: Emitter, blob: File, type: string) {
  const hook: HookCallback = (imageUrl, altText) => {
    eventEmitter.emit('command', 'addImage', {
      imageUrl,
      altText: altText || blob.name || 'image',
    });
  };

  eventEmitter.emit('addImageBlobHook', blob, hook, type);
}

export function pasteImageOnly(items: DataTransferItemList, clipboardData?: DataTransfer | null) {
  if (hasMeaningfulClipboardText(clipboardData)) {
    return null;
  }

  const images = Array.from(items).filter(({ type }) => type.indexOf('image') !== -1);

  if (images.length === 1) {
    const [item] = images;

    if (item) {
      return item.getAsFile();
    }
  }

  return null;
}

export function isMediaFile(file: File) {
  const type = String(file.type || '').toLowerCase();

  if (type.startsWith('image/') || type.startsWith('audio/') || type.startsWith('video/')) {
    return true;
  }

  const lowerName = String(file.name || '').toLowerCase();

  return FILE_MEDIA_EXTENSIONS.some((extension) => lowerName.endsWith(`.${extension}`));
}
