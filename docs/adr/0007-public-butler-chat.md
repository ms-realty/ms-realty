# ADR 0007 — A public Butler chat, under its own policy and gate

Status: accepted by the owner (Opened Questions Q141, with Q142–Q144). The scope and hand-off
rules below apply under the task-level policy in [ADR 0011 §5](0011-platform-direction.md#5-butler-acts-within-levels).
ADR 0011 supersedes the earlier R00 mapping, R10 release requirement and draft-only ceiling.

## Decision

A public Butler chat may answer visitors on listing, area and guide pages from approved public
content only. It names its source, says what is unknown, hands off to a broker, and gives no view
on price, money, legal or tax questions. Its role is limited to the in-page answer and hand-off.
Inquiry acknowledgements are a separate Act task. To enable public chat, the brand needs an
accepted policy, a passing exact-build evaluation, a receipt, a manual path and a switch that
stops the task.

- **Sources (Q142 B).** Any approved public listing, area or guide page, in the visitor's language,
  including other homes it may suggest. Never a broker note, a draft, an unpublished fact or a
  record of another person. Unknown stays unknown: "The listing does not say."
- **Hand-off (Q144 A).** The chat never becomes an inquiry. Only the form the visitor sends reaches
  a broker, and the form says so: "Only what you send here reaches a broker."
- **Client and owner summaries (Q143 A).** Butler's "What changed" summary in the client area runs
  under the same accepted policy. Until that policy ships, the panel is not shown; the timeline and
  the full comparison remain the whole path.
- **Manual path.** The question form, the brand line and a broker reply complete every journey
  with the chat switched off, as §3.3 requires of approved content and human contact.

## Obligations before the chat is enabled

1. An accepted policy for answers sent without a person: allowed sources, refusals (price, money,
   legal, tax, personal circumstances), hand-off wording, logging of the cited source per answer,
   and who can switch the chat off.
2. A bounded evaluation set and gate for the chat task in the AI service, separate from the draft
   tasks, with grounding, refusal and hand-off cases in every enabled locale.
3. Evidence on the exact build: a passing evaluation, an answer receipt, the brand switch
   stopping the task, and the manual path verified with the chat off.

Until all three exist the chat stays off and the flows use the form (W02, W21).
