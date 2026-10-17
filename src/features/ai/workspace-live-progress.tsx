"use client";

import { useEffect, useState } from "react";
import { Notice } from "@/ui/notice";
import { workspaceCopy } from "./workspace-copy";
import { WorkspaceProgress, workspaceLink } from "./workspace-panels";
import { type WorkspaceProgressView, workspaceProgressSchema } from "./workspace-progress";
import { workspaceHref } from "./workspace-types";

const pollIntervalMs = 3000;
const requestTimeoutMs = 10000;
const maxPolls = 120;
type UpdateState = "idle" | "live" | "ready" | "unavailable" | "access_changed";

function canPoll(progress: WorkspaceProgressView) {
  return ["queued", "running"].includes(progress.state) && !progress.recovery.canResume;
}

/** Updates only the small progress panel; page forms and their values remain mounted. */
export function WorkspaceLiveProgress({
  initial,
  locale,
  workspaceId,
  latestUrl,
}: {
  initial: WorkspaceProgressView;
  locale: string;
  workspaceId: string;
  latestUrl: string;
}) {
  const [progress, setProgress] = useState(initial);
  const [updateState, setUpdateState] = useState<UpdateState>("idle");
  const copy = workspaceCopy(locale);

  useEffect(() => {
    let disposed = false;
    let polls = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let requestTimeout: ReturnType<typeof setTimeout> | undefined;
    let request: AbortController | undefined;
    setProgress(initial);
    setUpdateState(canPoll(initial) ? "live" : "idle");

    async function poll() {
      const controller = new AbortController();
      request = controller;
      polls += 1;
      requestTimeout = setTimeout(() => {
        controller.abort();
        if (!disposed) setUpdateState("unavailable");
      }, requestTimeoutMs);
      try {
        const response = await fetch(`${workspaceHref(locale, workspaceId)}/progress`, {
          cache: "no-store",
          credentials: "same-origin",
          redirect: "error",
          headers: { accept: "application/json" },
          signal: controller.signal,
        });
        if (disposed || controller.signal.aborted) return;
        if (!response.ok) {
          setUpdateState(
            [401, 403, 404, 410].includes(response.status) ? "access_changed" : "unavailable",
          );
          return;
        }
        const body: unknown = await response.json();
        if (disposed || controller.signal.aborted) return;
        const result = workspaceProgressSchema.safeParse(body);
        if (!result.success) {
          setUpdateState("unavailable");
          return;
        }
        setProgress(result.data);
        if (!canPoll(result.data)) {
          setUpdateState("ready");
          return;
        }
        if (polls >= maxPolls) {
          setUpdateState("unavailable");
          return;
        }
        // Schedule after the previous read completes so slow reads never overlap.
        timer = setTimeout(poll, pollIntervalMs);
      } catch {
        if (!disposed) setUpdateState("unavailable");
      } finally {
        clearTimeout(requestTimeout);
        request = undefined;
      }
    }

    if (canPoll(initial)) timer = setTimeout(poll, pollIntervalMs);
    return () => {
      disposed = true;
      clearTimeout(timer);
      clearTimeout(requestTimeout);
      request?.abort();
    };
  }, [initial, locale, workspaceId]);

  const unavailable = updateState === "unavailable" || updateState === "access_changed";
  return (
    <div className="space-y-4">
      <WorkspaceProgress locale={locale} view={progress} />
      <div aria-live="polite">
        {updateState === "live" ? (
          <p className="text-compact text-text-muted">{copy.liveProgress}</p>
        ) : null}
        {updateState === "ready" ? (
          <Notice
            tone="info"
            title={copy.resultsReady}
            action={
              <a className={workspaceLink} href={latestUrl}>
                {copy.openLatest}
              </a>
            }
          />
        ) : null}
        {unavailable ? (
          <Notice
            tone="warning"
            title={
              updateState === "access_changed"
                ? copy.progressAccessChanged
                : copy.progressUnavailable
            }
            action={
              <a className={workspaceLink} href={latestUrl}>
                {copy.refresh}
              </a>
            }
          />
        ) : null}
      </div>
    </div>
  );
}
