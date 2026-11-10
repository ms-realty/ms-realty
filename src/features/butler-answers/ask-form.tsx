"use client";
// The visitor's side of "Ask about this home" (ADR 0017). A plain form post that works without
// JavaScript (the route answers with a redirect back to the page at #ask-butler); with JavaScript
// the same post is sent in the background, the answer appears in place and focus moves to it.
import { type FormEvent, useEffect, useRef, useState } from "react";
import { buttonClass } from "@/ui/button-class";
import { controlClass, labelClass } from "@/ui/field-class";
import type { AnswerPanel } from "./panel";

export interface AskFormCopy {
  readonly label: string;
  readonly hint: string;
  readonly submit: string;
  readonly pending: string;
  readonly suggestions: string;
  readonly answerLabel: string;
  readonly asked: string;
  readonly handoff: string;
  readonly handoffNote: string;
}

export function AskForm({
  action,
  reference,
  manifestId,
  maxLength,
  copy,
  suggestions,
  initial,
  failed,
}: {
  action: string;
  reference: string;
  manifestId: string;
  maxLength: number;
  copy: AskFormCopy;
  suggestions: readonly string[];
  initial: AnswerPanel | null;
  /** Shown when the background request itself fails. */
  failed: AnswerPanel;
}) {
  const [panel, setPanel] = useState<AnswerPanel | null>(initial);
  const [pending, setPending] = useState(false);
  const answer = useRef<HTMLElement>(null);
  const fresh = useRef(false);

  // Focus follows a new answer, never the one the page arrived with.
  useEffect(() => {
    if (fresh.current && panel) {
      fresh.current = false;
      answer.current?.focus();
    }
  }, [panel]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    setPending(true);
    try {
      const response = await fetch(action, {
        method: "POST",
        body: new FormData(event.currentTarget, submitter),
        headers: { accept: "application/json" },
        credentials: "same-origin",
      });
      const body = (await response.json()) as { panel: AnswerPanel | null };
      fresh.current = true;
      setPanel(body.panel ?? failed);
    } catch {
      fresh.current = true;
      setPanel(failed);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        method="post"
        action={action}
        onSubmit={submit}
        className="flex flex-col gap-3"
        aria-busy={pending}
      >
        <input type="hidden" name="reference" value={reference} />
        <input type="hidden" name="manifest" value={manifestId} />
        <div className="flex flex-col gap-2">
          <label htmlFor="ask-butler-question" className={labelClass}>
            {copy.label}
          </label>
          <p id="ask-butler-hint" className="text-caption text-text-muted">
            {copy.hint}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              id="ask-butler-question"
              name="question"
              type="text"
              dir="auto"
              required
              maxLength={maxLength}
              autoComplete="off"
              enterKeyHint="send"
              aria-describedby="ask-butler-hint"
              defaultValue=""
              className={`${controlClass} min-w-0 flex-1`}
            />
            <button
              type="submit"
              className={buttonClass("primary")}
              aria-disabled={pending}
              onClick={(event) => {
                if (pending) event.preventDefault();
              }}
            >
              {pending ? copy.pending : copy.submit}
            </button>
          </div>
        </div>
        {suggestions.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-caption text-text-muted" id="ask-butler-suggestions">
              {copy.suggestions}
            </p>
            <ul aria-labelledby="ask-butler-suggestions" className="flex flex-wrap gap-2">
              {suggestions.map((text) => (
                <li key={text}>
                  <button
                    type="submit"
                    name="suggested"
                    value={text}
                    formNoValidate
                    className={buttonClass("secondary", "!px-4 text-start")}
                  >
                    {text}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </form>

      <div aria-live="polite" id="ask-butler-answer">
        {panel ? (
          <section
            ref={answer}
            tabIndex={-1}
            aria-labelledby="ask-butler-answer-label"
            className="flex flex-col gap-3 rounded-panel border border-assist-line bg-assist-soft p-4 outline-offset-4"
          >
            {panel.question ? (
              <p className="text-caption text-text-muted">
                {copy.asked}: <bdi dir="auto">{panel.question}</bdi>
              </p>
            ) : null}
            <p id="ask-butler-answer-label" className="text-dense font-semibold text-assist">
              {copy.answerLabel}
            </p>
            <p className="max-w-reading text-body">{panel.text}</p>
            {panel.sourceLine ? (
              <p className="text-caption text-text-muted">{panel.sourceLine}</p>
            ) : null}
            <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:gap-4">
              <a href={panel.handoffHref} className={buttonClass("secondary", "self-start")}>
                {copy.handoff}
              </a>
              <p className="text-caption text-text-muted">{copy.handoffNote}</p>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
