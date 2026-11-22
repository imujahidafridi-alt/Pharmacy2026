import React, { CSSProperties, ReactNode } from 'react';

export interface Column<T = any> {
  header: ReactNode;
  accessor?: string;
  align?: 'left' | 'center' | 'right';
  width?: string;
  cellStyle?: CSSProperties;
  render?: (row: T, index: number) => ReactNode;
}

export interface TableProps<T = any> {
  columns: Column<T>[];
  data: T[];
  emptyMessage?: ReactNode;
  onRowClick?: (row: T) => void;
}

export function Table<T extends Record<string, any> = any>({
  columns = [],
  data = [],
  emptyMessage = 'No records found',
  onRowClick,
}: TableProps<T>) {
  return (
    <div className="table-responsive border rounded shadow-sm bg-body">
      <table className="table table-hover align-middle mb-0">
        <thead className="table-light">
          <tr>
            {columns.map((col, idx) => (
              <th
                key={idx}
                style={{
                  textAlign: col.align || 'left',
                  width: col.width || 'auto',
                  whiteSpace: 'nowrap',
                  fontSize: '0.82rem',
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="text-center py-5 text-secondary"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, rowIdx) => (
              <tr
                key={row.id || rowIdx}
                onClick={() => onRowClick && onRowClick(row)}
                style={{ cursor: onRowClick ? 'pointer' : 'default' }}
              >
                {columns.map((col, colIdx) => (
                  <td
                    key={colIdx}
                    style={{
                      textAlign: col.align || 'left',
                      fontSize: '0.86rem',
                      ...col.cellStyle,
                    }}
                  >
                    {col.render ? col.render(row, rowIdx) : (col.accessor ? row[col.accessor] : null)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
