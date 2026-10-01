// A consented third-party runtime belongs to one document. Do not retain its
// listeners while Next replaces public content with a personal service journey.
export function discardAnalyticsDocument() {
  location.reload();
}
export function installAnalyticsDocumentNavigation(
  navigate: (url: string) => void = (url) => location.assign(url),
  reload: () => void = discardAnalyticsDocument,
) {
  const click = (event: MouseEvent) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const element = event.target;
    const link = element instanceof Element ? element.closest<HTMLAnchorElement>("a[href]") : null;
    if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
    const destination = new URL(link.href, location.href);
    if (destination.origin !== location.origin || !/^https?:$/.test(destination.protocol)) return;
    if (destination.href === location.href) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    navigate(destination.href);
  };
  const historyNavigation = (event: Event) => {
    // Capture runs before the router's bubble listener, so it cannot restore a
    // sensitive React page inside the analytics-bearing document.
    event.stopImmediatePropagation();
    reload();
  };
  document.addEventListener("click", click, true);
  window.addEventListener("popstate", historyNavigation, true);
  window.addEventListener("hashchange", historyNavigation, true);
  return () => {
    document.removeEventListener("click", click, true);
    window.removeEventListener("popstate", historyNavigation, true);
    window.removeEventListener("hashchange", historyNavigation, true);
  };
}
