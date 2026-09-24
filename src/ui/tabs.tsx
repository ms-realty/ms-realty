"use client";

import type { ReactNode } from "react";
import { Tabs as RACTabs, Tab, TabList, TabPanel } from "react-aria-components";
import { cx } from "./cx";

export type TabItem = { id: string; label: string; content: ReactNode };

export type TabsProps = {
  /** Names the tab list for assistive technology. */
  label: string;
  items: TabItem[];
  defaultSelectedKey?: string;
};

/** Switches between panels on the same page. Use links, not tabs, for navigation. */
export function Tabs({ label, items, defaultSelectedKey }: TabsProps) {
  return (
    <RACTabs defaultSelectedKey={defaultSelectedKey} className="flex flex-col gap-4">
      <TabList
        aria-label={label}
        items={items}
        className="flex gap-1 overflow-x-auto border-b border-divider"
      >
        {(item) => (
          <Tab
            id={item.id}
            className={cx(
              "-mb-px flex min-h-control cursor-pointer items-center whitespace-nowrap border-b-[3px] border-transparent px-4 text-compact text-text-muted outline-offset-[-2px]",
              "data-hovered:text-text data-selected:border-action data-selected:font-semibold data-selected:text-text",
              "data-focus-visible:outline-2 data-focus-visible:outline-focus",
              "forced-colors:border-[Canvas] forced-colors:data-selected:border-[Highlight]",
            )}
          >
            {item.label}
          </Tab>
        )}
      </TabList>
      {items.map((item) => (
        <TabPanel key={item.id} id={item.id} className="rounded-control text-compact text-text">
          {item.content}
        </TabPanel>
      ))}
    </RACTabs>
  );
}
