"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { buttonClass } from "@/ui/button-class";
import { PhotoIcon } from "@/ui/icons";

/** Drag only stages a move. The server shows the same review as the native position form. */
export function MediaGallery({
  path,
  ids,
  children,
}: {
  path: string;
  ids: string[];
  children: ReactNode;
}) {
  const [dragged, setDragged] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  return (
    <ol
      className="grid grid-cols-2 items-start gap-3 min-[360px]:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3"
      data-dragging={dragged ?? undefined}
      onDragStart={(event) => {
        const id = (event.target as Element).closest<HTMLElement>("[data-photo]")?.dataset.photo;
        if (!id || !ids.includes(id)) return;
        setDragged(id);
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", id);
      }}
      onDragOver={(event) => {
        const tile = (event.target as Element).closest<HTMLElement>("[data-photo]");
        if (!dragged || !tile || tile.dataset.photo === dragged) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        if (over !== tile.dataset.photo) {
          event.currentTarget.querySelectorAll("[data-drop-target]").forEach((el) => {
            el.removeAttribute("data-drop-target");
          });
          tile.setAttribute("data-drop-target", "true");
          setOver(tile.dataset.photo ?? null);
        }
      }}
      onDragEnd={(event) => {
        setDragged(null);
        setOver(null);
        event.currentTarget.querySelectorAll("[data-drop-target]").forEach((el) => {
          el.removeAttribute("data-drop-target");
        });
      }}
      onDrop={(event) => {
        const target = (event.target as Element).closest<HTMLElement>("[data-photo]")?.dataset
          .photo;
        const source = event.dataTransfer.getData("text/plain");
        if (!dragged || source !== dragged || !target || source === target || !ids.includes(target))
          return;
        event.preventDefault();
        window.location.assign(`${path}?${new URLSearchParams({ photo: source, before: target })}`);
      }}
    >
      {children}
    </ol>
  );
}

/** A native file chooser with a local preview. Nothing uploads until the explicit submit. */
export function MediaFilePicker({
  label,
  hint,
  clear,
}: {
  label: string;
  hint: string;
  clear: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState("");
  const [name, setName] = useState("");
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  return (
    <div className="grid gap-3">
      <label className="grid cursor-pointer gap-3 rounded-panel border border-dashed border-border bg-subtle p-4 focus-within:outline-2 focus-within:outline-focus">
        <span className="flex items-center gap-2 text-dense font-semibold">
          <PhotoIcon className="size-5" />
          {label}
        </span>
        <input
          ref={input}
          type="file"
          name="file"
          accept="image/jpeg,image/png,image/webp"
          required
          className="w-full min-w-0 text-dense file:me-3 file:min-h-control file:rounded-control file:border file:border-border file:bg-canvas file:px-3 file:text-action"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            const valid =
              file &&
              ["image/jpeg", "image/png", "image/webp"].includes(file.type) &&
              file.size > 0 &&
              file.size <= 25 * 1024 * 1024;
            event.currentTarget.setCustomValidity(file && !valid ? hint : "");
            setName(file?.name ?? "");
            setPreview(valid ? URL.createObjectURL(file) : "");
          }}
        />
      </label>
      {preview ? (
        <figure className="grid gap-2">
          {/* biome-ignore lint/performance/noImgElement: Local file preview, never a shared image optimizer. */}
          <img
            src={preview}
            alt={name}
            className="max-h-48 w-full rounded-control bg-subtle object-contain"
          />
          <figcaption className="break-words text-dense text-text-muted">{name}</figcaption>
        </figure>
      ) : null}
      {name ? (
        <button
          type="button"
          className={buttonClass("tertiary", "justify-self-start")}
          onClick={() => {
            if (input.current) {
              input.current.value = "";
              input.current.setCustomValidity("");
            }
            setName("");
            setPreview("");
          }}
        >
          {clear}
        </button>
      ) : null}
    </div>
  );
}

/** Review is a human decision: leaving never submits it implicitly. */
export function MediaReviewGuard({
  children,
  copy,
}: {
  children: ReactNode;
  copy: { title: string; body: string; stay: string; discard: string };
}) {
  const root = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const continueLeaving = useRef<() => void>(() => {});
  const leaving = useRef(false);
  useEffect(() => {
    const form = root.current?.querySelector("form");
    if (!form) return;
    const snapshot = (of: HTMLFormElement) =>
      JSON.stringify([...new FormData(of)].map(([key, value]) => [key, String(value)]));
    const original = form.cloneNode(true) as HTMLFormElement;
    original.reset();
    const initial = snapshot(original);
    const dirty = () => !leaving.current && snapshot(form) !== initial;
    const click = (event: MouseEvent) => {
      if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element)?.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.download || link.target === "_blank" || !dirty()) return;
      const url = new URL(link.href, window.location.href);
      if (
        url.origin === window.location.origin &&
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      continueLeaving.current = () => window.location.assign(url.href);
      dialog.current?.showModal();
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (dirty()) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const submit = () => {
      leaving.current = true;
    };
    const otherSubmit = (event: SubmitEvent) => {
      const other = event.target;
      if (!(other instanceof HTMLFormElement) || other === form || !dirty()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const submitter = event.submitter;
      continueLeaving.current = () => other.requestSubmit(submitter);
      dialog.current?.showModal();
    };
    document.addEventListener("click", click, true);
    window.addEventListener("beforeunload", unload);
    form.addEventListener("submit", submit);
    document.addEventListener("submit", otherSubmit, true);
    return () => {
      document.removeEventListener("click", click, true);
      window.removeEventListener("beforeunload", unload);
      form.removeEventListener("submit", submit);
      document.removeEventListener("submit", otherSubmit, true);
    };
  }, []);
  return (
    <div ref={root}>
      {children}
      <dialog
        ref={dialog}
        aria-labelledby="media-unsaved-title"
        className="m-auto max-h-[90dvh] w-[min(30rem,calc(100%-2rem))] space-y-4 overflow-y-auto rounded-panel border border-divider bg-canvas p-6 text-text backdrop:bg-backdrop"
      >
        <h2 id="media-unsaved-title" className="text-section font-semibold">
          {copy.title}
        </h2>
        <p>{copy.body}</p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className={buttonClass("primary")}
            onClick={() => dialog.current?.close()}
          >
            {copy.stay}
          </button>
          <button
            type="button"
            className={buttonClass("tertiary")}
            onClick={() => {
              leaving.current = true;
              continueLeaving.current();
            }}
          >
            {copy.discard}
          </button>
        </div>
      </dialog>
    </div>
  );
}
