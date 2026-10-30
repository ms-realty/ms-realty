import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// Execute the maintained workflow body with local fakes: no GitHub writes or real sleeps.
const workflow = readFileSync(
  new URL("../.github/workflows/auto-merge.yml", import.meta.url),
  "utf8",
);
const blocks = workflow.split("          script: |\n");
assert.equal(blocks.length, 2, "expected exactly one inline github-script body");
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const execute = new AsyncFunction(
  "github",
  "context",
  "core",
  "setTimeout",
  blocks[1].replace(/^ {12}/gm, ""),
);

const repository = { owner: "ms-realty", repo: "ms-realty" };
const headSha = "a".repeat(40);
const baseSha = "b".repeat(40);
const mergeSha = "c".repeat(40);
const suiteId = 123;
const checkNames = ["ci / gate", "npm run check"];
const propagationMessage = 'Required status check "npm run check" is in progress.';

function pull(overrides = {}) {
  return {
    number: 350,
    title: "Maintenance fixture",
    state: "open",
    draft: false,
    author_association: "COLLABORATOR",
    base: { ref: "main", sha: baseSha },
    head: {
      ref: "codex/maintenance-fixture",
      sha: headSha,
      repo: { full_name: "ms-realty/ms-realty" },
    },
    ...overrides,
  };
}

function check(name, overrides = {}) {
  return {
    name,
    status: "completed",
    conclusion: "success",
    head_sha: headSha,
    check_suite: { id: suiteId },
    ...overrides,
  };
}

function pendingLegacy(name, attempt) {
  return [
    check(
      name,
      name === "npm run check" && attempt === 1 ? { status: "in_progress", conclusion: null } : {},
    ),
  ];
}

function httpError(status, message = "GitHub refused the request.") {
  return Object.assign(new Error(`${message} - documentation link`), {
    status,
    response: { data: { message } },
  });
}

function scenario(options = {}) {
  const calls = [],
    failures = [],
    notices = [];
  const pulls = options.pulls ?? [pull()];
  const merges = options.merges ?? [{ merged: true, sha: mergeSha }];
  let reads = 0,
    mergeAttempts = 0;
  const record = (method, args) => calls.push({ method, args: structuredClone(args) });
  const response = (value) => {
    if (value instanceof Error) throw value;
    return { data: structuredClone(value) };
  };
  const github = {
    rest: {
      pulls: {
        async get(args) {
          record("get", args);
          return response(pulls[Math.min(reads++, pulls.length - 1)]);
        },
        async merge(args) {
          record("merge", args);
          return response(merges[Math.min(mergeAttempts++, merges.length - 1)]);
        },
        async updateBranch(args) {
          record("updateBranch", args);
          return response(options.updateError ?? {});
        },
      },
      checks: {
        async listForRef(args) {
          record("checks", args);
          return response({
            check_runs: options.checks?.(args.check_name, reads) ?? [check(args.check_name)],
          });
        },
      },
      repos: {
        async createDispatchEvent(args) {
          record("dispatch", args);
          return response(options.dispatchError ?? {});
        },
      },
      git: {
        async deleteRef(args) {
          record("delete", args);
          return response(options.deleteError ?? {});
        },
      },
    },
  };
  const reference = Object.hasOwn(options, "reference")
    ? options.reference
    : { number: 350, base: { sha: baseSha } };
  return {
    calls,
    failures,
    notices,
    events: (method) => calls.filter((call) => call.method === method),
    run: () =>
      execute(
        github,
        {
          repo: repository,
          payload: {
            workflow_run: {
              head_sha: headSha,
              check_suite_id: suiteId,
              pull_requests: reference ? [reference] : [],
            },
          },
        },
        {
          setFailed: (message) => failures.push(message),
          notice: (message) => notices.push(message),
        },
        (callback, delay) => {
          record("sleep", delay);
          callback();
        },
      ),
  };
}

function assertNoPostMerge(run) {
  assert.equal(run.events("dispatch").length, 0);
  assert.equal(run.events("delete").length, 0);
}

function assertNoWrites(run) {
  assert.equal(run.events("merge").length, 0);
  assert.equal(run.events("updateBranch").length, 0);
  assertNoPostMerge(run);
}

test("both protected checks permit an exact-head squash before dispatch and branch deletion", async () => {
  const run = scenario();
  await run.run();
  assert.deepEqual(run.failures, []);
  assert.deepEqual(
    run.calls.map(({ method }) => method),
    ["get", "checks", "checks", "merge", "dispatch", "delete"],
  );
  assert.deepEqual(run.events("get")[0].args, { ...repository, pull_number: 350 });
  assert.deepEqual(
    run.events("checks").map(({ args }) => args),
    checkNames.map((name) => ({
      ...repository,
      ref: headSha,
      check_name: name,
      filter: "latest",
      per_page: 100,
    })),
  );
  assert.deepEqual(run.events("merge")[0].args, {
    ...repository,
    pull_number: 350,
    merge_method: "squash",
    sha: headSha,
    commit_title: "Maintenance fixture (#350)",
  });
  assert.deepEqual(run.events("dispatch")[0].args, {
    ...repository,
    event_type: "auto_merged",
    client_payload: { merge_sha: mergeSha },
  });
  assert.deepEqual(run.events("delete")[0].args, {
    ...repository,
    ref: "heads/codex/maintenance-fixture",
  });
});

test("pending legacy check waits and rereads the PR and both checks before merging", async () => {
  const run = scenario({ checks: pendingLegacy });
  await run.run();
  assert.deepEqual(run.failures, []);
  assert.deepEqual(
    run.calls.map(({ method }) => method),
    ["get", "checks", "checks", "sleep", "get", "checks", "checks", "merge", "dispatch", "delete"],
  );
  assert.equal(run.events("sleep")[0].args, 5000);
});

for (const [label, overrides] of [
  ["wrong suite", { check_suite: { id: suiteId + 1 } }],
  ["missing suite", { check_suite: null }],
  ["wrong head", { head_sha: "d".repeat(40) }],
  ["missing head", { head_sha: undefined }],
  ["wrong name", { name: "unprotected check" }],
]) {
  test(`a successful check from ${label} cannot qualify this CI run`, async () => {
    const run = scenario({ checks: (name) => [check(name, overrides)] });
    await run.run();
    assertNoWrites(run);
    assert.equal(run.events("get").length, 12);
    assert.equal(run.events("sleep").length, 11);
    assert.match(run.failures[0], /did not settle after 12 attempts/);
  });
}

for (const name of checkNames) {
  for (const conclusion of [
    "failure",
    "cancelled",
    "skipped",
    "timed_out",
    "neutral",
    "action_required",
    "stale",
    null,
  ]) {
    test(`${name} completing with ${conclusion} fails immediately`, async () => {
      const run = scenario({
        checks: (requested) => [check(requested, requested === name ? { conclusion } : {})],
      });
      await run.run();
      assertNoWrites(run);
      assert.equal(run.events("get").length, 1);
      assert.equal(run.events("sleep").length, 0);
      assert.deepEqual(run.failures, [`The ${name} check of this CI run did not succeed.`]);
    });
  }
}

for (const [label, checks] of [
  ["missing checks", () => []],
  ["queued checks", (name) => [check(name, { status: "queued", conclusion: null })]],
  ["incomplete success", (name) => [check(name, { status: "in_progress" })]],
]) {
  test(`${label} exhaust the shared wait budget without merging`, async () => {
    const run = scenario({ checks });
    await run.run();
    assertNoWrites(run);
    assert.equal(run.events("get").length, 12);
    assert.equal(run.events("checks").length, 24);
    assert.deepEqual(
      run.events("sleep").map(({ args }) => args),
      Array(11).fill(5000),
    );
    assert.equal(run.failures.length, 1);
  });
}

test("an additional failed check in this suite cannot be hidden by a success", async () => {
  const run = scenario({ checks: (name) => [check(name), check(name, { conclusion: "failure" })] });
  await run.run();
  assertNoWrites(run);
  assert.equal(run.failures.length, 1);
});

test("a failed check from another suite does not invalidate this suite's success", async () => {
  const run = scenario({
    checks: (name) => [
      check(name, { check_suite: { id: suiteId + 1 }, conclusion: "failure" }),
      check(name),
    ],
  });
  await run.run();
  assert.deepEqual(run.failures, []);
  assert.equal(run.events("merge").length, 1);
});

test("the known 405 rejection retries only after fresh PR and check reads", async () => {
  const run = scenario({
    pulls: [pull(), pull({ title: "Updated maintenance fixture" })],
    merges: [httpError(405, propagationMessage), { merged: true, sha: mergeSha }],
  });
  await run.run();
  assert.deepEqual(run.failures, []);
  assert.deepEqual(
    run.calls.map(({ method }) => method),
    [
      "get",
      "checks",
      "checks",
      "merge",
      "sleep",
      "get",
      "checks",
      "checks",
      "merge",
      "dispatch",
      "delete",
    ],
  );
  assert.equal(run.events("merge")[1].args.commit_title, "Updated maintenance fixture (#350)");
  assert.equal(run.events("merge")[1].args.sha, headSha);
});

test("check polling and 405 retries share one bounded attempt budget", async () => {
  const run = scenario({
    checks: pendingLegacy,
    merges: [httpError(405, propagationMessage)],
  });
  await run.run();
  assertNoPostMerge(run);
  assert.equal(run.events("get").length, 12);
  assert.equal(run.events("checks").length, 24);
  assert.equal(run.events("merge").length, 11);
  assert.equal(run.events("sleep").length, 11);
  assert.match(run.failures[0], /did not settle after 12 attempts/);
});

test("a check becoming failed after 405 prevents a second merge attempt", async () => {
  const run = scenario({
    merges: [httpError(405, propagationMessage)],
    checks: (name, attempt) => [check(name, attempt > 1 ? { conclusion: "failure" } : {})],
  });
  await run.run();
  assert.equal(run.events("merge").length, 1);
  assertNoPostMerge(run);
  assert.equal(run.failures.length, 1);
});

const guardChanges = [
  ["closed", pull({ state: "closed" }), false],
  ["draft", pull({ draft: true }), false],
  ["changed head", pull({ head: { ...pull().head, sha: "d".repeat(40) } }), true],
  [
    "foreign repository",
    pull({ head: { ...pull().head, repo: { full_name: "foreign/repo" } } }),
    true,
  ],
  ["missing head repository", pull({ head: { ...pull().head, repo: null } }), true],
  ["different target", pull({ base: { ...pull().base, ref: "release" } }), true],
  ["untrusted author", pull({ author_association: "CONTRIBUTOR" }), true],
];

for (const [label, changedPull, failed] of guardChanges) {
  test(`an initially ${label} PR cannot write`, async () => {
    const run = scenario({ pulls: [changedPull] });
    await run.run();
    assertNoWrites(run);
    assert.equal(run.events("sleep").length, 0);
    assert.equal(run.failures.length, Number(failed));
  });
}

for (const cause of ["pending check", "405 rejection"]) {
  for (const [label, changedPull, failed] of [
    ...guardChanges,
    ["changed base", pull({ base: { ref: "main", sha: "e".repeat(40) } }), false],
  ]) {
    test(`${label} during a ${cause} wait prevents merging the changed PR`, async () => {
      const retryMerge = cause === "405 rejection";
      const run = scenario({
        pulls: [pull(), changedPull],
        checks: retryMerge ? undefined : pendingLegacy,
        merges: retryMerge ? [httpError(405, propagationMessage)] : undefined,
      });
      await run.run();
      assertNoPostMerge(run);
      assert.equal(run.events("get").length, 2);
      assert.equal(run.events("merge").length, Number(retryMerge));
      assert.equal(run.failures.length, Number(failed));
      if (label === "changed base") {
        assert.deepEqual(
          run.events("updateBranch").map(({ args }) => args),
          [
            {
              ...repository,
              pull_number: 350,
              expected_head_sha: headSha,
            },
          ],
        );
      } else {
        assert.equal(run.events("updateBranch").length, 0);
      }
    });
  }
}

test("an initially advanced base requests a CAS branch update and a fresh CI run", async () => {
  const run = scenario({ pulls: [pull({ base: { ref: "main", sha: "e".repeat(40) } })] });
  await run.run();
  assert.deepEqual(
    run.events("updateBranch").map(({ args }) => args),
    [
      {
        ...repository,
        pull_number: 350,
        expected_head_sha: headSha,
      },
    ],
  );
  assert.equal(run.events("merge").length, 0);
  assertNoPostMerge(run);
  assert.equal(run.events("sleep").length, 0);
  assert.deepEqual(run.failures, []);
});

test("a failed CAS branch update is not retried", async () => {
  const error = httpError(422);
  const run = scenario({
    pulls: [pull({ base: { ref: "main", sha: "e".repeat(40) } })],
    updateError: error,
  });
  await assert.rejects(run.run(), (actual) => actual === error);
  assert.equal(run.events("updateBranch").length, 1);
  assert.equal(run.events("merge").length, 0);
  assert.equal(run.events("sleep").length, 0);
  assertNoPostMerge(run);
});

test("a CI run without an attached PR performs no reads or writes", async () => {
  const run = scenario({ reference: null });
  await run.run();
  assert.deepEqual(run.calls, []);
  assert.deepEqual(run.failures, []);
  assert.equal(run.notices.length, 1);
});

for (const association of ["OWNER", "MEMBER"]) {
  test(`the existing ${association} author policy remains allowed`, async () => {
    const run = scenario({ pulls: [pull({ author_association: association })] });
    await run.run();
    assert.deepEqual(run.failures, []);
    assert.equal(run.events("merge").length, 1);
  });
}

for (const error of [
  httpError(403, propagationMessage),
  httpError(409, propagationMessage),
  httpError(500, propagationMessage),
  httpError(405, "Pull request is not mergeable."),
  httpError(405, 'Required status check "ci / gate" is in progress.'),
  httpError(405, 'Required status check "npm run check" is expected.'),
  Object.assign(new Error(propagationMessage), { status: 405 }),
  new TypeError("Network connection closed after sending the merge request."),
]) {
  test(`an unrelated or ambiguous merge error is not retried: ${error.status ?? "network"} ${error.message}`, async () => {
    const run = scenario({ merges: [error] });
    await assert.rejects(run.run(), (actual) => actual === error);
    assert.equal(run.events("get").length, 1);
    assert.equal(run.events("merge").length, 1);
    assert.equal(run.events("sleep").length, 0);
    assertNoPostMerge(run);
  });
}

for (const message of ["Branch protection refused the merge.", undefined]) {
  test(`a non-merged result fails without retry or post-merge writes (${message ?? "no message"})`, async () => {
    const run = scenario({ merges: [{ merged: false, message }] });
    await run.run();
    assert.deepEqual(run.failures, [message ?? "GitHub refused the merge."]);
    assert.equal(run.events("merge").length, 1);
    assert.equal(run.events("sleep").length, 0);
    assertNoPostMerge(run);
  });
}

for (const status of [404, 422]) {
  test(`an already-deleted branch response ${status} remains harmless`, async () => {
    const run = scenario({ deleteError: httpError(status) });
    await run.run();
    assert.deepEqual(run.failures, []);
    assert.equal(run.events("merge").length, 1);
    assert.equal(run.events("dispatch").length, 1);
    assert.equal(run.events("delete").length, 1);
    assert.ok(run.notices.includes("The merged branch was already deleted."));
  });
}

for (const operation of ["dispatch", "delete"]) {
  test(`a ${operation} failure after a successful merge cannot retry the merge`, async () => {
    const error = httpError(405, propagationMessage);
    const run = scenario({ [`${operation}Error`]: error });
    await assert.rejects(run.run(), (actual) => actual === error);
    assert.equal(run.events("merge").length, 1);
    assert.equal(run.events("sleep").length, 0);
    assert.equal(run.events("delete").length, Number(operation === "delete"));
  });
}
