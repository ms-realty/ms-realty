import type { PublicLocale } from "@/i18n/config";
import { cx } from "@/ui/cx";
import { Skeleton, SkeletonRegion } from "@/ui/skeleton";
import type { LoadingKind, LoadingShape } from "./navigation-loading-state";
import { recoveryCopy } from "./recovery-copy";

function Rows() {
  return (
    <div className="flex flex-col gap-4">
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex gap-4 rounded-panel border border-border bg-surface p-5">
          <Skeleton className="size-12 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <Skeleton className="h-5 w-2/3 max-w-80" />
            <Skeleton className="h-4 w-1/2 max-w-64" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** S01: the destination's frame and heading position, a text status and no enabled action. */
export function RouteLoading({
  locale,
  kind,
  shape,
}: {
  locale: PublicLocale;
  kind: LoadingKind;
  shape: LoadingShape;
}) {
  const copy = recoveryCopy(locale).recovery;
  const status =
    kind === "list"
      ? copy.loadingList
      : kind === "listing"
        ? copy.loadingListing
        : copy.loadingRecord;
  const page = (
    <div className="flex min-w-0 flex-col gap-6">
      {shape.queue ? <Skeleton className="h-control w-40 lg:hidden" /> : null}
      <Skeleton className={cx("w-2/3 max-w-96", shape.heading)} />
      <p aria-hidden="true" className="text-text-muted">
        {status}
      </p>
      {kind === "list" ? (
        <Rows />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
          <div className="flex min-w-0 flex-col gap-4">
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
    </div>
  );
  return (
    <div data-loading-kind={kind} role="status" className={shape.frame}>
      <SkeletonRegion label={status}>
        {shape.queue ? (
          <div className="lg:grid lg:grid-cols-[17.5rem_minmax(0,1fr)] lg:items-start lg:gap-6">
            <div className="hidden min-w-0 flex-col gap-4 lg:flex">
              <Rows />
            </div>
            {page}
          </div>
        ) : (
          page
        )}
      </SkeletonRegion>
    </div>
  );
}
