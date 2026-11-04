import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  inspectReport,
  profiles,
  scenarioObserved,
  verifyJob,
  verifyRun,
  verifySources,
  verifyUpload,
} from "./release-ci-scenarios.mjs";

const repo = "ms-realty/ms-realty";
const web = `https://github.com/${repo}`;
const sha = "a".repeat(40);
const file = "shared-shortlist.spec.ts";
const fileId = "52c3b5d0ca593b879aa5";
const profile = "chromium-desktop";
const instant = new Date(100_000).toISOString();
const end = new Date(108_000).toISOString();
const repoRef = { id: 1311414066, full_name: repo };
const run = {
  id: 123,
  run_attempt: 1,
  head_sha: sha,
  repository: repoRef,
  head_repository: repoRef,
  name: "CI",
  path: ".github/workflows/ci.yml",
  workflow_id: 319878187,
  head_branch: "main",
  event: "push",
  html_url: `${web}/actions/runs/123`,
  status: "completed",
  conclusion: "success",
};
const job = {
  id: 444,
  run_id: 123,
  run_attempt: 1,
  head_sha: sha,
  workflow_name: "CI",
  name: `Browser / ${profile}`,
  html_url: `${run.html_url}/job/444`,
  labels: ["ubuntu-24.04"],
  status: "completed",
  conclusion: "success",
  steps: [
    "Complete the browser profile with the real scanner",
    "Preserve browser reports and failure traces",
  ].map((name) => ({
    name,
    started_at: instant,
    completed_at: end,
    status: "completed",
    conclusion: "success",
  })),
};
const artifact = {
  id: 555,
  name: `browser-${profile}`,
  expired: false,
  size_in_bytes: 234,
  digest: `sha256:${"7".repeat(64)}`,
  workflow_run: {
    id: 123,
    repository_id: repoRef.id,
    head_repository_id: repoRef.id,
    head_sha: sha,
    head_branch: "main",
  },
};
const log = [
  "##[group]Run actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
  `SHA256 digest of uploaded artifact is ${"7".repeat(64)}`,
  `Artifact browser-${profile} has been successfully uploaded! Final size is 234 bytes. Artifact ID is 555`,
  `Artifact download URL: ${run.html_url}/artifacts/555`,
]
  .map((line) => `${instant} ${line}`)
  .join("\n");

// Redacted projection of the real native report. Synthetic refs, times and provider data cannot be submitted.
const card = "locator('article[data-share-state]').first()";
const link = (ref) => `${card}.getByRole('link', { name: '${ref}' })`;
const specimen = [
  {
    id: "14364d462ac0800781ec",
    line: 211,
    title:
      "P08/P09: a creator reviews and creates a link, a recipient sees public facts only, and only the creator can manage and revoke it",
    steps: [
      [269, 67, "toBeVisible", link("MS-12")],
      [270, 68, "toBeVisible", link("MS-13")],
      [271, 67, "toHaveCount", link("MS-14")],
      [301, 71, "toHaveCount", "locator('article[data-listing-reference]')"],
      [305, 7, "toContainText", `locator('article[data-listing-reference="MS-12"]')`],
      [305, 7, "toContainText", `locator('article[data-listing-reference="MS-13"]')`],
      [308, 5, "toHaveText", `locator('article[data-listing-reference="MS-12"] .text-price')`],
      [309, 42, "not toContain"],
      [313, 60, "toHaveCount", "getByRole('button', { name: /Revoke/ })"],
      [313, 60, "toHaveCount", "getByRole('button', { name: /Copy link/ })"],
      [315, 48, "not toContain"],
      [316, 42, "not toContain"],
      [337, 35, "toHaveCount", "locator('article[data-share-state]')"],
      [351, 22, "toHaveAttribute", card],
      [
        362,
        5,
        "toBeVisible",
        "getByRole('heading', { name: 'Access through this link has been stopped', level: 1 })",
      ],
      [363, 47, "toHaveCount", "locator('article')"],
      [364, 42, "not toContain"],
    ],
  },
  {
    id: "21823d3c58c191674383",
    line: 436,
    title: "P09: an expired link says so, shows no facts and gives its creator no actions",
    steps: [
      [453, 69, "toBeVisible", `locator('[data-share-status="expired"]')`],
      [454, 42, "not toContain"],
      [466, 22, "toHaveAttribute", card],
      [467, 42, "toHaveCount", `${card}.getByRole('button')`],
    ],
  },
];
const specLines = readFileSync(
  new URL("../e2e/shared-shortlist.spec.ts", import.meta.url),
  "utf8",
).split("\n");
function sampleSteps(spec) {
  const at = (offset) => new Date(Date.parse(instant) + offset).toISOString();
  const native = (title, offset, duration) => ({
    title,
    startTime: at(offset),
    duration,
    skipped: false,
    count: 1,
    steps: [],
  });
  const steps = spec.steps.map(([line, column, matcher, subtitle], i) => ({
    ...native(`Expect "${matcher}"`, 1100 + 5 * i, 1),
    subtitle,
    location: { file, line, column },
    snippet: [
      `  ${line - 1} | ${specLines[line - 2]}`,
      `  ${line} | ${specLines[line - 1]}`,
      `      | ${" ".repeat(column - 1)}^`,
      `  ${line + 1} | ${specLines[line]}`,
    ].join("\n"),
  }));
  return [native("Before Hooks", 0, 100), ...steps, native("After Hooks", 1900, 25)];
}
function sample() {
  const tests = specimen.map((spec) => ({
    testId: `${fileId}-${spec.id}`,
    title: spec.title,
    projectName: profile,
    location: { file, line: spec.line, column: 1 },
    annotations: [],
    outcome: "expected",
    ok: true,
    path: [],
    results: [
      {
        startTime: instant,
        duration: 1000,
        workerIndex: 0,
        annotations: [],
        errors: [],
        retry: 0,
        status: "passed",
        steps: sampleSteps(spec),
      },
    ],
  }));
  const detail = { fileId, fileName: file, tests };
  const summary = {
    ...detail,
    tests: tests.map((t) => ({
      ...structuredClone(t),
      results: t.results.map((r) => ({ startTime: r.startTime, workerIndex: r.workerIndex })),
    })),
  };
  const index = {
    projectNames: [profile],
    files: [summary],
    metadata: {
      ci: { commitHash: sha, commitHref: `${web}/commit/${sha}`, buildHref: run.html_url },
      gitCommit: { hash: sha },
    },
    startTime: Date.parse(instant),
    duration: 2000,
    errors: [],
  };
  return { index, detail };
}
function assess(mutate = () => {}) {
  const { index, detail } = sample();
  mutate(index, detail);
  return inspectReport(index, detail, profile, run, job).map((t) => t.state);
}

test("F04 native assertions cover the positive, revoked and expired views", () => {
  assert.deepEqual(assess(), ["passed", "passed"]);
  assert.deepEqual(
    assess((_, file) => file.tests[0].results[0].steps.splice(-2, 1)),
    ["unknown", "passed"],
  );
  assert.deepEqual(
    assess((_, file) => {
      file.tests[1].results[0].steps[2].skipped = true;
    }),
    ["passed", "unknown"],
  );
  assert.deepEqual(
    assess((_, file) => {
      file.tests[0].results[0].steps[1].count = 3;
    }),
    ["unknown", "passed"],
  );
});

test("only the two selected refs, the two distinct controls and their exact native source and times qualify", () => {
  const steps = (d) => d.tests[0].results[0].steps;
  const at = (d, line) => steps(d).filter((s) => s.location?.line === line);
  for (const mutate of [
    (d) => Object.assign(at(d, 305)[1], structuredClone(at(d, 305)[0])),
    (d) => {
      at(d, 313)[0].count = 2;
      steps(d).splice(steps(d).indexOf(at(d, 313)[1]), 1);
    },
    (d) => {
      at(d, 313)[1].skipped = true;
      steps(d).splice(-1, 0, structuredClone(at(d, 313)[0]));
    },
    (d) => {
      at(d, 305)[1].subtitle = `locator('article[data-listing-reference="MS-14"]')`;
    },
    (d) => {
      at(d, 308)[0].subtitle = `locator('article[data-listing-reference="MS-13"] .text-price')`;
    },
    (d) => {
      at(d, 269)[0].subtitle = at(d, 270)[0].subtitle;
    },
    (d) => {
      at(d, 305)[0].location.column = 1;
    },
    (d) => {
      at(d, 305)[0].snippet = "wrong source";
    },
    (d) => {
      at(d, 305)[0].startTime = new Date(0).toISOString();
    },
    (d) => {
      at(d, 305)[0].startTime = instant;
    },
    (d) => {
      at(d, 305)[0].duration = 3000;
    },
    (d) => {
      at(d, 305)[0].startTime = new Date(Date.parse(at(d, 308)[0].startTime) + 2).toISOString();
    },
    (d) => {
      const list = steps(d),
        row = at(d, 308)[0];
      list.splice(list.indexOf(row), 1);
      list.splice(1, 0, row);
    },
    (d) => {
      at(d, 313)[0].steps = [structuredClone(at(d, 313)[1])];
    },
  ])
    assert.equal(assess((_, detail) => mutate(detail))[0], "unknown");
  // Native setup can place a genuine body assertion beyond result.startTime + its measured duration.
  assert.equal(assess()[0], "passed");
});

test("file index contradictions remain unknown even when a wanted title or file disappears", () => {
  assert.equal(
    assess((index, detail) => {
      index.files[0].tests[0].title = "changed";
      detail.tests[0].title = "changed";
    })[0],
    "unknown",
  );
  assert.equal(
    assess((index, detail) => {
      for (const row of [index.files[0].tests[0], detail.tests[0]]) {
        row.title = "changed";
        row.testId = "unrelated";
      }
    })[0],
    "unknown",
  );
  assert.equal(
    assess((index) => {
      index.files.push({
        fileName: "another.spec.ts",
        fileId: "another",
        tests: [structuredClone(index.files[0].tests[0])],
      });
    })[0],
    "unknown",
  );
  const { index } = sample();
  index.files = [
    { fileName: "another.spec.ts", fileId: "another", tests: [index.files[0].tests[0]] },
  ];
  assert.deepEqual(
    inspectReport(index, null, profile, run, job).map((t) => t.state),
    ["unknown", "not_run"],
  );
});

test("a changed package command, lifecycle hook or scanner runner invalidates the reviewed producer", () => {
  const load = (path) => readFileSync(new URL(`../${path}`, import.meta.url));
  verifySources(load);
  for (const script of ["e2e", "poste2e", "pree2e"])
    assert.throws(
      () =>
        verifySources((path) => {
          if (path !== "package.json") return load(path);
          const pkg = JSON.parse(load(path));
          pkg.scripts[script] = "alternate";
          return Buffer.from(JSON.stringify(pkg));
        }),
      /review changed scenario input: package.json/,
    );
  for (const target of ["scripts/ci-clamav.mjs", "scripts/wait-clamav.ts", "scripts/e2e-server.ts"])
    assert.throws(
      () => verifySources((path) => (path === target ? Buffer.from("modified") : load(path))),
      /review changed scenario input/,
    );
});

test("AT09 preserves failed, skipped, retried, unscheduled and unknown results", () => {
  for (const [status, state] of [
    ["failed", "failed"],
    ["skipped", "skipped"],
    ["timedOut", "failed"],
    ["mystery", "unknown"],
  ]) {
    assert.equal(
      assess((_, file) => {
        file.tests[0].results[0].status = status;
      })[0],
      state,
    );
  }
  assert.equal(
    assess((index, file) => {
      const t = file.tests[0],
        s = index.files[0].tests[0];
      t.results.push({ ...structuredClone(t.results[0]), retry: 1 });
      t.results[0].status = "failed";
      s.results.push(structuredClone(s.results[0]));
    })[0],
    "retried",
  );
  assert.equal(
    assess((index, file) => {
      file.tests[0].results = [];
      index.files[0].tests[0].results = [];
    })[0],
    "not_run",
  );
  assert.equal(
    assess((index, file) => {
      file.tests.shift();
      index.files[0].tests.shift();
    })[0],
    "not_run",
  );
  assert.equal(
    assess((_, file) => {
      file.tests[0].results[0].errors = ["unexpected"];
    })[0],
    "unknown",
  );
});

test("duplicates, partial files, wrong project, title collisions and reused case data cannot pass", () => {
  assert.equal(assess((_, file) => file.tests.push(structuredClone(file.tests[0])))[0], "unknown");
  assert.equal(assess((_, file) => file.tests.shift())[0], "unknown");
  for (const mutate of [
    (t) => {
      t.projectName = "webkit-mobile";
    },
    (t) => {
      t.path = ["another suite"];
    },
    (t) => {
      t.testId = `${fileId}-${"0".repeat(20)}`;
    },
    (t) => {
      t.location.line = 123;
    },
    (t) => {
      t.results[0].startTime = new Date(0).toISOString();
    },
  ])
    assert.equal(
      assess((index, file) => {
        mutate(index.files[0].tests[0]);
        mutate(file.tests[0]);
      })[0],
      "unknown",
    );
  assert.throws(
    () =>
      assess((index) => {
        index.projectNames = [profile, profile];
      }),
    /native report/,
  );
  assert.throws(
    () =>
      assess((index) => {
        index.metadata.gitCommit.hash = "b".repeat(40);
      }),
    /native report/,
  );
  assert.throws(
    () =>
      assess((index) => {
        index.files.push(index.files[0]);
      }),
    /duplicate report file/,
  );
  assert.throws(
    () =>
      assess((index) => {
        index.startTime = 0;
      }),
    /outside browser step/,
  );
});

test("the provider owns the exact post-merge repository, workflow, head, attempt, runner and upload", () => {
  verifyRun(run, sha, 123, 1);
  verifyJob(job, profile, run);
  verifyUpload(artifact, job, run, log);
  for (const patch of [
    { head_sha: "b".repeat(40) },
    { run_attempt: 2 },
    { event: "pull_request" },
    { head_branch: "fork" },
    { workflow_id: 99 },
    { path: "fake.yml" },
    { head_repository: { ...repoRef, id: 9 } },
  ])
    assert.throws(() => verifyRun({ ...run, ...patch }, sha, 123, 1));
  for (const patch of [
    { id: 123 },
    { run_id: 9 },
    { run_attempt: 2 },
    { labels: ["production"] },
    { name: "ci / gate" },
  ])
    assert.throws(() => verifyJob({ ...job, ...patch }, profile, run));
  for (const patch of [
    { expired: true },
    { digest: "unknown" },
    { id: 88 },
    { workflow_run: { ...artifact.workflow_run, head_sha: "b".repeat(40) } },
  ])
    assert.throws(() => verifyUpload({ ...artifact, ...patch }, job, run, log));
  assert.throws(() =>
    verifyUpload(artifact, job, run, log.replaceAll(instant, new Date(0).toISOString())),
  );
  assert.throws(() =>
    verifyUpload(artifact, job, run, log.replace("Artifact ID is 555", "Artifact ID is 556")),
  );
  assert.throws(() => verifyUpload(artifact, job, run, `${log}\n${log}`));
});

test("a caller cannot narrow the required project or test set, or discard workflow retries", () => {
  const results = inspectReport(sample().index, sample().detail, profile, run, job);
  const ids = [
    ["14364d462ac0800781ec", "21823d3c58c191674383"],
    ["6bf0e983c857c4022de4", "40f19399b6202b50df2e"],
    ["8caa85f7db32faf1fe68", "48dc93f85597ab33e217"],
  ];
  const observations = profiles.map((profile, i) => ({
    profile,
    state: "passed",
    tests: results.map((test, n) => ({ ...test, testId: `${fileId}-${ids[i][n]}` })),
  }));
  assert.equal(
    scenarioObserved(
      run,
      observations.map((item) => ({ ...item, tests: results })),
    ),
    false,
  );
  assert.equal(scenarioObserved(run, observations), true);
  assert.equal(scenarioObserved(run, observations.slice(1)), false);
  assert.equal(scenarioObserved(run, [observations[0], observations[0], observations[1]]), false);
  assert.equal(
    scenarioObserved(
      run,
      observations.map((p) => ({ ...p, tests: [p.tests[0], p.tests[0]] })),
    ),
    false,
  );
  assert.equal(scenarioObserved({ ...run, run_attempt: 2 }, observations), false);
});

test("CLI refuses submitted and synthetic receipts before creating an output", () => {
  const child = spawnSync(
    process.execPath,
    ["scripts/release-ci-scenarios.mjs", "--receipt", "synthetic.json"],
    { encoding: "utf8" },
  );
  assert.equal(child.status, 1);
  assert.match(child.stderr, /Unknown option/);
});

test("R03 archive transport and credential checks run offline", () => {
  const child = spawnSync("python3", ["-I", "-B", "scripts/release-ci-archive.test.py"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 64 * 1024,
  });
  assert.ifError(child.error);
  const diagnostics = `${child.stdout}\n${child.stderr}`.trim().slice(-2400);
  assert.equal(child.status, 0, diagnostics || `Python stopped on signal ${child.signal}`);
});
