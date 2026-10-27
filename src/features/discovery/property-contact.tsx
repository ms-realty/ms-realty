"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import styles from "./property-contact.module.css";

/** P05/L03: the compact action area yields to editing and reserves its actual page space. */
export function PropertyContactBar({
  reference,
  label,
  children,
}: {
  reference: string;
  label: string;
  children: ReactNode;
}) {
  const bar = useRef<HTMLElement>(null);
  const [keyboard, setKeyboard] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const property = "--msr-property-dock-height";
    const previous = root.style.getPropertyValue(property);
    const measure = () =>
      root.style.setProperty(property, `${bar.current?.getBoundingClientRect().height ?? 0}px`);
    const observer = new ResizeObserver(measure);
    if (bar.current) observer.observe(bar.current);
    measure();
    return () => {
      observer.disconnect();
      if (previous) root.style.setProperty(property, previous);
      else root.style.removeProperty(property);
    };
  }, []);
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      const active = document.activeElement;
      const editing =
        active instanceof HTMLElement &&
        (active.matches("input, textarea, select") || active.isContentEditable);
      setKeyboard(editing || Boolean(viewport && viewport.height < window.innerHeight * 0.75));
    };
    const reveal = (event: FocusEvent) => {
      update();
      const target = event.target;
      if (
        !(target instanceof HTMLElement) ||
        bar.current?.contains(target) ||
        target.closest("[role=dialog], [aria-modal=true]")
      )
        return;
      requestAnimationFrame(() => {
        const dock = bar.current?.getBoundingClientRect();
        if (
          dock?.height &&
          document.activeElement === target &&
          target.getBoundingClientRect().bottom > dock.top
        )
          target.scrollIntoView({ block: "center" });
      });
    };
    document.addEventListener("focusin", reveal);
    document.addEventListener("focusout", update);
    viewport?.addEventListener("resize", update);
    update();
    return () => {
      document.removeEventListener("focusin", reveal);
      document.removeEventListener("focusout", update);
      viewport?.removeEventListener("resize", update);
    };
  }, []);
  return (
    <nav
      ref={bar}
      aria-label={label}
      data-keyboard={keyboard || undefined}
      data-print-hide=""
      className={styles.dock}
    >
      <div className="mx-auto max-w-page space-y-2 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <p className="text-center text-caption text-text-muted">
          <bdi>{reference}</bdi>
        </p>
        <div className="flex items-stretch gap-2 [&>a]:min-w-0 [&>a]:flex-1 [&>a]:px-3 [&>a]:text-center">
          {children}
        </div>
      </div>
    </nav>
  );
}
