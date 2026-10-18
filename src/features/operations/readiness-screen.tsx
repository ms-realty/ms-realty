import type { GateId } from "@/release/schemas";
import type { ReleaseOverview } from "@/server/ops/readiness-view";
import { buttonClass } from "@/ui/button-class";
import { Notice } from "@/ui/notice";
import { TechnicalDetails } from "@/ui/technical-details";
import { DiscoveryPage } from "../discovery/page";
import { operationsCopy } from "./copy";

export function ReleaseReadinessScreen({
  locale,
  view,
  selected,
  impact = false,
}: {
  locale: string;
  view: ReleaseOverview;
  selected?: GateId;
  impact?: boolean;
}) {
  const copy = operationsCopy(locale);
  const root = `/${locale}/operations/readiness`;
  const current = view.summary.snapshotState === "current" && view.policyMatches;
  const gates = selected ? view.gates.filter((gate) => gate.id === selected) : view.gates;
  const names = copy.requirements as Record<string, string>;
  return (
    <DiscoveryPage>
      <header className="space-y-3">
        <h1 id={selected ? `release-${selected}` : undefined} className="text-title font-semibold">
          {selected ? copy.gates[selected].title : copy.title}
        </h1>
        <p className="max-w-reading">{copy.lead}</p>
        {selected ? (
          <a href={root} className={buttonClass("tertiary")}>
            {copy.allChecks}
          </a>
        ) : null}
      </header>
      <Notice
        tone={current && view.summary.verdict === "pass" ? "info" : "warning"}
        title={
          current
            ? view.summary.verdict === "pass"
              ? copy.recordedPass
              : copy.blocked
            : copy.unconfirmed
        }
      >
        <p>{current ? copy.boundary : copy.noCurrentReport}</p>
      </Notice>
      {selected ? (
        <a
          className={buttonClass("secondary")}
          href={`${root}/${selected}${impact ? "?view=impact" : ""}`}
        >
          {copy.checkAgain}
        </a>
      ) : null}
      {impact ? <p className="max-w-reading">{copy.checkOnly}</p> : null}
      <div className="grid min-w-0 gap-5">
        {gates.map((gate) => {
          const text = copy.gates[gate.id];
          return (
            <section
              key={gate.id}
              className="min-w-0 space-y-4 rounded-panel border border-border p-5"
              aria-labelledby={`release-${gate.id}`}
            >
              {!selected ? (
                <h2 id={`release-${gate.id}`} className="text-subheading font-semibold">
                  <a
                    href={`${root}/${gate.id}`}
                    aria-label={`${copy.openRequirement}: ${text.title}`}
                    className="inline-flex min-h-control items-center text-action underline decoration-border underline-offset-4"
                  >
                    {text.title}
                  </a>
                </h2>
              ) : null}
              <p className="max-w-reading">{text.help}</p>
              <p className="font-semibold">
                {current && gate.status === "pass" ? copy.confirmed : copy.needsEvidence}
              </p>
              {selected ? (
                <>
                  <h2 className="text-subheading font-semibold">{copy.requiredReports}</h2>
                  {gate.requirements.length ? (
                    <ul className="space-y-3">
                      {gate.requirements.map((requirement) => (
                        <li key={requirement.type}>
                          <details
                            data-release-report={requirement.type}
                            className="min-w-0 rounded-control bg-subtle"
                          >
                            <summary
                              aria-labelledby={`report-${gate.id}-${requirement.type}-name`}
                              aria-describedby={`report-${gate.id}-${requirement.type}-result`}
                              className="min-h-control cursor-pointer p-4"
                            >
                              <span
                                id={`report-${gate.id}-${requirement.type}-name`}
                                className="font-semibold"
                              >
                                {names[requirement.type] ?? copy.report}
                              </span>
                              <span
                                id={`report-${gate.id}-${requirement.type}-result`}
                                className="mt-2 block"
                              >
                                {copy.results[requirement.result]}
                              </span>
                            </summary>
                            <div className="space-y-4 px-4 pb-4">
                              {requirement.result === "not_confirmed" ? (
                                <p>{copy.missingReportHelp}</p>
                              ) : null}
                              <TechnicalDetails locale={locale}>
                                <bdi className="break-all">{requirement.type}</bdi>
                                {requirement.evidence.map((evidence) => (
                                  <p key={evidence.digest}>
                                    <bdi className="break-all">
                                      {evidence.id} · {evidence.digest}
                                    </bdi>
                                  </p>
                                ))}
                              </TechnicalDetails>
                            </div>
                          </details>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>{copy.noCurrentReport}</p>
                  )}
                  {impact ? (
                    <>
                      <h3 className="font-semibold">{copy.affected}</h3>
                      {gate.affects.length ? (
                        <ul className="space-y-2">
                          {gate.affects.map((id) => (
                            <li key={id}>
                              <a
                                className="inline-flex min-h-11 items-center underline"
                                href={`${root}/${id}`}
                              >
                                {copy.gates[id].title}
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>{copy.noDependentChecks}</p>
                      )}
                      <a
                        className={buttonClass("secondary")}
                        href={`/${locale}/operations/jobs?view=exceptions`}
                      >
                        {copy.openExceptions}
                      </a>
                    </>
                  ) : (
                    <a className={buttonClass("secondary")} href={`${root}/${gate.id}?view=impact`}>
                      {copy.seeImpact}
                    </a>
                  )}
                </>
              ) : null}
              <TechnicalDetails locale={locale}>
                <bdi>{gate.id}</bdi>
                <ul>
                  {[...new Set(gate.blockers)].map((blocker) => (
                    <li key={blocker} className="break-all">
                      <bdi>{blocker}</bdi>
                    </li>
                  ))}
                </ul>
              </TechnicalDetails>
            </section>
          );
        })}
      </div>
      {!selected ? (
        <a className={buttonClass("secondary")} href={root}>
          {copy.checkAgain}
        </a>
      ) : null}
      <TechnicalDetails locale={locale}>
        <p className="break-all">
          <bdi>{view.summary.release.sha ?? "—"}</bdi>
        </p>
        <p>
          <bdi>{view.summary.snapshotState}</bdi>
        </p>
      </TechnicalDetails>
    </DiscoveryPage>
  );
}
