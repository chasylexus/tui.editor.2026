import { ResolvedPos } from 'prosemirror-model';
import { EditorView } from 'prosemirror-view';
import { PluginKey } from 'prosemirror-state';

import { findCell, findCellElement } from '@/wysiwyg/helper/table';

import CellSelection from './cellSelection';

interface EventHandlers {
  mousedown: (ev: Event) => void;
  mousemove: (ev: Event) => void;
  mouseup: () => void;
}

export const pluginKey = new PluginKey('cellSelection');

const MOUSE_RIGHT_BUTTON = 2;

export default class TableSelection {
  private view: EditorView;

  private handlers: EventHandlers;

  private startCellPos: ResolvedPos | null;

  constructor(view: EditorView) {
    this.view = view;

    this.handlers = {
      mousedown: this.handleMousedown.bind(this),
      mousemove: this.handleMousemove.bind(this),
      mouseup: this.handleMouseup.bind(this),
    };

    this.startCellPos = null;

    this.init();
  }

  init() {
    this.view.dom.addEventListener('mousedown', this.handlers.mousedown, true);
  }

  handleMousedown(ev: Event) {
    const foundCell = findCellElement(ev.target as HTMLElement, this.view.dom);

    if ((ev as MouseEvent).button === MOUSE_RIGHT_BUTTON) {
      this.handleRightClick(foundCell, ev as MouseEvent);

      ev.preventDefault();
      ev.stopPropagation();
      return;
    }

    if (foundCell) {
      const startCellPos = this.getCellPos(ev as MouseEvent);

      if (startCellPos) {
        this.startCellPos = startCellPos;
      }

      this.bindEvent();
    }
  }

  handleRightClick(foundCell: HTMLElement | null, ev: MouseEvent) {
    const currentSelection = this.view.state.selection;

    if (currentSelection instanceof CellSelection) {
      (this.view as { __lastCellSelection?: CellSelection }).__lastCellSelection = currentSelection;
      this.view.dispatch(this.view.state.tr.setSelection(currentSelection));
      return;
    }

    if (!foundCell) {
      return;
    }

    const cellPos = this.getCellPos(ev);

    if (!cellPos) {
      return;
    }

    const selection = new CellSelection(cellPos);

    (this.view as { __lastCellSelection?: CellSelection }).__lastCellSelection = selection;
    this.view.dispatch(this.view.state.tr.setSelection(selection));
  }

  handleMousemove(ev: Event) {
    const prevEndCellOffset = pluginKey.getState(this.view.state);
    const endCellPos = this.getCellPos(ev as MouseEvent);
    const { startCellPos } = this;

    let prevEndCellPos;

    if (prevEndCellOffset) {
      prevEndCellPos = this.view.state.doc.resolve(prevEndCellOffset);
    } else if (startCellPos !== endCellPos) {
      prevEndCellPos = startCellPos;
    }

    if (prevEndCellPos && startCellPos && endCellPos) {
      this.setCellSelection(startCellPos, endCellPos);
    }
  }

  handleMouseup() {
    this.startCellPos = null;

    this.unbindEvent();

    if (pluginKey.getState(this.view.state) !== null) {
      this.view.dispatch(this.view.state.tr.setMeta(pluginKey, -1));
    }
  }

  bindEvent() {
    const { dom } = this.view;

    dom.addEventListener('mousemove', this.handlers.mousemove);
    dom.addEventListener('mouseup', this.handlers.mouseup);
  }

  unbindEvent() {
    const { dom } = this.view;

    dom.removeEventListener('mousemove', this.handlers.mousemove);
    dom.removeEventListener('mouseup', this.handlers.mouseup);
  }

  getCellPos({ clientX, clientY }: MouseEvent) {
    const mousePos = this.view.posAtCoords({ left: clientX, top: clientY });
    let fallbackCell: HTMLElement | null = null;

    if (!mousePos) {
      const fromPoint = document.elementFromPoint(clientX, clientY) as HTMLElement | null;

      if (fromPoint) {
        fallbackCell = findCellElement(fromPoint, this.view.dom);
      }
    }

    if (mousePos) {
      const { doc } = this.view.state;
      const currentPos = doc.resolve(mousePos.pos);
      const foundCell = findCell(currentPos);

      if (foundCell) {
        const cellOffset = currentPos.before(foundCell.depth);

        return doc.resolve(cellOffset);
      }
    }

    if (!fallbackCell) {
      const targetCell = findCellElement(
        this.view.dom.ownerDocument.activeElement as HTMLElement,
        this.view.dom
      );

      if (targetCell) {
        fallbackCell = targetCell;
      }
    }

    if (fallbackCell) {
      const { doc } = this.view.state;
      const domPos = this.view.posAtDOM(fallbackCell, 0);
      const resolved = doc.resolve(domPos);
      const foundCell = findCell(resolved);

      if (foundCell) {
        const cellOffset = resolved.before(foundCell.depth);

        return doc.resolve(cellOffset);
      }
    }

    return null;
  }

  setCellSelection(startCellPos: ResolvedPos, endCellPos: ResolvedPos) {
    const { selection, tr } = this.view.state;
    const starting = pluginKey.getState(this.view.state) === null;
    const cellSelection = new CellSelection(startCellPos, endCellPos);

    if (starting || !selection.eq(cellSelection)) {
      const newTr = tr.setSelection(cellSelection);

      if (starting) {
        newTr.setMeta(pluginKey, endCellPos.pos);
      }

      this.view.dispatch!(newTr);
    }
  }

  destroy() {
    this.view.dom.removeEventListener('mousedown', this.handlers.mousedown, true);
  }
}
