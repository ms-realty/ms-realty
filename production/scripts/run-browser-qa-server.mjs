import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHttpApp } from "../lib/http.mjs";
import { close, createNodeServer, listen } from "../lib/node-server.mjs";
import { approvedPublicSeedFixture } from "../test/approved-public-seed.fixture.mjs";
import { createPayloadDraftRuntime } from "../test/payload-draft-runtime.fixture.mjs";

const port = Number(process.env.PORT || 4321);
const sessionToken = "payload.browser.qa";
const leadContactKey = "browser-qa-lead-contact-key-longer-than-thirty-two-characters";
const leadDurableStore = {
  leadDurableStoreEnabled: true,
  payloadSecret: "browser-qa-payload-secret",
  databaseUrl: "postgres://browser-qa.invalid/ms_realty",
  contactSecret: leadContactKey,
  workspaceId: "sandanski",
};
Object.assign(process.env, {
  MS_REALTY_LEAD_DURABLE_STORE_ENABLED: "true",
  PAYLOAD_SECRET: leadDurableStore.payloadSecret,
  DATABASE_URL: leadDurableStore.databaseUrl,
  MS_REALTY_LEAD_CONTACT_KEY: leadContactKey,
});
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-browser-qa-"));
const file = (name) => path.join(directory, `${name}.jsonl`);
const paths = {
  leadLedgerPath: file("leads"),
  leadAssignmentLedgerPath: file("lead-assignments"),
  leadPipelineOutcomeLedgerPath: file("lead-pipeline-outcomes"),
  leadContactVaultPath: file("lead-contacts"),
  publicContactVaultPath: file("public-contacts"),
  replyOutboxPath: file("replies"),
  replyDeliveryOutcomeLedgerPath: file("reply-delivery"),
  languageRequestPath: file("language-requests"),
  translationLedgerPath: file("translations"),
  listingEditLedgerPath: file("listing-edits"),
  viewingLedgerPath: file("viewings"),
  viewingFollowUpLedgerPath: file("viewing-follow-ups"),
  savedSearchLedgerPath: file("saved-searches"),
  sellerPipelinePath: file("seller-pipeline"),
  sellerPipelineOutcomeLedgerPath: file("seller-pipeline-outcomes"),
  dealLedgerPath: file("deals"),
  brokerContactLedgerPath: file("broker-contacts"),
  tourApprovalLedgerPath: file("tour-approvals"),
  eventLedgerPath: file("events"),
  consentLedgerPath: file("consents"),
  auditLogPath: file("audit"),
  slugHistoryPath: file("slug-history"),
};
for (const ledgerPath of Object.values(paths)) fs.writeFileSync(ledgerPath, "");

const providerDocuments = [
  {
    id: "browser-qa-google",
    provider: "google",
    status: "connected",
    account_label: "owner@example.test",
    scopes: ["gmail.send", "calendar.events"],
    last_verified_at: "2026-08-13T12:00:00.000Z",
    credential_envelope: { ciphertext: "BROWSER_QA_CREDENTIAL_MARKER" },
  },
];
const providerPayload = {
  async find({ where }) {
    const provider = where?.provider?.equals;
    return { docs: provider ? providerDocuments.filter((row) => row.provider === provider) : providerDocuments };
  },
  async create() {
    throw new Error("Browser QA provider writes are disabled");
  },
  async update() {
    throw new Error("Browser QA provider writes are disabled");
  },
};
const payloadListingRuntime = createPayloadDraftRuntime(approvedPublicSeedFixture()).payload;

const app = createHttpApp({
  ...paths,
  seed: approvedPublicSeedFixture(),
  payloadListingRuntime,
  payloadListingEnv: {},
  leadContactKey,
  publicContactKey: "browser-qa-public-contact-key-longer-than-thirty-two-characters",
  leadDurableStore,
  readLeadIntakesDurably: async () => [],
  persistLeadIntake: async ({ lead, receivedAt }) => ({
    lead: { lead_id: lead.lead.id, idempotency_key: lead.lead.idempotency_key },
    contactVault: { lead_id: lead.lead.id, stored_at: receivedAt, encrypted: true, durable: true },
    created: true,
    idempotent: false,
  }),
  viewingDurableStore: { viewingDurableStoreEnabled: false },
  payloadAdminAuth: {
    async resolve(token) {
      return token === sessionToken
        ? {
            principal: {
              id: "browser-qa-admin",
              source: "payload_session",
              can_mutate: true,
              roles: ["admin"],
              workspace_ids: ["sandanski"],
            },
            user: { id: "browser-qa-admin" },
          }
        : null;
    },
  },
  providerConnection: {
    publicOrigin: `http://127.0.0.1:${port}`,
    credentialSecret: "browser-qa-provider-key-longer-than-thirty-two-characters",
    stateSecret: "browser-qa-state-key-longer-than-thirty-two-characters",
    payloadSecret: "browser-qa-payload-secret",
    databaseUrl: "postgres://browser-qa.invalid/ms_realty",
    googleClientId: "browser-qa-google-client",
    googleClientSecret: "browser-qa-google-secret",
    metaAppId: "123456789012345",
    metaAppSecret: "browser-qa-meta-secret",
    metaConfigId: "987654321098765",
    metaGraphVersion: "v22.0",
    metaFacebookPublishReady: true,
    metaInstagramPublishReady: true,
    metaWebhookVerifyToken: "browser-qa-webhook-token-long-enough",
    viberCommercialReady: true,
    webhookMaxBytes: 1024 * 1024,
  },
  providerConnectionPayload: providerPayload,
  receivedAt: "2026-08-13T12:00:00.000Z",
  reviewedAt: "2026-08-13T12:00:00.000Z",
  bookedAt: "2026-08-13T12:00:00.000Z",
});
const server = createNodeServer(app);
const address = await listen(server, port, "127.0.0.1");
console.log(JSON.stringify({ kind: "ms_realty_browser_qa", status: "listening", address, sessionToken }));

async function shutdown() {
  await close(server);
  fs.rmSync(directory, { recursive: true, force: true });
  process.exit(0);
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
