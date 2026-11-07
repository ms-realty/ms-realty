// These existing native routes read the same exact CMS edition as their generic route.
// Native sell/let provide a consultation intent; generic services require a current offering.
const nativeContentPaths = [
  { kind: "help", slug: "contact", path: "/contact" },
  { kind: "service", slug: "sell", path: "/sell" },
  { kind: "service", slug: "let", path: "/let" },
] as const;

export function publicNativeContentPath(kind: string, slug: string) {
  return nativeContentPaths.find((route) => route.kind === kind && route.slug === slug)?.path;
}
