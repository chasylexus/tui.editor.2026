import { Schema, Node, Slice, Fragment, NodeType } from 'prosemirror-model';

import { isFromMso, convertMsoParagraphsToList } from '@/wysiwyg/clipboard/pasteMsoList';
import { getTableContentFromSlice } from '@/wysiwyg/helper/table';
import { ALTERNATIVE_TAG_FOR_BR } from '@/utils/constants';

const START_FRAGMENT_COMMENT = '<!--StartFragment-->';
const END_FRAGMENT_COMMENT = '<!--EndFragment-->';

function getContentBetweenFragmentComments(html: string) {
  const startFragmentIndex = html.indexOf(START_FRAGMENT_COMMENT);
  const endFragmentIndex = html.lastIndexOf(END_FRAGMENT_COMMENT);

  if (startFragmentIndex > -1 && endFragmentIndex > -1) {
    html = html.slice(startFragmentIndex + START_FRAGMENT_COMMENT.length, endFragmentIndex);
  }

  return html.replace(/<br[^>]*>/g, ALTERNATIVE_TAG_FOR_BR);
}

function convertMsoTableToCompletedTable(html: string) {
  // wrap with <tr> if html contains dangling <td> tags
  // dangling <td> tag is that tag does not have <tr> as parent node
  if (/<\/td>((?!<\/tr>)[\s\S])*$/i.test(html)) {
    html = `<tr>${html}</tr>`;
  }
  // wrap with <table> if html contains dangling <tr> tags
  // dangling <tr> tag is that tag does not have <table> as parent node
  if (/<\/tr>((?!<\/table>)[\s\S])*$/i.test(html)) {
    html = `<table>${html}</table>`;
  }

  return html;
}

export function changePastedHTML(html: string) {
  html = getContentBetweenFragmentComments(html);
  html = convertMsoTableToCompletedTable(html);

  if (isFromMso(html)) {
    html = convertMsoParagraphsToList(html);
  }

  return html;
}

function getMaxColumnCount(rows: Node[]) {
  const row = rows.reduce((prevRow, currentRow) =>
    prevRow.childCount > currentRow.childCount ? prevRow : currentRow
  );

  return row.childCount;
}

function hasMergedCells(rows: Node[]) {
  return rows.some((row) => {
    for (let i = 0; i < row.childCount; i += 1) {
      const attrs = row.child(i).attrs;

      if (attrs.extended || (attrs.colspan && attrs.colspan > 1) || (attrs.rowspan && attrs.rowspan > 1)) {
        return true;
      }
    }

    return false;
  });
}

function getPlainCellAttrs(attrs: Record<string, any>) {
  const nextAttrs = { ...attrs };

  delete nextAttrs.colspan;
  delete nextAttrs.rowspan;
  delete nextAttrs.extended;

  return nextAttrs;
}

function cloneCellAs(cellNode: Node, cellType: NodeType) {
  return cellType.create(getPlainCellAttrs(cellNode.attrs), cellNode.content);
}

function createEmptyCell(cellType: NodeType) {
  return cellType.createAndFill()!;
}

function findNextSourceCell(row: Node, sourceIndex: number) {
  for (let index = sourceIndex; index < row.childCount; index += 1) {
    const candidate = row.child(index);

    if (!candidate.attrs.extended) {
      return { cell: candidate, nextIndex: index + 1 };
    }
  }

  return { cell: null, nextIndex: row.childCount };
}

function flattenMergedRows(rows: Node[], schema: Schema, startFromBody: boolean, isInTable: boolean) {
  const flattenedRows: Node[][] = [];
  let activeRowspans = new Map<number, { remaining: number; cell: Node }>();
  let maxColumnCount = 0;

  rows.forEach((row, rowIndex) => {
    const useBodyOnly = startFromBody && isInTable;
    const cellType =
      !useBodyOnly && rowIndex === 0 ? schema.nodes.tableHeadCell : schema.nodes.tableBodyCell;
    const nextActiveRowspans = new Map<number, { remaining: number; cell: Node }>();
    const flatCells: Node[] = [];
    let sourceIndex = 0;
    let colIndex = 0;

    while (true) {
      const activeRowspan = activeRowspans.get(colIndex);

      if (activeRowspan) {
        flatCells.push(cloneCellAs(activeRowspan.cell, cellType));

        if (activeRowspan.remaining > 1) {
          nextActiveRowspans.set(colIndex, {
            cell: activeRowspan.cell,
            remaining: activeRowspan.remaining - 1,
          });
        }

        colIndex += 1;
        continue;
      }

      const { cell: sourceCell, nextIndex } = findNextSourceCell(row, sourceIndex);

      if (!sourceCell) {
        const futureActiveCols = Array.from(activeRowspans.keys()).filter((col) => col > colIndex);

        if (!futureActiveCols.length) {
          break;
        }

        flatCells.push(createEmptyCell(cellType));
        colIndex += 1;
        continue;
      }

      sourceIndex = nextIndex;

      const colspan =
        typeof sourceCell.attrs.colspan === 'number' && sourceCell.attrs.colspan > 1
          ? sourceCell.attrs.colspan
          : 1;
      const rowspan =
        typeof sourceCell.attrs.rowspan === 'number' && sourceCell.attrs.rowspan > 1
          ? sourceCell.attrs.rowspan
          : 1;

      for (let offset = 0; offset < colspan; offset += 1) {
        flatCells.push(cloneCellAs(sourceCell, cellType));

        if (rowspan > 1) {
          nextActiveRowspans.set(colIndex + offset, {
            cell: sourceCell,
            remaining: rowspan - 1,
          });
        }
      }

      colIndex += colspan;
    }

    maxColumnCount = Math.max(maxColumnCount, flatCells.length);
    flattenedRows.push(flatCells);
    activeRowspans = nextActiveRowspans;
  });

  return flattenedRows.map((cells, rowIndex) => {
    const useBodyOnly = startFromBody && isInTable;
    const cellType =
      !useBodyOnly && rowIndex === 0 ? schema.nodes.tableHeadCell : schema.nodes.tableBodyCell;
    const paddedCells = cells.slice();

    while (paddedCells.length < maxColumnCount) {
      paddedCells.push(createEmptyCell(cellType));
    }

    return schema.nodes.tableRow.create(null, paddedCells);
  });
}

function createCells(orgRow: Node, maxColumnCount: number, cell: NodeType, keepMergedShape: boolean) {
  const cells = [];
  const cellCount = orgRow.childCount;

  for (let colIdx = 0; colIdx < maxColumnCount; colIdx += 1) {
    const sourceCell = colIdx < cellCount ? orgRow.child(colIdx) : null;

    // When the pasted table includes merged cells, missing positions can be
    // valid gaps covered by rowspan/colspan in previous rows. Do not pad them.
    if (keepMergedShape && (!sourceCell || sourceCell.attrs.extended)) {
      continue;
    }

    // For non-merged malformed tables, pad missing cells to keep rectangular shape.
    if (!sourceCell || sourceCell.attrs.extended) {
      cells.push(cell.createAndFill()!);
      continue;
    }

    cells.push(cell.create(sourceCell.attrs, sourceCell.content));
  }

  return cells;
}

export function copyTableHeadRow(
  orgRow: Node,
  maxColumnCount: number,
  schema: Schema,
  keepMergedShape = false
) {
  const { tableRow, tableHeadCell } = schema.nodes;
  const cells = createCells(orgRow, maxColumnCount, tableHeadCell, keepMergedShape);

  return tableRow.create(null, cells);
}

export function copyTableBodyRow(
  orgRow: Node,
  maxColumnCount: number,
  schema: Schema,
  keepMergedShape = false
) {
  const { tableRow, tableBodyCell } = schema.nodes;
  const cells = createCells(orgRow, maxColumnCount, tableBodyCell, keepMergedShape);

  return tableRow.create(null, cells);
}

function creatTableBodyDummyRow(columnCount: number, schema: Schema) {
  const { tableRow, tableBodyCell } = schema.nodes;
  const cells = [];

  for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
    const dummyCell = tableBodyCell.createAndFill()!;

    cells.push(dummyCell);
  }

  return tableRow.create({ dummyRowForPasting: true }, cells);
}

export function createRowsFromPastingTable(tableContent: Fragment) {
  const tableHeadRows: Node[] = [];
  const tableBodyRows: Node[] = [];

  if (tableContent.firstChild!.type.name === 'tableHead') {
    const tableHead = tableContent.firstChild!;

    tableHead.forEach((row) => tableHeadRows.push(row));
  }

  if (tableContent.lastChild!.type.name === 'tableBody') {
    const tableBody = tableContent.lastChild!;

    tableBody.forEach((row) => tableBodyRows.push(row));
  }

  return [...tableHeadRows, ...tableBodyRows];
}

function createTableHead(tableHeadRow: Node, maxColumnCount: number, schema: Schema, keepMergedShape: boolean) {
  const copiedRow = copyTableHeadRow(tableHeadRow, maxColumnCount, schema, keepMergedShape);

  return schema.nodes.tableHead.create(null, copiedRow);
}

function createTableBody(
  tableBodyRows: Node[],
  maxColumnCount: number,
  schema: Schema,
  keepMergedShape: boolean
) {
  const copiedRows = tableBodyRows.map((tableBodyRow) =>
    copyTableBodyRow(tableBodyRow, maxColumnCount, schema, keepMergedShape)
  );

  if (!tableBodyRows.length) {
    const dummyTableRow = creatTableBodyDummyRow(maxColumnCount, schema);

    copiedRows.push(dummyTableRow);
  }

  return schema.nodes.tableBody.create(null, copiedRows);
}

function createTableFromPastingTable(
  rows: Node[],
  schema: Schema,
  startFromBody: boolean,
  isInTable: boolean
) {
  const keepMergedShape = hasMergedCells(rows);

  if (keepMergedShape) {
    const flattenedRows = flattenMergedRows(rows, schema, startFromBody, isInTable);

    if (startFromBody && isInTable) {
      return schema.nodes.table.create(null, [
        schema.nodes.tableBody.create(null, flattenedRows),
      ]);
    }

    const [tableHeadRow, ...tableBodyRows] = flattenedRows;
    const nodes = [schema.nodes.tableHead.create(null, tableHeadRow)];

    if (tableBodyRows.length) {
      nodes.push(schema.nodes.tableBody.create(null, tableBodyRows));
    }

    return schema.nodes.table.create(null, nodes);
  }

  const columnCount = getMaxColumnCount(rows);

  if (startFromBody && isInTable) {
    return schema.nodes.table.create(null, [createTableBody(rows, columnCount, schema, keepMergedShape)]);
  }

  const [tableHeadRow] = rows;
  const tableBodyRows = rows.slice(1);

  const nodes = [createTableHead(tableHeadRow, columnCount, schema, keepMergedShape)];

  if (tableBodyRows.length) {
    nodes.push(createTableBody(tableBodyRows, columnCount, schema, keepMergedShape));
  }

  return schema.nodes.table.create(null, nodes);
}

export function changePastedSlice(slice: Slice, schema: Schema, isInTable: boolean) {
  const nodes: Node[] = [];
  const { content, openStart, openEnd } = slice;

  content.forEach((node) => {
    if (node.type.name === 'table') {
      const tableContent = getTableContentFromSlice(new Slice(Fragment.from(node), 0, 0));

      if (tableContent) {
        const rows = createRowsFromPastingTable(tableContent);
        const startFromBody = tableContent.firstChild!.type.name === 'tableBody';
        const table = createTableFromPastingTable(rows, schema, startFromBody, isInTable);

        nodes.push(table);
      }
    } else {
      nodes.push(node);
    }
  });

  return new Slice(Fragment.from(nodes), openStart, openEnd);
}
