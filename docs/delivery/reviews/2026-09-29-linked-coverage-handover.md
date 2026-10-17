# F19 / O23: accepted Case, inquiry and physical-key handover

The linked browser journey now offboards a broker through the real staff form, requests and
accepts their Case handover, accepts the linked inquiry separately and records physical key
return. A Case and its existing promised task move only on the receiver's acceptance; their
deadline and promise remain unchanged. The inquiry and key custody remain independently
accounted for until their own commands succeed. Each record then leaves agency coverage.

This exposed two native-form defects: successful Case acceptance and inquiry acceptance
removed their submitted forms when the page rerendered, losing the success receipt without
JavaScript. Successful commands now redirect to their existing actor-bound operation-status
GET. Failure/conflict/unknown outcomes retain their existing form handling. Reloading the
confirmed Case receipt does not resubmit or change the Case.

The same journey exposed a mobile custody-history defect. A 120-character unbroken staff
name widened a 320px page to 1216px and prevented pointer interaction with its confirmation
checkbox in mobile Chromium. History and definition fields now wrap within their available
width. The regression compares actual document width with the configured viewport, rather
than with `innerWidth`, which can expand with mobile overflow. No forced click, hidden text,
increased timeout or weakened assertion was used to pass the journey.

## Evidence and review

Artifacts: `/Users/ivan/Code/.artifacts/ms-realty/recovery/20260929/`.

- `linked-handover-linux.log`: all six original journeys failed. Native Case acceptance lost
  its receipt; the JavaScript inquiry assertion initially used the status-page paragraph
  instead of the rendered receipt heading. The assertion was corrected.
- `linked-handover-linux-fixed.log`: five passed and four failed after the Case repair.
  Native inquiry acceptance exposed the same disappearing-form defect. Mobile Chromium
  timed out with repeated pointer interception at the physical-custody checkbox.
- `linked-key-overflow-red.log` retained that timeout with the ineffective `innerWidth`
  comparison. `linked-key-viewport-red.log` reproduced the 1216px width against 320px.
- `linked-handover-linux-final.log`: fresh Linux production build and all 27 scenarios passed
  across Chromium desktop/mobile and mobile WebKit, including JavaScript on/off. It includes
  six linked handovers plus existing Case lifecycle, inquiry work, access-denial, rate-limit
  recovery and key-custody regressions. Final WebKit JS-off custody screenshot was inspected.

Correctness review preserves existing command authorization, version checks and operation
identity; receipt reads retain actor and current record visibility checks. Spec review follows
architecture §6.6: receiver acceptance and remaining promises are explicit, and coverage is
not fabricated physical custody. The fixture grants only the manager's required Case scope;
no default production role was broadened.

This qualifies these local software paths, not the agency's real physical handover. Appointment
host replacement, additional administrative records, reminders and live release acceptance
remain separate work. No customer message, provider activation or production change occurred.
