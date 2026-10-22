import type { GateId } from "@/release/schemas";
import type { ReleaseOverview } from "@/server/ops/readiness-view";
import { buttonClass } from "@/ui/button-class";
import { ChevronDownIcon } from "@/ui/icons";
import { Notice } from "@/ui/notice";
import { TechnicalDetails } from "@/ui/technical-details";
import { DiscoveryPage } from "../discovery/page";
import { operationsCopy } from "./copy";

export function ReleaseReadinessScreen({
  locale,
  view,
  selected,
  impact = false,
  readSaved = false,
}: {
  locale: string;
  view: ReleaseOverview;
  selected?: GateId;
  impact?: boolean;
  readSaved?: boolean;
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
      {selected && !impact ? (
        <>
          <div className="flex flex-wrap gap-3">
            <a className={buttonClass("secondary")} href={`${root}/${selected}?read=saved`}>
              {copy.checkAgain}
            </a>
            <a className={buttonClass("secondary")} href={`${root}/${selected}?view=impact`}>
              {copy.seeImpact}
            </a>
          </div>
          {readSaved ? <p role="status">{copy.savedRead}</p> : null}
        </>
      ) : null}
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
              {selected ? <p className="max-w-reading">{text.help}</p> : null}
              <p className="font-semibold">
                {current && gate.status === "pass" ? copy.confirmed : copy.needsEvidence}
              </p>
              {selected ? (
                <>
                  {impact ? (
                    <div id={`release-${gate.id}-impact`} className="scroll-mt-24 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <h2 className="flex min-h-control items-center text-subheading font-semibold">
                          {copy.affected}
                        </h2>
                        <a
                          className={buttonClass("secondary")}
                          href={`${root}/${gate.id}?view=impact&read=saved#release-${gate.id}-impact`}
                        >
                          {copy.checkAgain}
                        </a>
                      </div>
                      {readSaved ? (
                        <p role="status" className="max-w-reading">
                          <span>{copy.savedRead}</span>{" "}
                          {current && gate.status === "pass" ? copy.confirmed : copy.needsEvidence}
                        </p>
                      ) : null}
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
                      <p className="max-w-reading">{copy.checkOnly}</p>
                      <div className="border-t border-border pt-4">
                        <a
                          className={buttonClass("tertiary")}
                          href={`/${locale}/operations/jobs?view=exceptions`}
                        >
                          {copy.openExceptions}
                        </a>
                      </div>
                    </div>
                  ) : null}
                  <h2 className="text-subheading font-semibold">{copy.requiredReports}</h2>
                  {gate.requirements.length ? (
                    <ul className="space-y-3">
                      {gate.requirements.map((requirement) => (
                        <li key={requirement.type}>
                          <details
                            data-release-report={requirement.type}
                            className="group/report min-w-0 rounded-control border border-border bg-subtle"
                          >
                            <summary
                              aria-labelledby={`report-${gate.id}-${requirement.type}-action report-${gate.id}-${requirement.type}-name`}
                              aria-describedby={`report-${gate.id}-${requirement.type}-result`}
                              className="grid min-h-control cursor-pointer list-none gap-3 rounded-control p-4 hover:bg-selected focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center [&::-webkit-details-marker]:hidden"
                            >
                              <span className="min-w-0">
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
                              </span>
                              <span
                                id={`report-${gate.id}-${requirement.type}-action`}
                                className="flex items-center gap-2 text-compact font-semibold text-action underline underline-offset-4"
                              >
                                <span className="group-open/report:hidden">{copy.showReport}:</span>
                                <span className="hidden group-open/report:inline">
                                  {copy.hideReport}:
                                </span>
                                <ChevronDownIcon className="size-5 shrink-0 group-open/report:rotate-180" />
                              </span>
                            </summary>
                            <section
                              aria-label={`${copy.reportStatus}: ${names[requirement.type] ?? copy.report}`}
                              className="space-y-4 rounded-b-control border-t border-border bg-surface px-4 py-5"
                            >
                              <h3 className="font-semibold">
                                {copy.reportStatus}: {names[requirement.type] ?? copy.report}
                              </h3>
                              <p>{copy.results[requirement.result]}</p>
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
                            </section>
                          </details>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>{copy.noCurrentReport}</p>
                  )}
                </>
              ) : null}
              {selected ? (
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
              ) : null}
            </section>
          );
        })}
      </div>
      {!selected ? (
        <>
          <a className={buttonClass("secondary")} href={`${root}?read=saved`}>
            {copy.checkAgain}
          </a>
          {readSaved ? <p role="status">{copy.savedRead}</p> : null}
        </>
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
