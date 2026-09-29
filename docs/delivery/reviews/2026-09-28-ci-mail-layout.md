# CI mail layout and lifecycle regression repair

Run 36471232085 on 14f8a87e passed lint, types, unit/integration, production build,
scanner protocol tests and the real ClamAV consumer, then failed browser acceptance:
325 passed, 3 failed, 5 skipped. The failures were Linux WebKit page overflow in both
Case email scenarios and the desktop staff lifecycle test. Visual/container steps did
not run after the browser failure.

The closed native mobile disclosure contributed off-screen layout in Linux WebKit;
its panel now explicitly hides while closed and anchors to the end of the disclosure
when open. Form field containers shrink within their available width. The native Case
select uses a zero intrinsic width with a 100% minimum to prevent long option text from
expanding its ancestor flex layout.

The lifecycle test dispatched visibility events before the guard's effect had installed
its listeners. A data attribute now reports actual listener readiness. The test waits
for it, then still asserts synchronous concealment and server reauthorization after
revocation. Its privacy-request form selector is bound to the fixture ID so retries or
parallel fixtures cannot select another person's request.

Local fresh-build browser run 961aebb73eb144f4a4222e45406c9609: 19 passed, 2 expected
virtual-authenticator exclusions. Includes Case mail, native service preferences,
inbound triage and identity across desktop/mobile Chromium and mobile WebKit.
Server/component subset: 60 passed. This is macOS evidence, not Linux WebKit CI proof;
the next pushed revision must complete CI before this regression is closed remotely.


## 2026-09-29 Linux reproduction and correction

Run 36491387582 on 9cf10d6e still failed the two Case-email overflow assertions (331 passed,
2 failed, 1 flaky, 5 skipped). The lifecycle repair passed. The earlier select width change
was insufficient and is superseded below; it must not be treated as CI closure.

Using the pinned Playwright 1.63.0 Noble image, the complete mail flow reproduced the
390-to-514/524 px overflow. Computed select border width was 316 px; native option painting
escaped its flex container. Controlled CSS probes showed changing the select's width alone
failed, while ordinary block flow for the field wrapper restored 390 px. The select field
now uses block layout and vertical spacing; the temporary zero-width inline style is removed.
Native appearance, focus outline and no-JavaScript form behavior remain intact.

Fresh Linux build/run f5eadae8d3a94cd0821bad6aaf77022c passed all 12 mail scenarios on
Chromium desktop/mobile and WebKit mobile. Includes both formerly failing tests, service
preference withdrawal and exact calendar review/queueing. WebKit mobile screenshot was
visually inspected. Logs are in the calendar-email evidence directory. Remote CI on the
new pushed revision is still required for full CI closure.
