import type { PyretObject } from './pyret-data-instance';
import type { ReifiedValue } from './reify';

/** Read the complete runtime storage, never the display skeleton (which truncates rows). */
export function isRuntimeTable(value: PyretObject): boolean {
  return !!value.dict && typeof value.dict === 'object'
    && '_header-raw-array' in value.dict && '_rows-raw-array' in value.dict
    && (!value.brands || Object.keys(value.brands).some(key => key.includes('brandtable')));
}

/** Standalone Row wrappers are a separate Pyret value, not table row occurrences. */
export function isRuntimeRow(value: PyretObject): boolean {
  return Array.isArray(value.$rowData) && !!value.$underlyingTable;
}

export function tableContents(value: PyretObject): { headers: string[]; rows: ReifiedValue[][] } {
  const headers = value.dict?.['_header-raw-array'];
  const rows = value.dict?.['_rows-raw-array'];
  if (!Array.isArray(headers) || !Array.isArray(rows)
      || Array.from(headers).some(h => typeof h !== 'string')
      || new Set(headers).size !== headers.length
      || Array.from(rows).some(row => !Array.isArray(row) || row.length !== headers.length)) {
    throw new Error('Malformed Pyret table: unique string headers and rectangular rows required');
  }
  return { headers, rows };
}

/** Public Pyret syntax. Library constructors require `include tables` at evaluation. */
export function tableSource(value: PyretObject, child: (v: ReifiedValue) => string,
  columnName: (name: string) => string): string {
  const { headers, rows } = tableContents(value);
  if (!headers.length) {
    if (!rows.length) return 'empty-table([list: ])';
    // Avoid a deeply nested chain of method calls for large zero-column tables.
    return `for fold(spytial-table from empty-table([list: ]), spytial-row from range(0, ${rows.length})):\n  spytial-table.add-row([raw-row: ])\nend`;
  }
  let names: string[] | undefined;
  try { names = headers.map(columnName); } catch { /* String-named columns use the public library below. */ }
  if (names) {
    return `table: ${names.join(', ')}${rows.map(row => '\n  row: ' + row.map(child).join(', ')).join('')}\nend`;
  }
  return `[table-from-columns: ${headers.map((name, i) =>
    `{${child(name)}; [list: ${rows.map(row => child(row[i])).join(', ')}]}`).join(', ')}]`;
}
