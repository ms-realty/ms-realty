// R03 / F04 / AT09. A CI observation for release preparation. Never a readiness artifact.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs, stripVTControlCharacters } from "node:util";

const REPO = "ms-realty/ms-realty";
const REPO_ID = 1311414066;
const WEB = `https://github.com/${REPO}`;
const WORKFLOW = ".github/workflows/ci.yml";
const WORKFLOW_ID = 319878187;
const BROWSER_STEP = "Complete the browser profile with the real scanner";
const UPLOAD_STEP = "Preserve browser reports and failure traces";
const UPLOAD_ACTION = "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a";
export const profiles = ["chromium-desktop", "chromium-mobile", "webkit-mobile"];
const file = "shared-shortlist.spec.ts";
const fileId = "52c3b5d0ca593b879aa5";
const sourcePins = {
  [WORKFLOW]: "5246aaffc1452db84c149df7544c2e647c447d82b2a9fde3e2a993cf6b14d6a2",
  "package.json": "be87438dc1fd2cb7e8e7adfa6edeb114203d7d9a67125416f8f9fbe924f6ccdd",
  "scripts/ci-clamav.mjs": "f1b4feeec582635c69537f7f2663648c2ec31337ab4308cba82b3071021119aa",
  "scripts/wait-clamav.ts": "5c647adaf1c27ca920740250c46d7a2ea3340b03058bc311928f1e13c2ce2f9b",
  "scripts/e2e-server.ts": "54faf79b105c8abb80adc7e740e56ee278dfe660626d2786cadf6e1e5c64501a",
  "package-lock.json": "5e4bd53175d665e5f15badec0897e8e2776f044969630ff2cc62f6bd27b448d1",
  "playwright.config.ts": "08c1d272f1559084679fea430e2059cfd1d06f52a297bb18076748338fae3eb0",
  [`e2e/${file}`]: "a37b6fa63c8740fbfb9701d56dfae7e22a52ebd6ffff25ce28897c33c8162672",
};
const creatorCard = "locator('article[data-share-state]').first()";
const recipientListing = (reference) => `locator('article[data-listing-reference="${reference}"]')`;
// Ordered selectors come from the pinned spec. Dynamic references are checked against its creator card.
const cases = [
  {
    id: "public-facts-and-revocation",
    title:
      "P08/P09: a creator reviews and creates a link, a recipient sees public facts only, and only the creator can manage and revoke it",
    line: 211,
    ids: {
      "chromium-desktop": "14364d462ac0800781ec",
      "chromium-mobile": "6bf0e983c857c4022de4",
      "webkit-mobile": "8caa85f7db32faf1fe68",
    },
    steps: [
      [301, 71, "toHaveCount", ["locator('article[data-listing-reference]')"]],
      [
        305,
        7,
        "toContainText",
        ([first, second]) => [recipientListing(first), recipientListing(second)],
      ],
      [
        308,
        5,
        "toHaveText",
        ([first]) => [`locator('article[data-listing-reference="${first}"] .text-price')`],
      ],
      [309, 42, "not toContain"],
      [
        313,
        60,
        "toHaveCount",
        ["getByRole('button', { name: /Revoke/ })", "getByRole('button', { name: /Copy link/ })"],
      ],
      [315, 48, "not toContain"],
      [316, 42, "not toContain"],
      [337, 35, "toHaveCount", ["locator('article[data-share-state]')"]],
      [351, 22, "toHaveAttribute", [creatorCard]],
      [
        362,
        5,
        "toBeVisible",
        ["getByRole('heading', { name: 'Access through this link has been stopped', level: 1 })"],
      ],
      [363, 47, "toHaveCount", ["locator('article')"]],
      [364, 42, "not toContain"],
    ],
  },
  {
    id: "expired-recipient-and-creator",
    title: "P09: an expired link says so, shows no facts and gives its creator no actions",
    line: 436,
    ids: {
      "chromium-desktop": "21823d3c58c191674383",
      "chromium-mobile": "40f19399b6202b50df2e",
      "webkit-mobile": "48dc93f85597ab33e217",
    },
    steps: [
      [453, 69, "toBeVisible", [`locator('[data-share-status="expired"]')`]],
      [454, 42, "not toContain"],
      [466, 22, "toHaveAttribute", [creatorCard]],
      [467, 42, "toHaveCount", [`${creatorCard}.getByRole('button')`]],
    ],
  },
];

const sha256 = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const safeId = (v) => Number.isSafeInteger(v) && v > 0;
function check(condition, message) {
  if (!condition) throw new Error(message);
}
function only(list, message) {
  check(Array.isArray(list) && list.length === 1, message);
  return list[0];
}
function completePage(data, key) {
  check(
    Array.isArray(data[key]) && data.total_count === data[key].length,
    `incomplete ${key} page`,
  );
  return data[key];
}

export function verifyRun(run, sha, id, attempt) {
  check(
    /^[0-9a-f]{40}$/.test(sha) && !/^0+$/.test(sha) && safeId(id) && safeId(attempt),
    "invalid selector",
  );
  check(
    run.id === id && run.run_attempt === attempt && run.head_sha === sha,
    "run/attempt/head mismatch",
  );
  check(
    [run.repository, run.head_repository].every((r) => r?.id === REPO_ID && r.full_name === REPO),
    "repository mismatch",
  );
  check(
    run.name === "CI" &&
      run.path === WORKFLOW &&
      run.workflow_id === WORKFLOW_ID &&
      run.html_url === `${WEB}/actions/runs/${id}`,
    "workflow mismatch",
  );
  check(
    run.head_branch === "main" && ["push", "repository_dispatch"].includes(run.event),
    "only post-merge main runs supported",
  );
}

function jobStep(job, name) {
  return only(
    job.steps.filter((s) => s.name === name),
    `missing or duplicate ${name} step`,
  );
}
function successful(step) {
  return step.status === "completed" && step.conclusion === "success";
}

export function verifyJob(job, profile, run) {
  check(
    profiles.includes(profile) &&
      job.name === `Browser / ${profile}` &&
      job.workflow_name === "CI" &&
      safeId(job.id) &&
      job.run_id === run.id &&
      job.run_attempt === run.run_attempt &&
      job.head_sha === run.head_sha &&
      job.html_url === `${WEB}/actions/runs/${run.id}/job/${job.id}` &&
      job.labels?.length === 1 &&
      job.labels[0] === "ubuntu-24.04",
    "wrong browser job or runner",
  );
}

export function verifyUpload(artifact, job, run, log) {
  const name = `browser-${job.name.slice("Browser / ".length)}`;
  const owner = artifact.workflow_run;
  check(
    artifact.name === name &&
      safeId(artifact.id) &&
      safeId(artifact.size_in_bytes) &&
      artifact.expired === false &&
      /^sha256:[a-f0-9]{64}$/.test(artifact.digest) &&
      owner?.id === run.id &&
      owner.repository_id === REPO_ID &&
      owner.head_repository_id === REPO_ID &&
      owner.head_branch === run.head_branch &&
      owner.head_sha === run.head_sha,
    "artifact identity mismatch",
  );
  const upload = jobStep(job, UPLOAD_STEP);
  check(successful(upload), "upload step did not succeed");
  const start = Date.parse(upload.started_at);
  const end = Date.parse(upload.completed_at) + 999; // Actions step times are truncated to seconds.
  const lines = log.split(/\r?\n/).flatMap((line) => {
    const split = line.indexOf(" ");
    const instant = Date.parse(line.slice(0, split));
    return instant >= start && instant <= end ? [line.slice(split + 1)] : [];
  });
  for (const wanted of [
    `##[group]Run ${UPLOAD_ACTION}`,
    `SHA256 digest of uploaded artifact is ${artifact.digest.slice(7)}`,
    `Artifact ${name} has been successfully uploaded! Final size is ${artifact.size_in_bytes} bytes. Artifact ID is ${artifact.id}`,
    `Artifact download URL: ${WEB}/actions/runs/${run.id}/artifacts/${artifact.id}`,
  ])
    only(
      lines.filter((line) => line === wanted),
      "missing or duplicate job upload receipt",
    );
}

export function verifySources(loadBytes) {
  for (const [path, hash] of Object.entries(sourcePins))
    check(sha256(loadBytes(path)) === `sha256:${hash}`, `review changed scenario input: ${path}`);
}

function bodyWindow(result, index) {
  const raw = result.steps;
  check(Array.isArray(raw), "invalid native test steps");
  const before = only(
    raw.filter((s) => s.title === "Before Hooks"),
    "missing or duplicate setup",
  );
  const after = only(
    raw.filter((s) => s.title === "After Hooks"),
    "missing or duplicate teardown",
  );
  const start = Date.parse(before.startTime) + before.duration;
  const end = Date.parse(after.startTime);
  check(
    raw[0] === before &&
      raw.at(-1) === after &&
      [before, after].every(
        (s) =>
          s.skipped === false &&
          !s.error &&
          s.count === 1 &&
          Number.isFinite(s.duration) &&
          s.duration >= 0,
      ) &&
      Date.parse(result.startTime) <= Date.parse(before.startTime) &&
      start <= end &&
      end + after.duration <= index.startTime + index.duration + 1,
    "invalid native test hook window",
  );
  // The reporter measures test duration separately from setup. Its hooks delimit wall-clock execution.
  return { steps: raw.slice(1, -1), start, end, nextStep: 0, previousEnd: start };
}

function observedAtLine(body, source, line, column, matcher) {
  const rows = body.steps.filter(
    (s) => s.location?.file === file && s.location.line === line && s.title?.startsWith("Expect "),
  );
  return rows.map((step) => {
    const started = Date.parse(step.startTime);
    const position = body.steps.indexOf(step);
    check(
      position >= body.nextStep && started + 1 >= body.previousEnd,
      "native assertion order mismatch",
    );
    body.nextStep = position + 1;
    body.previousEnd = started + step.duration;
    check(
      step.title === `Expect "${matcher}"` &&
        step.count === 1 &&
        step.location.column === column &&
        step.skipped === false &&
        !step.error &&
        Array.isArray(step.steps) &&
        step.steps.length === 0 &&
        Number.isFinite(step.duration) &&
        step.duration >= 0 &&
        started >= body.start &&
        started + step.duration <= body.end + 1,
      `invalid native assertion at line ${line}`,
    );
    // Playwright records the adjacent source lines and a caret at the observed column.
    check(typeof step.snippet === "string", `missing native source excerpt at line ${line}`);
    const frame = stripVTControlCharacters(step.snippet).split("\n");
    const matchesSource = (text, n) => {
      const match = /^ *(\d+) \| ?(.*)$/.exec(text);
      return match && Number(match[1]) === n && match[2] === source[n - 1];
    };
    check(
      frame.length === 4 &&
        matchesSource(frame[0], line - 1) &&
        matchesSource(frame[1], line) &&
        matchesSource(frame[3], line + 1) &&
        frame[2].trimStart() === `|${" ".repeat(column)}^`,
      `source excerpt mismatch at line ${line}`,
    );
    return {
      selector: step.subtitle ?? null,
      startTime: step.startTime,
      durationMs: step.duration,
    };
  });
}

function verifyAssertions(spec, result, index, source) {
  const body = bodyWindow(result, index);
  let refs;
  if (spec.id === "public-facts-and-revocation") {
    refs = [
      [269, 67, "toBeVisible"],
      [270, 68, "toBeVisible"],
      [271, 67, "toHaveCount"],
    ].map(([line, column, matcher]) => {
      const row = only(
        observedAtLine(body, source, line, column, matcher),
        "ambiguous creator listing assertion",
      );
      const reference = /(MS-(?:0|[1-9]\d{0,14}))/.exec(row.selector)?.[1];
      check(
        reference && row.selector === `${creatorCard}.getByRole('link', { name: '${reference}' })`,
        "invalid creator listing selector",
      );
      return reference;
    });
    check(new Set(refs).size === 3, "creator listings must be distinct");
  }
  return spec.steps.map(([line, column, matcher, selectors = [null]]) => {
    const wanted = typeof selectors === "function" ? selectors(refs) : selectors;
    const observations = observedAtLine(body, source, line, column, matcher);
    check(
      observations.length === wanted.length &&
        observations.every((row, i) => row.selector === wanted[i]),
      `native selector or multiplicity mismatch at line ${line}`,
    );
    return {
      line,
      column,
      matcher,
      expectedCount: wanted.length,
      observedCount: observations.length,
      observations,
    };
  });
}

function assessTest(spec, summary, detail, profile, index, globalTests, source) {
  const base = { id: spec.id, title: spec.title, sourceLine: spec.line };
  const expectedId = `${fileId}-${spec.ids[profile]}`;
  const entries = [globalTests, summary, detail].map((rows) =>
    rows.filter(
      (t) =>
        t.testId === expectedId ||
        t.title === spec.title ||
        (t.projectName === profile && t.location?.file === file && t.location.line === spec.line),
    ),
  );
  if (entries.every((rows) => rows.length === 0)) return { ...base, state: "not_run" };
  const [global, short, test] = entries.map((rows) =>
    only(rows, "missing or duplicate expected test"),
  );
  check(
    global === short && test.title === spec.title && short.title === spec.title,
    "contradictory test identity",
  );
  const projected = (t) => [
    t.testId,
    t.projectName,
    t.location?.file,
    t.location?.line,
    t.location?.column,
    t.path,
    t.outcome,
    t.ok,
    t.annotations,
  ];
  check(
    JSON.stringify(projected(short)) === JSON.stringify(projected(test)) &&
      test.testId === `${fileId}-${spec.ids[profile]}` &&
      test.projectName === profile &&
      test.location.file === file &&
      test.location.line === spec.line &&
      test.location.column === 1 &&
      Array.isArray(test.path) &&
      test.path.length === 0 &&
      !test.repeatEachIndex &&
      !short.repeatEachIndex,
    "test identity mismatch",
  );
  check(
    Array.isArray(test.results) &&
      Array.isArray(short.results) &&
      test.results.length === short.results.length &&
      Array.isArray(test.annotations),
    "invalid test results",
  );
  const attempts = test.results.map((r, i) => {
    const s = short.results[i];
    check(
      r.retry === i &&
        ["passed", "failed", "timedOut", "interrupted", "skipped"].includes(r.status) &&
        Array.isArray(r.errors) &&
        Array.isArray(r.annotations) &&
        r.startTime === s.startTime &&
        Number.isFinite(Date.parse(r.startTime)) &&
        r.workerIndex === s.workerIndex &&
        Number.isInteger(r.workerIndex) &&
        (r.status !== "passed" ||
          (r.workerIndex >= 0 &&
            Number.isFinite(r.duration) &&
            r.duration >= 0 &&
            Date.parse(r.startTime) >= index.startTime &&
            Date.parse(r.startTime) + r.duration <= index.startTime + index.duration + 1)),
      "invalid native attempt",
    );
    return {
      retry: r.retry,
      status: r.status,
      startTime: r.startTime,
      workerIndex: r.workerIndex,
      errors: r.errors.length,
    };
  });
  const record = { ...base, testId: test.testId, outcome: test.outcome, attempts };
  if (attempts.length === 0) return { ...record, state: "not_run" };
  if (attempts.length > 1) return { ...record, state: "retried" };
  const result = test.results[0];
  if (result.status === "skipped") return { ...record, state: "skipped" };
  if (["failed", "timedOut", "interrupted"].includes(result.status))
    return { ...record, state: "failed" };
  check(
    test.ok === true &&
      test.outcome === "expected" &&
      result.errors.length === 0 &&
      test.annotations.length === 0 &&
      result.annotations.length === 0,
    "unexpected native outcome",
  );
  return { ...record, checks: verifyAssertions(spec, result, index, source), state: "passed" };
}

export function inspectReport(index, detail, profile, run, job) {
  const ci = index.metadata?.ci;
  check(
    index.projectNames?.length === 1 &&
      index.projectNames[0] === profile &&
      ci?.commitHash === run.head_sha &&
      ci.commitHref === `${WEB}/commit/${run.head_sha}` &&
      ci.buildHref === run.html_url &&
      index.metadata?.gitCommit?.hash === run.head_sha &&
      Array.isArray(index.errors) &&
      !index.errors.length &&
      Array.isArray(index.files),
    "native report project, commit, run or errors mismatch",
  );
  const step = jobStep(job, BROWSER_STEP);
  check(
    Number.isFinite(index.startTime) &&
      Number.isFinite(index.duration) &&
      index.duration >= 0 &&
      index.startTime >= Date.parse(step.started_at) &&
      index.startTime + index.duration <= Date.parse(step.completed_at) + 999,
    "report outside browser step",
  );
  const globalTests = index.files.flatMap((f) => {
    check(Array.isArray(f.tests), "unreadable native test index");
    return f.tests;
  });
  const files = index.files.filter((f) => f.fileName === file || f.fileId === fileId);
  let summaryTests = [],
    detailTests = [];
  if (files.length || detail !== null) {
    const summary = only(files, "missing or duplicate report file");
    check(
      [summary, detail].every(
        (f) => f?.fileId === fileId && f.fileName === file && Array.isArray(f.tests),
      ),
      "native detail file mismatch",
    );
    summaryTests = summary.tests;
    detailTests = detail.tests;
  }
  const bytes = readFileSync(new URL(`../e2e/${file}`, import.meta.url));
  check(
    sha256(bytes) === `sha256:${sourcePins[`e2e/${file}`]}`,
    "collector's mapped test source changed",
  );
  const source = bytes.toString("utf8").split("\n");
  return cases.map((spec) => {
    try {
      return assessTest(spec, summaryTests, detailTests, profile, index, globalTests, source);
    } catch (error) {
      return {
        id: spec.id,
        title: spec.title,
        sourceLine: spec.line,
        state: "unknown",
        reason: error.message,
      };
    }
  });
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes);
  } catch {
    throw new Error(`invalid JSON in ${label}`);
  }
}

function github(endpoint, label, dir) {
  let raw;
  try {
    raw = execFileSync(
      "gh",
      ["api", "--hostname", "github.com", `repos/${REPO}/actions/${endpoint}`],
      { maxBuffer: 16 * 1024 * 1024, timeout: 60000, stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch {
    throw new Error(`GitHub read unavailable: ${label}`);
  }
  writeFileSync(join(dir, label), raw, { flag: "wx", mode: 0o600 });
  return { data: parseJson(raw, label), sha256: sha256(raw) };
}

function collectProfile(profile, jobs, artifacts, run, dir) {
  const item = { profile, state: "unknown", tests: [] };
  try {
    const found = jobs.filter((j) => j.name === `Browser / ${profile}`);
    if (!found.length)
      return { ...item, state: "not_run", reason: "browser job absent from complete attempt" };
    const job = only(found, "duplicate browser job");
    verifyJob(job, profile, run);
    item.job = {
      id: job.id,
      name: job.name,
      status: job.status,
      conclusion: job.conclusion,
      labels: job.labels,
    };
    if (job.conclusion === "skipped") return { ...item, state: "skipped" };
    item.browserStep = jobStep(job, BROWSER_STEP);
    if (item.browserStep.conclusion === "skipped") return { ...item, state: "skipped" };
    const artifact = only(
      artifacts.filter((a) => a.name === `browser-${profile}`),
      "missing or duplicate browser artifact",
    );
    const archiveScript = fileURLToPath(new URL("./release-ci-archive.py", import.meta.url));
    let log;
    try {
      log = execFileSync("python3", [archiveScript, "job-log", String(job.id)], {
        timeout: 150000,
        maxBuffer: 12 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      throw new Error("job upload log unavailable");
    }
    writeFileSync(join(dir, `${profile}.log`), log, { flag: "wx", mode: 0o600 });
    verifyUpload(artifact, job, run, log.toString("utf8"));
    item.uploadStep = jobStep(job, UPLOAD_STEP);
    item.artifact = {
      id: artifact.id,
      name: artifact.name,
      size: artifact.size_in_bytes,
      providerSha256: artifact.digest,
      jobLogSha256: sha256(log),
    };
    const dest = join(dir, profile);
    mkdirSync(dest, { mode: 0o700 });
    let native;
    try {
      native = execFileSync(
        "python3",
        [archiveScript, String(artifact.id), String(artifact.size_in_bytes), profile, dest],
        { encoding: "utf8", timeout: 240000, stdio: ["ignore", "pipe", "pipe"] },
      );
    } catch {
      throw new Error("native archive read unavailable");
    }
    item.archiveRead = parseJson(native, "archive receipt");
    const read = (key) => {
      const bytes = readFileSync(join(dest, key));
      check(sha256(bytes) === item.archiveRead.sha256[key], "native file digest mismatch");
      return parseJson(bytes, key);
    };
    const detail = item.archiveRead.sha256[`${fileId}.json`] ? read(`${fileId}.json`) : null;
    item.tests = inspectReport(read("report.json"), detail, profile, run, job);
    const state = ["failed", "retried", "unknown", "skipped", "not_run"].find((s) =>
      item.tests.some((t) => t.state === s),
    );
    item.state = !successful(job) || !successful(item.browserStep) ? "failed" : (state ?? "passed");
  } catch (error) {
    item.reason = error.message;
  }
  return item;
}

export function scenarioObserved(run, observations) {
  return (
    run.run_attempt === 1 &&
    successful(run) &&
    observations.length === profiles.length &&
    profiles.every((profile) => {
      const selected = observations.filter((item) => item.profile === profile);
      return (
        selected.length === 1 &&
        selected[0].state === "passed" &&
        selected[0].tests.length === cases.length &&
        cases.every(
          (spec) =>
            selected[0].tests.filter(
              (test) =>
                test.id === spec.id &&
                test.testId === `${fileId}-${spec.ids[profile]}` &&
                test.state === "passed",
            ).length === 1,
        )
      );
    })
  );
}

function main() {
  const { values } = parseArgs({
    options: Object.fromEntries(
      ["sha", "run", "attempt", "out"].map((k) => [k, { type: "string" }]),
    ),
  });
  check(
    values.out &&
      /^[1-9][0-9]*$/.test(values.run) &&
      /^[1-9][0-9]*$/.test(values.attempt) &&
      /^[0-9a-f]{40}$/.test(values.sha),
    "usage: --sha SHA --run ID --attempt N --out NEW_PRIVATE_DIRECTORY",
  );
  const dir = resolve(values.out);
  mkdirSync(dir, { mode: 0o700 }); // A failed refresh can never reuse an earlier passing receipt.
  const runId = Number(values.run),
    attempt = Number(values.attempt);
  const route = `runs/${runId}/attempts/${attempt}`;
  const response = github(route, "run.json", dir);
  const run = response.data;
  verifyRun(run, values.sha, runId, attempt);
  verifySources((path) =>
    execFileSync("git", ["show", `${values.sha}:${path}`], { stdio: ["ignore", "pipe", "pipe"] }),
  );
  const jobs = github(`${route}/jobs?per_page=100`, "jobs.json", dir);
  const artifacts = github(`runs/${runId}/artifacts?per_page=100`, "artifacts.json", dir);
  const attemptJobs = completePage(jobs.data, "jobs");
  const runArtifacts = completePage(artifacts.data, "artifacts");
  const observations = profiles.map((profile) =>
    collectProfile(profile, attemptJobs, runArtifacts, run, dir),
  );
  const observed = scenarioObserved(run, observations);
  const receipt = {
    format: "ms-realty/ci-scenario-observation/v1",
    gate: "R03",
    flow: "F04",
    relatedAcceptance: "AT09",
    environment: "ci",
    evidenceClass: "test",
    scenario: "public-share-recipient",
    observed,
    releaseContext: null,
    countedReleaseAssertions: [],
    repository: REPO,
    repositoryId: REPO_ID,
    workflow: WORKFLOW,
    workflowId: WORKFLOW_ID,
    releaseSha: run.head_sha,
    runId: run.id,
    attempt: run.run_attempt,
    event: run.event,
    branch: run.head_branch,
    runStatus: run.status,
    runConclusion: run.conclusion,
    workflowRetried: run.run_attempt > 1,
    sourcePins,
    apiSha256: { run: response.sha256, jobs: jobs.sha256, artifacts: artifacts.sha256 },
    profiles: observations,
  };
  writeFileSync(join(dir, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  console.log(`${observed ? "Observed" : "Incomplete"} CI scenario. ${join(dir, "receipt.json")}`);
  return observed ? 0 : 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
