type DirtyDraft = { message: string; discard: () => void };
const drafts = new Set<DirtyDraft>();
let allowUnload = false;

function guardUnload(event: BeforeUnloadEvent) {
  if (!drafts.size || allowUnload) return;
  event.preventDefault();
  event.returnValue = "";
}

function guardLink(event: MouseEvent) {
  if (
    !drafts.size ||
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  const link =
    event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
  if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
  const next = new URL(link.href, location.href);
  if (
    !/^https?:$/.test(next.protocol) ||
    (next.origin === location.origin &&
      next.pathname === location.pathname &&
      next.search === location.search &&
      next.hash)
  )
    return;
  // Capture before React/Next handles the link. One choice covers every dirty inquiry form.
  event.preventDefault();
  event.stopImmediatePropagation();
  const first = drafts.values().next().value;
  if (!first || !window.confirm(first.message)) return;
  for (const draft of drafts) draft.discard();
  allowUnload = true;
  window.location.assign(next.href);
}

export function guardDirtyInquiryNavigation(draft: DirtyDraft) {
  if (!drafts.size) {
    allowUnload = false;
    window.addEventListener("beforeunload", guardUnload);
    document.addEventListener("click", guardLink, true);
  }
  drafts.add(draft);
  return () => {
    drafts.delete(draft);
    if (!drafts.size) {
      window.removeEventListener("beforeunload", guardUnload);
      document.removeEventListener("click", guardLink, true);
      allowUnload = false;
    }
  };
}
