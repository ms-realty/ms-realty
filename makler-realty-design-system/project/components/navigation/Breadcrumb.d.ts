import * as React from 'react';

export interface Crumb {
  label: string;
  href?: string;
}

export interface BreadcrumbProps extends React.HTMLAttributes<HTMLElement> {
  /** Ordered trail; the last item renders as the current (unlinked) page. */
  items: Crumb[];
  /** Lucide separator icon between crumbs. @default 'chevron-right' */
  separator?: string;
}

/**
 * Location trail for listing and resort pages
 * (Home › For sale › Burgas › St Vlas).
 */
export function Breadcrumb(props: BreadcrumbProps): JSX.Element;
