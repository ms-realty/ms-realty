import test from 'node:test';
import assert from 'node:assert/strict';
import { renderReactAdminBody } from '../lib/react-admin-site.mjs';
import { renderAdminTaskQueuePayload } from '../lib/admin-payloads.mjs';
import { loadLocaleRegistry } from '../lib/locales.mjs';
import { ADMIN_APP_JS, PUBLIC_APP_JS } from '../lib/ui/client.mjs';

const registry = loadLocaleRegistry();
const authored = { task_id: 'call-owner', origin: 'authored', kind: 'authored', task_type: 'call', subject_ref: 'MS-CRAWL-0001', owner: 'Review operator', priority: 'normal', status: 'open', note: 'Check access.', overdue: false, completion: { mode: 'ledger' } };
const source = { task_id: 'lead:needs-reply', origin: 'derived', kind: 'lead', subject_ref: 'Original enquiry', owner: 'Review operator', priority: 'urgent', status: 'open', overdue: true, completion: { mode: 'delegated', route: '/admin/leads' } };
function page(rows = [authored, source]) {
  return renderAdminTaskQueuePayload(registry, 'en', { rows, summary: { total: rows.length, overdue: rows.filter(r=>r.overdue).length, authored: rows.filter(r=>r.origin==='authored').length, completable: rows.filter(r=>r.origin==='authored').length } });
}
test('Daily task selection carries exact record context and keeps source completion in its owning route', () => {
  const html = renderReactAdminBody(page());
  assert.match(html, /data-daily-workspace="task"/);
  assert.match(html, /href="#task-lead%3Aneeds-reply" data-daily-select="task-lead:needs-reply"/);
  assert.match(html, /id="task-lead:needs-reply" data-daily-detail/);
  assert.match(html, /href="\/admin\/leads(?:\?locale=en)?"/);
  assert.equal([...html.matchAll(/action="\/api\/admin\/tasks\/action"/g)].length, 1);
  assert.match(html, /name="humanConfirmed"[^>]*required/);
  assert.match(html, /id="task-call-owner-note"[^>]*required/);
  assert.match(html, /data-daily-task-status/);
  assert.doesNotMatch(html, /Example|Hermes.*proposal/);
});
test('read-only and unavailable task workspaces retain source navigation and omit mutation forms', () => {
  for (const mode of ['permission', 'runtime']) {
    const data = page();
    if (mode === 'permission') data.workspace.operator_capabilities = ['operations:read'];
    else data.runtime_data_mode = 'durable_only';
    const html = renderReactAdminBody(data);
    assert.doesNotMatch(html, /action="\/api\/admin\/tasks/);
    assert.match(html, /href="\/admin\/leads(?:\?locale=en)?"/);
    assert.match(html, /Changes are unavailable/);
  }
});
test('empty tasks show the empty state with no invented record or detail', () => {
  const html = renderReactAdminBody(page([]));
  assert.match(html, /data-task-empty="true"/);
  assert.doesNotMatch(html, /data-daily-detail/);
});
test('Daily enhancement is admin-only and both generated scripts parse', () => {
  assert.match(ADMIN_APP_JS, /initAdminDaily/);
  assert.match(ADMIN_APP_JS, /initDailyTaskForms/);
  assert.doesNotMatch(PUBLIC_APP_JS, /initAdminDaily|initDailyTaskForms/);
  assert.doesNotThrow(()=>new Function(ADMIN_APP_JS));
});

test('task submission reads the action attribute even when an input is named action, and locks ambiguous results', async () => {
  const { initDailyTaskForms } = await import('../lib/ui/admin-daily.mjs');
  const originals = { window: globalThis.window, FormData: globalThis.FormData, fetch: globalThis.fetch };
  const handlers = {};
  const submit = { disabled: false };
  const note = { textContent: '' };
  const reload = { hidden: true };
  const status = { querySelector: selector => selector === 'p' ? note : reload, getAttribute: name => name };
  const form = {
    action: { name: 'action', value: 'task_completed' },
    querySelector: selector => selector === '[data-daily-task-status]' ? status : submit,
    addEventListener: (name, fn) => { handlers[name] = fn; },
    checkValidity: () => true, reportValidity: () => true,
    setAttribute() {}, removeAttribute() {},
    getAttribute: name => name === 'action' ? '/api/admin/tasks/action' : null,
  };
  const calls = [];
  try {
    globalThis.window = { location: { hash: '' }, addEventListener() {} };
    globalThis.FormData = class { *[Symbol.iterator]() { yield ['action', 'task_completed']; yield ['taskId', 'call-owner']; } };
    globalThis.fetch = async (url, options) => { calls.push({ url, body: JSON.parse(options.body) }); throw new Error('lost response'); };
    initDailyTaskForms({ querySelectorAll: () => [form] });
    await handlers.submit({ preventDefault() {} });
    assert.equal(calls[0].url, '/api/admin/tasks/action');
    assert.equal(calls[0].body.action, 'task_completed');
    assert.equal(note.textContent, 'data-unknown');
    assert.equal(submit.disabled, true);
    assert.equal(reload.hidden, false);
    await handlers.submit({ preventDefault() {} });
    assert.equal(calls.length, 1, 'an ambiguous submission is not repeated');
  } finally {
    Object.assign(globalThis, originals);
  }
});

test('viewing selection retains its exact record and keeps unmatched follow-ups accessible', () => {
  const data = { ...page([]), kind: 'admin_viewings', path: '/admin/viewings',
    viewings: [{ id: 'viewing-1', lead_id: 'lead-1', listing_reference: 'MS-CRAWL-0001', broker: 'review-broker', channel: 'phone', status: 'booked', starts_at: '2026-09-06T12:00:00Z' }],
    viewingFollowUpWritable: false,
    viewingFollowUpQueue: { rows: [
      { viewing_id: 'viewing-1', task: 'feedback', viewing_status: 'booked', task_status: 'open', listing_reference: 'MS-CRAWL-0001' },
      { viewing_id: 'not-in-schedule', task: 'follow_up', viewing_status: 'completed', task_status: 'open', listing_reference: 'MS-CRAWL-0002' },
    ] },
  };
  const html = renderReactAdminBody(data);
  assert.match(html, /data-daily-workspace="viewing"/);
  assert.match(html, /data-daily-select="viewing-viewing-1"/);
  assert.match(html, /id="viewing-viewing-1" data-daily-detail/);
  assert.equal([...html.matchAll(/data-viewing-follow-up-row="true"/g)].length, 2);
  assert.match(html, /data-viewing-id="not-in-schedule"/);
  assert.match(html, /2026-09-06T12:00:00Z/);
  assert.doesNotMatch(html, /action="\/api\/admin\/viewings\/follow-up"/);
  assert.match(html, /A saved appointment does not confirm calendar delivery/);
});

test('task actor is required and an authenticated identity cannot be edited', () => {
  const data = page(); data.workspace.operator_id = 'operator-actual';
  const html = renderReactAdminBody(data);
  const actors = [...html.matchAll(/<input[^>]*name="actor"[^>]*>/g)].map(match=>match[0]);
  assert.equal(actors.length, 2);
  for (const actor of actors) {
    assert.match(actor, /required/);
    assert.match(actor, /readOnly/);
    assert.match(actor, /value="operator-actual"/);
  }
});

test('an authored task without a subject still has a searchable queue title and matching detail title', () => {
  const html = renderReactAdminBody(page([{ ...authored, subject_ref: null, kind: 'owner_call' }]));
  assert.match(html, /<strong>call-owner<\/strong>/);
  assert.match(html, /<h2>call-owner<\/h2>/);
  assert.match(html, /owner call/);
});
