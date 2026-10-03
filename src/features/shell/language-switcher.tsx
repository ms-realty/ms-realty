"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { localeEndonyms, type PublicLocale } from "@/i18n/config";
import { LanguageSwitcher, type LanguageSwitcherProps } from "@/ui/language-switcher";

/**
 * Same page in another language: replaces only the leading locale segment and keeps the
 * query and fragment (filters, tracking parameters, an anchor), so the visitor keeps context.
 */
export function switchLocalePath(pathname: string, target: PublicLocale, suffix = ""): string {
  const rest = pathname.split("/").slice(2).join("/");
  return `${rest ? `/${target}/${rest}` : `/${target}`}${suffix}`;
}

/** The current query and fragment, as `?a=b#c`. The fragment is only known in the browser. */
export function useQueryAndHash(): string {
  const search = useSearchParams().toString();
  const [hash, setHash] = useState("");
  useEffect(() => {
    const update = () => setHash(window.location.hash);
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return `${search ? `?${search}` : ""}${hash}`;
}

/**
 * The design-system language switcher bound to the current page. Server-rendered links, so it
 * works before and without JavaScript; each is a full navigation, so html lang/dir and every
 * catalog change together, and proxy.ts records the choice.
 */
export function LocaleSwitcher({
  locale,
  locales,
  label,
  ...layout
}: {
  locale: PublicLocale;
  locales: readonly PublicLocale[];
  label: string;
} & Pick<LanguageSwitcherProps, "wide" | "align" | "className">) {
  const pathname = usePathname();
  const suffix = useQueryAndHash();
  return (
    <LanguageSwitcher
      {...layout}
      label={label}
      current={locale}
      options={locales.map((target) => ({
        locale: target,
        endonym: localeEndonyms[target],
        href: switchLocalePath(pathname, target, suffix),
      }))}
    />
  );
}
