const PAYLOAD_ADMIN_COLLECTION = "admins";
import { isFixtureBrokerId } from "./listing-verification.mjs";

export const PAYLOAD_ADMIN_ROLES = ["admin", "broker", "editor", "translator"];
const PASSWORD_CHANGE_FAILURE_CODES = new Set([
  "missing_fields",
  "password_too_short",
  "confirmation_mismatch",
  "same_password",
  "current_password_rejected",
]);

function passwordChangeError(code, message) {
  return Object.assign(new Error(message), { code });
}

export function payloadAdminPasswordChangeFailureCode(error) {
  return PASSWORD_CHANGE_FAILURE_CODES.has(error?.code) ? error.code : "service_unavailable";
}

function workspaceIds(value) {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return [...new Set(raw.map((entry) => String(entry || "").trim()).filter(Boolean))];
}

function safeOperator(value) {
  if (!value || typeof value !== "object") return null;
  return {
    id: value.id,
    email: typeof value.email === "string" ? value.email : "",
    name: typeof value.name === "string" ? value.name : "",
    role: typeof value.role === "string" ? value.role : "",
    workspace_ids: workspaceIds(value.workspace_ids),
    password_change_required: value.password_change_required === true,
    createdAt: value.createdAt || null,
    updatedAt: value.updatedAt || null,
  };
}

export function assignableBrokerProfiles(operators) {
  return (Array.isArray(operators) ? operators : [])
    .filter(
      (operator) =>
        ["admin", "broker"].includes(String(operator?.role || "").trim().toLowerCase()) &&
        String(operator?.id ?? "").trim(),
    )
    .map((operator) => {
      const id = String(operator.id);
      const email = String(operator.email || "");
      const fixture = isFixtureBrokerId(id);
      const name = String(operator.name || "").trim();
      const languages =
        Array.isArray(operator.languages) && operator.languages.length
          ? [...new Set(operator.languages.map((value) => String(value || "").trim()).filter(Boolean))]
          : fixture
            ? id === "broker_bg"
              ? ["bg"]
              : id === "broker_ru"
                ? ["ru"]
                : id === "broker_international"
                  ? ["en"]
                  : []
            : [];
      return {
        id,
        email,
        name: fixture && (!name || name === id) ? "" : name || email || id,
        languages,
      };
    });
}

export function payloadAdminPrincipal(value) {
  if (!value || value.collection !== PAYLOAD_ADMIN_COLLECTION || !PAYLOAD_ADMIN_ROLES.includes(value.role)) return null;
  const id = String(value.id ?? "").trim();
  const email = String(value.email || "").trim().toLowerCase();
  if (!id || !email) return null;
  return {
    id: `payload-${id}`,
    source: "payload_session",
    can_mutate: true,
    roles: [value.role],
    workspace_ids: workspaceIds(value.workspace_ids),
    payload_user_id: value.id,
    email,
    password_change_required: value.password_change_required === true,
  };
}

export function payloadAdminOwnerProfile(session) {
  const user = session?.user || {};
  const principal = session?.principal || payloadAdminPrincipal(user) || {};
  const roles = Array.isArray(principal.roles) ? principal.roles.map(String).filter(Boolean) : [];
  const assignedWorkspaces = workspaceIds(principal.workspace_ids);
  return {
    id: String(principal.id || ""),
    name: String(user.name || "").trim(),
    email: String(user.email || principal.email || "").trim().toLowerCase(),
    roles,
    workspace_ids: assignedWorkspaces,
    full_workspace_access: roles.includes("admin") && assignedWorkspaces.length === 0,
    editable: Boolean(user.id),
  };
}

function normalizedCredentials(input) {
  const email = String(input?.email || "").trim().toLowerCase();
  const password = typeof input?.password === "string" ? input.password : "";
  if (!email || !password) throw new Error("Email and password are required");
  return { email, password };
}

function normalizedOperatorInput(input) {
  const email = String(input?.email || "").trim().toLowerCase();
  const password = typeof input?.password === "string" ? input.password : "";
  const role = String(input?.role || "").trim().toLowerCase();
  const name = String(input?.name || "").trim();
  if (!email || !password) throw new Error("Email and password are required");
  if (password.length < 12) throw new Error("Password must be at least 12 characters");
  if (!PAYLOAD_ADMIN_ROLES.includes(role)) throw new Error("A valid operator role is required");
  return {
    email,
    password,
    name,
    role,
    workspace_ids: workspaceIds(input?.workspace_ids),
    password_change_required: true,
  };
}

function normalizedProfileInput(input) {
  const name = String(input?.name || "").trim();
  if (!name) throw new Error("Name is required");
  if (name.length > 120) throw new Error("Name must be at most 120 characters");
  return { name };
}

function normalizedOperatorUpdateInput(session, input) {
  const id = String(input?.operator_id || input?.id || "").trim();
  const role = String(input?.role || "").trim().toLowerCase();
  const name = normalizedProfileInput(input).name;
  const assignedWorkspaces = workspaceIds(input?.workspace_ids);
  if (!id) throw new Error("Operator id is required");
  if (!PAYLOAD_ADMIN_ROLES.includes(role)) throw new Error("A valid operator role is required");
  if (String(session?.user?.role || "") !== "admin") throw new Error("Only an administrator may manage operator access");
  if (String(session.user.id) === id) {
    const currentWorkspaces = workspaceIds(session.user.workspace_ids);
    if (role !== "admin" || currentWorkspaces.join("\n") !== assignedWorkspaces.join("\n")) {
      throw new Error("Use another administrator to change your own access");
    }
  }
  return { id, data: { name, role, workspace_ids: assignedWorkspaces } };
}

function normalizedPasswordChangeInput(input) {
  const currentPassword = typeof input?.current_password === "string" ? input.current_password : "";
  const password = typeof input?.password === "string" ? input.password : "";
  const confirmation = typeof input?.password_confirmation === "string" ? input.password_confirmation : "";
  if (!currentPassword || !password || !confirmation) {
    throw passwordChangeError("missing_fields", "All password fields are required");
  }
  if (password.length < 12) throw passwordChangeError("password_too_short", "Password must be at least 12 characters");
  if (password !== confirmation) throw passwordChangeError("confirmation_mismatch", "Password confirmation does not match");
  if (password === currentPassword) throw passwordChangeError("same_password", "The new password must be different");
  return { currentPassword, password };
}

async function revokePayloadSessionWithLocalApi({ payload, token, user }) {
  const { createLocalReq, logoutOperation } = await import("payload");
  const headers = new Headers({ authorization: `JWT ${token}` });
  const req = await createLocalReq({ req: { headers }, user }, payload);
  return logoutOperation({ collection: payload.collections[PAYLOAD_ADMIN_COLLECTION], req });
}

export function createPayloadAdminAuthService(
  payload,
  { revokePayloadSession = revokePayloadSessionWithLocalApi } = {},
) {
  if (!payload?.login || !payload?.auth || !payload?.find || !payload?.create || !payload?.update) {
    throw new Error("Payload admin authentication requires the Payload Local API");
  }

  async function resolve(token) {
    const sessionToken = String(token || "").trim();
    if (!sessionToken) return null;
    try {
      const result = await payload.auth({ headers: new Headers({ authorization: `JWT ${sessionToken}` }) });
      const principal = payloadAdminPrincipal(result?.user);
      return principal ? { principal, user: result.user } : null;
    } catch {
      return null;
    }
  }

  return {
    async login(input) {
      const credentials = normalizedCredentials(input);
      const result = await payload.login({
        collection: PAYLOAD_ADMIN_COLLECTION,
        data: credentials,
      });
      const principal = payloadAdminPrincipal(result?.user);
      const token = String(result?.token || "").trim();
      const exp = Number(result?.exp);
      if (!principal || !token || !Number.isFinite(exp)) throw new Error("Payload did not issue a valid admin session");
      return { exp, principal, token, user: result.user };
    },

    resolve,

    async logout(token) {
      const sessionToken = String(token || "").trim();
      const session = await resolve(sessionToken);
      if (!session) return false;
      await revokePayloadSession({ payload, token: sessionToken, user: session.user });
      return true;
    },

    async changePassword(session, input) {
      if (!session?.user) throw new Error("An authenticated Payload session is required");
      const { currentPassword, password } = normalizedPasswordChangeInput(input);
      const email = String(session.user.email || "").trim().toLowerCase();
      if (!email) throw new Error("The authenticated Payload user has no email address");
      let verification = null;
      try {
        try {
          verification = await payload.login({
            collection: PAYLOAD_ADMIN_COLLECTION,
            data: { email, password: currentPassword },
          });
        } catch (error) {
          if (error?.status === 401 || error?.statusCode === 401 || error?.name === "AuthenticationError") {
            throw passwordChangeError("current_password_rejected", "Current password verification failed");
          }
          throw error;
        }
        if (String(verification?.user?.id ?? "") !== String(session.user.id ?? "")) {
          throw passwordChangeError("current_password_rejected", "Current password verification failed");
        }
        const operator = await payload.update({
          collection: PAYLOAD_ADMIN_COLLECTION,
          id: session.user.id,
          data: { password, password_change_required: false, sessions: [] },
          depth: 0,
          overrideAccess: true,
        });
        return safeOperator(operator);
      } finally {
        if (verification?.token && verification?.user) {
          try {
            await revokePayloadSession({ payload, token: verification.token, user: verification.user });
          } catch {
            // The update clears every session; a second revocation may find none.
          }
        }
      }
    },

    async listOperators(session) {
      if (!session?.user) throw new Error("An authenticated Payload session is required");
      const result = await payload.find({
        collection: PAYLOAD_ADMIN_COLLECTION,
        depth: 0,
        limit: 0,
        overrideAccess: false,
        pagination: false,
        sort: "email",
        user: session.user,
        select: { email: true, name: true, role: true, workspace_ids: true },
      });
      return (result?.docs || []).map(safeOperator).filter(Boolean);
    },

    async createOperator(session, input) {
      if (!session?.user) throw new Error("An authenticated Payload session is required");
      const operator = await payload.create({
        collection: PAYLOAD_ADMIN_COLLECTION,
        data: normalizedOperatorInput(input),
        depth: 0,
        overrideAccess: false,
        user: session.user,
      });
      return safeOperator(operator);
    },

    async updateProfile(session, input) {
      if (!session?.user) throw new Error("An authenticated Payload session is required");
      const operator = await payload.update({
        collection: PAYLOAD_ADMIN_COLLECTION,
        id: session.user.id,
        data: normalizedProfileInput(input),
        depth: 0,
        overrideAccess: false,
        user: session.user,
      });
      return safeOperator(operator);
    },

    async updateOperator(session, input) {
      if (!session?.user) throw new Error("An authenticated Payload session is required");
      const update = normalizedOperatorUpdateInput(session, input);
      const operator = await payload.update({
        collection: PAYLOAD_ADMIN_COLLECTION,
        id: update.id,
        data: update.data,
        depth: 0,
        overrideAccess: false,
        user: session.user,
      });
      return safeOperator(operator);
    },
  };
}

let runtimeServicePromise;

export async function getPayloadAdminAuthService() {
  if (!runtimeServicePromise) {
    runtimeServicePromise = (async () => {
      const [{ getPayload }, configModule] = await Promise.all([import("payload"), import("../../payload.config.js")]);
      const payload = await getPayload({ config: await configModule.default });
      return createPayloadAdminAuthService(payload);
    })();
  }
  try {
    return await runtimeServicePromise;
  } catch (error) {
    runtimeServicePromise = undefined;
    throw error;
  }
}
