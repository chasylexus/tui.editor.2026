import { HookCallback } from '@t/editor';
import { Emitter } from '@t/event';
import { ExecCommand, HidePopup } from '@t/ui';
import i18n from '@/i18n/i18n';
import { cls } from '@/utils/dom';
import { Component } from '@/ui/vdom/component';
import html from '@/ui/vdom/template';
import { parseImageDimensionInput } from '@/convertors/imageSize';
import { createInlineRecorderSource } from '@/utils/media';

const TYPE_UI = 'ui';

interface Props {
  show: boolean;
  eventEmitter: Emitter;
  execCommand: ExecCommand;
  hidePopup: HidePopup;
}

interface State {
  file: File | null;
  fileNameElClassName: string;
}

interface ImageSizePayload {
  imageWidth?: number;
  imageHeight?: number;
}

export class ImagePopupBody extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      file: null,
      fileNameElClassName: '',
    };
  }

  private initialize = () => {
    const urlEl = this.refs.url as HTMLInputElement;
    const widthEl = this.refs.width as HTMLInputElement;
    const heightEl = this.refs.height as HTMLInputElement;

    urlEl.value = '';
    widthEl.value = '';
    heightEl.value = '';
    (this.refs.altText as HTMLInputElement).value = '';
    (this.refs.file as HTMLInputElement).value = '';

    urlEl.classList.remove('wrong');
    widthEl.classList.remove('wrong');
    heightEl.classList.remove('wrong');

    this.setState({
      file: null,
      fileNameElClassName: '',
    });
  };

  private getImageSizePayload(): ImageSizePayload | null {
    const widthEl = this.refs.width as HTMLInputElement;
    const heightEl = this.refs.height as HTMLInputElement;
    const widthRaw = widthEl.value;
    const heightRaw = heightEl.value;
    const width = parseImageDimensionInput(widthRaw);
    const height = parseImageDimensionInput(heightRaw);

    widthEl.classList.remove('wrong');
    heightEl.classList.remove('wrong');

    let valid = true;

    if (widthRaw.trim() && width === null) {
      widthEl.classList.add('wrong');
      valid = false;
    }

    if (heightRaw.trim() && height === null) {
      heightEl.classList.add('wrong');
      valid = false;
    }

    if (!valid) {
      return null;
    }

    return {
      ...(typeof width === 'number' && { imageWidth: width }),
      ...(typeof height === 'number' && { imageHeight: height }),
    };
  }

  private emitAddImageBlob(fileFromState?: File | null) {
    const sizePayload = this.getImageSizePayload();
    const { files } = this.refs.file as HTMLInputElement;
    const altTextEl = this.refs.altText as HTMLInputElement;
    const mediaFile = fileFromState || this.state.file || (files?.length ? files.item(0) : null);
    let fileNameElClassName = ' wrong';

    if (!sizePayload) {
      return;
    }

    if (mediaFile) {
      fileNameElClassName = '';
      const hookCallback: HookCallback = (url, text) =>
        this.props.execCommand('addImage', {
          imageUrl: url,
          altText: text || altTextEl.value || mediaFile.name || 'media',
          ...sizePayload,
        });

      this.props.eventEmitter.emit('addImageBlobHook', mediaFile, hookCallback, TYPE_UI);
    }
    this.setState({ fileNameElClassName });
  }

  private emitAddImage() {
    const imageUrlEl = this.refs.url as HTMLInputElement;
    const altTextEl = this.refs.altText as HTMLInputElement;
    const imageUrl = imageUrlEl.value;
    const altText = altTextEl.value || 'image';
    const sizePayload = this.getImageSizePayload();

    imageUrlEl.classList.remove('wrong');

    if (!imageUrl.length) {
      imageUrlEl.classList.add('wrong');
      return;
    }

    if (!sizePayload) {
      return;
    }

    if (imageUrl) {
      this.props.execCommand('addImage', { imageUrl, altText, ...sizePayload });
    }
  }

  private execCommand = () => {
    if (this.state.file) {
      this.emitAddImageBlob(this.state.file);
      return;
    }

    this.emitAddImage();
  };

  private showFileSelectBox = () => {
    this.refs.file.click();
  };

  private changeFile = (ev: Event) => {
    const { files } = ev.target as HTMLInputElement;

    if (files?.length) {
      this.setState({
        file: files[0],
        fileNameElClassName: '',
      });
      return;
    }

    this.setState({ file: null });
  };

  private createInlineRecorderId() {
    const randomSuffix = Math.random().toString(36).slice(2, 8);

    return `rec-${Date.now()}-${randomSuffix}`;
  }

  private insertInlineAudioRecorder = () => {
    const recorderId = this.createInlineRecorderId();
    const source = createInlineRecorderSource(recorderId);
    const label = (this.refs.altText as HTMLInputElement).value.trim() || 'audio';

    this.props.execCommand('addImage', {
      imageUrl: source,
      altText: label,
    });
    this.props.hidePopup();
  };

  private preventSelectStart(ev: Event) {
    ev.preventDefault();
  }

  updated() {
    if (!this.props.show) {
      this.initialize();
    }
  }

  render() {
    const { file, fileNameElClassName } = this.state;

    return html`
      <div aria-label="${i18n.get('Insert image')}">
        <label for="toastuiMediaRefInput">URL or path to file</label>
        <input
          id="toastuiMediaRefInput"
          type="text"
          placeholder="./audio.m4a or https://www.youtube.com/watch?v=..."
          ref=${(el: HTMLInputElement) => (this.refs.url = el)}
        />
        <div style="position: relative; margin-top: 8px;">
          <label for="toastuiImageFileInput">${i18n.get('Select image file')}</label>
          <span
            class="${cls('file-name')}${file ? ' has-file' : fileNameElClassName}"
            onClick=${this.showFileSelectBox}
            onSelectstart=${this.preventSelectStart}
          >
            ${file ? file.name : i18n.get('No file')}
          </span>
          <button
            type="button"
            class="${cls('file-select-button')}"
            onClick=${this.showFileSelectBox}
          >
            ${i18n.get('Choose a file')}
          </button>
          <input
            id="toastuiImageFileInput"
            type="file"
            accept="image/*,audio/*,video/*"
            onChange=${this.changeFile}
            ref=${(el: HTMLInputElement) => (this.refs.file = el)}
          />
        </div>
        <div class="${cls('media-recording')}">
          <button
            type="button"
            class="${cls('file-select-button')}"
            onClick=${this.insertInlineAudioRecorder}
          >
            Insert audio recorder button
          </button>
        </div>
        <label for="toastuiAltTextInput">${i18n.get('Description')}</label>
        <input
          id="toastuiAltTextInput"
          type="text"
          ref=${(el: HTMLInputElement) => (this.refs.altText = el)}
        />
        <label for="toastuiImageWidthInput">Width</label>
        <input
          id="toastuiImageWidthInput"
          type="number"
          min="1"
          step="1"
          ref=${(el: HTMLInputElement) => (this.refs.width = el)}
        />
        <label for="toastuiImageHeightInput">Height</label>
        <input
          id="toastuiImageHeightInput"
          type="number"
          min="1"
          step="1"
          ref=${(el: HTMLInputElement) => (this.refs.height = el)}
        />
        <div class="${cls('button-container')}">
          <button type="button" class="${cls('close-button')}" onClick=${this.props.hidePopup}>
            ${i18n.get('Cancel')}
          </button>
          <button type="button" class="${cls('ok-button')}" onClick=${this.execCommand}>
            ${i18n.get('OK')}
          </button>
        </div>
      </div>
    `;
  }
}
