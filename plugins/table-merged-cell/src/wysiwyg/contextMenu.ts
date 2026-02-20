import type { PluginContext } from '@techie_doubts/tui.editor.2026';

const TABLE_CELL_SELECT_CLASS = '.toastui-editor-cell-selected';

function hasSpanAttr(tableCell: Element) {
  return (
    Number(tableCell.getAttribute('colspan')) > 1 || Number(tableCell.getAttribute('rowspan')) > 1
  );
}

function hasSpanningCell(headOrBody: Element) {
  return Array.from(headOrBody.querySelectorAll(TABLE_CELL_SELECT_CLASS)).some(hasSpanAttr);
}

function isCellSelectedByDOM(headOrBody: Element) {
  return !!headOrBody.querySelectorAll(TABLE_CELL_SELECT_CLASS).length;
}

function isMultiCellSelection(cellSelection: any) {
  return cellSelection && cellSelection.startCell.pos !== cellSelection.endCell.pos;
}

function createMergedTableContextMenu(
  context: PluginContext,
  tableCell: Element,
  cellSelection: any,
  restoreSelection: () => void
) {
  const { i18n, eventEmitter } = context;
  const headOrBody = tableCell.parentElement!.parentElement!;
  const mergedTableContextMenu = [];

  const hasSelection = isMultiCellSelection(cellSelection) || isCellSelectedByDOM(headOrBody);

  if (hasSelection) {
    mergedTableContextMenu.push({
      label: i18n.get('Merge cells'),
      onClick: () => {
        restoreSelection();
        eventEmitter.emit('command', 'mergeCells');
      },
      className: 'merge-cells',
    });
  }

  if (hasSpanAttr(tableCell) || hasSpanningCell(headOrBody)) {
    mergedTableContextMenu.push({
      label: i18n.get('Split cells'),
      onClick: () => {
        restoreSelection();
        eventEmitter.emit('command', 'splitCells');
      },
      className: 'split-cells',
    });
  }

  return mergedTableContextMenu;
}

export function addMergedTableContextMenu(context: PluginContext) {
  context.eventEmitter.listen('contextmenu', (...args) => {
    const [{ menuGroups, tableCell, cellSelection, restoreSelection }] = args;
    const restore =
      restoreSelection ||
      (() => {
        /* noop */
      });
    const mergedTableContextMenu = createMergedTableContextMenu(
      context,
      tableCell,
      cellSelection,
      restore
    );

    if (mergedTableContextMenu.length) {
      menuGroups.splice(2, 0, mergedTableContextMenu);
    }
  });
}
