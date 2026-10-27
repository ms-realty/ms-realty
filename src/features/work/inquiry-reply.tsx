"use client";
import { useState } from "react";
import { z } from "zod";
import { buttonClass } from "@/ui/button-class";
import { controlClass } from "@/ui/field-class";
import { workCopy } from "./copy";
import { staffWorkflowCopy } from "./workflow-completion-copy";

export type ReviewedReplyDraft = {
  id: string;
  body: string;
  sourceVersion: number;
  reviewedAt: string;
};
export function inquiryEmailDraft(value: string, reference: string, body: string) {
  return z.email().safeParse(value).success && body.trim()
    ? `mailto:${encodeURIComponent(value)}?${new URLSearchParams({ subject: reference, body }).toString().replaceAll("+", "%20")}`
    : null;
}
/** O03/F06 human-owned native composer. Opening a draft is never a send/contact receipt. */
export function InquiryReply({
  locale,
  reference,
  contact,
  draft,
}: {
  locale: string;
  reference: string;
  contact: { kind: string; value: string; verification: string } | null;
  draft: ReviewedReplyDraft | null;
}) {
  const copy = staffWorkflowCopy(locale);
  const [mode, setMode] = useState("message");
  const [body, setBody] = useState("");
  const [note, setNote] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const href = contact?.kind === "email" ? inquiryEmailDraft(contact.value, reference, body) : null;
  return (
    <section
      className="space-y-4 rounded-card border border-border bg-surface p-5"
      id="inquiry-reply"
    >
      <h2 className="text-subheading font-semibold">{copy.replyTitle}</h2>
      <p>
        <bdi>{reference}</bdi>
        {contact ? (
          <>
            {" "}
            · <bdi>{contact.value}</bdi> ·{" "}
            {contact.verification === "verified"
              ? workCopy(locale).contactVerified
              : workCopy(locale).contactUnverified}
          </>
        ) : null}
      </p>
      <fieldset className="flex flex-wrap gap-4">
        <legend className="sr-only">{copy.replyTitle}</legend>
        {[
          ["message", copy.replyBody],
          ["note", copy.localNote],
        ].map(([value, label]) => (
          <label key={value} className="inline-flex min-h-control items-center gap-2">
            <input
              type="radio"
              name="reply-mode"
              value={value}
              checked={mode === value}
              onChange={() => setMode(value ?? "message")}
            />
            {label}
          </label>
        ))}
      </fieldset>
      <label className="block font-semibold" htmlFor="inquiry-reply-body">
        {mode === "message" ? copy.replyBody : copy.localNote}
      </label>
      <textarea
        id="inquiry-reply-body"
        className={`${controlClass} min-h-40`}
        maxLength={4000}
        value={mode === "message" ? body : note}
        onChange={(event) => {
          if (mode === "message") {
            setBody(event.target.value);
            setReviewed(false);
          } else setNote(event.target.value);
        }}
      />
      <p className="text-dense text-text-muted">{copy.replyLocal}</p>
      {draft && mode === "message" ? (
        <div className="space-y-3 rounded-control border border-divider p-4">
          <a
            className="inline-flex min-h-control items-center text-link underline"
            href={`/${locale}/operations/assistance/${draft.id}`}
          >
            {copy.viewSource}
          </a>
          <p>
            {copy.reviewed} · {workCopy(locale).revision}: {draft.sourceVersion}
          </p>
          <details>
            <summary className="min-h-control cursor-pointer py-2 font-semibold">
              {copy.replyBody}
            </summary>
            <p className="whitespace-pre-wrap">{draft.body}</p>
          </details>
          <button
            type="button"
            className={buttonClass("secondary")}
            disabled={Boolean(body)}
            onClick={() => {
              setBody(draft.body);
              setReviewed(false);
            }}
          >
            {copy.insertDraft}
          </button>
        </div>
      ) : null}
      {mode === "message" ? (
        <>
          <label className="flex min-h-control items-center gap-3">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(event) => setReviewed(event.target.checked)}
            />
            {copy.replyReview}
          </label>
          {href && reviewed ? (
            <a href={href} className={buttonClass("primary")}>
              {copy.openEmail}
            </a>
          ) : (
            <button type="button" disabled className={buttonClass("primary")}>
              {copy.openEmail}
            </button>
          )}
          <p className="text-dense">{copy.nativeBoundary}</p>
        </>
      ) : null}
    </section>
  );
}
