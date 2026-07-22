// Progressive-enhancement scripts emitted as versioned local assets by
// build-design-assets.mjs. Pages stay fully server-rendered; this layer wires
// saved listings, enquiries, the 360 viewer, and admin filters.

export const PUBLIC_APP_JS = `(function () {
  "use strict";
  var publicClientScript = document.currentScript || document.querySelector("script[data-ms-realty-public-client]");
  var I18N = {
    requestSent: publicClientScript ? publicClientScript.getAttribute("data-request-sent") || "" : "",
    requestFailed: publicClientScript ? publicClientScript.getAttribute("data-request-failed") || "" : "",
    shareCopied: publicClientScript ? publicClientScript.getAttribute("data-share-copied") || "" : "",
  };
  var KEY = "ms-realty:saved-listings";
  var SEARCH_SCROLL_KEY = "ms-realty:search-scroll";
  var lastLeadTrigger = null;
  var lastContactOptionsTrigger = null;
  var toastTimer = 0;
  var PHOTO_SPHERE_VIEWER_SCRIPT_URL = "/vendor/photo-sphere-viewer.js";
  var PHOTO_SPHERE_VIEWER_CSS_URL = "/vendor/photo-sphere-viewer.css";
  var photoSphereViewerPromise = null;
  function readSaved() {
    try {
      var value = JSON.parse(localStorage.getItem(KEY));
      return Array.isArray(value) ? value.filter(function (id) { return typeof id === "string" && id; }) : [];
    } catch (error) { return []; }
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
      var buttonLabel = buttons[i].getAttribute(on ? "data-saved-label" : "data-save-label") || buttons[i].getAttribute("aria-label") || "";
      if (buttonLabel) {
        buttons[i].setAttribute("aria-label", buttonLabel);
        var buttonText = buttons[i].querySelector("span");
        if (buttonText) buttonText.textContent = buttonLabel;
        else buttons[i].textContent = buttonLabel;
      }
    }

    var savedBadges = document.querySelectorAll("[data-saved-count]");
    for (var j = 0; j < savedBadges.length; j += 1) {
      savedBadges[j].textContent = String(saved.length);
      savedBadges[j].hidden = saved.length === 0;
    }
    var savedLinks = document.querySelectorAll("[data-saved-navigation]");
    for (var k = 0; k < savedLinks.length; k += 1) {
      var savedLinkLabel = savedLinks[k].getAttribute("data-saved-navigation-label") || "";
      savedLinks[k].setAttribute("aria-label", saved.length ? savedLinkLabel + " · " + saved.length : savedLinkLabel);
    }

    var savedView = document.querySelector("[data-saved-listings-view='true']");
    if (savedView) {
      var visibleSaved = 0;
      var savedCards = savedView.querySelectorAll("[data-search-card][data-listing-id]");
      for (var m = 0; m < savedCards.length; m += 1) {
        var cardSaved = saved.indexOf(savedCards[m].getAttribute("data-listing-id")) !== -1;
        savedCards[m].hidden = !cardSaved;
        savedCards[m].setAttribute("data-saved", cardSaved ? "true" : "false");
        if (cardSaved) visibleSaved += 1;
      }
      var savedGrid = savedView.querySelector("[data-saved-listings-grid]");
      var savedEmpty = savedView.querySelector("[data-saved-listings-empty]");
      if (savedGrid) savedGrid.hidden = visibleSaved === 0;
      if (savedEmpty) savedEmpty.hidden = visibleSaved !== 0;
      var savedCount = savedView.querySelector("[data-saved-listings-count]");
      if (savedCount) {
        savedCount.textContent = String(visibleSaved) + " " + (savedCount.getAttribute("data-saved-count-label") || "");
        savedCount.hidden = false;
      }
      savedView.setAttribute("data-saved-listings-ready", "true");
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
    var note = document.createElement("section");
    var icon = document.createElement("span");
    var message = document.createElement("p");
    note.className = "mk-card mk-card--elevated ct-success";
    note.setAttribute("role", "status");
    note.setAttribute("tabindex", "-1");
    note.setAttribute("data-request-success", "true");
    icon.className = "ct-success__icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "✓";
    message.textContent = form.getAttribute("data-success-message") || I18N.requestSent || "Sent.";
    note.appendChild(icon);
    note.appendChild(message);
    form.replaceWith(note);
    note.focus();
  }
  function showToast(message) {
    if (!message) return;
    var toast = document.querySelector("[data-public-toast]");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "public-toast";
      toast.setAttribute("data-public-toast", "true");
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      toast.setAttribute("aria-atomic", "true");
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toast.hidden = true; }, 2600);
  }
  function copyShareUrl(value) {
    var copied = function () { showToast(I18N.shareCopied || "Link copied."); };
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      navigator.clipboard.writeText(value).then(copied).catch(function () {});
      return;
    }
    var field = document.createElement("textarea");
    field.value = value;
    field.setAttribute("readonly", "");
    field.style.cssText = "position:fixed;opacity:0;pointer-events:none";
    document.body.appendChild(field);
    field.select();
    try {
      if (document.execCommand("copy")) copied();
    } catch (error) {}
    document.body.removeChild(field);
  }
  function submitJson(form, onDone) {
    var submit = form.querySelector('[type="submit"]');
    if (submit) {
      submit.setAttribute("data-loading", "");
      submit.setAttribute("aria-busy", "true");
      submit.disabled = true;
    }
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
        warn.textContent = I18N.requestFailed || "Request failed";
        warn.setAttribute("tabindex", "-1");
        warn.focus({ preventScroll: true });
        var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        warn.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
      })
      .then(function () {
        if (submit) {
          submit.removeAttribute("data-loading");
          submit.removeAttribute("aria-busy");
          submit.disabled = false;
        }
      });
  }
  function isApprovedPanoramaUrl(value) {
    if (typeof value !== "string" || !/^https:\\/\\//i.test(value)) return false;
    try {
      var url = new URL(value);
      return url.protocol === "https:" && !/(^localhost$|\\.(test|example|invalid|localhost)$)/i.test(url.hostname);
    } catch (error) { return false; }
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
    var navigationLink = section.id ? document.querySelector('a[href="#' + section.id + '"]') : null;
    if (navigationLink) navigationLink.hidden = true;
    section.hidden = true;
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
        showTourFallback(section);
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
    var helpNode = dialog.querySelector("[data-enquiry-help]");
    var nextNode = dialog.querySelector("[data-enquiry-next] p");
    var intentIcons = dialog.querySelectorAll("[data-enquiry-icon]");
    var submit = form.querySelector("[data-enquiry-submit]");
    var channel = form.elements.contact_preference;
    var channelGroup = form.querySelector("[data-enquiry-channel-group]");
    var callbackTimeGroup = form.querySelector("[data-enquiry-callback-time-group]");
    var callbackTime = form.querySelector("[data-enquiry-callback-time]");
    var viewingFields = form.querySelector("[data-enquiry-viewing-fields]");
    var viewingDate = form.querySelector("[data-enquiry-viewing-date]");
    var viewingTime = form.querySelector("[data-enquiry-viewing-time]");
    var message = form.querySelector("[data-enquiry-message]");
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
    if (callbackTime) callbackTime.required = intent === "callback";
    if (viewingFields) viewingFields.hidden = intent !== "viewing";
    if (viewingDate) viewingDate.required = intent === "viewing";
    if (viewingTime) viewingTime.required = intent === "viewing";
    if (viewingDate) {
      var localToday = new Date();
      localToday.setMinutes(localToday.getMinutes() - localToday.getTimezoneOffset());
      viewingDate.min = localToday.toISOString().slice(0, 10);
    }
    if (message) message.required = intent === "inquiry";
    if (titleNode) titleNode.textContent = title;
    if (helpNode) helpNode.textContent = form.getAttribute("data-help-" + intent) || "";
    if (nextNode) nextNode.textContent = form.getAttribute("data-next-" + intent) || "";
    for (var i = 0; i < intentIcons.length; i += 1) intentIcons[i].hidden = intentIcons[i].getAttribute("data-enquiry-icon") !== intent;
    if (submit) {
      var submitLabel = submit.querySelector("span") || submit;
      submitLabel.textContent = submitText;
    }
    dialog.setAttribute("aria-label", title);
    dialog.setAttribute("data-enquiry-intent", intent);
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
  function initMobileSearchFilters() {
    var sheet = document.querySelector("[data-mobile-search-filters]");
    if (!sheet) return;
    var summary = sheet.querySelector("summary");
    var panel = sheet.querySelector("[data-mobile-filter-sheet]");
    var wasOpen = Boolean(sheet.open);
    var focusableSelector = "a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex='-1'])";
    function focusableControls() {
      if (!panel) return [];
      return Array.prototype.filter.call(panel.querySelectorAll(focusableSelector), function (element) {
        return !element.hidden && element.getAttribute("aria-hidden") !== "true" && element.getClientRects().length > 0;
      });
    }
    function closeSheet() {
      sheet.open = false;
      syncSheetState();
      if (summary) summary.focus();
    }
    function syncSheetState() {
      var isOpen = Boolean(sheet.open);
      document.documentElement.classList.toggle("mobile-sheet-open", isOpen);
      if (summary) summary.setAttribute("aria-expanded", isOpen ? "true" : "false");
      if (isOpen && !wasOpen) {
        window.requestAnimationFrame(function () {
          var controls = focusableControls();
          if (controls[0]) controls[0].focus();
          else if (panel) {
            panel.setAttribute("tabindex", "-1");
            panel.focus();
          }
        });
      }
      wasOpen = isOpen;
    }
    sheet.addEventListener("toggle", syncSheetState);
    sheet.addEventListener("click", function (event) {
      var close = event.target.closest("[data-mobile-filter-close]");
      if (!close) return;
      event.preventDefault();
      closeSheet();
    });
    document.addEventListener("keydown", function (event) {
      if (!sheet.open) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeSheet();
        return;
      }
      if (event.key !== "Tab") return;
      var controls = focusableControls();
      if (!controls.length) return;
      var first = controls[0];
      var last = controls[controls.length - 1];
      if (!panel.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    syncSheetState();
  }
  function initMobileFilterPreview() {
    var form = document.getElementById("sr-mobile-filter-form");
    var submit = document.querySelector("[data-mobile-filter-submit]");
    var status = document.querySelector("[data-mobile-filter-preview-status]");
    if (!form || !submit || typeof window.fetch !== "function" || typeof window.DOMParser !== "function") return;
    var timer = 0;
    var controller = null;
    var requestNumber = 0;
    function setBusy(value) {
      if (value) submit.setAttribute("aria-busy", "true");
      else submit.removeAttribute("aria-busy");
    }
    function updateCount(total) {
      var base = submit.getAttribute("data-mobile-filter-base-label") || "Search";
      var matches = submit.getAttribute("data-mobile-filter-matches-label") || "matches";
      var text = base + " · " + String(total) + " " + matches;
      var label = submit.querySelector("span") || submit;
      label.textContent = text;
      submit.setAttribute("aria-label", text);
      if (status) status.textContent = String(total) + " " + matches;
    }
    function preview() {
      requestNumber += 1;
      var currentRequest = requestNumber;
      if (controller) controller.abort();
      controller = typeof AbortController === "function" ? new AbortController() : null;
      var url = new URL(form.getAttribute("action") || window.location.pathname, window.location.href);
      var params = new URLSearchParams();
      new FormData(form).forEach(function (value, key) {
        if (String(value) !== "") params.set(key, String(value));
      });
      url.search = params.toString();
      setBusy(true);
      fetch(url.toString(), {
        credentials: "same-origin",
        headers: { accept: "text/html", "x-ms-realty-preview": "search-count" },
        signal: controller ? controller.signal : undefined,
      })
        .then(function (response) {
          if (!response.ok) throw new Error(String(response.status));
          return response.text();
        })
        .then(function (html) {
          if (currentRequest !== requestNumber) return;
          var parsed = new DOMParser().parseFromString(html, "text/html");
          var root = parsed.querySelector('main[data-kind="search"][data-total-matches]');
          var total = root ? Number(root.getAttribute("data-total-matches")) : NaN;
          if (Number.isFinite(total) && total >= 0) updateCount(total);
        })
        .catch(function (error) {
          if (error && error.name === "AbortError") return;
        })
        .then(function () {
          if (currentRequest === requestNumber) setBusy(false);
        });
    }
    function schedulePreview() {
      window.clearTimeout(timer);
      timer = window.setTimeout(preview, 320);
    }
    form.addEventListener("input", schedulePreview);
    form.addEventListener("change", schedulePreview);
    form.addEventListener("submit", function () {
      window.clearTimeout(timer);
      if (controller) controller.abort();
    });
  }
  function initImageFallbacks() {
    var images = document.querySelectorAll("main[data-react-public-ui] img, img[data-fallback-src]");
    function recoverImage(image) {
      var fallback = image.getAttribute("data-fallback-src");
      if (fallback && image.getAttribute("src") !== fallback) {
        image.removeAttribute("data-fallback-src");
        image.setAttribute("src", fallback);
        return;
      }
      image.hidden = true;
      image.setAttribute("data-image-state", "unavailable");
      if (image.parentElement) image.parentElement.setAttribute("data-image-state", "unavailable");
    }
    for (var i = 0; i < images.length; i += 1) {
      (function (image) {
        image.addEventListener("error", function () { recoverImage(image); });
        if (image.complete && image.naturalWidth === 0) recoverImage(image);
      })(images[i]);
    }
  }
  function initMobileListingGallery() {
    var gallery = document.querySelector("[data-mobile-gallery]");
    var shell = gallery ? gallery.closest(".ld-gallery-shell") : null;
    var current = shell ? shell.querySelector("[data-mobile-gallery-current]") : null;
    var progress = shell ? shell.querySelector("[data-mobile-gallery-progress]") : null;
    var slides = gallery ? gallery.querySelectorAll("[data-mobile-gallery-slide]") : [];
    if (!gallery || !current || slides.length < 2) return;
    var frame = 0;
    function updateGalleryPosition() {
      frame = 0;
      var galleryBox = gallery.getBoundingClientRect();
      var galleryCenter = galleryBox.left + galleryBox.width / 2;
      var activeIndex = 0;
      var activeDistance = Infinity;
      for (var i = 0; i < slides.length; i += 1) {
        var slideBox = slides[i].getBoundingClientRect();
        var distance = Math.abs(slideBox.left + slideBox.width / 2 - galleryCenter);
        if (distance < activeDistance) {
          activeDistance = distance;
          activeIndex = i;
        }
        slides[i].removeAttribute("data-gallery-active");
      }
      slides[activeIndex].setAttribute("data-gallery-active", "true");
      gallery.setAttribute("data-mobile-gallery-index", String(activeIndex + 1));
      current.textContent = String(activeIndex + 1);
      if (progress) progress.setAttribute("aria-label", String(activeIndex + 1) + " / " + String(slides.length));
    }
    function scheduleGalleryPosition() {
      if (frame) return;
      frame = window.requestAnimationFrame(updateGalleryPosition);
    }
    gallery.addEventListener("scroll", scheduleGalleryPosition, { passive: true });
    window.addEventListener("resize", scheduleGalleryPosition);
    updateGalleryPosition();
  }
  function initSearchScrollRestoration() {
    var searchRoot = document.querySelector("[data-search-results], [data-saved-listings-view='true']");
    if (!searchRoot) return;
    var lastListingId = null;
    function writePosition() {
      try {
        sessionStorage.setItem(SEARCH_SCROLL_KEY, JSON.stringify({
          path: location.pathname + location.search,
          top: Math.max(0, Math.round(window.scrollY || 0)),
          listingId: lastListingId,
          savedAt: Date.now(),
        }));
      } catch (error) {}
    }
    function readPosition() {
      try {
        var value = JSON.parse(sessionStorage.getItem(SEARCH_SCROLL_KEY));
        return value && typeof value === "object" ? value : null;
      } catch (error) { return null; }
    }
    document.addEventListener("click", function (event) {
      var link = event.target.closest("[data-search-card] a[href]");
      if (!link) return;
      var card = link.closest("[data-search-card][data-listing-id]");
      lastListingId = card ? card.getAttribute("data-listing-id") : null;
      writePosition();
    });
    window.addEventListener("pagehide", writePosition);
    window.addEventListener("pageshow", function (event) {
      var entries = window.performance && typeof window.performance.getEntriesByType === "function"
        ? window.performance.getEntriesByType("navigation")
        : [];
      var backForward = event.persisted || (entries[0] && entries[0].type === "back_forward");
      if (!backForward) return;
      var saved = readPosition();
      if (!saved || saved.path !== location.pathname + location.search || Date.now() - Number(saved.savedAt || 0) > 1800000) return;
      lastListingId = typeof saved.listingId === "string" ? saved.listingId : null;
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () {
          var maxTop = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
          window.scrollTo({ top: Math.min(maxTop, Math.max(0, Number(saved.top) || 0)), behavior: "auto" });
          if (!lastListingId) return;
          var cards = document.querySelectorAll("[data-search-card][data-listing-id]");
          for (var i = 0; i < cards.length; i += 1) {
            if (cards[i].getAttribute("data-listing-id") !== lastListingId || cards[i].hidden) continue;
            var focusTarget = cards[i].querySelector("a[data-card-thumbnail], h2 a");
            if (focusTarget) focusTarget.focus({ preventScroll: true });
            break;
          }
        });
      });
    });
  }
  function initDialogFocusReturn() {
    var enquiry = document.getElementById("mk-enquiry");
    if (enquiry) enquiry.addEventListener("close", function () {
      var target = lastLeadTrigger;
      lastLeadTrigger = null;
      if (target && target.isConnected && target.getClientRects().length) {
        window.requestAnimationFrame(function () { target.focus(); });
      }
    });
    var contactOptions = document.querySelector("[data-mobile-contact-options]");
    if (contactOptions) contactOptions.addEventListener("close", function () {
      var target = lastContactOptionsTrigger;
      lastContactOptionsTrigger = null;
      if (target && target.isConnected && target.getClientRects().length) {
        window.requestAnimationFrame(function () { target.focus(); });
      }
    });
  }
  function initPublicMobileNavigation() {
    var mobileMenu = document.querySelector("[data-mobile-menu]");
    if (!mobileMenu) return;
    var summary = mobileMenu.querySelector(":scope > summary");
    var panel = mobileMenu.querySelector(".site-hd__mobile-panel");
    var backdrop = mobileMenu.querySelector("[data-mobile-menu-close]");
    if (!summary || !panel) return;
    function focusableItems() {
      var items = panel.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
      var visible = [];
      for (var i = 0; i < items.length; i += 1) {
        if (items[i].getClientRects().length) visible.push(items[i]);
      }
      return visible;
    }
    function syncOpenState() {
      summary.setAttribute("aria-expanded", mobileMenu.open ? "true" : "false");
      document.documentElement.classList.toggle("public-mobile-nav-open", mobileMenu.open);
      if (!mobileMenu.open) return;
      window.requestAnimationFrame(function () {
        var target = panel.querySelector('[aria-current="page"]') || focusableItems()[0];
        if (target) target.focus();
      });
    }
    function closeNavigation(returnFocus) {
      mobileMenu.open = false;
      syncOpenState();
      if (returnFocus) summary.focus();
    }
    mobileMenu.addEventListener("toggle", syncOpenState);
    if (backdrop) backdrop.addEventListener("click", function () { closeNavigation(true); });
    panel.addEventListener("click", function (event) {
      if (event.target.closest("a[href]")) closeNavigation(false);
    });
    document.addEventListener("keydown", function (event) {
      if (!mobileMenu.open) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeNavigation(true);
        return;
      }
      if (event.key !== "Tab") return;
      var items = focusableItems();
      if (!items.length) return;
      var first = items[0];
      var last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    var mobileViewport = window.matchMedia("(max-width: 1080px)");
    if (mobileViewport.addEventListener) {
      mobileViewport.addEventListener("change", function (event) {
        if (!event.matches && mobileMenu.open) closeNavigation(false);
      });
    }
    syncOpenState();
  }
  function useSameOriginHistoryBack(link) {
    if (!link || link.getAttribute("data-history-back") !== "same-origin" || window.history.length < 2 || !document.referrer) return false;
    try {
      var previous = new URL(document.referrer);
      if (previous.origin !== window.location.origin || previous.href === window.location.href) return false;
      window.history.back();
      return true;
    } catch (error) {
      return false;
    }
  }
  document.addEventListener("click", function (event) {
    if (event.target && event.target.matches && event.target.matches("#mk-enquiry")) {
      event.target.close();
      return;
    }
    if (event.target && event.target.matches && event.target.matches("[data-mobile-contact-options]")) {
      event.target.close();
      return;
    }
    var contactOptionsOpen = event.target.closest("[data-mobile-contact-options-open]");
    if (contactOptionsOpen) {
      var contactOptions = document.querySelector("[data-mobile-contact-options]");
      if (contactOptions && typeof contactOptions.showModal === "function") {
        lastContactOptionsTrigger = contactOptionsOpen;
        contactOptions.showModal();
      }
      return;
    }
    var contactOptionsClose = event.target.closest("[data-mobile-contact-options-close]");
    if (contactOptionsClose) {
      var contactOptionsDialog = contactOptionsClose.closest("[data-mobile-contact-options]");
      if (contactOptionsDialog && typeof contactOptionsDialog.close === "function") contactOptionsDialog.close();
      return;
    }
    var backToResults = event.target.closest('[data-listing-action="back_to_results"]');
    if (backToResults && useSameOriginHistoryBack(backToResults)) {
      event.preventDefault();
      return;
    }
    var save = event.target.closest("[data-client-save-listing]");
    if (save) {
      event.preventDefault();
      var id = save.getAttribute("data-client-save-listing");
      var ids = readSaved();
      var index = ids.indexOf(id);
      var removingFromSavedView = index !== -1 && Boolean(save.closest("[data-saved-listings-view='true']"));
      if (index === -1) ids.push(id);
      else ids.splice(index, 1);
      writeSaved(ids);
      markSaved();
      if (removingFromSavedView) {
        var savedViewFocus = document.querySelector("[data-saved-listings-view='true'] [data-search-card]:not([hidden]) [data-client-save-listing]")
          || document.querySelector("[data-saved-listings-view='true'] [data-saved-listings-empty] a");
        if (savedViewFocus) window.requestAnimationFrame(function () { savedViewFocus.focus(); });
      }
      return;
    }
    var share = event.target.closest('[data-listing-action^="share"]');
    if (share) {
      event.preventDefault();
      var shareUrl = new URL(share.getAttribute("href") || location.href, location.href).href;
      if (navigator.share) {
        navigator.share({ title: document.title, url: shareUrl }).catch(function (error) {
          if (!error || error.name !== "AbortError") copyShareUrl(shareUrl);
        });
      } else {
        copyShareUrl(shareUrl);
      }
      return;
    }
    var lead = event.target.closest('button[data-endpoint="/api/leads"]');
    if (lead) {
      var leadOptionsDialog = lead.closest("[data-mobile-contact-options]");
      lastLeadTrigger = lead;
      if (leadOptionsDialog && typeof leadOptionsDialog.close === "function") {
        lastContactOptionsTrigger = null;
        leadOptionsDialog.close();
        lastLeadTrigger = document.querySelector("[data-mobile-sticky-primary]") || document.querySelector("[data-mobile-contact-options-open]") || lead;
      }
      var dialog = document.getElementById("mk-enquiry");
      if (!dialog || typeof dialog.showModal !== "function") return;
      configureEnquiryDialog(dialog, lead);
      dialog.showModal();
      window.requestAnimationFrame(function () {
        var firstField = dialog.querySelector('input[name="contact.name"]');
        if (firstField) firstField.focus();
      });
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
        var successDetail = dialog.querySelector("[data-enquiry-success-detail]");
        var nextDetail = form.querySelector("[data-enquiry-next] p");
        if (successDetail) successDetail.textContent = nextDetail ? nextDetail.textContent : "";
        form.hidden = true;
        var success = dialog.querySelector(".ct-done");
        success.hidden = false;
        form.reset();
        var successClose = success.querySelector("[data-enquiry-close]");
        if (successClose) window.requestAnimationFrame(function () { successClose.focus(); });
      } else {
        showSuccess(form);
      }
    });
  });
  window.addEventListener("storage", function (event) {
    if (event.key === KEY) markSaved();
  });
  markSaved();
  initSearchScrollRestoration();
  initDialogFocusReturn();
  initPublicMobileNavigation();
  initSavedSearchContacts();
  initMobileSearchFilters();
  initMobileFilterPreview();
  initImageFallbacks();
  initMobileListingGallery();
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
  function syncRouteDecisionForm(form) {
    var select = form.querySelector("[data-route-decision-select]");
    var target = form.querySelector("[data-route-decision-target]");
    var targetPreview = form.querySelector("[data-route-decision-target-preview]");
    var equivalent = form.querySelector("[data-route-decision-equivalence]");
    if (!select) return;
    var decision = select.value;
    var requiresEquivalentTarget = decision === "redirect_301" || decision === "retain_200";
    if (target) {
      target.disabled = !requiresEquivalentTarget;
      target.required = requiresEquivalentTarget;
    }
    if (targetPreview) {
      var targetPath = target ? target.value.trim() : "";
      var canPreview = requiresEquivalentTarget && targetPath.indexOf("/") === 0 && targetPath.indexOf("//") !== 0;
      targetPreview.hidden = !canPreview;
      if (canPreview) targetPreview.setAttribute("href", targetPath);
    }
    if (equivalent) {
      equivalent.disabled = !requiresEquivalentTarget;
      equivalent.required = requiresEquivalentTarget;
      if (!requiresEquivalentTarget) equivalent.checked = false;
    }
  }
  function initRouteDecisionForms() {
    var forms = document.querySelectorAll("[data-route-decision-form]");
    for (var i = 0; i < forms.length; i += 1) {
      (function (form) {
        var select = form.querySelector("[data-route-decision-select]");
        var target = form.querySelector("[data-route-decision-target]");
        if (select) select.addEventListener("change", function () { syncRouteDecisionForm(form); });
        if (target) target.addEventListener("input", function () { syncRouteDecisionForm(form); });
        syncRouteDecisionForm(form);
      })(forms[i]);
    }
  }
  function initAdminMobileNavigation() {
    var mobileNav = document.querySelector("[data-admin-mobile-nav]");
    if (!mobileNav) return;
    var summary = mobileNav.querySelector(".adm-mobile-nav__summary");
    var panel = mobileNav.querySelector(".adm-mobile-nav__panel");
    if (!summary || !panel) return;
    function focusableItems() {
      var items = panel.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
      var visible = [];
      for (var i = 0; i < items.length; i += 1) {
        if (items[i].getClientRects().length) visible.push(items[i]);
      }
      return visible;
    }
    function syncOpenState() {
      summary.setAttribute("aria-expanded", mobileNav.open ? "true" : "false");
      document.documentElement.classList.toggle("admin-mobile-nav-open", mobileNav.open);
      if (!mobileNav.open) return;
      window.requestAnimationFrame(function () {
        var target = panel.querySelector('[aria-current="page"]') || focusableItems()[0];
        if (target) target.focus();
      });
    }
    function closeNavigation(returnFocus) {
      mobileNav.open = false;
      syncOpenState();
      if (returnFocus) summary.focus();
    }
    mobileNav.addEventListener("toggle", syncOpenState);
    panel.addEventListener("click", function (event) {
      if (event.target.closest("a[href]")) closeNavigation(false);
    });
    document.addEventListener("keydown", function (event) {
      if (!mobileNav.open) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeNavigation(true);
        return;
      }
      if (event.key !== "Tab") return;
      var items = focusableItems();
      if (!items.length) return;
      var first = items[0];
      var last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    var mobileViewport = window.matchMedia("(max-width: 760px)");
    if (mobileViewport.addEventListener) {
      mobileViewport.addEventListener("change", function (event) {
        if (!event.matches && mobileNav.open) closeNavigation(false);
      });
    }
    syncOpenState();
  }
  function completeRouteDecision(form, payload) {
    var item = form.closest("[data-pending-route-decision]");
    var list = item ? item.parentElement : null;
    var panel = item ? item.closest("[data-pending-route-count]") : null;
    if (!item || !list || !panel) return false;
    var pending = Math.max(0, Number(panel.getAttribute("data-pending-route-count") || 0) - 1);
    var filtered = Math.max(0, Number(panel.getAttribute("data-filtered-route-count") || 0) - 1);
    var reviewed = payload && Array.isArray(payload.terminalDecisionPreview)
      ? payload.terminalDecisionPreview.length
      : Number(panel.getAttribute("data-reviewed-route-count") || 0) + 1;
    panel.setAttribute("data-pending-route-count", String(pending));
    panel.setAttribute("data-filtered-route-count", String(filtered));
    panel.setAttribute("data-reviewed-route-count", String(reviewed));
    var pendingValue = panel.querySelector("[data-pending-route-value]");
    var filteredValue = panel.querySelector("[data-filtered-route-value]");
    var reviewedValue = panel.querySelector("[data-reviewed-route-value]");
    if (pendingValue) pendingValue.textContent = String(pending);
    if (filteredValue) filteredValue.textContent = String(filtered);
    if (reviewedValue) reviewedValue.textContent = String(reviewed);
    var nextItem = item.nextElementSibling;
    item.setAttribute("data-route-decision-state", "saved");
    var reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(function () {
      item.remove();
      var next = nextItem && nextItem.isConnected ? nextItem : list.querySelector("[data-pending-route-decision]");
      if (!next) {
        window.location.reload();
        return;
      }
      var details = next.querySelector(".adm-route-decision__disclosure");
      var summary = details ? details.querySelector("summary") : null;
      if (details) details.open = true;
      if (summary) {
        summary.focus({ preventScroll: true });
        summary.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "nearest" });
      }
    }, reducedMotion ? 0 : 220);
    return true;
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
        .then(function (payload) {
          if (status) { status.textContent = success; status.setAttribute("data-state", "success"); }
          if (!form.hasAttribute("data-route-decision-form") || !completeRouteDecision(form, payload)) {
            window.setTimeout(function () { window.location.reload(); }, 150);
          }
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
  initAdminMobileNavigation();
  initLeadPipelineFilters();
  initListingBulkForms();
  initRouteDecisionForms();
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
