import {
  buildHermesDraftDispatch,
  DEFAULT_HERMES_DRAFT_DISPATCH_PATH,
  writeHermesDraftDispatch,
} from "../lib/hermes-draft-dispatch.mjs";

const dispatch = buildHermesDraftDispatch({ generatedAt: "2026-07-05T00:00:00Z" });
writeHermesDraftDispatch(dispatch);
console.log(`Wrote Hermes draft dispatch to ${DEFAULT_HERMES_DRAFT_DISPATCH_PATH}`);
