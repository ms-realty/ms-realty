export const MEDIA_INGEST_CONTEXT = "ms-realty-media-ingest-v1";

export async function mediaIngestCredential(originToken) {
  const token = String(originToken || "");
  if (token.length < 32) return "";
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(token),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(MEDIA_INGEST_CONTEXT)));
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
