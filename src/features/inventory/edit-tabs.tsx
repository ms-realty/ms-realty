"use client";
// O12 Facts / Text tabs: one form, two panels. The radios switch panels through CSS
// (group-has on the [data-o12] wrapper), so nothing navigates and nothing typed is lost,
// with or without JavaScript. The radios belong to the editor form (`form`), so Save returns
// to the chosen tab natively. With JavaScript the address keeps the deep link (?tab=facts) and
// a field the server rejected brings its panel forward.
import { useEffect, useState } from "react";
import { LeaveControl } from "./leave-control";

export function EditTabs({
  tab,
  formId,
  photosHref,
  labels,
}: {
  tab: "text" | "facts";
  formId?: string;
  photosHref: string;
  labels: { tabs: string; facts: string; text: string; photos: string; noscript: string };
}) {
  // Shown until JavaScript runs: only then can the editor ask before leaving unsaved work.
  const [enhanced, setEnhanced] = useState(false);
  useEffect(() => {
    setEnhanced(true);
    const root = document.querySelector<HTMLElement>("[data-o12]");
    if (!root) return;
    const show = (panel: string) => {
      const input = document.getElementById(`o12-${panel}`) as HTMLInputElement | null;
      if (input && !input.checked) input.checked = true;
      sync(panel);
    };
    const sync = (panel: string) => {
      const url = new URL(window.location.href);
      if (panel === "facts") url.searchParams.set("tab", "facts");
      else url.searchParams.delete("tab");
      window.history.replaceState(window.history.state, "", url);
    };
    const change = (event: Event) => {
      const input = event.target as HTMLInputElement;
      if (input.name === "_tab") sync(input.value);
    };
    const invalid = new MutationObserver(() => {
      const panel = root
        .querySelector('[aria-invalid="true"]')
        ?.closest<HTMLElement>("[data-o12-panel]")?.dataset.o12Panel;
      if (panel) show(panel);
    });
    root.addEventListener("change", change);
    invalid.observe(root, { subtree: true, attributes: true, attributeFilter: ["aria-invalid"] });
    return () => {
      root.removeEventListener("change", change);
      invalid.disconnect();
    };
  }, []);
  const option =
    "flex min-h-[2.875rem] cursor-pointer items-center justify-center rounded-control p-3 text-center text-dense font-semibold text-text-muted hover:text-text has-checked:bg-canvas has-checked:text-text has-focus-visible:outline-2 has-focus-visible:outline-focus";
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-1 rounded-control bg-subtle p-1">
        <fieldset className="contents">
          <legend className="sr-only">{labels.tabs}</legend>
          {(
            [
              ["facts", labels.facts],
              ["text", labels.text],
            ] as const
          ).map(([id, label]) => (
            <label key={id} className={option}>
              <input
                type="radio"
                name="_tab"
                form={formId}
                id={`o12-${id}`}
                value={id}
                defaultChecked={tab === id}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </fieldset>
        <LeaveControl href={photosHref} formId={formId} className={`${option} no-underline`}>
          {labels.photos}
        </LeaveControl>
      </div>
      {enhanced ? null : <p className="text-caption text-text-muted">{labels.noscript}</p>}
    </div>
  );
}
