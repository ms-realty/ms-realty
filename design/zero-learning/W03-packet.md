# W03 gate packet — for the evaluator

Journey: W03 · Receive, own and qualify an inquiry. Gate rules: `design/zero-learning/GATE.md`. Expected paths, G2 scan and G3 checklist: `design/zero-learning/W03-expected-path-key.md` (judge copy; never shown to testers).

The evaluator is independent of the designer. Run every step below in a fresh context; do not reuse a tester context across tasks, tiers or viewports.

## Images

Folder: `/Users/ivan/Code/Mindburn-Labs/output/msr-launch/visual/w03-gate-packet/` — 90 PNGs exported from Figma on 2026-10-05 (about 17:15 EEST), after Phase B (copy, DEMO markers, links) and Phase C1b (next-step lines, visible links, states, RTL icon). Desktop 1440 frames at scale 0.5 (720 px wide), Mobile 390 frames at scale 1 (390 px wide), named `<screen>-<state>-<viewport>.png`. Node ids per image are in the key's coverage table. The names reveal states, so **testers never see them**: for each run, copy the start screen to `s01.png` and the other images of the batch, in the order listed, to `s02.png`, `s03.png` … (skip the start screen when it appears in the list). Keep the mapping in the run record.

If a tier cannot read the 720 px Desktop images, re-export those frames at scale 1 under the same names, record that in the run, and rerun the whole Desktop batch for both tiers.

### Batch VD — visitor, Desktop 1440 (10 images) · tasks T1, T3, T5

1. `P11-filled-desktop.png`
2. `P11-sending-desktop.png`
3. `P12-committed-desktop.png`
4. `P11-rejected-desktop.png`
5. `P11-invalid-desktop.png`
6. `P11-offline-desktop.png`
7. `P12-unknown-desktop.png`
8. `P12-unknown-check-desktop.png`
9. `P12-generic-demo-desktop.png`
10. `P11-default-desktop.png`

### Batch VM — visitor, Mobile 390 (10 images) · tasks T1, T2, T4, T5

1. `P11-filled-mobile.png`
2. `P11-sending-mobile.png`
3. `P12-committed-mobile.png`
4. `P11-invalid-mobile.png`
5. `P11-rejected-mobile.png`
6. `P11-offline-mobile.png`
7. `P12-unknown-mobile.png`
8. `P12-unknown-check-mobile.png`
9. `P11-default-mobile.png`
10. `P12-generic-demo-mobile.png`

### Batch VH — visitor, Hebrew right-to-left, Mobile 390 (2 images) · task T6

1. `P11-filled-he-rtl-mobile.png`
2. `P12-committed-he-rtl-mobile.png`

### Batch SD — staff, Desktop 1440 (20 images) · tasks T7, T8, T9, T10

1. `O02-new-in-queue-desktop.png`
2. `O03-accept-time-required-desktop.png`
3. `O03-accept-ready-desktop.png`
4. `O03-link-or-create-desktop.png`
5. `O03-default-desktop.png`
6. `O27-duplicate-check-desktop.png`
7. `O27-review-pending-desktop.png`
8. `O03-link-recorded-desktop.png`
9. `O23-default-desktop.png`
10. `O23-handover-desktop.png`
11. `O23-handover-pending-desktop.png`
12. `O02-default-desktop.png`
13. `O01-default-desktop.png`
14. `O03-assign-review-desktop.png`
15. `O03-assign-awaiting-acceptance-desktop.png`
16. `O03-create-after-qualify-desktop.png`
17. `O03-resolve-without-case-desktop.png`
18. `O04-default-desktop.png`
19. `O05-default-desktop.png`
20. `O18-default-desktop.png`

### Batch SM — staff, Mobile 390 (17 images) · tasks T7, T8, T9, T10

1. `O02-new-in-queue-mobile.png`
2. `O03-accept-time-required-mobile.png`
3. `O03-accept-ready-mobile.png`
4. `O03-link-or-create-mobile.png`
5. `O03-default-mobile.png`
6. `O27-duplicate-check-mobile.png`
7. `O27-review-pending-mobile.png`
8. `O03-link-recorded-mobile.png`
9. `O23-default-mobile.png`
10. `O23-handover-mobile.png`
11. `O23-handover-pending-mobile.png`
12. `O02-default-mobile.png`
13. `O03-assign-review-mobile.png`
14. `O03-assign-awaiting-acceptance-mobile.png`
15. `O05-default-mobile.png`
16. `O18-default-mobile.png`
17. `O04-default-mobile.png`

### Start screen per run

| Task | VD | VM | VH | SD | SM |
|---|---|---|---|---|---|
| T1 | `P11-filled-desktop.png` | `P11-filled-mobile.png` | | | |
| T2 | | `P11-offline-mobile.png` | | | |
| T3 | `P11-rejected-desktop.png` | | | | |
| T4 | | `P11-invalid-mobile.png` | | | |
| T5 | `P12-unknown-desktop.png` | `P12-unknown-mobile.png` | | | |
| T6 | | | `P11-filled-he-rtl-mobile.png` | | |
| T7 | | | | `O02-new-in-queue-desktop.png` | `O02-new-in-queue-mobile.png` |
| T8 | | | | `O03-default-desktop.png` | `O03-default-mobile.png` |
| T9 | | | | `O03-default-desktop.png` | `O03-default-mobile.png` |
| T10 | | | | `O23-default-desktop.png` | `O23-default-mobile.png` |

16 runs per tier, 32 in total. The other 31 exported images are not in any batch: variants not on an expected path (for example `O03-assign-recorded-*`, `O05-wait-*`, `O06-default-*`, `O02-unclaimed-*`), the O01 states added in Phase C1b (`O01-loading-*`, `O01-empty-*`, `O01-error-*`, `O01-offline-*`) and the revoke state (`O23-revoke-staff-access-*`). They are reference for the judge and the G2 / G3 re-scan.

## Tester prompt template

Fill `{ROLE}`, `{GOAL}` and `{N}` only. `{GOAL}` is the **Goal (testers)** line from the key, copied exactly (T6 uses the Hebrew line). `{ROLE}` is «a visitor to an estate agency's website» for T1–T6 and «a broker who just joined this estate agency and is using its work app for the first time» for T7–T10. Add nothing else.

```text
You are {ROLE}. You have never used this product before and nobody can help you.

The images s01.png to s{N}.png are screenshots of its screens. s01.png is the screen in front of you now. The others are screens you might reach, in no particular order.

Goal: {GOAL}

Try once, the way you would really do it. Answer in exactly this format:

ACTIONS:
1. <screen file> — <what you click or tap, quoting its visible text; or the field you type in and what you type>
2. ...
END SCREEN: <the screen file you expect to be on when you are done>
RESULT: <one or two sentences: what happened and what you now know>
CONFIDENCE: low | medium | high

If you cannot find a way to reach the goal, write STUCK and the screen where you gave up.
```

Running the tiers:

- **Haiku (novice proxy):** a Claude Code subagent with `model: haiku`, a fresh context, read access to the run folder only; the prompt above is the whole message.
- **GPT (second family):** `/Applications/Codex.app/Contents/Resources/codex exec --ephemeral --skip-git-repo-check -s read-only -C <run folder> -i s01.png -i s02.png … -o answer.txt "<prompt>"`. Never more than 20 `-i` images.

## Judge instructions

For each run, with the key open:

1. **Map** the tester's screen files back to frames with the run's mapping.
2. **Replay** the ACTIONS against the expected path. A step matches when the quoted text identifies the control in the key (paraphrase is fine if it points to one control only). A field entry matches when the tester names the field and a plausible value.
3. **Count actions** as the key does: taps or clicks plus field entries; the automatic «Изпращаме…» step is not counted.
4. **Score:**
   - **PASS:** END SCREEN and RESULT meet the success criterion, with no wrong irreversible step, in at most expert actions + 1.
   - **FAIL:** STUCK; the wrong end screen; a wrong irreversible step (sending a second inquiry in T2 or T5, retyping the message in T3, accepting without choosing a review time in T7, merging in T8); or a RESULT that contradicts the screen (for example «it was read» or «they will reply by tomorrow» in T1).
   - **COVERAGE GAP:** the tester's sensible path needs a screen the key marks as missing. Report it and do not count it as a pass.
5. **Per tier**, report: covered-task success rate (pass needs ≥ 90%), tasks failed in both tiers (pass needs none), and the median actions per task against expert + 1.
6. **G2:** re-scan the visible text of every image's frame (node ids in the key) against the GATE G2 list. Pass needs 0 hits on primary surfaces; the key lists the result of its last re-run (2026-10-05, 90 frames: 4 real hits on O05 plus the open decision on the staff noun «Случай»).
7. **G3:** confirm or overturn each row of the key's G3 checklist and its two extra checks (a next-step line on each screen, no past dates) from the images; items 9 and 10 need the PR-preview evidence and stay open in the Figma stage.
8. **G4:** for each job in GATE G4, write better / equal / worse against the named leaders with a one-line reason and the public page or help article used. Use public pages only: no accounts, no sign-in, no inquiries sent to a leader. One «worse» fails the gate.

Write the record to `/Users/ivan/Code/Mindburn-Labs/output/msr-launch/zero-learning/W03-figma-<run timestamp>.md`: the run mapping, each tester's raw answer per tier, the per-run verdict with the reason, the G1 to G4 results, and the coverage gaps. Self-certification by the designer does not count.
