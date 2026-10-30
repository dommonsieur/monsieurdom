// Custom PostHog events, on top of the automatic page views set up in _includes/head.html.
// Every event carries the page path and title. Nothing she types or copies is sent, only that it happened.
(function () {
  if (!window.posthog) return;

  var page = { page_path: location.pathname, page_title: document.title };

  function track(name, props, options) {
    var all = {};
    for (var k in page) all[k] = page[k];
    for (var k2 in props || {}) all[k2] = props[k2];
    posthog.capture(name, all, options);
  }

  function text(el) {
    return (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120);
  }

  // Arrived on /bonsoir: the address printed on the QR cards.
  if (/^\/bonsoir(\.html)?$/.test(location.pathname)) {
    track("qr_code_visit", { referrer: document.referrer || null });
  }

  // Clicks on any link, plus a dedicated event for each kind that matters.
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a");
    if (!a) return;
    var href = a.getAttribute("href") || "";
    var props = { link_text: text(a), link_href: href.indexOf("mailto:") === 0 ? "mailto" : href };

    if (href.indexOf("mailto:") === 0) {
      props.placement = a.closest(".invite") ? "story_end" : "contact";
      track("write_to_me_clicked", props);
    } else if (a.classList.contains("story")) {
      props.card_title = props.link_text = text(a.querySelector(".title") || a);
      track("card_clicked", props);
    } else if (a.classList.contains("button")) {
      track("story_invite_clicked", props);
    } else if (a.classList.contains("back")) {
      track("back_clicked", props);
    }
    track("link_clicked", props);
  });

  // Copying text, e.g. the email address (selectable in one tap). Only the length is sent.
  document.addEventListener("copy", function () {
    var sel = window.getSelection();
    var address = document.querySelector(".address");
    track("text_copied", {
      email_address: !!(address && sel && sel.anchorNode && address.contains(sel.anchorNode)),
      length: String(sel || "").length,
    });
  });

  // Which parts of the page were actually seen: each section heading and the key blocks.
  var sections = document.querySelectorAll(
    "h2, .five-hours, .contrast, .scale, .rules, .lights, .steps, .promise, .invite, .signoff"
  );
  if ("IntersectionObserver" in window) {
    var seen = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        seen.unobserve(entry.target);
        var el = entry.target;
        var name = el.tagName === "H2" ? text(el) : el.className.split(" ")[0];
        track("section_viewed", { section: name });
        if (el.classList.contains("signoff") && document.querySelector(".invite")) {
          track("story_finished", {});
        }
      });
    }, { threshold: 0.5 });
    sections.forEach(function (el) { seen.observe(el); });
  }

  // How far down she scrolled: 25, 50, 75 and 100%, each once per page.
  var marks = [25, 50, 75, 100], maxScroll = 0;
  function onScroll() {
    var doc = document.documentElement;
    var scrollable = doc.scrollHeight - window.innerHeight;
    var pct = scrollable > 0 ? Math.round((window.scrollY / scrollable) * 100) : 100;
    if (pct > maxScroll) maxScroll = pct;
    while (marks.length && maxScroll >= marks[0]) {
      track("scroll_depth", { percent: marks.shift() });
    }
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Time spent reading: counts only while the tab is visible, sent when she leaves.
  var visibleMs = 0, since = document.visibilityState === "visible" ? Date.now() : null, sent = false;
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") {
      since = Date.now();
    } else if (since) {
      visibleMs += Date.now() - since;
      since = null;
    }
  });
  window.addEventListener("pagehide", function () {
    if (sent) return;
    sent = true;
    if (since) visibleMs += Date.now() - since;
    // sendBeacon still delivers while the page is closing.
    track("page_read", { seconds_visible: Math.round(visibleMs / 1000), max_scroll_percent: maxScroll },
      { transport: "sendBeacon" });
  });
})();
