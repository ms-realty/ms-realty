"use server";
// AT39: whether the private session behind this page is still active, asked by the page guard
// when a hidden tab comes back. It answers for the host the request addresses; it never renews
// anything a page render would not, and it reveals no private data.
import { headers } from "next/headers";
import { currentClientSession, currentStaffAccess } from "@/server/auth/pages";
import { getEnv } from "@/server/config/env";
import { hostContextOf } from "@/server/http/request";

export async function privateAccessState(): Promise<"active" | "signed_out"> {
  const context = hostContextOf(await headers(), getEnv());
  if (context === "staff")
    return (await currentStaffAccess()).state === "ready" ? "active" : "signed_out";
  if (context === "client") return (await currentClientSession()) ? "active" : "signed_out";
  return "signed_out";
}
