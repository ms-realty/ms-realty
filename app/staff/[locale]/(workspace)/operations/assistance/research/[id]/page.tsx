// O32 / F29: durable sources, corrections, progress, editable drafts and person-owned records.
import { notFound } from "next/navigation";
import { z } from "zod";
import { checkWorkspaceLocale, WorkspaceDetailScreen } from "@/features/ai/workspace-screens";
import { requireStaffPage } from "@/server/auth/pages";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ operation?: string | string[]; command?: string | string[] }>;
}) {
  const { locale, id } = await params;
  checkWorkspaceLocale(locale);
  const session = await requireStaffPage(locale),
    query = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();
  const command = z
    .enum(["create", "message", "research", "cancel", "artifact.revise", "materialize"])
    .optional()
    .safeParse(query.command);
  if (
    !command.success ||
    (query.operation !== undefined &&
      (typeof query.operation !== "string" ||
        query.operation.length < 16 ||
        query.operation.length > 200))
  )
    notFound();
  return (
    <WorkspaceDetailScreen
      locale={locale}
      id={id}
      session={session}
      operationKey={typeof query.operation === "string" ? query.operation : undefined}
      command={command.data}
    />
  );
}
