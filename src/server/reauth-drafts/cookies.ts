import "server-only";
import { cookies } from "next/headers";
import { sessionCookieOptions } from "../auth/cookies";
import { requireAuthHost } from "../auth/pages";
import { getEnv } from "../config/env";
import { draftTokenPattern, maxDraftCookieCandidates } from "./service";

const prefix = () =>
  `${getEnv().hosts.client.startsWith("https://") ? "__Host-" : ""}msr_client_proposal_draft_`;
export const proposalDraftCookieName = (id: string) => `${prefix()}${id}`;

export async function proposalDraftToken(id: string) {
  await requireAuthHost("client");
  return (await cookies()).get(proposalDraftCookieName(id))?.value;
}
export async function proposalDraftTokens() {
  await requireAuthHost("client");
  return (await cookies())
    .getAll()
    .filter(
      ({ name, value }) =>
        name.startsWith(prefix()) &&
        /^[a-f0-9-]{36}$/.test(name.slice(prefix().length)) &&
        draftTokenPattern.test(value),
    )
    .slice(0, maxDraftCookieCandidates)
    .map(({ value }) => value);
}
export async function setProposalDraftCookie(id: string, token: string, expiresAt: Date) {
  await requireAuthHost("client");
  (await cookies()).set(
    proposalDraftCookieName(id),
    token,
    sessionCookieOptions(getEnv(), "client", expiresAt),
  );
}
