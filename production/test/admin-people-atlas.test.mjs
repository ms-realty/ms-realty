import test from 'node:test';
import assert from 'node:assert/strict';
import { renderReactAdminBody } from '../lib/react-admin-site.mjs';
import { renderAdminContactsPayload } from '../lib/admin-payloads.mjs';
import { loadLocaleRegistry } from '../lib/locales.mjs';

const registry=loadLocaleRegistry();
const contact={id:'contact:one',display_name:'Review Contact',contact:{email:'review@example.test'},preferred_channel:'email',lead_ids:['lead:one'],lead_count:1,duplicate_leads:0,assigned_brokers:[],languages:['bg'],communication_event_count:0,latest_received_at:'2026-09-06T12:00:00Z'};
const account={id:'family-one',label:'Review family',type:'family',contact_count:1};
function page(){return renderAdminContactsPayload(registry,'en',{contacts:[contact,{...contact,id:'contact:two',display_name:'Second Contact',lead_ids:['lead:two'],account_id:account.id,account_label:account.label,account_type:'family'}],accounts:[account]});}

test('People directory search and selection use exact contact identities and preserve enquiry links',()=>{
 const html=renderReactAdminBody(page());
 assert.match(html,/data-daily-workspace="contact"/);
 assert.match(html,/data-daily-search/);
 assert.match(html,/data-daily-tags="no_account"/);
 assert.match(html,/data-daily-tags="with_account"/);
 assert.match(html,/href="#contact-contact%3Aone" data-daily-select="contact-contact:one"/);
 assert.match(html,/id="contact-contact:two" data-daily-detail/);
 assert.match(html,/href="\/admin\/leads\?locale=en#lead-lead%3Aone"/);
 assert.match(html,/href="mailto:review@example.test"/);
 assert.equal([...html.matchAll(/data-contact-record=/g)].length,2);
});

test('Account creation and linking remain attributed, confirmed and scoped to the selected contact',()=>{
 const data=page();data.workspace.operator_id='review_broker';
 const html=renderReactAdminBody(data);
 assert.match(html,/action="\/api\/admin\/accounts"/);
 assert.match(html,/action="\/api\/admin\/accounts\/link"/);
 assert.match(html,/name="contactId" value="contact:one"/);
 assert.doesNotMatch(html,/name="contactId" value="contact:two"/);
 assert.match(html,/name="actor" value="review_broker"/);
 assert.match(html,/name="humanConfirmed"[^>]*required/);
 assert.match(html,/name="linkConfirmed"[^>]*required/);
 assert.match(html,/name="reason"[^>]*required/);
 assert.match(html,/data-account-record="family-one"/);
});

test('Read-only and empty directories keep their actual scope without exposing mutation forms',()=>{
 const data=page();data.workspace.operator_capabilities=['operations:read'];
 const html=renderReactAdminBody(data);
 assert.doesNotMatch(html,/action="\/api\/admin\/accounts/);
 assert.match(html,/data-contact-record="contact:one"/);
 const empty=renderReactAdminBody(renderAdminContactsPayload(registry,'en',{contacts:[],accounts:[]}));
 assert.match(empty,/data-empty-contacts="true"/);
 assert.doesNotMatch(empty,/data-daily-detail=/);
 assert.match(empty,/No family or company accounts yet/);
});
