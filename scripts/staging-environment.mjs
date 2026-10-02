import { fileURLToPath } from "node:url";
import { accountId, sha256 } from "./staging-config.mjs";

/** Expected fingerprint/sentinel are installed by the controller, outside builder artifacts. */
export function stagingEnvironment(env) {
  if (
    env.CLOUDFLARE_ACCOUNT_ID !== accountId ||
    typeof env.CLOUDFLARE_API_TOKEN !== "string" ||
    !env.CLOUDFLARE_API_TOKEN ||
    !/^[a-f0-9]{64}$/.test(env.STAGING_CLOUDFLARE_TOKEN_SHA256 ?? "") ||
    sha256(env.CLOUDFLARE_API_TOKEN) !== env.STAGING_CLOUDFLARE_TOKEN_SHA256 ||
    typeof env.STAGING_ENVIRONMENT_TOKEN_SENTINEL !== "string" ||
    env.STAGING_ENVIRONMENT_TOKEN_SENTINEL.length < 32
  )
    throw new Error(
      "Fresh environment-owned staging Cloudflare token/fingerprint/sentinel is required",
    );
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    stagingEnvironment(process.env);
    console.log("Staging token custody guard satisfied; token is not logged.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Staging token custody unavailable");
    process.exitCode = 1;
  }
}
