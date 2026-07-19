// Progressive-enhancement scripts emitted as versioned local assets by
// build-design-assets.mjs. Pages stay fully server-rendered; this layer wires
// saved listings, enquiries, the 360 viewer, and admin filters.

export const PUBLIC_APP_JS = `(function () {
  "use strict";
  var publicClientScript = document.currentScript || document.querySelector("script[data-ms-realty-public-client]");
  var I18N = {
    requestSent: publicClientScript ? publicClientScript.getAttribute("data-request-sent") || "" : "",
    requestFailed: publicClientScript ? publicClientScript.getAttribute("data-request-failed") || "" : "",
  };
  var KEY = "ms-realty:saved-listings";
  var PHOTO_SPHERE_VIEWER_SCRIPT_URL = "/vendor/photo-sphere-viewer.js";
  var PHOTO_SPHERE_VIEWER_CSS_URL = "/vendor/photo-sphere-viewer.css";
  var photoSphereViewerPromise = null;
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
  function isApprovedPanoramaUrl(value) {
    if (typeof value !== "string" || !/^https:\\/\\//i.test(value)) return false;
    try { return new URL(value).protocol === "https:"; } catch (error) { return false; }
  }
  function loadPhotoSphereStyles() {
    if (document.querySelector("link[data-photo-sphere-viewer-styles]")) return;
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = PHOTO_SPHERE_VIEWER_CSS_URL;
    link.setAttribute("data-photo-sphere-viewer-styles", "true");
    document.head.appendChild(link);
  }
  function loadPhotoSphereViewer() {
    if (window.MSRealtyPhotoSphereViewer && typeof window.MSRealtyPhotoSphereViewer.Viewer === "function") {
      return Promise.resolve(window.MSRealtyPhotoSphereViewer);
    }
    if (photoSphereViewerPromise) return photoSphereViewerPromise;
    photoSphereViewerPromise = new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = PHOTO_SPHERE_VIEWER_SCRIPT_URL;
      script.async = true;
      script.setAttribute("data-photo-sphere-viewer-script", "true");
      script.onload = function () {
        if (window.MSRealtyPhotoSphereViewer && typeof window.MSRealtyPhotoSphereViewer.Viewer === "function") {
          resolve(window.MSRealtyPhotoSphereViewer);
        } else {
          reject(new Error("Photo Sphere Viewer bundle is unavailable"));
        }
      };
      script.onerror = function () { reject(new Error("Photo Sphere Viewer bundle failed to load")); };
      document.head.appendChild(script);
    });
    return photoSphereViewerPromise;
  }
  function showTourFallback(section, mount) {
    if (mount && mount.parentNode) mount.parentNode.removeChild(mount);
    section.setAttribute("data-photo-sphere-viewer-state", "fallback");
    section.removeAttribute("aria-busy");
  }
  function createPhotoSphereViewer(Viewer, item, index, viewers) {
    var section = item.section;
    var mount = document.createElement("div");
    var caption = section.querySelector("p");
    mount.className = "ms-psv";
    mount.setAttribute("data-photo-sphere-viewer-canvas", "true");
    mount.setAttribute("role", "region");
    mount.setAttribute("aria-label", section.getAttribute("aria-label") || "360 tour");
    mount.setAttribute("tabindex", "0");
    mount.style.cssText = "position:relative;width:100%;height:clamp(280px,62vw,480px);margin-bottom:16px;overflow:hidden;border-radius:var(--radius-md, 8px);background:var(--ink-900, #14212c);";
    if (caption) {
      if (!caption.id) caption.id = "ms-psv-caption-" + index;
      mount.setAttribute("aria-describedby", caption.id);
    }
    section.insertBefore(mount, section.firstChild);
    section.setAttribute("aria-busy", "true");
    section.setAttribute("data-photo-sphere-viewer-state", "loading");
    try {
      var viewer = new Viewer({
        container: mount,
        panorama: item.panoramaUrl,
        caption: caption ? caption.textContent : null,
        navbar: ["zoom", "move", "fullscreen"],
        keyboard: false,
        mousewheel: true,
        touchmoveTwoFingers: true,
        loadingTxt: (section.getAttribute("aria-label") || "360") + "...",
      });
      mount.addEventListener("focusin", function () { viewer.startKeyboardControl(); });
      mount.addEventListener("focusout", function (event) {
        if (!mount.contains(event.relatedTarget)) viewer.stopKeyboardControl();
      });
      viewer.addEventListener("ready", function () {
        section.setAttribute("data-photo-sphere-viewer-state", "ready");
        section.removeAttribute("aria-busy");
      });
      viewer.addEventListener("error", function () { showTourFallback(section, mount); });
      viewers.push(viewer);
    } catch (error) {
      showTourFallback(section, mount);
    }
  }
  function initPhotoSphereViewers() {
    var candidates = document.querySelectorAll('[data-photo-sphere-viewer="psv-listing-tour"]');
    var tours = [];
    for (var i = 0; i < candidates.length; i += 1) {
      var section = candidates[i];
      var panoramaUrl = section.getAttribute("data-panorama-url") || "";
      if (!isApprovedPanoramaUrl(panoramaUrl)) {
        section.setAttribute("data-photo-sphere-viewer-state", "fallback");
        continue;
      }
      tours.push({ section: section, panoramaUrl: panoramaUrl });
    }
    if (!tours.length) return;
    loadPhotoSphereStyles();
    loadPhotoSphereViewer()
      .then(function (module) {
        if (!module || typeof module.Viewer !== "function") throw new Error("Photo Sphere Viewer is unavailable");
        var viewers = [];
        for (var j = 0; j < tours.length; j += 1) createPhotoSphereViewer(module.Viewer, tours[j], j, viewers);
        window.addEventListener("pagehide", function () {
          for (var k = 0; k < viewers.length; k += 1) {
            try { viewers[k].destroy(); } catch (error) {}
          }
        }, { once: true });
      })
      .catch(function () {
        for (var j = 0; j < tours.length; j += 1) showTourFallback(tours[j].section);
      });
  }
  function updateEnquiryContact(form) {
    var intent = form.elements.intent ? form.elements.intent.value : "inquiry";
    var channel = form.elements.contact_preference;
    var contact = form.querySelector("[data-enquiry-contact]");
    var label = form.querySelector("[data-enquiry-phone-label]");
    if (!contact) return;
    var value = intent === "inquiry" && channel ? channel.value : "phone";
    if (value !== "phone" && value !== "whatsapp" && value !== "viber") value = "phone";
    var option = channel && channel.options[channel.selectedIndex];
    var text = intent === "inquiry" && option ? option.textContent : label && label.getAttribute("data-enquiry-default-label");
    contact.name = "contact." + value;
    contact.required = true;
    contact.setAttribute("data-enquiry-validation", intent === "inquiry" ? "reachable_channel" : "phone");
    if (label && label.firstChild) label.firstChild.nodeValue = text || "";
  }
  function configureEnquiryDialog(dialog, lead) {
    var form = dialog.querySelector("form");
    if (!form) return;
    var intent = lead.getAttribute("data-lead-intent") || "inquiry";
    if (intent === "request_viewing") intent = "viewing";
    var title = lead.getAttribute("data-lead-title") || lead.textContent.trim();
    var submitText = lead.getAttribute("data-lead-submit") || title;
    var titleNode = dialog.querySelector("[data-enquiry-title]");
    var submit = form.querySelector("[data-enquiry-submit]");
    var channel = form.elements.contact_preference;
    var channelGroup = form.querySelector("[data-enquiry-channel-group]");
    var callbackTimeGroup = form.querySelector("[data-enquiry-callback-time-group]");
    var viewingFields = form.querySelector("[data-enquiry-viewing-fields]");
    var viewingDate = form.querySelector("[data-enquiry-viewing-date]");
    var viewingTime = form.querySelector("[data-enquiry-viewing-time]");
    var error = form.querySelector("[data-enquiry-error]");
    form.hidden = false;
    dialog.querySelector(".ct-done").hidden = true;
    if (error) error.remove();
    if (form.elements.source) form.elements.source.value = lead.getAttribute("data-lead-source") || form.elements.source.value;
    if (form.elements.intent) form.elements.intent.value = intent;
    if (form.elements.leadType) form.elements.leadType.value = lead.getAttribute("data-lead-type") || "buyer";
    if (form.elements.listingReference) form.elements.listingReference.value = lead.getAttribute("data-listing-reference") || "";
    if (channel) channel.value = intent === "inquiry" ? lead.getAttribute("data-contact-preference") || "phone" : "phone";
    if (channelGroup) channelGroup.hidden = intent !== "inquiry";
    if (callbackTimeGroup) callbackTimeGroup.hidden = intent !== "callback";
    if (viewingFields) viewingFields.hidden = intent !== "viewing";
    if (viewingDate) viewingDate.required = intent === "viewing";
    if (viewingTime) viewingTime.required = intent === "viewing";
    if (titleNode) titleNode.textContent = title;
    if (submit) {
      var submitLabel = submit.querySelector("span") || submit;
      submitLabel.textContent = submitText;
    }
    dialog.setAttribute("aria-label", title);
    form.setAttribute("data-lead-intent", intent);
    updateEnquiryContact(form);
  }
  function updateSavedSearchContact(form) {
    var channel = form.querySelector("[data-save-search-channel]");
    var contact = form.querySelector("[data-save-search-contact]");
    var label = form.querySelector("[data-save-search-contact-label]");
    if (!channel || !contact) return;
    var value = channel.value === "whatsapp" ? "whatsapp" : "email";
    contact.name = "contact." + value;
    contact.type = value === "email" ? "email" : "tel";
    contact.inputMode = value === "email" ? "email" : "tel";
    contact.autocomplete = value === "email" ? "email" : "tel";
    if (label) label.textContent = label.getAttribute(value === "email" ? "data-email-label" : "data-whatsapp-label") || value;
  }
  function initSavedSearchContacts() {
    var forms = document.querySelectorAll("[data-save-search-form]");
    for (var i = 0; i < forms.length; i += 1) updateSavedSearchContact(forms[i]);
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
      configureEnquiryDialog(dialog, lead);
      dialog.showModal();
      return;
    }
    var close = event.target.closest("[data-enquiry-close]");
    if (close) {
      var open = document.getElementById("mk-enquiry");
      if (open && open.close) open.close();
    }
  });
  document.addEventListener("change", function (event) {
    var channel = event.target.closest("[data-enquiry-channel]");
    if (channel && channel.form) updateEnquiryContact(channel.form);
    var savedSearchChannel = event.target.closest("[data-save-search-channel]");
    if (savedSearchChannel && savedSearchChannel.form) updateSavedSearchContact(savedSearchChannel.form);
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
  initSavedSearchContacts();
  initPhotoSphereViewers();
})();`;

export const ADMIN_APP_JS = `(function () {
  "use strict";
  function applyLeadQueueFilter(tabs, filter) {
    var buttons = tabs.querySelectorAll("button[data-lead-filter]");
    for (var i = 0; i < buttons.length; i += 1) {
      buttons[i].setAttribute("data-on", buttons[i].getAttribute("data-lead-filter") === filter ? "1" : "0");
    }
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
  }
  function initLeadQueueFilters() {
    var tabs = document.querySelector("[data-lead-queue-tabs]");
    if (!tabs) return;
    var selected = tabs.querySelector('button[data-lead-filter][data-on="1"]');
    applyLeadQueueFilter(tabs, selected ? selected.getAttribute("data-lead-filter") : "needs_reply");
    tabs.addEventListener("click", function (event) {
      var button = event.target.closest("button[data-lead-filter]");
      if (!button) return;
      applyLeadQueueFilter(tabs, button.getAttribute("data-lead-filter"));
    });
  }
  function tourPayload(form) {
    var data = new FormData(form);
    var payload = {};
    data.forEach(function (value, key) {
      if (String(value) === "") return;
      if (!(key in payload)) payload[key] = value;
      else if (Array.isArray(payload[key])) payload[key].push(value);
      else payload[key] = [payload[key], value];
    });
    return payload;
  }
  function setTourSaveStatus(form, value, state) {
    var status = form.querySelector("[data-tour-save-status]");
    if (!status) return;
    status.textContent = value;
    status.setAttribute("data-state", state);
  }
  function initTourEditor() {
    document.addEventListener("submit", function (event) {
      var form = event.target;
      if (!(form instanceof HTMLFormElement) || !form.hasAttribute("data-tour-editor-form")) return;
      event.preventDefault();
      var submit = form.querySelector('[type="submit"]');
      var saving = form.getAttribute("data-tour-save-pending") || "Saving...";
      var success = form.getAttribute("data-tour-save-success") || "360 tour approved.";
      var failed = form.getAttribute("data-tour-save-failure") || "Could not save 360 tour.";
      if (submit) submit.disabled = true;
      form.setAttribute("aria-busy", "true");
      setTourSaveStatus(form, saving, "saving");
      fetch(form.getAttribute("action"), {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(tourPayload(form)),
      })
        .then(function (response) {
          return response
            .json()
            .catch(function () { return {}; })
            .then(function (payload) {
              if (!response.ok || payload.is_public !== true) throw new Error(payload.message || "tour approval failed");
              return payload;
            });
        })
        .then(function () {
          form.setAttribute("data-tour-save-state", "approved");
          var panel = form.closest("[data-media-review-panel]");
          if (panel) panel.setAttribute("data-tour-review-status", "available");
          setTourSaveStatus(form, success, "success");
        })
        .catch(function () {
          setTourSaveStatus(form, failed, "error");
        })
        .then(function () {
          form.removeAttribute("aria-busy");
          if (submit) submit.disabled = false;
        });
    });
  }
  function setViewingFollowUpStatus(form, value, state) {
    var status = form.querySelector("[data-viewing-follow-up-status]");
    if (!status) return;
    status.textContent = value;
    status.setAttribute("data-state", state);
  }
  function initViewingFollowUpForms() {
    document.addEventListener("submit", function (event) {
      var form = event.target;
      if (!(form instanceof HTMLFormElement) || !form.hasAttribute("data-viewing-follow-up-form")) return;
      event.preventDefault();
      var submitter = event.submitter;
      var buttons = form.querySelectorAll('[type="submit"]');
      var saving = form.getAttribute("data-viewing-follow-up-saving") || "Recording follow-up...";
      var success = form.getAttribute("data-viewing-follow-up-success") || "Follow-up recorded.";
      var failed = form.getAttribute("data-viewing-follow-up-failure") || "Could not record follow-up.";
      var payload = tourPayload(form);
      if (submitter && submitter.name && submitter.value) payload[submitter.name] = submitter.value;
      for (var i = 0; i < buttons.length; i += 1) buttons[i].disabled = true;
      form.setAttribute("aria-busy", "true");
      setViewingFollowUpStatus(form, saving, "saving");
      fetch(form.getAttribute("action"), {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(payload),
      })
        .then(function (response) {
          return response
            .json()
            .catch(function () { return {}; })
            .then(function (result) {
              if (!response.ok || !result.viewing) throw new Error(result.message || "viewing follow-up failed");
              return result;
            });
        })
        .then(function () {
          setViewingFollowUpStatus(form, success, "success");
          window.setTimeout(function () { window.location.reload(); }, 150);
        })
        .catch(function () {
          setViewingFollowUpStatus(form, failed, "error");
        })
        .then(function () {
          form.removeAttribute("aria-busy");
          for (var i = 0; i < buttons.length; i += 1) buttons[i].disabled = false;
        });
    });
  }
  function setSellerPipelineStatus(form, value, state) {
    var status = form.querySelector("[data-seller-pipeline-status]");
    if (!status) return;
    status.textContent = value;
    status.setAttribute("data-state", state);
  }
  function initSellerPipelineOutcomeForms() {
    document.addEventListener("submit", function (event) {
      var form = event.target;
      if (!(form instanceof HTMLFormElement) || !form.hasAttribute("data-seller-pipeline-outcome-form")) return;
      event.preventDefault();
      var submitter = event.submitter;
      var buttons = form.querySelectorAll('[type="submit"]');
      var saving = form.getAttribute("data-seller-pipeline-saving") || "Recording seller outcome...";
      var success = form.getAttribute("data-seller-pipeline-success") || "Seller outcome recorded.";
      var failed = form.getAttribute("data-seller-pipeline-failure") || "Could not record seller outcome.";
      var payload = tourPayload(form);
      if (submitter && submitter.name && submitter.value) payload[submitter.name] = submitter.value;
      for (var i = 0; i < buttons.length; i += 1) buttons[i].disabled = true;
      form.setAttribute("aria-busy", "true");
      setSellerPipelineStatus(form, saving, "saving");
      fetch(form.getAttribute("action"), {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(payload),
      })
        .then(function (response) {
          return response
            .json()
            .catch(function () { return {}; })
            .then(function (result) {
              if (!response.ok || !result.seller_pipeline) throw new Error(result.message || "seller pipeline outcome failed");
              return result;
            });
        })
        .then(function () {
          setSellerPipelineStatus(form, success, "success");
          window.setTimeout(function () { window.location.reload(); }, 150);
        })
        .catch(function () {
          setSellerPipelineStatus(form, failed, "error");
        })
        .then(function () {
          form.removeAttribute("aria-busy");
          for (var i = 0; i < buttons.length; i += 1) buttons[i].disabled = false;
        });
    });
  }
  function setPublicRequestStatus(form, value, state) {
    var status = form.querySelector("[data-public-request-status]");
    if (!status) return;
    status.textContent = value;
    status.setAttribute("data-state", state);
  }
  function initPublicRequestOutcomeForms() {
    document.addEventListener("submit", function (event) {
      var form = event.target;
      if (!(form instanceof HTMLFormElement) || !form.hasAttribute("data-public-request-outcome-form")) return;
      event.preventDefault();
      var submitter = event.submitter;
      var buttons = form.querySelectorAll('[type="submit"]');
      var saving = form.getAttribute("data-public-request-saving") || "Recording request outcome...";
      var success = form.getAttribute("data-public-request-success") || "Request outcome recorded.";
      var failed = form.getAttribute("data-public-request-failure") || "Could not record request outcome.";
      var payload = tourPayload(form);
      if (submitter && submitter.name && submitter.value) payload[submitter.name] = submitter.value;
      for (var i = 0; i < buttons.length; i += 1) buttons[i].disabled = true;
      form.setAttribute("aria-busy", "true");
      setPublicRequestStatus(form, saving, "saving");
      fetch(form.getAttribute("action"), {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(payload),
      })
        .then(function (response) {
          return response
            .json()
            .catch(function () { return {}; })
            .then(function (result) {
              if (!response.ok || !result.request) throw new Error(result.message || failed);
              return result;
            });
        })
        .then(function () {
          setPublicRequestStatus(form, success, "success");
          window.setTimeout(function () { window.location.reload(); }, 150);
        })
        .catch(function (error) {
          setPublicRequestStatus(form, error.message || failed, "error");
        })
        .then(function () {
          form.removeAttribute("aria-busy");
          for (var i = 0; i < buttons.length; i += 1) buttons[i].disabled = false;
        });
    });
  }
  function setTranslationWorkflowStatus(form, value, state) {
    var status = form.querySelector("[data-translation-workflow-status]");
    if (!status) return;
    status.textContent = value;
    status.setAttribute("data-state", state);
  }
  function initTranslationWorkflowForms() {
    document.addEventListener("submit", function (event) {
      var form = event.target;
      if (!(form instanceof HTMLFormElement) || !form.hasAttribute("data-translation-workflow-form")) return;
      event.preventDefault();
      var submit = form.querySelector('[type="submit"]');
      var workflow = form.getAttribute("data-translation-workflow-form");
      var success = form.getAttribute("data-success-message") || "Translation updated.";
      var failure = form.getAttribute("data-failure-message") || "Could not update translation.";
      if (submit) submit.disabled = true;
      form.setAttribute("aria-busy", "true");
      setTranslationWorkflowStatus(form, "…", "saving");
      fetch(form.getAttribute("action"), {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(tourPayload(form)),
      })
        .then(function (response) {
          return response
            .json()
            .catch(function () { return {}; })
            .then(function (result) {
              var expected = workflow === "publish" ? "published" : workflow === "approve" ? "approved" : "human_edited";
              if (!response.ok || result.status !== expected) throw new Error(result.message || "translation workflow failed");
              return result;
            });
        })
        .then(function () {
          setTranslationWorkflowStatus(form, success, "success");
          window.setTimeout(function () { window.location.reload(); }, 150);
        })
        .catch(function () {
          setTranslationWorkflowStatus(form, failure, "error");
        })
        .then(function () {
          form.removeAttribute("aria-busy");
          if (submit) submit.disabled = false;
        });
    });
  }
  function setReplyStatus(form, value, state) {
    var row = form.closest("[data-lead-row]");
    var status = row ? row.querySelector("[data-reply-status]") : null;
    if (!status) return;
    status.textContent = value;
    status.setAttribute("data-state", state);
  }
  function submitReplyJson(form, payload) {
    return fetch(form.getAttribute("action"), {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(payload),
    }).then(function (response) {
      return response
        .json()
        .catch(function () { return {}; })
        .then(function (result) {
          if (!response.ok) throw new Error(result.message || "reply request failed");
          return result;
        });
    });
  }
  function setReplyDeliveryStatus(form, value, state) {
    var status = form.querySelector("[data-reply-delivery-status]");
    if (!status) return;
    status.textContent = value;
    status.setAttribute("data-state", state);
  }
  function initReplyDeliveryForms() {
    document.addEventListener("submit", function (event) {
      var form = event.target;
      if (!(form instanceof HTMLFormElement) || !form.hasAttribute("data-reply-delivery-form")) return;
      event.preventDefault();
      var submitter = event.submitter;
      var buttons = form.querySelectorAll('[type="submit"]');
      var saving = form.getAttribute("data-reply-delivery-saving") || "Recording reply delivery…";
      var success = form.getAttribute("data-reply-delivery-success") || "Reply delivery status recorded.";
      var failure = form.getAttribute("data-reply-delivery-failure") || "Could not record reply delivery status.";
      var payload = tourPayload(form);
      if (submitter && submitter.name && submitter.value) payload[submitter.name] = submitter.value;
      for (var i = 0; i < buttons.length; i += 1) buttons[i].disabled = true;
      form.setAttribute("aria-busy", "true");
      setReplyDeliveryStatus(form, saving, "saving");
      submitReplyJson(form, payload)
        .then(function (result) {
          if (!result.delivery || !["queued", "failed", "sent"].includes(result.delivery.status)) {
            throw new Error("invalid reply delivery response");
          }
          setReplyDeliveryStatus(form, success, "success");
          window.setTimeout(function () { window.location.reload(); }, 150);
        })
        .catch(function (error) {
          setReplyDeliveryStatus(form, error.message || failure, "error");
        })
        .then(function () {
          form.removeAttribute("aria-busy");
          for (var i = 0; i < buttons.length; i += 1) buttons[i].disabled = false;
        });
    });
  }
  function initReplyForms() {
    document.addEventListener("submit", function (event) {
      var form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      var isDraft = form.hasAttribute("data-hermes-draft-request");
      var isApproval = form.hasAttribute("data-reply-approval-required");
      if (!isDraft && !isApproval) return;
      event.preventDefault();
      var submit = form.querySelector('[type="submit"]');
      var saving = isDraft
        ? form.getAttribute("data-reply-draft-pending") || "Preparing broker-only draft…"
        : form.getAttribute("data-reply-queue-pending") || "Queueing broker-approved reply…";
      var success = isDraft
        ? form.getAttribute("data-reply-draft-success") || "Draft ready for broker review."
        : form.getAttribute("data-reply-queue-success") || "Reply queued for manual sending.";
      var failure = isDraft
        ? form.getAttribute("data-reply-draft-failure") || "Could not prepare a broker draft."
        : form.getAttribute("data-reply-queue-failure") || "Could not queue the reviewed reply.";
      if (submit) submit.disabled = true;
      form.setAttribute("aria-busy", "true");
      setReplyStatus(form, saving, "saving");
      submitReplyJson(form, tourPayload(form))
        .then(function (result) {
          if (isDraft) {
            if (!result.text || result.broker_approval_required !== true || result.can_send_without_approval === true) {
              throw new Error("invalid Hermes draft response");
            }
            var row = form.closest("[data-lead-row]");
            var reviewForm = row ? row.querySelector("form[data-reply-approval-required]") : null;
            if (!reviewForm || !reviewForm.elements.hermesDraftText) throw new Error("review form unavailable");
            reviewForm.elements.hermesDraftText.value = result.text;
            var reviewPanel = reviewForm.closest("details");
            if (reviewPanel) reviewPanel.open = true;
            setReplyStatus(form, success, "success");
            return;
          }
          if (result.status !== "queued_for_manual_send" || result.broker_approved !== true) {
            throw new Error("reply was not queued for broker-reviewed manual sending");
          }
          var leadRow = form.closest("[data-lead-row]");
          if (leadRow) {
            leadRow.setAttribute("data-lead-replied", "false");
            leadRow.setAttribute("data-reply-queue-status", "queued");
          }
          var details = form.closest("details");
          if (details) details.open = false;
          setReplyStatus(form, success, "success");
          window.setTimeout(function () { window.location.reload(); }, 150);
        })
        .catch(function () {
          setReplyStatus(form, failure, "error");
        })
        .then(function () {
          form.removeAttribute("aria-busy");
          if (submit) submit.disabled = false;
        });
    });
  }
  function initCommunicationTemplates() {
    document.addEventListener("change", function (event) {
      var select = event.target;
      if (!(select instanceof HTMLSelectElement) || !select.hasAttribute("data-communication-template-select")) return;
      var option = select.options[select.selectedIndex];
      if (!option || !option.value) return;
      var form = select.closest("form[data-reply-approval-required]");
      if (!form || !form.elements.reviewedReply) return;
      var body = option.getAttribute("data-template-body") || "";
      var locale = option.getAttribute("data-template-locale") || "";
      form.elements.reviewedReply.value = body;
      form.elements.reviewedReply.setAttribute("data-template-id", option.value);
      if (locale && form.elements.language) form.elements.language.value = locale;
      form.elements.reviewedReply.focus();
    });
  }
  function initLeadPipelineFilters() {
    var tabs = document.querySelector("[data-pipeline-tabs]");
    var grid = document.querySelector("[data-pipeline-grid]");
    if (!tabs || !grid) return;
    var buttons = tabs.querySelectorAll("[data-pipeline-filter]");
    var cards = grid.querySelectorAll("[data-pipeline-card]");
    function applyFilter(filter) {
      for (var i = 0; i < cards.length; i += 1) {
        var card = cards[i];
        var matches =
          filter === "open"
            ? card.getAttribute("data-pipeline-status") === "open"
            : card.getAttribute("data-pipeline-kind") === filter || card.getAttribute("data-pipeline-status") === filter;
        card.hidden = !matches;
      }
      for (var j = 0; j < buttons.length; j += 1) {
        var on = buttons[j].getAttribute("data-pipeline-filter") === filter;
        buttons[j].setAttribute("data-on", on ? "1" : "0");
        buttons[j].setAttribute("aria-pressed", on ? "true" : "false");
      }
    }
    tabs.addEventListener("click", function (event) {
      var button = event.target.closest("[data-pipeline-filter]");
      if (!button) return;
      applyFilter(button.getAttribute("data-pipeline-filter") || "open");
    });
    applyFilter("open");
  }
  function initListingBulkForms() {
    var forms = document.querySelectorAll("[data-listing-bulk-form]");
    for (var i = 0; i < forms.length; i += 1) {
      (function (form) {
        var boxes = form.querySelectorAll("[data-listing-select]");
        var toggle = form.querySelector("[data-listing-select-all]");
        var count = form.querySelector("[data-listing-selection-count]");
        var selectedLabel = form.getAttribute("data-listing-selected-label") || "{count} selected";
        var selectAllLabel = form.getAttribute("data-listing-select-all-label") || "Select all on this page";
        var clearLabel = form.getAttribute("data-listing-clear-label") || "Clear selection";
        function refresh() {
          var selected = 0;
          for (var j = 0; j < boxes.length; j += 1) if (boxes[j].checked) selected += 1;
          if (count) count.textContent = selectedLabel.replace("{count}", String(selected));
          if (toggle) {
            var allSelected = boxes.length > 0 && selected === boxes.length;
            toggle.textContent = allSelected ? clearLabel : selectAllLabel;
            toggle.setAttribute("aria-pressed", allSelected ? "true" : "false");
          }
        }
        form.addEventListener("change", function (event) {
          if (event.target && event.target.matches("[data-listing-select]")) refresh();
        });
        if (toggle) {
          toggle.addEventListener("click", function () {
            var shouldSelect = false;
            for (var j = 0; j < boxes.length; j += 1) if (!boxes[j].checked) shouldSelect = true;
            for (var k = 0; k < boxes.length; k += 1) boxes[k].checked = shouldSelect;
            refresh();
          });
        }
        refresh();
      })(forms[i]);
    }
  }
  function initAdminMutationForms() {
    document.addEventListener("submit", function (event) {
      var form = event.target;
      if (!(form instanceof HTMLFormElement) || !form.hasAttribute("data-admin-mutation-form")) return;
      event.preventDefault();
      var buttons = form.querySelectorAll('[type="submit"]');
      var status = form.querySelector("[data-admin-mutation-status]");
      var saving = form.getAttribute("data-admin-mutation-saving") || "Saving…";
      var success = form.getAttribute("data-admin-mutation-success") || "Saved.";
      var failure = form.getAttribute("data-admin-mutation-failure") || "Could not save.";
      for (var i = 0; i < buttons.length; i += 1) buttons[i].disabled = true;
      form.setAttribute("aria-busy", "true");
      if (status) { status.textContent = saving; status.setAttribute("data-state", "saving"); }
      fetch(form.getAttribute("action"), {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(tourPayload(form)),
      })
        .then(function (response) {
          return response.json().catch(function () { return {}; }).then(function (payload) {
            if (!response.ok) throw new Error(payload.message || failure);
            return payload;
          });
        })
        .then(function () {
          if (status) { status.textContent = success; status.setAttribute("data-state", "success"); }
          window.setTimeout(function () { window.location.reload(); }, 150);
        })
        .catch(function (error) {
          if (status) { status.textContent = error.message || failure; status.setAttribute("data-state", "error"); }
        })
        .then(function () {
          form.removeAttribute("aria-busy");
          for (var i = 0; i < buttons.length; i += 1) buttons[i].disabled = false;
        });
    });
  }
  initLeadQueueFilters();
  initLeadPipelineFilters();
  initListingBulkForms();
  initAdminMutationForms();
  initTourEditor();
  initViewingFollowUpForms();
  initSellerPipelineOutcomeForms();
  initPublicRequestOutcomeForms();
  initTranslationWorkflowForms();
  initReplyDeliveryForms();
  initReplyForms();
  initCommunicationTemplates();
})();`;
