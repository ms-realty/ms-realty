import "server-only";
import { cookies } from "next/headers";
import { getEnv } from "../config/env";
import type { PrivateHostContext } from "../config/hosts";
import { AppError } from "../errors";
import { sessionCookieName, sessionCookieOptions } from "./cookies";
import { requireAuthHost } from "./pages";
import { challengeTtlMs } from "./passkeys";

type Purpose = "authentication" | "registration";
const name = (context: PrivateHostContext, purpose: Purpose) =>
  sessionCookieName(getEnv(), context).replace(/session$/, purpose);

/** Only this browser on this private host can complete the ceremony it just started. */
export async function setCeremony(
  context: PrivateHostContext,
  purpose: Purpose,
  challenge: string,
) {
  await requireAuthHost(context);
  (await cookies()).set(
    name(context, purpose),
    challenge,
    sessionCookieOptions(getEnv(), context, new Date(Date.now() + challengeTtlMs)),
  );
}

export async function takeCeremony(context: PrivateHostContext, purpose: Purpose): Promise<string> {
  await requireAuthHost(context);
  const jar = await cookies();
  const challenge = jar.get(name(context, purpose))?.value;
  jar.set(name(context, purpose), "", sessionCookieOptions(getEnv(), context, new Date(0)));
  if (!challenge) throw new AppError("passkey_failed");
  return challenge;
}
