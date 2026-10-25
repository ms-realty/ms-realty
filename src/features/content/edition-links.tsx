import { localeDirection, localeEndonyms, type PublicLocale } from "@/i18n/config";
import { contentLocaleCopy } from "./locale-copy";

export function ContentEditionLinks({
  shell,
  id,
  selected,
  editions,
}: {
  shell: string;
  id: string;
  selected: PublicLocale;
  editions: readonly { locale: PublicLocale }[];
}) {
  return (
    <nav aria-label={contentLocaleCopy(shell).editions} className="flex flex-wrap gap-4">
      {editions.map(({ locale }) => (
        <a
          key={locale}
          className="underline"
          lang={locale}
          dir={localeDirection(locale)}
          aria-current={locale === selected ? "page" : undefined}
          href={`/${shell}/content/${id}${locale === "bg" ? "" : `/editions/${locale}`}`}
        >
          {localeEndonyms[locale]}
        </a>
      ))}
    </nav>
  );
}
