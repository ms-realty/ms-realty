import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { isRoutableLocale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { Notice } from "@/ui/notice";
import { readApprovedContent } from "./content-source";
import { discoveryCopy } from "./copy";
import { DiscoveryPage } from "./page";

const labels = {
  bg: {
    area: "Информация за района",
    service: "Информация за услугата",
    help: "Помощ",
    contact: "Контакт",
    unavailable: "Одобрена информация за тази страница все още не е достъпна.",
    scope: "Обхват на прегледа",
  },
  en: {
    area: "Area information",
    service: "Service information",
    help: "Help",
    contact: "Contact",
    unavailable: "Approved information is not yet available for this page.",
    scope: "Review scope",
  },
  ru: {
    area: "Информация о районе",
    service: "Информация об услуге",
    help: "Помощь",
    contact: "Контакт",
    unavailable: "Одобренная информация для этой страницы пока недоступна.",
    scope: "Область проверки",
  },
  de: {
    area: "Ortsinformationen",
    service: "Serviceinformationen",
    help: "Hilfe",
    contact: "Kontakt",
    unavailable: "Freigegebene Informationen für diese Seite sind noch nicht verfügbar.",
    scope: "Prüfumfang",
  },
  nl: {
    area: "Gebiedsinformatie",
    service: "Dienstinformatie",
    help: "Hulp",
    contact: "Contact",
    unavailable: "Goedgekeurde informatie voor deze pagina is nog niet beschikbaar.",
    scope: "Reikwijdte van beoordeling",
  },
  el: {
    area: "Πληροφορίες περιοχής",
    service: "Πληροφορίες υπηρεσίας",
    help: "Βοήθεια",
    contact: "Επικοινωνία",
    unavailable: "Δεν υπάρχουν ακόμη εγκεκριμένες πληροφορίες για αυτή τη σελίδα.",
    scope: "Πεδίο ελέγχου",
  },
  he: {
    area: "מידע על האזור",
    service: "מידע על השירות",
    help: "עזרה",
    contact: "יצירת קשר",
    unavailable: "מידע מאושר לעמוד זה עדיין אינו זמין.",
    scope: "היקף הבדיקה",
  },
};

export async function ContentScreen({
  locale,
  kind,
  slug,
  route,
  intent,
}: {
  locale: string;
  kind: "area" | "service" | "help";
  slug: string;
  route: string;
  intent?: "seller_consultation" | "landlord_consultation";
}) {
  if (!isRoutableLocale(locale)) notFound();
  const copy = discoveryCopy(locale),
    label = labels[locale];
  let failed = false;
  const content = await readApprovedContent(getDb(), kind, slug, locale).catch(() => {
    failed = true;
    return null;
  });
  const source =
    !failed && !content && locale !== "bg"
      ? await readApprovedContent(getDb(), kind, slug, "bg").catch(() => null)
      : null;
  const title =
    content?.title ??
    (intent === "seller_consultation"
      ? copy.sell
      : intent === "landlord_consultation"
        ? copy.let
        : route === "/contact"
          ? label.contact
          : label[kind]);
  return (
    <DiscoveryPage>
      <h1 className="text-title font-semibold">{title}</h1>
      {content ? (
        <article lang={content.locale} className="max-w-reading space-y-5">
          {content.paragraphs.map((paragraph, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: paragraphs belong to this immutable, approved version and have no client state.
            <p key={index} className="whitespace-pre-wrap break-words">
              {paragraph}
            </p>
          ))}
          <dl className="space-y-2 border-t border-border pt-4 text-compact">
            <div>
              <dt>{label.scope}</dt>
              <dd>
                {content.reviewScope} · {content.jurisdiction}
              </dd>
            </div>
            <div>
              <dt>{copy.confirmedAt}</dt>
              <dd>
                <time dateTime={content.reviewedAt}>
                  {formatDateTime(locale, content.reviewedAt)}
                </time>
              </dd>
            </div>
          </dl>
        </article>
      ) : (
        <Notice
          tone={failed ? "warning" : "info"}
          title={failed ? copy.failed : label.unavailable}
        />
      )}
      {source ? (
        <a className="self-start underline" href={`/bg${route}`} hrefLang="bg">
          {copy.source}
        </a>
      ) : null}
      <a
        className="self-start underline"
        href={`/${locale}/inquire${intent ? `?purpose=${intent}` : ""}`}
      >
        {copy.ask}
      </a>
    </DiscoveryPage>
  );
}
