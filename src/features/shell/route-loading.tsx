import type { PublicLocale } from "@/i18n/config";
import { Skeleton, SkeletonRegion } from "@/ui/skeleton";
import { recoveryCopy } from "./recovery-copy";

export function RouteLoading({
  locale,
  kind,
  title,
}: {
  locale: PublicLocale;
  kind: "list" | "record" | "listing";
  title?: string;
}) {
  const copy = recoveryCopy(locale).recovery;
  const status =
    kind === "list"
      ? copy.loadingList
      : kind === "listing"
        ? copy.loadingListing
        : copy.loadingRecord;
  return (
    <div
      data-loading-kind={kind}
      role="status"
      className="flex flex-col gap-6 px-gutter py-8 sm:px-gutter-wide"
    >
      {title ? <h1 className="text-heading font-semibold sm:text-title">{title}</h1> : null}
      <SkeletonRegion label={status}>
        <p aria-hidden="true" className="text-text-muted">
          {status}
        </p>
        {kind === "list" ? (
          <div className="flex flex-col gap-4">
            {[0, 1, 2].map((row) => (
              <div
                key={row}
                className="flex gap-4 rounded-panel border border-border bg-surface p-5"
              >
                <Skeleton className="size-12 shrink-0" />
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  <Skeleton className="h-5 w-2/3 max-w-80" />
                  <Skeleton className="h-4 w-1/2 max-w-64" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
            <div className="flex min-w-0 flex-col gap-4">
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className={kind === "listing" ? "aspect-4/3 w-full" : "h-40 w-full"} />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-3/4" />
            </div>
            <div className="flex flex-col gap-4 rounded-panel border border-border bg-surface p-5">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-control w-full" />
              <Skeleton className="h-control w-full" />
            </div>
          </div>
        )}
      </SkeletonRegion>
    </div>
  );
}
