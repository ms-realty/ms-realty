import { lookup as dnsLookup } from "node:dns/promises";
import net from "node:net";

export const SEARCH_QUERY_MAX_BYTES = 1024 * 1024;

const PLACEHOLDER_HOSTS = new Set(["example.com", "example.net", "example.org"]);
const PLACEHOLDER_SUFFIXES = [".example", ".example.com", ".example.net", ".example.org", ".invalid", ".test"];

export class SearchServiceConfigurationError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "SearchServiceConfigurationError";
  }
}

function invalidConfiguration(message, options) {
  return new SearchServiceConfigurationError(message, options);
}

export function privateSearchServiceNetworkAllowed(env = process.env) {
  return String(env.MS_REALTY_SEARCH_ALLOW_PRIVATE_SERVICE_NETWORK || "").trim().toLowerCase() === "true";
}

function normalizedHostname(url) {
  return url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
}

export function assertSearchServiceUrl(value, { label = "Search service URL", exactOrigin = true } = {}) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    throw invalidConfiguration(`${label} must be a valid URL`);
  }
  if (!["http:", "https:"].includes(url.protocol)) throw invalidConfiguration(`${label} must use HTTPS`);
  if (url.username || url.password) throw invalidConfiguration(`${label} must not include URL credentials`);
  if (url.hash) throw invalidConfiguration(`${label} must not include a fragment`);
  if (exactOrigin && (url.pathname !== "/" || url.search)) throw invalidConfiguration(`${label} must be an exact service origin`);
  const host = normalizedHostname(url);
  if (!host) throw invalidConfiguration(`${label} must include a hostname`);
  if (PLACEHOLDER_HOSTS.has(host) || PLACEHOLDER_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    throw invalidConfiguration(`${label} must not use a placeholder service URL`);
  }
  return url;
}

function ipv4Kind(address) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return "blocked";
  const [a, b, c, d] = octets;
  if ((a === 169 && b === 254) || (a === 100 && b === 100 && c === 100 && d === 200)) return "blocked";
  if (a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return "private";
  if (a === 100 && b >= 64 && b <= 127) return "private";
  if (
    a === 0 ||
    a >= 224 ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  ) {
    return "blocked";
  }
  return "public";
}

function ipv6Bytes(address) {
  let value = address.toLowerCase().split("%")[0];
  if (value.includes(".")) {
    const separator = value.lastIndexOf(":");
    const octets = value.slice(separator + 1).split(".").map(Number);
    if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null;
    value = `${value.slice(0, separator)}:${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }
  const halves = value.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const words = [...head, ...Array(missing).fill("0"), ...tail].map((part) => Number.parseInt(part || "0", 16));
  if (words.length !== 8 || words.some((word) => !Number.isInteger(word) || word < 0 || word > 0xffff)) return null;
  return words.flatMap((word) => [word >> 8, word & 0xff]);
}

function startsWith(bytes, prefix) {
  return prefix.every((value, index) => bytes[index] === value);
}

function ipv6Kind(address) {
  const bytes = ipv6Bytes(address);
  if (!bytes) return "blocked";
  if (startsWith(bytes, Array(10).fill(0)) && bytes[10] === 0xff && bytes[11] === 0xff) {
    return ipv4Kind(bytes.slice(12).join("."));
  }
  if (bytes.every((byte) => byte === 0)) return "blocked";
  if (bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1) return "private";
  if ((bytes[0] & 0xfe) === 0xfc) return "private";
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return "blocked";
  if (bytes[0] === 0xff) return "blocked";
  if ((bytes[0] & 0xe0) !== 0x20) return "blocked";
  if (
    startsWith(bytes, [0, 0]) ||
    startsWith(bytes, [0, 100, 0xff, 0x9b]) ||
    startsWith(bytes, [1, 0, 0, 0, 0, 0, 0, 0]) ||
    startsWith(bytes, [0x20, 0x02]) ||
    startsWith(bytes, [0x20, 0x01, 0x0d, 0xb8]) ||
    (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] < 0x02) ||
    (bytes[0] === 0x3f && bytes[1] === 0xff && (bytes[2] & 0xf0) === 0)
  ) {
    return "blocked";
  }
  return "public";
}

function addressKind(address) {
  const family = net.isIP(address);
  if (family === 4) return ipv4Kind(address);
  if (family === 6) return ipv6Kind(address);
  return "blocked";
}

async function resolvedAddresses(hostname, lookupImpl) {
  if (net.isIP(hostname)) return [hostname];
  const result = await lookupImpl(hostname, { all: true, verbatim: true });
  const rows = Array.isArray(result) ? result : [result];
  const addresses = rows.map((row) => (typeof row === "string" ? row : row?.address)).filter(Boolean);
  if (!addresses.length) throw new Error(`Search service hostname ${hostname} did not resolve`);
  return [...new Set(addresses)];
}

export async function validateSearchServiceDestination(
  value,
  { label = "Search service URL", exactOrigin = true, allowPrivateNetwork = false, lookupImpl = dnsLookup } = {},
) {
  const url = assertSearchServiceUrl(value, { label, exactOrigin });
  if (typeof lookupImpl !== "function") throw invalidConfiguration("Search service DNS lookup is required");
  const addresses = await resolvedAddresses(normalizedHostname(url), lookupImpl);
  const kinds = addresses.map(addressKind);
  if (kinds.includes("blocked") || (!allowPrivateNetwork && kinds.includes("private"))) {
    throw invalidConfiguration(`${label} resolves to a private or reserved address; localhost or placeholder destinations require an approved private-service network`);
  }
  if (url.protocol !== "https:" && !(allowPrivateNetwork && kinds.every((kind) => kind === "private"))) {
    throw invalidConfiguration(`${label} must use HTTPS unless the private-service network opt-in targets only private addresses`);
  }
  return url;
}

export async function fetchSearchService({
  baseUrl,
  route,
  fetchImpl = globalThis.fetch,
  lookupImpl = dnsLookup,
  allowPrivateNetwork = false,
  timeoutMs,
  options = {},
  label = "Search service URL",
} = {}) {
  if (typeof fetchImpl !== "function") throw invalidConfiguration("Search service fetch is required");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw invalidConfiguration("Search service timeout must be a positive integer");
  const base = await validateSearchServiceDestination(baseUrl, { label, allowPrivateNetwork, lookupImpl });
  if (!String(route || "").startsWith("/")) throw invalidConfiguration("Search service route must be origin-relative");
  const url = new URL(route, `${base.origin}/`);
  if (url.origin !== base.origin || url.hash || url.username || url.password) {
    throw invalidConfiguration("Search service request must stay on the configured origin");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Search service request exceeded ${timeoutMs}ms`)), timeoutMs);
  try {
    const response = await fetchImpl(url.href, { ...options, redirect: "error", signal: controller.signal });
    if (response?.url && new URL(response.url).origin !== base.origin) {
      throw invalidConfiguration("Search service response left the configured origin");
    }
    return { response, url: url.href, clearDeadline: () => clearTimeout(timer) };
  } catch (error) {
    clearTimeout(timer);
    throw error;
  }
}

export async function readBoundedJsonResponse(response, { maxBytes = SEARCH_QUERY_MAX_BYTES, label = "Search service" } = {}) {
  const declared = Number(response?.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error(`${label} response exceeds ${maxBytes} bytes`);

  let text;
  if (response?.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new Error(`${label} response exceeds ${maxBytes} bytes`);
      }
      chunks.push(Buffer.from(value));
    }
    text = Buffer.concat(chunks, bytes).toString("utf8");
  } else if (typeof response?.text === "function") {
    text = await response.text();
    if (Buffer.byteLength(text) > maxBytes) throw new Error(`${label} response exceeds ${maxBytes} bytes`);
  } else if (typeof response?.json === "function") {
    const payload = await response.json();
    if (Buffer.byteLength(JSON.stringify(payload)) > maxBytes) throw new Error(`${label} response exceeds ${maxBytes} bytes`);
    return payload;
  } else {
    throw new Error(`${label} response body is unavailable`);
  }

  return JSON.parse(text);
}
