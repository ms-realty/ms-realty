const PAYLOAD_ADMIN_COLLECTION = "admins";
export const PAYLOAD_ADMIN_ROLES = ["admin", "broker", "editor", "translator"];

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
    createdAt: value.createdAt || null,
    updatedAt: value.updatedAt || null,
  };
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
  if (!PAYLOAD_ADMIN_ROLES.includes(role)) throw new Error("A valid operator role is required");
  return { email, password, name, role, workspace_ids: workspaceIds(input?.workspace_ids) };
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
  if (!payload?.login || !payload?.auth || !payload?.find || !payload?.create) {
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

    async listOperators(session) {
      if (!session?.user) throw new Error("An authenticated Payload session is required");
      const result = await payload.find({
        collection: PAYLOAD_ADMIN_COLLECTION,
        depth: 0,
        limit: 100,
        overrideAccess: false,
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
