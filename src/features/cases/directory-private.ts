import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import type { Session } from "@/server/auth/sessions";
import { getEnv } from "@/server/config/env";
import type { CaseDirectoryValues } from "./directory-query";

const prefix = "msr_case_filter_";
const text = z.string().max(120).optional();
const snapshot = z.strictObject({
  id: z.uuid(),
  expiresAt: z.number().int(),
  shortened: z.boolean(),
  values: z.strictObject({ q: text, purpose: text, party: text, nextAction: text }),
});
export type PrivateCaseDirectoryFilter = z.infer<typeof snapshot>;
const key = () => createHash("sha256").update(getEnv().authSecret).digest();
const cookieName = (id: string) => `${prefix}${id.replaceAll("-", "")}`;
const binding = (session: Session, locale: string) =>
  Buffer.from(`O04:${locale}:${session.id}:${session.account.id}`);

/** Authenticated encryption keeps private criteria out of URLs and readable cookie content. */
export function sealCaseDirectoryFilter(
  session: Session,
  locale: string,
  value: PrivateCaseDirectoryFilter,
) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(binding(session, locale));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(snapshot.parse(value)), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

export function openCaseDirectoryFilter(
  session: Session,
  locale: string,
  encoded: string,
  now = Date.now(),
): PrivateCaseDirectoryFilter | null {
  if (encoded.length > 3500 || !/^[A-Za-z0-9_-]+$/u.test(encoded)) return null;
  try {
    const data = Buffer.from(encoded, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(), data.subarray(0, 12));
    decipher.setAAD(binding(session, locale));
    decipher.setAuthTag(data.subarray(12, 28));
    const clear = Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]);
    const parsed = snapshot.parse(JSON.parse(clear.toString("utf8")));
    return parsed.expiresAt > now && session.expiresAt.getTime() > now ? parsed : null;
  } catch {
    return null;
  }
}

export async function retainedCaseDirectoryFilter(session: Session, locale: string, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const value = (await cookies()).get(cookieName(id))?.value;
  const retained = value ? openCaseDirectoryFilter(session, locale, value) : null;
  return retained?.id === id ? retained : null;
}

export async function retainCaseDirectoryFilter(
  session: Session,
  locale: string,
  id: string,
  values: CaseDirectoryValues,
  shortened: boolean,
) {
  const jar = await cookies();
  const options = {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: getEnv().hosts.staff.startsWith("https:"),
    path: `/${locale}/cases`,
    maxAge: 1800,
  };
  // Keep this and one prior context for Back/another tab. Expired or displaced contexts
  // fail visibly; they can never turn into a broader unfiltered read.
  const previous = jar
    .getAll()
    .filter((cookie) => cookie.name.startsWith(prefix))
    .map((cookie) => ({ cookie, retained: openCaseDirectoryFilter(session, locale, cookie.value) }))
    .sort((a, b) => (b.retained?.expiresAt ?? 0) - (a.retained?.expiresAt ?? 0));
  for (const [index, item] of previous.entries())
    if (index > 0 || !item.retained) jar.set(item.cookie.name, "", { ...options, maxAge: 0 });
  const encoded = sealCaseDirectoryFilter(session, locale, {
    id,
    expiresAt: Math.min(Date.now() + options.maxAge * 1000, session.expiresAt.getTime()),
    shortened,
    values: {
      q: values.q,
      purpose: values.purpose,
      party: values.party,
      nextAction: values.nextAction,
    },
  });
  // Escaped malformed Unicode can exceed the cookie budget even below the character limit.
  // The caller returns an explicit unavailable-context state instead of dropping criteria.
  if (encoded.length > 3500) return false;
  jar.set(cookieName(id), encoded, options);
  return true;
}
