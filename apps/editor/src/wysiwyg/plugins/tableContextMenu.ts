import { Plugin } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';

import { findCell, findCellElement } from '@/wysiwyg/helper/table';
import i18n from '@/i18n/i18n';

import { Emitter } from '@t/event';
import CellSelection from './selection/cellSelection';

interface ContextMenuInfo {
  action: string;
  command: string;
  payload?: {
    align: string;
  };
  className: string;
  disableInThead?: boolean;
}

const contextMenuGroups: ContextMenuInfo[][] = [
  [
    {
      action: 'Add row to up',
      command: 'addRowToUp',
      disableInThead: true,
      className: 'add-row-up',
    },
    {
      action: 'Add row to down',
      command: 'addRowToDown',
      disableInThead: true,
      className: 'add-row-down',
    },
    { action: 'Remove row', command: 'removeRow', disableInThead: true, className: 'remove-row' },
  ],
  [
    { action: 'Add column to left', command: 'addColumnToLeft', className: 'add-column-left' },
    { action: 'Add column to right', command: 'addColumnToRight', className: 'add-column-right' },
    { action: 'Remove column', command: 'removeColumn', className: 'remove-column' },
  ],
  [
    {
      action: 'Align column to left',
      command: 'alignColumn',
      payload: { align: 'left' },
      className: 'align-column-left',
    },
    {
      action: 'Align column to center',
      command: 'alignColumn',
      payload: { align: 'center' },
      className: 'align-column-center',
    },
    {
      action: 'Align column to right',
      command: 'alignColumn',
      payload: { align: 'right' },
      className: 'align-column-right',
    },
  ],
  [{ action: 'Remove table', command: 'removeTable', className: 'remove-table' }],
];

function createSelectionRestorer(view: EditorView, sel: CellSelection | null) {
  const savedStart = sel ? (sel as any).startCell.pos : -1;
  const savedEnd = sel ? (sel as any).endCell.pos : -1;

  return () => {
    if (savedStart < 0) {
      return;
    }

    if (view.state.selection instanceof CellSelection) {
      return;
    }

    try {
      const { doc } = view.state;
      const restored = new CellSelection(doc.resolve(savedStart), doc.resolve(savedEnd));

      view.dispatch(view.state.tr.setSelection(restored));
    } catch (e) {
      // positions became invalid
    }
  };
}

function getContextMenuGroups(
  eventEmitter: Emitter,
  inTableHead: boolean,
  restoreSelection: () => void
) {
  return contextMenuGroups
    .map((contextMenuGroup) =>
      contextMenuGroup.map(({ action, command, payload, disableInThead, className }) => {
        return {
          label: i18n.get(action),
          onClick: () => {
            restoreSelection();
            eventEmitter.emit('command', command, payload);
          },
          disabled: inTableHead && !!disableInThead,
          className,
        };
      })
    )
    .concat();
}

export function tableContextMenu(eventEmitter: Emitter) {
  return new Plugin({
    props: {
      handleDOMEvents: {
        contextmenu: (view: EditorView, ev: Event) => {
          const tableCell = findCellElement(ev.target as HTMLElement, view.dom);

          if (!tableCell) {
            return false;
          }

          let sel = view.state.selection;

          if (!(sel instanceof CellSelection)) {
            const last = (view as { __lastCellSelection?: CellSelection }).__lastCellSelection;

            if (last) {
              view.dispatch(view.state.tr.setSelection(last));
              sel = last;
            }
          }

          if (!(sel instanceof CellSelection)) {
            const domPos = view.posAtDOM(tableCell, 0);
            const resolved = view.state.doc.resolve(domPos);
            const cell = findCell(resolved);

            if (cell) {
              const cellOffset = resolved.before(cell.depth);
              const cellPos = view.state.doc.resolve(cellOffset);
              const tr = view.state.tr.setSelection(new CellSelection(cellPos));

              view.dispatch(tr);
              sel = view.state.selection;
            }
          }

          ev.preventDefault();
          ev.stopPropagation();

          const cellSel = sel instanceof CellSelection ? (sel as CellSelection) : null;
          const restoreSelection = createSelectionRestorer(view, cellSel);

          const { clientX, clientY } = ev as MouseEvent;
          const { left, top } = (view.dom.parentNode as HTMLElement).getBoundingClientRect();
          const inTableHead = tableCell.nodeName === 'TH';

          eventEmitter.emit('contextmenu', {
            pos: { left: `${clientX - left + 10}px`, top: `${clientY - top + 30}px` },
            menuGroups: getContextMenuGroups(eventEmitter, inTableHead, restoreSelection),
            tableCell,
            cellSelection: cellSel,
            restoreSelection,
          });

          return true;
        },
      },
    },
  });
}
