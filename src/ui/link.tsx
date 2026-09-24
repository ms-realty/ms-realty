"use client";

import { type ReactNode, useId } from "react";
import { Link as RACLink, type LinkProps as RACLinkProps } from "react-aria-components";
import { type ButtonVariant, buttonClass } from "./button";
import { cx } from "./cx";
import { ExternalIcon } from "./icons";

const linkBase = cx(
  "rounded-[2px] decoration-1 underline-offset-[0.2em] data-hovered:decoration-2",
  "data-disabled:cursor-not-allowed data-disabled:text-disabled-text data-disabled:no-underline",
);

export const linkClass = cx(
  linkBase,
  "text-link underline visited:text-link-visited data-pressed:text-action-pressed",
);

export type LinkProps = Omit<RACLinkProps, "className" | "children"> & {
  children: ReactNode;
  className?: string;
  /**
   * "inline" sits in running text; "standalone" gets its own line and the 44px target;
   * "plain" drops link colour and underline for composites (cards, pagination) that style it.
   */
  variant?: "inline" | "standalone" | "plain";
};

/**
 * Navigation link. Client-side routing comes from a RouterProvider in the app shell;
 * without one this is an ordinary anchor.
 */
export function Link({ variant = "inline", className, ...props }: LinkProps) {
  return (
    <RACLink
      {...props}
      className={cx(
        variant === "plain" ? linkBase : linkClass,
        variant === "standalone" && "inline-flex min-h-control items-center gap-1.5 font-semibold",
        className,
      )}
    />
  );
}

export type ButtonLinkProps = Omit<RACLinkProps, "className" | "children"> & {
  children: ReactNode;
  className?: string;
  variant?: ButtonVariant;
};

/** Navigation that is the page's call to action: a link that looks like a Button. */
export function ButtonLink({ variant = "primary", className, ...props }: ButtonLinkProps) {
  return (
    <RACLink
      {...props}
      className={buttonClass(variant, cx(variant !== "tertiary" && "no-underline", className))}
    />
  );
}

export type ExternalAppLinkProps = {
  href: string;
  /** The app that opens, e.g. "WhatsApp". Always visible: this is a handoff (A19). */
  appName: string;
  children: ReactNode;
  /**
   * States what happens next, e.g. "Opens WhatsApp. Nothing is sent until you send it there."
   * Never claim the message was sent.
   */
  handoffNote: string;
  className?: string;
};

/** Hands the person over to another app (messenger, maps, mail). It sends nothing itself. */
export function ExternalAppLink({
  href,
  appName,
  children,
  handoffNote,
  className,
}: ExternalAppLinkProps) {
  const noteId = useId();
  return (
    <span className={cx("inline-flex flex-col gap-1", className)}>
      <RACLink
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-describedby={noteId}
        className={cx(
          "inline-flex min-h-control items-center gap-2 self-start rounded-control border border-action bg-surface px-4 py-2",
          "text-compact font-semibold text-action no-underline",
          "data-hovered:bg-selected data-pressed:bg-selected data-pressed:text-action-pressed",
        )}
      >
        <span>{children}</span>
        <span className="inline-flex items-center gap-1 font-normal text-text-muted">
          <span aria-hidden="true">·</span>
          {appName}
          <ExternalIcon className="size-4" />
        </span>
      </RACLink>
      <span id={noteId} className="text-caption text-text-muted">
        {handoffNote}
      </span>
    </span>
  );
}
