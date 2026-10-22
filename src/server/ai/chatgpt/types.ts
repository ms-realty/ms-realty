import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";

export const chatGptIssuer = "https://auth.openai.com";
export const chatGptResource = "https://api.openai.com/v1";
export const directScope = "chatgpt.tokens.use.direct";
export const credentialSchema = z
  .object({
    issuer: z.literal(chatGptIssuer),
    subject: z.string().min(1).max(512),
    clientId: z
      .string()
      .min(1)
      .max(512)
      .refine((value) => value !== "dynamic_agent_client"),
    label: z.string().min(1).max(160),
    hostId: z.string().min(1).max(160),
    email: z.string().max(320).nullable(),
    tokens: z
      .object({
        accessToken: z.string().min(1).max(32_768),
        refreshToken: z.string().min(1).max(32_768),
        idToken: z.string().min(1).max(32_768),
        scopes: z.array(z.string().min(1).max(256)).max(64),
        expiresAt: z.number().int().positive(),
      })
      .strict()
      .nullable(),
    savedAt: z.number().int().positive(),
  })
  .strict();
export type ChatGptCredential = z.infer<typeof credentialSchema>;
export type RegistrationIdentity = Pick<ChatGptCredential, "issuer" | "clientId" | "subject">;
export function registrationId(identity: RegistrationIdentity): string {
  return createHash("sha256")
    .update(JSON.stringify([identity.issuer, identity.clientId, identity.subject]))
    .digest("hex");
}
export function assertRegistrationId(id: string): void {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("chatgpt_registration_invalid");
}
export interface LockedRegistration {
  load(): Promise<ChatGptCredential | null>;
  save(value: ChatGptCredential): Promise<void>;
}
export interface ChatGptCredentialStore {
  hostId(): Promise<string>;
  list(): Promise<Array<{ id: string; label: string; connected: boolean }>>;
  withRegistration<T>(id: string, action: (session: LockedRegistration) => Promise<T>): Promise<T>;
}
export class ChatGptError extends Error {
  constructor(
    readonly code: string,
    readonly recovery: "reauthorize" | "usage" | "later" | "configuration" | "unknown" = "unknown",
    readonly inferenceOutcome: "not_started" | "settled" | "unknown" = "unknown",
    readonly usage?: { inputTokens: number; outputTokens: number },
  ) {
    super(code);
    this.name = "ChatGptError";
  }
}
export function subscriptionError(code: string): ChatGptError {
  const recovery =
    code === "subscription_sharing_usage_limit_exceeded"
      ? "usage"
      : code === "subscription_sharing_usage_unavailable"
        ? "later"
        : code === "subscription_sharing_invalid_user"
          ? "reauthorize"
          : "configuration";
  const recognized = new Set([
    "subscription_sharing_usage_limit_exceeded",
    "subscription_sharing_usage_unavailable",
    "subscription_sharing_user_not_eligible",
    "subscription_sharing_unsupported_capability",
    "subscription_sharing_route_not_supported",
    "subscription_sharing_invalid_user",
    "chatpass_v2_scope_not_authorized",
    "chatpass_v2_invalid_authorization_context",
  ]);
  return new ChatGptError(
    recognized.has(code) ? `provider_${code}` : "provider_chatgpt_failed",
    recognized.has(code) ? recovery : "unknown",
    recognized.has(code) ? "settled" : "unknown",
  );
}
