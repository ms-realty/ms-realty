export const POSTGRES_SEARCH_SYNC_SOURCE = "postgres_search_sync";
export const POSTGRES_SEARCH_QUERY_SOURCE = "postgres_search_query";
export const HERMES_DRAFT_WORKER_SOURCE = "hermes_draft_worker";
export const PRODUCTION_SEARCH_ENGINE = "postgres";
export const PRODUCTION_SEARCH_ENGINE_ENV = "MS_REALTY_SEARCH_ENGINE";

// Keep Hermes as a launch requirement until the product owner explicitly approves otherwise.
export const HERMES_LAUNCH_REQUIRED = true;

export function isProductionEnvironment(value) {
  return String(value || "").trim().toLowerCase() === "production";
}

export function assertProductionSearchEngine(value) {
  const engine = String(value || "").trim().toLowerCase();
  if (engine !== PRODUCTION_SEARCH_ENGINE) {
    throw new Error(`${PRODUCTION_SEARCH_ENGINE_ENV} must be ${PRODUCTION_SEARCH_ENGINE} in production`);
  }
  return engine;
}

export function searchRuntimeEnvironment(env = {}) {
  if (!isProductionEnvironment(env.NODE_ENV)) return env;
  return Object.fromEntries(
    Object.entries(env).filter(([name]) => !name.startsWith("TYPESENSE_") && !name.startsWith("MEILI_")),
  );
}

export function buildLaunchServiceRequirements({
  hermesRequired = HERMES_LAUNCH_REQUIRED,
} = {}) {
  const reportSources = [
    POSTGRES_SEARCH_SYNC_SOURCE,
    POSTGRES_SEARCH_QUERY_SOURCE,
  ];
  const provisioningChecks = [
    "database_url",
    "payload_secret",
    "search_engine",
    "postgres_database_target",
  ];
  const provisioningServices = ["postgres_search"];

  if (hermesRequired) {
    reportSources.push(HERMES_DRAFT_WORKER_SOURCE);
    provisioningChecks.push(
      "hermes_provider",
      "hermes_agent_health",
      "hermes_agent_capabilities",
    );
    provisioningServices.push("hermes");
  }

  return {
    reportSources,
    provisioningChecks,
    provisioningServices,
  };
}

const requirements = buildLaunchServiceRequirements();

export const REQUIRED_LIVE_SERVICE_REPORT_SOURCES = Object.freeze(
  requirements.reportSources,
);
export const REQUIRED_LIVE_SERVICE_PROVISIONING_CHECK_IDS = Object.freeze(
  requirements.provisioningChecks,
);
export const REQUIRED_LIVE_SERVICE_PROVISIONING_SERVICES = Object.freeze(
  requirements.provisioningServices,
);
