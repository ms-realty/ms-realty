"use client";
import { useState, useSyncExternalStore } from "react";
import { workCopy } from "@/features/work/copy";
import type { ContentPlaceOption } from "@/server/content/commands";
import { controlClass, errorClass, fieldClass, labelClass } from "@/ui/field-class";
import type { FormAction, FormState } from "@/ui/form/contract";
import { ActionForm, type FormController } from "@/ui/form/form";
import { FormField } from "@/ui/form/form-field";
import type { ContentValues, DecisionValues } from "./actions";
import { contentCopy } from "./copy";

const noSubscription = () => () => {};
function PlaceChoice({
  form,
  places,
  placesAvailable,
  copy,
}: {
  form: FormController<ContentValues>;
  places: readonly ContentPlaceOption[];
  placesAvailable: boolean;
  copy: ReturnType<typeof contentCopy>;
}) {
  const binding = form.field("placeId");
  const [query, setQuery] = useState("");
  const enhanced = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  const normalized = query.trim().toLowerCase();
  const matches = places.filter((place) =>
    `${place.nameNative} ${place.nameLatin} ${place.context}`.toLowerCase().includes(normalized),
  );
  const selected = places.find((place) => place.id === binding.value);
  const options = selected && !matches.includes(selected) ? [selected, ...matches] : matches;
  const inactive = enhanced && form.values.kind !== "area";
  return (
    <div className="space-y-4">
      {/* Filtering is progressive enhancement. The native complete register remains usable without JS. */}
      {enhanced && placesAvailable && places.length > 15 ? (
        <FormField
          id={`${binding.id}-search`}
          type="search"
          label={copy.placeFilter}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={form.pending || binding.readOnly || inactive}
        />
      ) : null}
      <div key="binding" className={fieldClass} data-invalid={binding.error ? "true" : undefined}>
        <label className={labelClass} htmlFor={binding.id}>
          {copy.place}
        </label>
        {!placesAvailable ? <input type="hidden" name="placeId" value={binding.value} /> : null}
        <select
          id={binding.id}
          name="placeId"
          value={binding.value}
          onChange={binding.onChange}
          disabled={form.pending || binding.readOnly || !placesAvailable || inactive}
          className={controlClass}
          aria-invalid={Boolean(binding.error) || undefined}
          aria-describedby={`${binding.id}-hint${binding.error ? ` ${binding.id}-error` : ""}`}
        >
          <option value="">{copy.unbound}</option>
          {binding.value && !selected ? (
            <option value={binding.value}>
              {copy.placeUnavailable}: {binding.value}
            </option>
          ) : null}
          {options.map((place) => (
            <option
              key={place.id}
              value={place.id}
              lang={place.countryCode === "BG" ? "bg" : undefined}
            >
              {place.nameNative} · {copy[place.level]}
              {place.context ? ` / ${place.context}` : ""} ({place.countryCode})
            </option>
          ))}
        </select>
        {binding.error ? (
          <p className={errorClass} id={`${binding.id}-error`}>
            {binding.error}
          </p>
        ) : null}
        <p className="text-caption text-text-muted" id={`${binding.id}-hint`}>
          {!placesAvailable
            ? copy.placesUnavailable
            : form.values.kind !== "area"
              ? copy.areaPlaceOnly
              : places.length
                ? copy.placeHint
                : copy.placesEmpty}
        </p>
        {normalized && !matches.length ? (
          <p role="status" className="text-caption text-text-muted">
            {copy.noPlaceMatches}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function ContentForm({
  locale,
  id,
  initialState,
  action,
  places,
  placesAvailable = true,
}: {
  locale: string;
  id?: string;
  initialState: FormState<ContentValues>;
  action: FormAction<ContentValues>;
  places: readonly ContentPlaceOption[];
  placesAvailable?: boolean;
}) {
  const copy = contentCopy(locale),
    path = `/${locale}/content/${id ?? "new"}`,
    kind = id ? "save" : "create";
  return (
    <ActionForm
      initialState={initialState}
      action={action}
      permalink={path}
      reconciliation={{
        href: `/${locale}/content/operations?${new URLSearchParams({ kind, key: initialState.operationId, ...(id ? { id } : {}) })}`,
        label: copy.check,
      }}
      copy={workCopy(locale).form}
      labels={{
        kind: copy.kind,
        slug: copy.slug,
        title: copy.pageTitle,
        text: copy.text,
        jurisdiction: copy.jurisdiction,
        reviewScope: copy.scope,
        placeId: copy.place,
      }}
      formatValue={(name, value) =>
        name === "placeId"
          ? (places.find((place) => place.id === value)?.nameNative ?? (value || copy.unbound))
          : value
      }
      submitLabel={copy.save}
    >
      {(form) => (
        <>
          {id ? (
            <>
              <input type="hidden" name="kind" value={form.values.kind} />
              <input type="hidden" name="slug" value={form.values.slug} />
            </>
          ) : (
            <>
              <label className="grid gap-2">
                <span className={labelClass}>{copy.kind}</span>
                <select
                  name="kind"
                  value={form.values.kind}
                  onChange={(e) => form.setValue("kind", e.target.value)}
                  disabled={form.pending}
                  className={controlClass}
                >
                  {(["area", "service", "help"] as const).map((value) => (
                    <option key={value} value={value}>
                      {copy[value]}
                    </option>
                  ))}
                </select>
              </label>
              <FormField {...form.field("slug")} label={copy.slug} required maxLength={101} />
            </>
          )}
          {/* UI06 6:74: a native choice retains the exact place through HTML POST and hydration. */}
          {!id || form.values.kind === "area" ? (
            <PlaceChoice
              form={form}
              places={places}
              placesAvailable={placesAvailable}
              copy={copy}
            />
          ) : (
            <input type="hidden" name="placeId" value={form.values.placeId} />
          )}
          <FormField {...form.field("title")} label={copy.pageTitle} required maxLength={200} />
          {/* 20:173 / 25:1837: the page text is the 144 px UI07 Textarea; it resizes. */}
          <FormField
            {...form.field("text")}
            label={copy.text}
            hint={copy.paragraphs}
            multiline
            required
            maxLength={50000}
          />
          <FormField
            {...form.field("jurisdiction")}
            label={copy.jurisdiction}
            required
            maxLength={200}
          />
          <FormField {...form.field("reviewScope")} label={copy.scope} required maxLength={1000} />
        </>
      )}
    </ActionForm>
  );
}
export function ContentReviewForm({
  locale,
  id,
  decision,
  initialState,
  action,
}: {
  locale: string;
  id: string;
  decision: "claims" | "editorial" | "publish" | "withdraw";
  initialState: FormState<DecisionValues>;
  action: FormAction<DecisionValues>;
}) {
  const copy = contentCopy(locale);
  return (
    <ActionForm
      initialState={initialState}
      action={action}
      permalink={`/${locale}/content/${id}`}
      nativeIdentity={`content.decide.${id}.${decision}`}
      reconciliation={{
        href: `/${locale}/content/operations?${new URLSearchParams({ kind: "decide", id, key: initialState.operationId })}`,
        label: copy.check,
      }}
      copy={workCopy(locale).form}
      labels={{ note: copy.note, expiresAt: copy.expiry, reviewed: copy.reviewed }}
      submitLabel={copy[decision]}
    >
      {(form) => (
        <>
          <FormField {...form.field("note")} label={copy.note} required maxLength={1500} />
          {decision !== "withdraw" ? (
            <FormField
              {...form.field("expiresAt")}
              label={copy.expiry}
              type="datetime-local"
              required
            />
          ) : null}
          <label className="flex min-h-11 items-start gap-3">
            <input
              name="reviewed"
              type="checkbox"
              value="yes"
              checked={form.values.reviewed === "yes"}
              onChange={(e) => form.setValue("reviewed", e.target.checked ? "yes" : "")}
              required
              disabled={form.pending}
              className="mt-1 size-5 shrink-0 accent-action"
            />
            <span>{copy.reviewed}</span>
          </label>
        </>
      )}
    </ActionForm>
  );
}
