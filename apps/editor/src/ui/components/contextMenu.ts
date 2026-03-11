import { ContextMenuItem, ExecCommand, Pos, VNode } from '@t/ui';
import { Emitter } from '@t/event';
import { closest, cls } from '@/utils/dom';
import html from '../vdom/template';
import { Component } from '../vdom/component';

interface State {
  pos: Pos | null;
  menuGroups: ContextMenuItem[][];
}

interface Props {
  eventEmitter: Emitter;
  execCommand: ExecCommand;
}

export class ContextMenu extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      pos: null,
      menuGroups: [],
    };
    this.addEvent();
  }

  addEvent() {
    this.props.eventEmitter.listen('contextmenu', ({ pos, menuGroups }) => {
      this.setState({ pos: this.normalizePos(pos), menuGroups });
    });
  }

  mounted() {
    document.addEventListener('click', this.handleClickDocument);
  }

  updated() {
    this.adjustPositionToViewport();
  }

  beforeDestroy() {
    document.removeEventListener('click', this.handleClickDocument);
  }

  private handleClickDocument = (ev: MouseEvent) => {
    if (!closest(ev.target as HTMLElement, `.${cls('context-menu')}`)) {
      this.setState({ pos: null });
    }
  };

  private normalizePos(pos: Pos) {
    const { left, top } = pos;
    const numericLeft = typeof left === 'number' ? left : Number.parseFloat(String(left)) || 0;
    const numericTop = typeof top === 'number' ? top : Number.parseFloat(String(top)) || 0;

    return {
      left: numericLeft,
      top: numericTop,
    };
  }

  private adjustPositionToViewport() {
    const menuEl = this.refs.el as HTMLElement | undefined;
    const { pos } = this.state;

    if (!menuEl || !pos) {
      return;
    }

    const rootEl = closest(menuEl, `.${cls('defaultUI')}`) as HTMLElement | null;
    const rootRect = rootEl?.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewportLeft = viewport?.offsetLeft ?? 0;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportWidth = viewport?.width ?? window.innerWidth;
    const viewportHeight = viewport?.height ?? window.innerHeight;
    const margin = 8;

    const absLeft = (rootRect?.left ?? 0) + pos.left;
    const absTop = (rootRect?.top ?? 0) + pos.top;
    const menuRect = menuEl.getBoundingClientRect();

    const minLeft = viewportLeft + margin;
    const minTop = viewportTop + margin;
    const maxLeft = Math.max(minLeft, viewportLeft + viewportWidth - menuRect.width - margin);
    const maxTop = Math.max(minTop, viewportTop + viewportHeight - menuRect.height - margin);
    const clampedLeft = Math.min(Math.max(minLeft, absLeft), maxLeft);
    const clampedTop = Math.min(Math.max(minTop, absTop), maxTop);
    const nextPos = {
      left: clampedLeft - (rootRect?.left ?? 0),
      top: clampedTop - (rootRect?.top ?? 0),
    };

    if (Math.abs(nextPos.left - pos.left) > 0.5 || Math.abs(nextPos.top - pos.top) > 0.5) {
      this.setState({ pos: nextPos });
    }
  }

  private getMenuGroupElements() {
    const { pos, menuGroups } = this.state;

    return pos
      ? menuGroups.reduce((acc, group) => {
          const menuItem: VNode[] = [];

          group.forEach(({ label, className = false, disabled, onClick }) => {
            const handleClick = () => {
              if (!disabled) {
                onClick!();
                this.setState({ pos: null });
              }
            };

            menuItem.push(
              html`
                <li
                  onClick=${handleClick}
                  class="menu-item${disabled ? ' disabled' : ''}"
                  aria-role="menuitem"
                >
                  <span class="${className}">${label}</span>
                </li>
              `
            );
          });

          acc.push(
            html`<ul class="menu-group">
              ${menuItem}
            </ul>`
          );
          return acc;
        }, [] as VNode[])
      : [];
  }

  render() {
    const style = {
      display: this.state.pos ? 'block' : 'none',
      maxHeight: 'calc(100vh - 16px)',
      overflowY: 'auto',
      ...this.state.pos,
    };

    return html`<div
      class="${cls('context-menu')}"
      style=${style}
      aria-role="menu"
      ref=${(el: HTMLElement) => (this.refs.el = el)}
    >
      ${this.getMenuGroupElements()}
    </div>`;
  }
}
