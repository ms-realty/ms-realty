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

const copy = (locale: string) =>
  locale === "bg"
    ? {
        title: "Документи",
        empty: "Няма документи, споделени изрично с този профил.",
        download: "Изтегляне на текущия файл",
        version: "Версия",
        purpose: "Предназначение",
        review: "Преглед за посочената цел",
        professional: "Професионална проверка",
        not_requested: "Не е поискана",
        requested: "Поискана · очаква се резултат",
        validated: "Записано е професионално заключение",
        declined: "Отказана",
        expiry: "Валиден до",
        scan_pending: "Файлът се проверява. Проверете отново по-късно.",
        scan_failed: "Проверката не завърши. Свържете се с брокера.",
        unsafe: "Файлът не е безопасен и не може да бъде изтеглен.",
        needs_replacement: "Необходим е заместващ файл. Свържете се с брокера.",
        unavailable: "Файлът още не е достъпен за изтегляне.",
        back: "Отваряне на случая",
        note: "Показана е текущата версия. Прегледът за определена цел е отделен от професионалното заключение.",
      }
    : locale === "ru"
      ? {
          title: "Документы",
          empty: "Нет документов, явно открытых этому профилю.",
          download: "Скачать текущий файл",
          version: "Версия",
          purpose: "Назначение",
          review: "Проверка для указанной цели",
          professional: "Профессиональная проверка",
          not_requested: "Не запрошена",
          requested: "Запрошена · ожидается результат",
          validated: "Записано профессиональное заключение",
          declined: "Отклонена",
          expiry: "Действителен до",
          scan_pending: "Файл проверяется. Повторите позже.",
          scan_failed: "Проверка не завершена. Свяжитесь с брокером.",
          unsafe: "Файл небезопасен и недоступен для скачивания.",
          needs_replacement: "Нужен заменяющий файл. Свяжитесь с брокером.",
          unavailable: "Файл пока недоступен для скачивания.",
          back: "Открыть дело",
          note: "Показана текущая версия. Проверка для конкретной цели отличается от профессионального заключения.",
        }
      : {
          title: "Documents",
          empty: "No documents have been explicitly shared with this account.",
          download: "Download current file",
          version: "Version",
          purpose: "Purpose",
          review: "Review for the stated purpose",
          professional: "Professional review",
          not_requested: "Not requested",
          requested: "Requested · awaiting a result",
          validated: "Professional conclusion recorded",
          declined: "Declined",
          expiry: "Valid until",
          scan_pending: "The file is being checked. Check again later.",
          scan_failed: "The file check did not complete. Contact your broker.",
          unsafe: "The file is unsafe and cannot be downloaded.",
          needs_replacement: "A replacement file is needed. Contact your broker.",
          unavailable: "This file is not available for download yet.",
          back: "Open case",
          note: "This is the current version. Review for a stated purpose is separate from a professional conclusion.",
        };

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
      <p>
        {c.version}: {file.number}
      </p>
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
      {file.canDownload ? (
        <a className={workflowLink} href={`/api/files/private/document/${file.id}`} download>
          {c.download}
        </a>
      ) : (
        <p role="status">{c[file.downloadUnavailableReason ?? "unavailable"]}</p>
      )}
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
