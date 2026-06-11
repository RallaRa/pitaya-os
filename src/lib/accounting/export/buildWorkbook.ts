import * as XLSX from 'xlsx';
import type { ErpFormatAdapter, ErpExportContext, FlatJournalRow } from './types';

export function mapRowsToErpSheet(
  adapter: ErpFormatAdapter,
  rows: FlatJournalRow[],
  ctx: ErpExportContext,
) {
  return rows.map(row => adapter.mapRow(row, ctx));
}

export function buildVoucherExportWorkbook(
  adapter: ErpFormatAdapter,
  rows: FlatJournalRow[],
  ctx: ErpExportContext,
): Buffer {
  const sheetRows = mapRowsToErpSheet(adapter, rows, ctx);
  const ordered = sheetRows.map(row => {
    const orderedRow: Record<string, string | number> = {};
    for (const key of adapter.headers) {
      orderedRow[key] = row[key] ?? '';
    }
    return orderedRow;
  });

  const ws = XLSX.utils.json_to_sheet(ordered, { header: adapter.headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, adapter.sheetName.slice(0, 31));
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export function buildExportFilename(adapter: ErpFormatAdapter, startDate: string, endDate: string) {
  const range = startDate && endDate ? `_${startDate}_${endDate}` : '';
  return `${adapter.filePrefix}${range}.xlsx`;
}
