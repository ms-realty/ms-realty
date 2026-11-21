// C · a home on the client's own Deal (ADR 0015): the private page a participant opens from
// their Deal, also for a home that is not on the public website. Server-rendered, no JavaScript.
import "server-only";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { isCurrencyCode, isPublicLocale, type PublicLocale } from "@/domain/ids";
import { Ltr } from "@/i18n/bidi";
import { formatExactArea, formatMoney, formatNumber } from "@/i18n/format";
import { workflowCopy } from "@/i18n/workflow-copy";
import { readDealHome } from "@/server/cases/deal-home";
import { getEnv } from "@/server/config/env";
import { isAppError } from "@/server/errors";
import { buttonClass } from "@/ui/button-class";
import { type ScreenProps, WorkflowPage, WorkflowSection, workflowLink } from "./screens";

function money(locale: PublicLocale, value: unknown) {
  const amount = value as { amountMinor?: unknown; currency?: unknown } | null;
  return typeof amount?.amountMinor === "number" &&
    Number.isSafeInteger(amount.amountMinor) &&
    typeof amount.currency === "string" &&
    isCurrencyCode(amount.currency)
    ? formatMoney(locale, amount.amountMinor, amount.currency)
    : null;
}

export async function DealHomeScreen(props: ScreenProps & { id: string; reference: string }) {
  const locale: PublicLocale = isPublicLocale(props.locale) ? props.locale : "en";
  const c = workflowCopy(locale, "dealHome");
  let home: Awaited<ReturnType<typeof readDealHome>>;
  try {
    home = await readDealHome(getDb(), props.session, props.id, props.reference, locale);
  } catch (error) {
    if (isAppError(error) && ["not_found", "forbidden"].includes(error.code)) notFound();
    throw error;
  }
  const rent = home.purpose === "long_term_rent";
  const price =
    home.price.state === "withheld"
      ? c.priceOnRequest
      : home.rentAmount
        ? `${money(locale, home.rentAmount)} ${c.perMonth}`
        : money(locale, home.price.value);
  const measured = home.area.value as { value?: unknown } | null;
  const facts: [string, string | null][] = [
    [rent ? c.rent : c.price, price],
    [
      c.area,
      typeof measured?.value === "number" && measured.value > 0
        ? formatExactArea(locale, measured.value)
        : null,
    ],
    [
      c.bedrooms,
      typeof home.bedrooms.value === "number" ? formatNumber(locale, home.bedrooms.value) : null,
    ],
    [
      c.location,
      [home.location.neighborhood, home.location.settlement, home.location.region]
        .filter(Boolean)
        .join(", ") || null,
    ],
  ];
  const closed =
    home.commercialState === "sold" || home.commercialState === "let"
      ? c[home.commercialState]
      : home.commercialState === "withdrawn"
        ? c.withdrawn
        : null;
  return (
    <WorkflowPage {...props} title={home.title || home.reference} reference={home.reference}>
      <a
        className={`${workflowLink} inline-flex min-h-control items-center`}
        href={`/${props.locale}/overview/${home.caseId}`}
      >
        {c.back}
      </a>
      {closed ? <p role="status">{closed}</p> : <p>{c.lead}</p>}
      <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2" data-deal-home-facts>
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-dense text-text-muted">{label}</dt>
            <dd className="font-semibold">{value ? <Ltr>{value}</Ltr> : c.notKnown}</dd>
          </div>
        ))}
      </dl>
      {home.description ? (
        // The agency's source text is Bulgarian; a translation is public only once approved.
        <div lang="bg" className="whitespace-pre-wrap">
          {home.description}
        </div>
      ) : null}
      <WorkflowSection title={c.photos}>
        {home.photos.length ? (
          <div className="grid gap-5 sm:grid-cols-2">
            {home.photos.map((photo) => (
              <figure key={photo.id} className="space-y-2">
                {/* biome-ignore lint/performance/noImgElement: Private derivatives need the client session. */}
                <img
                  src={`/${props.locale}/properties/${home.caseId}/homes/${encodeURIComponent(home.reference)}/media/${photo.id}`}
                  alt={photo.alt}
                  className="h-auto w-full rounded-control"
                />
                {photo.caption ? <figcaption>{photo.caption}</figcaption> : null}
              </figure>
            ))}
          </div>
        ) : (
          <p>{c.noPhotos}</p>
        )}
      </WorkflowSection>
      {home.published ? (
        <a
          className={buttonClass("secondary", "max-w-full text-center")}
          href={`${getEnv().hosts.public}/${props.locale}/properties/${home.reference}/${home.reference.toLowerCase()}`}
        >
          {c.website}
        </a>
      ) : null}
    </WorkflowPage>
  );
}
