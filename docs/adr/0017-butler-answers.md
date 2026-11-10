# ADR 0017 — Butler answers visitors on listing pages

Status: accepted by the owner (ADR 0011 §5, "Act" row: answer visitor questions from approved
public content). Discharges the three obligations of ADR 0007 in the lightest honest form.

The first outcome number is the time from a visitor's question to a useful answer. Until now a
visitor could only fill in an inquiry form and wait. A listing page now has one block, "Ask about
this home", where Butler answers from that listing's published content, names where the answer
comes from, says when the listing does not say, and hands anything else to a broker.

## Decision

Two tiers and a fixed set of refusals, all behind one brand switch.

1. **Facts tier, no model.** A deterministic answerer over the listing's published facts. It
   recognises ten question types in all seven public locales (and the visitor may type another
   language than the page's) and states the recorded value as the page shows it. Unknown,
   withheld or conflicting values are never guessed: the answer says the listing does not give
   them and offers a broker.
2. **Text tier, model, optional.** Runs only when the existing Butler configuration is enabled
   and qualified (`assistanceConfig().enabled`). One call through the existing provider path
   with a strict JSON schema: answer, citations (a source key and an exact quote each), unknown,
   refusal. A deterministic validator is the only gate between model text and a visitor. It
   rejects the output unless every quote is literally present in the cited source, every number
   in the answer appears in the sources, the answer is in the page's language (script and
   distinctive words), at most three short sentences, has no link or address, and is free of
   forbidden framing (promises, advice on value, money, legal and tax words, and any sea, beach
   or coast framing: Sandanski is inland). A rejected or failed call never shows model text: the
   visitor reads "The listing does not say. A broker can tell you." with the hand-off. The model
   sees only the question and the sources. A listing text that addresses the assistant ("ignore
   previous instructions") is dropped from the sources before the call.
3. **Refusals, no model.** Price negotiation and discounts, legal, tax, mortgage and money
   questions, opinions on value or return, questions about other people, and anything that asks
   Butler to act (book, reserve, hold) get a fixed, kind refusal with the hand-off. An
   instruction aimed at Butler inside a question gets a fixed reply and nothing runs. Listing
   text and visitor text are data, never instructions.
4. **Hand-off.** "Ask a broker" opens the existing inquiry form for this listing with the
   question as a draft message (`question` query parameter, 300 characters, carried through
   `/inquire/start`). The visitor edits and sends it; the chat itself never becomes an inquiry
   (ADR 0007, Q144 A). Only the form the visitor sends reaches a broker.

Sources are the same public reads the listing page uses: `getPublicListing` (the active manifest
in the page locale) and the approved area guides bound to the listing's place
(`readApprovedAreas`). Never a draft, a broker note, an unpublished fact, a private address, or a
locale without an approved publication (the block is absent there).

### Source keys

`listing.title`, `listing.description`, `listing.reference`, `listing.place`, `listing.type`,
`listing.availability`, `agency.contact`, `fact.<key>` (a published fact of the manifest) and
`area:<slug>` (an approved area guide).

## Question types the facts tier answers

Examples for a fixture listing (sale, EUR 95,000, 68 m2 living area, 2 bedrooms, floor 2 of 5,
Sandanski).

| Type         | English example                                                                                     | Bulgarian example                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| price        | The price is €95,000. This is the asking price.                                                     | Цената е 95 000 €. Това е офертната цена.                                                                       |
| area         | The living area is 68 m².                                                                           | Жилищната площ е 68 m².                                                                                         |
| bedrooms     | It has 2 bedrooms. It has 3 rooms in all.                                                           | Има 2 спални. Има общо 3 стаи.                                                                                  |
| type         | It is an apartment. It is for sale.                                                                 | Това е апартамент. Имотът се продава.                                                                           |
| floor        | It is on floor 2 of 5.                                                                              | Намира се на етаж 2 от 5.                                                                                       |
| place        | It is in Sandanski. The listing shows the location only to this level.                              | Намира се в Sandanski. Обявата показва местоположението само до това ниво.                                      |
| availability | It is available. The agency last confirmed this on 1 October.                                       | Имотът е наличен. Агенцията потвърди това последно на 1 октомври.                                               |
| reference    | Its reference is MS-10234.                                                                          | Номерът на обявата е MS-10234.                                                                                  |
| viewing      | Choose Request a viewing on this page and suggest a few times. A broker confirms the time with you. | Изберете „Заявка за оглед“ на тази страница и предложете няколко часа. Брокер ще потвърди часа с вас.           |
| contact      | MS Realty handles this home. Call +359 879 696 870, or send a question with the inquiry form.       | MS Realty отговаря за този имот. Обадете се на +359 879 696 870 или изпратете въпрос чрез формата за запитване. |

A question that names up to three of these is answered in the order asked. The source line under
the answer says where it comes from ("From the listing MS-10234", "From the listing description",
"From the area guide ...", "From the agency's details"). A sentence is added when the listing
states a basis (asking, negotiable) so the answer never reads firmer than the listing.

## Switches

- Brand: `butlerLevels.publicAnswers` in `src/config/tenant.ts`, `"act"` for this brand, pinned in
  `tenant.test.ts`. `"off"` removes the block; the page is the inquiry form alone.
- Deployment kill switch: `BUTLER_PUBLIC_ANSWERS=0` (legacy `HERMES_PUBLIC_ANSWERS=0` is read
  when the Butler name is absent). Removes the block and the route's answers at once.
- Text tier: the existing `BUTLER_*` configuration. Variable names a deployment needs, never
  values: `BUTLER_ENABLED=1`, `BUTLER_PROCESSING_APPROVED=1`, `BUTLER_ROUTING_QUALIFIED=1`,
  `BUTLER_ROUTING_POLICY` (JSON), `OPENROUTER_API_KEY`, `BUTLER_INPUT_USD_MICROS_PER_TOKEN`,
  `BUTLER_OUTPUT_USD_MICROS_PER_TOKEN`, `BUTLER_DAILY_LIMIT_USD_MICROS` (see
  `src/server/ai/README.md`). Without them the facts tier and the refusals still work and a
  question about the listing text answers "The listing does not say."

## Limits and budget

- Per client IP (edge-observed, used only as a keyed hash in the rate-limit bucket): 12
  questions at once then one every 30 seconds (`butler_answer.ip`); of those, model questions
  4 at once then one every 5 minutes (`butler_answer_model.ip`). A visitor over the limit reads a
  plain note and the hand-off; nothing is stored for a refused request.
- The text tier reserves its cost under the same daily advisory lock and ceiling as every other
  AI task (`reservePublicAnswerBudget`, spend summed across `assistance_runs`, `generative_runs`
  and `butler_answers`). At the ceiling the visitor reads "Butler can't answer more questions
  today. A broker can." and a `limited` receipt records it. A failed call keeps its reservation.

## What is stored, and for how long

One `butler_answers` row per answered question:

- Always, kept: listing, manifest, locale, tier (`facts`, `text`, `none`), outcome (`answered`,
  `unknown`, `refused`, `rejected`, `limited`), question kind, cited source keys, reason.
- Text tier, kept: prompt version, routing data (requested router, model, provider, generation
  id, policy digest), billing mode, reserved and actual cost, token counts.
- Kept 30 days, then cleared by the `rate_limit.prune` job: the visitor's question and the text
  shown (`text_expires_at`). Thirty days is the same window as other public input. The receipt
  itself stays.
- Never stored: IP address, cookie, contact detail, user agent. A visitor who types a name or a
  number into the question has put it in the question text, which is cleared on the same
  schedule; the field's hint asks for listing questions only.

Staff see the ten most recent questions per listing, with the outcome, under the listing's
secondary area (staff locales bg, en, ru). A repeated "the listing does not say" is a prompt to
complete the listing text or facts.

## Evaluation

`src/server/ai/public-answer-cases.ts` holds the committed case set per locale: router (every
fact type, every refusal class, instruction in the question, a question for the text tier), the
facts answerer (known and unknown values, rent, closed listings, no sea framing) and recorded
model outputs the validator must reject (a price or area that differs from the facts, a quote
that is not in the sources, a missing citation, wrong-language output, sea framing, advice, a
promise, a link, too long, off-schema, an instruction in the listing text followed by the model).
It runs in the normal unit run (`public-answer-cases.test.ts`). `npm run butler:eval` replays the
text-tier classes (grounded, unknown, disguised negotiation, instruction in the listing text)
against the configured provider through the same instructions, schema and validator and prints
pass counts by class; without a configured provider it says so and exits 0. It adds no gate and
writes no evidence file.

## ADR 0007 obligations

1. Policy for answers without a person: this ADR (allowed sources, refusals, hand-off wording
   in the message catalog `butlerAnswers`, the cited source per answer in the receipt, and who
   can switch it off: the brand level and `BUTLER_PUBLIC_ANSWERS`).
2. Evaluation set: the case set above, separate from the draft tasks, in every public locale.
3. Release proof: the unit and integration runs on the exact build, the kill switch covered by
   `block.test.ts` and `public-answer.int.test.ts`, and the manual path (the inquiry form and the
   brand line) verified with the block off. Release evidence for launch follows ADR 0011 §6.

## Consequences

- The visitor's question is answered in the page, usually without a model and always without a
  person in between; a broker sees only what the visitor chose to send.
- Catalog wording for seven locales is a draft (`messages/_status.json`, `draft_unreviewed`); a
  human approves each before it is relied on for indexing or claims.
- The route is `POST /{locale}/butler/answer`. Without JavaScript it redirects back to the
  listing page with `?butler=<receipt>#ask-butler`; with JavaScript the same post returns JSON.
- Migration `0041_butler_answers` creates `butler_answers`; the number is renumbered at
  integration with the other branches.
