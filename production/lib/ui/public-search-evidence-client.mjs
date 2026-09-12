export function initPublicSearchEvidence() {
  var dialog=document.querySelector('[data-search-evidence]'); if(!dialog || typeof dialog.showModal!=='function')return;
  var copy=JSON.parse(dialog.dataset.copy),labels=JSON.parse(dialog.dataset.labels),allowed=JSON.parse(dialog.dataset.fields),base=JSON.parse(dialog.dataset.criteria);
  var result=dialog.querySelector('[data-evidence-result]'),status=dialog.querySelector('[data-evidence-status]'),changeForm=dialog.querySelector('[data-evidence-change]');
  var retry=dialog.querySelector('[data-evidence-retry]'),apply=dialog.querySelector('[data-evidence-apply]'),wishes=dialog.querySelector('[data-evidence-wishes]');
  var mode='',listingId='',opener=null,generation=0,controller=null,proposal=null,sourceHash=null,sourceChanged=false,snapshot='',lastChange=null,changedForm=null,listingCriteria={};
  var forms=Array.from(document.querySelectorAll('[data-search-filter-form]')),initial=new Map();
  forms.forEach(function(form){var values={};new FormData(form).forEach(function(v,k){values[k]=v;});initial.set(form,values);['input','change'].forEach(function(event){form.addEventListener(event,function(){changedForm=form;if(dialog.open){cancel();result.replaceChildren();status.textContent=copy.changed;}});});});
  function criteria(){
    var value=dialog.dataset.kind==='listing'?Object.assign({},listingCriteria):JSON.parse(JSON.stringify(base));
    if(dialog.dataset.kind==='listing')return value;
    var form=changedForm||forms.find(function(f){return f.getClientRects().length;})||forms[0];
    if(form)new FormData(form).forEach(function(v,k){if(allowed.includes(k)&&typeof v==='string'&&initial.get(form)[k]!==v)value[k]=v;});
    return value;
  }
  function textValue(v){return v==null||v===''||(Array.isArray(v)&&!v.length)?copy.any:Array.isArray(v)?v.join(', '):typeof v==='object'?Object.values(v).map(textValue).join(' · '):String(v);}
  function label(key){return labels[key]||key.replace(/_/g,' ');}
  function add(parent,tag,text){var node=document.createElement(tag);if(text!==undefined)node.textContent=text;parent.appendChild(node);return node;}
  function cancel(){generation++;if(controller)controller.abort();controller=null;proposal=null;apply.disabled=true;retry.disabled=false;changeForm.querySelector('[type="submit"]').disabled=false;dialog.removeAttribute('aria-busy');}
  function safeLink(raw,searchOnly){try{var u=new URL(raw,location.origin);if(!['http:','https:'].includes(u.protocol))return null;if(searchOnly&&(u.origin!==location.origin||u.pathname!==dialog.dataset.searchPath))return null;return u.href;}catch(_){return null;}}
  function showCriteria(value){
    var dl=dialog.querySelector('[data-evidence-criteria]');dl.replaceChildren();var intent=value.search_intent||value;
    if(typeof intent==='string'){try{intent=JSON.parse(intent);}catch(_){intent={};}}
    Object.entries(intent).forEach(function(row){if(['schema_version','locale','mandatory_filters','page','page_size','sort','price_currency'].includes(row[0])||row[1]==null||row[1]===''||(Array.isArray(row[1])&&!row[1].length))return;add(dl,'dt',label(row[0]));add(dl,'dd',textValue(row[1]));});
    if(value.nl_context){add(dl,'dt',copy.words);add(dl,'dd',value.nl_context);}
    wishes.hidden=!value.nl_context;wishes.textContent=copy.wishes+(value.nl_context?' '+value.nl_context:'');
  }
  function sourceDetails(source,parent){
    if(!source)return;var details=add(parent,'details'),summary=add(details,'summary',copy.source),dl=add(details,'dl');
    [[copy.reviewer,source.reviewer],[copy.reviewed,source.reviewed_at],[copy.version,source.source_hash]].forEach(function(row){if(row[1]){add(dl,'dt',row[0]);add(dl,'dd',row[1]);}});
    var href=safeLink(source.canonical_url,false);if(href){var a=add(details,'a',copy.readListing);a.href=href;}
  }
  function renderMatch(body){
    if(['unavailable','source_changed'].includes(body.status)){sourceChanged=body.status==='source_changed';status.textContent=body.status==='source_changed'?copy.sourceChanged:body.message||copy.failure;sourceDetails(body.source,result);var href=opener&&safeLink(opener.dataset.listingHref,false);if(href){var link=add(result,'a',copy.readListing);link.href=href;}return;}
    if(body.status==='no_criteria'){status.textContent=copy.noCriteria;var a=add(result,'a',copy.entry);a.href=dialog.dataset.searchPath;return;}
    var statuses={matched:copy.matched,not_matched:copy.different,unknown:copy.unknown,unsupported:copy.unsupported};
    body.comparisons.forEach(function(row){var section=add(result,'section');add(section,'h3',label(row.field));add(section,'p',copy.criteria+': '+textValue(row.requested));add(section,'strong',statuses[row.status]||copy.unsupported);if(row.evidence)add(section,'p',textValue(row.evidence.value));if(row.reason==='literal_words_only')add(section,'p',copy.literal);if(row.reason==='stated_area_only')add(section,'p',copy.areaOnly);});
    sourceDetails(body.source,result);sourceHash=body.source&&body.source.source_hash;sourceChanged=false;
    status.textContent='';
  }
  function renderAlternative(body){
    status.textContent=body.status==='unavailable'?(body.message||copy.failure):body.status==='no_supported_alternative'?copy.noAlternative:'';
    if(body.status==='unavailable')return;
    body.alternatives.forEach(function(item){
      var section=add(result,'section');add(section,'h3',label(item.change.field));add(section,'p',copy.before+': '+textValue(item.change.before)+' → '+copy.after+': '+textValue(item.change.after));
      if(typeof item.matching_reviewed_listings==='number')add(section,'p',String(item.matching_reviewed_listings)+' · '+copy.countScope);
      (item.source_examples||[]).forEach(function(source){var href=safeLink(source.canonical_url,false);if(href){var a=add(section,'a',source.listing_id);a.href=href;}});
      if(body.status==='preview'){
        if(body.alternatives.length===1 && item.requires_confirmation===true && item.applied===false && safeLink(item.proposed_url,true)){proposal=item;apply.disabled=false;}
      }else{var button=add(section,'button',copy.preview);button.type='button';button.className='mk-btn mk-btn--secondary';button.addEventListener('click',function(){request({field:item.change.field,value:item.change.after});});}
    });
  }
  async function request(change){
    cancel();result.replaceChildren();var activeForm=changedForm||forms.find(function(f){return f.getClientRects().length;})||forms[0];if(activeForm&&!activeForm.checkValidity()){status.textContent=copy.changed;return;}var own=generation,current=criteria(),ownListing=listingId; snapshot=JSON.stringify(current);lastChange=change||null;
    showCriteria(current);status.textContent=copy.loading;retry.disabled=true;changeForm.querySelector('[type="submit"]').disabled=true;dialog.setAttribute('aria-busy','true');controller=new AbortController();
    var input={locale:dialog.dataset.locale,criteria:current};if(mode==='match'){input.listingId=listingId;if(sourceHash)input.sourceHash=sourceHash;}else if(change)input.change=change;
    try{
      var response=await fetch(mode==='match'?'/api/listings/match':'/api/search/alternatives',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify(input)});var body=await response.json();
      if(own!==generation)return;if(snapshot!==JSON.stringify(criteria())||ownListing!==listingId){cancel();status.textContent=copy.changed;return;}
      if(!response.ok){status.textContent=response.status===429?copy.rate:body.message||copy.failure;return;}
      if(body.kind!==(mode==='match'?'listing_match_explanation':'search_alternatives')||body.locale!==dialog.dataset.locale||body.applied!==false)throw new Error('invalid_receipt');
      showCriteria({search_intent:body.criteria,nl_context:current.nl_context||body.original_query||''});
      if(mode==='match'){if(body.listing_id!==listingId||!Array.isArray(body.comparisons)||(body.source&&body.source.listing_id!==listingId)||body.comparisons.some(function(row){return row.evidence&&(!body.source||row.evidence.listing_id!==listingId||row.evidence.source_hash!==body.source.source_hash);}))throw new Error('wrong_listing');renderMatch(body);}else{if(!Array.isArray(body.alternatives)||body.result_count!==null||body.count_scope!=='current_human_approved_source_records')throw new Error('invalid_count');renderAlternative(body);}
    }catch(error){if(own===generation&&error.name!=='AbortError')status.textContent=copy.failure;}
    finally{if(own===generation){controller=null;retry.disabled=false;changeForm.querySelector('[type="submit"]').disabled=false;dialog.removeAttribute('aria-busy');}}
  }
  function loadListingContext(id){
    try{var saved=JSON.parse(sessionStorage.getItem('ms-realty:match-context')||'null');if(saved&&saved.listingId===id&&saved.locale===dialog.dataset.locale&&Date.now()-saved.at<1800000)return saved.criteria;}catch(_){}
    var params=new URLSearchParams(location.search),value={};params.forEach(function(v,k){if(allowed.includes(k)||['search_intent','nl_context'].includes(k))value[k]=v;});return value;
  }
  document.querySelectorAll('[data-evidence-open]').forEach(function(button){button.hidden=false;var help=button.closest&&button.closest('[data-search-help]');if(help)help.hidden=false;button.addEventListener('click',function(){
    cancel();opener=button;mode=button.dataset.evidenceOpen;listingId=button.dataset.listingId||'';sourceHash=null;sourceChanged=false;listingCriteria=mode==='match'&&dialog.dataset.kind==='listing'?loadListingContext(listingId):{};
    dialog.querySelector('#pse-title').textContent=mode==='match'?copy.matchTitle:copy.alternativesTitle;dialog.querySelector('[data-evidence-note]').textContent=mode==='match'?copy.matchNote:copy.alternativesNote;dialog.querySelector('[data-evidence-reference]').textContent=listingId;
    var property=dialog.querySelector('[data-evidence-property]');
    if(property){property.replaceChildren();property.hidden=true;var card=Array.from(document.querySelectorAll('article[data-listing-id]')).find(function(node){return node.dataset.listingId===listingId;})||(dialog.dataset.kind==='listing'?document.querySelector('main[data-kind="listing"]'):null);if(mode==='match'&&card){property.hidden=false;var title=card.querySelector('h1,h2,h3'),photo=card.querySelector('img');if(photo&&photo.currentSrc){var image=add(property,'img');image.src=photo.currentSrc;image.alt=photo.alt||'';}if(title){var heading=add(property,'h3',title.textContent);heading.lang=title.lang||card.getAttribute('data-content-language')||dialog.dataset.locale;}add(property,'p',listingId);}}
    changeForm.hidden=mode!=='alternatives';apply.hidden=mode!=='alternatives';dialog.showModal();retry.focus();request();
  });});
  document.addEventListener('click',function(event){var anchor=event.target.closest&&event.target.closest('a');var card=anchor&&anchor.closest('[data-search-card][data-listing-id]');if(!card||dialog.dataset.kind!=='search')return;try{sessionStorage.setItem('ms-realty:match-context',JSON.stringify({listingId:card.dataset.listingId,locale:dialog.dataset.locale,criteria:criteria(),at:Date.now()}));}catch(_){} });
  dialog.querySelector('[data-evidence-close]').addEventListener('click',function(){dialog.close();});dialog.addEventListener('close',function(){cancel();if(opener)opener.focus();});
  retry.addEventListener('click',function(){if(sourceChanged)sourceHash=null;request(lastChange);});
  changeForm.elements.field.addEventListener('change',function(){cancel();var field=changeForm.elements.field.value,input=changeForm.elements.value,family=changeForm.elements.family;family.hidden=field!=='property_families';family.disabled=family.hidden;input.hidden=!family.hidden;input.disabled=input.hidden;input.type=field==='location_ids'?'text':'number';input.required=field!=='location_ids';input.step=field.startsWith('bedrooms')?'1':'any';input.value='';status.textContent=copy.oneChange;});
  changeForm.addEventListener('input',function(){cancel();lastChange=null;status.textContent=copy.oneChange;});
  changeForm.addEventListener('submit',function(event){event.preventDefault();if(!changeForm.reportValidity())return;var field=changeForm.elements.field.value,value=field==='property_families'?changeForm.elements.family.value:changeForm.elements.value.value;if(['property_families','location_ids'].includes(field))value=value?value.split(',').map(function(x){return x.trim();}).filter(Boolean):[];else value=Number(value);request({field:field,value:value});});
  apply.addEventListener('click',function(){if(apply.disabled||!proposal)return;if(snapshot!==JSON.stringify(criteria())){cancel();status.textContent=copy.changed;return;}var href=safeLink(proposal.proposed_url,true);if(href)location.assign(href);});
}
