"use client";
// O12 Facts / Text tabs: one form, two panels. The radios switch panels through CSS
// (group-has on the [data-o12] wrapper), so nothing navigates and nothing typed is lost,
// with or without JavaScript. With JavaScript the address keeps the deep link (?tab=facts),
// the redirect after Save returns to the same tab, and a field the server rejected brings
// its panel forward.
import { useEffect, useState } from "react";

export function EditTabs({
  tab,
  photosHref,
  labels,
}: {
  tab: "text" | "facts";
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
      const field = document.getElementById("o12-tab-field") as HTMLInputElement | null;
      if (field) field.value = panel;
    };
    const change = (event: Event) => {
      const input = event.target as HTMLInputElement;
      if (input.name === "o12-panel") sync(input.value);
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
                name="o12-panel"
                id={`o12-${id}`}
                value={id}
                defaultChecked={tab === id}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </fieldset>
        <a href={photosHref} className={`${option} no-underline`}>
          {labels.photos}
        </a>
      </div>
      {enhanced ? null : <p className="text-caption text-text-muted">{labels.noscript}</p>}
    </div>
  );
}
