import { secretMatches } from "./durable-case-authority.mjs";

// The preview host hides the admin from the world, which is right while the
// site lives on a guessable *.workers.dev address - but the owner has to be
// able to check the workbench there before moving the domain onto it, and a
// blanket 404 locks him out of his own site from every device but one.
//
// So the preview admin is gated on a key the owner holds rather than removed.
// Presenting it once as ?admin_key=... sets an HttpOnly cookie and redirects
// to the clean URL, so ordinary navigation works from then on and the key
// never sits in the address bar or in a referrer. This is obscurity, not
// authentication: what actually protects the workbench is the sign-in behind
// it, with its own rate limiting and audit trail. The gate only decides
// whether a stranger sees a door at all.
//
// With no key configured the behaviour is exactly what it is today: 404. A
// default would be a backdoor, so there is none.
const PREVIEW_ADMIN_COOKIE = "ms_preview_admin";
const PREVIEW_ADMIN_QUERY = "admin_key";

function cookieValue(header, name) {
  for (const part of String(header || "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      try {
        return decodeURIComponent(rest.join("=") || "");
      } catch {
        return "";
      }
    }
  }
  return "";
}

export async function previewAdminGate(request, env, url, privateResponse) {
  const expected = env.MS_REALTY_PREVIEW_ADMIN_KEY?.trim() || "";
  if (!expected) return privateResponse();

  const presented = url.searchParams.get(PREVIEW_ADMIN_QUERY)?.trim() || "";
  if (presented && (await secretMatches(presented, expected))) {
    const clean = new URL(url);
    clean.searchParams.delete(PREVIEW_ADMIN_QUERY);
    return new Response(null, {
      status: 303,
      headers: {
        location: `${clean.pathname}${clean.search}`,
        "cache-control": "no-store",
        "set-cookie": `${PREVIEW_ADMIN_COOKIE}=${encodeURIComponent(expected)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200`,
      },
    });
  }

  const carried = cookieValue(request.headers.get("cookie"), PREVIEW_ADMIN_COOKIE);
  if (carried && (await secretMatches(carried, expected))) return null;
  return privateResponse();
}
