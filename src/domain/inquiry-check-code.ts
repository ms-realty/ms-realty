// A short support code for a caller to read aloud. It identifies possible staff-visible
// inquiries; it never authorizes a public receipt read or replaces the full submission key.
const base64url = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const crockford = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const issuedKeyShape = /^[A-Za-z0-9_-]{43}\.[0-9a-f]{32}$/;

/** Re-encode the first 30 random nonce bits as six phone-friendly characters. */
export function inquiryCheckCode(submissionKey: string): string | null {
  if (!issuedKeyShape.test(submissionKey)) return null;
  let bits = 0;
  for (const char of submissionKey.slice(0, 5)) bits = bits * 64 + base64url.indexOf(char);
  let code = "";
  for (let shift = 25; shift >= 0; shift -= 5) code += crockford.charAt((bits >>> shift) & 31);
  return code;
}

/** Staff search decodes the same bits to an exact nonce prefix; aliases help phone transcription. */
export function checkCodeNoncePrefix(input: string): string | null {
  const code = input.replace(/[\s-]/g, "").toUpperCase().replaceAll("O", "0").replace(/[IL]/g, "1");
  if (code.length !== 6) return null;
  let bits = 0;
  for (const char of code) {
    const value = crockford.indexOf(char);
    if (value < 0) return null;
    bits = bits * 32 + value;
  }
  let prefix = "";
  for (let shift = 24; shift >= 0; shift -= 6) prefix += base64url.charAt((bits >>> shift) & 63);
  return prefix;
}
