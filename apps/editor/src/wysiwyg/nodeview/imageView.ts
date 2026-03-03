import { EditorView, NodeView } from 'prosemirror-view';
import { Node as ProsemirrorNode, Mark } from 'prosemirror-model';

import { isPositionInBox, setAttributes } from '@/utils/dom';
import { createTextSelection } from '@/helper/manipulation';
import { getCustomAttrs } from '@/wysiwyg/helper/node';
import {
  isAudioReference,
  isVideoFileReference,
  parseVideoEmbedUrl,
  parseInlineRecorderSource,
} from '@/utils/media';

import { Emitter } from '@t/event';

type GetPos = (() => number) | boolean;
type MediaType = 'image' | 'audio' | 'video' | 'embed';

const IMAGE_LINK_CLASS_NAME = 'image-link';

export class ImageView implements NodeView {
  dom: HTMLElement;

  private node: ProsemirrorNode;

  private view: EditorView;

  private getPos: GetPos;

  private eventEmitter: Emitter;

  private imageLink: Mark | null;

  constructor(node: ProsemirrorNode, view: EditorView, getPos: GetPos, eventEmitter: Emitter) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    this.eventEmitter = eventEmitter;
    this.imageLink = node.marks.filter(({ type }) => type.name === 'link')[0] ?? null;
    this.dom = this.createElement();

    this.bindEvent();
  }

  private createElement() {
    const image = this.createMediaElement(this.node);

    if (this.imageLink) {
      const wrapper = document.createElement('span');

      wrapper.className = IMAGE_LINK_CLASS_NAME;
      wrapper.appendChild(image);

      return wrapper;
    }

    return image;
  }

  private createImageElement(node: ProsemirrorNode) {
    const image = document.createElement('img');
    const { imageUrl, altText, imageWidth, imageHeight } = node.attrs;
    const attrs = getCustomAttrs(node.attrs);
    const resolvedImageUrl = this.resolveMediaPath(imageUrl, 'image');

    image.src = resolvedImageUrl;

    if (altText) {
      image.alt = altText;
    }

    if (typeof imageWidth === 'number' && imageWidth > 0) {
      image.width = imageWidth;
    }

    if (typeof imageHeight === 'number' && imageHeight > 0) {
      image.height = imageHeight;
    }

    setAttributes(attrs, image);

    return image;
  }

  private resolveMediaPath(path: string, mediaType: MediaType) {
    return this.eventEmitter.emitReduce('resolveMediaPath', path, mediaType);
  }

  private createEmbeddedVideoElement(node: ProsemirrorNode) {
    const iframe = document.createElement('iframe');
    const { imageUrl, altText, imageWidth, imageHeight } = node.attrs;
    const embeddedVideo = parseVideoEmbedUrl(imageUrl)!;
    const resolvedEmbedUrl = this.resolveMediaPath(embeddedVideo.embedUrl, 'embed');

    iframe.className = 'toastui-media toastui-media-video-host';
    iframe.src = resolvedEmbedUrl;
    iframe.title = altText || 'video';
    iframe.setAttribute('loading', 'lazy');
    iframe.allow =
      'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');

    if (typeof imageWidth === 'number' && imageWidth > 0) {
      iframe.width = String(imageWidth);
    }

    if (typeof imageHeight === 'number' && imageHeight > 0) {
      iframe.height = String(imageHeight);
    }

    return iframe;
  }

  private createInlineRecorderElement(node: ProsemirrorNode, recorderId: string) {
    const wrapper = document.createElement('span');
    const label = String(node.attrs.altText || 'audio');

    wrapper.className = 'toastui-inline-recorder';
    wrapper.dataset.recorderId = recorderId;
    wrapper.dataset.recorderLabel = label;

    const startButton = document.createElement('span');
    startButton.className = 'toastui-inline-recorder-action';
    startButton.dataset.recorderId = recorderId;
    startButton.dataset.recorderAction = 'start';
    startButton.setAttribute('role', 'button');
    startButton.setAttribute('tabindex', '0');
    startButton.textContent = 'Record';

    const pauseButton = document.createElement('span');
    pauseButton.className = 'toastui-inline-recorder-action';
    pauseButton.dataset.recorderId = recorderId;
    pauseButton.dataset.recorderAction = 'pause';
    pauseButton.dataset.disabled = 'true';
    pauseButton.setAttribute('role', 'button');
    pauseButton.setAttribute('tabindex', '0');
    pauseButton.textContent = 'Pause';

    const stopButton = document.createElement('span');
    stopButton.className = 'toastui-inline-recorder-action';
    stopButton.dataset.recorderId = recorderId;
    stopButton.dataset.recorderAction = 'stop';
    stopButton.dataset.disabled = 'true';
    stopButton.setAttribute('role', 'button');
    stopButton.setAttribute('tabindex', '0');
    stopButton.textContent = 'Stop';

    const dot = document.createElement('span');
    dot.className = 'toastui-inline-recorder-dot';
    dot.setAttribute('aria-hidden', 'true');

    const status = document.createElement('span');
    status.className = 'toastui-inline-recorder-status';
    status.dataset.recorderStatus = recorderId;
    status.textContent = 'Ready 000:00:00';

    wrapper.appendChild(startButton);
    wrapper.appendChild(pauseButton);
    wrapper.appendChild(stopButton);
    wrapper.appendChild(dot);
    wrapper.appendChild(status);

    return wrapper;
  }

  private createAudioElement(imageUrl: string) {
    const audio = document.createElement('audio');
    const resolvedAudioUrl = this.resolveMediaPath(imageUrl, 'audio');

    audio.className = 'toastui-media toastui-media-audio';
    audio.controls = true;
    audio.preload = 'metadata';
    audio.src = resolvedAudioUrl;

    return audio;
  }

  private createVideoElement(node: ProsemirrorNode) {
    const video = document.createElement('video');
    const { imageUrl, imageWidth, imageHeight } = node.attrs;
    const resolvedVideoUrl = this.resolveMediaPath(imageUrl, 'video');

    video.className = 'toastui-media toastui-media-video-file';
    video.controls = true;
    video.preload = 'metadata';
    video.playsInline = true;
    video.src = resolvedVideoUrl;

    if (typeof imageWidth === 'number' && imageWidth > 0) {
      video.width = imageWidth;
    }

    if (typeof imageHeight === 'number' && imageHeight > 0) {
      video.height = imageHeight;
    }

    return video;
  }

  private createMediaElement(node: ProsemirrorNode) {
    const { imageUrl, altText } = node.attrs;
    const inlineRecorder = parseInlineRecorderSource(imageUrl);

    if (inlineRecorder) {
      return this.createInlineRecorderElement(node, inlineRecorder.id || '');
    }

    if (parseVideoEmbedUrl(imageUrl)) {
      return this.createEmbeddedVideoElement(node);
    }

    if (isAudioReference(imageUrl)) {
      return this.createAudioElement(imageUrl);
    }

    if (isVideoFileReference(imageUrl)) {
      return this.createVideoElement(node);
    }

    return this.createImageElement(node);
  }

  private bindEvent() {
    if (this.imageLink) {
      this.dom.addEventListener('mousedown', this.handleMousedown);
    }
  }

  private handleMousedown = (ev: MouseEvent) => {
    ev.preventDefault();

    const { target, offsetX, offsetY } = ev;

    if (
      this.imageLink &&
      typeof this.getPos === 'function' &&
      (target as HTMLElement).classList.contains(IMAGE_LINK_CLASS_NAME)
    ) {
      const style = getComputedStyle(target as HTMLElement, ':before');

      ev.stopPropagation();

      if (isPositionInBox(style, offsetX, offsetY)) {
        const { tr } = this.view.state;
        const pos = this.getPos();

        tr.setSelection(createTextSelection(tr, pos, pos + 1));
        this.view.dispatch(tr);
        this.eventEmitter.emit('openPopup', 'link', this.imageLink.attrs);
      }
    }
  };

  stopEvent() {
    return true;
  }

  destroy() {
    if (this.imageLink) {
      this.dom.removeEventListener('mousedown', this.handleMousedown);
    }
  }
}
