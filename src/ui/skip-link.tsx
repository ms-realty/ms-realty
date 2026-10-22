/** First focusable element on every page; jumps past repeated navigation. */
export function SkipLink({ targetId, children }: { targetId: string; children: string }) {
  return (
    <a
      href={`#${targetId}`}
      className="sr-only rounded-control bg-action px-4 py-3 font-semibold text-text-inverse focus:not-sr-only focus:fixed focus:start-[max(1rem,env(safe-area-inset-left),env(safe-area-inset-right))] focus:top-[max(1rem,env(safe-area-inset-top))] focus:z-(--z-skip-link)"
    >
      {children}
    </a>
  );
}
