import { headers } from "next/headers";

/**
 * Exposes the request's CSP nonce to React Aria, which injects a small <style> for press
 * handling and reads the nonce from <meta name="csp-nonce">. Render it once per root layout;
 * React hoists it into <head>.
 */
export async function CspNonceMeta() {
  const nonce = (await headers()).get("x-nonce");
  return nonce ? <meta name="csp-nonce" nonce={nonce} /> : null;
}
