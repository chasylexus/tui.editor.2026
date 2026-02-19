import addClass from 'tui-code-snippet/domUtil/addClass';
import removeClass from 'tui-code-snippet/domUtil/removeClass';

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

export class AnchorPopupBody extends Component<Props> {
  private initialize() {
    const { anchorId } = this.props.initialValues;
    const anchorIdEl = this.refs.anchorId as HTMLInputElement;

    removeClass(anchorIdEl, 'wrong');
    anchorIdEl.value = anchorId || '';
    anchorIdEl.focus();
    anchorIdEl.setSelectionRange(0, anchorIdEl.value.length);
  }

  private execCommand = () => {
    const anchorIdEl = this.refs.anchorId as HTMLInputElement;
    const { existingAnchor, anchorText } = this.props.initialValues;

    removeClass(anchorIdEl, 'wrong');

    if (anchorIdEl.value.trim().length < 1) {
      if (existingAnchor) {
        this.props.execCommand('removeCustomAnchor', { anchorText });
        return;
      }

      addClass(anchorIdEl, 'wrong');
      return;
    }

    this.props.execCommand('addCustomAnchor', {
      anchorId: anchorIdEl.value,
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
      <div aria-label="${i18n.get('Insert anchor')}">
        <label for="toastuiAnchorIdInput">${i18n.get('Anchor ID')}</label>
        <input
          id="toastuiAnchorIdInput"
          type="text"
          ref=${(el: HTMLInputElement) => (this.refs.anchorId = el)}
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
