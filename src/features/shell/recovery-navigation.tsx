import type { PublicLocale } from "@/i18n/config";
import type { HostContext } from "@/server/config/hosts";
import { buttonClass } from "@/ui/button-class";
import { brandPhone } from "./agency";
import { recoveryLinks } from "./recovery";
import { recoveryCopy } from "./recovery-copy";

export function RecoveryNavigation({
  locale,
  surface,
  requested,
  primary = false,
  rootFallback = false,
}: {
  locale: PublicLocale;
  surface: HostContext;
  requested: string | null;
  primary?: boolean;
  rootFallback?: boolean;
}) {
  const copy = recoveryCopy(locale);
  const { home, parent } = recoveryLinks(surface, locale, requested);
  const links = rootFallback
    ? [{ href: "/", label: "home" as const }]
    : parent
      ? [parent, home]
      : [home];
  if (!rootFallback && surface === "public" && parent?.label !== "search")
    links.unshift({ href: `/${locale}/properties`, label: "search" });
  const [beforePhone, afterPhone] = copy.recovery.call.split("{phone}");
  return (
    <div className="flex flex-col items-start gap-4">
      <div className="flex flex-wrap gap-3">
        {links.map((link, index) => (
          <a
            key={link.href}
            href={link.href}
            className={buttonClass(primary && index === 0 ? "primary" : "secondary")}
          >
            {link.label === "home" ? copy.notFound.home : copy.recovery[link.label]}
          </a>
        ))}
      </div>
      <a
        className="inline-flex min-h-control items-center gap-1 text-link underline"
        href={`tel:${brandPhone.e164}`}
      >
        {beforePhone}
        <bdi dir="ltr">{brandPhone.display}</bdi>
        {afterPhone}
      </a>
    </div>
  );
}
