import { workflowCopy } from "@/i18n/workflow-copy";
import "server-only";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db/client";
import {
  type ClientDocument,
  getClientDocument,
  listClientDocuments,
} from "@/server/documents/client";
import { isAppError } from "@/server/errors";
import { documentRequestCopy } from "../document-requests/copy";
import { fileLabel, filesCopy } from "../files/copy";
import {
  type ScreenProps,
  WorkflowPage,
  WorkflowSection,
  WorkflowTime,
  workflowLink,
} from "./screens";

const copy = (locale: string) => workflowCopy(locale, "documents");

async function documentRead<T>(locale: string, path: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isAppError(error) && error.code === "step_up_required")
      redirect(`/${locale}/access/reauth?returnTo=${encodeURIComponent(path)}`);
    if (isAppError(error) && error.code === "not_found") notFound();
    throw error;
  }
}
function FileDetail({ locale, document }: { locale: string; document: ClientDocument }) {
  const c = copy(locale),
    labels = filesCopy(locale),
    file = document.version;
  return (
    <WorkflowSection title={`${document.reference} · ${file.fileName}`}>
      {file.canDownload ? (
        <a className={workflowLink} href={`/api/files/private/document/${file.id}`} download>
          {c.download}
        </a>
      ) : (
        <p role="status">{c[file.downloadUnavailableReason ?? "unavailable"]}</p>
      )}
      <details>
        <summary className="cursor-pointer font-semibold">{c.technical}</summary>
        <p>
          {c.version}: {file.number}
        </p>
      </details>
      <p>
        {c.purpose}: {fileLabel(labels, document.purpose)}
      </p>
      <p>{fileLabel(labels, file.state)}</p>
      <p>
        {c.review}: {file.reviewType ? fileLabel(labels, file.reviewType) : labels.pending}
      </p>
      <p>
        {c.professional}: {c[file.professionalValidation]}
      </p>
      <p>{c.note}</p>
      {document.expiresAt ? (
        <p>
          {c.expiry}: <WorkflowTime value={document.expiresAt} locale={locale} />
        </p>
      ) : null}
      {document.caseId ? (
        <p>
          <a className={workflowLink} href={`/${locale}/overview/${document.caseId}`}>
            {c.back}
          </a>
        </p>
      ) : null}
    </WorkflowSection>
  );
}
export async function ClientDocumentsScreen(props: ScreenProps & { id?: string }) {
  const { locale, session } = props;
  const c = copy(locale);
  const path = `/${locale}/documents${props.id ? `/${props.id}` : ""}`;
  const rows = await documentRead(locale, path, async () =>
    props.id
      ? [await getClientDocument(getDb(), session, props.id)]
      : await listClientDocuments(getDb(), session),
  );
  return (
    <WorkflowPage {...props} title={c.title}>
      <a className={workflowLink} href={`/${locale}/documents/requests`}>
        {documentRequestCopy(locale).requests}
      </a>
      {rows.length ? (
        rows.map((document) => <FileDetail key={document.id} locale={locale} document={document} />)
      ) : (
        <p>{c.empty}</p>
      )}
    </WorkflowPage>
  );
}
