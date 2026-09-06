// Kept self-contained so the same function is tested and bundled for the browser.
export function initPublicSearchAssistant() {
  var dialog = document.querySelector("[data-search-assistant]");
  if (!dialog || typeof dialog.showModal !== "function") return;
  var copy = JSON.parse(dialog.dataset.copy), allowed = JSON.parse(dialog.dataset.fields);
  var words = dialog.querySelector("[data-assistant-words]"), review = dialog.querySelector("[data-assistant-review]");
  var text = words.elements.text, status = dialog.querySelector("[data-assistant-status]");
  var apply = dialog.querySelector("[data-assistant-apply]"), unresolved = dialog.querySelector("[data-assistant-unresolved]");
  var submit = words.querySelector('[type="submit"]'), check = review.querySelector('[type="submit"]');
  var fields = Array.from(review.querySelectorAll("[data-assistant-field]"));
  var generation = 0, controller = null, proposal = null, origin = "", opener = null, edited = false, reviewed = new Set();
  var filterForms = Array.from(document.querySelectorAll("[data-hero-search], [data-search-filter-form]")), lastEditedForm = null;
  var initialValues = new Map();
  filterForms.forEach(function (form) {
    var initial = {}; new FormData(form).forEach(function (value, key) { initial[key] = value; }); initialValues.set(form, initial);
    ["input", "change"].forEach(function (event) { form.addEventListener(event, function () { lastEditedForm = form; }); });
  });
  function filterForm() { return lastEditedForm || filterForms.find(function (form) { return form.getClientRects().length; }) || filterForms[0]; }
  function current() {
    var params = new URLSearchParams(window.location.search), form = filterForm(), result = {};
    params.forEach(function (value, key) { if (allowed.indexOf(key) >= 0 || key === "search_intent") result[key] = value; });
    if (form) new FormData(form).forEach(function (value, key) {
      if (allowed.indexOf(key) >= 0 && typeof value === "string") {
        // A scalar form projection must not replace an unchanged canonical multi-select.
        if (result.search_intent && initialValues.get(form)[key] === value) return;
        if (value !== "" || result.search_intent || Object.prototype.hasOwnProperty.call(result, key)) result[key] = value;
      }
    });
    return result;
  }
  function invalidate(clearReview) {
    generation += 1;
    if (controller) controller.abort();
    controller = null; apply.disabled = true; submit.disabled = false; check.disabled = false;
    dialog.removeAttribute("aria-busy");
    if (clearReview) { proposal = null; review.hidden = true; unresolved.hidden = true; }
  }
  function add(parent, tag, value) {
    var node = document.createElement(tag); node.textContent = value; parent.appendChild(node); return node;
  }
  function safeProposal(value) {
    if (typeof value !== "string" || value.charAt(0) !== "/" || value.slice(0, 2) === "//") return null;
    try {
      var url = new URL(value, window.location.origin);
      return url.origin === window.location.origin && url.pathname === dialog.dataset.searchPath ? url.href : null;
    } catch (_) { return null; }
  }
  function fill(result) {
    if (!result.proposed_intent && result.criteria) result = Object.assign({}, result, { proposed_intent: result.criteria });
    proposal = result; edited = false; review.hidden = !result.proposed_intent;
    review.querySelector("h3").textContent = result.proposed_url ? copy.ready : copy.review;
    fields.forEach(function (field) {
      var value = result.proposed_intent && result.proposed_intent[field.name];
      if (field.tagName === "SELECT" && Array.isArray(value) && value.length && !Array.from(field.options).some(function (row) { return row.value === value.join(", "); })) {
        var option = Array.from(field.options).find(function (row) { return row.dataset.multiple === "true"; });
        if (!option) { option = document.createElement("option"); option.dataset.multiple = "true"; field.appendChild(option); }
        option.value = value.join(", "); option.textContent = value.join(", ");
      }
      field.value = Array.isArray(value) ? value.join(", ") : value == null ? "" : String(value);
    });
    var list = unresolved.querySelector("ul"); list.replaceChildren();
    (result.unresolved || []).forEach(function (item) { add(list, "li", item.text); });
    (result.ambiguities || []).forEach(function (item) {
      var labels = (item.required_fields || []).map(function (key) { var field = fields.find(function (node) { return node.name === key; }); return field && field.dataset.label; }).filter(Boolean);
      add(list, "li", (labels.length ? labels.join(", ") + ": " : "") + copy.clarify + (item.options && item.options.length ? " " + item.options.map(function (v) { return Array.isArray(v) ? v.join(", ") : String(v); }).join(" / ") : ""));
    });
    unresolved.hidden = !list.children.length;
    // Additional criteria stay in the canonical proposal even when they have no editor here.
    var preserved = dialog.querySelector("[data-assistant-preserved]"); preserved.replaceChildren();
    Object.entries(result.proposed_intent || {}).forEach(function (row) {
      var key = row[0], value = row[1];
      if (["schema_version", "locale", "mandatory_filters", "price_currency", "page", "page_size", "sort"].indexOf(key) >= 0 || fields.some(function (f) { return f.name === key; }) || value == null || value === "" || (Array.isArray(value) && !value.length)) return;
      add(preserved, "dt", key.replace(/_/g, " ")); add(preserved, "dd", Array.isArray(value) ? value.join(", ") : typeof value === "object" ? JSON.stringify(value) : String(value));
    });
    status.textContent = result.proposed_url ? result.message : copy.clarify;
    apply.disabled = !(result.applied === false && result.requires_confirmation === true && safeProposal(result.proposed_url));
  }
  async function request(input, reviewedFields) {
    invalidate(false);
    var own = generation, query = text.value.trim(), snapshot = JSON.stringify(current());
    submit.disabled = true; check.disabled = true; status.textContent = copy.loading;
    dialog.setAttribute("aria-busy", "true"); controller = new AbortController();
    try {
      var response = await fetch("/api/search/interpret", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, cache: "no-store", signal: controller.signal, body: JSON.stringify(Object.assign({ locale: dialog.dataset.locale, text: query, current: input }, reviewedFields && reviewedFields.length ? { reviewed_fields: reviewedFields } : {})) });
      var body = await response.json();
      if (own !== generation) return;
      if (snapshot !== JSON.stringify(current())) { invalidate(true); status.textContent = copy.changed; return; }
      if (!response.ok) { status.textContent = response.status === 429 ? copy.rate : body.message || copy.failure; return; }
      if (body.kind !== "search_interpretation" || body.locale !== dialog.dataset.locale || body.original_query !== query || body.applied !== false || body.requires_confirmation !== true || !Array.isArray(body.unresolved) || !Array.isArray(body.ambiguities)) throw new Error("invalid_receipt");
      origin = snapshot; fill(body);
    } catch (error) {
      if (own === generation && error.name !== "AbortError") status.textContent = copy.failure;
    } finally {
      if (own === generation) { controller = null; submit.disabled = false; check.disabled = false; dialog.removeAttribute("aria-busy"); }
    }
  }
  document.querySelectorAll("[data-search-assistant-open]").forEach(function (button) {
    button.hidden = false;
    button.addEventListener("click", function () {
      opener = button; invalidate(true); reviewed.clear(); status.textContent = "";
      if (!text.value) text.value = new URLSearchParams(window.location.search).get("nl_context") || "";
      dialog.showModal(); text.focus();
    });
  });
  dialog.querySelector("[data-assistant-close]").addEventListener("click", function () { dialog.close(); });
  dialog.addEventListener("close", function () { invalidate(true); if (opener) opener.focus(); });
  text.addEventListener("input", function () { invalidate(true); reviewed.clear(); status.textContent = ""; });
  words.addEventListener("submit", function (event) {
    event.preventDefault(); if (controller || !words.reportValidity()) return;
    var form = filterForm(); if (form && !form.checkValidity()) { status.textContent = copy.changed; return; }
    reviewed.clear(); request(current());
  });
  function fieldChanged(event) {
    if (!fields.includes(event.target)) return;
    reviewed.add(event.target.name); edited = true; invalidate(false); status.textContent = copy.checkChanges;
  }
  review.addEventListener("input", fieldChanged);
  review.addEventListener("change", fieldChanged);
  review.addEventListener("submit", function (event) {
    event.preventDefault(); if (controller || !proposal || !review.reportValidity()) return;
    if (origin !== JSON.stringify(current())) { invalidate(true); status.textContent = copy.changed; return; }
    var intent = Object.assign({}, proposal.proposed_intent);
    fields.forEach(function (field) {
      intent[field.name] = ["property_families", "location_ids"].indexOf(field.name) >= 0 ? field.value.split(",").map(function (v) { return v.trim(); }).filter(Boolean) : field.value === "" ? null : field.type === "number" ? Number(field.value) : field.value;
    });
    request({ search_intent: intent }, Array.from(reviewed));
  });
  apply.addEventListener("click", function () {
    if (apply.disabled || edited || !proposal) return;
    if (origin !== JSON.stringify(current())) { invalidate(true); status.textContent = copy.changed; return; }
    var href = safeProposal(proposal.proposed_url); if (href) window.location.assign(href);
  });
}
