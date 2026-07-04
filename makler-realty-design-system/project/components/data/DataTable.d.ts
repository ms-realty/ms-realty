import * as React from 'react';

export interface DataTableColumn<Row = any> {
  key: string;
  label?: React.ReactNode;
  align?: 'left' | 'center' | 'right';
  width?: number | string;
  /** Custom cell renderer; defaults to `row[key]`. */
  render?: (row: Row) => React.ReactNode;
  /** Sort accessor; defaults to `row[key]`. */
  sort?: (row: Row) => any;
  /** @default true */
  sortable?: boolean;
}

export interface DataTableProps<Row = any> extends React.HTMLAttributes<HTMLDivElement> {
  columns: DataTableColumn<Row>[];
  rows: Row[];
  /** Rows get hover + pointer when set. */
  onRowClick?: (row: Row) => void;
  /** Tighter padding for back-office density. @default false */
  dense?: boolean;
  initialSort?: { key: string; dir: 1 | -1 };
  /** Rendered in a full-width cell when rows is empty (use EmptyState size="sm"). */
  empty?: React.ReactNode;
}

/**
 * Sortable listing/lead table — uppercase stone header, hairline rows,
 * hover wash. Cell helpers: .mk-tbl__primary / __muted / __mono / __price.
 * Promoted from the CRM kit's DataTable.
 * @startingPoint section="Data" subtitle="Sortable rows" viewport="700x320"
 */
export function DataTable<Row = any>(props: DataTableProps<Row>): JSX.Element;
