import type { ReactNode } from "react";
import { ChevronDownIcon } from "@/ui/icons";
import s from "./calendar.module.css";

/** Native disclosure and GET form share the same behavior with and without JavaScript. */
export function CalendarFilterDisclosure({
  label,
  selection,
  children,
}: {
  label: string;
  selection: string;
  children: ReactNode;
}) {
  return (
    <details data-calendar-filters className={s.filterDisclosure}>
      <summary>
        <strong>{label}</strong>
        <ChevronDownIcon />
        <span className="sr-only"> · {selection}</span>
      </summary>
      {children}
    </details>
  );
}
