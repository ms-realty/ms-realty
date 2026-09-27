// L05 access layout: one task, one heading, nothing private around it. The staff host uses it
// on its own (outside the workspace shell); the client host inside the journey shell.
import Image from "next/image";
import type { ReactNode } from "react";

export function AccessFrame({
  title,
  lead,
  standalone = false,
  children,
}: {
  title: string;
  lead?: ReactNode;
  /** Staff access pages have no shell: they carry the brand and the main landmark. */
  standalone?: boolean;
  children?: ReactNode;
}) {
  const Root = standalone ? "main" : "div";
  return (
    <Root className="mx-auto flex w-full max-w-prose flex-col gap-6 px-gutter py-12 lg:px-gutter-wide">
      {standalone ? (
        <Image src="/brand/logo-ms-realty.png" alt="MS Realty" width={86} height={44} priority />
      ) : null}
      <div className="flex flex-col gap-3">
        <h1 className="text-title font-semibold">{title}</h1>
        {lead ? <p className="text-text-muted">{lead}</p> : null}
      </div>
      {children}
    </Root>
  );
}

/** A form that posts a session-ending request; the server answers 303 to the sign-in page. */
export function SignOutForm({
  action,
  label,
  variant = "secondary",
}: {
  action: string;
  label: string;
  variant?: "secondary" | "tertiary";
}) {
  return (
    <form method="post" action={action}>
      <button
        type="submit"
        className={
          variant === "secondary"
            ? "inline-flex min-h-control items-center rounded-control border border-border bg-surface px-5 py-2 text-compact font-semibold text-action"
            : "inline-flex min-h-control items-center px-2 text-compact font-semibold text-action underline"
        }
      >
        {label}
      </button>
    </form>
  );
}
