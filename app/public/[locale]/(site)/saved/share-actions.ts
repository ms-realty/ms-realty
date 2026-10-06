"use server";

// P08/X11: the browser's creator capability is the host-only cookie, never the viewing token.
// Every call re-verifies origin, creator and input; previous action state is not trusted.
import { randomUUID } from "node:crypto";
import { refresh } from "next/cache";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { getDb } from "@/db/client";
import { moment } from "@/features/discovery/share-model";
import { createFailure, revokeFailure, shareCreatorFrom } from "@/features/discovery/share-server";
import {
  type ShareCreateState,
  type ShareRevokeState,
  shareFields,
} from "@/features/discovery/share-state";
import { isRoutableLocale } from "@/i18n/config";
import { getEnv } from "@/server/config/env";
import { assertSameOrigin, clientIpFrom } from "@/server/http/request";
import { createPublicShare, revokePublicShare } from "@/server/shares/public";
import { formFields } from "@/ui/form/contract";

const isUuid = (value: unknown): value is string => z.uuid().safeParse(value).success;

/** A field that must appear exactly once; duplicates are forged or broken forms. */
function one(data: FormData, name: string): string | null {
  const values = data.getAll(name);
  return values.length === 1 && typeof values[0] === "string" ? values[0] : null;
}

export async function createSavedShare(
  localeValue: string,
  _previous: ShareCreateState,
  data: FormData,
): Promise<ShareCreateState> {
  if (!isRoutableLocale(localeValue)) throw new Error("Invalid locale");
  const locale = localeValue;
  const env = getEnv();
  const requestHeaders = await headers();
  assertSameOrigin(requestHeaders, env.hosts.public);

  const key = one(data, formFields.operationId);
  if (!isUuid(key))
    return { operationId: randomUUID(), outcome: { kind: "rejected", code: "failed" } };
  const state = (outcome: ShareCreateState["outcome"], rotate = false): ShareCreateState => ({
    operationId: rotate ? randomUUID() : key,
    outcome,
  });

  // The creator cookie must exist before the link does; minting it here would come too late.
  const session = shareCreatorFrom(await cookies());
  if (!session) return state({ kind: "rejected", code: "session_required" });

  const references = data
    .getAll(shareFields.reference)
    .filter((value): value is string => typeof value === "string");
  const fields = [
    ...(one(data, shareFields.reviewed) === "yes" ? [] : (["reviewed"] as const)),
    ...(references.length === 0 ? (["references"] as const) : []),
  ];
  if (fields.length) return state({ kind: "invalid", fields });

  let created: Awaited<ReturnType<typeof createPublicShare>>;
  try {
    created = await createPublicShare(
      getDb(),
      { kind: "anonymous", sessionToken: session },
      { operationId: key, locale, references, reviewed: true },
      { clientIp: clientIpFrom(requestHeaders) },
    );
  } catch (error) {
    const failure = createFailure(error);
    return state(failure.outcome, failure.rotate);
  }
  // The list below the form is server-rendered: re-render it with the new link.
  refresh();
  return { operationId: randomUUID(), outcome: { kind: "created", id: created.share.id } };
}

export async function revokeSavedShare(
  localeValue: string,
  _previous: ShareRevokeState,
  data: FormData,
): Promise<ShareRevokeState> {
  if (!isRoutableLocale(localeValue)) throw new Error("Invalid locale");
  const locale = localeValue;
  const env = getEnv();
  assertSameOrigin(await headers(), env.hosts.public);

  const key = one(data, formFields.operationId);
  if (!isUuid(key))
    return { operationId: randomUUID(), outcome: { kind: "rejected", code: "failed" } };
  const state = (outcome: ShareRevokeState["outcome"], rotate = false): ShareRevokeState => ({
    operationId: rotate ? randomUUID() : key,
    outcome,
  });

  const session = shareCreatorFrom(await cookies());
  const id = one(data, shareFields.shareId);
  if (!session || !isUuid(id)) return state({ kind: "rejected", code: "not_manageable" }, true);

  let revoked: Awaited<ReturnType<typeof revokePublicShare>>;
  try {
    revoked = await revokePublicShare(
      getDb(),
      { kind: "anonymous", sessionToken: session },
      { id, operationId: key },
    );
  } catch (error) {
    const failure = revokeFailure(error);
    return state(failure.outcome, failure.rotate);
  }
  // A replay after a lost acknowledgment lands here too; refresh shows the stored outcome.
  refresh();
  return state({ kind: "revoked", revokedAt: moment(locale, revoked.outcome.revokedAt) });
}
