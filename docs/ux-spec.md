# MS Realty — Final Workflow, UI/UX and Frontend Specification

Version 2.0 · 24 September 2026  
Status: normative design and frontend-development baseline through first public release; not an implemented or release-approved product  
Audience: product designer, interaction designer, content/localization lead, frontend developer, backend integrator, QA and agency operator

## 00. Authority, scope and how to use this specification

This document turns the [Final Product and Release Architecture](architecture.md) into implementable experience contracts. The architecture controls domain meaning, authority, infrastructure, included capabilities and release gates. This document controls the detailed interaction, layout, content, state and designer/frontend handoff within those boundaries. A conflict requires an explicit correction, not an implementation team's silent interpretation.

This replaces the 21 September target-experience document for development. Its screen and flow IDs are retained for traceability, but their old descriptions are not inherited when they conflict with the final architecture. There is no instant booking, owner-accounting workspace, maintenance-dispatch system, autonomous public chatbot or general-purpose CRM builder hidden in the remaining designs.

The complete first release contains public discovery and intake, private client continuity, staff agency work, publishing/localization, assistance, support and operating/release experiences. It is not a catalogue-only MVP. “Public release” includes the operating processes behind the public screens and the secure client experiences reached after contact.

The product is a responsive web application. Public/client languages are Bulgarian, English, Russian, German, Dutch, Greek and Hebrew (`bg`, `en`, `ru`, `de`, `nl`, `el`, `he`); staff languages are BG, EN and RU. BG is the editorial source. Hebrew is an entire RTL task experience. Light appearance is release scope; dark mode and native mobile apps are not.

“Must” and “never” specify requirements. Suggested English interface text is source copy to review and translate, not permission to publish unreviewed translations. Examples and design fixtures are synthetic unless explicitly marked as approved production content. Numeric layout values are starting constraints to test at zoom, with real content and translations; they do not justify clipping or disabling a task.

The document is intentionally layered:

- Chapters 01–04 explain users, information, navigation and lifecycle semantics.
- Chapters 05–07 define shared interaction, visual and layout rules.
- Chapters 08–13 define all 32 end-to-end flows, including human/system handoffs and recovery.
- Chapters 14–16 define all 75 screen contracts, including panels and explicitly retired screens.
- Chapters 17–21 define shared components, forms, localization, frontend contracts and degraded behavior.
- Chapters 22–25 define traceability, validation, delivery, release evidence and the final handoff.

A screen contract inherits the applicable shared rules; inheritance is not an excuse to omit its designed states. A Figma/Paper frame, working mock, successful local test, live provider response and accepted public release are different evidence classes. Neither this document nor its HTML reading edition proves any of them.

The current `AGENTS.md` and launch-authority files remain operational authority. In particular: “Do not call the system production-ready while any launch gate is blocked.” This specification does not waive search/SEO, human review, live runtime, recovery or other outstanding evidence. It does not authorize publication, customer messages, provisioning, DNS changes or data deletion.

## 01. Product purpose and first-principles experience

### 01.1 The outcome, not the page collection

MS Realty helps a person make a grounded property decision and helps an accountable broker carry that person from first contact to a truthful outcome. Its public promise is useful discovery plus reachable local expertise. Its operating promise is that facts, commitments and the next responsible person do not disappear between tools or visits.

The design must answer five questions near the moment they matter: What is this? Is it suitable for me? What is actually known? What will happen if I act? Who owns the next step? More cards, more filters and more automation do not themselves improve those answers.

The public experience primarily supports evaluation and action. The client workspace supports understanding and completing one next task. The staff workspace supports scanning, deciding and recording accountable work. Guides support reading. These modes share a visual language, but not identical page density or navigation.

### 01.2 People and successful outcomes

| Person and situation | Core task | Design must make easy | Evidence of success |
|---|---|---|---|
| Local buyer/tenant, often on a phone | Find plausible properties and arrange contact/viewing | Specific criteria, useful facts, honest availability, short request | Accepted request with the intended reference and next step |
| Cross-border buyer, unfamiliar with the process | Reduce uncertainty before spending time or travelling | Language choice, location context, known/unknown facts, human explanation | A broker-owned Case, acknowledged Brief and realistic viewing plan |
| Seller/landlord | Explore representation and approve accurate marketing | Minimal intake, scope/authority explanation, exact preview and change requests | Versioned instructions and reviewed publication, not an untracked email attachment |
| Existing client/co-buyer | Return to an ongoing decision | Correct Case, private audience, changed facts, proposals and next action | Complete the intended task without repeating context or exposing another participant |
| Broker/coordinator, interrupted during the day | Keep promises and progress Cases | Today queue, original context, next action, schedule and handover | Owned work with a durable result and no forgotten commitments |
| Editor/translator/publisher | Turn evidence into correct public content | Source binding, diffs, rights, locale and publication distinctions | The exact reviewed version appears on the permitted destination |
| Manager/privacy/release operator | Maintain service, access and safe operation | Exceptions, proof, impact and named ownership | A resolved exception or evidence-backed decision, not a green-looking dashboard |

### 01.3 Non-negotiable experience principles

1. Browse, compare and inquire without forced registration. Authenticate when the task needs private continuity, not to inflate account numbers.
2. Preserve intent across handoffs. Ask, callback, viewing and seller consultation are different intents even when they share form components.
3. Show uncertainty precisely. Unknown area is not zero; an old availability check is not current confirmation; a clean document scan is not legal verification.
4. Distinguish saving, approval, publication and delivery. A saved draft must never look sent or live.
5. Keep work attached to the real relationship. One buyer Case can consider many Listings; losing one property must not erase the buyer's other options.
6. Make consequential effects deliberate. Confirming a viewing, sending a message, granting access and publishing require a reviewed context and a durable outcome.
7. Preserve recovery before adding convenience. Back, refresh, two tabs, a slow network, reauthentication and interrupted uploads are normal usage conditions.
8. Let people correct the system. No hidden filter relaxation, fabricated match confidence, presumed ownership or unexplained qualification score.
9. Keep the phone version complete. Change composition, not permissions or capability. The accessible list/form alternative must complete the same task as a map, grid or drag interaction.
10. Give every pending item an owner and next condition. “Waiting” without who/what/when is not a useful operating state.

### 01.4 The service blueprint

| Stage | Customer experience | Agency responsibility | Durable system result | Failure that must be visible |
|---|---|---|---|---|
| Discover | Search, read, compare | Keep approved facts and availability current | Eligible public presentation and preserved criteria | Unavailable locale/map/inventory, not fake results |
| Ask | Submit an intent-specific request | Coverage queue owns it immediately | Inquiry and receipt committed together | Unknown/not-received outcome distinct from accepted |
| Agree needs | Discuss and acknowledge requirements | Broker owns Case, Brief and next action | Case participants and Brief revision | Conflicting or unanswered requirements |
| Evaluate | Review suggested Listings and trade-offs | Maintain separate Interests and feedback | One Case with several independently progressing Interests | A withdrawn/changed Listing does not close the Case |
| View | Propose and agree an arrangement | Check host, access, resources and time | Versioned Appointment and notification intent | Request/proposal is not confirmation |
| Propose | Review exact terms and decide next step | Coordinate scoped review and responses | Versioned Proposal with recorded decisions | Expired/stale terms or unknown message delivery |
| Coordinate | Supply requested evidence and complete actions | Human professional/process ownership | Purpose-bound documents and commitments | Scan/review/completion cannot be conflated |
| Close | Understand actual outcome and remaining obligations | Resolve commitments, availability, retention and aftercare | Truthful closeout record | “Closed Case” is not automatically “sold Property” |

Seller work joins the same loop through intake → scope/authority → assessment → instructions → parallel preparation → exact preview/review → marketing → proposal coordination → handover. Corrections and withdrawals can interrupt any public stage and must propagate through affected commitments.

## 02. Domain language, permissions and audience

### 02.1 The nouns users must not have to untangle

Use the [architecture glossary](../CONTEXT.md). Property is the physical asset; Listing is the sale/letting presentation; Case is one customer outcome; Brief is that Case's requirements; Interest is the Case–Listing relationship. Inquiry is received intent before or outside a Case. Proposal is a particular set of negotiated terms, not another name for Listing.

Staff may see these precise labels. Public copy normally says “property,” “your request,” “your requirements,” or “proposal,” while the underlying identifiers remain distinct. A client never needs to understand a database join to save feedback. A seller and buyer attached to the same Property do not thereby share a conversation, participants or private evidence.

An object header must provide stable identity, human-readable title, current state and permitted next action. Contextual references use the Listing reference rather than a mutable title alone. Public facts show value/basis and meaningful freshness; staff evidence shows source, review scope and revision. Avoid universal “verified” badges.

### 02.2 Capability and audience matrix

| Actor | Normal visible work | Can request/perform | Never infer from this role |
|---|---|---|---|
| Visitor | Approved public facts and own receipt outcome | Search/save locally/inquire/request a viewing | Private address, owner identity, Case information or confirmation authority |
| Invited client | Specifically granted Cases/actions/documents | Propose Brief edits, feedback, messages, agreed instruction/decision tasks | All documents belonging to other Case participants |
| Client collaborator | Explicitly scoped shared decision material | Only granted feedback/message/decision actions | Household or shared email implies unlimited access |
| Assigned broker | Assigned/team-authorized work | Case progression, permitted facts, proposals and commitments | Publishing or legal authority without its separate capability |
| Coordinator | Necessary scheduling/coverage/contact context | Propose and confirm with required checks | Broad access to identity/financial/legal evidence |
| Editor/translator | Assigned source/draft/locale work | Draft and scoped review | Commercial, publishing or professional approval |
| Publisher | Eligible exact publication candidates | Activate, restrict, withdraw, reconcile | Team administration or legal verification |
| Manager/privacy/release operator | Explicit capability-specific operations | Assign, grant/revoke, handle privacy/evidence | An invisible superuser bypass or unlogged document access |
| Hermes | Task-scoped sources and drafts | Produce proposals for human review | Send, publish, index, grant access or approve facts/legal claims |

Server authorization is capability plus current membership/grant, record relationship, field audience and action state. Hidden controls are not access control. Every mutation and protected read must be checked independently of navigation. A forbidden response must not reveal the secret title, amount, recipient or existence of another person's Case.

### 02.3 Visible audience and trust boundaries

Show the audience adjacent to a composer, document request, preview or sharing action—not only in settings. Use explicit labels such as “Internal note — agency staff only,” “Message to [named recipients],” and “Visible to [permitted participants].” Switching composer type must not silently transfer attachments or a private body into a wider audience.

Clients may request a collaborator invitation. Authorized staff issue a scoped, recipient-bound invitation; a client cannot enlarge permissions by pasting an email address. Participants can see the access that is safe to disclose and request removal. Revoking someone else's access requires the appropriate capability; self-withdrawal does not erase the underlying agency record.

Same-person editing and routine review are allowed when that person has both capabilities. Present two attributable decisions, not a fictional “independent review passed.” Professional conclusions, privileged operations and release approval follow the architecture's separate authority rules.

## 03. Information architecture, routes and navigation

### 03.1 Three contexts, one coherent product

The public host is `makler-realty.com`; client context is `my.makler-realty.com`; staff context is `app.makler-realty.com`. The private hosts are target configuration, not an authorization to change DNS. Preserve approved exact legacy behavior on both `.com` and `.ru`. Never infer a blanket domain/home/search redirect.

Public and client routes begin with one of the seven supported locale codes; staff routes with BG/EN/RU. The locale controls labels, formatting and eligible public content, not identity or facts. Private authentication contexts and cookies remain separate. A staff member signed into the client host must not suddenly see agency controls there.

| Context | Primary navigation | Secondary/contextual navigation |
|---|---|---|
| Public | Buy, Rent, Sell/Let, Areas, About/Contact, Saved, language | Compare tray, Help, privacy/accessibility, service/guide links |
| Client | Overview, Properties, Appointments, Messages, Documents | Case switcher; Brief, Proposal, Listing preview and Closeout when relevant; preferences/participants/privacy |
| Staff | Today, Inquiries, Cases, Calendar, Inventory, Reviews, Content, Operations | Record tabs; team/access, service policy, release evidence and account settings |

Hide an unoffered service from normal navigation. An existing legacy URL still needs its truthful approved response. Missing permission removes unavailable navigation entries; known work blocked by a prerequisite stays visible with the safe reason and recovery action.

### 03.2 Route and surface allocation

All paths below are under the appropriate host and `/{locale}` unless a legacy manifest says otherwise. Screen IDs describe contracts; related IDs can be panels or states of one route.

| Route family | Screen contracts | Canonical purpose |
|---|---|---|
| `/` | P01 | Intent-led entry |
| `/properties` | P02, P03, P04, P22 | One search state with list/map/filter/recovery variants |
| `/properties/{reference}/{slug}` | P05, P06, P21 | Eligible detail and media; truthful unavailable/preservation states |
| `/saved`, `/compare`, `/share/{token}` | P07, P08, P09 | Local selection, comparison and public-facts sharing |
| `/preferences` and subscription task routes | P10, P24 | Verify/edit/pause/unsubscribe alerts; no personal data in query strings |
| `/inquire`, `/requests/{receiptId}` | P11, P12 | Contextual request and durable outcome |
| Public `/viewings/request`; client `/appointments/{id}` | P13, P14/C06 | Public request; private arrangement status always on the client host |
| `/areas`, `/areas/{slug}`, `/services/{slug}`, `/guides/{slug}` | P15, P16, P23 | Approved geography/guidance and bounded supported-service entry |
| `/sell`, `/let`, `/owners/request`, receipt | P17, P18, P19 | Owner consultation and intake |
| `/contact`, `/help/{topic}` | P20, P24 | Real contact, policies and assistance |
| Client `/access`, `/invitations/{id}` | C01, C02 | Verify identity and accept access intentionally |
| Client `/saved`, `/saved/import` | C05 account-saves variant | Explicit cross-host import and personal saves; selecting a Case is a separate action |
| Client `/cases`, `/cases/{id}` | C03, C11, C16 | Case index and role-appropriate overview/closeout |
| Client Case `/brief`, `/properties`, `/appointments`, `/messages`, `/documents`, `/proposals`, `/listing-preview` | C04–C10, C12 | Contextual private tasks |
| Client `/preferences`, scoped `/participants`, `/privacy-requests` | C13, C17, C18 | Personal choices and access/data requests |
| Client supported service Case | C14 | Owned consultation, not maintenance tracking |
| Staff `/access`, `/access/recovery` | O23 access variant | Staff-only provider handoff, enrollment, challenge, denial and recovery |
| Staff `/today`, `/inquiries`, `/inquiries/{id}` | O01–O03, O18 | Coverage, triage and commitments |
| Staff `/cases`, `/cases/{id}`, `/parties/{id}` | O04–O07, O19, O20 | Work and relationship context |
| Staff `/calendar`, `/appointments/{id}` | O08, O09 | Resource-aware scheduling |
| Staff `/inventory`, `/inventory/{propertyId}` | O10–O14 | One Property workbench containing its Listings |
| Staff `/reviews`, `/publications/{id}`, `/corrections/{id}` | O15–O17, O32, O33 | Exact review, assistance and publication/correction outcomes |
| Staff `/content` | O21 | Approved editorial content |
| Staff `/operations/{section}` | O22, O25–O30 | Reports, exceptions, privacy, imports, merges and bounded service Cases |
| Staff `/settings/{section}` | O23, O24; release-evidence panel | Capability-gated policy, team and release work |

C15 and O31 are retired, with no replacement financial route. Do not create disabled “coming soon” statement tabs. Architecture route families prevail if route naming is normalized during implementation; retain stable object identity and these task contracts.

### 03.3 Return context, links and interruptions

Back from a Listing restores committed filters, sort, loaded-page position and focused result when possible. Opening a filter sheet or media viewer adds a meaningful closeable state; Back closes that state before leaving its parent. Direct links open a complete parent context with a sensible close destination even when there is no previous in-app history.

Tabs representing durable record sections have deep links. Ephemeral disclosure toggles do not pollute history. Keep sensitive Brief text, access needs, email, phone, draft messages and private filter criteria out of URLs and analytics. A return URL is allowlisted and reauthorized after sign-in; it is not permission to execute the former action.

Do not silently discard dirty work on context switches. Show Save draft / Discard / Stay when an unsaved draft would be lost. Discard means local draft removal, not record deletion. Already committed operations continue independently; leaving their status view does not cancel them. Return through a durable Operation link.

## 04. Lifecycle semantics and visible state

### 04.1 Inquiry and Case

Inquiry states are received → assigned → awaiting client → linked to Case, or resolved without Case. Suspected spam, duplicate candidate and unreachable contact are explicit dispositions. Received means database acceptance with coverage-queue ownership; it does not mean a broker read it or a message was delivered.

Buyer/tenant Case stages are needs agreed → evaluating → viewing → proposal preparation → proposal active → coordination → completed. A Case can return to evaluating without destroying history. Active/paused/closed is a separate disposition. Pause records why, what is awaited, who owns follow-up and when to review.

Seller/landlord stages are request received → scope/authority review → assessment → instructions agreed → preparing → marketing → proposal coordination → completion/handover. Preparing contains parallel fact, media, terms, source-copy and locale work. Show separate completion reasons; do not force a fake linear wizard through tasks already finished.

Interest state is suggested, shortlisted, viewing requested, viewed, proposal, declined or unavailable. A Case can have several different Interest states. A stage chip must not flatten those relationships into “buyer lost” because one Listing became unavailable.

### 04.2 Listing state is several answers

| Axis | Visible labels | UX implication |
|---|---|---|
| Availability | Available; confirmation required; negotiating; reserved with recorded basis; sold/let; withdrawn | Controls truthful availability and viewing prerequisites, not approval |
| Editorial revision | Draft; needs facts; in review; changes requested; approved revision | Save is not publish; live and working versions can differ |
| Locale | Missing; draft; reviewing; approved for source; stale; rejected | An available language switch is not proof that this Listing has an approved translation |
| Publication | Never published; eligible; active; restricted; withdrawn | Exact manifest/pointer and current generation decide exposure |
| Destination | Queued; attempting; acknowledged; verified; failed; unknown; withdrawing; withdrawn | Sending a request is not verified external publication |
| Freshness | Current under policy; review due; conflicting; unknown | A timer creates review work; it never reconfirms facts |

Public detail normally shows only the decision-relevant availability, confirmation time and known limitations. Staff can inspect every axis in the workbench. Do not make a single red/amber/green dot carry this model.

Availability review defaults to 14 days for sales and 7 days for long-term rentals. Expiry shows confirmation required and prevents staff confirming a viewing until reconfirmed. A credible material dispute or withdrawal immediately restricts affected inaccurate exposure; it does not wait for a timer or translated replacement.

### 04.3 Appointments, proposals, messages and documents

| Object | Required visible distinction | Consequential guard |
|---|---|---|
| Appointment | Requested, proposed, confirmed, reschedule requested, completed, declined, cancelled, no-show | Confirm only after host, access, resource/time and availability checks; keep old confirmation during a proposed reschedule |
| Proposal | Draft, reviewed, submitted, awaiting response, countered, declined, withdrawn, expired, agreed for next step | Decisions reference an exact revision; changed terms invalidate earlier approval |
| Message | Draft, approved, queued, attempting, provider accepted, delivered, bounced/failed, outcome unknown | Display only observed delivery; unknown outcome does not offer blind resend |
| Document | Uploading, sealing/verifying, scanning, processing, ready for scoped review, reviewed for named purpose, replacement required, superseded, restricted | Upload success is not scan success; scan success is not professional validation |
| Task/Commitment | Open, in progress, waiting, done, cancelled | Owner, due condition, dependency and evidence/outcome; waiting has a review date |
| AI draft | Requested, generating, ready for review, unsupported/conflicting, stale, accepted as draft, rejected, failed | No publish/send/grant; accepting generated text does not approve its next consequential action |

### 04.4 Transition review pattern

Before a consequential transition show the named object, current and requested state, relevant exact version, affected people/destinations, missing prerequisites and the action's real effect. The server checks them again. Review UIs must handle a stale candidate between opening and confirming.

An action result must say whether it changed local state, queued external work, completed an external effect, failed without change, or has unknown outcome. Show the durable reference and recovery on the page. A transient toast may reinforce the result but cannot be its only evidence.

## 05. Shared interaction, recovery and notification rules

### 05.1 Global state catalogue

Each screen draws the applicable states below plus its specific states. The screen register identifies its critical variants; the designer/frontender annotates any inapplicable state rather than duplicating meaningless combinations.

| ID | State | Presentation and recovery contract |
|---|---|---|
| S01 | Initial loading | Preserve route identity and shell; content-shaped placeholder, textual status; no fabricated counts or enabled consequences |
| S02 | Refreshing | Keep authorized committed content visibly marked as updating; stale responses cannot replace newer state |
| S03 | First-use empty | Explain the object's purpose and one appropriate next action; never invent sample private records as real |
| S04 | Filtered empty | Keep criteria, distinguish no matches, offer explicit individual relaxations and reset |
| S05 | Partial | Identify the missing section/provider; preserve independently usable actions; counts state their scope |
| S06 | Stale | Show which observation/version is old and how to refresh/review; no false live badge |
| S07 | Permission limited | Explain safe missing capability or offer authorized contact; do not expose hidden record details |
| S08 | Session expired | Preserve only safe local work, reauthenticate in the correct context, reload/review before action |
| S09 | Offline | Explain offline capability; keep safe in-tab drafts, no automatic consequential replay |
| S10 | Slow | Retain progress/status identity; offer status check or leaving safely, not repeated submissions |
| S11 | Validation error | Linked summary plus field-specific explanation; keep valid input; focus error summary after submission |
| S12 | Rejected command | State no accepted effect where known, show reason and correctable prerequisite; do not erase input |
| S13 | Unknown outcome | “We could not confirm the result”; check same operation; no new logical action until reconciled |
| S14 | Revision conflict | Keep local values, show latest/current diff, allow explicit reapply/review; no last-write-wins |
| S15 | Unsaved draft | Clear local-versus-server state and navigation guard; do not imply another staff member can see it |
| S16 | Server-saved draft | Timestamp/version acknowledgment; separate review/send/publish action remains explicit |
| S17 | Confirmed success | State exactly what committed and what remains pending, durable destination/reference and next action |
| S18 | Revoked/deleted | Remove protected content on detection; safe reason/action; public historical content follows approved policy |
| S19 | Rate limited | Explain temporary limit without exposing anti-abuse internals; retain inputs, safe retry timing and contact alternative |
| S20 | Unsupported/unavailable capability | Useful alternative; no deceptive enabled stub, phantom instant booking or empty service workspace |
| S21 | Queued/running | Durable Operation and truthful phase; changing screen is safe; cancel only if an actual cancellation contract exists |
| S22 | External failure | Local record remains intact; identify failed delivery/verification, owner and permitted reconciliation |
| S23 | Long/overflowing content | Wrap, expand or labeled scroll; no missing amounts, recipients, errors or primary actions |
| S24 | Restricted/correcting content | Suppress inaccurate/private material; explain safe availability and next step without showing the removed fact |

### 05.2 Feedback and focus

Buttons name effects: “Send inquiry,” “Propose time,” “Confirm viewing,” “Save draft,” “Approve this translation,” “Publish reviewed version,” “Request a correction.” Avoid universal “Continue” where the effect changes data or audience. Distinguish destructive/restricting actions visually and in text without relying on red alone.

After ordinary route navigation, set a meaningful document title and announce/focus the main heading appropriately. After a list refresh, retain focus on the control used and announce the new result count once. Do not read the whole list aloud or announce every keystroke. After a removed row, move focus to the next logical row/control and announce the outcome.

Dialogs have a name, deliberate initial focus, contained keyboard navigation, Escape/cancel behavior and return focus. A destructive confirmation initially focuses the safer action when appropriate. A filter sheet has a dialog presentation on mobile, not a visually modal panel with keyboard access to the obscured page. Do not nest modal editors; open a dedicated route for complex document, proposal or publication work. [W3C modal pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)

Sticky headers, action bars, virtual keyboards and open panels must not hide focused controls. Scroll the focused/error target into a genuinely visible region, accounting for safe areas and sticky heights. Never use a fixed footer that covers the last form field. [Focus not obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)

### 05.3 Data entry, saving and consequence

Validate on submit, and after a field has been visited when feedback will help. Do not show red errors before someone has had an opportunity to answer. Long forms use meaningful sections and optional/unknown choices. Do not ask twice for already supplied information unless it changed, became unreliable or needs a distinct confirmation.

Autosave applies to drafts only. Show “Unsaved,” “Saving draft,” “Draft saved at …,” “Could not save,” and “Changed elsewhere” as distinct states. An autosave acknowledgment must match the current draft revision. Submitting for review freezes an exact candidate; later draft changes are not silently part of that review.

Only reversible local choices may be optimistic: selecting a comparison item, changing a local filter draft, or toggling a favorite with an explicit persistence state. Sending, confirming, publishing, merging and access changes wait for authoritative acknowledgment. Do not replay them automatically when a connection returns or authentication succeeds.

### 05.4 Notification policy and microcopy

| Event | In-product behavior | External behavior |
|---|---|---|
| Inquiry accepted | Persistent receipt with reference and next staffed step | Approved receipt template if a valid route exists; failure does not revoke acceptance |
| Broker needs input | Case next-action item with owner/due condition | Approved service notification to permitted recipients |
| Viewing proposal/confirmation/change | Persistent exact arrangement and response task | Versioned ICS/template; acceptance by email provider is not attendance |
| New Case message | Visible thread/unread state | Safe notification without unnecessary private content; audience checked at execution |
| Listing materially changes | Changed/stale indicator on relevant Interest and owned staff correction | Reviewed client communication if needed; no uncontrolled bulk notification |
| Saved-search match | Subscription state and history where useful | Verified opt-in daily digest; current eligible facts only |
| Provider/worker failure | Staff exception with affected work and owner | Technical alert through independent monitoring, not customer-facing panic |

Use “Request received” only after commit; “Viewing requested” until confirmed; “Sent to email provider” when that is all that is known; “Reviewed for [purpose]” instead of “verified document.” Unknown outcome copy must not say “failed—send again.” Explain a blocked action beside it, rather than requiring a tooltip a keyboard/touch user cannot reach.

## 06. Visual system, density, responsive and accessible foundations

### 06.1 Fixed visual direction

Use the architecture's light, grounded agency identity. Property photography, useful facts and human service are the visual content. Public pages are spacious enough to evaluate; operational pages are denser and quieter. Do not introduce a different dashboard theme, decorative gradients, full-screen introduction, artificial scarcity, autoplay hero or floating chatbot over the task.

| Token role | Baseline | Usage constraint |
|---|---|---|
| Canvas / surface | `#F8F7F3` / `#FFFFFF` | Reading background and actual surface hierarchy |
| Primary / secondary text | `#192E27` / `#52625A` | Essential facts and supporting context; never make required data faint |
| Subtle border | `#D9DFD8` | Separation only; not the sole essential input/focus boundary |
| Primary action / inverse | `#214F3C` / `#FFFFFF` | Primary action and deliberate selection, not every badge |
| Interactive outline | `#687A6F` baseline | Validate non-text contrast on actual surrounding surfaces |
| Focus | `#174EA6`, 3 px outline, 2 px offset baseline | Remains visible on every surface and in forced colors |
| Error / warning / success text | `#A12A25` / `#775000` / `#21603C` baseline | Always paired with words/icon; test actual backgrounds and states |

Use self-hosted licensed Noto Sans and Noto Sans Hebrew. Public/client body is 16 px or larger, 1.5–1.65 line height. Staff supporting data may be 14 px; inputs and essential messages remain comfortably readable. Use tabular figures for aligned amounts/times; do not force identifiers into a decorative mono style. Body copy stays around 60–75 characters per line.

Use a restrained 4 px spacing scale: 4, 8, 12, 16, 24, 32, 48, 64. Controls use 6 px baseline corners, panels 8 px where grouping is genuinely useful; status text does not require a pill around every word. One coherent licensed outline-icon family, typically 20/24 px, supports text. Icon-only buttons have accessible names and large hit regions. No emoji status system or fake property images.

Headings establish page/section/group hierarchy, not a display-font spectacle. Use approximately 32/40 for public primary headings, 28/36 for app page headings, 22/30 for sections, 18/26 for group headings and 16/24 for ordinary labels. Permit wrapping and zoom growth; these are not fixed-height boxes.

### 06.2 Layout ranges and density

| Range | Default structural behavior | Required adaptation |
|---|---|---|
| Compact 320–639 CSS px | Single primary column, 16 px gutters; task navigation replaces desktop rails | Full-height sheets, dedicated detail routes, visible keyboard-safe actions |
| Medium 640–1023 | 24 px gutters, one or two content columns by fit | Do not force desktop map/review splits before both panes are readable |
| Desktop 1024–1439 | 24–32 px gutters, stable navigation and optional inspector | Filter rail 240–280 px; app rail about 224 px; inspector 320–360 px only when space permits |
| Wide 1440+ | Content bounded near 1440 px; prose/form columns stay narrower | Use extra room for meaningful comparison, not stretched inputs or more decoration |

Public cards use a consistent approximately 4:3 image window with approved crop/focal point. Detail galleries preserve the full image through an inspect/view action; floor plans use contain, not destructive cover cropping. Reserve media dimensions to avoid jumping layouts. Document and image previews must not crop out qualifications, watermarks or relevant evidence.

Primary touch controls target at least 44×44 CSS px; smaller dense controls need an equally usable alternative and adequate spacing. This is a product comfort target, not a claim that WCAG AA universally mandates 44 px; WCAG 2.2's minimum target criterion uses 24 px with defined exceptions. [Target-size criterion](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)

Default to page scrolling. A split list/map or inbox may use bounded independent panes on desktop when each has a clear landmark and reachable keyboard scroll. Avoid accidental three-level nested scrolling. App data tables can have labeled horizontal scroll where relationships require it; provide a task-equivalent narrow view, not a stack that loses column meaning.

### 06.3 Accessibility and motion

Target WCAG 2.2 AA across complete tasks, including authentication, errors and documents. Use semantic headings, landmarks, native controls where suitable, visible labels and linked descriptions. Tooltips never contain the only instruction. Color, position or an icon alone never communicates required state. Support 200% text zoom, 400% page zoom/reflow where applicable, keyboard-only use, forced colors and reduced motion.

Motion is limited to orientation and feedback, usually 150–200 ms. Reduced motion removes nonessential movement without delaying state changes. No scroll hijacking, animated counters, auto-advancing carousel or progress animation that invents work completed. Do not show a percentage unless byte/job progress actually supports it.

Authentication must allow paste/autofill/password managers where relevant; verification code entry cannot depend on memorization or manual transcription alone. The chosen provider flow and recovery must be tested, not exempted because it is hosted elsewhere. [Accessible authentication](https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html)

## 07. Layout recipes

These sixteen recipes define composition and interaction topology. They are not sixteen competing visual systems. Each screen below binds to a recipe and supplies its task-specific content/state.

### L01 — Public service entry

Desktop: concise navigation; specific location/service proposition; immediately usable Buy/Rent search; Sell/Let alternative; then a limited set of real eligible inventory and evidence-backed local/service information. The first viewport must communicate what area/service is actually covered and offer a useful action. Do not replace search with a lifestyle video.

Mobile: compact identity/menu/language controls, one readable proposition, intent choice and location/search fields in document order. Inventory follows without mandatory onboarding. Footer contains real contact/help/policy routes. Empty inventory keeps seller/contact/guidance paths useful without invented cards. RTL changes alignment and directional relationships, not the photographic content.

### L02 — Search, filters, list and map

Desktop: search summary and sort above a results region. Optional 240–280 px filter rail; cards fill the remaining width. A deliberate map mode uses list and map only when each remains usable, otherwise switches modes. Keep result count, applied chips and listing identities common across views. Map movement presents “Search this area”; it does not silently change committed criteria.

Mobile: committed criteria summary, Filter and List/Map controls, result list. Filters open a full-height dialog with scrollable groups and a keyboard-safe Apply action; draft selections do not change the underlying result set until applied. Show count as updating/unknown when appropriate. Closing preserves or discards draft only under the stated rule; Back/Escape closes the sheet. A selected map pin has a corresponding accessible card/list item.

### L03 — Property evaluation and media

Lead with title/reference, public location, price/basis and availability. Then gallery, key fact groups, description/limitations, location context, process guidance and contact. Desktop can place a 320 px contact column beside the evaluation content. Mobile uses one flow and a compact safe-area-aware Ask/View action area that yields to the virtual keyboard and never covers the page end.

Media opens an accessible viewer with item count, caption/type, zoom where applicable and previous/next buttons; swipe is additional, never exclusive. On close return to the launching item. Unavailable/sold/withdrawn variants keep the same identity shell and a truthful next action while suppressing restricted facts. No unrelated replacement is visually substituted as the original property.

### L04 — Saved, comparison and matching

Public saved lists use familiar Listing cards with persistence scope. Compare supports two or three columns on desktop and a deliberate pair on narrow screens; a third can be switched in without losing selections. Align fact names, units and unknown states; highlight actual differences and current changes. A sticky identity/price band may preserve context without taking the entire viewport.

Staff matching adds hard constraints, preferences, explainable reasons and unresolved questions, then creates/updates Interests. Client Interests add permitted feedback, not a duplicate public catalogue. Public sharing exports approved facts only; no Case budgets, notes or participant identities.

### L05 — Forms, review and receipts

Keep simple inquiries in one short form. Larger owner/Brief/instruction tasks use named sections or a small meaningful step sequence with summary and editable answers. At desktop, form content normally stays within 640–720 px; supporting context may sit beside it. On mobile context moves before the relevant questions, not below Submit.

Labels remain visible. Optional/unknown values are real choices. Validation preserves input, focuses a linked summary and explains the correction. Submission has a stable logical identity; receipt is a separate durable state with exact accepted outcome, reference and next action. Error/unknown outcome is not styled like a successful receipt.

### L06 — Client Case overview and closeout

Lead with the Case purpose, named broker and current next action. Follow with a concise status, upcoming appointment, relevant property/Proposal and requested documents. Do not lead with CRM counts or a percentage that pretends to measure transaction certainty. A case switcher appears only for genuinely permitted multiple Cases.

Buyer/tenant emphasis is Brief and Interests; seller/landlord emphasis is instructions, preparation and exact listing preview. The timeline is curated client-visible business history. A closed Case replaces the action emphasis with outcome, remaining obligations and support/retention information; old due tasks do not remain falsely actionable.

### L07 — Today and commitments

Use a prioritized worklist: unassigned received requests, due promises, upcoming viewings, material corrections/reviews, delivery exceptions. Each row states what, why now, owner and next action. Headline counts link to the actual scoped queue. Avoid decorative KPI cards that add scanning cost without a decision.

Desktop can add a limited agenda/context column; mobile groups queues into sections with clear counts and a focused detail route. A no-work state is different from data-fetch failure. Overload displays aging/coverage and escalation, not celebratory empty-state copy. Completing a task requests its result/evidence when required.

### L08 — Inquiry and conversation

Desktop may use queue list plus selected thread/context and a collapsible details panel. On narrower screens, queue and thread are distinct routes with preserved selection and scroll. The thread header carries Case/Inquiry identity, audience, channel and ownership. Original inquiry context remains available even after qualification.

The composer explicitly switches Internal note versus Message. Show recipients and attachment audience before send. Draft, in-app availability and email-delivery state are separate. Unknown delivery exposes reconciliation, not another bright Send button. Incoming suspicious/ambiguous mail is visibly triage material, never trusted identity.

### L09 — Case and relationship workspace

Persistent identity header: purpose/type, stage/disposition, owner and next action. Under it, task sections for Brief/Interests, timeline/messages, appointments, proposals and documents. A wide inspector holds participant/contact/dependency context; mobile opens it as a route/section. Keep the active work dominant.

Party detail lists authorized relationships without implying access to every Case or document. A Property may link to several private Cases, but only authorized counts/records are shown. Closed/paused work keeps history and an explicit review/reopen process rather than silently reactivating on edit.

### L10 — Property, Listing and editorial workbench

One Property shell contains Listings/terms, Facts & sources, Media, BG copy, Locales, Review/Publish, Distribution/History. The selected sale/letting Listing remains unmistakable. A checklist separates required blockers from optional improvements and from review already completed.

At desktop, editable content and evidence/context can sit side by side. Mobile uses section routes with saved-state feedback and retained scroll. Save draft never publishes. Live-versus-working revision is visible; a material correction uses its own workflow. Editorial content reuses the workbench patterns without pretending guides have Property-specific commercial fields.

### L11 — Review, diff and consequential decision

Start with the precise subject/version, requested decision, reviewer scope and affected audience/destination. Wide view compares source/current/proposed material; narrow view stacks labeled sections with a change index. Protected fact changes appear before polished prose. Media, rights and location-disclosure consequences are part of the review.

Use one primary decision and clear alternatives such as Request changes or Reject. Missing prerequisites remain inspectable. A stale candidate invalidates the old decision control and provides a fresh diff. Executing/unknown/partial destination results become durable status views; they are not overlays that vanish with the review dialog.

### L12 — Calendar and Appointment

Desktop offers agenda/day/week with explicit proposed versus confirmed items. Mobile defaults to agenda; visual grid and drag are optional accelerators. Date/time forms can complete every operation. Show active display timezone and both localities where useful, with absolute date/time on the confirmation.

Appointment detail contains participants, host, Listing/Interest, access readiness, exact arrangement, resource conflicts and notification state. A reschedule shows old confirmed and proposed replacement distinctly. Private access codes/location are scoped; a calendar preview in a public page cannot expose them.

### L13 — Documents, uploads and evidence

Organize by purpose/request and review state rather than an unexplained file dump. Every item has type/name, version, requested purpose, audience, upload/scan/review status and allowed action. Desktop can show list plus safe preview; mobile opens a dedicated item view and preserves return context.

Upload progress separates transfer, sealing/verification, scanning and ready-for-review. Failures identify the item and recovery without claiming a document is accepted. Replacing creates a new version. Restricted documents do not leave thumbnails, filenames or cached previews in a broader view.

### L14 — Bounded service consultation

Reuse service entry, minimal request and an owned Case with next action. It may collect requested dates for a stay consultation or a general management question only where the service is truly offered. It must say what is requested and what remains for a human to assess.

No availability grid, reservation confirmation, dispatch board, payment button, rent ledger, owner statement or repair-completion promise. An urgent issue shows an appropriate operator-approved safety/contact message and clearly says the web request is not an emergency-response service. Unknown local emergency instructions must not be invented.

### L15 — Areas, guides, service and support reading

Readable content column with specific title, geographic/service scope, applicable review date and responsible source/reviewer where needed. Useful navigation, headings, related Listings and contextual contact follow actual reader questions. Long guides use an in-page contents list; legal/tax/process conclusions require the approved professional-review policy.

Maps and photography support the explanation and never replace text. Service-unavailable and locale-unavailable responses retain clear alternatives. Sandanski is inland. Do not use aspirational seaside imagery/copy to imply otherwise.

### L16 — Tables, reports, settings and Operations

Lead with the operational question or task, then filters, scoped data and one clear next action. Tables keep stable row identity, labeled sorting, explicit pagination and an accessible overflow region. Multi-select states exactly whether it covers the current page or all matching records. Narrow screens prioritize a task-specific summary and full row detail.

Reports show definitions, period/timezone, completeness and drill-down permissions. Settings use review/impact confirmation for consequential policy/access changes. Imports and recovery jobs have durable per-item outcomes and permitted retry. Release evidence shows scope, version, freshness, signer and blocked dependencies; no manual cosmetic override to green.

## 08. Public discovery and buyer flows

Each flow names the actor, entry, sequence, durable outcome, branches and proof. “Return” includes Back, refresh and direct-link entry where applicable. Shared S-states apply throughout.

### F01 — Arrive with an intention

**Actor/entry:** visitor from search, a shared link or direct home entry; P01, P15, P16 or P17. No authentication. The chosen locale and actual service coverage are known or offered explicitly.

1. Identify MS Realty, supported geography and the available Buy/Rent/Sell/Let tasks.
2. Choose an intent. Buy/Rent changes the search's transaction purpose; Sell/Let enters its actual consultation path, not the same generic lead modal.
3. Choose location or browse all supported locations. Do not require geolocation or a postal code before showing useful inventory.
4. Submit a small initial search or open a relevant service/area page. Pass explicit criteria to F02; preserve locale and entry intent.

**Branches:** unavailable locale copy offers a labeled approved-language switch; no inventory offers truthful search/contact guidance. A browser-language suggestion is dismissible and never forcibly redirects a returning user. Unsupported geography can request general advice only if a real staffed process exists.

**Exit/proof:** the visitor knows what service is offered and reaches the correct task without registration or a blocking pop-up. Source attribution is safe and minimal. AT01, AT03.

### F02 — Search, refine, map and recover

**Actor/entry:** visitor from F01, an area link, exact reference or saved criteria; P02–P04/P22. Committed search state is URL-safe and independent of optional AI/map availability.

1. Render the applied transaction purpose/location and an accurate count classification. Show current committed results or an honest loading state.
2. Open filters. Edit draft location/type/price/bedrooms/area/features. Display units, currency/period and unknown handling. OR applies within a facet; AND across facets.
3. Validate ranges. Apply the draft once; update committed URL/query identity and results. If preview count fails, label it unavailable while allowing a valid search.
4. Change sort or page/load more with stable identity. An older response must not replace the newer query. No silent relaxation of a hard constraint.
5. Enter map mode optionally. Pan/zoom proposes a new area; “Search this area” commits it. Selecting a marker highlights the matching permitted card. Approximate location remains approximate.
6. Open a Listing; Back restores criteria, selection/scroll and focus after relevant content exists. Changing locale preserves compatible structured criteria but reruns eligibility for that locale.

**Branches:** zero matches retains criteria and offers separate changes with explained trade-offs. Provider/query error is not zero results. Map failure leaves list, filters and contact intact. Inventory changing during pagination is deduplicated and may prompt refresh; do not claim a frozen snapshot. Exact-reference misses distinguish unavailable reference from permission-sensitive information without leaking drafts.

**Exit/proof:** suitable eligible results or a recoverable, explained no-result state. Test misspellings and approved location aliases/transliterations against expected inventory. AT02–AT07.

### F03 — Evaluate a property

**Actor/entry:** visitor from results, comparison, shared link or an exact legacy URL; P05/P06/P21.

1. Establish reference, location precision, purpose, current price/basis and availability before promotional prose.
2. Inspect authentic media, fact groups, area/room definitions, known charges and limitations. Unknown and not applicable are visibly different; no inferred feature fills a gap.
3. Open floor plan/media with captions and accessible controls, then return to the same place.
4. Read appropriate local/process guidance with its scope and review context. Ask about missing information without being forced to answer unrelated intake questions.
5. Save, compare, ask or request a viewing. Carry reference, source URL, locale and the observed revision into the next flow; the server rechecks current eligibility.

**Branches:** price/availability changed since the originating card prompts a clear current fact and reason to review. Unapproved translation offers an explicit source-language alternative, not hidden fallback prose. Restricted/sold/withdrawn content uses F09. A failed gallery does not prevent reading facts or contacting the agency.

**Exit/proof:** the user can explain the property's known facts and limitations and select an appropriate next step. No owner/private address/evidence leaks into source markup, metadata, map or viewer. AT04, AT05, AT21, AT27, AT28.

### F04 — Save, compare and decide together

**Actor/entry:** visitor or client from P05/results; P07–P09 and C05.

1. Save a Listing without an account. Show that this is saved on this device, or temporary if storage is unavailable.
2. Add two or three Listings to comparison; expose a clear selected count and remove action. Do not commandeer navigation with a large permanent overlay.
3. Compare aligned facts, known charges, availability and missing information. Show revised values and unavailable items; never silently substitute another Listing.
4. Create a public-facts share, or work in an existing authorized Case. Sharing public facts does not invite a collaborator or expose private comments.
5. Choose “Bring these saves to my account” on the public host. The explicit cross-host transfer in §20.3.1 carries only selected Listing IDs; the client host cannot read public-origin storage. After sign-in, review additions against existing personal server saves and confirm the merge. Adding a Listing to a Case is a separate scoped action creating/updating its unique Interest, not another Case per property.
6. Return to the creator's share-management state to inspect expiry or revoke a public link. The viewing token alone cannot manage the share. Lost anonymous creator access and already copied public facts have the limits described in P09.

**Branches:** withdrawn/locale-ineligible shared items show an unavailable placeholder without restricted facts; expired/revoked share offers public search. Interrupted sign-in retains the public selections; an expired import restarts from those selections without duplicating server saves. Conflicting collaborator feedback remains attributable rather than overwriting another person's view. Authentication does not automatically share a local note.

**Exit/proof:** selections persist to their declared scope; public shares contain only eligible public facts. AT08, AT09, AT15, AT16.

### F05 — Subscribe to useful search alerts

**Actor/entry:** visitor/client after committed search; P10/C13.

1. Review a human-readable snapshot of criteria, locale, email channel and daily digest default in the subscriber's timezone.
2. Enter or choose a contact route and explicitly opt in to this alert purpose. Marketing remains separate and unchecked by default.
3. Verify the route; show pending verification rather than “alerts active.” Verification links must not enroll a different purpose.
4. Present active subscription, criteria, frequency and pause/edit/unsubscribe controls. Changing criteria creates a reviewed new snapshot.
5. At send time, the system checks current opt-in and eligible Listing revision. Notification history distinguishes queued from observed delivery if exposed.

**Branches:** expired verification can be reissued safely; changed email needs fresh verification. Already queued work stops after opt-out. No new matches is not a subscription failure. A mail-provider outage is an owned staff exception, not a reason to forget the preference.

**Exit/proof:** verified purpose-specific subscription or a clear pending/inactive state, with a usable unsubscribe path. AT44, AT46–AT48.

### F06 — Ask a question or request a callback

**Actor/entry:** anonymous visitor from detail, comparison, guide or contact; P11/P12.

1. Show intent and relevant reference/criteria; allow correction. Ask the question, one reachable contact method, language and preferred contact arrangement. Name is optional unless needed for the specific next step.
2. Keep privacy information near submission; do not bundle optional marketing permission into acceptance of service contact.
3. Submit using the server-issued logical submission key and anonymous receipt session. The button locks duplicate local submissions but does not replace server idempotency.
4. After commit, show received reference and actual next staffed period/next action. Coverage queue owns the request even if email/AI is unavailable.
5. Broker triage continues through F18. An invitation to a private Case comes only when that private relationship is established; the receipt is not a client account.

**Branches:** field error preserves valid answers. Timeout checks the same logical operation. Same key/different payload is a conflict, not an amendment; deliberately changed intent creates a new identified submission. If status cannot be confirmed, keep unknown outcome and verified contact fallback. If cookies are blocked/lost, explain the receipt-recovery limitation without exposing requests by public reference. JavaScript-off form submission and POST/Redirect/GET remain usable.

**Exit/proof:** exactly one durable Inquiry for a logical accepted payload, or an honest not-accepted/unknown outcome. AT10–AT14.

### F07 — Request, agree, attend and change a viewing

**Actor/entry:** visitor/client from a Listing or Interest; P13/P14, C06, O08/O09.

1. Request preferred windows, format if supported, timezone, contact method and optional practical access needs. Explicitly say this is a request.
2. Broker/coordinator receives an owned scheduling task. Check current availability, host, property access, working hours, travel buffer, internal resources and external calendar/busy-period confirmation.
3. Propose one or more actual arrangements, showing full date/time/zone. Launch proposals do not hold exclusive resources: only the guarded staff confirmation/replacement command commits occupancy. Tell the client the proposed time remains subject to a final availability check; no tentative hold, countdown or implied reservation appears.
4. Client responds; authorized staff commits confirmation only after current resource checks. Show the committed arrangement and participant response separately.
5. Send versioned service/ICS notifications. The in-product Appointment remains available if an email fails. Meeting details and access instructions are disclosed only to authorized participants at the appropriate time.
6. After the viewing record attended/no-show/cancelled and relevant feedback/next action against the Interest.

**Change branch:** a reschedule request keeps the old confirmed arrangement visible and its resource interval occupied until a replacement is accepted and committed, unless explicitly cancelled. Show “Current confirmed” and “Proposed replacement” together. Another confirmation can take a previously proposed time; explain that it is no longer available, preserve the client's response and offer newly checked alternatives. Two concurrent confirmations can conflict; preserve the proposed input and offer current alternatives. DST gaps are rejected; repeated wall times require a deliberate offset choice. Cancellation explains whom it affects and produces a durable state, not merely a removed calendar tile.

**Exit/proof:** one truthful versioned arrangement or clear pending proposal, correct resource/notification handling and follow-up. No “instant booking” copy. AT29–AT33.

### F08 — Understand a place, service or cross-border process

**Actor/entry:** visitor from area/service/guide content; P15/P16.

1. Establish country/area, intended audience and what the content can and cannot answer.
2. Read source-supported local context and approved process guidance with review responsibility/date where relevant.
3. Explore eligible inventory through explicit criteria links, or ask a contextual question carrying the guide/topic into the inquiry.
4. When a professional conclusion is needed, explain the human role and next step without presenting software or translated copy as professional approval.

**Branches:** outdated material is reviewed/restricted according to policy; unsupported service is not offered through a deceptive CTA. Map/media failure preserves the reading task. A place with no active inventory can still have useful approved content, with honest alternatives.

**Exit/proof:** a better-informed next action, not a legal/tax/return guarantee. Sandanski remains inland; language changes preserve meaning. AT03, AT21, AT22.

### F09 — Recover from an old or unavailable Listing

**Actor/entry:** old bookmark, search-engine result or shared property; P21.

1. Resolve the exact legacy/reference mapping and truthful current public eligibility.
2. Render the approved retained/preservation, equivalent redirect or terminal-removal response. Do not redirect all failures to home or silently replace the subject.
3. Explain sold/let/withdrawn/unavailable at the safe granularity; remove inaccurate or restricted price/media rather than leaving a badge over them.
4. Offer an explicit fresh search, genuinely related eligible alternatives or a question about the prior reference.

**Branches:** locale unavailable is not property sold. Permission-sensitive records do not disclose internal reasons. Revoked media disappears from current views and origin access; external prior downloads cannot be recalled.

**Exit/proof:** the visitor knows the original property's actual state and has a legitimate next step; both domains match the reviewed crawl manifest. AT24–AT28, AT57, AT58.

## 09. Seller and landlord flows

### F10 — Request an assessment or representation consultation

**Actor/entry:** self-described owner/representative from Sell/Let; P17–P19, O03/O11.

1. Explain the real offered service and first human step without promising a valuation, sale price or ownership acceptance.
2. Collect purpose, broad location, type, self-declared relationship, contact route and optional useful notes. Offer unknown answers; do not demand identity/title documents to request a call.
3. Optional safe photos follow the upload contract. A failed photo does not block an otherwise valid consultation request unless genuinely required and explained.
4. Review the supplied summary and disclosure before submitting. Show a durable owner-intake receipt.
5. Broker reviews coverage, possible duplicate Property and actual authority. Create/link the seller/landlord Case and preserve self-declaration separately from assessed authority.

**Branches:** unsupported location is truthfully routed/declined; possible duplicate is reviewed rather than exposing another owner's record. Intake media never publishes automatically.

**Exit/proof:** owned seller consultation with minimal data and an honest next step. AT10–AT13, AT18, AT42.

### F11 — Agree scope, authority and Seller Instructions

**Actor/entry:** broker and specifically authorized seller/representative; C11/C12, O05/O11/O14.

1. Clarify representation scope, Property identity, relevant participants and needed evidence under the applicable professional process.
2. Record what authority was assessed, by whom and for what scope; unresolved title/legal questions remain explicit.
3. Prepare versioned instructions covering commercial terms, location privacy, media rights, representation and publication permission.
4. Share a purpose-bound review task with the correct client audience. The client sees what they are being asked to acknowledge and can request a change.
5. Record the exact decision and next preparation tasks. Staff publishing capability and locale/professional review remain separate gates.

**Branches:** changed price/authority/rights creates a new instruction version; earlier acknowledgment cannot carry forward invisibly. Sensitive document access is narrower than general Case access. Conflicting instructions stop the affected consequence and create an owned resolution task.

**Exit/proof:** an attributable scope-specific instruction, not presumed ownership or automatic public exposure. AT18, AT21–AT23, AT40.

### F12 — Preview marketing, request changes and follow progress

**Actor/entry:** seller/landlord from a broker-issued review task; C11/C12 and O16/O17/O33.

1. View the precise Listing revision: terms, facts, media order, public location precision and enabled locale(s).
2. Compare changes from the prior version and understand the scope of the requested acknowledgment. Unknown facts stay unknown in preview.
3. Acknowledge that version or request a specific correction. A client cannot edit the current public price directly.
4. Agency completes separate source/locale/publishing decisions and activates only an eligible manifest.
5. Show truthful preparation/publication/destination status and the next action. Marketing progress uses real observations, not invented views, valuations or “buyer interest” counters.

**Branches:** newer source makes an open preview stale; reload/diff before accepting. Publication queued/partially verified is not “live everywhere.” A credible material correction enters F31 immediately, with safe restriction before replacement review where necessary.

**Exit/proof:** correct client instruction and visible marketing status without bypassing staff authority. AT18, AT22–AT28.

## 10. Private client continuity flows

### F13 — Verify access, accept an invitation and return safely

**Actor/entry:** invited client/collaborator from an explicit link or client access route; C01/C02.

1. Enter the client authentication context and verify the intended email through the supported provider flow. Do not reveal private Case details to an unverified/wrong identity.
2. After verification show the valid invitation's safe inviter, purpose, scope, expiry and recipient. A scanner/GET preview never accepts it.
3. Explicitly accept by POST against the current recipient/scope. Already accepted invitations route to currently permitted work; revoked/expired ones do not grant access.
4. Land at the permitted Case/next task. On later visits authenticate/refresh grants and restore a safe authorized return destination.
5. Sign out clears private local state. History restoration and visibility return reauthorize before revealing protected information.

**Branches:** wrong account offers switching without private context; reissue invalidates old invitation; provider outage offers safe agency contact, not a homegrown password bypass. Staff context remains distinct even for the same person. After reauthentication, a pending send/approval requires fresh review, not automatic execution.

**Exit/proof:** correct person, correct application and explicit record grants. AT16, AT36–AT41.

#### Staff variant for F13 — Sign in, recover access and reauthorize

**Actor/entry:** invited or returning staff member, on the staff host; O23 access variant. This is not the client's email-verification journey. Provider pages and application-owned states must both appear in the design flow; do not draw a custom password or MFA implementation.

1. Application-owned entry identifies MS Realty staff access, the destination host/environment and a safe return task. Staff invitation previews do not accept membership or expose operational records. Continue enters the dedicated staff WorkOS application; client identity/cookies never substitute.
2. Provider-hosted authentication uses the configured staff method and requires TOTP. Social/SSO buttons are not enabled at launch. First use includes hosted factor enrollment and a successful challenge; application entry remains blocked until the required assurance, staff organization and active local membership are all verified.
3. Application-owned invitation acceptance is explicit and recipient-bound; use the architecture's 72-hour invitation expiry, safe wrong-account handling and reissue-invalidates-old rule. An authenticated identity without a valid invitation/current membership receives a non-enumerating access-denied screen with sign-out/switch and verified support, not an empty operational dashboard.
4. Return to the allowed task with current grants. Enforce staff 12-hour absolute and 30-minute idle limits locally. Warn before a known expiry when possible, preserve only permitted draft state, and never promise the warning will always run in a suspended tab.
5. Access grants, exports, production controls and other sensitive actions require authentication freshness within five minutes. Show the reason and expected return, complete the supported provider reauthentication, recheck local authority, then show the current action/diff again. The user explicitly recommits; successful login does not replay the pending operation.
6. “Lost access to your authenticator?” opens an application-owned explanation and verified agency support route, followed only by the configured provider's authorized recovery process. Do not promise recovery codes or a self-service reset unless that actual provider configuration supports and passes them. The operational recovery runbook verifies identity, audits authorized factor reset/re-enrollment, revokes affected sessions and restores access only after MFA and local membership checks; test the actual configured path before release. Recovery remains a visible blocked state until completed, with owned work transferred through normal coverage rather than a login bypass.

**Required branches:** enrollment abandoned/failed, incorrect or expired TOTP with safe retry/rate limit, provider unavailable, expired/revoked invitation, wrong staff organization, client-context callback, missing/suspended/revoked membership, lost factor, session expiry with a draft, cancelled reauthentication, and permission revoked during step-up. Credential/factor errors belong to the hosted provider; application membership, return-context and business-action outcomes belong to MS Realty. The boundary must not duplicate credentials or leak whether another staff account exists.

**Exit/proof:** actual invited/returning staff completes the qualified provider flow and local checks; denied/recovering staff cannot enter; sensitive action requires fresh review after reauthentication. AT36–AT41 and O23/O24. Provider integration tests—not mock screens—establish the enrollment/challenge/recovery behavior.

### F14 — Understand progress and complete the next action

**Actor/entry:** authorized client returning to one or more Cases; C03/C04/C05/C11/C16.

1. Select a permitted Case if necessary; do not merge unrelated buyer/seller roles into one ambiguous dashboard.
2. Understand purpose, broker, stage/disposition and the highest-priority actual next action.
3. Open the related Brief, Interest, Appointment, Proposal, message or document task in context.
4. Submit the permitted response; receive a durable outcome and updated next step. The overview derives progress from current business states, not optimistic local counters.
5. Return to overview with completed task reflected and remaining work visible.

**Branches:** waiting explains who/what/when; paused explains the review condition; no next task offers legitimate contact rather than fabricated urgency. A Brief change becomes a proposed revision/acknowledgment and does not silently rewrite active terms. Closed Cases explain outcome/remaining obligations.

**Exit/proof:** the client can identify responsibility and complete the intended action without retelling context. AT15–AT18, AT34, AT35.

### F15 — Exchange, replace and review documents

**Actor/entry:** permitted client responding to a purpose-bound request or staff evidence task; C08/C09/O20.

1. Show requested purpose, needed file classes, size limits, audience, why needed and acceptable alternatives. Do not request sensitive documents at casual browsing stages.
2. Select through a labeled file chooser or drop zone. Per-file UI shows selected, transferring, sealing/verifying and scanning phases.
3. Server seals immutable bytes before checking/scanning. Only the sealed verified version can become ready for the scoped human review.
4. Reviewer records named review purpose, result and any replacement request. A clean malware scan never displays “legally verified.”
5. The client can see the permitted outcome, replace with a new version or download through currently authorized access.

**Branches:** unsafe/oversize/wrong-type/unreadable/stale-scan stays quarantined and gives safe specific recovery. Leaving during upload does not promise background completion; reconnect reconciles observed state. Revocation removes future access; already downloaded bytes cannot be erased. A reused upload URL cannot change scanned bytes.

**Exit/proof:** purpose-bound immutable evidence, correct audience and truthful processing/review status. AT39–AT43, AT45.

### F16 — Review exact terms and coordinate a decision

**Actor/entry:** authorized participant on a Proposal task; C10/O19.

1. Identify parties, Property/Listing, proposal version, amount/currency/period, conditions, expiry and professional-process context.
2. Read the meaningful changes from the previously reviewed proposal. The primary CTA names a request/decision for the next step, not a legal signature or completed sale.
3. Ask, decline, propose a change or record the permitted exact-version decision. Consequences and audience are visible before submission.
4. Staff coordinates responses and dependencies; a counterproposal creates a new immutable revision.
5. Agreement enters coordination with real next actions. Completion is a later separate evidence-backed workflow.

**Branches:** expired, withdrawn or superseded version cannot be accepted. Concurrent term change presents current diff and preserves an unsent note. Unknown command outcome reconciles the same Operation. Other buyer Cases see no private negotiations.

**Exit/proof:** attributable versioned decisions without legal/completion overclaim. AT34, AT35, AT40, AT46, AT47.

### F17 — Converse without losing the Case

**Actor/entry:** client/broker in C07/O02/O05, or application email reply.

1. Show Case context, actual recipients, channel and original conversation. Keep internal notes separate.
2. Draft text and add only audience-compatible approved attachments. AI suggestions are visibly drafts and require human review.
3. Review recipients/attachments and send once. Persist in-app message acceptance separately from outbound email notification status.
4. Show queued/provider accepted/delivered/failed/unknown only from observed events. Incoming email is correlated but treated as untrusted until safely matched.
5. Broker records the next commitment where the conversation creates one. Phone/WhatsApp handoffs can produce truthful manual summaries, not fabricated synchronized transcripts.

**Branches:** suspected spoofing/ambiguous thread reaches triage; unsupported attachment is quarantined. Provider timeout suspends blind resend. Editing after approval creates a new revision. A recipient removal rechecks pending delivery eligibility.

**Exit/proof:** durable audience-correct conversation and accountable next action, not a misleading “sent” checkmark. AT40, AT44, AT46–AT49, AT51–AT53.

## 11. Agency operating flows

### F18 — Triage and assign an inbound Inquiry

**Actor/entry:** coverage broker/coordinator on O01–O03.

1. See received intent, language/channel, original property/criteria snapshot, age in staffed time, source and current coverage owner.
2. Check safe duplicate/Party/Case candidates without automatically merging similar people. Original submissions remain attributable.
3. Accept assignment or transfer through the authorized coverage process. Record a useful first response and follow-up commitment.
4. Link to an existing Case, create an appropriately typed Case after qualification, or resolve without Case with a truthful reason.
5. Handle unreachable contact, unsupported service, suspected spam or duplicate candidate explicitly; none is silent deletion.

**Branches:** auto-receipt does not count as useful human response. Unassigned work remains owned by coverage and escalates under actual staffed hours. Mail outage leaves intake visible and an owned exception. Role/locale capacity affects assignment without discriminatory qualification scoring.

**Exit/proof:** no accepted request is orphaned, original context survives and next responsibility is clear. Initial internal targets are assignment within one staffed hour and useful response within four; public guarantees require actual approved coverage. AT12–AT17.

### F19 — Work Today and hand over coverage

**Actor/entry:** broker/manager at O01/O18/O23.

1. Review prioritized queues with reason/owner/due condition, not an unexplained aggregate score.
2. Open work in context; complete with actual result/evidence, defer with a waiting condition/review date, or escalate explicitly.
3. Before absence/handover, inspect open commitments, appointments, messages, restricted documents and outstanding decisions.
4. Select a permitted receiving broker; show the access/ownership impact. The recipient accepts, or management assigns coverage for absence.
5. Confirm durable transfer and retained commitments. Revoking staff cannot leave active work unowned.

**Branches:** recipient lacks capability or is absent → manager/coverage route; concurrent completion → refresh without duplicating task; provider failure → exception remains visible. Do not interpret “mark done” as delivery if external work is still unknown.

**Exit/proof:** accountable ownership survives interruption and staff changes. AT14, AT17, AT40, AT51.

### F20 — Progress a Case with a dependable next action

**Actor/entry:** broker on O04/O05.

1. Review purpose, participants, Brief, current stage/disposition and active Interests.
2. Perform the relevant task in context; update stage only when its actual prerequisites are met.
3. Record one accountable next action or explicit waiting dependency and review date. Link appointments/proposals/documents to the relevant Interest where applicable.
4. Pause with reason and review condition, or close with outcome and disposition of every commitment.
5. If reopening, record reason/new owner/next action without deleting closeout history.

**Branches:** multiple Interests can progress differently; declining one preserves others. A new Brief/Listing revision flags related stale assumptions without rewriting agreements. Completion needs evidence and remaining-obligation handling; failed/withdrawn transactions must not mark the Property sold.

**Exit/proof:** useful customer outcome and durable continuity, not just a dragged CRM column. AT15–AT19, AT34, AT35.

### F21 — Match inventory to agreed requirements

**Actor/entry:** broker from Brief/Case; O07 and C05.

1. Separate hard constraints, preferences and unanswered questions. Show source/acknowledgment of the Brief.
2. Query eligible inventory using explicit criteria. Explain known matches, trade-offs and unknown facts; do not invent a percentage fit score.
3. Review candidates individually. Relax a hard condition only as an explicit proposed alternative with reason and client acknowledgment where needed.
4. Add/update unique Interests, prepare a scoped shortlist and share permitted content through the Case or public-facts mechanism.
5. Collect attributable feedback and refine requirements through a new Brief revision when needed.

**Branches:** no matches prompts specific discussion rather than demographic proxies or automatic budget increases. Withdrawn/changed candidates remain in history with current safe state. Private buyer information never enters public share URLs or external search prompts by default.

**Exit/proof:** an explainable shortlist and separate Interest outcomes attached to one Case. AT04–AT09, AT15, AT16.

### F22 — Coordinate calendar, access and itinerary

**Actor/entry:** broker/coordinator from Interest, request or Calendar; O08/O09.

1. Inspect agenda and existing internal resource intervals; record/check external busy periods explicitly.
2. Choose host, Property/Interest, participants, duration, timezone, working hours, travel buffer and access arrangement.
3. Resolve confirmation-required availability and access blockers before committing. Preview overlapping resources and communicate realistic alternatives.
4. Confirm through the transactional command; show committed version and notification state. A second concurrent operator may receive a conflict, not another confirmation.
5. Maintain itinerary and private logistics with scoped disclosure; then completion/no-show and follow-up.

**Branches:** drag scheduling is only an accelerator over the full accessible form. Rescheduling preserves old confirmation under F07. No automatic Google/Microsoft sync is implied; the UI labels the manual external-busy check and its time.

**Exit/proof:** one real arrangement with resource integrity, correct timezone and observable notifications. AT29–AT33.

### F23 — Prepare Property, Listing, facts and media

**Actor/entry:** broker/editor from seller Case/import/Inventory; O10–O14.

1. Resolve Property identity and duplicate candidates. Create/select the correct sale/letting Listing without duplicating the physical asset.
2. Enter typed facts with source, units/basis and unknown/conflict state. Keep protected reference/source URL intact.
3. Record commercial instructions, disclosure precision and media rights. Exact private location is separate from public position.
4. Upload/process/review media and order stable MediaRelations; hidden or paginated relations remain in the authoritative order.
5. Draft BG copy using the supported facts. The readiness checklist explains required blockers, review scope and optional enhancements.
6. Save with revision guard and submit an exact candidate for source/locale/publishing work.

**Branches:** conflicting sources need a decision, not a guessed average. Concurrent edits preserve local input and offer field-level reapply. Reusing media retains rights/identity but placement is a separate relation. Import/AI output remains candidate material. Working draft edits alone do not take a correct live revision offline.

**Exit/proof:** reviewable exact candidate with provenance, safe media and known limitations. AT18–AT23, AT28, AT42, AT55.

### F24 — Translate, review, publish and withdraw

**Actor/entry:** translator/reviewer/publisher from O15–O17.

1. Select a BG source revision and target locale; expose protected facts, terminology and source/draft comparison.
2. Draft manually or use the permitted AI task. Reviewer checks language/meaning and records scope-specific approval bound to that source.
3. Publisher reviews the complete manifest: facts, terms, media/rights, location disclosure, locale, instructions and required professional-review evidence.
4. Activate only if current eligibility/authority still holds. Switch the public pointer and read model transactionally; show local activation separately from any destination verification.
5. Inspect current public representation and controlled destination outcomes. Manual external portals remain named manual tasks, not supported auto-connectors.
6. Restrict/withdraw deliberately when needed. Incremented generation prevents delayed work resurrecting old content; withdrawal never waits for a replacement translation.

**Branches:** source changed while reviewing → stale candidate and fresh diff; translation approval cannot approve facts/publishing/legal claims. Partial/unknown destination outcome remains an owned exception. Same-person approvals are labeled honestly. No scheduler, raw CRUD or AI UI may supply a bypass Publish button.

**Exit/proof:** exact human-approved eligible public content or an explicit restricted/withdrawn state across current local representations. AT21–AT28, AT50, AT51.

### F25 — Manage service quality and integration exceptions

**Actor/entry:** manager/operator from O22/O25 and Today.

1. Choose the operational question: unowned work, useful response time, overdue commitments, freshness, completed viewings, failed delivery or recovery health.
2. Read metric definition, period/timezone, scope and completeness; drill into authorized underlying records.
3. Open an exception with logical operation, affected people/records, source revision, attempts, observed outcome and owner.
4. Reconcile current external state or perform the permitted retry under the same logical identity. Unknown consequences cannot be resolved by blindly replaying.
5. Record resolution evidence or a waiting dependency; return work to the proper queue without losing its original age/history.

**Branches:** “connected” is not proof of delivery; unavailable telemetry is not zero failures. Read-back unavailable requires owned human verification or safe suspension. AI budget exhaustion disables assistance, not accepted inquiries.

**Exit/proof:** understandable service performance and actionable exception resolution. AT46–AT51, AT62–AT67.

## 12. Long-term rental and bounded adjacent services

### F26 — Complete long-term renting/letting brokerage

**Actor/entry:** tenant or landlord and agency team; shared public/Case/property/proposal screens with rental vocabulary.

1. Search or prepare a long-term rental Listing with explicit rent currency/period, known charges/deposit, availability date and relevant restrictions supported by approved source.
2. Agree tenant requirements or landlord representation through the ordinary Case/Brief/Instructions flow.
3. Evaluate Interests and arrange viewings through the same resource-aware process.
4. Request application/evidence only at the appropriate agreed stage under approved country/service policy. No browsing-stage identity collection, opaque tenant score or discriminatory inference.
5. Coordinate versioned terms and human professional steps, then record actual outcome/handover and remaining obligations.

**Branches:** missing charges are unknown, not zero; monthly/annual/nightly are never mixed. A letting outcome may update Listing availability but does not activate ongoing management or accounting. Client money collection and automated eligibility decisions are excluded.

**Exit/proof:** complete brokerage continuity using the same authority model, with correct rental semantics. AT04, AT15, AT18, AT21, AT29–AT35, AT40.

### F27 — Request short-stay advice or a quote

**Actor/entry:** visitor only where this staffed service is approved; P23 and a bounded service Case.

1. Read the actual consultation/coordination scope and inquiry-only explanation.
2. Supply requested dates, party needs at minimal necessary granularity, location and contact route. These are preferences, not live inventory reservations.
3. Submit a durable request and receive an owned next step.
4. Staff records human correspondence/quoted information and its scope/expiry without presenting a system-issued reservation or payment confirmation.

**Branches:** unavailable service is hidden from navigation and answered truthfully on existing routes. Date changes amend the consultation context explicitly. No room calendar, guest-account hotel module, instant booking, payment capture or guaranteed availability is designed.

**Exit/proof:** accountable consultation only. Earlier F27 reservation semantics are retired. Test that no copy/CTA/receipt implies a booking. AT10–AT14 and scope acceptance.

### F28 — Request property-management consultation or referral

**Actor/entry:** visitor/client only where the agency actually offers this bounded service; C14/O29/O30 through L14.

1. Understand what the agency will assess or refer, and what is not an emergency or guaranteed-response service.
2. Describe the request, property relationship, preferred contact and optional safe evidence. Do not infer ownership or contractor authority.
3. Receive a durable reference and named next action; staff manually coordinates the permitted consultation/referral.
4. Close with the truthful service outcome and remaining follow-up, not a generated repair-completion certificate or financial statement.

**Branches:** possible danger displays approved immediate-contact guidance without implying this form summons emergency help. Costs/repairs/provider appointments remain human coordination unless later scope explicitly authorizes a module. C15/O31 financial statements and maintenance lifecycle states are not release UI.

**Exit/proof:** a bounded, staffed request with no accidental property-management platform promise. AT10–AT14, AT18, AT40 and scope acceptance.

## 13. Assistance, privacy, correction and data-maintenance flows

### F29 — Use draft assistance without transferring authority

**Actor/entry:** authorized staff in extraction, translation or Case/reply work; O32 within its owning screen.

1. Select the task and permitted source material; show included scope and excluded sensitive material.
2. Request generation. Show generating/failed/budget-unavailable state while preserving manual work; do not force the user into a separate chat application.
3. Inspect proposed fields/text with source pointers, missing/conflicting facts and protected-field differences. Avoid uncalibrated confidence percentages.
4. Accept selected draft content, edit or reject. Recheck source revision and actor authority before applying; stale output needs regeneration/diff.
5. Continue through ordinary human review/send/publish commands. Accepting a draft never performs those effects.

**Branches:** malformed or fabricated source references are rejected; prompt instructions inside documents are data, not commands. Provider refusal/outage leaves manual completion. No general public chatbot; optional natural-language search interpretation is a separately gated filter proposal, visibly editable.

**Exit/proof:** useful attributable draft and measurable correction effort, with zero unauthorized effect. AT51–AT54.

### F30 — Manage preferences, access and personal data

**Actor/entry:** client/subscriber/privacy operator; P10/P24, C13/C17/C18, O23/O26.

1. Distinguish service contact, saved-search alerts, marketing and account/access settings. Show current verified routes and purpose-specific choices.
2. Pause/unsubscribe or change contact details; verify a new route where needed and recheck pending jobs against current eligibility.
3. Inspect safe participant scope and request an invitation/removal; authorized staff handles grants. Revocation blocks subsequent requests, not retroactive deletion of downloads.
4. Submit correction/export/deletion request with receipt, safe identity verification, scope and responsible operator.
5. Operator records policy/hold disposition, progress and completion; exports exclude other parties and use reauthenticated private delivery.

**Branches:** a deletion request is not an immediate “erase everything” button; restrictions/holds are explained without invented legal deadlines. Restores replay current safety decisions or remain closed. Sign-out/identity switch clears private state and prevents stale async callbacks revealing another user's data.

**Exit/proof:** genuine purpose/access control and owned privacy work. AT36–AT45, AT51, AT64.

### F31 — Correct a material fact already in circulation

**Actor/entry:** broker/publisher from credible seller/client report, review or source conflict; O33 plus affected public/client views.

1. Record the disputed/changed fact, source, affected Property/Listing and urgency. Distinguish an ordinary working draft from an authoritative correction/restriction event.
2. Compute affected publication locales, prose, media, comparisons, Interests, proposals, viewings, alerts and destinations. Show the impact to the authorized operator.
3. Atomically restrict inaccurate affected public pointers and increment generation before preparing replacement. Keep safe status/reference where allowed; do not insert a new price into contradictory old prose.
4. Prepare corrected source and affected locale revisions; review and activate the exact eligible replacement. Unaffected approved presentations stay only when dependency analysis proves that they are unaffected.
5. Reconcile current local public surfaces, controlled media/purge, manual destinations and affected client commitments. Notifications remain reviewed messages.
6. Close only when each affected item has verified correction or an explicit unresolved disposition with owner. Previously downloaded PDFs/photos cannot be recalled.

**Branches:** delayed old job is cancelled by generation; uncertain external removal stays an exception. A stale open client Proposal cannot be accepted as if nothing changed. No mass-republish button may overwrite the review boundary.

**Exit/proof:** truthful current exposure and owned downstream consequences. AT23–AT28, AT34, AT47, AT50, AT51.

### F32 — Import, merge and batch-edit without hidden damage

**Actor/entry:** authorized staff at O27/O28 with permitted source data.

1. Select source/batch and declare mapping, units and authorized scope. Stage without changing live records.
2. Inspect per-row create/update/no-change/conflict results, protected-field differences, media gaps and duplicate candidates.
3. Choose the exact accepted subset. Bulk selection states current page versus all matches; material decisions retain their own review requirements.
4. Execute idempotently and observe durable per-item outcomes. Interrupted processing resumes safely; retry does not duplicate imported identities or external effects.
5. Review remaining failures and reconciliation. A Party/Property merge previews relationship/audience impact, retains aliases and supports audited split/reversal without enlarging grants.

**Branches:** dry run never publishes or changes approval; imported facts remain supplied facts, not verified truth. Unsupported files/URLs are blocked safely. Concurrent edits produce conflicts, not overwrite. Partial completion shows exactly what changed and what did not; “cancel” cannot undo committed rows without an explicit reversal operation.

**Exit/proof:** understandable bounded batch result with traceable identities and preserved authority. AT19–AT23, AT42, AT50, AT55, AT56.

## 14. Public screen contracts

Every contract below requires a default, compact and relevant RTL composition; the relevant S-states; semantic/focus behavior; real view-model binding; and flow acceptance. Shared layout recipes eliminate duplicated design rules, not task coverage. Screen IDs remain stable even when the implementation combines them into one route.

### P01 — Home and intent entry

**Layout/flows:** L01; F01. **Order:** identity/navigation → specific service/area proposition → Buy/Rent search → Sell/Let entry → selected real inventory → approved local/service evidence → actual contact/footer. Search inputs are transaction purpose, location and optional initial budget; advanced criteria belong in results.

The first meaningful action is search or a genuine consultation, not accepting cookies, opening chat or creating an account. Language selection is reachable without dominating the header. A returning visitor may resume committed search/saved items with a clear device-local label.

**Draw:** first visit, return, no active inventory, missing optional media, unoffered service, dismissed locale suggestion, compact menu and Hebrew header. Empty inventory must not remove the contact/owner path or create fake listings.

### P02 — Results

**Layout/flows:** L02; F02/F03. **Order:** criteria summary → count/type and sort → applied chips → result cards/list → pagination/load-more status → contextual help. Each card includes image, title/reference, public location, price/basis, relevant typed facts, availability and save/compare controls.

Open through a real link; separate buttons must not be nested inside a whole-card button. Counts, cards and map use the same query/locale eligibility. Initial page is 24 items, server maximum 60. Load more preserves focus/scroll and announces added count; a pagination fallback works without JavaScript.

**Draw:** initial, updating with prior results marked, zero, partial failure, changed inventory, withdrawn item, restored Back position and long translated title. Expose criteria rather than hiding important filters behind unlabeled icons.

### P03 — Filter editor

**Layout/flows:** L02/L05; F02. **Order:** purpose/location → price with currency/period → type → bedrooms → area/basis → confirmed features → other meaningful criteria. Draft and committed selections are distinct. Display minimum/maximum text fields even if sliders are offered.

Apply commits once. Clear resets the draft with visible scope; cancel/close retains committed results and discards uncommitted filter changes after a clear rule, without a destructive-warning ritual for ordinary filters. A count preview is optional feedback, not permission to submit. Searchable location controls expose an ordinary select/text fallback where needed.

**Draw:** desktop rail, modal compact sheet, dirty draft, invalid range, long selected labels, unknown preview count, keyboard open, zero-result draft and RTL ordering. No silent hard-filter relaxation or missing-feature-as-false behavior.

### P04 — Map results

**Layout/flows:** L02; F02. **Order:** same committed criteria → list/map switch → map with attribution and area action → selected card/list equivalent. Marker labels reflect supported purpose/price basis; cluster counts never disclose unapproved inventory.

Pan/zoom leaves committed criteria unchanged until Search this area. Selected marker and card have one identity; focus does not jump between panes merely on pointer hover. The map receives approved public coordinates only. A location-permission prompt appears only after an explicit geolocation action; location is not required to search.

**Draw:** exact versus approximate public position, cluster, selected item, overlapping markers, pending area, blocked tiles, slow provider and denied geolocation. In compact mode the list is one tap away and preserves criteria; do not make the map the only way to find a Listing.

### P05 — Property detail

**Layout/flows:** L03; F03/F06/F07. **Order:** reference/title, public locality, price and basis, availability/confirmation → gallery → key facts → meaningful description/limitations → location/context → process/help/contact. Put necessary qualifications beside the fact they qualify.

Primary actions are Ask and Request viewing; Save/Compare are secondary. Their requests carry the observed reference/revision but recheck current data. Display bedrooms versus rooms and building/usable/land area distinctly. Price-on-request is a deliberate approved disclosure, never a missing value disguised as zero. No fabricated mortgage/return calculator or “verified property” badge.

**Draw:** available, confirmation required, negotiating/reserved basis, missing facts, changed price since entry, no approved locale, media failure and long title. Restricted/unavailable uses P21, preserving safe identity rather than leaving old facts beneath an overlay.

### P06 — Media viewer

**Layout/flows:** L03/L13; F03. **Order:** labeled close → current image/plan/video → caption/type/modification disclosure → item index and navigation. Open the clicked item, not always item one. Keep originals' private metadata out of browser data.

Allow buttons/keyboard for previous/next and zoom controls where useful; swipe/pinch supplement them. Fit entire floor plans by default with zoom/pan and a useful text alternative. Pause media on close, never autoplay sound. An external approved tour is clearly identified; any embed requires its own safe provider/consent/performance policy before enablement.

**Draw:** image loading, broken item with next item usable, portrait/landscape, plan, video/tour unavailable, maximum zoom, compact landscape, RTL controls and return focus. Viewer Back/close cannot accidentally navigate away twice.

### P07 — Comparison

**Layout/flows:** L04; F04. **Order:** selected identities → price/availability → aligned decision facts → known charges/limitations → next actions. Two/three desktop columns; explicit pair selection on compact screens. Keep row headings visible and associated semantically with each value.

Replace/remove controls name the Listing. Show unknown/not applicable/withheld-safe-public status rather than blank cells. Highlight actual differences, not arbitrary “best” badges. Changed facts carry current values and an explained revision notice. Keep requests context-specific when asking about multiple Listings.

**Draw:** fewer than two selections with add guidance, two/three complete, long facts, unknown data, one withdrawn item, changed price and narrow pair switching. No total-score ranking, amount truncation or private notes in public shares.

### P08 — Saved properties

**Layout/flows:** L04; F04. **Order:** persistence scope → saved list → compare/share actions → available next step. Distinguish device-local, temporary-memory, syncing, server-confirmed and failed persistence.

Remove gives a genuine local undo where possible. Existing invited clients can sign in and merge saves; do not invent open self-service Case signup. Anonymous saving stays useful. A merge includes server items and avoids duplicates; it never attaches private notes to a shared Case automatically.

Cross-host import explicitly previews selected items and uses §20.3.1. Retain device selections until authoritative acknowledgment; completing import does not clear them automatically. This public page manages only public-origin creator-session shares. Account-owned saves/shares are managed on the client host in C05, never through private cookies on the public host.

**Draw:** empty-new, device-local list, storage blocked, transfer pending/expired, local/server merge review, failed sync, unavailable saved Listing, all removed and undo; creator links with expiry and revoke result. The user must understand which device/account owns these selections.

### P09 — Shared shortlist

**Layout/flows:** L04; F04. **Order:** neutral shortlist title → eligible public Listings → compare/open/contact. No sharer's private identity, Case budget or comments is inferred from the token.

Creation reviews exactly which public facts will be shared and produces an unguessable revocable link under an authorized creator/receipt scope. Native share/copy is a convenience with a text fallback. Private collaboration uses C02/C05, not a secret “private mode” of this public page.

**Creator management variant:** after creation show “Public link,” included Listing identities, expiry, Copy link and “Revoke this link.” Launch shares expire seven days after creation; show the actual date/time and zone. Renewing creates a new link only after explicit review; it does not revive a revoked token. The return path is a “Shared links” section in P08 for this public browser's creator session, or the account-saves variant of C05 for an authenticated client creator. The management authority is the original host-only creator session or authenticated creator, never the recipient's viewing token. A generic share-management ID is not sufficient permission.

Revoke explains that future access will stop while public information already copied cannot be recalled. After server acknowledgment, replace the link actions with “Revoked” and its time. A timeout is “Checking revocation,” reconciled using the same operation; it is not immediate success. Current eligibility/revocation is checked on every recipient access, regardless of previously cached list content.

If an anonymous creator loses the session, explain that the viewing link cannot recover management: it expires at the stated time, and a new link does not disable the old one. Offer the agency's report/request-review route for urgent concerns; authorized staff can review and revoke through normal audited authority, without granting the reporter creator access. Do not invent account recovery or request personal data merely to preserve anonymous sharing.

**Draw:** creation review, creator management, active/expiring/revoking/unknown/revoked, lost creator session; recipient valid public list, some/all unavailable, expired/revoked token and unavailable locale. A cached or previously copied link must not bypass current public eligibility. Explain revocation only at a safe generic level to recipients; show no creator identity.

### P10 — Saved-search subscription

**Layout/flows:** L05; F05/F30. **Order:** criteria summary → chosen language/timezone/daily digest → email and purpose opt-in → verification → status/preferences. Keep the alert separate from service contact and marketing.

Editing shows the old/new criteria; unsubscribe and pause are prominent legitimate actions, not a dark-pattern retention flow. Verification links establish the specific contact/purpose, never Case access. Manage routes require safe token/session verification and do not leak the subscriber's address to link previews.

**Draw:** new, verification pending/expired, active, paused, edited, email changed, unsubscribed, limit/provider issue and no-match period. “Subscribed” is not displayed before verification succeeds.

### P11 — Inquiry or callback form

**Layout/flows:** L05; F06. **Order:** selected intent/reference/context → question or callback preference → one contact method → language/contact timing → privacy explanation → Send inquiry. Show optional fields as optional; do not ask for passport, income or a full address.

Server-rendered logical submission identity and receipt session support no-JavaScript submission. Validate email/phone reasonably without rejecting international names or demanding both routes. Callback time is a preference in an explicit timezone, not an appointment guarantee.

**Draw:** blank, property-prefilled, guide-prefilled, callback, field errors, contact-method switch, submitting, offline and unknown outcome. Keep text after failure; review a changed payload rather than reusing the original logical key silently.

### P12 — Inquiry receipt and reconciliation

**Layout/flows:** L05; F06. **Order:** exact result → reference → safe accepted intent summary → actual next staffed step → permitted help. The public reference alone reveals no private submission body/contact.

Accepted, still checking, not accepted and unknown outcome use distinct headings. An email receipt is supplementary. A duplicated browser retry returns the same logical receipt; an amendment is a new reviewed request or later authorized Case message, not mutation through an enumerable reference URL.

**Draw:** accepted with mail pending, duplicate reconciled, still checking, session lost, unavailable status, no committed request and out-of-hours next step. Never display success-looking art before acceptance is known.

### P13 — Viewing request

**Layout/flows:** L05/L12; F07. **Order:** Listing/reference/availability → requested format/windows → timezone → reachable contact/language → optional practical access note → Request viewing.

Use ordinary date/time entry plus optional calendar assistance. Show that preferences require broker confirmation. Do not expose real-time slots or “Book now” because the launch calendar does not guarantee external availability. If current availability requires confirmation, keep the inquiry path truthful.

**Draw:** no preference, one/multiple windows, past/invalid dates, timezone difference, optional note privacy, known unavailable property, submitting/unknown and received request. Private meeting addresses/access codes do not appear here.

### P14 — Verified viewing status

**Layout/flows:** L12; F07. P14 is retained as the entry contract for a C06 variant hosted unconditionally on `my.makler-realty.com`. The public host may initiate a safe allowlisted authentication handoff, but renders no private arrangement, meeting address or participant data and receives no private session cookie. Client authentication plus a current Appointment/Case grant is mandatory; there is no third “verified public” identity context.

**Order:** arrangement status → Listing safe identity → full date/time/zone → authorized host/meeting details → participant response → propose change/cancel/contact. Show current confirmed and proposed replacement separately. Adding ICS to a calendar does not register attendance.

**Draw:** awaiting proposal, proposed, confirmed, reschedule pending, old arrangement retained, cancelled, access expired and safe login handoff. Never expose access codes through email-link preview or a public ID.

### P15 — Area index and detail

**Layout/flows:** L15; F01/F08. Index helps choose actual supported geography; detail answers practical place questions with approved text/media and a relevant inventory link.

**Order:** area identity and scope → useful local facts → transport/lifestyle/process context where supported → currently eligible inventory → contact/related guidance. Distinguish locality from broader region and property marketing claims. Map is optional and has an equivalent textual location hierarchy.

**Draw:** index, detail, no inventory, long guide, absent approved translation, unavailable map and reviewed-content warning/restriction. No invented proximity, investment performance, medical benefit or seaside characterization.

### P16 — Service and guidance content

**Layout/flows:** L15; F08/F10. **Order:** service/audience/country → what the agency does → what the client supplies → actual steps and boundaries → professional responsibility where applicable → contextual inquiry.

Guidance has review ownership/date where needed. Translation approval does not certify regulated claims. Clearly distinguish service description from legal/tax advice and binding agreement. Structured data must match visible approved text; no hidden FAQ claims.

**Draw:** service/guide, country variant, long article with contents, unavailable service, stale review, missing locale and contact handoff. Navigation and CTA must not imply capabilities excluded by the architecture.

### P17 — Sell/Let entry

**Layout/flows:** L01/L15; F10. **Order:** chosen sell/let intention → actual representation/assessment scope → first human step → needed minimum information → consultation CTA and contact alternative.

Give both intents distinct copy and carried form context. Explain that submitting does not establish ownership or guarantee a valuation/price/time to transact. Do not show fabricated sold metrics, testimonials or automatic valuation results as persuasion.

**Draw:** sell, let, unsupported location/service, first visit and compact entry. The consultation form remains short and can accept unknown property facts.

### P18 — Owner intake

**Layout/flows:** L05/L13; F10. **Order:** purpose → approximate location/type → self-declared relationship → optional known facts/photos → contact/language → review and submit. Disclosure precision and exact identity documentation are later scoped tasks.

Use explicit unknown/not supplied. Optional photo failure can be omitted while retaining the consultation request. Draft persistence is limited and disclosed; do not silently store personal free text in localStorage. Show what staff will receive before submission.

**Draw:** unknown facts, representative rather than owner, unsupported area, duplicate hint without leaked details, safe upload progress/failure, review, validation and unknown outcome. No automatic public Listing is created by submission.

### P19 — Owner-intake receipt

**Layout/flows:** L05; F10. **Order:** actual acceptance → reference and safe scope → next staffed contact step → how to correct information/contact agency. It is a request receipt, not an approved agency agreement.

If the supplied route appears invalid, explain the need for a reachable method without pretending the original request vanished. A later client invitation is separately verified and scoped. Do not put an unverified “owner account ready” CTA here.

**Draw:** accepted, contact correction needed, mail unavailable, duplicate reconciled, out of hours and safe resume/invitation handoff. Unknown outcomes follow P12's reconciliation contract.

### P20 — Team and contact

**Layout/flows:** L15; F01/F06/F17. **Order:** actual contact channels and supported languages → office/service hours with timezone → verified address/location where public → real team/service information → appropriate inquiry.

Phone/email/WhatsApp links explain external handoff where necessary. Clicking is not counted or displayed as a completed conversation. Show actual out-of-hours expectations and accessible alternatives; do not claim instant multilingual support without staffing.

**Draw:** in hours, out of hours, external app unavailable, long contact names, unsupported preferred language and map failure. All numbers, addresses, portraits and professional claims require operator-approved source.

### P21 — Unavailable and legacy property

**Layout/flows:** L03; F09. **Order:** safe stable reference/identity → truthful sold/let/withdrawn/removed/unavailable state → what can still be shown → explicit search/contact/alternative action.

Use the exact reviewed URL disposition and status. A retained historical surface must not appear in active available results. Equivalent redirects identify the same legitimate target; terminal removal does not masquerade as a new Listing. Avoid rendering a restricted old price/photo in metadata while hiding it visually.

**Draw:** sold/let, withdrawn, temporarily restricted, approved preservation, approved terminal removal and no approved locale. Alternatives are separate clearly labeled records.

### P22 — Search recovery

**Layout/flows:** L02; F02. This is a state family of results, not a disconnected branded error page.

**Order:** failure/no-match distinction → retained committed criteria → useful explanation → explicit retry or individual relaxation → verified contact if needed. A partial section names what is missing; untrusted stale inventory is not silently treated as current.

**Draw:** true zero matches, query unavailable, map-only outage, slow count, rate limit, interrupted pagination and stale-results refresh. Retry preserves query identity appropriately; a late failed request cannot erase a newer successful search.

### P23 — Short-stay consultation

**Layout/flows:** L14/L05; F27. Show only when the actual service is approved and staffed. **Order:** inquiry-only scope → desired dates/location/needs → one contact route → request and durable receipt.

Dates represent preferences, not held inventory. Any human quote has stated context/expiry; no booking engine, online payment or reservation success state exists. If the service is not offered, remove its navigation and apply the approved truthful legacy response.

**Draw:** available consultation, unsupported scope, date validation, received request and later human follow-up. Old “reservation confirmed” designs are explicitly not reusable.

### P24 — Help, privacy and accessibility

**Layout/flows:** L15/L05; F08/F30. Separate readable policies/support guidance from actual preference/data-request controls, while linking them contextually.

**Order:** task/topic → plain explanation and actual scope → appropriate action/contact → policy version/review information. Accessibility help provides a real alternative, not a conformance badge based only on this spec. Nonessential analytics/marketing choices are separate from necessary authentication/security functions.

**Draw:** help article, preferences, policy update, accessible alternative, privacy-request entry/receipt, verification required and unsupported query. Do not fabricate jurisdictional deadlines or legal conclusions.

## 15. Client screen contracts

Client surfaces use current authenticated client context and record/field grants. Every screen has denied/revoked/session-expired variants that do not disclose private content. The navigation is contextual; not every client sees every tab.

### C01 — Client access and safe return

**Layout/flows:** L05; F13. **Order:** correct product/context identity → verified email flow → permitted return destination → recovery/help. Do not offer public self-registration as a way to obtain Cases.

Show code/link sent with a safely masked route and resend limits; allow correction and paste/autofill. A provider session alone does not create local grants. A staff identity using the client application stays in client context.

**Draw:** initial, verification sent, incorrect/expired proof, rate limited, provider unavailable, authenticated without grants, wrong account and session reauthentication. Return never automatically replays the action that originally required login.

### C02 — Invitation acceptance

**Layout/flows:** L05; F13. Before authentication expose no private Case material. After correct verification show safe inviter, purpose, precise access scope and expiry; Accept/Decline is intentional POST.

Invitations expire after 72 hours under the architecture; reissue invalidates the prior invitation. Already accepted routes to still-permitted work; it does not regrant revoked access. A scanner's GET cannot consume the invitation.

**Draw:** valid, wrong recipient, expired, revoked, already accepted, reissued and no-longer-available Case. Client collaboration is not unlimited household access.

### C03 — Buyer/tenant overview and Case index

**Layout/flows:** L06; F14/F20. For multiple Cases, begin with a concise authorized index; for one, go directly to the useful overview. **Order:** Case purpose/broker → next action → status/waiting condition → upcoming appointment → active Interests/Proposal/documents → curated timeline.

Progress is descriptive, not a probability-to-close percentage. Expose requirements/feedback in context. A change in one Interest does not mark the entire Case lost.

**Draw:** new Case, action due, waiting for agency/client/third party, no current task, paused, multiple roles and closed handoff. Data loading failure cannot look like no work.

### C04 — Requirements/Brief

**Layout/flows:** L05; F14/F21. **Order:** agreed purpose → hard criteria → preferences → timing/unknowns → confirmation and history. Show who supplied/acknowledged the current version.

Client editing creates a proposed revision, not silent mutation of an active Proposal. Prefill existing answers and highlight actual changes. Sensitive requirements stay private and are never serialized into public search URLs automatically.

**Draw:** incomplete draft, proposed changes, awaiting broker/client acknowledgment, agreed, conflicting edits and changed requirement affecting current Interests. Clear hard-versus-preference controls replace opaque priority scores.

### C05 — Interests, shortlist and feedback

**Layout/flows:** L04; F04/F14/F21. **Order:** selected Case context → grouped relevant Interests → known fit/trade-off/unknown explanations → feedback and next action. Each card links the current eligible Listing presentation and its relevant historical revision.

Feedback is attributable to the participant and can include question, interested, decline/reason or viewing request. Shared comments have an explicit audience. A current withdrawal/change is visible without exposing restricted historical facts.

**Account-saves variant:** client `/saved` and `/saved/import` show personal saves separately from any Case's Interests. Import reviews additions, already-saved and now-unavailable items under §20.3.1; explicit confirmation preserves existing server saves. Choose “Add to a Case” only after selecting a currently permitted Case and audience. Account-created public links have the same P09 management/expiry/revoke states; neither a personal save nor a public share adds a Case participant.

**Draw:** new suggestions, shortlisted, no suggestions yet, participant disagreement, private-note boundary, unknown feature, unavailable Listing and revised price. Removing one Interest never removes the whole Case.

### C06 — Appointment detail and response

**Layout/flows:** L12; F07/F22. **Order:** exact status → date/time/timezone → permitted participants/host → Listing/context → safe meeting/access information → response/change/cancel actions → notification status.

A proposal response is distinct from final confirmation. A reschedule shows the still-current confirmed arrangement and proposed replacement. The client requests changes; the server/authorized staff handles current resource checks.

**Draw:** request pending, proposal, confirmed, access pending, reschedule requested, concurrent conflict, cancelled, completed/no-show follow-up and expired authorization. Never infer attendance from ICS/email delivery.

### C07 — Case conversation

**Layout/flows:** L08; F17. **Order:** Case/recipient context → chronological permitted messages → composer with audience and attachment state → observed delivery details. The client does not see staff-only notes or internal routing.

Submitting posts a human-authored in-app message; service email delivery remains a separate outcome. Preserve draft on correctable failure and reconcile unknown outcome. A new participant does not automatically gain historical restricted attachments.

**Draw:** empty conversation, long messages, drafting, upload pending/unsafe, queued, failed/unknown notification, participant removed and session expiry. No open-tracking claim or fake double-check read receipt.

### C08 — Document requests and library

**Layout/flows:** L13; F15. **Order:** requested actions by purpose → existing permitted documents/versions → review outcomes and replacement requests. Show why each requested document is needed and who can access it.

Available actions derive from current grant, file state and review purpose. Sensitive download/exports require recent verification within the architecture's 15-minute window. Do not expose filenames or thumbnail dimensions for unauthorized items as placeholders.

**Draw:** no requests, missing document, processing, ready for scoped review, replacement needed, reviewed, superseded, restricted and safe download failure. “Reviewed” always names the review scope.

### C09 — Upload and replacement task

**Layout/flows:** L13; F15. **Order:** purpose/audience/type/size guidance → file chooser/drop zone → per-file queue → transfer/seal/scan status → review-ready result. Provide click/tap file selection; dragging is optional.

Initial limits are PDF/common raster documents up to 20 MB and images up to 25 MB under the server's policy. Do not accept executables, HTML/SVG, macros or archives. Client validation is a convenience; server signature/scan policy is authoritative. Replacing names the old version and creates a new asset.

**Draw:** selected, progress, interrupted, wrong type, oversize, rejected scan, unreadable, stale scan, completed transfer still processing and ready. Leaving cannot promise browser background upload continuation.

### C10 — Proposal review and response

**Layout/flows:** L11; F16. **Order:** proposal identity/version/currentness → parties → exact typed terms → conditions/expiry → changed fields → requested decision and professional-process boundary.

Use “Agree for next step” only where that action is authorized and explained; never label it a legal signature or completed transaction. Questions/counterproposals retain the version being discussed. Recent auth/current grant is rechecked for sensitive actions.

**Draw:** current, superseded, changed while open, expired, withdrawn, countered, decision submitting/unknown and recorded next step. Private negotiations from competing Cases remain absent.

### C11 — Seller/landlord overview

**Layout/flows:** L06; F11/F12. **Order:** next required instruction → broker/Case status → parallel preparation → exact preview/publication state → relevant appointments/proposals → commitments and closeout.

Preparation separates facts, media/rights, terms, source and locale review. “Marketing” is based on actual publication/coordination state, not on the owner having pressed an acknowledgment button. Real performance observations can appear with scope/period; unavailable measurements must not be invented.

**Draw:** authority review, owner input due, preparing, review pending, locally published/external unverified, paused, material correction and completed. No owner financial ledger is included.

### C12 — Listing preview and instruction decision

**Layout/flows:** L11; F11/F12. **Order:** exact preview version/locale → changed terms/facts/media/location disclosure → what acknowledgment means → approve/request change controls and audience.

The preview is authenticated and nonindexable. Human client acknowledgment records Seller Instruction evidence only; publisher and translation/professional gates remain. Older previews are explicitly stale or historical and cannot accept current approval.

**Draw:** first preview, changed price/media, missing fact, protected approximate location, approved acknowledgment, source changed, restricted locale and denied access. Do not include private internal evidence merely because it contributed to copy.

### C13 — Contact and subscription preferences

**Layout/flows:** L05; F05/F30. **Order:** verified contact routes → service preferences → saved-search subscriptions → optional marketing → language/timezone. Explain which controls affect which communications.

New email/phone verification is separate from permission to message it for a new purpose. Unsubscribe/pause is direct and accessible; success affects already queued optional work. Necessary service updates follow the approved purpose policy and are not relabeled as marketing.

**Draw:** verified/unverified route, verification pending, active/paused alerts, changed criteria, unsubscribed and failed preference save. No preselected optional consent.

### C14 — Supported-service consultation Case

**Layout/flows:** L14/L06; F28. **Order:** actual consultation/referral purpose → accountable person/next action → request context → permitted messages/documents → truthful outcome.

This replaces the earlier maintenance-request workspace. Do not display “technician assigned,” repair dispatch, approval-of-expense or service-level countdown unless a future approved architecture introduces those capabilities. Actual human communications can be recorded as communications, not simulated system state.

**Draw:** received, awaiting clarification, agency follow-up, referred/closed and urgent-help boundary. No implied emergency handling.

### C15 — Owner statement: retired

No route, navigation entry, empty panel, sample statement or financial-data model is included. Ongoing management accounting is outside release scope. If a legitimate existing document must be shared, it is a purpose-bound document under C08, not a generated ledger or statement feature. Any later introduction requires a scope/architecture amendment and reconciliation controls.

### C16 — Closeout and remaining obligations

**Layout/flows:** L06; F14/F16/F20. **Order:** actual outcome/date → what was completed → remaining obligations/owner/due condition → handover/support → document/access/retention explanation.

Distinguish completed service, failed transaction, client withdrawal and paused work. Closing the Case cannot silently mark Property sold/let or cancel unrelated Interests/Cases. Remaining actions remain real tasks rather than vanishing beneath a success banner.

**Draw:** successful brokerage outcome, no transaction, withdrawn, aftercare due, retained-record access and access expiry. No celebration that overstates legal completion.

### C17 — Participants and access

**Layout/flows:** L05/L16; F13/F30. **Order:** safe permitted participant list → roles/scopes → pending invitation state → request invitation/removal and allowed self-access action.

Clients request new collaborators; staff issue grants. Revoke/leave controls appear only for capabilities the actor truly has. Explain future-access effects and the inability to recall downloaded documents. Do not show another participant's private financial/legal documents or contact route by default.

**Draw:** single participant, collaborator, pending/expired/revoked invitation, removal requested, capability denied and changed access while open. No generic share-link switch that exposes the whole Case.

### C18 — Personal-data request

**Layout/flows:** L05/L16; F30. **Order:** request type/scope → safe identity verification → purpose-specific information → receipt/responsible team → progress/policy disposition → private completion.

Correction, export and deletion/restriction are different tasks. A request receipt is not a claim of legal compliance or immediate erasure. Exports require recent verification and exclude other parties. Explain holds/restrictions under the approved policy without inventing deadlines.

**Draw:** draft, verification needed, received, more information needed, in progress, hold/partial disposition, completed and expired export access.

## 16. Staff and operating screen contracts

Staff screens require staff-context identity, dedicated staff organization, active local membership and required capabilities. Staff MFA and sensitive reauthentication are separate from client email verification. Raw Payload collection/admin access must not bypass these contracts.

### O01 — Today

**Layout/flows:** L07; F18/F19. **Order:** unassigned requests → due commitments → upcoming viewings → corrections/reviews → delivery exceptions, with prioritization visible and configurable only through approved policy.

Rows show reason, owner, due/age and one useful next action; grouping must not hide overdue lower-priority work. Scope controls are Mine/coverage/team only where authorized. Counts come from real eligible records and link to their queues.

**Draw:** ordinary day, overloaded coverage, no work, unowned work, partial provider outage and stale queue. A queue failure must never look like “All caught up.”

### O02 — Inquiries and application-message triage

**Layout/flows:** L08; F17/F18. **Order:** queue scopes/filters → records with intent/language/age/owner → selected original context/thread → disposition/composer. Application email is supported; personal mailboxes and WhatsApp histories are not silently presented as synchronized.

Assign/claim and respond are separate events. Suspicious sender/thread matches are triage items. Draft state and pending delivery survive opening another thread. Preserve selection and return position.

**Draw:** unassigned, mine, awaiting client, duplicate candidate, unreachable contact, suspicious inbound, failed ingestion and provider outage.

### O03 — Inquiry detail and qualification

**Layout/flows:** L08/L09; F18. **Order:** original received context/receipt → contact/language → existing Party/Case candidates → assignment/first response → link/create/resolve disposition → next commitment.

Show the exact requested Listing/criteria snapshot plus current safe Listing status. Qualification records supported need/service, not demographic or wealth scoring. Linking preserves original receipt and submission history.

**Draw:** new, assigned, candidate duplicate, contact correction, unsupported service, linked, resolved without Case and unknown communication outcome. Resolve requires a real reason; delete is not the normal triage shortcut.

### O04 — Cases index

**Layout/flows:** L16/L09; F20. **Order:** scope and meaningful filters → table of purpose/party/type/stage/disposition/owner/next action → pagination. A board may visualize stages but must not be the only way to change or inspect them.

Stage changes use the same guarded action as Case detail; dragging cannot skip prerequisites. Show paused/closed separately from progress. Counts/filters respect private record visibility.

**Draw:** list/optional board, first-use empty, filtered empty, stale next action, overdue/paused, narrow prioritized summary and denied drill-down. Avoid infinitely wide generic CRM columns.

### O05 — Case workspace

**Layout/flows:** L09; F20. **Order:** stable Case identity, owner/stage/disposition/next action → task sections → scoped relationship inspector. Brief/Interests remain central; communication/document/proposal details open in context.

Transition review names prerequisite and consequence. An active Case must have a next action or waiting condition/review date. Closeout records outcome and open-obligation disposition; reopening preserves history.

**Draw:** active, waiting, paused, simultaneous edits, several Interest stages, participant restriction, closed and reopened. Internal notes never appear in the client timeline projection.

### O06 — Party and authorized relationships

**Layout/flows:** L09; F18/F20/F32. **Order:** Party identity/verified contact methods → roles and language/contact preferences → authorized Case/Property relationships → duplicates/history. Person and organization are distinct forms; no account is required for every Party.

Email is contact data, not a role or unique proof of human identity. Shared/reused addresses trigger careful matching; never auto-promote a former-looking administrator. Duplicate review is explicit.

**Draw:** one person multiple roles, organization representative, unverified route, duplicate candidate, restricted relationship fields and merged alias. Do not leak counts/titles of unauthorized Cases.

### O07 — Matching and shortlist preparation

**Layout/flows:** L04; F21. **Order:** current Brief/version → hard/preference/unknown criteria → explainable candidate results → Interest action → share review.

Show why an alternative violates a hard criterion before proposing it. A client question can resolve an unknown; the system must not guess. Creating an Interest is idempotent within the Case–Listing relationship.

**Draw:** exact candidates, explicit alternatives, no match, unconfirmed feature, changed Brief, withdrawn candidate and draft share. The public share preview proves that private criteria/notes are excluded.

### O08 — Calendar and itinerary

**Layout/flows:** L12; F22. **Order:** date/timezone and permitted team scope → agenda/day/week → proposed/confirmed/resource conflicts → Appointment detail/action. Mobile agenda is complete, not a link to “use desktop.”

Manual external-busy checks are explicit; no misleading sync badge. A drag creates a reviewed change proposal, not an unguarded mutation. Show buffers and property access readiness without revealing irrelevant private data.

**Draw:** agenda/day/week, dense day, empty day, proposed versus confirmed, conflict, stale refresh, timezone switch and keyboard scheduling. All controls work without drag.

### O09 — Appointment workbench

**Layout/flows:** L12/L05; F07/F22. **Order:** Case/Interest/Listing → requested/proposed/current arrangement → participants/host → timezone/duration/buffers → availability/access/resource checks → confirmation/change → notification state.

The confirmation review includes external-busy acknowledgment and safe disclosure of meeting details. Recheck resources transactionally. A reschedule is a replacement operation preserving the old arrangement until valid commitment.

**Draw:** request, proposed, access pending, availability due, confirmed, concurrent conflict, DST ambiguity, reschedule, cancellation and no-show/completion with follow-up. ICS status never substitutes for business state.

### O10 — Inventory

**Layout/flows:** L16; F23/F31. **Order:** purpose/status/freshness/locale filters → Property/Listing rows with reference and relevant blockers → selected record. Make one Property with sale and letting presentations intelligible without duplicate asset maintenance.

The index can expose specific work queues—needs facts, missing rights, stale locale, availability due, restricted—not one vague completion percentage. Bulk selection cannot publish or approve silently.

**Draw:** active/unpublished/archived, duplicate candidates, multiple Listings, confirmation overdue, failed media, filtered empty and narrow task summary. Staff inventory scope is capability-based, not automatically just the current editor's own records.

### O11 — Property identity and relationships

**Layout/flows:** L10/L09; F11/F23. **Order:** immutable Property identity/legacy aliases → physical location and private/public precision → authorized parties/source relationships → its Listings → outstanding conflicts/authority work.

Property facts and a Listing's commercial terms have separate revisions. Linked buyer Cases remain permission-scoped. Private exact location cannot be accidentally copied into public description/map metadata.

**Draw:** intake, existing asset, two concurrent purposes, contradictory identity/location evidence, restricted owner/address and duplicate merge handoff. Source-as-is import is not verified Property truth.

### O12 — Listing source editor

**Layout/flows:** L10; F23. **Order:** selected Listing purpose/reference → terms and associated fact revision → BG copy → media/disclosure summary → readiness checklist → Save draft / Submit review.

Live and working revisions are labeled separately. Protect amounts/units/reference/source URL from prose convenience transforms. Autosave shows exact acknowledgment; submit freezes a candidate. Ordinary draft edits leave correct live content active.

**Draw:** pristine, dirty, saving, saved, save failure, conflict with preserved input, review-ready and material-correction escalation. No Save-and-publish combined action.

### O13 — Media and placement

**Layout/flows:** L10/L13; F23/F32. **Order:** upload/processing queue → asset grid/list with rights/type/caption → ordered placement controls → chosen cover/public derivative → issues and history.

Stable MediaRelation identity supports duplicate asset placements and hidden/unsupported items. Drag has equivalent tap/click Move earlier/later/to-position controls. Move commands operate against the complete server relation set; visible filtered order is not the complete permutation.

**Draw:** upload/seal/scan/processing, failed derivative, missing rights, modified image disclosure, paginated/hidden media, concurrent reorder, deleted/superseded and missing object. Approval binds exact bytes and placement version.

### O14 — Facts and source evidence

**Layout/flows:** L10/L13; F11/F23/F31. **Order:** typed fact/value/unit/basis → source/excerpt/date/language → unknown/conflicting status → human review scope/result → affected presentation dependencies.

Provide known, unknown, not supplied, not applicable, withheld and conflicting as meaningful states. Public presentation may collapse private reasons safely. Do not infer rooms/area/ownership from a photo or silently choose one conflicting source.

**Draw:** missing fact, owner-supplied, multiple conflicting values, source unavailable, reviewed for limited scope, stale evidence and confirmed material correction. AI extraction remains candidate input.

### O15 — Locale translation work

**Layout/flows:** L11; F24/F29. **Order:** source BG revision and protected facts → target locale → draft/source comparison → differences/terminology → scope-specific review actions.

Show actual source binding and whether it changed. Approved locale is not publish permission. Translator sees only sources needed for the task. Hebrew preview uses real RTL composition, not text reversal in an LTR frame.

**Draw:** missing, manual/AI draft, in review, changes requested/rejected, approved-for-source, changed source and protected-fact validation failure. An unavailable locale cannot silently fall back to indexable BG content.

### O16 — Approval and publication review

**Layout/flows:** L11; F24. **Order:** manifest/version/destination → changes → instructions/fact/media/locale/professional-review prerequisites → permitted publisher decision → durable outcome.

Present each approval's scope/actor separately. A person with both routine capabilities may make separate attributable decisions; never label that independent review. Missing authority blocks the action even if every field is filled.

**Draw:** blocked with precise prerequisites, eligible, stale review, revision conflict, activating, local active/external verification pending and denied capability. Scheduled publication is not a new launch feature; queued execution of an approved command remains subject to current generation.

### O17 — Publication destinations and outcome

**Layout/flows:** L11/L16; F24/F31. **Order:** exact active manifest → local website representation/read-back → named manual destinations → pending/failed/unknown work → owner/reconciliation history.

Differentiate acknowledged from verified, local activation from remote status, and manually managed from automated transport. No enabled portal connector or “publish everywhere” button exists at launch. Withdrawal tracks actual remaining exposure and purge verification.

**Draw:** never published, local active, partial, unknown, failed, withdrawing, withdrawn, manual task overdue and superseded generation. A finished worker job does not prove external success.

### O18 — Tasks and commitments

**Layout/flows:** L07/L16; F19/F20. **Order:** task/promise, related Case/Property, accountable owner, due condition, dependency/review date, result/evidence and history.

Open/in progress/waiting/done/cancelled are explicit. “Done” requests the defined outcome; waiting requires what and when to review. Bulk completion is limited to genuinely equivalent low-risk tasks and does not send/publish/approve/grant.

**Draw:** due, overdue in staffed context, waiting on client/third party, reassigned, complete with evidence, cancelled with reason and concurrent completion. Tasks survive staff absence and application rollback.

### O19 — Proposal preparation and negotiation record

**Layout/flows:** L11/L09; F16. **Order:** Case/Interest/parties → typed terms → conditions/deadline → relevant source Listing revision → reviewed recipient/audience → revisioned communication and decision history.

Every material change creates a new revision and invalidates affected approval. The product coordinates approved terms and professional review; it is not an e-signature, escrow or legal-document authority. Competing Cases remain separate.

**Draw:** draft, reviewed, submitted, awaiting, countered, expired, withdrawn, agreed-next-step and changed while recipient is viewing. No editable amount masquerading as an old accepted proposal.

### O20 — Document review

**Layout/flows:** L13/L11; F15. **Order:** requested purpose/audience → immutable version/scan status → safe preview/source → reviewer scope and decision → replacement/access outcome.

Review permission is purpose-specific. Malware scan, readability, factual source review and professional validation are separate. A reviewer cannot broaden audience as a side effect of recording a review; share/access commands remain separate.

**Draw:** quarantined, scanning delayed, ready, unreadable, replacement requested, reviewed-for-purpose, superseded and permission revoked during preview. Exports/downloads reauthorize and require recent authentication where specified.

### O21 — Editorial content

**Layout/flows:** L10/L11; F08/F24. **Order:** content type/locale/geographic scope → source copy and evidence → required review owner/date → localizations → preview/publication/history.

Reuse exact source/locale/publication approval semantics with appropriate content types. A guide is not a Listing and does not get irrelevant price/bedroom fields. Regulated claims use the actual professional-review policy. Preview is private/nonindexable until eligible.

**Draw:** draft, review due, missing locale, stale source, approved, published, restricted and withdrawn. Structured metadata must not invent claims absent from visible content.

### O22 — Operational reports

**Layout/flows:** L16; F25. **Order:** question/metric definition → period/timezone/scope → complete/incomplete observations → trend/breakdown where meaningful → authorized records and action.

Prioritize useful human response, Cases with next action, overdue promises, freshness/conflicts, completed viewings and correction/re-entry effort. Raw leads, visits and AI calls are not the sole success measures. Export respects record/field permissions and safe aggregation.

**Draw:** no observations, incomplete data, definition changed, small samples, current period not complete and denied drill-down. No fake zeroes or misleading precision.

### O23 — Team, access and coverage

**Layout/flows:** L16/L11 for management; L05 for access/recovery; F13 including its staff variant, F19/F30. **Order after authorization:** memberships/roles → coverage/absence → invitations/MFA enrollment status → access-impact review → attributable grant/revoke result. `/access` and `/access/recovery` are separate unauthenticated task states and never render this management surface.

Require staff-context identity, active membership and recent reauthentication for sensitive changes. Show open work/receiver acceptance before revoking or moving responsibility. Recovery follows the identity provider's authorized process, not a local bypass.

**Draw:** staff entry, hosted-auth handoff, TOTP enrollment/challenge, invalid/expired invitation, wrong context, missing/revoked membership, provider failure, lost-factor explanation/recovery pending, session expiry and sensitive-action reauthentication/return; then management invited, enrollment pending, active, absent, restricted, revoke with open commitments, transfer pending and completed. Staff/client applications and staging environments must never be conflated in labels or links. Hosted provider states are annotated dependencies with real acceptance evidence, not substitute custom credential forms.

### O24 — Service policy and release controls

**Layout/flows:** L16/L11; F18/F25/F30. **Order:** policy purpose/version → current values and owners → proposed changes → affected users/jobs/public promises → validation and explicit activation.

Policy includes actual hours/coverage, routing, supported services/locales, approved templates, review intervals and purpose/retention rules under authorized ownership. Consequential changes require appropriate fresh authentication and approval. A setting cannot invent a legal retention period or silently enable an excluded service module.

The capability-gated release-evidence panel shows R00–R12, exact release/policy/scope, evidence freshness, signer and blocker; it cannot manually turn a failed test green. **Draw:** draft, invalid/conflicting rule, impact preview, active, superseded, blocked release and authorized attestation.

### O25 — Integration and recovery exceptions

**Layout/flows:** L16; F25. **Order:** capability/provider and affected work → last observed successful operation → current incident/attempts → safe diagnostics → owner/next step → permitted reconciliation/retry.

Display logical action, immutable payload/version and known/unknown outcome. Do not show secrets or raw personal payloads. Resend's 24-hour provider idempotency window limits safe automatic replay; beyond it ambiguous sends require reconciliation. Assistance spending and telemetry gaps are explicit.

**Draw:** healthy with real observation, delayed, failed, authorization expired, unknown send, stale worker lease, backup age/safety-ledger lag and monitored incident. “Connected” alone is never proof of end-to-end capability.

### O26 — Audit and privacy operations

**Layout/flows:** L16/L13; F30. **Order:** authorized request/event filters → attributable timeline → purpose/scope/policy → owned task and evidence → redacted/private export or completion.

Audit history is not a client conversation and can contain restricted fields. Privacy completion records verification, scope, hold/disposition and downstream changes. Restored systems must apply newer safety decisions or keep affected access/publication closed.

**Draw:** redacted event, denied detail, export verification, received/in-progress/held/partial/completed request and stale evidence. No unrestricted “download all customer data” convenience action.

### O27 — Duplicate comparison, merge and split

**Layout/flows:** L11; F32. **Order:** candidate identities and match evidence → field differences → affected relationships/grants → chosen survivor/aliases → impact review → durable merge or reversal result.

Similarity is a candidate, not proof. Merging records must not grant a person access to another's documents. Keep source identities, history and an audited split/reversal path; preview which effects can and cannot be reversed automatically.

**Draw:** candidate, false match dismissed, conflicting verified contacts, restricted relationship, merge blocked, merged aliases and partial/manual reversal. No one-click destructive merge from a search-result badge.

### O28 — Import and durable batch result

**Layout/flows:** L16/L11; F32. **Order:** source/authorization → mapping/units → dry-run summary → per-row diffs/issues → explicit selected scope → execution → durable results and recovery.

Show expected creates/updates/no-change/conflicts before mutation. “All matching” selection has its frozen query/scope count and review; current-page selection is distinct. Imports preserve reviewed fields and never create public approval.

**Draw:** mapping errors, missing media, duplicate candidate, dry run, reviewed subset, queued/running, partial completion, interrupted/retry and unchanged row. Cancel/rollback labels state whether future work stops or committed changes are actually reversed.

### O29 — Supported-service consultation queue

**Layout/flows:** L14/L16; F27/F28. **Order:** supported service type → received requests with owner/age → next action → scoped Case. Reuse ordinary intake/commitment behavior.

No reservation inventory, housekeeping roster, contractor dispatch, repair SLA, rent collection or owner accounting. Manual human coordination may be recorded truthfully but is not modeled as unsupported provider automation.

**Draw:** received, awaiting clarification, assigned, waiting on actual human response, unsupported/referral and closed. Hide this navigation when there is no approved service/coverage.

### O30 — Supported-service request detail

**Layout/flows:** L14/L09; F27/F28. **Order:** actual requested consultation/coordination → supplied context and self-declared relationship → owner/next action → permitted correspondence/evidence → truthful disposition.

Requested stay dates are not bookings; a management question is not a maintenance work order. Any quoted information is versioned context with source and expiry, not payment authority. Urgent language triggers approved guidance without pretending emergency dispatch.

**Draw:** clarification, scope review, manual follow-up, referral, declined unsupported request and closed consultation. No statement/reconciliation links.

### O31 — Owner-statement reconciliation: retired

No financial ledger, imported bank reconciliation, statement generator or release route is included. Do not create its schema or a blank placeholder under Operations. Sharing a real existing document is a separate purpose-bound document action, not evidence that this financial capability exists.

### O32 — Contextual assistance review

**Layout/flows:** L11 within O12/O14/O15/O05/O02; F29. **Order:** task/source scope → generation state → proposed diff/excerpt/source pointers → protected-field/unsupported warnings → accept selected draft/edit/reject.

Keep the original human work visible. Model confidence is not approval. Clicking Accept adds draft content only; send/publish stays in its own human-authorized workflow. Current actor and source revision are rechecked before application.

**Draw:** ready to request, generating, failed/refused, budget disabled, malformed/source-less, conflicting, stale and accepted-as-draft. Do not render model-produced markup/scripts as trusted UI or create a universal agent chat shell.

### O33 — Material correction and exposure reconciliation

**Layout/flows:** L11/L16; F31. **Order:** credible correction/dispute and source → affected entities/representations → immediate restriction status → replacement-review tasks → downstream reconciliation and unresolved owners.

Show exact fact/version and affected locale/destination/commitment. A normal draft edit and a current-public-truth correction are different actions. Restriction is not delayed for translation; replaced content needs fresh eligible approval.

**Draw:** reported dispute, restriction committed, unaffected safe locale, replacement in review, local corrected/remote unknown, stale queued job cancelled, media purge unverified and resolved-with-explicit-exceptions. Do not claim that downloaded material has been recalled.

## 17. Shared component contracts

Components own interaction behavior, not business authority. Share tokens and tested primitives across public/client/staff; do not share private caches or authentication contexts. Each interactive component must define default, hover, focus, active/selected, disabled-with-reason, loading and error where meaningful.

| ID | Component | Required anatomy, variants and behavior |
|---|---|---|
| UI01 | Surface shell | Public/client/staff variants; skip link, landmarks, page title, safe session context, reserved loading layout; private data absent until authorized |
| UI02 | Navigation | Current item conveyed semantically, complete compact menu, keyboard order and close/return focus; counts only from permitted data |
| UI03 | Breadcrumb/return | Human-readable context and stable route; preserve authorized list/query position; never use arbitrary unvalidated return URLs |
| UI04 | Language switch | Native language names, current locale, explicit missing-content state; preserve object/intent; no flags-as-language or automatic forced redirect |
| UI05 | Action button | Effect-specific label, priority/danger variant, pending indicator without width jump, disabled explanation, keyboard activation; no duplicate effect on double activation |
| UI06 | Link/handoff | Real URL for navigation, external/download/phone behavior when relevant; copied/share status; no action disguised as a dead anchor |
| UI07 | Form field | Persistent label, value, optional/required/unknown meaning, hint, error association, autocomplete/inputmode; no placeholder-only labels |
| UI08 | Searchable choice | Keyboard/touch selection, selected identity separate from search text, no-results/loading/error, clear action and long labels; use a tested combobox pattern where needed |
| UI09 | Multi-select facet | OR-within-facet meaning, selected count/chips, clear/remove labels, draft versus committed state, keyboard-accessible complete list |
| UI10 | Typed quantity | Amount/unit/basis/currency/period explicit; localized parsing/formatting and validation; unknown/withheld separate from zero |
| UI11 | Date/time/zone | Typed entry and picker, explicit timezone, invalid/past/ambiguous states, readable final absolute instant; not a date picker alone |
| UI12 | Status/freshness | Text plus optional icon, exact dimension/scope and meaningful timestamp; no single universal green badge; tooltip is supplementary |
| UI13 | Listing card | Approved image/reference/location/price/basis/facts/availability, real detail link, separate save/compare controls, unavailable and long-content variants |
| UI14 | Result toolbar | Count type/scope, sort, pagination state and accessible updates; stable query identity; no stale count paired with newer results without disclosure |
| UI15 | Filter rail/sheet | Shared field semantics, desktop nonmodal and compact modal variants, Apply/Clear/Cancel, explicit draft handling and keyboard-safe footer |
| UI16 | Map selection | Approved-coordinate marker/cluster and linked accessible result; Search this area, selected state, attribution, failure and list fallback |
| UI17 | Gallery/viewer | Correct starting item, item count/caption/type, non-swipe navigation, zoom/fit, media failure, focus return and closed-media pause |
| UI18 | Comparison | Semantically associated row/column labels, two/three desktop and narrow pair variants, unknown/current-change/withdrawn states |
| UI19 | Dialog/sheet | Declared modality, name, intentional entry/return focus, visible Close/Cancel, Escape/platform-close/Back coordination, unsaved-work policy |
| UI20 | Data table | Stable rows, labeled sort, keyboard controls, page/all-matching selection distinction, responsive relationship-preserving alternative and empty/error states |
| UI21 | Timeline | Attributable events, actual local time/zone where needed, explicit client/internal projection, grouped date and source/related-object links |
| UI22 | Composer | Audience/channel, draft/approved revision, attachment eligibility, review/send and durable outcome; internal note has a separate unmistakable mode |
| UI23 | Upload queue | Chooser plus optional drop, item identity, size/type hints, per-phase progress, retry/remove permitted by state, immutable sealed result |
| UI24 | Evidence/document | Purpose, audience, scan/review distinction, version/supersession, safe preview, current download authorization and replacement workflow |
| UI25 | Revision diff | Current/proposed/source labels, protected-fact changes first, long text/media changes, stale candidate, stacked compact version and scope-bound decision |
| UI26 | Readiness checklist | Required blocker versus optional enhancement, owner, exact evidence/version, actionable link; completeness percentage never grants authority |
| UI27 | Operation result | Logical ID, accepted/local/external outcome, phase, per-item result, permitted cancel/retry/reconcile, safe support reference |
| UI28 | Owner/next action | Accountable person or coverage queue, due condition, waiting dependency/review date, handover state and safe contact |
| UI29 | Purpose preference | Service/alerts/marketing separated, channel verification, policy version, active/pending/paused/revoked, explicit save/receipt |
| UI30 | Invitation/grant | Recipient-bound scope, expiry, intentional accept/revoke, wrong identity and reauthentication, no private GET-preview disclosure |
| UI31 | AI review | Task/source boundary, generated diff, actual source pointers, unknown/conflict/stale/budget/error state, accept-as-draft only |
| UI32 | Notification/feedback | Inline durable status for consequences, nonintrusive live announcement for routine updates, linked recovery; no toast-only confirmation |

Native semantic elements are preferred where their behavior fits. A component library's claim of accessibility is not evidence that MS Realty's composition, labeling, focus or whole task passes. Long operational tables need proper table semantics; do not add an ARIA grid unless grid keyboard interaction is intentionally implemented and tested.

Drag-and-drop must have an equivalent single-pointer non-drag action as well as keyboard access. Media rows therefore expose tap/click Move earlier/later or Move to position; a keyboard-only drag shortcut is insufficient. Preserve focus on the moved item and announce its resulting position. [Dragging movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html), [Status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)

Every file drop zone includes a labeled file input. `accept` helps the file chooser; it does not prove type or safety. Server rejection remains designed. [File-input behavior](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/file)

## 18. Field-level forms and content/data contracts

### 18.1 Common input rules

Use Unicode for names, addresses and free text; do not demand Latin characters or a Western first-name/last-name split. Do not silently trim meaningful internal spaces, change capitalization, transliterate addresses or convert protected facts. Normalize only under an explicit field policy and show the resulting value before a consequence.

Application limits must be visible before they cause rejection. Baseline transport limits are 200 characters for a person/display name, 254 for an email address, 40 for user-entered telephone text, 2,000 for an inquiry/owner note and 10,000 for a Case-message body. These are abuse/storage bounds, not suggestions to display fixed-height clipping. Longer professional evidence belongs in permitted documents, not pasted into an unlimited message. Server and client share validation definitions; server remains authoritative.

Phone input supports international prefix and readable punctuation; parse to a supported normalized contact representation without destroying the user's original value. Email validation must not claim deliverability; verification establishes reachable control under the chosen flow. Do not block submission because an optional name is absent. Contact-method switches preserve the alternate draft only locally and do not submit it unnoticed.

Known numbers use explicit unit/basis and localized parsing with a review summary. Blank means unanswered, not zero. Bedrooms may legitimately be zero for a studio; a missing bedroom value remains unknown. A known asking amount is positive; use an approved withheld/unknown state rather than sentinel zero. Area values identify usable/building/land basis; do not sum incompatible bases. Monetary authoritative storage remains integer minor units and original currency.

### 18.2 Search fields

| Field | UI/meaning | Validation and recovery |
|---|---|---|
| Purpose | Buy/sale or long-term rent | Required committed context; switching clears/reviews incompatible period-specific criteria explicitly |
| Country/location | Approved IDs with localized labels and aliases | Multiple locations OR; no raw private address; unknown text offers supported choice/help |
| Property type | Approved taxonomy, multi-choice | Preserve stable IDs across language; do not reinterpret an untranslated label as another type |
| Price min/max | Typed amount, currency and period | Nonnegative search bounds, min ≤ max; no cross-currency comparison without an explicitly supported rate policy |
| Bedrooms | Exact/range with studio semantics | Nonnegative integer bounds; unknown does not satisfy a confirmed minimum |
| Area | Min/max plus basis and unit | Basis visible, min ≤ max; unsupported conversions not invented |
| Features | Confirmed true criteria | Unknown is distinct; explicit include-unconfirmed behavior must explain scope |
| Map bounds | Approved public spatial area | Changes are draft until Search this area; safe bounded query and selected locality relationship |
| Sort | Documented relevance/price/recent choices | Stable tie-breaker and cursor tied to query; unsupported sort rejected safely |
| Reference/text | Exact reference first, approved aliases | Bounded length/cost; never arbitrary database query or a private Brief in a public URL |

The UI does not promise exact search-quality behavior merely because PostgreSQL supports trigram matching. Reviewed query fixtures cover each locale and relevant transliterations. Parameter changes show what actually applied, including any validated canonical normalization.

### 18.3 Inquiry, callback and owner intake

| Field | Inquiry/callback | Owner intake | Privacy/interaction rule |
|---|---|---|---|
| Intent | Required: question/callback/viewing context | Required: sell/let/consultation | Prefilled from entry; user can inspect/correct |
| Reference/criteria/topic | Present when selected | Existing reference optional | Preserve stable reference/source URL; no hidden invented context |
| Name | Optional unless genuinely needed | Optional at first contact | One inclusive display-name field |
| Contact method/value | One required reachable route | One required reachable route | Do not force both phone/email or marketing permission |
| Language | Explicit preference with current locale default | Same | Do not promise response staffing that does not exist |
| Question/note | Required for a general question; optional where intent is complete | Optional useful context | 2,000-character bound, plain text, no early identity/financial evidence |
| Preferred contact time | Optional callback preference, timezone explicit | Optional | Never a confirmed Appointment |
| Approximate location/type | Only if relevant to general search | Required where known, unknown option available | Exact owner address not needed for casual contact |
| Relationship to Property | Not normally required | Self-declared owner/representative/other | Does not establish legal authority |
| Media | Not general inquiry scope by default | Optional safe initial photos | No publication; use quarantine/sealing contract |
| Marketing | Separate optional choice if offered | Same | Unchecked; service request remains usable without it |

Before submission show the selected recipient/purpose at the appropriate level: “MS Realty will use these details to respond to this request.” Final wording/legal basis is operator-reviewed. A checkbox labeled “I accept everything” is not a substitute for clear purposes. Do not invent legal-consent requirements or promise statutory compliance.

### 18.4 Brief and Interest data

A Brief includes transaction purpose, country/locations, property types, budget amount/currency/period and whether it is a hard limit or preference, bedrooms/area basis, meaningful feature constraints, timing, practical questions, author and acknowledgment. Unknown answers are represented explicitly. Sensitive health/access circumstances should be reduced to the necessary practical requirement and protected by purpose; they are not search-ranking traits.

Each Interest contains Listing reference, relevant revision, selection/progress state, explained fit/trade-offs, open questions, attributable feedback, related Appointment/Proposal and next action. The public card's data cannot carry private feedback. A participant can change their own feedback under capability rules; they cannot silently edit another participant's opinion.

### 18.5 Appointment form and confirmation review

| Field/check | Required before confirmation | Client-visible presentation |
|---|---|---|
| Case/Interest/Listing | Correct authorized relationship and current Listing eligibility | Safe identity/reference and purpose |
| Date/time/duration | Valid local wall time resolved to an instant | Full date, local time, timezone; second timezone where helpful |
| Host/participants | Named authorized host and intended participants | Only permitted participants/contact details |
| Availability | Current confirmation under policy | Actual status, not a newly verified badge created by scheduling |
| Access | Property access permission/logistics confirmed | Relevant meeting detail, scoped and timed |
| Resources/buffers | No exclusive-resource conflict, travel/working hours checked | Proposed or confirmed without other clients' private calendar details |
| External busy check | Staff enters/checks it manually | No automatic Google/Microsoft sync claim |
| Notification | Approved template/rule and current recipients | Business confirmation separate from delivery/attendance |
| Change reason | Required for cancellation/material rearrangement where useful | Clear updated arrangement and next response |

`datetime-local` has no timezone and does not reject all timezone/DST-invalid wall times. Collect IANA zone separately, reject nonexistent times and request an explicit choice for a repeated time. Show the resolved instant in the final review. [Date/time input](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/datetime-local), [DateTimeFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat)

### 18.6 Listing and publication content

The required public presentation contract is: stable reference/source URL; purpose; eligible locale/revision; price/currency/period and known inclusions/charges; availability and confirmation meaning; approved public locality/precision; property type; typed known/unknown bedroom/room/area data; source-supported description/features/limitations; approved media/captions/rights; safe relevant contact/actions. Not every optional fact must exist, but every displayed fact must mean exactly what the source supports.

The workbench additionally needs source references, original language, observed/effective time, human review scope/actor, private location, Seller Instructions, media relation identity/digests, locale approvals and current manifest/generation. These internal fields must not all be sent to the public browser. Preview and publication are different projections of the same exact candidate, with appropriate disclosure.

Human-reviewed terms and protected facts cannot be replaced by prettier prose. Generated descriptions must not infer sea views, usable area, bedrooms, building condition, access rights, ownership, legal compliance or returns. Altered/staged media must carry an approved disclosure and cannot erase a material defect.

### 18.7 Proposal, instruction and document forms

Proposal fields are parties and their roles, Case/Interest/Listing revision, amount/currency/basis, conditions, expiry with timezone, version, permitted recipients and the exact requested next-step decision. Seller Instructions additionally record representation scope, marketing permission, public location precision and media rights. Drafting these fields is not legal validation.

Document request fields are purpose, requested class, intended audience, why needed, optional due condition, acceptable alternative and review owner. Upload rows show original filename safely, detected type/size, transfer/sealing/scan state, version and allowed recovery. A potentially unsafe filename is text, never executable markup or a filesystem path exposed to clients.

Publication review fields are exact manifest/source/locale/media hashes, prerequisite decisions, affected current public state, actor capability and destination. The browser submits the candidate identity/revision; the server derives authority and rejects stale or ineligible requests. Do not submit an unchecked UI Boolean called `approved` as the whole business contract.

### 18.8 Content ranges the design must withstand

Test short and long Unicode names, 120-character localized property headings, multi-line location labels, a price with long formatted currency/period qualification, zero/one/twenty-five photos, missing floor plan, eight unknown fact fields, a 2,000-character inquiry, 100-message thread, 50-Interest Case, 100-row paginated operational list and a 1,000-row staged import. These are design/load fixtures, not promises to render every item at once.

Show safe truncation with an accessible expand/detail action for secondary text. Never truncate the distinguishing Listing reference, amount/basis, action effect, recipient/audience, critical error or condition required to decide. Long data must not create whole-page horizontal overflow at 320 px.

## 19. Localization, direction, copy and content governance

### 19.1 Seven complete public/client task experiences

Review all interface dictionaries, forms, hints, errors, status messages, receipts, navigation, email templates, preference/recovery flows and accessibility labels in each enabled public/client language. Staff BG/EN/RU coverage includes dense tables, errors and privileged review—not just menu translations.

BG remains the editorial source. Every public content locale is independently approved for its source revision. If a Listing has no approved Hebrew translation, Hebrew interface controls may offer a labeled switch to approved BG content; they must not make BG prose look like approved Hebrew inventory or include it in Hebrew indexing/counts. Do not mix machine drafts into cards, metadata, structured data or emails to hide translation gaps.

Separate interface locale, content locale, contact-language preference, stored original evidence language and time zone. A locale switch changes presentation, not facts, money, identity, grants or appointment instants. Keep a stable object through a switch when permitted and explain content unavailability.

### 19.2 Hebrew and mixed-direction composition

Set the actual page `lang` and `dir` independently; Hebrew requires RTL direction, not merely `lang="he"`. Use logical spacing/insets/alignment. Mirror navigation progression and suitable directional arrows, not logos, photography, floor-plan orientation, familiar media symbols or every numeral.

Known-language passages differing from the interface—such as a BG source excerpt in an English review screen—carry appropriate element-level `lang` as well as needed direction metadata. Follow the language-of-parts exceptions for proper names, technical terms and indeterminate language rather than marking every borrowed word. Directional isolation alone does not select screen-reader pronunciation. [Language of parts](https://www.w3.org/WAI/WCAG22/Understanding/language-of-parts)

Isolate whole formatted money values and mixed content. Known Latin references and phone numbers use appropriate isolated LTR spans; unknown-language names/addresses use directional isolation/automatic direction as appropriate. Do not reverse strings, manually reposition punctuation or strip formatting controls blindly. Copied phone/reference text must retain the correct logical character order. [HTML direction](https://www.w3.org/International/questions/qa-html-dir), [Inline bidirectional text](https://www.w3.org/International/articles/inline-bidi-markup/)

Test actual Hebrew with `+359` phone formatting, Latin stable reference, Greek address, Cyrillic name, parentheses, currency, decimal separators, date/time and trailing punctuation in the same sentence. Comparison column order and calendar reading behavior are consciously defined and tested; RTL is not a CSS transform of a screenshot.

### 19.3 Numbers, units and calendar meaning

Use locale-aware formatting such as `Intl.NumberFormat` with the stored explicit currency; this never performs currency conversion. Preserve original historical source amounts and currency. Formatting output may legitimately differ across browser implementations; tests compare meaning and accessible presentation rather than hand-built exact punctuation strings. [NumberFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat)

EUR is the final architecture's default new BG/GR presentation currency. Period and price basis remain explicit. Never compare monthly rent with purchase price or substitute a converted amount as the canonical fact. Area units/basis and number-of-rooms vocabulary need locale review.

Dates use explicit month/day meaning and timezone where ambiguity affects a commitment. Relative labels such as “tomorrow” have an absolute date available. Staffed response windows follow actual service hours/holidays/coverage policy; the browser's timezone does not silently redefine a deadline.

### 19.4 Copy matrix and forbidden overclaims

| Situation | Approved meaning to communicate | Do not say |
|---|---|---|
| Inquiry committed | Request received; reference; next staffed step | Broker contacted, viewing booked, message delivered |
| Viewing preferences submitted | Viewing requested; agency will confirm | Your booking is confirmed |
| Provider accepted email | Accepted by email provider; delivery pending/unknown if so | Read by client |
| Document passed malware scan | Scan complete; named human review pending | Legally verified, ownership proven |
| Translation reviewed | Approved for specified source/locale | Property facts independently verified |
| AI output applied | Draft inserted for human review | AI approved/published/sent |
| Proposal accepted for next step | Recorded agreement to proceed under stated process | Sale completed, legally signed, money secured |
| Availability review expired | Confirmation required; last meaningful observation | Available now, freshly verified |
| External portal task recorded | Manual action pending or evidence recorded | Automatically published everywhere |
| Privacy request received | Received; owned review under approved policy | All data erased immediately |
| Snapshot restored | Restored candidate under validation; safety checks pending | Everything is safe because backup succeeded |

Errors explain action and recovery in plain language. Do not paste database/provider errors into the interface. Retain a safe support/Operation reference; private raw payloads and tokens never appear in toasts, screenshots intended for support, analytics or logs.

### 19.5 Content ownership and review

Each public claim has a responsible source/reviewer under architecture policy. Agency identity, contact details, staff languages, hours, service regions, media rights, review assignments and professional-process copy are operator inputs; design fixtures cannot silently become production content. A missing input has a safe disabled/unpublished state and a gate, not fabricated filler.

Use synthetic private identities in design files. Real private customer notes, documents or screenshots require an authorized purpose and protection; never distribute them as generic component examples. Public images used in high-fidelity designs must be approved source material or clearly labeled synthetic examples, not misleading property representations.

## 20. Frontend implementation and state contracts

### 20.1 Architecture boundary

Implement within the selected Next.js/React/Payload TypeScript application and shared CSS-token/component system. Use server-rendered public semantic content and normal forms as the dependable baseline; client islands enhance filters, maps, media and task editing. Ordinary browse/search/detail/inquiry must remain usable with delayed or disabled JavaScript. Do not build separate public/client/staff data authorities or a second CSS framework.

Server/domain commands own persistence, authorization, state transitions, exact approvals and external-effect intent. Frontend owns transient interaction, draft presentation and truthful feedback. It consumes authorized projections, never raw internal collections hidden with CSS. Transport schemas are shared/validated; UI validation is not security.

### 20.2 View-model minimums

| View model | Data the UI must receive explicitly | Must not infer |
|---|---|---|
| PublicListing | Stable reference, manifest/revision, locale/purpose, typed public facts, price basis, public location precision, availability/freshness, approved media and allowed actions | Ownership/legal validity, unknown feature truth, exact private location |
| SearchResult | Query identity, normalized filters, eligible items, count classification, cursor, source timestamp and partial scope | Zero results from an error; total count from loaded rows |
| CaseSummary | Type, stage, disposition, owner, next action, blockers, safe participant projection and revision | Progress from activity count or one Interest's result |
| Interest | Case/Listing/revision identity, explicit state/feedback, known match reasons and questions | Universal probability-of-fit score |
| Appointment | Requested/proposed/current arrangements, zone/instant, host/access checks, revision, allowed actions and notification outcomes | Confirmed slot from a calendar click or provider acceptance |
| ReviewCandidate | Subject/source hashes, scoped approvals, diff, prerequisites, affected destinations and eligibility | Publish permission from a full form or translated draft |
| Message | Audience/channel, draft/approval revision, logical ID and observed transport state | Read receipt, delivery or recipient permission from local submission |
| Document | Purpose/classification/audience, immutable version, upload/scan/review states and allowed actions | Safety/legality from filename, MIME string or upload completion |
| Operation | Logical ID, accepted/local/external classification, durable status, per-item outcomes and allowed recovery | Failure from timeout or cancellation from closing a view |

A public read returns one internally coherent presentation snapshot. A later action rechecks current data; a detail page need not constantly erase itself while someone reads, but it must not commit using obsolete authority. Changes relevant to a decision are shown before the action completes.

### 20.3 State ownership and persistence

| State | Owner/persistence | Restore rule |
|---|---|---|
| Public committed search | Validated URL plus server query | Back/refresh/direct link reruns eligible query |
| Draft filters | Local view state | Cancel discards; Apply commits; not silently mixed with previous query |
| Selected/open media | Safe route/history state where useful | Restore valid item after media/eligibility load; safe parent fallback |
| Device saves | Local storage where available, Listing IDs only | Explain scope/failure; merge explicitly for invited signed-in client |
| Private server records | Server with current grants | Every read reauthorizes; no private service-worker cache |
| Staff/client draft | In-memory plus server draft where explicitly saved | Revision-guarded acknowledgment; no automatic localStorage of private bodies |
| Anonymous submission | Server-issued logical key plus host-only receipt-session cookie | Reconcile same logical request; public reference alone exposes no body |
| Consequential operation | Durable server Operation | Refresh/return polls same identity; never infer resend from lost response |
| Layout preference | Local nonsensitive preference | Cannot change permission, grant or canonical business state |

Safe in-tab draft preservation is allowed, but it is not a guarantee against tab/process loss. Tell the user when work is only local. Sensitive drafts must not survive sign-out into another person's session. Do not store auth/share capability tokens in analytics, query parameters used for tracking, or public logs.

#### 20.3.1 Public-to-client saved-selection transfer

The two hosts are distinct origins. Never attempt cross-origin localStorage access, broaden the private cookie domain, put account credentials in a URL or use a permissive cross-origin message listener to make merging appear automatic.

1. On the explicit public “Bring these saves to my account” action, collect only user-selected Listing IDs. Create a server-side transfer under the public creator/receipt session using normal same-origin CSRF protection. Bound each transfer to at most 100 distinct validated IDs; if more are selected, ask the user to choose a batch rather than silently truncate. Store no notes, private Brief fields, authentication credentials or inferred Case assignment.
2. Issue an unguessable transfer nonce expiring after 30 minutes. Send it through an explicit top-level HTML form POST to the allowlisted client handoff endpoint. That narrow endpoint verifies the exact source Origin, nonce, target and expiry; do not relax ordinary client command CSRF policy. It establishes a host-only continuation context and redirects to a clean client route. Never carry the nonce in a URL, referrer, analytics or request-body logs. A GET, scanner preview or redirect does not consume the transfer or merge saves.
3. Authenticate through the client application if needed. Require existing invitation/grant-based eligibility; the import is not open account/Case registration. Display current-account context and a merge review: new additions, existing saves and safe unavailable items. The private client session stays on its own host. Cancel/expired authentication preserves public local selections.
4. Explicit confirmation atomically binds/consumes the transfer for the current client identity and unions the selected IDs with existing personal saves using an idempotent operation. Recheck current item eligibility and authorization. Unavailable items are reported without restricted fields; no server item is deleted and no Case Interest/private share is created implicitly. Concurrent or repeated confirmation returns the same outcome only to the same authorized client; another identity cannot reuse the transfer.
5. Show the durable merge result on the client host. A public-origin status check may reveal only generic completion/count to its original creator session, never account identity or existing server saves. Retain local IDs until this acknowledgment; default to retaining them afterward as well. “Clear this device's saves” is a separate explicit action. If the transfer expires or the source session is lost, start a fresh transfer from retained selections; an already committed merge remains idempotently visible to its client owner.

Test the actual public and client hosts, not two routes on one origin: existing server saves, blocked localStorage, interrupted login, wrong identity, expired/consumed nonce, lost acknowledgment, repeat submission and concurrent additions. A successful local mock of one-origin merging does not pass AT08/AT36/AT41.

### 20.4 Async races and navigation

Every asynchronous result is checked against request identity, current route/query/record identity, expected revision and current identity/session generation. Abort obsolete work when useful, but abort alone is not the correctness mechanism. An A→B→A navigation must reject A's earlier response if it belongs to the earlier visit. Sign-out/sign-in must reject all prior-session callbacks.

After a mutation, reconcile the authoritative response and revalidate affected projections; do not globally replace all state or lose another unsaved draft. Background refresh cannot overwrite a dirty form. Submission buttons use stable logical identity and server idempotency, not merely a disabled flag.

For browser history choose browser versus app scroll restoration deliberately. Initialize history state and restore selection/scroll/focus after the corresponding authorized content exists. `pushState`/`replaceState` do not themselves emit `popstate`; a history entry does not magically serialize React state. [History API](https://developer.mozilla.org/en-US/docs/Web/API/History_API/Working_with_the_History_API), [popstate](https://developer.mozilla.org/en-US/docs/Web/API/Window/popstate_event)

Native modal close requests and router Back must be coordinated: one gesture closes one layer, not both the dialog and underlying page. `showModal()` and nonmodal `show()` have different behavior; `aria-modal` alone supplies no focus/inertness. Test Escape, explicit close, allowed backdrop and mobile close requests against one draft policy. [Dialog behavior](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog), [Cancel event](https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/cancel_event)

### 20.5 Mutations, errors and exact outcomes

Commands submit logical `operationId`, expected revision where relevant and validated payload. The server derives Principal/authority. Same logical key with changed payload is a conflict. Successful mutation/audit/outbox commits atomically; external work follows independently. The response contract is more important than any specific HTTP library.

| Result/error class | Frontend behavior | Forbidden behavior |
|---|---|---|
| Accepted local command | Show committed state/version and any pending effects; durable link | Pretend all external work completed |
| Accepted asynchronous work | Show durable phase/status and safe navigation away | Invent a progress percentage or requeue on refresh |
| Validation, normally 422 | Retain input, linked field summary, focus recovery | Clear form or expose raw server exception |
| Session/authentication, normally 401 | Correct-context reauthentication, safe draft handling, re-review | Auto-replay send/approval after login |
| Forbidden/not found | Safe limited/not-found state under disclosure policy | Reveal another Case's title, participants or hidden field values |
| Revision/idempotency conflict, normally 409 | Preserve local input; current diff or deliberate new intent | Blind retry with a new key or last-write-wins |
| Rate/quota, normally 429 | Explain permitted retry/alternative and retain input | Rapid retry loop or fake task completion |
| Explicitly rejected with no effect | State known nonacceptance and correctable reason | Call it accepted because optimistic UI already changed |
| Timeout/connection lost/ambiguous failure | Reconcile existing Operation; show unknown until resolved | Treat every 5xx as definitely unsent and encourage duplication |

Do not build a global toast interceptor that treats every 2xx as a business success or every timeout as a safe retry. Use typed outcome semantics. Redacted support references may be copied; no client-facing dump of protected payload/provider credentials.

### 20.6 Media and authenticated-view lifecycle

An upload authorization writes only to staging. Finalization seals a new server-only immutable object; scan/review/derivatives bind to its digest. The UI must show transfer complete while scan remains pending and cannot substitute the client filename or requested MIME as proof. Reusing a still-valid staging URL cannot alter the approved asset.

Private downloads—including range requests—reauthorize through the application. No public direct bucket URLs or long-lived signed-download workaround. On detected revocation/sign-out clear private caches and previews. History restoration reauthorizes before reveal; active views refresh authorization on focus/visibility return and bounded polling. Already delivered bytes cannot be erased remotely, and the product does not claim otherwise.

Media order is relation-based. A move-before/move-after command has the current order revision and stable relation identity; hidden/unsupported/paginated relations retain relative order. If a full-replacement permutation is ever exposed, it includes every stored relation exactly once. A visible subset is not a gallery manifest.

### 20.7 Performance and loading contract

Target public p75 LCP ≤2.5 s, INP ≤200 ms and CLS ≤0.1 under the architecture's measured field policy; prelaunch lab evidence must be labeled as such. Reserve image dimensions, prioritize the actual first meaningful photo, lazy-load below-fold media/maps and avoid loading all seven font/content bundles for one page. [Core Web Vitals](https://web.dev/articles/vitals)

Initial loading placeholders reflect likely content but contain no fake business values. Keep navigation and valid task controls responsive. Search/filter interaction cannot wait for optional maps/AI. Load private tabs by authorized need without leaking their data in hidden markup. Large lists use pagination and bounded rendering; virtualization must preserve keyboard/screen-reader relationships and a usable fallback.

Use the architecture's p95 API and load targets, then profile the real complete task. Do not solve a slow UI by hiding incomplete states, skipping validation or adding a second search/state authority without an approved architecture change.

## 21. Provider failures, maintenance and recovery UX

### 21.1 Dependency-degradation matrix

| Dependency/problem | Public/client experience | Staff/operations experience | Recovery invariant |
|---|---|---|---|
| Database/app unavailable | No false request receipt; truthful maintenance/contact fallback | Incident and frozen consequential work | Preserve/reconcile logical requests; do not assume acceptance |
| Search unavailable | Retained filters, explicit error/retry/contact | Affected query/runtime evidence | Never display an outage as zero matches |
| MapTiler blocked/slow | Full list and textual location remain usable | Provider exception where relevant | No exact-private-coordinate fallback |
| WorkOS unavailable | Safe login/retry/contact; no private exposure | Identity incident, existing sessions governed by policy | No emergency local-password bypass |
| Resend delayed/unknown | Committed Inquiry/Case message remains; delivery state truthful | Owned delivery/ingress reconciliation | No blind duplicate send, especially beyond dedupe window |
| R2/media unavailable | Facts/contact still usable where eligible; missing media explained | Asset/publication coverage exception | Missing required media blocks relevant new publication |
| Scanner stale/down | Upload remains processing/quarantined | Queue with owner and freshness issue | No unscanned file becomes ready/public |
| AI unavailable/budget exhausted | Ordinary search/contact/client tasks unaffected | Existing human draft/manual task remains usable | No authority or accepted work depends on model success |
| Worker stopped/backlogged | Local acceptance distinct from pending notification/job | Backlog/lease/heartbeat incident | Resume idempotently, fence stale approvals/generations |
| Monitoring unavailable | No fabricated status promise | Explicit loss of observability and alternate incident check | Missing telemetry is not healthy state |
| Backup/safety-ledger lag | Usually no public interruption by itself | Prominent recovery risk and blocked promotion | Newer restrictions must not be lost on restore |
| Privacy/access revoked | Subsequent requests denied; detected UI clears | Current grant/audit visible to authorized staff | Old sessions/callbacks/caches cannot regrant access |

### 21.2 Maintenance and cutover

The maintenance page is a real lightweight fallback with agency identity, verified contact route, truthful service status and no submission-success simulation. It must remain usable when the application is unavailable and contain no invented restoration time. A technical incident does not entitle the page to disclose operational secrets.

During migration/cutover exactly one authoritative intake/write path is active, or the truthful contact fallback is shown. Staff UI indicates read-only/frozen mode before they begin an edit and explains already-running Operation status. Old workers cannot continue sending/publishing behind a new UI.

Legacy routing, public current facts, client/staff login, inquiry/receipt, media and mail are verified on actual canonical hosts after authorized cutover. A static preview or localhost screenshot cannot satisfy that gate. Do not show a “Launch complete” operator badge while required post-cutover evidence is pending.

### 21.3 Restore, rollback and incidents

Application rollback preserves current customer data and commitments. A restored database candidate begins with external effects disabled, restored sessions invalidated and a clearly marked operator-only validation state. Show current restoration point, known loss window, safety-ledger watermark/completeness and remaining checks without exposing secrets.

Reapply independently retained newer access/consent/deletion/publication restrictions. If completeness is unknown, affected access/publications remain closed; unknown scope means all restored private grants and public publications. Operators need explicit tasks and evidence, not a bulk “Resume everything” button. Outbound messages and public content resume only after current authority and external outcome reconciliation.

The selected architecture's independent archive is not a second live cloud. Do not place an eight-hour whole-provider-failover promise in public copy or a status page. Provider-wide outages use the independently monitored maintenance/contact and incident process.

## 22. Acceptance traceability and validation

### 22.1 Required evidence levels

Design review proves that necessary states and decisions are represented. Interactive prototype review proves navigation and intended behavior with labeled synthetic data. Frontend integration tests prove behavior against controlled real contracts. A deployed candidate proves identity, data, permissions and external integrations in that environment. Live cutover/operating evidence proves the actual released path. No level substitutes for the next.

Each frame/prototype/test records screen ID, flow ID, actor, relevant S-states, locale/direction/viewport, data fixture/version, command/outcome and applicable architecture AT IDs. Every included screen has at least a complete success task and its material refusal/failure/recovery task. Retired screen IDs have negative scope tests asserting no route/navigation/capability was accidentally introduced.

### 22.2 Architecture acceptance mapped to design/frontend work

This table maps every architecture scenario exactly once; the architecture retains its original pass conditions. “Coverage” means a required design/test home, not a claim that the scenario has passed.

| Architecture ID | Designer/frontend obligation and primary home |
|---|---|
| AT01 | Public no-registration and no-JavaScript browse/search/detail/inquiry; F01–F06, P01/P02/P05/P11/P12 |
| AT02 | Filter/detail/Back/refresh and obsolete-query response; F02, P02/P03, §20.4 |
| AT03 | Seven-locale complete search/inquiry/recovery and Hebrew composition; public/client contracts, §19 |
| AT04 | Unknown fact/feature/price basis and explicit hard-filter behavior; P03/P05/P07/O07/O14 |
| AT05 | Unapproved/stale-locale exclusion across results/counts/map/metadata; P02/P04/P05/O15/O16 |
| AT06 | Map failure retains equivalent list task; P04/P22, §21.1 |
| AT07 | Exact reference, spelling and locale alias fixture results; P02/P03, §18.2 |
| AT08 | Saved/compare persistence failure, changed/withdrawn Listing, actual cross-host reviewed merge and retry; P07/P08/C05, §20.3.1 |
| AT09 | Public share privacy, creator management, expiry, lost-session limit and authoritative revocation; P08/P09/C05 |
| AT10 | Double submission and lost acknowledgment; P11/P12/P18/P19 |
| AT11 | Changed-payload conflict and safe receipt access; P11/P12, §20.5 |
| AT12 | Accepted Inquiry survives mail/AI/process failure with owner; P12/O01/O03/O25 |
| AT13 | Database failure has no success receipt; P11/P12 and maintenance fallback |
| AT14 | Staffed-hour escalation and useful human response distinct from receipt; O01/O03/O18/O24 |
| AT15 | One Case, five Interests, independent outcomes; C03/C05/O05/O07 |
| AT16 | Same person buyer/seller and scoped Case audiences; C03/C11/C17/O06 |
| AT17 | Handover/revocation preserves work ownership; O01/O18/O23 |
| AT18 | Owner intake versus assessed authority/instructions/preview; P18/C11/C12/O11/O14 |
| AT19 | Concurrent draft/fact edits preserve input and diff; O12/O14 and shared S14 |
| AT20 | Relation-safe media reorder with hidden/paginated items; O13, UI23, §20.6 |
| AT21 | Protected facts survive input/import/translation; O12/O14/O15/O28, §18/§19 |
| AT22 | Exact approval scope and honest same-person review; C12/O15/O16/O21 |
| AT23 | Source change invalidates affected stale approval; O15/O16/O32/O33 |
| AT24 | Correct/restrict affected public views before replacement; P05/P21/C05/O33 |
| AT25 | Withdrawn generation cannot be resurrected; O17/O33 and stale-Operation result |
| AT26 | No alternate CRUD/admin/job publishing bypass; O12/O16/O24, integration/permission tests |
| AT27 | Eligible revision consistency across all public representations; P02/P05/P07/P10/O17 and deployed checks |
| AT28 | Media restriction/purge and no private original/EXIF leakage; P06/O13/O17/O33 |
| AT29 | Request/proposal distinct from confirmation; P13/P14/C06/O09 |
| AT30 | Concurrent resource conflict with preserved proposed input; O08/O09 |
| AT31 | DST/timezone/travel-buffer intent preserved; C06/O08/O09, §18.5 |
| AT32 | Reschedule old/current/replacement and ICS state; P14/C06/O09 |
| AT33 | Cancel/no-show/completion resource and follow-up; C06/O09/O18 |
| AT34 | Proposal revision/expiry/counter prevents obsolete decision; C10/O19 |
| AT35 | Closeout evidence and remaining obligations without legal overclaim; C16/O05/O19 |
| AT36 | Correct identity application/token and local membership; C01/O23 and protected-route negative tests |
| AT37 | Real staff MFA enrollment/challenge, lost-factor recovery and safe step-up return; F13 staff variant, O23/O24 |
| AT38 | Invitation GET/scanner/wrong-recipient/revocation; C01/C02/C17 |
| AT39 | Subsequent-access revocation, cache clear and history reauthorization; C07–C09/C17, §20.6 |
| AT40 | Record/field/audience allow-and-deny coverage; §02 and every protected contract |
| AT41 | CSRF/host/header/direct-origin/hidden-endpoint denial; transport integration tests, no UI-only claim |
| AT42 | Upload/seal/type/size/scan/object failures and non-overwritable reviewed bytes; C09/O13/O20 |
| AT43 | Authorized private download/range/export and bucket isolation; C08/O20/O26 |
| AT44 | Purpose withdrawal stops queued alerts; P10/C13/O25 |
| AT45 | Privacy export isolation and restore-safe restriction; C18/O26, §21.3 |
| AT46 | Human-reviewed send once across retry/crash; C07/O02/UI22/UI27 |
| AT47 | Unknown send and provider dedupe-window reconciliation; O25 and message-status UI |
| AT48 | Forged/replayed/out-of-order webhook outcome handling; O02/O25 and integration tests |
| AT49 | Ambiguous/spoofed incoming sender and quarantine; O02/O03/O20 |
| AT50 | At-least-once work/recovery without duplicate logical effect; O17/O25/O28/UI27 |
| AT51 | Stale source/revoked actor cancels consequential queued action; O16/O25/O32/O33 |
| AT52 | Untrusted AI input cannot authorize effects; protected facts/source validation; O32 |
| AT53 | AI timeout/refusal/budget/source change keeps manual workflow; O12/O15/O32 |
| AT54 | Human-reviewed AI corpus and correction-effort evidence; O32/assistance acceptance packet |
| AT55 | Dry run/no-overwrite/import per-row outcomes; O28 |
| AT56 | Merge cannot widen access; aliases/split history; O06/O27 |
| AT57 | Exact frozen legacy URL/canonical/locale outcomes on both domains; P21 and cutover packet |
| AT58 | Correct media manifest units and actual referenced assets; P06/O13/O17 and migration packet |
| AT59 | Single authoritative write/worker owner at cutover; read-only/maintenance and O24/O25 |
| AT60 | Pinned deployed web/worker/migration artifacts; release-evidence panel, not a prototype badge |
| AT61 | Complete-task keyboard/screen-reader/zoom/motion/forced-colors/mobile-keyboard tests; §06/§22 |
| AT62 | Architecture performance/load and urgent-work prioritization; P02/P05/O01/O25, §20.7 |
| AT63 | Real alert delivery and affected-work ownership; O25 and incident handoff |
| AT64 | Recovery, newer safety tail, session invalidation and no external replay; §21.3/O24/O25/O26 |
| AT65 | Rollback preserves postdeployment inquiries/commitments; P12/O03/O18 and release drill |
| AT66 | Agency can operate accounts/access/budgets/runbooks; O23–O25 and operator training |
| AT67 | One release/policy/evidence verdict; blocked cannot appear passed; O24 release panel |
| AT68 | Real post-cutover domain/mail/search/intake/auth/media/SEO proof; release panel and deployed packet |

### 22.3 High-value complete prototype/test scenarios

These 24 scenarios are the required end-to-end demonstrators. They supplement, rather than replace, all flow/screen contracts and the 68 architecture tests. Each has a controllable fixture and a visible, inspectable final state; a clickable happy path alone is not sufficient.

| ID | Scenario | Required end state/evidence |
|---|---|---|
| UX01 | Mobile visitor searches, applies two filters, opens detail, inspects media and returns | Same committed criteria, loaded position and meaningful focus; no stale overwrite |
| UX02 | Visitor encounters zero results, then map failure | Explicit criterion change produces results; list task remains complete without tiles |
| UX03 | Three Listings compared; one price changes and another withdraws | Current safe facts/unknowns shown, selection intent preserved, no stale decision |
| UX04 | Device storage blocked; invited client crosses actual public/client hosts, interrupts login, resumes import with existing saves, then revokes a public share | Temporary/expired states truthful; reviewed idempotent merge preserves server saves/audience; creator revocation blocks recipient access without exposing management authority |
| UX05 | Inquiry double tap plus lost acknowledgment after commit | One received Inquiry and receipt; next staffed step; no duplicate retry |
| UX06 | Database fails before Inquiry commit; JavaScript is unavailable | No false success, usable HTML recovery/contact and safe retained input where possible |
| UX07 | Owner consultation with unknown facts and failed optional photo | Accepted minimal request; no ownership verification or public Listing claimed |
| UX08 | Seller reviews exact preview while broker changes source | Old acknowledgment rejected as stale; new diff and correct scope shown |
| UX09 | Invitation scanner opens link, then wrong client, then right client | GET consumes nothing; no wrong-person disclosure; explicit scoped acceptance |
| UX10 | One person has buyer and seller Cases; collaborator has narrower grants | Correct context/fields/documents; no cross-Case or participant leakage |
| UX11 | Buyer evaluates five Interests, declines one and proposes a Brief change | Other Interests intact; proposed Brief revision does not rewrite Proposal terms |
| UX12 | Two staff propose then confirm overlapping viewings across a DST edge | Proposals hold no resources; one valid resource commitment, lost-proposed-slot recovery and correct instant |
| UX13 | Client requests reschedule while email notification fails | Old confirmation retained until replacement; business state separate from delivery |
| UX14 | Sensitive upload completes transfer, scan stalls, then staging URL is reused | Reviewed bytes stay immutable; pending/quarantine and recovery truthful |
| UX15 | Access revoked while a document view and another request are open | Subsequent access denied; detected cache clear/history reauthorization; no new leakage |
| UX16 | Message succeeds at provider but acknowledgment is lost, then retry window expires | Outcome remains unknown/reconciled; no blind second send |
| UX17 | Proposal is countered/expires while a client is reviewing it | Exact stale version cannot be accepted; preserved question/current review |
| UX18 | Staff enrollment, lost-factor recovery and sensitive-action reauthentication; then absence/revocation with appointments and due promises | Real provider/local checks, no automatic action replay or recovery bypass; receiving owner/coverage acceptance and all commitments retained |
| UX19 | Locale draft approved, then material price/disclosure correction arrives | Affected exposure restricted before replacement; valid generation/approvals respected |
| UX20 | Media reorder with hidden relations, two editors and keyboard/tap controls | Complete correct order, conflict recovery, usable non-drag operation and announcement |
| UX21 | AI draft contains unsupported fact/source pointer, then provider becomes unavailable | Unsafe proposal rejected, no effect, manual work remains usable |
| UX22 | Import has protected-field conflicts and partial failure; duplicate merge would widen access | Explicit subset/per-row outcome and protected permissions, safe reversal path |
| UX23 | Alert unsubscribe/privacy restriction occurs after a backup; restore loses primary data | Newer safety decisions replayed or access/publications remain closed; no old send replay |
| UX24 | Authorized cutover with legacy URLs, missing evidence and an incident | Single active writer, truthful public behavior, blocked verdict cannot be made green |

### 22.4 Cross-cutting validation matrix

| Dimension | Minimum required coverage | Acceptance rule |
|---|---|---|
| Viewports | 320, representative 390/414, 768, 1024 and 1440 CSS px; wide operational review where relevant | No lost action/data or whole-page overflow; narrow alternatives complete the task |
| Input | Keyboard only, pointer/touch, screen reader, mobile virtual keyboard | All task actions operable; drag/swipe/hover are never sole mechanisms |
| Access | Visitor, invited client, narrow collaborator, broker, coordinator, editor/translator, publisher, manager/privacy/release capability | Positive and negative record/field/action tests; same human in different contexts |
| Public/client locale | BG, EN, RU, DE, NL, EL, HE | Complete representative task, all shipped strings/templates reviewed; real Hebrew mixed-direction content |
| Staff locale | BG, EN, RU | Complete triage, workbench, review and privileged error/recovery flows |
| Content | Minimum, typical, maximum and missing/conflicting values from §18.8 | No semantic truncation, fabricated data, broken reading order or shifted actions |
| Network | Normal, slow, offline, interrupted, lost acknowledgment, provider-specific failure | Honest local/external outcomes and durable recovery without duplicate effects |
| Concurrency | Two editors, two confirmers, source changed mid-review, route A→B→A, sign-out/sign-in | Revision/session guards; input preserved; no cross-identity display |
| User settings | 200% text zoom, 400% zoom/reflow, reduced motion, forced colors | Content/function remains perceivable and usable under applicable WCAG requirements |
| Lifecycle | New, active, paused, closed, restricted, withdrawn, revoked and restored | Actual authority and history preserved; unsafe stale action not executable |

Do not mechanically multiply every cosmetic variant into thousands of identical frames. Cover every distinct authority, behavior, task, layout and meaningful content state. Reuse annotated component/state references; do not use reuse to omit the most dangerous combinations, such as RTL + validation, mobile keyboard + sticky actions, and revoked session + pending download.

The supported browser policy is the current and previous stable major versions of Chrome, Edge and Firefox on supported Windows/macOS releases, and Safari on the current and previous supported macOS/iOS major releases. Android Chrome is supported on the current and previous stable browser major on devices capable of the baseline web platform. Freeze exact OS/browser versions in each release's test manifest; “latest” is a support policy, not a reproducible test result. Older/embedded browsers receive progressive fallback and a truthful unsupported-capability message rather than a blanket denial of public information/contact.

| Test environment | Required representative tasks |
|---|---|
| Windows 11, Chrome and Edge; Firefox separately | Public acquisition, staff workbench/review, concurrency, keyboard, downloads and actual provider authentication |
| Supported macOS, Safari; Chrome smoke coverage | Public/client continuity, history/cache, upload, dialog/focus and staff critical tasks |
| iOS Safari, current and previous supported major | Search/filter/media, virtual keyboard, inquiry, invitation, document upload, viewing response and mobile Back |
| Android Chrome | The same compact critical journeys, upload/picker behavior and recovery under poor connectivity |
| NVDA with Firefox and Chrome on Windows | Form errors/status, data/compare tables, modal entry/return, Case/document task and permission recovery |
| VoiceOver with Safari on macOS and iOS | Reading order, dialog dismissal, compact navigation, mixed-language/RTL task and authentication |
| TalkBack with Chrome on Android | Touch exploration, form entry, non-drag media controls, upload status and client task completion |

Use real-device checks for mobile virtual keyboards, platform Back and file selection, not only desktop viewport emulation. Record assistive-technology version and speech language/voice used, with any availability limitation; a missing Hebrew voice is not a successful Hebrew task review. Browser/assistive-technology combinations differ, so one unspecified screen-reader run cannot establish support. [W3C implementation/testing caution](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/dialog/)

### 22.5 Human evaluation and severity

Before design acceptance, conduct at least six task-based sessions covering a mobile buyer, cross-border/low-familiarity buyer, seller/landlord, tenant, broker and coordinator/reviewer; roles can overlap only if the real context is represented. Include a competent Hebrew reader using the actual RTL task. Separately obtain qualified review of every shipped locale and applicable professional/process claim. These are minimum coverage sessions, not statistically representative proof of usability.

Observe task completion without coaching, incorrect assumptions, missed next action, trust/availability misunderstandings, repeated data entry, recovery success and broker correction effort. Record failures and quotes without retaining unnecessary personal data. Prototype tests use synthetic private content; production examples need appropriate approval.

Privacy leakage, wrong-recipient action, false receipt, duplicate consequence, incorrect commercial fact, stale approval, inaccessible critical task or unusable recovery is release-blocking. Repeated inability to understand request versus confirmation is also a material product defect. Minor visual issues may be accepted only with bounded impact and named disposition; no severe issue is waived because the prototype looks polished.

### 22.6 What automation can and cannot establish

Automate schema/validation, state transitions, permission matrices, concurrency/idempotency, route/history restoration, source-generation fencing, actual integration outcome classification and critical browser tasks. Add accessibility and visual-regression checks to meaningful states. A snapshot does not prove focus behavior; a green accessibility scanner does not prove complete-task conformance; a mocked provider does not prove live delivery.

Visual QA compares intended frame and actual implementation at the same viewport/content/state. Inspect text wrapping, hierarchy, control meaning, focus, errors, audience and recovery—not only pixel similarity. Where accessible reflow requires adaptation from a static frame, document the correct behavior rather than reproducing a design defect.

## 23. Design-file organization and implementation handoff

### 23.1 Required design-file structure

Organize one shared system with clear public, client, staff and operational spaces:

1. **Read me / authority:** architecture/spec versions, scope, exclusions, roles, ID legend, release boundaries and current review status.
2. **Foundations:** tokens, typography, spacing, grids, density, icons, image rules, accessibility and language/direction examples.
3. **Shared components:** UI01–UI32 with meaningful variants, data limits, keyboard/focus notes and S-state references.
4. **Public:** P01–P24 grouped by discovery, evaluation, intake, reading/support; retired semantics visibly excluded.
5. **Client:** C01–C18 grouped by access, continuity, decision, communication/evidence and privacy; C15 marked retired, not designed as a feature.
6. **Staff:** O01–O33 grouped by work, inventory/publication, operations and settings; O31 marked retired.
7. **Flow prototypes:** F01–F32 and UX01–UX24 with entry, branch and final-state links; bounded services clearly labeled.
8. **Responsive/localized:** compact/medium/desktop/wide variants and actual Hebrew direction/content; not a pile of mechanically mirrored frames.
9. **Acceptance/evidence:** reviewed/unreviewed status, named owner, defects/dispositions and exact links to implementation checks.

Frame names follow a stable pattern such as `P13 / viewing-request / guest / preferred-windows / he-RTL / compact-390`. Component/story names identify the UI ID and state. Do not bake volatile business status into the permanent screen ID.

### 23.2 The frame-to-code contract

Every complete screen handoff includes:

- Purpose, actor, entry/deep link, layout ID, primary action and permitted exits.
- Ordered content slots, mandatory/optional fields, realistic min/typical/max content and source/visibility class.
- Route/URL state, local draft state, server view model, command and exact accepted/rejected/unknown outcomes.
- Applicable S-states, validation/empty/failure/conflict/revocation behavior, focus/keyboard and return-context annotations.
- Compact/desktop structural behavior, sticky/scroll rules, zoom/keyboard-safe treatment and RTL/mixed-text rules.
- Required copy/media, review/translation ownership, acceptance IDs and any true operator input that blocks release.

The handoff does not consist of a screenshot with “make responsive.” Designers specify topology and decision hierarchy; developers implement semantics and verified behavior; both review the actual result with real contract-shaped data.

### 23.3 Frontend story and fixture package

Provide typed fixtures for each domain/view-model state, with stable synthetic identities and explicit versions. Include two people with the same display name, a Party with buyer/seller roles, narrow collaborator grants, several Interests, a multi-purpose Property, incomplete/contradictory facts, stale approvals, old/new media order, unknown message outcomes and restored/revoked sessions.

Stories cover component states and complete screen compositions; browser tasks cover cross-component behavior. Fault fixtures control the point of failure—before commit, after commit before response, before provider call, after provider success, after source change—so the interface cannot pass by showing one generic error page for every case.

The generated transport schema includes validation/errors, authorization class, revisions, idempotency, pagination and examples. API mocks use that schema and remain labeled mocks. The same domain command backs ordinary forms and enhanced UI; do not maintain a divergent prototype API.

### 23.4 Ownership and change control

Product/agency owner approves actual services, coverage and service promises. UX owner owns journeys, navigation and interaction consistency. Design owner owns visual/component quality and complete layouts. Frontend owner owns accessible responsive behavior and correct state projection. Backend/domain owner owns authoritative invariants and real integrations. Content/locale reviewers own their declared scope. QA/release owner assembles evidence and verifies the exact deployed candidate.

A change to scope, domain meaning, permissions, persistence, provider behavior or a release gate requires architecture review. A local visual refinement can remain within this spec if it preserves information hierarchy, complete task behavior, accessibility and tokens. Record material changes with affected IDs; do not silently return to old instant-booking, global-publish or generic-CRM patterns.

### 23.5 Asset and operator-input ledger

| Input | Owner | Safe design/development treatment until supplied |
|---|---|---|
| Legal agency identity, contacts, office/media rights | Agency owner | Explicit labeled fixture; no invented production claim |
| Staffed hours, languages, services and geographic coverage | Agency manager | Internal configurable fixture; no public response guarantee |
| Approved Listing/media/source corpus and review dispositions | Broker/publisher | Synthetic private fixtures and genuinely approved public examples only |
| Locale reviewers, terminology and notification copy | Content/locale lead | Unreviewed content remains nonpublic/nonindexable |
| Professional-process claims/checklists | Appropriate agency/professional owner | Guidance boundary, no invented legal/tax/completion claim |
| Privacy purpose/retention/holds and vendor terms | Authorized privacy/procurement owner | No real personal-data capture without accepted policy |
| Provider accounts/credentials and domain routing approval | Technical/agency/domain owners | Isolated tests; no purchase/provisioning/DNS inferred from design |
| Legacy URL/media/data manifests and current launch policy | Migration/release owners | Exact mappings and unresolved gates retained; no blanket redirects |
| Monitoring/recovery custody and on-call ownership | Operations owner | Explicit blocked acceptance until exercised with real evidence |

These are operating inputs, not invitations to reopen the selected product architecture. A missing value has a named safe state and acceptance gate. Do not hide it behind plausible-looking production text.

## 24. Dependency-based delivery through public release

### 24.1 Build complete behavioral slices

**Slice 1 — Identity and shared task foundation.** Establish three shells, tokens/components, safe authentication/authorization projections, errors, logical operations, draft/version handling and realistic fixtures. Prove narrow access and stale-session behavior before connecting private record screens.

**Slice 2 — Inventory to public truth.** Complete Property/Listing workbench, facts/media, source/locale review, preview, publication/correction and exact public presentation. Demonstrate an approved Listing and a material correction across staff/public/client-derived views.

**Slice 3 — Discovery to owned inquiry.** Complete public search, map fallback, detail, saved/compare/share, seven-locale intake/receipt and real triage/coverage. Demonstrate accepted and not-accepted/unknown states end to end, including no-JavaScript baseline.

**Slice 4 — Client and agency continuity.** Complete Case/Brief/Interest, invitations, messages/documents, scheduling, proposals, handover and closeout. Prove multi-party privacy, concurrency and recovery rather than stopping at a dashboard.

**Slice 5 — Assistance and controlled operations.** Add the three bounded draft tasks, evaluated review UI, import/merge, privacy operations, metrics/exceptions and policy/access administration. Keep manual paths complete.

**Slice 6 — Release qualification and cutover.** Finish all content/locales/accessibility/responsive acceptance; rehearse migration, recovery and rollback; resolve authority conflicts; assemble exact evidence; perform authorized routing transition and actual operating-cycle acceptance.

These slices define dependency and proof, not a calendar or permission to ship an incomplete full product. Parallel work is safe only with explicit interface/ownership boundaries and shared contracts. Page counts and merged branches are not completion metrics.

### 24.2 Release gate UX obligations

| Gate | Required UX/frontend/design contribution | What does not pass it |
|---|---|---|
| R00 Authority | Accepted scope, role/service/content policy, coherent evidence schema and resolution of existing authority conflicts | A newer attractive document or manually changed green badge |
| R01 Foundation | Correct identity context, permission/field projections, command outcomes and negative tests | Hidden buttons without server enforcement |
| R02 Inventory/publication | Exact reviews/manifests, truthful unknowns, locale/rights/disclosure and correction/withdrawal | Complete editor fields or AI draft accepted |
| R03 Discovery/intake | Complete public task and durable staffed follow-through in every enabled locale | Marketing pages plus a form that sends an untracked email |
| R04 Case continuity | Brief/Interests, schedule, Proposal, evidence, handover and closeout | A generic CRM board with missing downstream work |
| R05 Communication/privacy | Real send/receive/failure/revocation/consent/private-file behavior | Mocked “message sent,” public signed-download shortcut or bundled consent |
| R06 Assistance | Three live-evaluated draft tasks, source/diff review and manual fallback | A general chatbot or model confidence badge |
| R07 Migration/media | Exact legacy behavior, real asset references, final-delta/read-only user states | Redirect all old URLs to home or count media rows as unique objects |
| R08 Reliability/security | Designed failures plus actual load/alert/recovery/rollback proof | A polished maintenance page without a usable recovery process |
| R09 UX/content | Complete task, responsive/RTL/accessibility/localization and approved real content | Hero-only frames, English-only tests or automated scanner alone |
| R10 Candidate attestation | Exact release/evidence view, no unmet pre-cutover gate and named operator approval | “Ready” label without freshness/version/scope |
| R11 Cutover verification | Actual hosts/login/intake/media/mail/legacy/SEO observations recorded | Local browser preview or build success |
| R12 Operating acceptance | Complete staffed cycle including scheduled overnight/backup work, support handoff and no unresolved release-severity incident | Launch-day screenshot or elapsed time without evidence |

The architecture's authority-reconciliation requirement remains: PostgreSQL is the selected runtime search, but the existing Typesense/Meilisearch report obligation is not silently waived. Search Console, Yandex, backlinks, human listing review, live Hermes/Payload evidence and signed recovery obligations retain their required authority until explicitly reconciled. This document does not change those files or claim the current live system passed.

### 24.3 Operational usability is part of release

An agency operator must be able to locate an accepted request, understand a delivery failure, reassign absent staff, restrict a material error, revoke private access, review a stale translation, request a replacement document and identify the next owner without a developer narrating the interface.

Release training uses the actual candidate, current permissions and safe test data. Record runbook links from the relevant exception/settings views. Exercise at least one representative incident/unknown-outcome and one restore-safe restriction scenario. Test alert delivery to the named owner outside the failed application infrastructure.

### 24.4 Definition of done

**Design complete:** all included screen/flow contracts have mapped compositions, meaningful variants, source/field/audience rules, responsive/RTL behavior, keyboard/focus/recovery annotations and reviewed copy/assets or explicit blocking operator inputs. Retired/bounded areas are unmistakable. A separate reviewer can trace a task from entry to durable outcome.

**Frontend complete:** the actual authorized actor completes the task against the real contract; relevant refusal/failure/concurrency/recovery cases pass; state and audience survive interruptions; layout/accessibility/localization/performance meet acceptance; no placeholder success, hidden broken control or unsupported capability remains.

**Release complete:** every included capability and required gate has accepted exact deployed evidence under current operational authority; migration/cutover and staffed operating-cycle checks pass; no release-severity incident remains; the agency can operate and recover the system. Static design and this specification establish requirements, not release completion.

## 25. Research, design confidence and final handoff

### 25.1 Evidence basis

The final architecture and glossary are the primary product/domain authority. The earlier experience specification was used only for coverage reconciliation; its incompatible booking, maintenance, statement, public-AI and authority semantics were removed. Existing source code was not treated as the target UX design.

Current W3C and MDN sources linked beside requirements were checked for target sizing, focus/modal behavior, accessible authentication, non-drag alternatives, status announcements, history restoration, files, language/direction and typed date/money formatting. These sources establish platform/standard behavior, not proof that the proposed MS Realty design has been tested with customers.

The product-specific choices—intent-led entry, scoped Case continuity, exact review, compact task routes, client-first next action and staff work queues—are design judgments derived from the agency's jobs, failure costs and chosen architecture. They are not claims of universal optimality or completed user research. The evaluation plan in §22 must challenge them with real representative tasks before release.

### 25.2 Corrections relative to the earlier experience vision

The final model merges related screens into shared task workspaces while keeping all 75 contracts traceable. F27/F28, P23/C14/O29/O30 are bounded consultation, not booking/management operations. C15/O31 are retired. Client collaboration requires staff-issued scoped invitations. Public shares contain only public facts. Owner preview acknowledgment is not publishing authority. Staff Calendar is application-owned with an explicit manual external-busy check. AI is contextual draft assistance; legal completion, payments and autonomous sending remain outside scope.

Failure-sensitive behavior is now explicit: immutable uploaded bytes before scan, revision/session-aware async callbacks, durable anonymous inquiry reconciliation, current-versus-proposed viewing changes, exact publication/source binding, public-media restriction, and restore-time newer safety decisions. These are screen and interaction requirements, not backend details a designer can safely omit.

### 25.3 Deliverable and change boundary

This document is the final workflow/UI/UX/frontend baseline for the specified public release. Its companion HTML is a searchable reading edition generated from this Markdown, not a working product prototype. Neither edition may be used to claim implemented behavior or live provider proof.

The required next production artifact is a complete design/component and executable frontend-contract package under §23, delivered in §24's dependency order and validated against §22. Do not restart product discovery, reopen the selected infrastructure, or use the old document's excluded features as an implicit backlog. Change the baseline only through an explicit, traceable decision with affected screen/flow/acceptance IDs.
