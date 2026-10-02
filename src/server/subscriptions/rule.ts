import "server-only";
import { getEnv } from "../config/env";
import { alertTemplateVersion } from "./template";

export interface AlertRule {
  readonly templateVersion: typeof alertTemplateVersion;
  readonly publicOrigin: string;
  readonly clientOrigin: string;
}
function approvedOrigin(value: string) {
  const url = new URL(value);
  const loopback =
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.hostname.endsWith(".localhost");
  if (
    url.origin !== value ||
    url.username ||
    url.password ||
    (url.protocol !== "https:" && !(loopback && url.protocol === "http:"))
  )
    throw new Error("Invalid alert origin");
  return value;
}
export function validateAlertRule(rule: AlertRule): AlertRule {
  if (rule.templateVersion !== alertTemplateVersion) throw new Error("Unapproved alert template");
  return {
    ...rule,
    publicOrigin: approvedOrigin(rule.publicOrigin),
    clientOrigin: approvedOrigin(rule.clientOrigin),
  };
}
export function currentAlertRule(): AlertRule {
  const configured = getEnv();
  return validateAlertRule({
    templateVersion: alertTemplateVersion,
    publicOrigin: configured.hosts.public,
    clientOrigin: configured.hosts.client,
  });
}
/** Environment gate only. A current recorded human rule approval is required separately. */
export function configuredAlertRule(
  env: Record<string, string | undefined> = process.env,
): AlertRule | null {
  if (
    env.SEARCH_ALERTS_ENABLED !== "true" ||
    env.SEARCH_ALERTS_TEMPLATE_APPROVED !== alertTemplateVersion
  )
    return null;
  return currentAlertRule();
}
