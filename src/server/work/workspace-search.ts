import "server-only";
import type { Session } from "../auth/sessions";
import { listCases } from "../cases/queries";
import type { Executor } from "../db";
import { isAppError } from "../errors";
import { inventoryListPage } from "../inventory/queries";
import { listContacts, listInbox, listTasks, searchInquiries } from "./queries";

export type WorkspaceSearchRow = {
  kind: "inquiries" | "cases" | "contacts" | "listings" | "tasks";
  id: string;
  label: string;
  reference?: string;
};

async function optional<T>(read: Promise<T>, empty: T): Promise<T> {
  try {
    return await read;
  } catch (error) {
    if (isAppError(error) && ["forbidden", "not_found"].includes(error.code)) return empty;
    throw error;
  }
}
/** F13/O01: every collection applies its existing live record scopes before returning matches. */
export async function searchWorkspace(
  db: Executor,
  session: Session,
  q: string,
  scope: "all" | "contacts" = "all",
) {
  const contactPage = await listContacts(db, session, 1, q);
  const contacts: WorkspaceSearchRow[] = contactPage.rows.map((row) => ({
    kind: "contacts",
    id: row.id,
    label: row.name,
  }));
  if (scope === "contacts") return contacts;
  const [inquiries, cases, inventory, tasks] = await Promise.all([
    searchInquiries(db, session, q),
    listCases(db, session, q),
    optional(inventoryListPage(db, session.actor, { q, pageSize: 20 }), {
      rows: [],
      total: 0,
      nextCursor: null,
    }),
    listTasks(db, session, { q }),
  ]);
  return [
    ...inquiries.rows.map(
      ({ inquiry }): WorkspaceSearchRow => ({
        kind: "inquiries",
        id: inquiry.id,
        label: inquiry.preferredName ?? inquiry.reference,
        reference: inquiry.reference,
      }),
    ),
    ...cases.map(
      (row): WorkspaceSearchRow => ({
        kind: "cases",
        id: row.id,
        label: row.title,
        reference: row.reference,
      }),
    ),
    ...contacts,
    ...inventory.rows.map(
      (row): WorkspaceSearchRow => ({
        kind: "listings",
        id: row.listing.reference,
        label: row.title ?? row.listing.reference,
        reference: row.listing.reference,
      }),
    ),
    ...tasks.rows.map(
      ({ task }): WorkspaceSearchRow => ({ kind: "tasks", id: task.id, label: task.title }),
    ),
  ];
}

/** Queue counts are real readable open records. Unavailable counts remain absent. */
export async function workspaceCounts(db: Executor, session: Session) {
  const [inquiries, tasks, inventory] = await Promise.allSettled([
    listInbox(db, session),
    listTasks(db, session),
    inventoryListPage(db, session.actor, { pageSize: 1 }),
  ]);
  return {
    ...(inquiries.status === "fulfilled" && inquiries.value.total !== null
      ? { inquiries: inquiries.value.total }
      : {}),
    ...(tasks.status === "fulfilled" && tasks.value.total !== null
      ? { tasks: tasks.value.total }
      : {}),
    ...(inventory.status === "fulfilled" ? { inventory: inventory.value.total } : {}),
  };
}
