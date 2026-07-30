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
  function initHeroAdvancedSearch() {
    var form = document.querySelector("[data-hero-advanced-search]");
    if (!form) return;
    var trigger = form.querySelector("[data-hero-advanced-trigger]");
    var panel = form.querySelector(".hp-hero__advanced-panel");
    if (!trigger || !panel) return;
    function setExpanded(expanded) {
      trigger.setAttribute("aria-expanded", expanded ? "true" : "false");
      panel.hidden = !expanded;
    }
    trigger.addEventListener("click", function () {
      setExpanded(trigger.getAttribute("aria-expanded") !== "true");
    });
    form.addEventListener("keydown", function (event) {
      if (event.key !== "Escape" || trigger.getAttribute("aria-expanded") !== "true") return;
      event.preventDefault();
      setExpanded(false);
      trigger.focus();
    });
    setExpanded(false);
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
  initGeographyComboboxes();
  initHeroAdvancedSearch();
  initHeroGallery();
  initImageFallbacks();
  initListingGallery();
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
          window.setTimeout(function () { window.location.reload(); }, 150);
        })
        .catch(function (error) {
          var message = isDraft && /HERMES_CHAT_COMPLETIONS_URL|HERMES_API_KEY/.test(String(error && error.message || ""))
            ? unavailable
            : failure;
          setReplyStatus(form, message, "error");
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
    var frame = 0;
    function setActive(sectionId) {
      for (var j = 0; j < entries.length; j += 1) {
        var active = entries[j].section.id === sectionId;
        entries[j].tab.toggleAttribute("data-active", active);
        if (active) entries[j].tab.setAttribute("aria-current", "location");
        else entries[j].tab.removeAttribute("aria-current");
      }
    }
    function syncFromScroll() {
      frame = 0;
      var anchorLine = nav.getBoundingClientRect().bottom + 24;
      var activeSection = entries[0].section;
      var activeTop = -Infinity;
      for (var j = 0; j < entries.length; j += 1) {
        var sectionTop = entries[j].section.getBoundingClientRect().top;
        if (sectionTop <= anchorLine && sectionTop > activeTop) {
          activeSection = entries[j].section;
          activeTop = sectionTop;
        }
      }
      setActive(activeSection.id);
    }
    function scheduleSync() {
      if (!frame) frame = window.requestAnimationFrame(syncFromScroll);
    }
    nav.addEventListener("click", function (event) {
      var tab = event.target.closest("[data-editor-tab][href^='#']");
      if (tab) setActive((tab.getAttribute("href") || "").slice(1));
    });
    window.addEventListener("scroll", scheduleSync, { passive: true });
    window.addEventListener("resize", scheduleSync);
    window.addEventListener("hashchange", scheduleSync);
    var initialId = window.location.hash ? window.location.hash.slice(1) : entries[0].section.id;
    setActive(document.getElementById(initialId) ? initialId : entries[0].section.id);
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
  initListingEditorTabs();
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
