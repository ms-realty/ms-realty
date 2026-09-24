"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { localeDirection, type PublicLocale, suggestionDismissedCookie } from "@/i18n/config";
import { Banner, Button, ButtonLink } from "@/ui";
import { switchLocalePath, useQueryAndHash } from "./language-switcher";

const halfYear = 60 * 60 * 24 * 182;

export interface SuggestionCopy {
  readonly label: string;
  readonly message: string;
  readonly switchLabel: string;
  readonly dismiss: string;
}

/**
 * Offers the browser's preferred language without leaving the page (F01, A02). Written in
 * the suggested language so the visitor can read it; dismissing is remembered.
 */
export function LanguageSuggestion({
  suggested,
  copy,
}: {
  suggested: PublicLocale;
  copy: SuggestionCopy;
}) {
  const pathname = usePathname();
  const suffix = useQueryAndHash();
  const [open, setOpen] = useState(true);
  if (!open) return null;

  function dismiss() {
    // biome-ignore lint/suspicious/noDocumentCookie: a plain first-party preference cookie.
    document.cookie = `${suggestionDismissedCookie}=1; path=/; max-age=${halfYear}; samesite=lax`;
    // The focused button is about to disappear: keep keyboard users in place (WCAG 2.4.3).
    document.querySelector<HTMLElement>("main")?.focus();
    setOpen(false);
  }

  return (
    <section aria-label={copy.label} lang={suggested} dir={localeDirection(suggested)}>
      <Banner
        tone="info"
        action={
          <>
            <ButtonLink href={switchLocalePath(pathname, suggested, suffix)} hrefLang={suggested}>
              {copy.switchLabel}
            </ButtonLink>
            <Button variant="tertiary" onPress={dismiss}>
              {copy.dismiss}
            </Button>
          </>
        }
      >
        <p>{copy.message}</p>
      </Banner>
    </section>
  );
}
