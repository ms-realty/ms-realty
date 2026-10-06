"use client";
// UX 03.3: never silently discard a dirty working draft. Any link away from the editor (tabs
// that navigate, Review, the staff shell) asks Save draft / Discard / Stay; closing or
// reloading the page gets the browser's own prompt. The form is compared with its contents
// when the page loaded; operation identity fields are ignored. Only a save the server
// acknowledged (savedOperationCookie for this form's operation) leaves without asking, and only
// while the form still holds what that save sent; a failed, rejected or stalled save, or any
// later edit, keeps the work protected.
import { useEffect, useRef, useState } from "react";
import { buttonClass } from "@/ui/button-class";
import { formFields } from "@/ui/form/contract";
import { savedOperationCookie } from "./saved-operation";

export function UnsavedGuard({
  root,
  storageKey,
  copy,
}: {
  /** Selector of the element that holds the editor form. */
  root: string;
  /** The tab-scoped copy of unsaved work (see DraftKeeper); Discard removes it. */
  storageKey: string;
  copy: { title: string; body: string; save: string; discard: string; stay: string };
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement | null>(null);
  const [target, setTarget] = useState("");
  const leaving = useRef(false);
  useEffect(() => {
    const editor = document.querySelector<HTMLFormElement>(`${root} form`);
    if (!editor) return;
    form.current = editor;
    const snapshot = () =>
      JSON.stringify(
        [...new FormData(editor)].filter(([name]) => !name.startsWith("_")).map(String),
      );
    const initial = snapshot();
    // What the last save sent: an acknowledgement covers exactly that content, never later edits.
    let submitted: string | null = null;
    const submit = () => {
      submitted = snapshot();
    };
    const saved = () => {
      const id = editor.querySelector<HTMLInputElement>(
        `input[name="${formFields.operationId}"]`,
      )?.value;
      return Boolean(id) && document.cookie.split("; ").includes(`${savedOperationCookie}=${id}`);
    };
    const dirty = () => {
      if (leaving.current) return false;
      const now = snapshot();
      return now !== initial && !(now === submitted && saved());
    };
    const click = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.download) return;
      if (dialog.current?.contains(link)) return;
      const url = new URL(link.href, window.location.href);
      const here = new URL(window.location.href);
      if (
        url.origin === here.origin &&
        url.pathname === here.pathname &&
        url.search === here.search
      )
        return;
      if (!dirty()) return;
      event.preventDefault();
      event.stopPropagation();
      setTarget(url.href);
      dialog.current?.showModal();
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (!dirty()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    editor.addEventListener("submit", submit, true);
    document.addEventListener("click", click, true);
    window.addEventListener("beforeunload", unload);
    return () => {
      editor.removeEventListener("submit", submit, true);
      document.removeEventListener("click", click, true);
      window.removeEventListener("beforeunload", unload);
    };
  }, [root]);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="unsaved-title"
      className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-card bg-canvas p-6 text-text backdrop:bg-overlay"
    >
      <h2 id="unsaved-title" className="text-subheading font-semibold">
        {copy.title}
      </h2>
      <p className="mt-3">{copy.body}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          className={buttonClass("primary")}
          onClick={() => {
            dialog.current?.close();
            const editor = form.current;
            // Save, then offer to continue where the person was going (O12SAVED "Continue").
            const next = editor?.querySelector<HTMLInputElement>('input[name="_next"]');
            if (next && target) {
              const url = new URL(target);
              next.value = `${url.pathname}${url.search}`;
            }
            editor?.requestSubmit(
              editor.querySelector<HTMLButtonElement>('button[type="submit"]') ?? undefined,
            );
          }}
        >
          {copy.save}
        </button>
        <button
          type="button"
          className={buttonClass("secondary")}
          onClick={() => {
            leaving.current = true;
            try {
              window.sessionStorage.removeItem(storageKey);
            } catch {}
            window.location.assign(target);
          }}
        >
          {copy.discard}
        </button>
        <button
          type="button"
          className={buttonClass("tertiary")}
          onClick={() => dialog.current?.close()}
        >
          {copy.stay}
        </button>
      </div>
    </dialog>
  );
}
