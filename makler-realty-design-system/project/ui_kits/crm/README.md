# MS Realty — Agent CRM UI kit

The MS Realty **back office** — the internal tool the agency's brokers use to
work leads, schedule viewings and manage the agency's stock. Composed from the
design-system components, with a set of CRM-specific building blocks added in
`CrmKit.jsx`. `index.html` is an interactive click-through.

**Dashboard → Leads pipeline → Lead detail → Contacts → Listings → Calendar → Reports**, plus a multichannel **Messages** inbox.

## Run it
Open `index.html`. It loads `../../styles.css` + `../../_ds_bundle.js` (the compiled
component library), Lucide, React + Babel, then the files below in order.

## Chrome & theme
Dark **Ink** sidebar (the brand charcoal, with the reversed logo) + light warm-Stone
content area — the classic back-office split, kept firmly on-brand. **Brick** red is
the single accent (active nav, hot leads, alerts); Ink is the workhorse. Admin
chrome is available in Bulgarian, Russian and English; this static kit shows the
Bulgarian agent-facing voice with moderately compact tables.

## Files
| File | What |
|---|---|
| `crm-data.js` | Sample content: 12 leads with dynamic lead languages including Greek and Hebrew/Israel, real Sandanski/Pirin/coast/Greece interest, 10 stock items, 10 contacts, this week's 9 viewings, tasks, activity, KPIs, reports data. Money via `eur()`. |
| `CrmKit.jsx` | Chrome + primitives: `Sidebar`, `Topbar`, `Avatar`, `StatTile`, `DataTable` (sortable), `StatusPill`, `Timeline`, `TaskList`, `KanbanCard`, `Segmented`, `PageHeader`, `Panel`, `Temp`, `Lang`. Kit-local CSS (`crmCss`). |
| `Dashboard.jsx` | KPIs, today's viewings, new leads, today's tasks, activity feed. |
| `Pipeline.jsx` | Kanban board — Нови → Оглед насрочен → Оферта → Спечелени, with per-column totals and a deal-type filter. |
| `Messages.jsx` | Multichannel inbox — conversation list (WhatsApp / имейл / сайт / SMS, unread + online) + thread with dark/light bubbles, per-message **Виж оригинала** translation toggle, quick-reply chips and composer. Self-injects its own CSS. |
| `LeadDetail.jsx` | Lead facts, stage stepper, matched listings, notes/activity timeline, tasks. |
| `Contacts.jsx` | Directory table with a buyer/seller/tenant/landlord type filter. |
| `Listings.jsx` | The agency's stock — status, views, enquiries, agent, per-status filter. |
| `Calendar.jsx` | Week viewings scheduler (09:00–19:00), agent-coloured blocks, today highlighted. |
| `Reports.jsx` | Sales funnel, lead sources, monthly deals/commission, agent leaderboard. |

## Interaction map
- Sidebar nav switches screens; **Лийдове**, **Съобщения** and **Огледи** show live counts.
- Dashboard **new leads** / any **kanban card** / a **Messages** thread's *Отвори лийда* → that lead's detail; **Обратно** returns to the pipeline.
- Tables sort on header click; filters (deal, type, status) update the view.
- Task checkboxes toggle; the calendar shows the week's viewings by agent colour.

## Notes
- Screens read primitives from `window.MaklerRealtyDesignSystem_9b7f1e` and export
  themselves to `window` (Babel scripts don't share scope), so the load order in
  `index.html` matters: `crm-data.js` → `CrmKit.jsx` → screens → inline `App`.
- Cosmetic recreation: sorting/filtering update local UI state; nothing persists.
- The CRM primitives (`DataTable`, `KanbanCard`, `StatTile`, `Timeline`, `TaskList`,
  `Sidebar`/`Topbar`) live in this kit. If the back office grows, promote them to
  formal DS components (`.d.ts` + `.jsx` + card) — they're written to that shape.
- Best viewed ≥ 1080px (desktop tool). Below 760px the sidebar hides.
