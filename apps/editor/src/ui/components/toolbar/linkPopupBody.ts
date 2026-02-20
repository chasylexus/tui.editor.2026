import { Emitter } from '@t/event';
import { ExecCommand, HidePopup, PopupInitialValues } from '@t/ui';
import i18n from '@/i18n/i18n';
import { cls } from '@/utils/dom';
import html from '@/ui/vdom/template';
import { Component } from '@/ui/vdom/component';

interface Props {
  eventEmitter: Emitter;
  execCommand: ExecCommand;
  hidePopup: HidePopup;
  show: boolean;
  initialValues: PopupInitialValues;
}

export class LinkPopupBody extends Component<Props> {
  private initialize() {
    const { linkUrl, linkText } = this.props.initialValues;

    const linkUrlEl = this.refs.url as HTMLInputElement;
    const linkTextEl = this.refs.text as HTMLInputElement;

    linkUrlEl.classList.remove('wrong');
    linkTextEl.classList.remove('wrong', 'disabled');
    linkTextEl.removeAttribute('disabled');

    if (linkUrl) {
      linkTextEl.classList.add('disabled');
      linkTextEl.setAttribute('disabled', 'disabled');
    }

    linkUrlEl.value = linkUrl || '';
    linkTextEl.value = linkText || '';

    linkUrlEl.focus();
    linkUrlEl.setSelectionRange(linkUrlEl.value.length, linkUrlEl.value.length);
  }

  private execCommand = () => {
    const linkUrlEl = this.refs.url as HTMLInputElement;
    const linkTextEl = this.refs.text as HTMLInputElement;

    linkUrlEl.classList.remove('wrong');
    linkTextEl.classList.remove('wrong');

    const hasInitialLink = typeof this.props.initialValues.linkUrl !== 'undefined';

    if (linkUrlEl.value.length < 1) {
      if (hasInitialLink) {
        this.props.execCommand('removeLink', { linkText: linkTextEl.value });
        return;
      }

      linkUrlEl.classList.add('wrong');
      return;
    }

    const checkLinkText = typeof this.props.initialValues.linkUrl === 'undefined';

    if (checkLinkText && linkTextEl.value.length < 1) {
      linkTextEl.classList.add('wrong');
      return;
    }

    this.props.execCommand('addLink', {
      linkUrl: linkUrlEl.value,
      linkText: linkTextEl.value,
    });
  };

  mounted() {
    this.initialize();
  }

  updated(prevProps: Props) {
    if (!prevProps.show && this.props.show) {
      this.initialize();
    }
  }

  render() {
    return html`
      <div aria-label="${i18n.get('Insert link')}">
        <label for="toastuiLinkUrlInput">${i18n.get('URL')}</label>
        <input
          id="toastuiLinkUrlInput"
          type="text"
          ref=${(el: HTMLInputElement) => (this.refs.url = el)}
        />
        <label for="toastuiLinkTextInput">${i18n.get('Link text')}</label>
        <input
          id="toastuiLinkTextInput"
          type="text"
          ref=${(el: HTMLInputElement) => (this.refs.text = el)}
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
