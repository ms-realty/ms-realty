// Shared Payload access control. Payload's default is "any authenticated user
// may do anything", which let a broker/editor account manage administrators
// and read every workspace's cases. These policies close that: roles are
// enforced per collection, administrator management is admin-only, and the
// realty-case plane is filtered to the operator's assigned workspaces.
//
// Access functions return a boolean, or (for read/update/delete) a Payload
// `where` query that scopes the rows. Field-level `access` returns a boolean.

import { APIError } from "payload";
import { REALTY_CASE_PAYLOAD_COLLECTION_SLUGS } from "./realty-case-collections.mjs";

const REALTY_CASE_SLUGS = new Set(REALTY_CASE_PAYLOAD_COLLECTION_SLUGS);

const roleOf = (user) => (user && typeof user.role === "string" ? user.role : null);

// An operator may carry an explicit workspace allowlist. Empty/absent means
// "not workspace-scoped" — only admins are allowed that, and only admins get
// unfiltered case access below.
function workspaceIdsOf(user) {
  const raw = user?.workspace_ids;
  if (Array.isArray(raw)) return raw.map((v) => String(v || "").trim()).filter(Boolean);
  if (typeof raw === "string" && raw.trim()) return [raw.trim()];
  return [];
}

function relationshipId(value) {
  return String(value && typeof value === "object" ? value.id || "" : value || "").trim();
}

function denyWorkspaceBoundary(message) {
  throw new APIError(message, 403);
}

export function caseWorkspaceBoundaryHook({ fields = [] } = {}) {
  const relationships = fields.filter(
    (field) => field.type === "relationship" && typeof field.relationTo === "string" && REALTY_CASE_SLUGS.has(field.relationTo),
  );

  return async ({ data = {}, operation, originalDoc, req }) => {
    if (roleOf(req?.user) !== "broker") return data;

    const allowedWorkspaces = workspaceIdsOf(req.user);
    const submittedWorkspace = String(data.workspace_id || "").trim();
    const originalWorkspace = String(originalDoc?.workspace_id || "").trim();
    const workspace = operation === "update" ? originalWorkspace : submittedWorkspace;
    if (!workspace || !allowedWorkspaces.includes(workspace)) {
      denyWorkspaceBoundary("The selected workspace is not available to this operator");
    }
    if (operation === "update" && Object.hasOwn(data, "workspace_id") && submittedWorkspace !== originalWorkspace) {
      denyWorkspaceBoundary("A case cannot be moved to another workspace");
    }

    for (const field of relationships) {
      if (!Object.hasOwn(data, field.name)) continue;
      const id = relationshipId(data[field.name]);
      if (!id) continue;
      if (!req.payload?.find) denyWorkspaceBoundary("Related Realty Case records cannot be verified");
      const related = await req.payload.find({
        collection: field.relationTo,
        depth: 0,
        limit: 1,
        overrideAccess: true,
        req,
        where: { and: [{ id: { equals: id } }, { workspace_id: { equals: workspace } }] },
      });
      if (!related.docs?.length) {
        denyWorkspaceBoundary("Related Realty Case records must belong to the same workspace");
      }
    }

    return data;
  };
}

export const isAdmin = ({ req }) => roleOf(req?.user) === "admin";
export const isAuthenticated = ({ req }) => Boolean(req?.user);

export function hasRole(...roles) {
  const allowed = new Set(roles);
  return ({ req }) => {
    const role = roleOf(req?.user);
    return Boolean(role) && allowed.has(role);
  };
}

// Read/write predicate for the workspace-scoped realty-case collections.
// admin → true (all rows). An operator with a workspace allowlist → a `where`
// that limits rows to those workspaces. Anyone else → false.
export function workspaceScopedAccess({ allowRoles = ["admin", "broker"], field = "workspace_id" } = {}) {
  const allowed = new Set(allowRoles);
  return ({ req }) => {
    const user = req?.user;
    const role = roleOf(user);
    if (!role || !allowed.has(role)) return false;
    if (role === "admin") return true;
    const workspaces = workspaceIdsOf(user);
    if (workspaces.length === 0) return false; // non-admin without a scope sees nothing
    return { [field]: { in: workspaces } };
  };
}

// admins collection: only an admin manages operator accounts. Every operator
// may read and update THEIR OWN record (name, etc.) but not role or others.
export const adminsCollectionAccess = {
  create: isAdmin,
  delete: isAdmin,
  read: ({ req }) => {
    if (roleOf(req?.user) === "admin") return true;
    if (req?.user?.id) return { id: { equals: req.user.id } };
    return false;
  },
  update: ({ req }) => {
    if (roleOf(req?.user) === "admin") return true;
    if (req?.user?.id) return { id: { equals: req.user.id } };
    return false;
  },
};

// The role field itself is admin-only writable, so a self-update cannot become
// a privilege escalation.
export const adminRoleFieldAccess = {
  create: isAdmin,
  update: isAdmin,
};

// Content plane: everyone signed in reads; admins and editors write; nobody
// deletes but an admin (deletes are destructive and rare).
export const contentCollectionAccess = {
  create: hasRole("admin", "editor"),
  read: isAuthenticated,
  update: hasRole("admin", "editor"),
  delete: isAdmin,
};

// Translations additionally admit translators for create/update.
export const translationCollectionAccess = {
  create: hasRole("admin", "editor", "translator"),
  read: isAuthenticated,
  update: hasRole("admin", "editor", "translator"),
  delete: isAdmin,
};

// Reference data (locales): all read, admin write.
export const referenceCollectionAccess = {
  create: isAdmin,
  read: isAuthenticated,
  update: isAdmin,
  delete: isAdmin,
};

// Realty-case plane: workspace-scoped for broker, full for admin.
export const caseCollectionAccess = {
  create: hasRole("admin", "broker"),
  read: workspaceScopedAccess({ allowRoles: ["admin", "broker"] }),
  update: workspaceScopedAccess({ allowRoles: ["admin", "broker"] }),
  delete: isAdmin,
};

// Which generated content collections are translation-shaped (translators may
// write) vs plain content (editors only).
const TRANSLATION_SLUGS = new Set(["listing_translations"]);

export function accessForGeneratedCollection(slug) {
  if (TRANSLATION_SLUGS.has(slug)) return translationCollectionAccess;
  return contentCollectionAccess;
}
