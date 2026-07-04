import * as React from 'react';

export type SearchBarSize = 'md' | 'lg';

export interface SearchDeal {
  value: string;
  label: string;
  /** Lucide icon name shown on the deal toggle. */
  icon?: string;
}

export interface SearchValue {
  deal: string;
  location: string;
  type: string;
  price: string;
}

export interface SearchBarProps {
  /** Deal toggles (Buy / Rent / Holiday lets). */
  deals?: SearchDeal[];
  /** Initially-selected deal value. @default first deal */
  defaultDeal?: string;
  /** Show the pill deal toggle above the bar. @default true */
  showDeals?: boolean;
  locationPlaceholder?: string;
  /** Property-type options for the Type select. */
  types?: string[];
  /** Max-price options for the Price select. */
  prices?: string[];
  /** @default 'lg' — the marketing hero size; use 'md' inside toolbars. */
  size?: SearchBarSize;
  /** Fired with the full query when the user hits Search. */
  onSearch?: (value: SearchValue) => void;
  className?: string;
}

/**
 * The signature MS property-search control: deal toggle + location, type and
 * max-price fields on one elevated bar. The centrepiece of the homepage hero and
 * the sticky header of search results.
 * @startingPoint section="Forms" subtitle="Hero property-search bar" viewport="900x150"
 */
export function SearchBar(props: SearchBarProps): JSX.Element;
