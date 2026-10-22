// Synthetic transport only. Never load a real credential store or call a live endpoint.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type {
  ArtifactProposal,
  PlannerInput,
  PlannerTurn,
  WorkspaceTool,
} from "../src/domain/generative";
import { chatGptGeneration } from "../src/server/ai/chatgpt/transport";
import {
  assertDisposableEndpoint,
  parseQualificationArguments,
  type QualificationOptions,
  type QualificationTransport,
  readObservedCatalog,
  redactEvidence,
  runChatGptQualification,
} from "./generative-chatgpt-evaluate";

const fallback = new URL("postgres://postgres@127.0.0.1:55449/postgres");
fallback.password = randomUUID();
const endpoint = process.env.TEST_DATABASE_URL ?? fallback.toString();
const syntheticModel = "synthetic-harness-planner";
function args(root: string) {
  return [
    "--live-subscription",
    "--model",
    syntheticModel,
    "--registration",
    "a".repeat(64),
    "--bootstrap-dir",
    join(root, "unused-private-bootstrap"),
    "--catalog",
    join(root, "catalog.json"),
    "--output",
    join(root, "evidence"),
  ];
}
function turn(
  tool: WorkspaceTool | null = null,
  next: PlannerTurn["next"] = tool ? "tool" : "review",
): PlannerTurn {
  return {
    message: "Synthetic test turn; no actual model or human review.",
    questions: [],
    decisions: ["A person owns every ordinary command."],
    plan: [{ id: "investigate", title: "Synthetic evidence review", state: "working" }],
    next,
    tool,
  };
}
function syntheticTurn(input: PlannerInput): PlannerTurn {
  const brief = input.context.sources.find((source) => source.key.startsWith("brief:"));
  const listings = input.context.sources.filter((source) => source.type === "listing");
  assert.ok(brief && listings[0] && listings[1]);
  const proposal: ArtifactProposal = {
    kind: "task",
    title: "Verify the quiet shortlist",
    body: "Check the quiet preference and the lift requirement before any client contact.",
    citations: [{ source: brief.key, quote: "A lift is essential" }],
  };
  const corrected = input.conversation.some(
    (item) => item.role === "user" && item.text.startsWith("Quiet comes first."),
  );
  if (!corrected) {
    const tools: WorkspaceTool[] = [
      { name: "context.read", source: brief.key },
      { name: "listings.compare", ids: listings.map((listing) => listing.id) },
      { name: "calculate", operation: "divide", values: [120000, 68] },
      {
        name: "draft.prepare",
        proposal: { ...proposal, kind: "research", title: "Provisional synthetic evidence review" },
      },
    ];
    const tool = tools[input.checkpoints.length];
    return tool
      ? turn(tool)
      : { ...turn(null, "clarify"), questions: ["Does quiet or central convenience come first?"] };
  }
  if (input.checkpoints.length === 0) return turn({ name: "draft.prepare", proposal });
  if (input.checkpoints.length === 1)
    return turn({
      name: "draft.prepare",
      proposal: {
        ...proposal,
        kind: "buyer_handoff",
        title: "Quiet remote-work buyer handoff",
        body: "Review the selected approved fact cards and the unknown acoustic conditions manually.",
        requirements: "A lift is essential. Quiet remote working comes first.",
        preferences: "Near the centre only if the quiet requirement is met.",
        listingIds: [listings[0].id],
        citations: [...proposal.citations, { source: listings[0].key, quote: listings[0].title }],
      },
    });
  return turn();
}
function frame(value: unknown) {
  return `data: ${JSON.stringify(value)}\n\n`;
}
function syntheticTransport(
  mode: "complete" | "usage_limit" | "interrupted",
): QualificationTransport {
  const wire: unknown[] = [],
    dummyAuthorization = randomUUID();
  return {
    mode: "synthetic_transport",
    secrets: [dummyAuthorization],
    wire,
    async generate(request) {
      const input = request.input as PlannerInput;
      const raw =
        mode === "usage_limit"
          ? frame({ type: "error", code: "subscription_sharing_usage_limit_exceeded" })
          : mode === "interrupted"
            ? frame({ type: "response.output_text.delta", delta: "incomplete synthetic output" })
            : frame({
                type: "response.completed",
                response: {
                  status: "completed",
                  usage: { input_tokens: 80, output_tokens: 40 },
                  output: [
                    {
                      type: "message",
                      content: [
                        { type: "output_text", text: JSON.stringify(syntheticTurn(input)) },
                      ],
                    },
                  ],
                },
              });
      wire.push({ synthetic: true, status: 200, body: raw });
      return chatGptGeneration({ ...request, bearer: dummyAuthorization }, async (url, init) => {
        assert.equal(String(url), "https://api.openai.com/v1/responses");
        assert.equal(
          new Headers(init?.headers).get("Authorization"),
          `Bearer ${dummyAuthorization}`,
        );
        return new Response(raw, { headers: { "content-type": "text/event-stream" } });
      });
    },
  };
}

test("qualification requires explicit live opt-in, model, registration, paths and the exact disposable endpoint", () => {
  const values = args("/tmp/msr-synthetic-qualification");
  assert.throws(
    () => parseQualificationArguments(values.slice(1), { TEST_DATABASE_URL: endpoint }),
    /qualification_live_subscription_opt_in_required/u,
  );
  assert.throws(
    () =>
      parseQualificationArguments([...values, "--model", "other"], { TEST_DATABASE_URL: endpoint }),
    /qualification_duplicate_argument/u,
  );
  assert.throws(
    () =>
      parseQualificationArguments([...values, "--max-calls", "25"], {
        TEST_DATABASE_URL: endpoint,
      }),
    /qualification_limit_out_of_range/u,
  );
  assert.throws(
    () =>
      parseQualificationArguments([...values, "--max-output-tokens", "999999"], {
        TEST_DATABASE_URL: endpoint,
      }),
    /qualification_limit_out_of_range/u,
  );
  assert.throws(
    () => parseQualificationArguments(values, {}),
    /qualification_disposable_database_required/u,
  );
  for (const mutation of [
    { port: "5432" },
    { hostname: "example.test" },
    { pathname: "/shared" },
    { search: "?options=unsafe" },
  ]) {
    const url: URL = new URL(endpoint);
    Object.assign(url, mutation);
    assert.throws(
      () => assertDisposableEndpoint(url.toString()),
      /qualification_disposable_database_required/u,
    );
  }
  const parsed = parseQualificationArguments(values, { TEST_DATABASE_URL: endpoint });
  assert.equal(parsed.limits.maxCalls, 16);
  assert.equal(parsed.model, syntheticModel);
});
test("catalog selection is exact and credential/evidence paths cannot overlap", async () => {
  const root = await mkdtemp(join(tmpdir(), "msr-qualification-options-"));
  try {
    await writeFile(
      join(root, "catalog.json"),
      JSON.stringify([{ slug: syntheticModel, display_name: "Synthetic harness model" }]),
    );
    assert.equal((await readObservedCatalog(join(root, "catalog.json"), syntheticModel)).count, 1);
    await assert.rejects(
      readObservedCatalog(join(root, "catalog.json"), "not-observed"),
      /qualification_model_not_in_observed_catalog/u,
    );
    const values = args(root);
    const catalogIndex = values.indexOf("--catalog");
    values[catalogIndex + 1] = join(root, "unused-private-bootstrap", "credential.json");
    assert.throws(
      () => parseQualificationArguments(values, { TEST_DATABASE_URL: endpoint }),
      /qualification_evidence_must_not_read_or_overwrite_credentials/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("redaction removes account/session values while retaining exact source facts and null money", () => {
  const syntheticValue = randomUUID();
  const result = redactEvidence(
    {
      access_token: syntheticValue,
      refreshToken: syntheticValue,
      nested: [
        `source price 120000 EUR; ${syntheticValue}`,
        { quote: "A lift is essential", actualCostMicros: null },
      ],
    },
    [syntheticValue],
  );
  assert.deepEqual(result, {
    access_token: "[REDACTED]",
    refreshToken: "[REDACTED]",
    nested: [
      "source price 120000 EUR; [REDACTED]",
      { quote: "A lift is essential", actualCostMicros: null },
    ],
  });
});
const databaseAvailable = Boolean(process.env.TEST_DATABASE_URL);
for (const mode of ["complete", "usage_limit", "interrupted"] as const)
  test(`real persisted qualification harness with ${mode} synthetic transport`, {
    skip: !databaseAvailable,
    timeout: 60000,
  }, async () => {
    const root = await mkdtemp(join(tmpdir(), "msr-qualification-harness-"));
    try {
      await writeFile(
        join(root, "catalog.json"),
        JSON.stringify([{ slug: syntheticModel, display_name: "Synthetic harness model" }]),
      );
      const options: QualificationOptions = parseQualificationArguments(args(root), {
        TEST_DATABASE_URL: endpoint,
      });
      const catalog = await readObservedCatalog(options.catalogFile, options.model);
      const transport = syntheticTransport(mode);
      const report = await runChatGptQualification(options, transport, catalog);
      assert.equal(report.mode, "synthetic_transport");
      assert.equal(report.observed.actualCostMicros, null);
      assert.equal(report.qualification.humanScores, null);
      assert.equal(report.qualification.expertBaseline, null);
      assert.equal(report.qualification.deployedRuntimeCustody, "unverified");
      assert.ok(report.protectedEffects.every((effect) => effect.unchanged));
      const packet = JSON.parse(await readFile(join(options.output, "packet.json"), "utf8")) as {
        personCommands: { receipt?: { status: string } }[];
        persisted: {
          runs: {
            inferenceOutcome: string;
            actualCostMicros: null;
            observedCostMicros: null;
            reservedCostMicros: null;
          }[];
          artifacts: unknown[];
        };
      };
      assert.ok(
        packet.persisted.runs.every(
          (run) =>
            run.actualCostMicros === null &&
            run.observedCostMicros === null &&
            run.reservedCostMicros === null,
        ),
      );
      if (mode === "complete") {
        assert.equal(report.status, "completed_automated_checks", JSON.stringify(report.failure));
        assert.equal(report.failure, null);
        assert.equal(report.observed.generationAttempts, 8);
        assert.equal(packet.persisted.runs.length, 2);
        assert.ok(packet.personCommands.length >= 7);
        assert.ok(
          packet.personCommands.every((command) => command.receipt?.status === "succeeded"),
        );
        assert.ok(packet.persisted.artifacts.length >= 4);
      } else {
        assert.equal(report.status, "failed_or_paused");
        assert.equal(report.observed.generationAttempts, 1);
        assert.equal(packet.persisted.artifacts.length, 0);
        if (mode === "usage_limit")
          assert.equal(
            (report.failure as { code: string }).code,
            "provider_subscription_sharing_usage_limit_exceeded",
          );
        else assert.ok(packet.persisted.runs.some((run) => run.inferenceOutcome === "unknown"));
      }
      const evidenceText = await readFile(join(options.output, "providerCalls.json"), "utf8");
      assert.ok(transport.secrets.every((value) => !evidenceText.includes(value)));
      const manifest = JSON.parse(
        await readFile(join(options.output, "artifact-manifest.json"), "utf8"),
      );
      assert.deepEqual(Object.keys(manifest.files).sort(), [
        "packet.json",
        "providerCalls.json",
        "rawWireResponses.json",
        "report.json",
      ]);
      await assert.rejects(
        runChatGptQualification(options, syntheticTransport("complete"), catalog),
        { code: "EEXIST" },
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
