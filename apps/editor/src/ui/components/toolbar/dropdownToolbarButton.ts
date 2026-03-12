import {
  ExecCommand,
  SetPopupInfo,
  ToolbarItemInfo,
  GetBound,
  HideTooltip,
  ShowTooltip,
  ToolbarButtonInfo,
} from '@t/ui';
import { Emitter } from '@t/event';
import { closest, cls } from '@/utils/dom';
import html from '@/ui/vdom/template';
import { Component } from '@/ui/vdom/component';
import { ToolbarGroup } from './toolbarGroup';
import { connectHOC } from './buttonHoc';

interface Props {
  disabled: boolean;
  eventEmitter: Emitter;
  item: ToolbarButtonInfo;
  items: ToolbarItemInfo[];
  execCommand: ExecCommand;
  setPopupInfo: SetPopupInfo;
  showTooltip: ShowTooltip;
  hideTooltip: HideTooltip;
  getBound: GetBound;
}

interface State {
  dropdownPos: { right: number; top: number } | null;
  showDropdown: boolean;
}

const POPUP_INDENT = 4;
const DEFAULT_DROPDOWN_HEIGHT = 46;
const DEFAULT_TRIGGER_HEIGHT = 32;

class DropdownToolbarButtonComp extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { showDropdown: false, dropdownPos: null };
  }

  private getBound() {
    const rect = this.props.getBound(this.refs.el);
    const triggerHeight = this.refs.el?.offsetHeight || DEFAULT_TRIGGER_HEIGHT;
    const dropdownHeight = this.refs.dropdownEl?.offsetHeight || DEFAULT_DROPDOWN_HEIGHT;
    const triggerRect = this.refs.el.getBoundingClientRect();
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const spaceAbove = triggerRect.top;
    const spaceBelow = viewportHeight - triggerRect.bottom;
    const mobileRoot = closest(this.refs.el, `.${cls('mobile-device')}`) as HTMLElement | null;
    const openUpward =
      Boolean(mobileRoot) ||
      (spaceBelow < dropdownHeight + POPUP_INDENT && spaceAbove > spaceBelow);
    const top = openUpward
      ? triggerRect.top - dropdownHeight - POPUP_INDENT
      : triggerRect.bottom + POPUP_INDENT;

    if (mobileRoot) {
      const right = Math.max(POPUP_INDENT, viewportWidth - triggerRect.right);

      return {
        left: null,
        position: 'fixed',
        right,
        top: Math.max(POPUP_INDENT, top),
      };
    }

    return {
      ...rect,
      left: null,
      right: 10,
      top: Math.max(
        POPUP_INDENT,
        openUpward
          ? rect.top - triggerHeight - dropdownHeight - POPUP_INDENT
          : rect.top + POPUP_INDENT
      ),
    };
  }

  private handleClickDocument = ({ target }: MouseEvent) => {
    if (
      !closest(target as HTMLElement, `.${cls('dropdown-toolbar')}`) &&
      !closest(target as HTMLElement, '.more')
    ) {
      this.setState({ showDropdown: false, dropdownPos: null });
    }
  };

  mounted() {
    document.addEventListener('click', this.handleClickDocument);
  }

  updated() {
    if (this.state.showDropdown && !this.state.dropdownPos) {
      this.setState({ dropdownPos: this.getBound() });
    }
  }

  beforeDestroy() {
    document.removeEventListener('click', this.handleClickDocument);
  }

  private showTooltip = () => {
    this.props.showTooltip(this.refs.el);
  };

  render() {
    const { showDropdown, dropdownPos } = this.state;
    const { disabled, item, items, hideTooltip } = this.props;
    const visibleItems = items.filter((dropdownItem) => !dropdownItem.hidden);
    const groupStyle = visibleItems.length ? null : { display: 'none' };
    const dropdownStyle = showDropdown ? null : { display: 'none' };

    return html`
      <div class="${cls('toolbar-group')}" style=${groupStyle}>
        <button
          ref=${(el: HTMLElement) => (this.refs.el = el)}
          type="button"
          class=${item.className}
          onClick=${() => this.setState({ showDropdown: true })}
          onMouseover=${this.showTooltip}
          onMouseout=${hideTooltip}
          disabled=${disabled}
        ></button>
        <div
          class="${cls('dropdown-toolbar')}"
          style=${{ ...dropdownStyle, ...dropdownPos }}
          ref=${(el: HTMLElement) => (this.refs.dropdownEl = el)}
        >
          ${visibleItems.length
            ? visibleItems.map(
                (group, index) => html`
                  <${ToolbarGroup}
                    group=${group}
                    hiddenDivider=${index === visibleItems.length - 1 ||
                    (visibleItems as ToolbarButtonInfo[])[index + 1]?.hidden}
                    ...${this.props}
                  />
                `
              )
            : null}
        </div>
      </div>
    `;
  }
}
export const DropdownToolbarButton = connectHOC(DropdownToolbarButtonComp);
