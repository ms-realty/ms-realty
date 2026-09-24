"use client";

import type { ReactNode } from "react";
import { I18nProvider } from "react-aria-components";

/**
 * Gives React Aria the page locale, not the browser's: keyboard mirroring, number parsing and
 * formatting, calendar names and built-in labels follow the route (spec §18.2). Every root
 * layout renders it once.
 */
export function LocaleProvider({ locale, children }: { locale: string; children: ReactNode }) {
  return <I18nProvider locale={locale}>{children}</I18nProvider>;
}
