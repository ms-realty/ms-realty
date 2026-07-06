import { timingSafeEqual } from "node:crypto";

const LOCAL_ADMIN_TOKEN = "local-admin-smoke";

export function adminBearerToken(env = process.env) {
  const token = env.MS_REALTY_ADMIN_TOKEN || (env.NODE_ENV === "production" ? "" : LOCAL_ADMIN_TOKEN);
  return token ? `Bearer ${token}` : "";
}

export function isAdminAuthorized(auth, env = process.env) {
  const expected = adminBearerToken(env);
  if (!expected || !auth || Buffer.byteLength(auth) !== Buffer.byteLength(expected)) return false;
  return timingSafeEqual(Buffer.from(auth), Buffer.from(expected));
}
