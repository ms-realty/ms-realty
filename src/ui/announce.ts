// A single pair of live regions for the whole document. Announcing by message (rather than
// marking changing UI as live) keeps status updates to one announcement each.
type Politeness = "polite" | "assertive";

const regions = new Map<Politeness, HTMLElement>();

function region(politeness: Politeness): HTMLElement {
  const existing = regions.get(politeness);
  if (existing?.isConnected) return existing;
  const element = document.createElement("div");
  element.setAttribute("aria-live", politeness);
  element.setAttribute("aria-atomic", "true");
  element.setAttribute("data-announcer", politeness);
  // React Aria's modal overlays make everything else inert, except its own live announcer
  // marker; without it these regions would fall silent while a dialog or popover is open.
  element.setAttribute("data-live-announcer", "true");
  if (politeness === "assertive") element.setAttribute("role", "alert");
  Object.assign(element.style, {
    position: "absolute",
    width: "1px",
    height: "1px",
    margin: "-1px",
    padding: "0",
    overflow: "hidden",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
    border: "0",
  });
  document.body.append(element);
  regions.set(politeness, element);
  return element;
}

/** Announces a message to screen readers once. Call from event handlers or effects. */
export function announce(message: string, politeness: Politeness = "polite"): void {
  if (typeof document === "undefined") return;
  const element = region(politeness);
  // Clearing first makes a repeated identical message announce again.
  element.textContent = "";
  window.setTimeout(() => {
    element.textContent = message;
  }, 50);
}
