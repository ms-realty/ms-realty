import { workCopy } from "./copy";
import { coverageCopy } from "./coverage-copy";

export function CoverageOwner({
  name,
  needsCoverage,
  locale,
  plain = false,
}: {
  name: string | null;
  needsCoverage: boolean;
  locale: string;
  /** Inside another link (a queue row), name the coverage queue without nesting a link. */
  plain?: boolean;
}) {
  if (!needsCoverage) return <>{name ?? workCopy(locale).noOwner}</>;
  const c = coverageCopy(locale);
  return (
    <span>
      {plain ? (
        <span className="font-semibold text-accent">{c.title}</span>
      ) : (
        <a
          className="font-semibold text-accent underline underline-offset-4"
          href={`/${locale}/coverage`}
        >
          {c.title}
        </a>
      )}
      {name ? (
        <>
          {" "}
          · {c.owner}: {name}
        </>
      ) : null}
    </span>
  );
}
