// Progressive-enhancement scripts inlined by html.mjs. Pages stay fully
// server-rendered; this layer wires saved listings (localStorage), the enquiry
// dialog, JSON lead submission (/api/leads only parses JSON bodies), share,
// and the admin lead-queue filters. No frameworks, no external requests.

export const PUBLIC_APP_JS = `(function () {
  "use strict";
  var I18N = window.MS_REALTY_I18N || {};
  var KEY = "ms-realty:saved-listings";
  function readSaved() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (error) { return []; }
  }
  function writeSaved(ids) {
    try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch (error) {}
  }
  function markSaved() {
    var saved = readSaved();
    var buttons = document.querySelectorAll("[data-client-save-listing]");
    for (var i = 0; i < buttons.length; i += 1) {
      var on = saved.indexOf(buttons[i].getAttribute("data-client-save-listing")) !== -1;
      buttons[i].setAttribute("aria-pressed", on ? "true" : "false");
      if (on) buttons[i].setAttribute("data-active", "true");
      else buttons[i].removeAttribute("data-active");
    }
  }
  function nestFormData(form) {
    var data = new FormData(form);
    var out = {};
    data.forEach(function (value, key) {
      var parts = key.split(".");
      var target = out;
      for (var i = 0; i < parts.length - 1; i += 1) {
        if (typeof target[parts[i]] !== "object" || target[parts[i]] === null) target[parts[i]] = {};
        target = target[parts[i]];
      }
      if (String(value) !== "") target[parts[parts.length - 1]] = value;
    });
    return out;
  }
  function showSuccess(form) {
    var note = document.createElement("p");
    note.className = "mk-alert mk-alert--success";
    note.setAttribute("role", "status");
    note.textContent = I18N.requestSent || "Sent.";
    form.replaceWith(note);
  }
  function submitJson(form, onDone) {
    var submit = form.querySelector('[type="submit"]');
    if (submit) submit.setAttribute("data-loading", "");
    fetch(form.getAttribute("action"), {
      method: (form.getAttribute("method") || "POST").toUpperCase(),
      headers: { "content-type": "application/json" },
      body: JSON.stringify(nestFormData(form)),
    })
      .then(function (response) {
        if (!response.ok) throw new Error(String(response.status));
        onDone();
      })
      .catch(function () {
        var warn = form.querySelector("[data-enquiry-error]");
        if (!warn) {
          warn = document.createElement("p");
          warn.className = "mk-alert mk-alert--danger";
          warn.setAttribute("data-enquiry-error", "true");
          warn.setAttribute("role", "alert");
          form.insertBefore(warn, form.firstChild);
        }
        warn.textContent = (I18N.requestFailed || "Request failed") + " (" + (form.getAttribute("action") || "") + ")";
      })
      .then(function () {
        if (submit) submit.removeAttribute("data-loading");
      });
  }
  document.addEventListener("click", function (event) {
    var save = event.target.closest("[data-client-save-listing]");
    if (save) {
      event.preventDefault();
      var id = save.getAttribute("data-client-save-listing");
      var ids = readSaved();
      var index = ids.indexOf(id);
      if (index === -1) ids.push(id);
      else ids.splice(index, 1);
      writeSaved(ids);
      markSaved();
      return;
    }
    var share = event.target.closest('[data-listing-action^="share"]');
    if (share && navigator.share) {
      event.preventDefault();
      navigator.share({ title: document.title, url: share.href || location.href }).catch(function () {});
      return;
    }
    var lead = event.target.closest('button[data-endpoint="/api/leads"]');
    if (lead) {
      var dialog = document.getElementById("mk-enquiry");
      if (!dialog || typeof dialog.showModal !== "function") return;
      var form = dialog.querySelector("form");
      form.hidden = false;
      dialog.querySelector(".ct-done").hidden = true;
      if (form.elements.source) form.elements.source.value = lead.getAttribute("data-lead-source") || form.elements.source.value;
      if (form.elements.listingReference) form.elements.listingReference.value = lead.getAttribute("data-listing-reference") || "";
      if (form.elements.contact_preference) form.elements.contact_preference.value = lead.getAttribute("data-contact-preference") || "";
      dialog.showModal();
      return;
    }
    var close = event.target.closest("[data-enquiry-close]");
    if (close) {
      var open = document.getElementById("mk-enquiry");
      if (open && open.close) open.close();
    }
  });
  document.addEventListener("submit", function (event) {
    var form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    var action = form.getAttribute("action") || "";
    var isEnquiry = form.hasAttribute("data-enquiry-form");
    var intercept = action === "/api/leads" || action === "/api/saved-searches" || action === "/api/language-requests" || form.hasAttribute("data-save-search-endpoint") || form.hasAttribute("data-request-language");
    if (!intercept && !isEnquiry) return;
    event.preventDefault();
    submitJson(form, function () {
      if (isEnquiry) {
        var dialog = document.getElementById("mk-enquiry");
        form.hidden = true;
        dialog.querySelector(".ct-done").hidden = false;
        form.reset();
      } else {
        showSuccess(form);
      }
    });
  });
  markSaved();
})();`;

export const ADMIN_APP_JS = `(function () {
  "use strict";
  var tabs = document.querySelector("[data-lead-queue-tabs]");
  if (!tabs) return;
  tabs.addEventListener("click", function (event) {
    var button = event.target.closest("button[data-lead-filter]");
    if (!button) return;
    var buttons = tabs.querySelectorAll("button[data-lead-filter]");
    for (var i = 0; i < buttons.length; i += 1) buttons[i].setAttribute("data-on", buttons[i] === button ? "1" : "0");
    var filter = button.getAttribute("data-lead-filter");
    var rows = document.querySelectorAll("[data-lead-row]");
    for (var j = 0; j < rows.length; j += 1) {
      var row = rows[j];
      var slaCell = row.querySelector("[data-sla-status]");
      var sla = slaCell ? slaCell.getAttribute("data-sla-status") : "";
      var replied = row.getAttribute("data-lead-replied") === "true";
      var show = true;
      if (filter === "needs_reply") show = !replied;
      if (filter === "sla") show = sla === "reminder_required" || sla === "manager_escalation_required";
      row.hidden = !show;
    }
  });
})();`;
