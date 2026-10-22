"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { isStaffLocale } from "@/i18n/config";
import { assertNativeAuthOrigin } from "@/server/auth/native";
import { requireStaffPage } from "@/server/auth/pages";
import { getEnv } from "@/server/config/env";
import { retainCaseDirectoryFilter } from "./directory-private";
import { caseDirectoryHref, caseDirectoryKeys, caseDirectoryState } from "./directory-query";

/** A native POST applies private text; only an opaque context identity enters the URL. */
export async function applyCaseDirectoryFilters(locale: string, form: FormData) {
  if (!isStaffLocale(locale)) notFound();
  assertNativeAuthOrigin(await headers(), getEnv().hosts.staff);
  const session = await requireStaffPage(locale);
  const raw = Object.fromEntries(
    caseDirectoryKeys
      .filter((name) => name !== "cursor" && name !== "filter")
      .map((name) => {
        const value = form.get(name);
        return [name, typeof value === "string" ? value : undefined];
      }),
  );
  const state = caseDirectoryState(raw, session.account.id);
  const privateText = ["q", "purpose", "party", "nextAction"].some(
    (name) => state.values[name as keyof typeof state.values],
  );
  if (privateText) {
    const id = randomUUID();
    const retained = await retainCaseDirectoryFilter(
      session,
      locale,
      id,
      state.values,
      state.shortened,
    );
    redirect(caseDirectoryHref(locale, { ...state.values, filter: retained ? id : "unavailable" }));
  }
  redirect(caseDirectoryHref(locale, state.values));
}
