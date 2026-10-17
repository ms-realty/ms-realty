import "server-only";
import { getDb } from "@/db/client";
import { assistanceAvailability } from "@/server/ai/config";
import type { Session } from "@/server/auth/sessions";
import { AssistanceEntry } from "./entry";
import { entryPage, entryView, readAssistanceEntry } from "./entry-loader";

export async function AssistanceEntryScreen({
  locale,
  session,
  page,
  view,
}: {
  locale: string;
  session: Session;
  page?: string | string[];
  view?: string | string[];
}) {
  const entry = await readAssistanceEntry(getDb(), session, entryView(view), entryPage(page));
  return (
    <AssistanceEntry
      locale={locale}
      entry={entry}
      providerEnabled={assistanceAvailability().enabled}
    />
  );
}
