"use client";

import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { buttonClass } from "@/ui/button-class";
import { cx } from "@/ui/cx";
import { NativeForm } from "@/ui/form/native-form";
import { ArrowDownIcon, ArrowUpIcon, PhotoIcon } from "@/ui/icons";
import { savedAckField, savedOperationCookie } from "./saved-operation";

/** Local ordering has one review and one version-checked save, with a native manual path. */
export function MediaGallery({
  items,
  heading,
  action,
  envelope,
  version,
  draftKey,
  confirmedOrder,
  copy,
}: {
  items: { id: string; label: string; hidden: boolean; content: ReactNode; preview: ReactNode }[];
  heading: ReactNode;
  action: string;
  envelope: ReactNode;
  version: number;
  draftKey: string;
  confirmedOrder?: string[];
  copy: {
    reorder: string;
    hint: string;
    review: string;
    save: string;
    cancel: string;
    before: string;
    after: string;
    up: string;
    down: string;
    cover: string;
    moved: string;
    conflict: string;
    guard: { title: string; body: string; stay: string; discard: string };
  };
}) {
  const [initial] = useState(() => items.map((item) => item.id));
  const confirmed = confirmedOrder?.join();
  const [order, setOrder] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [dragged, setDragged] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const focusAfterMove = useRef<{ id: string; direction?: "up" | "down" } | null>(null);
  const changed = order.join() !== initial.join();
  useLayoutEffect(() => {
    const pending = focusAfterMove.current;
    if (!pending || !order.includes(pending.id)) return;
    const photo = root.current?.querySelector<HTMLElement>(`[data-photo="${pending.id}"]`);
    const control = pending.direction
      ? photo?.querySelector<HTMLButtonElement>(`[data-move="${pending.direction}"]`)
      : null;
    (control && !control.disabled ? control : photo)?.focus({ preventScroll: true });
    focusAfterMove.current = null;
  }, [order]);
  useLayoutEffect(() => {
    if (reviewing) reviewHeading.current?.focus();
  }, [reviewing]);
  useEffect(() => {
    setHydrated(true);
    try {
      const raw = window.sessionStorage.getItem(draftKey);
      if (!raw) return;
      const stored = JSON.parse(raw) as { version?: unknown; order?: unknown };
      if (
        !Array.isArray(stored.order) ||
        stored.order.length !== initial.length ||
        new Set(stored.order).size !== initial.length ||
        stored.order.some((id) => !initial.includes(id))
      )
        return;
      if (confirmed === stored.order.join() || initial.join() === stored.order.join()) {
        window.sessionStorage.removeItem(draftKey);
        return;
      }
      setOrder(stored.order);
      setEditing(true);
      setReviewing(false);
      setRestored(stored.version !== version);
    } catch {}
  }, [initial, confirmed, draftKey, version]);
  useEffect(() => {
    if (!hydrated) return;
    try {
      if (changed) window.sessionStorage.setItem(draftKey, JSON.stringify({ version, order }));
      else window.sessionStorage.removeItem(draftKey);
    } catch {}
  }, [order, changed, hydrated, draftKey, version]);
  const recordMove = (next: string[], id: string, direction?: "up" | "down") => {
    focusAfterMove.current = { id, direction };
    const values = {
      photo: items.find((item) => item.id === id)?.label ?? "",
      position: String(next.indexOf(id) + 1),
      total: String(next.length),
    };
    setAnnouncement(
      copy.moved.replace(
        /\{(photo|position|total)\}/g,
        (_, key: keyof typeof values) => values[key],
      ),
    );
    setOrder(next);
    setReviewing(false);
  };
  const moveBefore = (source: string, target: string) => {
    if (source === target) return;
    const next = order.filter((id) => id !== source);
    next.splice(next.indexOf(target), 0, source);
    recordMove(next, source);
  };
  const moveOne = (id: string, direction: "up" | "down") => {
    const position = order.indexOf(id);
    const target = position + (direction === "up" ? -1 : 1);
    if (position < 0 || target < 0 || target >= order.length) return;
    const next = [...order];
    next.splice(position, 1);
    next.splice(target, 0, id);
    recordMove(next, id, direction);
  };
  const cover = (ids: string[]) =>
    ids.map((id) => items.find((item) => item.id === id)).find((item) => item && !item.hidden);
  const before = cover(initial),
    after = cover(order);
  const cancel = () => {
    setOrder(initial);
    setEditing(false);
    setReviewing(false);
    setRestored(false);
    setAnnouncement("");
  };
  const gallery = (
    <ol
      className={cx(
        "grid gap-3",
        reviewing
          ? "grid-cols-3 sm:grid-cols-4 xl:grid-cols-6"
          : "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4",
      )}
      onDragStart={(event) => {
        const id = (event.target as Element).closest<HTMLElement>("[data-photo]")?.dataset.photo;
        if (!editing || reviewing || !id) {
          event.preventDefault();
          return;
        }
        setDragged(id);
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", id);
      }}
      onDragOver={(event) => {
        const id = (event.target as Element).closest<HTMLElement>("[data-photo]")?.dataset.photo;
        if (!dragged || !id || id === dragged) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setOver(id);
      }}
      onDragEnd={() => {
        setDragged(null);
        setOver(null);
      }}
      onDrop={(event) => {
        const id = (event.target as Element).closest<HTMLElement>("[data-photo]")?.dataset.photo;
        if (!dragged || !id || event.dataTransfer.getData("text/plain") !== dragged) return;
        event.preventDefault();
        moveBefore(dragged, id);
        setOver(null);
        setDragged(null);
      }}
    >
      {order.map((id, index) => {
        const item = items.find((item) => item.id === id);
        if (!item) return null;
        return (
          <li
            key={id}
            data-photo={id}
            tabIndex={editing ? -1 : undefined}
            aria-label={editing ? item.label : undefined}
            draggable={editing && !reviewing}
            className={cx(
              "relative min-w-0 rounded-panel",
              over === id && "outline-2 outline-action",
              dragged === id && "opacity-50",
            )}
          >
            <div inert={editing}>{item.content}</div>
            <span className="pointer-events-none absolute start-2 top-2 rounded-control bg-canvas px-2 py-1 text-caption font-semibold tabular-nums">
              {index + 1}
            </span>
            {after?.id === id ? (
              <span className="pointer-events-none absolute end-2 top-2 rounded-control bg-canvas px-2 py-1 text-caption font-semibold">
                {copy.cover}
              </span>
            ) : null}
            {editing && !reviewing ? (
              <div className="mt-2 flex justify-between gap-2">
                <button
                  type="button"
                  data-move="up"
                  disabled={index === 0}
                  aria-label={`${copy.up} · ${index + 1}`}
                  className={buttonClass("tertiary", "px-3")}
                  onClick={() => moveOne(id, "up")}
                >
                  <ArrowUpIcon className="size-4" />
                </button>
                <button
                  type="button"
                  data-move="down"
                  disabled={index === order.length - 1}
                  aria-label={`${copy.down} · ${index + 1}`}
                  className={buttonClass("tertiary", "px-3")}
                  onClick={() => moveOne(id, "down")}
                >
                  <ArrowDownIcon className="size-4" />
                </button>
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
  return (
    <div ref={root} className="space-y-4" data-reordering={editing ? "" : undefined}>
      {announcement ? (
        <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {announcement}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {heading}
        {!editing && hydrated && items.length > 1 ? (
          <button
            type="button"
            className={buttonClass("secondary")}
            onClick={() => setEditing(true)}
          >
            {copy.reorder}
          </button>
        ) : null}
      </div>
      {!editing ? (
        gallery
      ) : (
        <>
          <p className="text-dense text-text-muted">{copy.hint}</p>
          {restored ? (
            <p role="status" className="rounded-control bg-warning-soft p-3 text-dense">
              {copy.conflict}
            </p>
          ) : null}
          <MediaReviewGuard copy={copy.guard}>
            <NativeForm action={action} method="post" className="space-y-4">
              {envelope}
              <input type="hidden" name="order" value={JSON.stringify(order)} />
              <div className="sticky top-0 z-10 flex flex-wrap gap-2 border-b border-divider bg-canvas py-3">
                {reviewing ? (
                  <>
                    <button type="submit" className={buttonClass("primary")}>
                      {copy.save}
                    </button>
                    <button
                      type="button"
                      className={buttonClass("secondary")}
                      onClick={() => setReviewing(false)}
                    >
                      {copy.reorder}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={!changed}
                    className={buttonClass("primary")}
                    onClick={() => setReviewing(true)}
                  >
                    {copy.review}
                  </button>
                )}
                <button type="button" className={buttonClass("tertiary")} onClick={cancel}>
                  {copy.cancel}
                </button>
              </div>
              {reviewing ? (
                <>
                  <h3
                    ref={reviewHeading}
                    tabIndex={-1}
                    className="scroll-mt-20 text-section font-semibold"
                  >
                    {copy.review}
                  </h3>
                  <div className="grid max-w-md grid-cols-2 gap-4">
                    {[
                      [copy.before, before],
                      [copy.after, after],
                    ].map(([label, item]) => {
                      const photo = item as typeof before;
                      return (
                        <figure key={label as string} className="space-y-2">
                          <figcaption className="text-dense font-semibold">
                            {label as string}
                          </figcaption>
                          <div className="h-20 overflow-hidden rounded-control bg-subtle sm:h-24">
                            {photo?.preview}
                          </div>
                        </figure>
                      );
                    })}
                  </div>
                  {gallery}
                </>
              ) : (
                gallery
              )}
            </NativeForm>
          </MediaReviewGuard>
        </>
      )}
    </div>
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
  requireAcknowledgment = false,
}: {
  children: ReactNode;
  requireAcknowledgment?: boolean;
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
      JSON.stringify(
        [...new FormData(of)]
          .filter(([key]) => !key.startsWith("_"))
          .map(([key, value]) => [key, String(value)]),
      );
    const original = form.cloneNode(true) as HTMLFormElement;
    original.reset();
    const initial = snapshot(original);
    let submitted: { snapshot: string; ack: string } | null = null;
    const dirty = () => {
      const now = snapshot(form);
      const acknowledged =
        submitted &&
        now === submitted.snapshot &&
        document.cookie.split("; ").includes(`${savedOperationCookie}=${submitted.ack}`);
      return !leaving.current && now !== initial && !acknowledged;
    };
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
      if (!requireAcknowledgment) {
        leaving.current = true;
        return;
      }
      const now = snapshot(form);
      const ack = submitted?.snapshot === now ? submitted.ack : crypto.randomUUID();
      let field = form.querySelector<HTMLInputElement>(`input[name="${savedAckField}"]`);
      if (!field) {
        field = document.createElement("input");
        field.type = "hidden";
        field.name = savedAckField;
        form.append(field);
      }
      field.value = ack;
      submitted = { snapshot: now, ack };
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
    form.addEventListener("submit", submit, true);
    document.addEventListener("submit", otherSubmit, true);
    return () => {
      document.removeEventListener("click", click, true);
      window.removeEventListener("beforeunload", unload);
      form.removeEventListener("submit", submit, true);
      document.removeEventListener("submit", otherSubmit, true);
    };
  }, [requireAcknowledgment]);
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
