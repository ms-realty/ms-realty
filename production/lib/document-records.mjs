import { DOCUMENT_STATUSES, DOCUMENT_TYPES, SIGNATURE_REQUEST_STATUSES } from "./document-signatures.mjs";
import { renderAdminWorkspace } from "./admin-workflows.mjs";

// Commit dce39f82 landed the durable document and signature authority: three
// Payload collections, a migration with append-only triggers, and nine routes.
// Nothing rendered any of it. A document could be created, versioned and signed
// over HTTP and never appear on a screen, which is the same as not existing for
// the broker who has to chase it.
//
// The store is Payload on Postgres, so it is genuinely absent in local
// development and in every test that does not stand one up. That is a state to
// render, not an error to throw: the screen says the store is unavailable and
// keeps its shape, exactly as the runtime-data-mode surfaces already do.

const OPEN_SIGNATURE_STATUS = "provider_pending";

function documentSummary(documents, requests) {
  const openByDocument = new Map();
  for (const request of requests) {
    if (request.status !== OPEN_SIGNATURE_STATUS) continue;
    openByDocument.set(request.document_id, (openByDocument.get(request.document_id) || 0) + 1);
  }
  return {
    total: documents.length,
    active: documents.filter((row) => row.status === "active").length,
    void: documents.filter((row) => row.status === "void").length,
    awaiting_signature: openByDocument.size,
    open_signature_requests: requests.filter((row) => row.status === OPEN_SIGNATURE_STATUS).length,
    signature_requests: requests.length,
    // A document whose pointer never moved past its first revision has been
    // uploaded once and not revised; the version history is the product's
    // whole claim to an auditable file, so it is worth counting.
    single_revision: documents.filter((row) => Number(row.current_revision_number) <= 1).length,
    open_by_document: Object.fromEntries(openByDocument),
  };
}

function matches(row, filters, openByDocument) {
  if (filters.status && row.status !== filters.status) return false;
  if (filters.documentType && row.document_type !== filters.documentType) return false;
  if (filters.caseId && row.case_id !== filters.caseId) return false;
  if (filters.awaiting && !openByDocument[row.document_id]) return false;
  if (filters.q) {
    const haystack = [row.document_id, row.title, row.subject_ref, row.case_id].join(" ").toLocaleLowerCase();
    if (!haystack.includes(filters.q)) return false;
  }
  return true;
}

export function renderAdminDocumentRecordsPayload(
  registry,
  requestedLocale,
  {
    documents = [],
    signatureRequests = [],
    unavailable = null,
    query = "",
    status = "",
    documentType = "",
    caseId = "",
    awaiting = false,
    operatorId = null,
    generatedAt = new Date().toISOString(),
  } = {},
) {
  const workspace = renderAdminWorkspace({ registry, requestedLocale });
  const summary = documentSummary(documents, signatureRequests);
  const filters = {
    q: String(query).trim().toLocaleLowerCase(),
    status: DOCUMENT_STATUSES.includes(status) ? status : "",
    documentType: DOCUMENT_TYPES.includes(documentType) ? documentType : "",
    caseId: String(caseId).trim(),
    awaiting: awaiting === true || awaiting === "true" || awaiting === "1",
  };
  const rows = documents
    .filter((row) => matches(row, filters, summary.open_by_document))
    .map((row) => ({
      ...row,
      open_signature_requests: summary.open_by_document[row.document_id] || 0,
      revision_path: `/api/admin/documents/${encodeURIComponent(row.document_id)}/revisions`,
    }));

  return {
    kind: "admin_document_records",
    status: 200,
    locale: workspace.locale,
    lang: workspace.lang,
    dir: workspace.dir,
    path: "/admin/documents/records",
    canonical: "/admin/documents/records",
    indexable: false,
    metadata: {
      title: `${workspace.copy.documentRecords || "Documents"} | MS Realty`,
      description: workspace.copy.documentRecordsDescription || "Every document the workspace holds, the version it is on, and who still has to sign it.",
      robots: "noindex,nofollow",
    },
    workspace: { ...workspace, operator_id: operatorId || workspace.operator_id || null },
    generated_at: generatedAt,
    documents: rows,
    signatureRequests,
    filters: { q: filters.q, status: filters.status, documentType: filters.documentType, caseId: filters.caseId, awaiting: filters.awaiting },
    filterOptions: { statuses: [...DOCUMENT_STATUSES], documentTypes: [...DOCUMENT_TYPES], signatureStatuses: [...SIGNATURE_REQUEST_STATUSES] },
    summary,
    // Named the same way the other durable surfaces name it, so the shared
    // notice component renders it without a second vocabulary.
    dataAvailability: unavailable
      ? { documents: { status: "unavailable", reason_key: unavailable.code || "document_store_unavailable", message: unavailable.message || null } }
      : null,
  };
}
