import type { ReactNode } from 'react';

import { useTranslation } from '../i18n';

export interface Column<Row> {
  header: string;
  cell: (row: Row) => ReactNode;
}

interface Props<Row> {
  /** Names the table for screen readers. */
  caption: string;
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  empty?: string;
}

export function Table<Row>({ caption, columns, rows, rowKey, empty }: Props<Row>) {
  const { t } = useTranslation();
  if (rows.length === 0) return <p className="muted">{empty ?? t('common:nothingHere')}</p>;
  return (
    <table className="table">
      <caption className="visually-hidden">{caption}</caption>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.header} scope="col">
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={rowKey(row)}>
            {columns.map((column) => (
              <td key={column.header}>{column.cell(row)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
