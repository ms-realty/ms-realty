// C01 correctable native-input return. Encrypted, host-only and ephemeral; no URL or grant.
import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { publicLocales } from "@/i18n/config";
import { getEnv, type ServerEnv } from "../config/env";
import { serializeCookie } from "./cookies";
export const clientInputLifetime = 5 * 60_000;
export const clientInputCookieName = (env: ServerEnv = getEnv()) =>
  env.hosts.client.startsWith("https://") ? "__Host-msr_client_input" : "msr_client_input";
const payload = z
  .object({
    email: z.string().max(254),
    returnTo: z.string().max(1000).nullable(),
    locale: z.enum(publicLocales),
    expiresAt: z.number().finite(),
  })
  .strict();
const key = (env: ServerEnv) =>
  createHash("sha256").update(`client-input:v1:${env.authSecret}`).digest();
export function sealClientInput(
  input: Omit<z.infer<typeof payload>, "expiresAt">,
  env: ServerEnv = getEnv(),
  now = Date.now(),
) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(env), iv);
  cipher.setAAD(Buffer.from(env.hosts.client));
  const body = Buffer.concat([
    cipher.update(
      JSON.stringify(payload.parse({ ...input, expiresAt: now + clientInputLifetime })),
      "utf8",
    ),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}
export function openClientInput(
  value: string | undefined,
  locale: string,
  env: ServerEnv = getEnv(),
  now = Date.now(),
) {
  if (!value || value.length > 3000) return null;
  try {
    const bytes = Buffer.from(value, "base64url"),
      cipher = createDecipheriv("aes-256-gcm", key(env), bytes.subarray(0, 12));
    cipher.setAAD(Buffer.from(env.hosts.client));
    cipher.setAuthTag(bytes.subarray(12, 28));
    const parsed = payload.parse(
      JSON.parse(
        Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString("utf8"),
      ),
    );
    return parsed.locale === locale && parsed.expiresAt > now ? parsed : null;
  } catch {
    return null;
  }
}
export function clientInputClearCookie(env: ServerEnv = getEnv()) {
  return serializeCookie(clientInputCookieName(env), "", {
    httpOnly: true,
    secure: env.hosts.client.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });
}
