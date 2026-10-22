import type { ReactNode } from "react";

const labels: Record<string, string> = {
  bg: "Технически данни",
  en: "Technical details",
  ru: "Технические данные",
  de: "Technische Details",
  nl: "Technische gegevens",
  el: "Τεχνικά στοιχεία",
  he: "פרטים טכניים",
};
export function TechnicalDetails({ locale, children }: { locale: string; children: ReactNode }) {
  return (
    <details className="text-caption text-text-muted">
      <summary className="min-h-control cursor-pointer py-3">{labels[locale] ?? labels.en}</summary>
      <div className="space-y-2 break-words py-2">{children}</div>
    </details>
  );
}
