import assert from 'node:assert/strict';
import test from 'node:test';
import { initPublicSearchAssistant } from '../lib/ui/public-search-assistant-client.mjs';
import { SearchAssistantDialog, SearchAssistantEntry, searchAssistantCopy } from '../lib/react-public-search-assistant.mjs';
import { renderStaticElement, h } from '../lib/react-static-html.mjs';
import { SEARCH_INTENT_INPUT_FIELDS } from '../lib/search-request.mjs';

function element(tag = 'div') {
  return { tagName: tag.toUpperCase(), dataset: {}, listeners: {}, children: [], value: '', disabled: false, hidden: false,
    addEventListener(key, fn) { this.listeners[key] = fn; },
    setAttribute() {}, removeAttribute() {}, focus() { this.focused = true; },
    replaceChildren() { this.children = []; }, appendChild(node) { this.children.push(node); },
    reportValidity() { return true; }, checkValidity() { return true; }, getClientRects() { return [1]; },
    fire(key, target = this) { return this.listeners[key]?.({ preventDefault() {}, target }); },
  };
}
function harness(search = '') {
  const dialog = element('dialog'), words = element('form'), review = element('form'), text = element('textarea');
  const submit = element('button'), check = element('button'), apply = element('button'), status = element(), unresolved = element(), list = element('ul'), preserved = element('dl'), heading = element('h3'), close = element('button'), opener = element('button');
  const fields = ['location_ids','property_families','offer_type','price_min','price_max','primary_area_min','primary_area_max','bedrooms_min','bedrooms_max'].map(name => Object.assign(element('input'), { name, type: /_(min|max)$/.test(name) ? 'number' : 'text' }));
  dialog.dataset = { locale: 'en', copy: JSON.stringify(searchAssistantCopy('en')), fields: JSON.stringify(SEARCH_INTENT_INPUT_FIELDS), searchPath: '/en/search' };
  dialog.showModal = () => { dialog.open = true; }; dialog.close = () => { dialog.open = false; dialog.fire('close'); };
  const nodes = { '[data-assistant-words]':words, '[data-assistant-review]':review, '[data-assistant-status]':status, '[data-assistant-apply]':apply, '[data-assistant-unresolved]':unresolved, '[data-assistant-preserved]':preserved, '[data-assistant-close]':close };
  dialog.querySelector = s => nodes[s]; words.elements = { text }; words.querySelector = () => submit;
  review.querySelector = s => s === 'h3' ? heading : check; review.querySelectorAll = () => fields; unresolved.querySelector = () => list;
  const filters = element('form'); filters.values = { price_min:'325.25', price_max:'875.50', bedrooms_min:'2' };
  const doc = { querySelector:s => s === '[data-search-assistant]' ? dialog : filters, querySelectorAll:s=>s==='[data-search-assistant-open]'?[opener]:[filters], createElement:element };
  const requests = [], navigations = [], window = { location: { origin:'http://local.test', search, assign:value=>navigations.push(value) } };
  class FormData { constructor(form) { this.form = form; } forEach(fn) { Object.entries(this.form.values).forEach(([k,v])=>fn(v,k)); } }
  new Function('document','window','fetch','FormData',`(${initPublicSearchAssistant.toString()})();`)(doc,window,(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve,reject})),FormData);
  opener.fire('click'); text.value = 'apartment in Sandanski';
  return { dialog, words, review, text, fields, apply, status, unresolved, list, filters, requests, navigations, close, opener,
    async respond(body, code = 200, index = requests.length-1) { requests[index].resolve({ok:code===200,status:code,json:async()=>body}); await new Promise(resolve=>setImmediate(resolve)); },
  };
}
const receipt = (overrides = {}) => ({ kind:'search_interpretation', locale:'en', original_query:'apartment in Sandanski', applied:false, requires_confirmation:true, message:'Review before applying.', proposed_intent:{location_ids:['Sandanski'],property_families:['apartment'],price_min:325.25,price_max:875.5,bedrooms_min:2,parking_kinds:['garage']}, proposed_url:'/en/search?search_intent=reviewed', unresolved:[{text:'with a lift'}], ambiguities:[], ...overrides });

test('the review sends exact live typed ranges and does not navigate until explicit apply', async()=>{
 const ui=harness(); ui.words.fire('submit'); ui.words.fire('submit'); assert.equal(ui.requests.length,1);
 assert.deepEqual(JSON.parse(ui.requests[0].options.body).current,{price_min:'325.25',price_max:'875.50',bedrooms_min:'2'});
 await ui.respond(receipt()); assert.equal(ui.navigations.length,0); assert.equal(ui.apply.disabled,false); assert.equal(ui.list.children[0].textContent,'with a lift');
 ui.apply.fire('click'); assert.equal(ui.navigations[0],'http://local.test/en/search?search_intent=reviewed');
});
test('editing words aborts a pending response and cannot restore stale filters',async()=>{
 const ui=harness(); ui.words.fire('submit'); ui.text.value='house'; ui.text.fire('input'); assert.equal(ui.requests[0].options.signal.aborted,true);
 await ui.respond(receipt()); assert.equal(ui.apply.disabled,true); assert.equal(ui.review.hidden,true); assert.equal(ui.text.value,'house');
});
test('live filters changing while checking or before apply invalidate the proposal',async()=>{
 for(const during of [true,false]){const ui=harness();ui.words.fire('submit');if(during)ui.filters.values.price_max='900';await ui.respond(receipt());if(!during)ui.filters.values.price_max='900';ui.apply.fire('click');assert.equal(ui.navigations.length,0);assert.equal(ui.apply.disabled,true);}
});
test('review edits preserve other canonical criteria and send only deliberately reviewed fields',async()=>{
 const ui=harness();ui.words.fire('submit');await ui.respond(receipt());const max=ui.fields.find(x=>x.name==='price_max');max.value='990.25';ui.review.fire('input',max);assert.equal(ui.apply.disabled,true);ui.review.fire('submit');
 const body=JSON.parse(ui.requests[1].options.body);assert.equal(body.current.search_intent.price_max,990.25);assert.deepEqual(body.current.search_intent.parking_kinds,['garage']);assert.deepEqual(body.reviewed_fields,['price_max']);
});
test('clearing a filter from a canonical URL is preserved as an explicit choice',async()=>{
 const ui=harness('?search_intent=%7B%22price_max%22%3A500%7D');ui.filters.values.price_max='';ui.words.fire('submit');assert.equal(JSON.parse(ui.requests[0].options.body).current.price_max,'');
});
test('unchanged form projections cannot replace a canonical multi-select',async()=>{
 const intent=JSON.stringify({property_families:['apartment','house'],price_max:875.5});const ui=harness('?search_intent='+encodeURIComponent(intent));ui.words.fire('submit');const current=JSON.parse(ui.requests[0].options.body).current;assert.deepEqual(current,{search_intent:intent});
});
test('an invalid interpreted range still exposes current fields for explicit recovery',async()=>{
 const ui=harness();ui.words.fire('submit');await ui.respond(receipt({proposed_intent:null,proposed_url:null,criteria:{price_min:325.25,price_max:875.5},ambiguities:[{required_fields:['price_min','price_max']}]}));assert.equal(ui.review.hidden,false);assert.equal(ui.fields.find(x=>x.name==='price_min').value,'325.25');assert.equal(ui.apply.disabled,true);
});
test('ambiguous or unsafe proposals cannot be applied',async()=>{
 for(const overrides of [{proposed_url:null,ambiguities:[{field:'price_max',options:[500,900]}]},{proposed_url:'https://evil.invalid/en/search'},{proposed_url:'//evil.invalid/en/search'},{proposed_url:'/admin'},{original_query:'different'},{locale:'bg'},{applied:true}]){
 const ui=harness();ui.words.fire('submit');await ui.respond(receipt(overrides));assert.equal(ui.apply.disabled,true);ui.apply.fire('click');assert.equal(ui.navigations.length,0);}
});
test('service failure and rate limits preserve text and allow retry',async()=>{
 for(const code of [429,503]){const ui=harness();ui.words.fire('submit');await ui.respond({},code);assert.equal(ui.text.value,'apartment in Sandanski');assert.equal(ui.apply.disabled,true);ui.words.fire('submit');assert.equal(ui.requests.length,2);}
});
test('closing cancels work, keeps the words, and restores focus',async()=>{
 const ui=harness();ui.words.fire('submit');ui.close.fire('click');await ui.respond(receipt());assert.equal(ui.apply.disabled,true);assert.equal(ui.opener.focused,true);assert.equal(ui.text.value,'apartment in Sandanski');
});
test('all seven locale dialogs expose named, editable controls and hidden progressive entries',()=>{
 for(const locale of ['bg','en','ru','de','nl','el','he']){
 const page={kind:'home',locale,body:{search:{path:`/${locale}/search`}},chrome:{nav:[]}};
 const html=renderStaticElement(h(SearchAssistantDialog,{page}));assert.match(html,/aria-labelledby="psa-title"/);assert.match(html,/maxLength="240"/);assert.match(html,/name="price_min" type="number" min="0" step="any"/);assert.match(html,/name="bedrooms_max" type="number" min="0" step="1"/);assert.ok(html.includes(searchAssistantCopy(locale).title));
 assert.match(renderStaticElement(h(SearchAssistantEntry,{page})),/hidden/);
 assert.ok(html.indexOf('data-assistant-unresolved')<html.indexOf('data-assistant-apply'), 'unconfirmed wishes precede the apply action');
 }
});
