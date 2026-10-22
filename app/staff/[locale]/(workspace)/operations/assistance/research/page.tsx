// O32 / F29: goal-first research drafts within the staff workspace.
import { randomUUID } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { checkWorkspaceLocale, WorkspaceEntryScreen } from "@/features/ai/workspace-screens";
import { requireStaffPage } from "@/server/auth/pages";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ draft?: string | string[]; q?: string | string[] }>;
}) {
  const { locale } = await params;
  checkWorkspaceLocale(locale);
  const session = await requireStaffPage(locale),
    query = await searchParams;
  const q = typeof query.q === "string" ? query.q.trim().slice(0, 120) : "";
  if (query.draft === undefined)
    redirect(
      "/" +
        locale +
        "/operations/assistance/research?" +
        new URLSearchParams({ draft: randomUUID(), ...(q ? { q } : {}) }),
    );
  if (!z.uuid().safeParse(query.draft).success || typeof query.draft !== "string") notFound();
  return <WorkspaceEntryScreen locale={locale} session={session} id={query.draft} q={q} />;
}
