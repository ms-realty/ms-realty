// Token and hashing primitives shared by sessions, sign-in links, rate limits and receipts.
import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { canonicalJson } from "@/domain/approval";

/** An opaque, URL-safe secret of 32 random bytes. */
export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Keyed hash for identifiers such as IP addresses, which a plain hash would not protect. */
export function keyedHash(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

/** SHA-256 of a request body in canonical JSON: key order does not change the hash. */
export function hashRequest(body: unknown): string {
  return sha256Hex(canonicalJson(body));
}
