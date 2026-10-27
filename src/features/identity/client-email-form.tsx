"use client";
import { useActionState, useEffect, useRef } from "react";
import { buttonClass } from "@/ui/button-class";
import { ErrorSummary } from "@/ui/error-summary";
import { controlClass, labelClass } from "@/ui/field-class";
import { requestClientAccessLink } from "./client-email-action";
import { accessErrorMessage, identityCopy } from "./copy";
export function ClientEmailForm({ locale, returnTo }: { locale: string; returnTo: string | null }) {
  const c = identityCopy(locale),
    flight = useRef(false),
    query = new URLSearchParams();
  if (returnTo) query.set("returnTo", returnTo);
  const [state, submit, pending] = useActionState(
    requestClientAccessLink.bind(null, locale, returnTo),
    { email: "", error: null, responseId: "initial" },
    `/${locale}/access${query.size ? `?${query}` : ""}`,
  );
  useEffect(() => {
    if (state.responseId && !pending) flight.current = false;
  }, [pending, state.responseId]);
  const invalid = state.error === "VALIDATION_FAILED",
    error = invalid ? c.invalidEmail : accessErrorMessage(c, state.error ?? undefined);
  return (
    <form
      action={submit}
      noValidate
      className="flex flex-col gap-4"
      aria-busy={pending || undefined}
      onSubmit={(event) => {
        if (flight.current) {
          event.preventDefault();
          return;
        }
        flight.current = true;
      }}
    >
      {error ? (
        <ErrorSummary
          title={error}
          errors={[
            {
              fieldId: "client-email",
              message: invalid ? `${c.emailLabel}: ${c.invalidEmail}` : error,
            },
          ]}
        />
      ) : null}
      <label className="flex flex-col gap-2" htmlFor="client-email">
        <span className={labelClass}>{c.emailLabel}</span>
        <input
          key={state.responseId}
          id="client-email"
          className={controlClass}
          name="email"
          type="email"
          autoComplete="email"
          maxLength={254}
          required
          dir="ltr"
          defaultValue={state.email}
          readOnly={pending}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? "client-email-error" : undefined}
        />
        {invalid ? (
          <p id="client-email-error" className="text-dense text-error">
            {c.invalidEmail}
          </p>
        ) : null}
      </label>
      <button className={buttonClass()} type="submit" aria-disabled={pending || undefined}>
        {c.sendLink}
      </button>
    </form>
  );
}
