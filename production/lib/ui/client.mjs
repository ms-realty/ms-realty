// Progressive-enhancement scripts inlined by html.mjs. Pages stay fully
// server-rendered; this layer wires saved listings (localStorage), the enquiry
// dialog, JSON lead submission (/api/leads only parses JSON bodies), share,
// and the admin lead-queue filters. Public 360 tours progressively load the
// pinned Photo Sphere Viewer package only after server-side media review.

export const PUBLIC_APP_JS = `(function () {
  "use strict";
  var I18N = window.MS_REALTY_I18N || {};
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
    if (typeof value !== "string" || !/^https:\/\//i.test(value)) return false;
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
  function hermesOutputFor(form) {
    var assistant = form.closest("[data-hermes-assistant]");
    return assistant ? assistant.querySelector("[data-hermes-chat-output]") : null;
  }
  function clearHermesOutput(output) {
    while (output.firstChild) output.removeChild(output.firstChild);
  }
  function hermesMessage(output, value, state) {
    clearHermesOutput(output);
    var message = document.createElement("p");
    message.className = "hermes-assistant__message";
    message.textContent = value;
    output.appendChild(message);
    output.setAttribute("data-state", state);
  }
  function isSafeInternalPath(value) {
    return typeof value === "string" && /^\/(?![\/\\])/.test(value);
  }
  function renderHermesReply(form, payload) {
    var output = hermesOutputFor(form);
    if (!output) return;
    clearHermesOutput(output);
    var answer = document.createElement("p");
    answer.className = "hermes-assistant__answer";
    answer.textContent = payload.answer || "";
    output.appendChild(answer);
    if (payload.disclosure) {
      var disclosure = document.createElement("p");
      disclosure.className = "hermes-assistant__disclosure";
      disclosure.textContent = payload.disclosure;
      output.appendChild(disclosure);
    }
    var citations = Array.isArray(payload.citations) ? payload.citations : [];
    if (citations.length) {
      var sources = document.createElement("section");
      sources.className = "hermes-assistant__sources";
      var heading = document.createElement("h3");
      heading.textContent = form.getAttribute("data-hermes-sources-label") || "Approved sources";
      sources.appendChild(heading);
      var list = document.createElement("ul");
      for (var i = 0; i < citations.length; i += 1) {
        var citation = citations[i] || {};
        if (!isSafeInternalPath(citation.path)) continue;
        var item = document.createElement("li");
        var link = document.createElement("a");
        link.href = citation.path;
        link.textContent = citation.title || citation.id || citation.path;
        item.appendChild(link);
        list.appendChild(item);
      }
      if (list.childNodes.length) {
        sources.appendChild(list);
        output.appendChild(sources);
      }
    }
    output.setAttribute("data-state", "ready");
  }
  function submitHermesChat(form) {
    var output = hermesOutputFor(form);
    var submit = form.querySelector('[type="submit"]');
    if (submit) submit.setAttribute("data-loading", "");
    if (output) {
      output.setAttribute("aria-busy", "true");
      hermesMessage(output, form.getAttribute("data-hermes-pending") || "Hermes is preparing an answer...", "loading");
    }
    var locale = form.elements.locale ? form.elements.locale.value : document.documentElement.lang;
    var query = form.elements.query ? form.elements.query.value : "";
    fetch(form.getAttribute("action") || "/api/hermes/chat", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ locale: locale, query: query }),
    })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (payload) {
          if (!response.ok || payload.kind !== "hermes_public_chat" || !payload.answer) throw new Error(payload.message || "Hermes chat failed");
          return payload;
        });
      })
      .then(function (payload) { renderHermesReply(form, payload); })
      .catch(function () {
        if (output) hermesMessage(output, form.getAttribute("data-hermes-failure") || "Hermes could not answer. Try again or contact a broker.", "error");
      })
      .then(function () {
        if (output) output.removeAttribute("aria-busy");
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
    if (form.hasAttribute("data-hermes-chat-form")) {
      event.preventDefault();
      submitHermesChat(form);
      return;
    }
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
  initPhotoSphereViewers();
})();`;

export const ADMIN_APP_JS = `(function () {
  "use strict";
  function initLeadQueueFilters() {
    var tabs = document.querySelector("[data-lead-queue-tabs]");
    if (!tabs) return;
    tabs.addEventListener("click", function (event) {
      var button = event.target.closest("button[data-lead-filter]");
      if (!button) return;
      var buttons = tabs.querySelectorAll("button[data-lead-filter]");
      for (var i = 0; i < buttons.length; i += 1) {
        buttons[i].setAttribute("data-on", buttons[i] === button ? "1" : "0");
      }
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
  }
  function tourPayload(form) {
    var data = new FormData(form);
    var payload = {};
    data.forEach(function (value, key) {
      if (String(value) !== "") payload[key] = value;
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
  initLeadQueueFilters();
  initTourEditor();
})();`;
