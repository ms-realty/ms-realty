# Workspace navigation and personal settings

O01/X02 and the personal O23/F30 variant share the existing brand, tokens, native controls and authorization model. The sidebar owns general workspace navigation; individual work pages retain contextual actions and pagination.

## Destinations and layout

- Work groups Today, Inquiries, Calendar and Tasks. People & property groups Deals, Listings and Contacts. Only destinations supported by the caller's current grants appear.
- All pages opens a permission-filtered directory. Its filter searches destination names and descriptions, not agency records. A real record search, when supplied, remains separately labelled.
- The desktop sidebar has expanded and compact modes. The toggle acts immediately after hydration and persists a non-sensitive browser preference. Its native POST validates the origin, live staff access, mode and local return path.
- Phones use the same directory in a native modal drawer. At ordinary heights the header, filter, account and language controls remain available while destinations scroll. Short viewports use one scrolling surface with a persistent Close header so account controls do not squeeze out the destinations. Desktop uses a stable-sized dialog so filtering does not move the controls.
- A native account disclosure exposes Profile & settings, permitted agency access management and sign out. Names and email remain readable in its expanded content; the compact rail retains their accessible label.
- Settings uses ordinary links to Profile, Preferences and Security. A separate Agency view appears only when a supported administrative destination is permitted. Phones use a native section disclosure so longer Bulgarian and Russian names remain fully visible. Each link works without JavaScript, retains its current-page indication and preserves locale.
- Authorized team management, absence, offboarding and optional backup enrolment retain the workspace shell and a contextual return. Absence/offboarding return to the staff directory; backup enrolment returns to Security. Initial sign-in, initial enrolment and recovery remain focused access journeys.

## Interaction and recovery

Opening the directory moves focus to the page filter. Tab remains inside the native modal. Escape closes one open disclosure or the dialog, and returns focus to the actual opener. The desktop page picker also supports Control/Command K outside editable controls; it does not consume typing in a form. Ordinary navigation remains available without JavaScript.

A profile save changes only the current staff principal's display name. Email, identity, roles and grants are absent from the accepted input. The command rereads the live session, membership and passkey policy, then uses the existing operation ledger, canonical request digest, row lock and revision guard. Repeating the same operation replays its receipt; a changed payload or stale revision cannot overwrite a newer profile.

Validation retains the entered name and links its error. A conflict shows the entered and current values and requires an explicit reviewed reapply with a new signed operation identity. A lost acknowledgement keeps the draft read-only and links the exact operation's status. Status reads cannot replay a command or reveal another person's receipt. A historical receipt shows the recorded name and time, with a separate link to the current profile.

One verified passkey remains sufficient for staff access. A backup is optional; adding it uses the existing fresh-verification ceremony. Personal settings do not create an email-change, role-change or credential-management shortcut.

## Performance boundary

The gateway checks access, source identity and release/migration gates on every request. Queue/web startup is needed only when the chosen route reaches the application origin. Running roles retain fresh identity and readiness checks; only prepared roles receive a start command. Each request shares its own origin-start promise, with no cross-request authorization or readiness cache.

The workspace layout reuses its first verified access result within that request. A single fresh grant projection supplies navigation and held-capability views. Destination guards and command authorization remain independent.

## Evidence boundary

Disposable database commands and actual local browser journeys qualify implementation behavior. Screenshots qualify the rendered layout at the observed sizes. They do not establish real passkey creation, hosted response-time improvement, human language review, owner acceptance or production release readiness. R00–R12 and the retained launch authority continue to govern deployment.
