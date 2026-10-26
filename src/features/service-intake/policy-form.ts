export const serviceScopeFields = [
  "topic",
  "region",
  "state",
  "mode",
  "publicSource",
  "termsSource",
  "ownerId",
  "fallbackId",
  "fallbackSource",
  "reviewExpiresAt",
  "reason",
] as const;
export const serviceScopeApprovalFields = ["expectedHash", "reviewed", "note"] as const;
