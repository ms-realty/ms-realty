import type { PublicLocale } from "@/i18n/config";
import type { HostContext } from "@/server/config/hosts";
import { buttonClass } from "@/ui/button-class";
import { brandPhone } from "./agency";
import { type RecoveryLink, type RecoverySection, recoveryLinks } from "./recovery";
import { recoveryCopy } from "./recovery-copy";

function labelText(copy: ReturnType<typeof recoveryCopy>, label: RecoveryLink["label"]) {
  if (label === "home") return copy.notFound.home;
  if (label.startsWith("section:"))
    return copy.recovery.sections[label.slice("section:".length) as RecoverySection];
  return copy.recovery[label as Exclude<RecoveryLink["label"], "home" | `section:${string}`>];
}

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
  const candidates: RecoveryLink[] = rootFallback
    ? [{ href: "/", label: "home" }]
    : parent
      ? [parent, home]
      : [home];
  if (!rootFallback && surface === "public" && parent?.label !== "search")
    candidates.unshift({ href: `/${locale}/properties`, label: "search" });
  // The page that failed is not a way out of it (a failing home keeps Try again and the shell).
  const here = requested?.split(/[?#]/)[0];
  const links = candidates.filter((link) => link.href !== here);
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
            {labelText(copy, link.label)}
          </a>
        ))}
      </div>
      {/* The agency line is for visitors and clients; staff recover inside the workspace. */}
      {surface === "staff" ? null : (
        <a
          className="inline-flex min-h-control items-center gap-1 text-link underline"
          href={`tel:${brandPhone.e164}`}
        >
          {beforePhone}
          <bdi dir="ltr">{brandPhone.display}</bdi>
          {afterPhone}
        </a>
      )}
    </div>
  );
}
