"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { ChevronDownIcon } from "@/ui/icons";
import s from "./calendar.module.css";

/** Phones may fold secondary filters. The native GET form remains expanded without JS. */
export function CalendarFilterDisclosure({
  label,
  selection,
  children,
}: {
  label: string;
  selection: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [enhanced, setEnhanced] = useState(false);
  useEffect(() => {
    if (!window.matchMedia) return;
    const narrow = window.matchMedia("(max-width: 639px)");
    const adapt = () => {
      if (ref.current) ref.current.open = !narrow.matches;
    };
    adapt();
    setEnhanced(true);
    narrow.addEventListener("change", adapt);
    return () => narrow.removeEventListener("change", adapt);
  }, []);
  return (
    <details
      ref={ref}
      open
      data-calendar-filters
      data-enhanced={enhanced || undefined}
      className={s.filterDisclosure}
    >
      <summary>
        <span>
          <strong>{label}</strong>
          <span>{selection}</span>
        </span>
        <ChevronDownIcon />
      </summary>
      {children}
    </details>
  );
}
