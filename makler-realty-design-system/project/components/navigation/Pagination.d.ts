import * as React from 'react';

export interface PaginationProps extends React.HTMLAttributes<HTMLElement> {
  /** 1-based current page. @default 1 */
  page?: number;
  totalPages?: number;
  /** Page numbers shown either side of the current one. @default 1 */
  siblings?: number;
  onChange?: (page: number) => void;
}

/**
 * Page navigation for search results — prev/next arrows and numbered pages
 * with ellipsis collapsing. The current page fills with Sea.
 */
export function Pagination(props: PaginationProps): JSX.Element;
