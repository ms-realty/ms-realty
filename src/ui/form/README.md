# Shared form contract

`ActionForm` composes a real Server Action, `useActionState`, native fields, linked errors,
pending protection, revision comparison, receipt and reconciliation states. Pass the Server
Action directly, with the same canonical `permalink` and bound arguments on the destination
page. A client wrapper around the action breaks the native HTML baseline.

The server issues `initialFormState(commandScope, safeValues, revision)`. In the action,
read only named fields with `readFormValues` and verify `readFormEnvelope`. Every call must
independently verify origin, identity, authorization, input and the atomic revision guard.
Previous action state and hidden fields are untrusted. Do not return credentials, file bytes
or protected fields in `values` or the conflict projection.

Validate before consuming the operation identity. A production command uses the existing
`runOperation` transaction and canonical payload digest; the UI's pending flag and signed key
are not database idempotency. Replay the stored confirmed/accepted outcome for identical
retries. A changed payload conflicts. A reviewed reapply is a new explicit intent with a new
server-issued identity and the authorized current revision. Never rotate keys or replay
commands automatically after uncertainty or reauthentication.

Return `FormState` with a fresh `responseId` on every response, even an identical validation
failure, and `reconciliation` for its exact operation. The response URL takes precedence over
the initial page prop after native HTML restoration or a reviewed reapply. Preserve the
entered strings in rejected/conflict states. Only `confirmed` renders
a success receipt. `accepted` and `unknown` expose the supplied status route and prevent a
new command. A lost transport response retains a read-only draft and offers reconciliation
for the effective operation. Every production consumer must supply a real authorized status
route; it must distinguish missing, still-running, confirmed and unknown outcomes.

`FormField` covers native text/textarea input. More complex controls can consume the
controller's `field()` binding, but they must preserve native submission, error associations
and pending read-only behavior. Give each form one effect-specific submit action.

The opt-in `/{locale}/design/forms` example checks fictional text through a real Server Action.
It writes no agency data. Its host-only HttpOnly cookie stores one signed practice receipt
(operation identity, text digest, time, revision, reference) for one hour. It neither stores
the entered text nor substitutes for the database operation ledger. Storybook states are
synthetic; `e2e/forms.spec.ts` covers the real enhanced and JavaScript-disabled path.

On the first client commit, the form adopts pre-hydration edits from its declared safe native
text/textarea, single-select and checkbox controls. This prevents a subsequent controlled edit
from restoring the server's initial draft over text entered on a slow connection. Operation
identity, revisions, hidden fields, passwords and file controls are excluded. It runs once per
form instance; later rejected/conflict states remain governed by the server response. The
server still validates every submitted field and explicit confirmation. React hydrates a
textarea back to its server text, so the form reads its textareas by their `field()` id before
they hydrate; a textarea that does not use that id loses text typed before JavaScript. The
delayed-script journeys in `e2e/form-hydration.spec.ts` cover early typing, selection and review
confirmation; `e2e/listing-edit.spec.ts` covers a prefilled textarea.
