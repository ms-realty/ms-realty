import { headers } from "next/headers";
import { type PublicLocale, requestPathHeader } from "@/i18n/config";
import type { HostContext } from "@/server/config/hosts";
import { recoveryLinks } from "./recovery";
import { recoveryCopy } from "./recovery-copy";
import { RecoveryNavigation } from "./recovery-navigation";

/** A private 404 never confirms existence; its safe parent rechecks access on arrival. */
export async function NotFoundContent({
  locale,
  surface,
}: {
  locale: PublicLocale;
  surface: HostContext;
}) {
  const copy = recoveryCopy(locale);
  const requested = (await headers()).get(requestPathHeader);
  // Named by the URL alone (a deal, a listing…), the same whether it is missing or hidden.
  const { item } = recoveryLinks(surface, locale, requested);
  return (
    <div className="flex flex-col items-start gap-5 px-gutter py-8 sm:px-gutter-wide">
      <h1 className="text-heading font-semibold sm:text-title">{copy.notFound.title}</h1>
      <p className="max-w-prose text-body text-text-muted">
        {item ? copy.notFound.items[item] : copy.notFound.body}
      </p>
      <RecoveryNavigation locale={locale} surface={surface} requested={requested} primary />
    </div>
  );
}
