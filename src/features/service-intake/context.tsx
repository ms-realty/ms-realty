import type { ServiceRequest } from "@/domain/service-scope";
import { inquiryReviewCopy } from "@/features/discovery/inquiry-review-copy";
import { isPublicLocale } from "@/i18n/config";
import { serviceCopy, serviceStaffCopy } from "./copy";
export function ServiceContext({
  locale,
  request,
  sourceUrl,
  current,
  staff = false,
}: {
  locale: string;
  request: ServiceRequest | null;
  sourceUrl: string | null;
  current?: boolean;
  staff?: boolean;
}) {
  const c = serviceCopy(locale),
    s = serviceStaffCopy(locale);
  return (
    <section
      className="min-w-0 space-y-4 rounded-panel border border-divider p-4 wrap-anywhere"
      aria-label={request ? c[request.topic] : c.needs}
    >
      <h2 className="font-semibold">{request ? c[request.topic] : c.needs}</h2>
      <p>{c.boundary}</p>
      {current === false ? <p role="status">{staff ? s.held : c.held}</p> : null}
      {sourceUrl ? (
        <a className="inline-flex min-h-control items-center underline" href={sourceUrl}>
          {inquiryReviewCopy(isPublicLocale(locale) ? locale : "bg").sourceContext}
        </a>
      ) : null}
      {request ? (
        <dl className="grid min-w-0 gap-4 sm:grid-cols-2">
          {[
            [c.location, request.location],
            [c.needs, request.needs],
            [c.from, request.requestedFrom],
            [c.until, request.requestedUntil],
            [c.relationship, request.relationship ? c.relationships[request.relationship] : null],
          ]
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-dense text-text-muted">{label}</dt>
                <dd className="whitespace-pre-wrap break-words">{value}</dd>
              </div>
            ))}
        </dl>
      ) : null}
      {staff ? <p className="text-dense text-text-muted">{s.quote}</p> : null}
    </section>
  );
}
