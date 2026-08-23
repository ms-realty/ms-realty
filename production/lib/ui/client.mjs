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
  var SEARCH_RETURN_KEY = "ms-realty:search-return";
  var RECENT_SEARCH_KEY = "ms-realty:recent-searches:v1";
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
  function savedListsMatch(left, right) {
    if (left.length !== right.length) return false;
    for (var i = 0; i < left.length; i += 1) {
      if (left[i] !== right[i]) return false;
    }
    return true;
  }
  function writeSaved(ids) {
    try {
      localStorage.setItem(KEY, JSON.stringify(ids));
      return savedListsMatch(readSaved(), ids);
    } catch (error) { return false; }
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
  // First touch: the path of the page where this visit started. Kept in
  // sessionStorage, stripped of any query string, and never put in a URL.
  var FIRST_TOUCH_KEY = "ms-realty:first-touch";
  function sitePath(value) {
    var raw = String(value || "");
    var path = raw.split("#")[0].split("?")[0];
    if (path.indexOf("/") !== 0 || path.indexOf("//") === 0) return "";
    return path.length > 200 ? "" : path;
  }
  function firstTouchPath() {
    var here = sitePath(window.location.pathname);
    try {
      var stored = sitePath(window.sessionStorage.getItem(FIRST_TOUCH_KEY) || "");
      if (stored) return stored;
      if (here) window.sessionStorage.setItem(FIRST_TOUCH_KEY, here);
    } catch (error) {
      return here;
    }
    return here;
  }
  // The channel is the surface family this page belongs to, from a closed
  // list the server also knows. Never free text.
  function leadChannel() {
    var main = document.querySelector("main[data-kind]");
    var kind = main ? main.getAttribute("data-kind") : "";
    if (kind === "listing") return "listing_detail";
    if (kind === "search") return "search_results";
    if (kind === "home") return "home";
    if (kind === "seller") return "seller_page";
    if (kind === "start") return "buyer_onboarding";
    if (kind === "guide") return "guide";
    if (kind === "contact") return "contact_page";
    return "";
  }
  function applyLeadAttribution(form) {
    if (!form) return;
    var channelField = form.querySelector("[data-lead-channel-field]");
    var pathField = form.querySelector("[data-first-touch-field]");
    if (channelField && !channelField.value) channelField.value = leadChannel();
    if (pathField) pathField.value = firstTouchPath();
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
        return response.text();
      })
      .then(function () {
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
  function analyticsLocale() {
    return String(document.documentElement.getAttribute && document.documentElement.getAttribute("lang") || document.documentElement.lang || "bg").split("-")[0];
  }
  function analyticsListingReference(control) {
    var owner = control && control.closest ? control.closest("[data-listing-id]") : null;
    var direct = control && control.getAttribute ? control.getAttribute("data-listing-reference") : "";
    return direct || (owner && owner.getAttribute("data-listing-id")) || null;
  }
  function sendAnalyticsEvent(input) {
    var body = {
      type: input.type,
      path: window.location.pathname || "/",
      locale: analyticsLocale(),
      listingReference: input.listingReference || null,
      action: input.action || null,
      query: input.query || null,
      filters: input.filters || {},
      sort: input.sort || null,
      page: input.page || null,
    };
    Promise.resolve(fetch("/api/events", {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })).catch(function () {});
  }
  function analyticsAction(target) {
    if (!target || !target.closest) return null;
    var control = target.closest('[data-listing-action], [data-card-action], [data-endpoint="/api/leads"], a[href^="tel:"], a[href^="mailto:"], a[href^="viber:"], a[href*="wa.me"]');
    if (!control) return null;
    var action = control.getAttribute("data-listing-action") || control.getAttribute("data-card-action") || control.getAttribute("data-lead-intent");
    var href = control.getAttribute("href") || "";
    if (!action && href.indexOf("wa.me") !== -1) action = "whatsapp";
    else if (!action && href.indexOf("viber:") === 0) action = "viber";
    else if (!action && href.indexOf("tel:") === 0) action = "phone";
    else if (!action && href.indexOf("mailto:") === 0) action = "email";
    if (["detail", "inquiry", "callback", "viewing", "phone", "email", "viber", "whatsapp"].indexOf(action) === -1) return null;
    return action ? { action: action, listingReference: analyticsListingReference(control) } : null;
  }
  function initPrivacySafeAnalytics() {
    var main = document.querySelector("main[data-kind]");
    sendAnalyticsEvent({ type: "page_view", listingReference: analyticsListingReference(main) });
    if (!main || main.getAttribute("data-kind") !== "search") return;
    var params = new URLSearchParams(window.location.search || "");
    var filters = {};
    ["location", "country_code", "geography_id", "region_id", "municipality", "district", "property_family", "property_type", "offer_type", "status", "price_min", "price_max", "bedrooms_min", "bedrooms_max", "premises_min", "hotel_rooms_min", "area_min", "area_max", "land_area_min", "land_area_max", "floor_min", "floor_max", "storeys_min", "storeys_max", "exact_reference"].forEach(function (key) {
      if (params.get(key)) filters[key] = params.get(key);
    });
    [["deal", "offer_type"], ["type", "property_type"], ["price", "price_max"], ["min_price", "price_min"], ["max_price", "price_max"], ["bedrooms", "bedrooms_min"]].forEach(function (pair) {
      if (!filters[pair[1]] && params.get(pair[0])) filters[pair[1]] = params.get(pair[0]);
    });
    sendAnalyticsEvent({
      type: "search",
      query: params.get("q") || params.get("query") || "",
      filters: filters,
      sort: params.get("sort") || null,
      page: Number(params.get("page") || 1),
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
    var fallback = section.querySelector("[data-photo-sphere-fallback]");
    var navigationLink = section.id ? document.querySelector('a[href="#' + section.id + '"]') : null;
    if (fallback) {
      fallback.hidden = false;
      if (navigationLink) navigationLink.hidden = false;
      section.hidden = false;
      return;
    }
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
  function initGeographyComboboxes() {
    var comboboxes = document.querySelectorAll("[data-geography-combobox]");
    for (var i = 0; i < comboboxes.length; i += 1) initGeographyCombobox(comboboxes[i]);
  }
  function initGeographyCombobox(combobox) {
    var form = combobox.closest("form");
    if (!form) return;
    var locationInput = combobox ? combobox.querySelector("[data-geography-input]") : null;
    var geographyId = combobox ? combobox.querySelector("[data-geography-id]") : null;
    var options = combobox ? combobox.querySelector("[data-geography-options]") : null;
    var status = combobox ? combobox.querySelector("[data-geography-status]") : null;
    var country = form.querySelector("[data-geography-country]");
    var region = form.querySelector("[data-geography-region]");
    var results = [];
    var activeIndex = -1;
    var searchTimer = 0;
    var searchRequest = 0;
    var searchController = null;
    var optionIdPrefix = ((options && options.id) || "geography-options") + "-option-";
    var queryName = (locationInput && locationInput.getAttribute("name")) || combobox.getAttribute("data-geography-query-name") || "";
    function setFreeTextEnabled(enabled) {
      if (!locationInput || !queryName) return;
      if (enabled) locationInput.setAttribute("name", queryName);
      else locationInput.removeAttribute("name");
    }
    function clearGeographySelection(clearLabel) {
      if (!geographyId) return;
      var hadSelection = Boolean(geographyId.value);
      geographyId.value = "";
      setFreeTextEnabled(true);
      if (clearLabel && hadSelection && locationInput) locationInput.value = "";
    }
    function localizedGeographyName(item) {
      var locale = combobox ? combobox.getAttribute("data-geography-locale") || "en" : "en";
      var useNative = (locale === "bg" && item.country_code === "BG") || (locale === "el" && item.country_code === "GR");
      return String((useNative ? item.names && item.names.native : item.names && item.names.en) || item.names && item.names.native || item.official_code || "");
    }
    function geographyContext(item) {
      var ancestors = Array.isArray(item.context) ? item.context : [];
      var names = ancestors
        .slice(-2)
        .map(localizedGeographyName)
        .filter(function (name) { return name && name !== localizedGeographyName(item); });
      names.push(item.country_code);
      return names.filter(Boolean).join(" · ");
    }
    function closeGeographyOptions() {
      if (!locationInput || !options) return;
      options.hidden = true;
      locationInput.setAttribute("aria-expanded", "false");
      locationInput.removeAttribute("aria-activedescendant");
      activeIndex = -1;
    }
    function setActiveGeographyOption(nextIndex) {
      if (!locationInput || !options || !results.length) return;
      activeIndex = (nextIndex + results.length) % results.length;
      var optionNodes = options.querySelectorAll("[data-geography-option]");
      for (var i = 0; i < optionNodes.length; i += 1) {
        var active = i === activeIndex;
        optionNodes[i].setAttribute("aria-selected", active ? "true" : "false");
        if (active) optionNodes[i].scrollIntoView({ block: "nearest" });
      }
      locationInput.setAttribute("aria-activedescendant", optionIdPrefix + String(activeIndex));
    }
    function syncRegionOptions() {
      if (!country || !region) return;
      var selectedCountry = country.value;
      var regionOptions = region.querySelectorAll("option[data-country]");
      for (var i = 0; i < regionOptions.length; i += 1) {
        var available = !selectedCountry || regionOptions[i].getAttribute("data-country") === selectedCountry;
        regionOptions[i].hidden = !available;
        regionOptions[i].disabled = !available;
      }
      if (region.selectedOptions.length && region.selectedOptions[0].disabled) region.value = "";
    }
    function selectGeography(item) {
      if (!locationInput || !geographyId) return;
      locationInput.value = localizedGeographyName(item);
      geographyId.value = item.id || "";
      setFreeTextEnabled(false);
      if (country && item.country_code) country.value = item.country_code;
      syncRegionOptions();
      if (region) {
        var hierarchy = [item].concat(Array.isArray(item.context) ? item.context : []);
        var regionalArea = hierarchy.find(function (candidate) {
          return candidate.level === "district" || candidate.level === "region";
        });
        var regionOptions = region.querySelectorAll("option");
        for (var i = 0; regionalArea && i < regionOptions.length; i += 1) {
          if (regionOptions[i].value === regionalArea.id) region.value = regionalArea.id;
        }
      }
      closeGeographyOptions();
      if (status) status.textContent = localizedGeographyName(item) + " · " + geographyContext(item);
    }
    function renderGeographyOptions(items) {
      if (!locationInput || !options) return;
      options.textContent = "";
      results = Array.isArray(items) ? items : [];
      activeIndex = -1;
      if (!results.length) {
        var empty = document.createElement("div");
        empty.className = "hp-hero__location-empty";
        empty.setAttribute("role", "option");
        empty.setAttribute("aria-disabled", "true");
        empty.textContent = combobox.getAttribute("data-geography-empty-label") || "No locations found.";
        options.appendChild(empty);
        options.hidden = false;
        locationInput.setAttribute("aria-expanded", "true");
        if (status) status.textContent = empty.textContent;
        return;
      }
      for (var i = 0; i < results.length; i += 1) {
        (function (item, index) {
          var option = document.createElement("button");
          var name = document.createElement("strong");
          var context = document.createElement("span");
          option.type = "button";
          option.id = optionIdPrefix + String(index);
          option.className = "hp-hero__location-option";
          option.setAttribute("role", "option");
          option.setAttribute("aria-selected", "false");
          option.setAttribute("data-geography-option", item.id || "");
          option.tabIndex = -1;
          name.textContent = localizedGeographyName(item);
          context.textContent = geographyContext(item);
          option.appendChild(name);
          option.appendChild(context);
          option.addEventListener("pointerdown", function (event) { event.preventDefault(); });
          option.addEventListener("click", function () { selectGeography(item); });
          options.appendChild(option);
        })(results[i], i);
      }
      options.hidden = false;
      locationInput.setAttribute("aria-expanded", "true");
      if (status) status.textContent = String(results.length);
    }
    function fetchGeographyOptions() {
      if (!combobox || !locationInput || !options) return;
      var query = locationInput.value.trim();
      if (query.length < 2) {
        results = [];
        closeGeographyOptions();
        if (status) status.textContent = "";
        return;
      }
      searchRequest += 1;
      var request = searchRequest;
      if (searchController) searchController.abort();
      searchController = typeof AbortController === "function" ? new AbortController() : null;
      var url = new URL(combobox.getAttribute("data-geography-endpoint") || "/api/geography", window.location.href);
      url.searchParams.set("q", query);
      url.searchParams.set("limit", "8");
      url.searchParams.set("level", "settlement,municipality,municipal_district,municipal_unit,community,regional_unit,district,region");
      if (country && country.value) url.searchParams.set("country", country.value);
      if (region && region.value) url.searchParams.set("ancestor_id", region.value);
      combobox.setAttribute("aria-busy", "true");
      fetch(url.toString(), {
        credentials: "same-origin",
        headers: { accept: "application/json" },
        signal: searchController ? searchController.signal : undefined,
      })
        .then(function (response) {
          if (!response.ok) throw new Error(String(response.status));
          return response.json();
        })
        .then(function (payload) {
          if (request !== searchRequest) return;
          renderGeographyOptions(payload && payload.results);
        })
        .catch(function (error) {
          if (error && error.name === "AbortError") return;
          if (request === searchRequest) closeGeographyOptions();
        })
        .then(function () {
          if (request === searchRequest) combobox.removeAttribute("aria-busy");
        });
    }
    function scheduleGeographyOptions() {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(fetchGeographyOptions, 220);
    }
    if (locationInput && geographyId && options) {
      locationInput.addEventListener("input", function () {
        clearGeographySelection(false);
        scheduleGeographyOptions();
      });
      locationInput.addEventListener("keydown", function (event) {
        if (event.key === "ArrowDown" && results.length) {
          event.preventDefault();
          setActiveGeographyOption(activeIndex + 1);
        } else if (event.key === "ArrowUp" && results.length) {
          event.preventDefault();
          setActiveGeographyOption(activeIndex - 1);
        } else if (event.key === "Enter" && activeIndex >= 0 && results[activeIndex]) {
          event.preventDefault();
          selectGeography(results[activeIndex]);
        } else if (event.key === "Escape" && !options.hidden) {
          event.preventDefault();
          closeGeographyOptions();
        }
      });
      locationInput.addEventListener("blur", function () {
        window.setTimeout(closeGeographyOptions, 120);
      });
    }
    if (country) {
      country.addEventListener("change", function () {
        clearGeographySelection(true);
        syncRegionOptions();
        if (locationInput && locationInput.value.trim().length >= 2) scheduleGeographyOptions();
      });
    }
    if (region) {
      region.addEventListener("change", function () {
        clearGeographySelection(true);
        var selected = region.selectedOptions[0];
        if (selected && country && !country.value) {
          country.value = selected.getAttribute("data-country") || "";
          syncRegionOptions();
        }
        if (locationInput && locationInput.value.trim().length >= 2) scheduleGeographyOptions();
      });
    }
    form.addEventListener("reset", function () {
      window.setTimeout(function () {
        clearGeographySelection(false);
        results = [];
        syncRegionOptions();
        closeGeographyOptions();
      });
    });
    form.addEventListener("submit", function () {
      window.clearTimeout(searchTimer);
      if (searchController) searchController.abort();
    });
    syncRegionOptions();
    setFreeTextEnabled(!geographyId || !geographyId.value);
  }
  var NON_RESIDENTIAL_FAMILIES = ["plot", "agricultural_land", "commercial", "hotel"];
  // Empty filter controls stay out of the results URL: they are disabled for the
  // submission only, and a bfcache return re-enables them so the form is still
  // editable. Checked radios with an empty value ("All", "Any") carry no filter.
  function emptyFormControls(form) {
    var controls = form.querySelectorAll("input, select");
    var empty = [];
    for (var i = 0; i < controls.length; i += 1) {
      var control = controls[i];
      if (control.disabled || control.type === "checkbox" || control.type === "submit" || control.type === "button") continue;
      if (control.type === "radio") {
        if (control.checked && String(control.value || "") === "") empty.push(control);
        continue;
      }
      if (String(control.value || "").trim() === "") empty.push(control);
    }
    return empty;
  }
  function stripEmptyControlsOnSubmit(form) {
    var skipped = [];
    form.addEventListener("submit", function () {
      skipped = emptyFormControls(form);
      for (var i = 0; i < skipped.length; i += 1) skipped[i].disabled = true;
    });
    window.addEventListener("pageshow", function () {
      for (var i = 0; i < skipped.length; i += 1) skipped[i].disabled = false;
      skipped = [];
    });
  }
  function initSearchFilterForms() {
    var forms = document.querySelectorAll("[data-search-filter-form]");
    for (var i = 0; i < forms.length; i += 1) stripEmptyControlsOnSubmit(forms[i]);
  }
  function initHeroSearch() {
    var form = document.querySelector("[data-hero-search]");
    if (!form) return;
    var priceSelects = form.querySelectorAll("[data-price-presets]");
    var family = form.querySelector("[data-hero-family]");
    var bedrooms = form.querySelector("[data-hero-bedrooms]");
    var more = form.querySelector("[data-hero-more-filters]");
    function offerType() {
      var checked = form.querySelector('input[name="offer_type"]:checked');
      return checked && checked.value === "rent" ? "rent" : "sale";
    }
    // Rent budgets are monthly, so the preset list follows the Buy/Rent tab.
    function applyPricePresets() {
      var source = offerType() === "rent" ? "data-price-rent" : "data-price-sale";
      for (var i = 0; i < priceSelects.length; i += 1) {
        var select = priceSelects[i];
        var current = select.value;
        var entries = (select.getAttribute(source) || "").split(";");
        select.textContent = "";
        var any = document.createElement("option");
        any.value = "";
        any.textContent = select.getAttribute("data-price-any") || "";
        select.appendChild(any);
        for (var j = 0; j < entries.length; j += 1) {
          if (!entries[j]) continue;
          var parts = entries[j].split("|");
          var option = document.createElement("option");
          option.value = parts[0];
          option.textContent = parts[1] || parts[0];
          if (parts[0] === current) option.selected = true;
          select.appendChild(option);
        }
      }
    }
    // Plots, land, commercial space and hotels carry no bedroom count.
    function syncBedrooms() {
      if (!family || !bedrooms) return;
      var nonResidential = NON_RESIDENTIAL_FAMILIES.indexOf(family.value) >= 0;
      bedrooms.disabled = nonResidential;
      if (nonResidential) bedrooms.value = "";
    }
    form.addEventListener("change", function (event) {
      if (event.target && event.target.name === "offer_type") applyPricePresets();
      if (event.target === family) syncBedrooms();
    });
    form.addEventListener("reset", function () {
      window.setTimeout(function () {
        applyPricePresets();
        syncBedrooms();
      });
    });
    if (more) {
      var label = more.querySelector("[data-more-label]");
      more.addEventListener("toggle", function () {
        if (label) label.textContent = more.open ? label.getAttribute("data-fewer-label") : label.getAttribute("data-more-label");
      });
    }
    // Empty controls stay out of the results URL; pageshow restores them for bfcache returns.
    function emptyControls() {
      return emptyFormControls(form);
    }
    var skipped = [];
    form.addEventListener("submit", function () {
      skipped = emptyControls();
      for (var i = 0; i < skipped.length; i += 1) skipped[i].disabled = true;
    });
    window.addEventListener("pageshow", function () {
      for (var i = 0; i < skipped.length; i += 1) skipped[i].disabled = false;
      skipped = [];
      syncBedrooms();
    });
    applyPricePresets();
    syncBedrooms();
  }
  function initSearchToolbar() {
    var form = document.querySelector("[data-search-toolbar-form]");
    if (!form) return;
    var sort = form.querySelector('select[name="sort"]');
    if (!sort) return;
    sort.addEventListener("change", function () {
      var view = form.querySelector('[data-view-mode][aria-pressed="true"]');
      if (typeof form.requestSubmit === "function") form.requestSubmit(view && view.value === "map" ? view : undefined);
      else form.submit();
    });
  }
  function initHeroGallery() {
    var gallery = document.querySelector("[data-hero-gallery]");
    if (!gallery) return;
    var allSlides = gallery.querySelectorAll("[data-hero-gallery-slide]");
    var mobileViewport = window.matchMedia ? window.matchMedia("(max-width: 679px)") : null;
    function availableSlides() {
      return Array.prototype.filter.call(allSlides, function (slide) {
        return slide.getAttribute("data-hero-mobile-only") !== "true" || Boolean(mobileViewport && mobileViewport.matches);
      });
    }
    var slides = availableSlides();
    if (slides.length < 2) return;
    var status = gallery.querySelector("[data-hero-gallery-status]");
    var interval = Math.max(3000, Number(gallery.getAttribute("data-hero-gallery-interval")) || 7000);
    var label = gallery.getAttribute("data-hero-gallery-label") || "Gallery";
    var motion = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    var index = 0;
    var timer = 0;
    var pointerInside = false;
    var focusInside = false;
    function paused() {
      return pointerInside || focusInside || document.hidden || Boolean(motion && motion.matches);
    }
    function clearTimer() {
      if (!timer) return;
      window.clearTimeout(timer);
      timer = 0;
    }
    function apply(nextIndex, announce) {
      slides = availableSlides();
      if (!slides.length) return;
      index = (nextIndex + slides.length) % slides.length;
      var activeSlide = slides[index];
      for (var i = 0; i < allSlides.length; i += 1) {
        var active = allSlides[i] === activeSlide;
        allSlides[i].hidden = !active;
        allSlides[i].setAttribute("data-gallery-active", active ? "true" : "false");
        allSlides[i].setAttribute("aria-hidden", active ? "false" : "true");
      }
      if (status) {
        status.setAttribute("aria-live", announce ? "polite" : "off");
        status.textContent = label + " " + String(index + 1) + " / " + String(slides.length);
      }
    }
    function schedule() {
      clearTimer();
      if (paused()) return;
      timer = window.setTimeout(function () {
        apply(index + 1, false);
        schedule();
      }, interval);
    }
    gallery.addEventListener("pointerenter", function () { pointerInside = true; schedule(); });
    gallery.addEventListener("pointerleave", function () { pointerInside = false; schedule(); });
    gallery.addEventListener("focusin", function () { focusInside = true; schedule(); });
    gallery.addEventListener("focusout", function () {
      window.setTimeout(function () {
        focusInside = gallery.contains(document.activeElement);
        schedule();
      });
    });
    document.addEventListener("visibilitychange", schedule);
    function resetForViewport() {
      apply(0, false);
      schedule();
    }
    if (mobileViewport) {
      if (mobileViewport.addEventListener) mobileViewport.addEventListener("change", resetForViewport);
      else if (mobileViewport.addListener) mobileViewport.addListener(resetForViewport);
    }
    if (motion) {
      if (motion.addEventListener) motion.addEventListener("change", schedule);
      else if (motion.addListener) motion.addListener(schedule);
    }
    apply(0, false);
    schedule();
  }
  function initHorizontalFocusRails() {
    var rails = document.querySelectorAll(".hp-guides__rail, .hp-resorts");
    for (var i = 0; i < rails.length; i += 1) {
      rails[i].addEventListener("focusin", function (event) {
        var item = event.target.closest("a[href]");
        if (item && this.contains(item)) item.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
      });
    }
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
  function initListingGalleryLinks() {
    // "All N photos" is a plain anchor to the photo grid; once the viewer
    // dialog can open, it takes over instead of jumping down the page.
    var dialog = document.querySelector("[data-listing-gallery-dialog]");
    if (!dialog || typeof dialog.showModal !== "function") return;
    var links = document.querySelectorAll("a[data-listing-gallery-open]");
    for (var i = 0; i < links.length; i += 1) {
      links[i].addEventListener("click", function (event) { event.preventDefault(); });
    }
  }
  function initListingGalleryImageState() {
    // The viewer swaps one <img> between photos, so the figure carries the
    // loading and failed states: a spinner while the next photo arrives, a
    // notice when it never does.
    var figure = document.querySelector("[data-listing-gallery-figure]");
    var image = figure ? figure.querySelector("[data-listing-gallery-image]") : null;
    if (!figure || !image) return;
    function loaded() { figure.removeAttribute("data-image-state"); }
    function failed() { figure.setAttribute("data-image-state", "unavailable"); }
    image.addEventListener("load", loaded);
    image.addEventListener("error", failed);
    if (typeof MutationObserver === "function") {
      new MutationObserver(function () {
        if (image.complete && image.naturalWidth > 0) return;
        figure.setAttribute("data-image-state", "loading");
      }).observe(image, { attributes: true, attributeFilter: ["src"] });
    }
    if (image.complete && image.naturalWidth === 0) failed();
  }
  function initListingGallery() {
    var dialog = document.querySelector("[data-listing-gallery-dialog]");
    var sourceButtons = document.querySelectorAll("[data-listing-gallery-source]");
    var openers = document.querySelectorAll("[data-listing-gallery-open]");
    if (!dialog || typeof dialog.showModal !== "function" || !sourceButtons.length || !openers.length) return;
    var image = dialog.querySelector("[data-listing-gallery-image]");
    var caption = dialog.querySelector("[data-listing-gallery-caption]");
    var current = dialog.querySelector("[data-listing-gallery-current]");
    var previous = dialog.querySelector("[data-listing-gallery-prev]");
    var next = dialog.querySelector("[data-listing-gallery-next]");
    var close = dialog.querySelector("[data-listing-gallery-close]");
    if (!image || !caption || !current) return;
    var sources = [];
    var activeIndex = 0;
    var returnTarget = null;
    for (var i = 0; i < sourceButtons.length; i += 1) {
      var sourceImage = sourceButtons[i].querySelector("img");
      if (!sourceImage) continue;
      sources.push({
        src: sourceImage.getAttribute("src") || "",
        alt: sourceImage.getAttribute("alt") || "",
        fallback: sourceImage.getAttribute("data-fallback-src") || "",
      });
    }
    if (!sources.length) return;
    function show(index) {
      activeIndex = Math.max(0, Math.min(sources.length - 1, index));
      var source = sources[activeIndex];
      image.hidden = false;
      image.removeAttribute("data-image-state");
      image.setAttribute("src", source.src);
      image.setAttribute("alt", source.alt);
      if (source.fallback) image.setAttribute("data-fallback-src", source.fallback);
      else image.removeAttribute("data-fallback-src");
      caption.textContent = source.alt;
      current.textContent = String(activeIndex + 1);
      if (previous) previous.disabled = activeIndex === 0;
      if (next) next.disabled = activeIndex === sources.length - 1;
    }
    function openAt(trigger) {
      var index = Number(trigger.getAttribute("data-listing-gallery-open"));
      returnTarget = trigger;
      show(Number.isFinite(index) ? index : 0);
      dialog.showModal();
      syncPublicDialogState();
      if (close) window.requestAnimationFrame(function () { close.focus(); });
    }
    for (var j = 0; j < openers.length; j += 1) {
      openers[j].addEventListener("click", function (event) { openAt(event.currentTarget); });
    }
    if (previous) previous.addEventListener("click", function () { show(activeIndex - 1); });
    if (next) next.addEventListener("click", function () { show(activeIndex + 1); });
    if (close) close.addEventListener("click", function () { dialog.close(); });
    dialog.addEventListener("click", function (event) {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        event.preventDefault();
        dialog.close();
        return;
      }
      var rtl = document.documentElement.dir === "rtl";
      var nextIndex = null;
      if (event.key === "ArrowLeft") nextIndex = activeIndex + (rtl ? 1 : -1);
      if (event.key === "ArrowRight") nextIndex = activeIndex + (rtl ? -1 : 1);
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = sources.length - 1;
      if (nextIndex === null) return;
      event.preventDefault();
      show(nextIndex);
    });
    dialog.addEventListener("close", function () {
      syncPublicDialogState();
      var target = returnTarget;
      returnTarget = null;
      if (target && target.isConnected) window.requestAnimationFrame(function () { target.focus(); });
    });
    show(0);
  }
  function initMobileListingGallery() {
    var gallery = document.querySelector("[data-mobile-gallery]");
    var shell = gallery ? gallery.closest(".ld-gallery-shell") : null;
    var current = shell ? shell.querySelector("[data-mobile-gallery-current]") : null;
    var progress = shell ? shell.querySelector("[data-mobile-gallery-progress]") : null;
    var previous = shell ? shell.querySelector("[data-mobile-gallery-prev]") : null;
    var next = shell ? shell.querySelector("[data-mobile-gallery-next]") : null;
    var slides = gallery ? gallery.querySelectorAll("[data-mobile-gallery-slide]") : [];
    if (!gallery || !current || slides.length < 2) return;
    var frame = 0;
    var activeIndex = 0;
    function scrollToGalleryIndex(index) {
      var nextIndex = Math.max(0, Math.min(slides.length - 1, index));
      var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      slides[nextIndex].scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest", inline: "start" });
    }
    function updateGalleryPosition() {
      frame = 0;
      var galleryBox = gallery.getBoundingClientRect();
      var galleryCenter = galleryBox.left + galleryBox.width / 2;
      activeIndex = 0;
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
      gallery.setAttribute("aria-label", gallery.getAttribute("data-mobile-gallery-label") + ", " + String(activeIndex + 1) + " / " + String(slides.length));
      current.textContent = String(activeIndex + 1);
      if (progress) progress.setAttribute("aria-label", String(activeIndex + 1) + " / " + String(slides.length));
      if (previous) previous.disabled = activeIndex === 0;
      if (next) next.disabled = activeIndex === slides.length - 1;
    }
    function scheduleGalleryPosition() {
      if (frame) return;
      frame = window.requestAnimationFrame(updateGalleryPosition);
    }
    gallery.addEventListener("scroll", scheduleGalleryPosition, { passive: true });
    gallery.addEventListener("keydown", function (event) {
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        scrollToGalleryIndex(activeIndex - 1);
      }
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        scrollToGalleryIndex(activeIndex + 1);
      }
      if (event.key === "Home") {
        event.preventDefault();
        scrollToGalleryIndex(0);
      }
      if (event.key === "End") {
        event.preventDefault();
        scrollToGalleryIndex(slides.length - 1);
      }
    });
    if (previous) previous.addEventListener("click", function () { scrollToGalleryIndex(activeIndex - 1); });
    if (next) next.addEventListener("click", function () { scrollToGalleryIndex(activeIndex + 1); });
    window.addEventListener("resize", scheduleGalleryPosition);
    updateGalleryPosition();
  }
  function initGuideToc() {
    var toc = document.querySelector("[data-guide-toc]");
    if (!toc || !("IntersectionObserver" in window)) return;
    var links = toc.querySelectorAll('a[href^="#"]');
    var targets = [];
    for (var i = 0; i < links.length; i += 1) {
      var target = document.getElementById(links[i].getAttribute("href").slice(1));
      if (target) targets.push({ link: links[i], target: target });
    }
    if (!targets.length) return;
    function setCurrent(id) {
      for (var j = 0; j < targets.length; j += 1) {
        if (targets[j].target.id === id) targets[j].link.setAttribute("aria-current", "location");
        else targets[j].link.removeAttribute("aria-current");
      }
    }
    var visible = {};
    var observer = new IntersectionObserver(function (entries) {
      for (var k = 0; k < entries.length; k += 1) visible[entries[k].target.id] = entries[k].isIntersecting;
      for (var m = 0; m < targets.length; m += 1) {
        if (visible[targets[m].target.id]) {
          setCurrent(targets[m].target.id);
          return;
        }
      }
    }, { rootMargin: "-96px 0px -55% 0px", threshold: 0 });
    for (var n = 0; n < targets.length; n += 1) observer.observe(targets[n].target);
    setCurrent(targets[0].target.id);
  }
  function initSellerStepper() {
    var form = document.querySelector("form[data-seller-intake]");
    if (!form) return;
    // Next and Back only make sense once the intake is a stepper. Without JS
    // every step stays visible and the form submits natively, so the
    // controls ship hidden and are revealed here.
    var controls = form.querySelectorAll("[data-seller-next], [data-seller-back]");
    for (var i = 0; i < controls.length; i += 1) controls[i].hidden = false;
    form.setAttribute("data-seller-stepper", "true");
  }
  // Seller photo upload. The form is a real multipart post that works with
  // JavaScript switched off (the server redirects back with ?photos=), and this
  // upgrades it to inline progress, per-file errors, and a disabled button
  // while bytes are in flight.
  function initSellerPhotoUpload() {
    var form = document.querySelector("[data-seller-photo-form]");
    if (!form) return;
    var input = form.querySelector("[data-seller-photo-input]");
    var reference = form.querySelector("[data-seller-photo-reference]");
    var referenceField = form.querySelector("[data-seller-photo-reference-field]");
    var status = form.querySelector("[data-seller-photo-status]");
    var results = form.querySelector("[data-seller-photo-results]");
    var progress = form.querySelector("[data-seller-photo-progress]");
    var submit = form.querySelector("[data-seller-photo-submit]");
    var limitsHint = form.getAttribute("data-seller-photo-limits") || "";
    var maxFiles = Number(form.getAttribute("data-seller-photo-max-files")) || 8;
    var maxBytes = Number(form.getAttribute("data-seller-photo-max-bytes")) || 8 * 1024 * 1024;
    var pendingText = form.getAttribute("data-seller-photo-pending") || "";
    var successText = form.getAttribute("data-seller-photo-success") || "";
    var failureText = form.getAttribute("data-seller-photo-failure") || "";
    var STORE_KEY = "ms-realty:seller-enquiry";

    function readStoredReference() {
      try {
        return window.sessionStorage.getItem(STORE_KEY) || "";
      } catch (error) {
        return "";
      }
    }
    function rememberReference(value) {
      try {
        window.sessionStorage.setItem(STORE_KEY, value);
      } catch (error) {
        // Private browsing: the visible field still carries the reference.
      }
    }
    function setStatus(text, state) {
      if (!status) return;
      status.textContent = text || "";
      if (state) status.setAttribute("data-state", state);
      else status.removeAttribute("data-state");
    }
    function clearResults() {
      if (results) results.textContent = "";
    }
    function addResult(text, state) {
      if (!results) return;
      var item = document.createElement("li");
      item.textContent = text;
      item.setAttribute("data-state", state);
      results.appendChild(item);
    }

    var params = new URLSearchParams(window.location.search);
    var prefill = (params.get("enquiry") || readStoredReference()).trim();
    if (prefill && reference) {
      reference.value = prefill;
      if (referenceField) referenceField.hidden = true;
    }
    var outcome = params.get("photos");
    if (outcome === "ok") setStatus(successText, "success");
    else if (outcome === "partial") setStatus(successText, "warning");
    else if (outcome === "error") setStatus(failureText, "error");

    if (!window.FormData || !window.XMLHttpRequest) return;

    form.addEventListener("submit", function (event) {
      var files = input && input.files ? Array.prototype.slice.call(input.files) : [];
      if (!files.length || !reference || !reference.value.trim()) return;
      event.preventDefault();
      clearResults();

      var payload = new FormData();
      payload.append(reference.getAttribute("name") || "enquiryId", reference.value.trim());
      var queued = [];
      for (var i = 0; i < files.length; i += 1) {
        if (queued.length >= maxFiles || files[i].size > maxBytes) {
          addResult(files[i].name + " \u2014 " + limitsHint, "error");
          continue;
        }
        queued.push(files[i]);
        payload.append(input.getAttribute("name") || "photo", files[i], files[i].name);
      }
      if (!queued.length) {
        setStatus(failureText, "error");
        return;
      }

      if (submit) submit.disabled = true;
      form.setAttribute("aria-busy", "true");
      setStatus(pendingText, "pending");
      if (progress) {
        progress.hidden = false;
        progress.value = 0;
      }

      var request = new XMLHttpRequest();
      request.open("POST", form.getAttribute("action"), true);
      request.setRequestHeader("accept", "application/json");
      request.withCredentials = true;
      if (request.upload) {
        request.upload.onprogress = function (progressEvent) {
          if (!progress || !progressEvent.lengthComputable) return;
          progress.value = Math.round((progressEvent.loaded / progressEvent.total) * 100);
        };
      }
      request.onload = function () {
        var body = {};
        try {
          body = JSON.parse(request.responseText || "{}");
        } catch (error) {
          body = {};
        }
        var received = body.received || [];
        var refused = body.rejected || [];
        for (var a = 0; a < received.length; a += 1) {
          var acceptedFile = queued[received[a].index];
          addResult((acceptedFile ? acceptedFile.name : "") + " \u2014 " + successText, "success");
        }
        for (var r = 0; r < refused.length; r += 1) {
          var refusedFile = queued[refused[r].index];
          addResult((refusedFile ? refusedFile.name + " \u2014 " : "") + (refused[r].message || failureText), "error");
        }
        if (request.status >= 200 && request.status < 300) {
          rememberReference(reference.value.trim());
          setStatus(refused.length ? successText : successText, refused.length ? "warning" : "success");
          if (input) input.value = "";
        } else {
          setStatus(body.message || failureText, "error");
        }
        if (progress) progress.hidden = true;
        if (submit) submit.disabled = false;
        form.removeAttribute("aria-busy");
      };
      request.onerror = function () {
        setStatus(failureText, "error");
        if (progress) progress.hidden = true;
        if (submit) submit.disabled = false;
        form.removeAttribute("aria-busy");
      };
      request.send(payload);
    });
  }
  function initSellerIntake() {
    var form = document.querySelector("form[data-seller-intake]");
    if (!form) return;
    var panels = form.querySelectorAll("[data-seller-step]");
    var indicators = document.querySelectorAll("[data-seller-step-indicator]");
    if (!panels.length) return;
    var currentIndex = 0;
    function fieldValue(control) {
      if (!control) return "";
      if (control.tagName === "SELECT" && control.options && control.selectedIndex >= 0) return control.options[control.selectedIndex].textContent || "";
      return typeof control.value === "string" ? control.value.trim() : "";
    }
    function updateReview() {
      var rows = form.querySelectorAll("[data-seller-summary-row]");
      for (var i = 0; i < rows.length; i += 1) {
        var valueNode = rows[i].querySelector("[data-seller-summary]");
        var name = valueNode ? valueNode.getAttribute("data-seller-summary") : "";
        var control = name ? form.elements.namedItem(name) : null;
        var value = fieldValue(control);
        rows[i].hidden = !value;
        if (valueNode) valueNode.textContent = value;
      }
    }
    function showStep(index, moveFocus) {
      currentIndex = Math.max(0, Math.min(index, panels.length - 1));
      form.setAttribute("data-seller-step", String(currentIndex + 1));
      for (var i = 0; i < panels.length; i += 1) panels[i].hidden = i !== currentIndex;
      for (var j = 0; j < indicators.length; j += 1) {
        var active = j === currentIndex;
        if (active) indicators[j].setAttribute("aria-current", "step");
        else indicators[j].removeAttribute("aria-current");
        if (j < currentIndex) indicators[j].setAttribute("data-complete", "true");
        else indicators[j].removeAttribute("data-complete");
        if (active) indicators[j].setAttribute("data-active", "true");
        else indicators[j].removeAttribute("data-active");
      }
      if (currentIndex === panels.length - 1) updateReview();
      if (moveFocus) {
        var title = panels[currentIndex].querySelector("[data-seller-step-title]");
        if (title) window.requestAnimationFrame(function () { title.focus(); });
      }
    }
    function currentStepIsValid() {
      var fields = panels[currentIndex].querySelectorAll("input[required], select[required], textarea[required]");
      for (var i = 0; i < fields.length; i += 1) {
        if (fields[i].checkValidity()) continue;
        // Mark the field so it also reads as an error visually, not only in
        // the native bubble; the mark clears as soon as the visitor edits it.
        fields[i].setAttribute("aria-invalid", "true");
        fields[i].reportValidity();
        return false;
      }
      return true;
    }
    form.addEventListener("input", function (event) {
      var field = event.target;
      if (field && field.getAttribute && field.getAttribute("aria-invalid") === "true" && field.checkValidity && field.checkValidity()) {
        field.removeAttribute("aria-invalid");
      }
    });
    form.addEventListener("change", function (event) {
      var field = event.target;
      if (field && field.getAttribute && field.getAttribute("aria-invalid") === "true" && field.checkValidity && field.checkValidity()) {
        field.removeAttribute("aria-invalid");
      }
    });
    form.addEventListener("click", function (event) {
      var next = event.target.closest("[data-seller-next]");
      if (next && form.contains(next)) {
        event.preventDefault();
        if (currentStepIsValid()) showStep(currentIndex + 1, true);
        return;
      }
      var back = event.target.closest("[data-seller-back]");
      if (back && form.contains(back)) {
        event.preventDefault();
        showStep(currentIndex - 1, true);
      }
    });
    form.addEventListener("submit", function (event) {
      if (currentIndex === panels.length - 1) return;
      event.preventDefault();
      event.stopPropagation();
      if (currentStepIsValid()) showStep(currentIndex + 1, true);
    });
    showStep(0, false);
  }
  // Buyer onboarding (/{locale}/start): the server renders one GET form with
  // four sections; this turns it into a stepper, keeps the "See matching
  // properties" link and the shortlist lead in sync with the answers, and
  // navigates straight to the results instead of the no-JavaScript review page.
  function initStartFlow() {
    var root = document.querySelector("main[data-start-flow]");
    if (!root) return;
    var form = root.querySelector("form[data-start-form]");
    var lead = root.querySelector("form[data-start-lead]");
    var finish = root.querySelector("[data-start-finish]");
    var seeMatches = root.querySelector("[data-start-see-matches]");
    var matchCount = root.querySelector("[data-start-match-count]");
    var searchPath = root.getAttribute("data-start-search-path") || "";
    if (!form || !searchPath) return;
    function value(name) {
      var control = form.elements.namedItem(name);
      return control && typeof control.value === "string" ? control.value : "";
    }
    function checkedControl(name) {
      return form.querySelector('input[name="' + name + '"]:checked');
    }
    function residential() {
      return NON_RESIDENTIAL_FAMILIES.indexOf(value("property_family")) < 0;
    }
    function searchParams() {
      var params = new URLSearchParams();
      if (value("offer_type")) params.set("offer_type", value("offer_type"));
      if (value("property_family")) params.set("property_family", value("property_family"));
      var area = checkedControl("area");
      if (area) {
        try {
          var extra = JSON.parse(area.getAttribute("data-search-params") || "{}");
          Object.keys(extra).forEach(function (key) { params.set(key, extra[key]); });
        } catch (error) {}
      }
      if (value("price_max")) params.set("price_max", value("price_max"));
      if (value("bedrooms_min") && residential()) params.set("bedrooms_min", value("bedrooms_min"));
      return params;
    }
    function searchUrl() {
      var query = searchParams().toString();
      return query ? searchPath + "?" + query : searchPath;
    }
    function leadLabel(name) {
      var control = checkedControl(name);
      return control ? control.getAttribute("data-lead-label") || "" : "";
    }
    function syncLead() {
      if (!lead) return;
      function set(field, next) {
        var input = lead.querySelector('[data-start-lead-field="' + field + '"]');
        if (input) input.value = next || "";
      }
      var area = checkedControl("area");
      var financing = value("financing");
      set("leadType", value("offer_type") === "rent" ? "renter" : value("citizenship") === "non_eu" ? "foreign_buyer" : "buyer");
      set("requirements.locations", area ? area.getAttribute("data-lead-location") || "" : "");
      set("requirements.property_types", value("property_family"));
      set("requirements.budget_max_eur", value("price_max"));
      set("requirements.bedrooms_min", residential() ? value("bedrooms_min") : "");
      set("requirements.timeline", leadLabel("timeline"));
      set("requirements.finance_status", financing === "mortgage" || financing === "cash" ? financing : "");
      var parts = [
        leadLabel("offer_type"),
        value("property_family"),
        area ? area.getAttribute("data-lead-location") || "" : "",
        value("price_max") ? "max EUR " + value("price_max") : "",
        residential() && value("bedrooms_min") ? value("bedrooms_min") + "+ bedrooms" : "",
        leadLabel("citizenship"),
        leadLabel("financing"),
        leadLabel("timeline"),
      ].filter(Boolean);
      set("message", (lead.getAttribute("data-start-message-prefix") || "Buyer onboarding") + (parts.length ? ": " + parts.join("; ") : ""));
      lead.setAttribute("data-lead-type", lead.querySelector('[data-start-lead-field="leadType"]').value);
    }
    var countRequest = 0;
    // Live match count from the search API (same filters as the link); the
    // generic title stays when the API is unavailable.
    function syncMatchCount() {
      if (!matchCount || typeof fetch !== "function") return;
      var params = searchParams();
      params.set("locale", root.getAttribute("data-start-locale") || "bg");
      var request = (countRequest += 1);
      fetch("/api/search?" + params.toString(), { headers: { accept: "application/json", "x-ms-realty-preview": "search-count" } })
        .then(function (response) { return response.ok ? response.json() : null; })
        .then(function (result) {
          if (request !== countRequest || !result || !result.search) return;
          var total = Number(result.search.total_matches);
          if (!isFinite(total)) return;
          matchCount.textContent = total > 0
            ? (matchCount.getAttribute("data-start-match-template") || "{count}").replace("{count}", String(total))
            : matchCount.getAttribute("data-start-no-matches") || matchCount.textContent;
          root.setAttribute("data-start-matches", String(total));
          if (seeMatches) {
            seeMatches.classList.toggle("mk-btn--accent", total > 0);
            seeMatches.classList.toggle("mk-btn--secondary", total === 0);
          }
          var alertPanel = root.querySelector("[data-start-alert]");
          if (alertPanel && total === 0) alertPanel.open = true;
          syncWiden(total === 0);
        })
        .catch(function () {});
    }
    function syncAlert() {
      var filters = root.querySelector("[data-start-alert-filters]");
      if (!filters) return;
      var payload = {};
      searchParams().forEach(function (value, key) { payload[key] = value; });
      filters.value = JSON.stringify(payload);
    }
    // The "coming soon" financing panel only makes sense to someone who said
    // they need financing.
    function syncUpcoming() {
      var items = root.querySelectorAll('[data-start-upcoming-when="mortgage"]');
      for (var i = 0; i < items.length; i += 1) items[i].hidden = value("financing") !== "mortgage";
    }
    function syncFinish() {
      if (seeMatches) seeMatches.setAttribute("href", searchUrl());
      syncLead();
      syncAlert();
      syncUpcoming();
    }
    // Zero matches: rebuild the "try a wider search" links by relaxing one
    // answer at a time and keeping only the variants that do have listings,
    // so the visitor is never sent to an empty results page.
    var widen = root.querySelector("[data-start-widen]");
    var widenList = root.querySelector("[data-start-widen-list]");
    function widenCandidates() {
      var area = checkedControl("area");
      var areaId = area ? area.value : "";
      var district = areaId === "sandanski" || areaId === "bansko";
      var out = [];
      if (value("price_max")) out.push({ id: "price", drop: ["price_max"] });
      if (value("bedrooms_min") && residential()) out.push({ id: "bedrooms", drop: ["bedrooms_min"] });
      if (value("property_family")) out.push({ id: "type", drop: ["property_family"] });
      if (areaId) out.push({ id: "area", district: district, drop: ["geography_id", "region_id", "country_code"] });
      return out;
    }
    function candidateParams(candidate) {
      var params = searchParams();
      for (var i = 0; i < candidate.drop.length; i += 1) params.delete(candidate.drop[i]);
      if (candidate.id === "area" && candidate.district) params.set("region_id", "BG:district:BLG");
      return params;
    }
    function candidateLabel(candidate) {
      if (candidate.id === "area") {
        return widen.getAttribute(candidate.district ? "data-widen-district" : "data-widen-area") || "";
      }
      return widen.getAttribute("data-widen-" + candidate.id) || "";
    }
    var widenRequest = 0;
    function syncWiden(zero) {
      if (!widen || !widenList) return;
      if (!zero) {
        widen.hidden = true;
        return;
      }
      var request = (widenRequest += 1);
      var candidates = widenCandidates();
      var template = matchCount ? matchCount.getAttribute("data-start-match-template") || "{count}" : "{count}";
      var locale = root.getAttribute("data-start-locale") || "bg";
      var results = [];
      var pending = candidates.length;
      if (!pending) {
        widen.hidden = true;
        return;
      }
      candidates.forEach(function (candidate, index) {
        var params = candidateParams(candidate);
        var query = params.toString();
        params.set("locale", locale);
        fetch("/api/search?" + params.toString(), { headers: { accept: "application/json", "x-ms-realty-preview": "search-count" } })
          .then(function (response) { return response.ok ? response.json() : null; })
          .then(function (result) {
            var total = result && result.search ? Number(result.search.total_matches) : 0;
            if (total > 0) results[index] = { id: candidate.id, label: candidateLabel(candidate), count: total, query: query };
          })
          .catch(function () {})
          .then(function () {
            pending -= 1;
            if (pending > 0 || request !== widenRequest) return;
            var kept = results.filter(Boolean).slice(0, 3);
            widenList.textContent = "";
            for (var i = 0; i < kept.length; i += 1) {
              var item = document.createElement("li");
              var link = document.createElement("a");
              link.className = "st-widen__link";
              link.setAttribute("data-start-widen-option", kept[i].id);
              link.href = kept[i].query ? searchPath + "?" + kept[i].query : searchPath;
              var label = document.createElement("span");
              label.className = "st-widen__label";
              label.textContent = kept[i].label;
              var count = document.createElement("span");
              count.className = "st-widen__count";
              count.textContent = template.replace("{count}", String(kept[i].count));
              link.appendChild(label);
              link.appendChild(count);
              item.appendChild(link);
              widenList.appendChild(item);
            }
            widen.hidden = kept.length === 0;
          });
      });
    }
    // Rent budgets are monthly, so the preset list follows the Buy/Rent choice.
    function applyPricePresets() {
      var source = value("offer_type") === "rent" ? "data-price-rent" : "data-price-sale";
      var selects = form.querySelectorAll("[data-price-presets]");
      for (var i = 0; i < selects.length; i += 1) {
        var select = selects[i];
        var current = select.value;
        var entries = (select.getAttribute(source) || "").split(";");
        select.textContent = "";
        var any = document.createElement("option");
        any.value = "";
        any.textContent = select.getAttribute("data-price-any") || "";
        select.appendChild(any);
        for (var j = 0; j < entries.length; j += 1) {
          if (!entries[j]) continue;
          var parts = entries[j].split("|");
          var option = document.createElement("option");
          option.value = parts[0];
          option.textContent = parts[1] || parts[0];
          if (parts[0] === current) option.selected = true;
          select.appendChild(option);
        }
      }
    }
    // Plots, land, commercial space and hotels carry no bedroom count.
    function syncBedrooms() {
      var group = root.querySelector("[data-start-bedrooms]");
      if (!group) return;
      var hide = !residential();
      group.hidden = hide;
      if (hide) {
        var any = form.querySelector('input[name="bedrooms_min"][value=""]');
        if (any) any.checked = true;
      }
    }
    form.addEventListener("change", function (event) {
      if (event.target.name === "offer_type") applyPricePresets();
      if (event.target.name === "property_family") syncBedrooms();
      if (root.getAttribute("data-start-state") === "answer") syncFinish();
    });
    if (lead) lead.addEventListener("submit", syncLead);
    // Submitting state: the shared JSON submit already marks the button busy;
    // this adds the localized status line and clears it if the post failed
    // (a success replaces the whole form with the success card).
    function wireSubmitStatus(target) {
      if (!target) return;
      target.addEventListener("submit", function () {
        var status = target.querySelector("[data-start-status]");
        var button = target.querySelector('[type="submit"]');
        if (!status || !button) return;
        status.textContent = target.getAttribute("data-sending-message") || "";
        if (typeof MutationObserver !== "function") return;
        var observer = new MutationObserver(function () {
          if (button.hasAttribute("aria-busy")) return;
          status.textContent = "";
          observer.disconnect();
        });
        observer.observe(button, { attributes: true, attributeFilter: ["aria-busy"] });
      });
    }
    wireSubmitStatus(lead);
    wireSubmitStatus(root.querySelector("[data-start-alert-form]"));
    if (seeMatches) seeMatches.addEventListener("click", function () { seeMatches.setAttribute("href", searchUrl()); });
    applyPricePresets();
    syncBedrooms();
    // The finish state (answers in the URL) is already complete server-side.
    if (root.getAttribute("data-start-state") !== "answer") return;
    // Reveals the step buttons, which are inert without this script.
    root.setAttribute("data-start-enhanced", "true");
    var panels = form.querySelectorAll("[data-start-step]");
    var indicators = root.querySelectorAll("[data-start-step-indicator]");
    var progress = root.querySelector("[data-start-progress]");
    var continueButton = form.querySelector("[data-start-continue]");
    if (!panels.length) return;
    var current = 0;
    function stepError(show) {
      var error = panels[current].querySelector("[data-start-error]");
      if (error) error.hidden = !show;
    }
    function showStep(index, moveFocus) {
      current = Math.max(0, Math.min(index, panels.length - 1));
      var last = current === panels.length - 1;
      root.setAttribute("data-start-current-step", String(current + 1));
      for (var i = 0; i < panels.length; i += 1) panels[i].hidden = i !== current;
      for (var j = 0; j < indicators.length; j += 1) {
        if (j === current) indicators[j].setAttribute("aria-current", "step");
        else indicators[j].removeAttribute("aria-current");
        if (j === current) indicators[j].setAttribute("data-active", "true");
        else indicators[j].removeAttribute("data-active");
        if (j < current) indicators[j].setAttribute("data-complete", "true");
        else indicators[j].removeAttribute("data-complete");
      }
      if (continueButton) continueButton.hidden = true;
      if (finish) finish.hidden = !last;
      if (progress) {
        progress.hidden = false;
        progress.textContent = (progress.getAttribute("data-start-progress-template") || "{current} / {total}")
          .replace("{current}", String(current + 1))
          .replace("{total}", String(panels.length));
      }
      if (last) {
        syncFinish();
        syncMatchCount();
      }
      if (moveFocus) {
        var title = panels[current].querySelector("[data-start-step-title]");
        if (title) window.requestAnimationFrame(function () { title.focus(); });
      }
    }
    function currentStepIsValid() {
      var fields = panels[current].querySelectorAll("input[required], select[required]");
      for (var i = 0; i < fields.length; i += 1) {
        if (fields[i].checkValidity()) continue;
        stepError(true);
        fields[i].focus();
        return false;
      }
      stepError(false);
      return true;
    }
    form.addEventListener("click", function (event) {
      var next = event.target.closest("[data-start-next]");
      if (next && form.contains(next)) {
        event.preventDefault();
        if (currentStepIsValid()) showStep(current + 1, true);
        return;
      }
      var back = event.target.closest("[data-start-back]");
      if (back && form.contains(back)) {
        event.preventDefault();
        showStep(current - 1, true);
      }
    });
    form.addEventListener("change", function () {
      if (root.getAttribute("data-start-current-step") === String(panels.length)) syncMatchCount();
    });
    // Enter or the last step's submit goes straight to the matching results.
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!currentStepIsValid()) return;
      if (current < panels.length - 1) {
        showStep(current + 1, true);
        return;
      }
      window.location.href = searchUrl();
    });
    showStep(0, false);
  }
  function initGuidedSearch() {
    var root = document.querySelector("main[data-guided-search-path]");
    if (!root) return;
    var path = root.getAttribute("data-guided-search-path") || "";
    if (!path || path.charAt(0) !== "/") return;
    var storageKey = RECENT_SEARCH_KEY + ":" + path;
    function normalizeSuggestionValue(value) {
      var normalized = String(value || "");
      if (typeof normalized.normalize === "function") normalized = normalized.normalize("NFKD");
      return normalized.replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
    }
    function suggestionOptions(kind) {
      var nodes = root.querySelectorAll('[data-guided-search-suggestion="' + kind + '"]');
      var options = [];
      for (var i = 0; i < nodes.length; i += 1) {
        var value = nodes[i].getAttribute("data-guided-search-value") || "";
        var label = (nodes[i].textContent || "").trim();
        if (!value || !label || optionFor(options, value)) continue;
        options.push({ value: value, label: label });
      }
      return options;
    }
    function optionFor(options, value) {
      var normalized = normalizeSuggestionValue(value);
      if (!normalized) return null;
      for (var i = 0; i < options.length; i += 1) {
        if (normalizeSuggestionValue(options[i].value) === normalized) return options[i];
      }
      return null;
    }
    var locations = suggestionOptions("location");
    var propertyFamilies = suggestionOptions("property_family");
    function keyFor(record) {
      return (record.location || "") + "\u0000" + (record.propertyFamily || "");
    }
    function readRecentSearches() {
      try {
        var stored = JSON.parse(sessionStorage.getItem(storageKey));
        if (!Array.isArray(stored)) return [];
        var records = [];
        for (var i = 0; i < stored.length; i += 1) {
          var candidate = stored[i];
          if (!candidate || typeof candidate !== "object") continue;
          var location = optionFor(locations, candidate.location);
          var propertyFamily = optionFor(propertyFamilies, candidate.propertyFamily);
          if (!location && !propertyFamily) continue;
          var record = {
            location: location ? location.value : "",
            propertyFamily: propertyFamily ? propertyFamily.value : "",
          };
          var duplicate = false;
          for (var j = 0; j < records.length; j += 1) {
            if (keyFor(records[j]) === keyFor(record)) {
              duplicate = true;
              break;
            }
          }
          if (!duplicate) records.push(record);
          if (records.length === 5) break;
        }
        return records;
      } catch (error) { return []; }
    }
    function writeRecentSearches(records) {
      try { sessionStorage.setItem(storageKey, JSON.stringify(records.slice(0, 5))); } catch (error) {}
    }
    function currentSuccessfulSearch() {
      if (root.getAttribute("data-guided-search-success") !== "true") return null;
      var params = new URLSearchParams(window.location.search || "");
      // Session-only records are made exclusively from reviewed suggestion
      // values. Free-text queries are never persisted.
      var location = optionFor(locations, params.get("location")) || optionFor(locations, params.get("q"));
      var propertyFamily = optionFor(propertyFamilies, params.get("property_family")) || optionFor(propertyFamilies, params.get("q"));
      if (!location && !propertyFamily) return null;
      return {
        location: location ? location.value : "",
        propertyFamily: propertyFamily ? propertyFamily.value : "",
      };
    }
    function recentSearchHref(record) {
      var params = new URLSearchParams();
      if (record.location) params.set("location", record.location);
      if (record.propertyFamily) params.set("property_family", record.propertyFamily);
      var query = params.toString();
      return query ? path + "?" + query : path;
    }
    function recentSearchLabel(record) {
      var parts = [];
      var location = optionFor(locations, record.location);
      var propertyFamily = optionFor(propertyFamilies, record.propertyFamily);
      if (location) parts.push(location.label);
      if (propertyFamily) parts.push(propertyFamily.label);
      return parts.join(" · ");
    }
    function renderRecentSearches(records) {
      var visible = [];
      for (var i = 0; i < records.length; i += 1) {
        if (recentSearchLabel(records[i])) visible.push(records[i]);
      }
      var sections = root.querySelectorAll("[data-recent-searches]");
      for (var j = 0; j < sections.length; j += 1) {
        var section = sections[j];
        var list = section.querySelector("[data-recent-search-list]");
        if (!list) continue;
        while (list.firstChild) list.removeChild(list.firstChild);
        for (var k = 0; k < visible.length; k += 1) {
          var item = document.createElement("li");
          var link = document.createElement("a");
          link.className = "sr-guided__link";
          link.href = recentSearchHref(visible[k]);
          link.setAttribute("data-recent-search", "true");
          link.textContent = recentSearchLabel(visible[k]);
          item.appendChild(link);
          list.appendChild(item);
        }
        section.hidden = visible.length === 0;
      }
    }
    var records = readRecentSearches();
    var current = currentSuccessfulSearch();
    if (current) {
      var currentKey = keyFor(current);
      var next = [current];
      for (var i = 0; i < records.length; i += 1) {
        if (keyFor(records[i]) !== currentKey) next.push(records[i]);
      }
      records = next.slice(0, 5);
      writeRecentSearches(records);
    }
    renderRecentSearches(records);
    document.addEventListener("click", function (event) {
      var clear = event.target.closest("[data-clear-recent-searches]");
      if (!clear || !root.contains(clear)) return;
      event.preventDefault();
      records = [];
      writeRecentSearches(records);
      renderRecentSearches(records);
    });
  }
  function initSearchScrollRestoration() {
    var searchRoot = document.querySelector("[data-search-results], [data-saved-listings-view='true']");
    if (!searchRoot) return;
    var lastListingId = null;
    var restored = false;
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
    function pendingReturnPath() {
      try { return sessionStorage.getItem(SEARCH_RETURN_KEY) || ""; }
      catch (error) { return ""; }
    }
    function restorePosition(force) {
      if (restored) return;
      var currentPath = location.pathname + location.search;
      var pendingPath = pendingReturnPath();
      if (!force && pendingPath !== currentPath) return;
      var saved = readPosition();
      if (!saved || saved.path !== currentPath || Date.now() - Number(saved.savedAt || 0) > 1800000) return;
      restored = true;
      lastListingId = typeof saved.listingId === "string" ? saved.listingId : null;
      try {
        if (pendingPath === currentPath) sessionStorage.removeItem(SEARCH_RETURN_KEY);
      } catch (error) {}
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () {
          if (lastListingId) {
            var cards = document.querySelectorAll("[data-search-card][data-listing-id]");
            for (var i = 0; i < cards.length; i += 1) {
              if (cards[i].getAttribute("data-listing-id") !== lastListingId || cards[i].hidden) continue;
              var focusTarget = cards[i].querySelector("a[data-card-thumbnail], h2 a");
              if (focusTarget) focusTarget.focus({ preventScroll: true });
              break;
            }
          }
          // Some WebViews ignore focus({ preventScroll: true }). Apply the
          // recorded result position after focus so the buyer lands exactly
          // where they left the list.
          var maxTop = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
          window.scrollTo({ top: Math.min(maxTop, Math.max(0, Number(saved.top) || 0)), behavior: "auto" });
        });
      });
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
      restorePosition(Boolean(backForward));
    });
    restorePosition(false);
  }
  function initDialogFocusReturn() {
    var enquiry = document.getElementById("mk-enquiry");
    var contactOptions = document.querySelector("[data-mobile-contact-options]");
    if (enquiry) enquiry.addEventListener("close", function () {
      syncPublicDialogState();
      var target = lastLeadTrigger;
      lastLeadTrigger = null;
      if (target && target.isConnected && target.getClientRects().length) {
        window.requestAnimationFrame(function () { target.focus(); });
      }
    });
    if (contactOptions) contactOptions.addEventListener("close", function () {
      syncPublicDialogState();
      var target = lastContactOptionsTrigger;
      lastContactOptionsTrigger = null;
      if (target && target.isConnected && target.getClientRects().length) {
        window.requestAnimationFrame(function () { target.focus(); });
      }
    });
    syncPublicDialogState();
  }
   function syncPublicDialogState() {
     var enquiry = document.getElementById("mk-enquiry");
     var contactOptions = document.querySelector("[data-mobile-contact-options]");
     var listingGallery = document.querySelector("[data-listing-gallery-dialog]");
     var dialogOpen = Boolean((enquiry && enquiry.open) || (contactOptions && contactOptions.open) || (listingGallery && listingGallery.open));
     document.documentElement.classList.toggle("public-dialog-open", dialogOpen);
   }
  // The desktop language menu is a native <details>; it still needs to close
  // on an outside click, on Escape (returning focus to its button), and when
  // keyboard focus leaves it.
  function initLanguageMenu() {
    var menu = document.querySelector('details[data-language-switcher="desktop"]');
    if (!menu) return;
    var summary = menu.querySelector(":scope > summary");
    if (!summary) return;
    function closeMenu(returnFocus) {
      if (!menu.open) return;
      menu.open = false;
      if (returnFocus) summary.focus();
    }
    document.addEventListener("click", function (event) {
      if (menu.open && !menu.contains(event.target)) closeMenu(false);
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && menu.open) {
        event.preventDefault();
        closeMenu(true);
      }
    });
    menu.addEventListener("focusout", function (event) {
      if (event.relatedTarget && !menu.contains(event.relatedTarget)) closeMenu(false);
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
      var fallback = new URL(link.getAttribute("href") || "", window.location.href);
      if (previous.pathname === fallback.pathname) {
        try { sessionStorage.setItem(SEARCH_RETURN_KEY, previous.pathname + previous.search); } catch (error) {}
      }
      window.history.back();
      return true;
    } catch (error) {
      return false;
    }
  }
  document.addEventListener("click", function (event) {
    var trackedAction = analyticsAction(event.target);
    if (trackedAction) sendAnalyticsEvent({ type: "cta_click", action: trackedAction.action, listingReference: trackedAction.listingReference });
    if (event.target && event.target.matches && event.target.matches("#mk-enquiry")) {
      event.target.close();
      return;
    }
    if (event.target && event.target.matches && event.target.matches("[data-mobile-contact-options]")) {
      event.target.close();
      return;
    }
    var skipLink = event.target && event.target.closest ? event.target.closest('a[href="#main"]') : null;
    if (skipLink) {
      var main = document.getElementById("main");
      if (main && typeof main.focus === "function") {
        window.requestAnimationFrame(function () { main.focus({ preventScroll: true }); });
      }
    }
    var contactOptionsOpen = event.target.closest("[data-mobile-contact-options-open]");
    if (contactOptionsOpen) {
      var contactOptions = document.querySelector("[data-mobile-contact-options]");
      if (contactOptions && typeof contactOptions.showModal === "function") {
        lastContactOptionsTrigger = contactOptionsOpen;
        contactOptions.showModal();
        syncPublicDialogState();
        window.requestAnimationFrame(function () {
          var preferredAction = contactOptions.querySelector('[data-mobile-sticky-primary="true"]')
            || contactOptions.querySelector('button[data-endpoint="/api/leads"]');
          if (preferredAction) preferredAction.focus();
        });
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
      if (!writeSaved(ids)) {
        markSaved();
        showToast(I18N.requestFailed || "Could not save this property.");
        return;
      }
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
      syncPublicDialogState();
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
    if (action === "/api/leads" || isEnquiry) applyLeadAttribution(form);
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
  initStartFlow();
  initGuidedSearch();
  initSearchScrollRestoration();
  initDialogFocusReturn();
  initPublicMobileNavigation();
  initLanguageMenu();
  initSavedSearchContacts();
  initSearchFilterForms();
  initGeographyComboboxes();
  initHeroSearch();
  initSearchToolbar();
  initHeroGallery();
  initHorizontalFocusRails();
  initImageFallbacks();
 initListingGalleryLinks();
 initListingGalleryImageState();
 initListingGallery();
 initMobileListingGallery();
 initGuideToc();
 initSellerStepper();
 initSellerIntake();
 initSellerPhotoUpload();
 initPhotoSphereViewers();
 initPrivacySafeAnalytics();
 firstTouchPath();
})();`;

export const ADMIN_APP_JS = `(function () {
  "use strict";
  function syncAdminShellOffsets() {
    var topbar = document.querySelector(".crm-top");
    var editorTabs = document.querySelector("[data-editor-tabs]");
    var topbarHeight = topbar ? Math.round(topbar.getBoundingClientRect().height) : 64;
    var tabsHeight = editorTabs ? Math.round(editorTabs.getBoundingClientRect().height) : 0;
    document.documentElement.style.setProperty("--adm-shell-top-offset", String(topbarHeight) + "px");
    document.documentElement.style.setProperty("--adm-editor-anchor-offset", String(topbarHeight + tabsHeight + 24) + "px");
  }
  function applyLeadQueueFilter(tabs, filter) {
    var buttons = tabs.querySelectorAll("button[data-lead-filter]");
    for (var i = 0; i < buttons.length; i += 1) {
      var on = buttons[i].getAttribute("data-lead-filter") === filter;
      buttons[i].setAttribute("data-on", on ? "1" : "0");
      buttons[i].setAttribute("aria-pressed", on ? "true" : "false");
    }
    var rows = document.querySelectorAll("[data-lead-row]");
    var visible = 0;
    for (var j = 0; j < rows.length; j += 1) {
      var row = rows[j];
      var slaCell = row.querySelector("[data-sla-status]");
      var sla = slaCell ? slaCell.getAttribute("data-sla-status") : "";
      var replied = row.getAttribute("data-lead-replied") === "true";
      var show = true;
      if (filter === "needs_reply") show = !replied;
      if (filter === "sla") show = sla === "reminder_required" || sla === "manager_escalation_required";
      row.hidden = !show;
      if (show) visible += 1;
    }
    // An empty queue says so instead of leaving a bare table header.
    var empty = document.querySelector("[data-lead-queue-empty]");
    if (empty) empty.hidden = visible > 0 || rows.length === 0;
  }
  function initAdminListFilters() {
    var navs = document.querySelectorAll("[data-list-filter]");
    for (var i = 0; i < navs.length; i += 1) {
      (function (nav) {
        var scope = nav.getAttribute("data-list-filter");
        var buttons = nav.querySelectorAll("button[data-filter-value]");
        function apply(value) {
          var items = document.querySelectorAll('[data-list-item="' + scope + '"]');
          var visible = 0;
          for (var j = 0; j < items.length; j += 1) {
            var tags = " " + (items[j].getAttribute("data-filter-tags") || "") + " ";
            var show = value === "all" || tags.indexOf(" " + value + " ") >= 0;
            items[j].hidden = !show;
            if (show) visible += 1;
          }
          for (var k = 0; k < buttons.length; k += 1) {
            var on = buttons[k].getAttribute("data-filter-value") === value;
            buttons[k].setAttribute("data-on", on ? "1" : "0");
            buttons[k].setAttribute("aria-pressed", on ? "true" : "false");
          }
          var empty = document.querySelector('[data-list-empty="' + scope + '"]');
          if (empty) empty.hidden = visible > 0 || items.length === 0;
        }
        nav.addEventListener("click", function (event) {
          var button = event.target.closest("button[data-filter-value]");
          if (!button) return;
          apply(button.getAttribute("data-filter-value") || "all");
        });
        var selected = nav.querySelector('button[data-filter-value][data-on="1"]');
        if (selected && selected.getAttribute("data-filter-value") !== "all") apply(selected.getAttribute("data-filter-value"));
      })(navs[i]);
    }
  }
  function syncPipelineBoardCounts() {
    var columns = document.querySelectorAll("[data-stage-group]");
    for (var i = 0; i < columns.length; i += 1) {
      var cards = columns[i].querySelectorAll("[data-pipeline-card]");
      var visible = 0;
      for (var j = 0; j < cards.length; j += 1) if (!cards[j].hidden) visible += 1;
      var count = columns[i].querySelector("[data-board-count]");
      if (count) count.textContent = String(visible);
    }
  }
  function initPipelineBoard() {
    if (!document.querySelector("[data-stage-group]")) return;
    document.addEventListener("click", function (event) {
      if (event.target.closest("[data-pipeline-filter]")) syncPipelineBoardCounts();
    });
    syncPipelineBoardCounts();
  }
  // Lead inbox panes: the list links target the detail articles, so the
  // URL fragment already selects a lead without JavaScript. With JavaScript
  // the selection becomes an attribute, the first visible lead opens on wide
  // screens, and queue filters keep the selection in sync.
  function initLeadInboxPanes() {
    var inbox = document.querySelector("[data-inbox-panes]");
    if (!inbox) return;
    var detail = inbox.querySelector(".adm-inbox__detail");
    if (!detail) return;
    var narrow = window.matchMedia("(max-width: 1023px)");
    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    inbox.setAttribute("data-inbox-js", "true");
    function articles() {
      return detail.querySelectorAll(":scope > [data-lead-row]");
    }
    function hashLeadId() {
      var hash = window.location.hash || "";
      if (hash.indexOf("#lead-") !== 0) return "";
      try {
        return decodeURIComponent(hash.slice(6));
      } catch (error) {
        return hash.slice(6);
      }
    }
    function firstVisibleId() {
      var rows = articles();
      for (var i = 0; i < rows.length; i += 1) if (!rows[i].hidden) return rows[i].getAttribute("data-lead-id");
      return "";
    }
    function select(id, options) {
      var rows = articles();
      var chosen = null;
      for (var i = 0; i < rows.length; i += 1) {
        var on = Boolean(id) && rows[i].getAttribute("data-lead-id") === id && !rows[i].hidden;
        if (on) {
          rows[i].setAttribute("data-lead-selected", "true");
          chosen = rows[i];
        } else {
          rows[i].removeAttribute("data-lead-selected");
        }
      }
      var links = inbox.querySelectorAll("[data-lead-link]");
      for (var j = 0; j < links.length; j += 1) {
        if (chosen && links[j].getAttribute("data-lead-link") === id) links[j].setAttribute("aria-current", "true");
        else links[j].removeAttribute("aria-current");
      }
      if (chosen && options.updateHash && window.history && window.history.replaceState) {
        window.history.replaceState(null, "", "#lead-" + encodeURIComponent(id));
      }
      if (chosen && options.scroll) {
        chosen.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
      }
      return chosen;
    }
    function ensureSelection() {
      var selected = detail.querySelector(':scope > [data-lead-row][data-lead-selected="true"]');
      if (selected && !selected.hidden) return;
      select(narrow.matches ? "" : firstVisibleId(), {});
    }
    inbox.addEventListener("click", function (event) {
      var link = event.target.closest("[data-lead-link]");
      if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
      event.preventDefault();
      select(link.getAttribute("data-lead-link"), { updateHash: true, scroll: narrow.matches });
    });
    document.addEventListener("click", function (event) {
      if (event.target.closest("[data-lead-filter]")) ensureSelection();
    });
    window.addEventListener("hashchange", function () {
      var id = hashLeadId();
      if (id) select(id, { scroll: narrow.matches });
      else if (narrow.matches) select("", {});
    });
    var initial = hashLeadId();
    if (initial && select(initial, { scroll: narrow.matches })) return;
    ensureSelection();
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
  function syncTourProviderInputs(form) {
    var provider = form.querySelector("[data-tour-provider]");
    if (!provider) return;
    var isSupersplat = provider.value === "supersplat-viewer";
    var panorama = form.querySelector("[data-tour-panorama-url]");
    var viewer = form.querySelector("[data-tour-viewer-url]");
    var panoramaField = form.querySelector("[data-tour-panorama-field]");
    var viewerField = form.querySelector("[data-tour-viewer-field]");
    if (panorama) {
      panorama.required = !isSupersplat;
      panorama.disabled = isSupersplat;
    }
    if (viewer) {
      viewer.required = isSupersplat;
      viewer.disabled = !isSupersplat;
    }
    if (panoramaField) panoramaField.hidden = isSupersplat;
    if (viewerField) viewerField.hidden = !isSupersplat;
  }
  function setTourSaveStatus(form, value, state) {
    var status = form.querySelector("[data-tour-save-status]");
    if (!status) return;
    status.textContent = value;
    status.setAttribute("data-state", state);
  }
  function initTourEditor() {
    var forms = document.querySelectorAll("[data-tour-editor-form]");
    for (var i = 0; i < forms.length; i += 1) syncTourProviderInputs(forms[i]);
    document.addEventListener("change", function (event) {
      var provider = event.target;
      if (!(provider instanceof HTMLSelectElement) || !provider.matches("[data-tour-provider]") || !provider.form) return;
      syncTourProviderInputs(provider.form);
    });
    document.addEventListener("submit", function (event) {
      var form = event.target;
      if (!(form instanceof HTMLFormElement) || !form.hasAttribute("data-tour-editor-form")) return;
      event.preventDefault();
      syncTourProviderInputs(form);
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
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
      var unavailable = form.getAttribute("data-reply-draft-unavailable") || failure;
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
        })
        .catch(function (error) {
          var missingHermes = isDraft && /HERMES_CHAT_COMPLETIONS_URL|HERMES_API_KEY/.test(String(error && error.message || ""));
          // The page cannot know up front whether Hermes is configured, so the
          // first failed draft turns the composer into its unavailable state:
          // the draft button stays disabled and its note becomes visible.
          if (missingHermes) {
            var host = form.closest("[data-lead-row]") || form.parentElement;
            if (host) host.setAttribute("data-hermes-state", "unavailable");
            var button = form.querySelector('[type="submit"]');
            if (button) button.disabled = true;
          }
          setReplyStatus(form, missingHermes ? unavailable : failure, "error");
        })
        .then(function () {
          form.removeAttribute("aria-busy");
          var host = form.closest("[data-lead-row]");
          var unavailableNow = host && host.getAttribute("data-hermes-state") === "unavailable";
          if (submit && !(isDraft && unavailableNow)) submit.disabled = false;
        });
    });
  }
  function initCommunicationTemplates() {
    document.addEventListener("change", function (event) {
      var select = event.target;
      if (!(select instanceof HTMLSelectElement) || !select.hasAttribute("data-communication-template-select")) return;
      var option = select.options[select.selectedIndex];
      if (!option || !option.value) return;
      var form = select.closest("form[data-reply-approval-required], form[data-reply-delivery-form]");
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
    var empty = document.querySelector("[data-pipeline-empty]");
    function applyFilter(filter) {
      var visible = 0;
      for (var i = 0; i < cards.length; i += 1) {
        var card = cards[i];
        var matches =
          filter === "open"
            ? card.getAttribute("data-pipeline-status") === "open"
            : card.getAttribute("data-pipeline-kind") === filter || card.getAttribute("data-pipeline-status") === filter;
        card.hidden = !matches;
        if (matches) visible += 1;
      }
      for (var j = 0; j < buttons.length; j += 1) {
        var on = buttons[j].getAttribute("data-pipeline-filter") === filter;
        buttons[j].setAttribute("data-on", on ? "1" : "0");
        buttons[j].setAttribute("aria-pressed", on ? "true" : "false");
      }
      // The grid collapses when nothing matches, so the empty note takes its place.
      grid.hidden = visible === 0;
      if (empty) empty.hidden = visible > 0;
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
  function syncEditorSavebar(form) {
    var savebar = form.querySelector("[data-editor-savebar]");
    if (!savebar) return;
    var initial = form.getAttribute("data-editor-initial-state") || "";
    var dirty = initial !== editorFormState(form);
    var save = savebar.querySelector('[type="submit"]');
    var reset = savebar.querySelector("[data-editor-reset]");
    var note = savebar.querySelector("[data-editor-dirty-note]");
    savebar.setAttribute("data-dirty", dirty ? "true" : "false");
    if (save) save.disabled = !dirty;
    if (reset) reset.disabled = !dirty;
    if (note) {
      note.textContent = dirty
        ? form.getAttribute("data-editor-dirty-message") || "Unsaved changes"
        : form.getAttribute("data-editor-clean-message") || "All changes saved.";
      note.setAttribute("data-state", dirty ? "dirty" : "clean");
    }
  }
  function editorFormState(form) {
    var fields = [];
    var data = new FormData(form);
    data.forEach(function (value, key) {
      fields.push(key + "=" + String(value));
    });
    return fields.join("&");
  }
  function commitEditorFormState(form) {
    var elements = form.elements;
    for (var i = 0; i < elements.length; i += 1) {
      var field = elements[i];
      if (!field || !field.name) continue;
      if (field instanceof HTMLInputElement && (field.type === "checkbox" || field.type === "radio")) {
        field.defaultChecked = field.checked;
      } else if ("defaultValue" in field) {
        field.defaultValue = field.value;
      }
      if (field instanceof HTMLSelectElement) {
        for (var j = 0; j < field.options.length; j += 1) {
          field.options[j].defaultSelected = field.options[j].selected;
        }
      }
    }
    form.setAttribute("data-editor-initial-state", editorFormState(form));
    syncEditorSavebar(form);
  }
  function initEditorForms() {
    var forms = document.querySelectorAll("[data-editor-form]");
    for (var i = 0; i < forms.length; i += 1) {
      (function (form) {
        var reset = form.querySelector("[data-editor-reset]");
        commitEditorFormState(form);
        form.addEventListener("input", function () { syncEditorSavebar(form); });
        form.addEventListener("change", function () { syncEditorSavebar(form); });
        form.addEventListener("reset", function () {
          window.setTimeout(function () { syncEditorSavebar(form); });
        });
        if (reset) {
          reset.addEventListener("click", function () {
            form.reset();
            syncEditorSavebar(form);
            var status = form.querySelector("[data-admin-mutation-status]");
            if (status) {
              status.textContent = "";
              status.removeAttribute("data-state");
            }
          });
        }
      })(forms[i]);
    }
  }
  function initAdminMobileNavigation() {
    var mobileNav = document.querySelector("[data-admin-mobile-nav]");
    if (!mobileNav) return;
    var summary = mobileNav.querySelector(".adm-mobile-nav__summary");
    var panel = mobileNav.querySelector(".adm-mobile-nav__panel");
    var close = mobileNav.querySelector("[data-admin-mobile-nav-close]");
    if (!summary || !panel) return;
    var returnFocusTarget = null;
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
      syncAdminShellOffsets();
      window.requestAnimationFrame(function () {
        var target = close || panel.querySelector('[aria-current="page"]') || focusableItems()[0];
        if (target) target.focus();
      });
    }
    function closeNavigation(returnFocus) {
      mobileNav.open = false;
      syncOpenState();
      if (returnFocus) {
        var target = returnFocusTarget && returnFocusTarget.isConnected ? returnFocusTarget : summary;
        target.focus();
      }
    }
    summary.addEventListener("click", function () {
      if (!mobileNav.open) returnFocusTarget = document.activeElement instanceof HTMLElement ? document.activeElement : summary;
    });
    if (close) {
      close.addEventListener("click", function () {
        closeNavigation(true);
      });
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
    window.addEventListener("resize", syncAdminShellOffsets);
    syncOpenState();
  }
  function initListingEditorTabs() {
    var nav = document.querySelector("[data-editor-tabs]");
    if (!nav) return;
    var tabNodes = nav.querySelectorAll("[data-editor-tab][href^='#']");
    var entries = [];
    for (var i = 0; i < tabNodes.length; i += 1) {
      var href = tabNodes[i].getAttribute("href") || "";
      var sectionId = href.slice(1);
      var section = sectionId ? document.getElementById(sectionId) : null;
      if (section) entries.push({ tab: tabNodes[i], section: section });
    }
    if (!entries.length) return;
    var rail = document.querySelector("[data-editor-readiness-rail]");
    var frame = 0;
    // A clicked tab stays active while its section scrolls into place and,
    // because the rail panels are sticky and always in view, until the
    // operator scrolls away from that position.
    var pinnedId = null;
    var pinUntil = 0;
    var pinnedScrollY = null;
    function pin(sectionId, settledY) {
      pinnedId = sectionId;
      pinUntil = Date.now() + 1000;
      pinnedScrollY = typeof settledY === "number" ? settledY : null;
      if (pinnedScrollY === null) {
        // Browser-driven anchor scrolls settle on their own; sample the
        // position once the scroll has had time to finish.
        window.setTimeout(function () {
          if (pinnedId === sectionId && pinnedScrollY === null) pinnedScrollY = window.scrollY;
        }, 1000);
      }
    }
    function inStickyRail(section) {
      return Boolean(rail) && rail.contains(section) && getComputedStyle(rail).position === "sticky";
    }
    function setActive(sectionId) {
      for (var j = 0; j < entries.length; j += 1) {
        var active = entries[j].section.id === sectionId;
        entries[j].tab.toggleAttribute("data-active", active);
        if (active) entries[j].tab.setAttribute("aria-current", "location");
        else entries[j].tab.removeAttribute("aria-current");
      }
    }
    function expandSection(section) {
      var details = section.querySelector("details[data-editor-section]");
      if (details) details.open = true;
    }
    function scrollToSection(section) {
      syncAdminShellOffsets();
      var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      var offset = Number((document.documentElement.style.getPropertyValue("--adm-editor-anchor-offset") || "124").replace("px", "")) || 124;
      var maxTop = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      var nextTop = Math.min(maxTop, Math.max(0, window.scrollY + section.getBoundingClientRect().top - offset));
      window.scrollTo({ top: nextTop, behavior: reduceMotion ? "auto" : "smooth" });
      return nextTop;
    }
    function syncFromScroll() {
      frame = 0;
      syncAdminShellOffsets();
      if (pinnedId) {
        if (Date.now() < pinUntil) {
          setActive(pinnedId);
          return;
        }
        if (pinnedScrollY === null) pinnedScrollY = window.scrollY;
        if (Math.abs(window.scrollY - pinnedScrollY) < 120) {
          setActive(pinnedId);
          return;
        }
        pinnedId = null;
      }
      var anchorLine = nav.getBoundingClientRect().bottom + 24;
      var activeSection = null;
      var activeTop = -Infinity;
      for (var j = 0; j < entries.length; j += 1) {
        var section = entries[j].section;
        // Sticky rail panels never scroll, so they cannot drive the scroll-spy.
        if (inStickyRail(section)) continue;
        var sectionTop = section.getBoundingClientRect().top;
        if (sectionTop <= anchorLine && sectionTop > activeTop) {
          activeSection = section;
          activeTop = sectionTop;
        }
      }
      if (!activeSection) {
        for (var k = 0; k < entries.length; k += 1) {
          if (!inStickyRail(entries[k].section)) {
            activeSection = entries[k].section;
            break;
          }
        }
      }
      setActive((activeSection || entries[0].section).id);
    }
    function scheduleSync() {
      if (!frame) frame = window.requestAnimationFrame(syncFromScroll);
    }
    nav.addEventListener("click", function (event) {
      var tab = event.target.closest("[data-editor-tab][href^='#']");
      if (!tab) return;
      var targetId = (tab.getAttribute("href") || "").slice(1);
      var section = targetId ? document.getElementById(targetId) : null;
      if (!section) return;
      event.preventDefault();
      expandSection(section);
      setActive(targetId);
      if (window.history && window.history.pushState) window.history.pushState(null, "", "#" + targetId);
      else window.location.hash = targetId;
      pin(targetId, scrollToSection(section));
    });
    window.addEventListener("scroll", scheduleSync, { passive: true });
    window.addEventListener("resize", function () {
      syncAdminShellOffsets();
      scheduleSync();
    });
    window.addEventListener("hashchange", function () {
      var targetId = window.location.hash ? window.location.hash.slice(1) : "";
      var section = targetId ? document.getElementById(targetId) : null;
      if (section) {
        expandSection(section);
        pin(targetId);
      }
      scheduleSync();
    });
    var initialId = window.location.hash ? window.location.hash.slice(1) : entries[0].section.id;
    var initialSection = document.getElementById(initialId) ? document.getElementById(initialId) : entries[0].section;
    if (initialSection) expandSection(initialSection);
    if (window.location.hash && initialSection) pin(initialSection.id);
    setActive(initialSection ? initialSection.id : entries[0].section.id);
    syncAdminShellOffsets();
    scheduleSync();
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
        var empty = panel.querySelector("[data-empty-route-decisions]");
        if (empty) {
          empty.hidden = false;
          empty.focus({ preventScroll: true });
        }
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
  function workspaceStorageKey(prefix, element) {
    return prefix + ":" + (element.getAttribute("data-workspace-operator") || "anonymous");
  }
  function workspaceFlagRead(key) {
    try {
      return localStorage.getItem(key) === "1";
    } catch (error) {
      return false;
    }
  }
  function workspaceFlagWrite(key) {
    try {
      localStorage.setItem(key, "1");
    } catch (error) {
      // Private browsing: the panel simply reappears on the next visit.
    }
  }
  function initWorkspaceOnboarding() {
    var panel = document.querySelector("[data-workspace-onboarding]");
    if (panel) {
      var panelKey = workspaceStorageKey("ms-realty:admin-onboarding-dismissed:v1", panel);
      var dismissPanel = panel.querySelector("[data-workspace-onboarding-dismiss]");
      if (workspaceFlagRead(panelKey)) panel.hidden = true;
      else if (dismissPanel) {
        dismissPanel.hidden = false;
        dismissPanel.addEventListener("click", function () {
          workspaceFlagWrite(panelKey);
          panel.hidden = true;
        });
      }
    }
    var welcome = document.querySelector("[data-workspace-welcome]");
    if (!welcome) return;
    var welcomeKey = workspaceStorageKey("ms-realty:admin-welcome-seen:v1", welcome);
    if (workspaceFlagRead(welcomeKey)) {
      welcome.hidden = true;
      return;
    }
    var dismissWelcome = welcome.querySelector("[data-workspace-welcome-dismiss]");
    if (dismissWelcome) {
      dismissWelcome.hidden = false;
      dismissWelcome.addEventListener("click", function () {
        welcome.hidden = true;
      });
    }
    // The banner greets an operator once per browser after login.
    workspaceFlagWrite(welcomeKey);
  }
  function workspaceSettingsFormState(form) {
    var pairs = [];
    new FormData(form).forEach(function (value, key) {
      pairs.push(key + "=" + String(value));
    });
    return pairs.sort().join("&");
  }
  function initWorkspaceSettingsForms() {
    var forms = document.querySelectorAll("[data-workspace-settings-form]");
    for (var i = 0; i < forms.length; i += 1) {
      bindWorkspaceSettingsForm(forms[i]);
    }
  }
  function bindWorkspaceSettingsForm(form) {
    var submit = form.querySelector('[type="submit"]');
    if (!submit || submit.disabled) return;
    var status = form.querySelector("[data-admin-mutation-status]");
    var dirtyMessage = form.getAttribute("data-settings-dirty-message") || "";
    var baseline = workspaceSettingsFormState(form);
    function sync() {
      var dirty = workspaceSettingsFormState(form) !== baseline;
      form.setAttribute("data-settings-dirty", dirty ? "true" : "false");
      submit.disabled = !dirty;
      if (!status) return;
      var state = status.getAttribute("data-state");
      if (state === "saving") return;
      if (dirty) {
        status.textContent = dirtyMessage;
        status.setAttribute("data-state", "dirty");
      } else if (state === "dirty") {
        status.textContent = "";
        status.removeAttribute("data-state");
      }
    }
    if (status && window.MutationObserver) {
      new MutationObserver(function () {
        if (status.getAttribute("data-state") !== "success") return;
        baseline = workspaceSettingsFormState(form);
        form.setAttribute("data-settings-dirty", "false");
        // The shared mutation handler re-enables submit buttons after its
        // success step, so the saved form returns to pristine on the next tick.
        window.setTimeout(function () {
          submit.disabled = true;
          markWorkspaceSettingsSaved(form);
        }, 0);
      }).observe(status, { attributes: true, attributeFilter: ["data-state"] });
    }
    form.addEventListener("input", sync);
    form.addEventListener("change", sync);
    syncWorkspaceSettingsConstraints(form);
    form.addEventListener("input", function () {
      syncWorkspaceSettingsConstraints(form);
    });
    sync();
  }
  // A saved section stops claiming it still holds the committed defaults.
  function markWorkspaceSettingsSaved(form) {
    var section = form.getAttribute("data-workspace-settings-form");
    var updatedLabel = form.getAttribute("data-settings-updated-label") || "";
    var panel = form.closest("[data-settings-section]");
    if (panel) panel.setAttribute("data-settings-state", "updated");
    var pills = document.querySelectorAll(
      '[data-settings-section="' + section + '"] [data-settings-section-state], [data-settings-index-row="' + section + '"] [data-settings-section-state]',
    );
    for (var i = 0; i < pills.length; i += 1) {
      pills[i].setAttribute("data-settings-section-state", "updated");
      var text = pills[i].lastChild;
      if (text && text.nodeType === 3) text.nodeValue = updatedLabel;
    }
  }
  // Mirrors the server rule (escalation must come after the first reply target)
  // as a native constraint, so the browser marks the offending field itself.
  function syncWorkspaceSettingsConstraints(form) {
    var firstReply = form.querySelector('[name="first_reply_target_minutes"]');
    var escalation = form.querySelector('[name="manager_escalation_minutes"]');
    if (!firstReply || !escalation) return;
    var target = Number(firstReply.value);
    escalation.min = Number.isFinite(target) && target > 0 ? String(target + 1) : "5";
  }
  // A datetime-local control carries no timezone; the ledger only accepts an
  // instant, so the browser resolves it before the request leaves.
  function adminMutationPayload(form) {
    var payload = tourPayload(form);
    var stamps = form.querySelectorAll('input[type="datetime-local"]');
    for (var i = 0; i < stamps.length; i += 1) {
      var field = stamps[i];
      if (!field.name || !field.value) continue;
      var parsed = new Date(field.value);
      if (!isNaN(parsed.getTime())) payload[field.name] = parsed.toISOString();
    }
    var boxes = form.querySelectorAll('[data-lead-select]');
    if (boxes.length) {
      var selected = [];
      for (var j = 0; j < boxes.length; j += 1) if (boxes[j].checked) selected.push(boxes[j].value);
      payload.leadIds = selected;
    }
    if (form.hasAttribute("data-lead-bulk-form")) payload.bulkConfirmed = form.elements.bulkConfirmed && form.elements.bulkConfirmed.checked;
    return payload;
  }
  function bulkOutcomeText(form, payload) {
    var failure = form.getAttribute("data-admin-mutation-failure") || "Could not apply to every enquiry.";
    var refused = (payload.results || []).filter(function (row) { return row.status === "refused"; });
    var first = refused.length ? refused[0].message : "";
    return failure + " " + String(payload.applied) + "/" + String(payload.requested) + (first ? " — " + first : "");
  }
  function initLeadBulkForm() {
    var form = document.querySelector("[data-lead-bulk-form]");
    if (!form) return;
    var boxes = document.querySelectorAll("[data-lead-select]");
    var toggle = form.querySelector("[data-lead-select-all]");
    var count = form.querySelector("[data-lead-selection-count]");
    var action = form.querySelector("[data-lead-bulk-action]");
    var selectedLabel = form.getAttribute("data-lead-selected-label") || "{count} selected";
    function refreshCount() {
      var selected = 0;
      for (var i = 0; i < boxes.length; i += 1) if (boxes[i].checked && !boxes[i].closest("[data-lead-row]").hidden) selected += 1;
      if (count) count.textContent = selectedLabel.replace("{count}", String(selected));
    }
    function refreshFields() {
      var value = action ? action.value : "assign";
      var fields = form.querySelectorAll("[data-lead-bulk-field]");
      for (var i = 0; i < fields.length; i += 1) {
        var wanted = fields[i].getAttribute("data-lead-bulk-field");
        var on = wanted === value;
        fields[i].hidden = !on;
        var control = fields[i].querySelector("input, select");
        if (control) control.required = on && wanted === "snooze";
      }
    }
    document.addEventListener("change", function (event) {
      if (event.target && event.target.matches("[data-lead-select]")) refreshCount();
      if (event.target === toggle) {
        for (var i = 0; i < boxes.length; i += 1) {
          var row = boxes[i].closest("[data-lead-row]");
          if (row && row.hidden) continue;
          boxes[i].checked = toggle.checked;
        }
        refreshCount();
      }
      if (event.target === action) refreshFields();
    });
    refreshFields();
    refreshCount();
  }
  // A saved view is the current list filters under a name. Selecting one puts
  // its filters back on the list and in the address, so it can be revisited.
  function currentLeadFilters() {
    var tabs = document.querySelector("[data-lead-queue-tabs]");
    var active = tabs ? tabs.querySelector('button[data-lead-filter][data-on="1"]') : null;
    var filters = { queue: active ? active.getAttribute("data-lead-filter") : "all" };
    var params = new URLSearchParams(window.location.search || "");
    ["broker", "leadType", "language", "source", "listingReference", "q"].forEach(function (key) {
      if (params.get(key)) filters[key] = params.get(key);
    });
    return filters;
  }
  function applySavedLeadView(filters) {
    if (!filters || !filters.queue) return;
    var tabs = document.querySelector("[data-lead-queue-tabs]");
    if (!tabs) return;
    var button = tabs.querySelector('button[data-lead-filter="' + filters.queue + '"]');
    if (button) button.click();
  }
  function initSavedViews() {
    var select = document.querySelector("[data-saved-view-select]");
    var form = document.querySelector("[data-saved-view-form]");
    if (form) {
      var field = form.querySelector("[data-saved-view-filters-field]");
      var sync = function () { if (field) field.value = JSON.stringify(currentLeadFilters()); };
      sync();
      document.addEventListener("click", function (event) {
        if (event.target && event.target.closest("button[data-lead-filter]")) window.setTimeout(sync, 0);
      });
      form.addEventListener("submit", sync);
    }
    if (!select) return;
    select.addEventListener("change", function () {
      var option = select.options[select.selectedIndex];
      var raw = option ? option.getAttribute("data-saved-view-filters") : "";
      if (!raw) return;
      try { applySavedLeadView(JSON.parse(raw)); } catch (error) { /* a stored view we cannot read changes nothing */ }
    });
    var remove = document.querySelector("[data-saved-view-delete]");
    if (!remove) return;
    remove.addEventListener("click", function () {
      var slug = select.value;
      if (!slug) return;
      var status = document.querySelector("[data-saved-view-status]");
      remove.disabled = true;
      fetch("/api/admin/views", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ surface: select.getAttribute("data-saved-view-select"), slug: slug }),
      })
        .then(function (response) { if (!response.ok) throw new Error(String(response.status)); return response.json(); })
        .then(function () {
          select.remove(select.selectedIndex);
          select.value = "";
          if (status) { status.textContent = remove.getAttribute("data-deleted-label") || "View deleted."; status.setAttribute("data-state", "success"); }
        })
        .catch(function () {
          if (status) { status.textContent = remove.getAttribute("data-delete-failed-label") || "Could not delete the view."; status.setAttribute("data-state", "error"); }
        })
        .then(function () { remove.disabled = false; });
    }
    }

  // Listing photo upload inside the media manager. Without JavaScript the same
  // form posts multipart and the server redirects back to this panel; here it
  // becomes inline progress with a per-file outcome list.
  function initMediaUploadForm() {
    var form = document.querySelector("[data-media-upload-form]");
    if (!form || !window.FormData || !window.XMLHttpRequest) return;
    var input = form.querySelector("[data-media-upload-input]");
    var status = form.querySelector("[data-media-upload-status]");
    var results = form.querySelector("[data-media-upload-results]");
    var progress = form.querySelector("[data-media-upload-progress]");
    var submit = form.querySelector("[data-media-upload-submit]");
    var pendingText = form.getAttribute("data-media-upload-pending") || "Uploading…";
    var successText = form.getAttribute("data-media-upload-success") || "Uploaded.";
    var failureText = form.getAttribute("data-media-upload-failure") || "Could not upload.";
    var rejectedText = form.getAttribute("data-media-upload-rejected") || "File refused";

    function setStatus(text, state) {
      if (!status) return;
      status.textContent = text || "";
      if (state) status.setAttribute("data-state", state);
      else status.removeAttribute("data-state");
    }
    function addResult(text, state) {
      if (!results) return null;
      var item = document.createElement("li");
      item.textContent = text;
      item.setAttribute("data-state", state);
      results.appendChild(item);
      return item;
    }

    form.addEventListener("submit", function (event) {
      var files = input && input.files ? Array.prototype.slice.call(input.files) : [];
      if (!files.length) return;
      event.preventDefault();
      if (results) results.textContent = "";
      var payload = new FormData(form);
      if (submit) submit.disabled = true;
      form.setAttribute("aria-busy", "true");
      setStatus(pendingText, "saving");
      if (progress) {
        progress.hidden = false;
        progress.value = 0;
      }
      var request = new XMLHttpRequest();
      request.open("POST", form.getAttribute("action"), true);
      request.setRequestHeader("accept", "application/json");
      request.withCredentials = true;
      if (request.upload) {
        request.upload.onprogress = function (progressEvent) {
          if (!progress || !progressEvent.lengthComputable) return;
          progress.value = Math.round((progressEvent.loaded / progressEvent.total) * 100);
        };
      }
      request.onload = function () {
        var body = {};
        try {
          body = JSON.parse(request.responseText || "{}");
        } catch (error) {
          body = {};
        }
        var uploaded = body.uploaded || [];
        var refused = body.rejected || [];
        for (var u = 0; u < uploaded.length; u += 1) {
          var uploadedFile = files[uploaded[u].index];
          var entry = addResult((uploadedFile ? uploadedFile.name + " \u2014 " : "") + successText, "success");
          // The editor may hold unsaved fact edits, so the panel is never
          // reloaded from under the operator. A link to the stored bytes lets
          // them check the photo now and open the review form on their own next
          // visit to this panel.
          if (entry && uploaded[u].preview_path) {
            var link = document.createElement("a");
            link.href = uploaded[u].preview_path;
            link.target = "_blank";
            link.rel = "noreferrer";
            link.textContent = " " + uploaded[u].asset_id;
            entry.appendChild(link);
          }
        }
        for (var r = 0; r < refused.length; r += 1) {
          var refusedFile = files[refused[r].index];
          addResult((refusedFile ? refusedFile.name + " \u2014 " : rejectedText + ": ") + (refused[r].message || failureText), "error");
        }
        if (request.status >= 200 && request.status < 300) {
          setStatus(successText, refused.length ? "warning" : "success");
          if (input) input.value = "";
        } else {
          setStatus(body.message || failureText, "error");
        }
        if (progress) progress.hidden = true;
        if (submit) submit.disabled = false;
        form.removeAttribute("aria-busy");
      };
      request.onerror = function () {
        setStatus(failureText, "error");
        if (progress) progress.hidden = true;
        if (submit) submit.disabled = false;
        form.removeAttribute("aria-busy");
      };
      request.send(payload);
    });
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
        body: JSON.stringify(adminMutationPayload(form)),
      })
        .then(function (response) {
          return response.json().catch(function () { return {}; }).then(function (payload) {
            if (!response.ok && response.status !== 207) throw new Error(payload.message || failure);
            return payload;
          });
        })
        .then(function (payload) {
          // A batch that refused some enquiries is not a success: the strip
          // says how many landed and how many did not.
          var partial = payload && payload.kind === "lead_bulk_action" && payload.refused > 0;
          if (status) {
            status.textContent = partial ? bulkOutcomeText(form, payload) : success;
            status.setAttribute("data-state", partial ? "error" : "success");
          }
          if (form.hasAttribute("data-editor-form")) commitEditorFormState(form);
          if (form.hasAttribute("data-route-decision-form")) completeRouteDecision(form, payload);
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
  initListingEditorTabs();
  initEditorForms();
  initLeadPipelineFilters();
  initListingBulkForms();
  initRouteDecisionForms();
  initAdminMutationForms();
  initMediaUploadForm();
  initWorkspaceOnboarding();
  initWorkspaceSettingsForms();
  initLeadBulkForm();
  initSavedViews();
  initTourEditor();
  initViewingFollowUpForms();
  initSellerPipelineOutcomeForms();
  initPublicRequestOutcomeForms();
  initTranslationWorkflowForms();
  initReplyDeliveryForms();
  initReplyForms();
  initCommunicationTemplates();
  initAdminListFilters();
  initPipelineBoard();
  initLeadInboxPanes();
})();`;
