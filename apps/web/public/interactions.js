// ISVOI managed-page interactions.
(function () {
  "use strict";

  function byId(id) {
    return document.getElementById(id);
  }

  function text(value) {
    return value == null ? "" : String(value);
  }

  function trackingPayload() {
    var params = new URLSearchParams(window.location.search || "");
    return {
      source_path: window.location.pathname || "/",
      source_url: window.location.href || "",
      page_title: document.title || "",
      referrer: document.referrer || "",
      utm_source: params.get("utm_source") || "",
      utm_medium: params.get("utm_medium") || "",
      utm_campaign: params.get("utm_campaign") || "",
      utm_content: params.get("utm_content") || "",
      utm_term: params.get("utm_term") || ""
    };
  }

  function wireMobileNav() {
    var toggle = byId("navToggle");
    var links = byId("navLinks");
    if (!toggle || !links) return;

    toggle.addEventListener("click", function () {
      var open = links.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });

    links.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        links.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  function wireCatalogFilters() {
    document.querySelectorAll(".catalog-section").forEach(function (section) {
      var grid = section.querySelector(".catalog-grid");
      if (!grid) return;

      var state = { category: "all", status: "all" };
      var originalCards = Array.prototype.slice.call(grid.querySelectorAll(".device-card"));
      var sortControl = section.querySelector("[data-catalog-sort]");

      function numberAttr(card, name) {
        var value = Number(card.getAttribute(name) || 0);
        return Number.isFinite(value) ? value : 0;
      }

      function updatedTime(card) {
        var value = Date.parse(card.getAttribute("data-updated") || "");
        return Number.isFinite(value) ? value : 0;
      }

      function cardMatches(card) {
        var type = card.getAttribute("data-type") || "";
        var category = card.getAttribute("data-category") || "";
        var status = card.getAttribute("data-status") || "available";
        var categoryOk = state.category === "all" || category === state.category || type.indexOf(state.category) !== -1;
        var statusOk = state.status === "all" || status === state.status;
        return categoryOk && statusOk;
      }

      function sortedCards() {
        var value = sortControl ? sortControl.value : "default";
        var cards = originalCards.slice();
        if (value === "price-asc") {
          cards.sort(function (a, b) { return numberAttr(a, "data-price") - numberAttr(b, "data-price"); });
        } else if (value === "price-desc") {
          cards.sort(function (a, b) { return numberAttr(b, "data-price") - numberAttr(a, "data-price"); });
        } else if (value === "updated-desc") {
          cards.sort(function (a, b) { return updatedTime(b) - updatedTime(a); });
        } else if (value === "status") {
          cards.sort(function (a, b) {
            return numberAttr(a, "data-status-order") - numberAttr(b, "data-status-order")
              || numberAttr(a, "data-sort") - numberAttr(b, "data-sort");
          });
        } else {
          cards.sort(function (a, b) { return numberAttr(a, "data-sort") - numberAttr(b, "data-sort"); });
        }
        return cards;
      }

      function applyCatalogState() {
        sortedCards().forEach(function (card) {
          card.hidden = !cardMatches(card);
          grid.appendChild(card);
        });
      }

      section.querySelectorAll(".filter-chip").forEach(function (chip) {
        chip.addEventListener("click", function () {
          var field = chip.getAttribute("data-filter-field") || "category";
          state[field] = chip.getAttribute("data-filter") || "all";

          section.querySelectorAll('.filter-chip[data-filter-field="' + field + '"]').forEach(function (item) {
            item.classList.remove("is-active");
          });
          chip.classList.add("is-active");
          applyCatalogState();
        });
      });

      if (sortControl) {
        sortControl.addEventListener("change", applyCatalogState);
      }

      applyCatalogState();
    });
  }

  function wireLeadForm() {
    var leadForm = byId("leadForm");
    var formNote = byId("formNote");
    if (!leadForm || !formNote) return;
    var turnstileWidgetId = null;
    var turnstileContainer = leadForm.querySelector("[data-turnstile-widget]");
    var turnstileInput = leadForm.querySelector('input[name="turnstile_token"]');

    function setTurnstileToken(token) {
      if (turnstileInput) turnstileInput.value = token || "";
    }

    function resetTurnstile() {
      setTurnstileToken("");
      if (window.turnstile && turnstileWidgetId) window.turnstile.reset(turnstileWidgetId);
    }

    function renderTurnstile() {
      if (!turnstileContainer || turnstileWidgetId || !window.turnstile) return;
      var siteKey = turnstileContainer.getAttribute("data-sitekey") || "";
      if (!siteKey) return;
      turnstileWidgetId = window.turnstile.render(turnstileContainer, {
        sitekey: siteKey,
        callback: setTurnstileToken,
        "expired-callback": function () { setTurnstileToken(""); },
        "error-callback": function () { setTurnstileToken(""); }
      });
    }

    if (turnstileContainer) {
      var attempts = 0;
      var timer = window.setInterval(function () {
        attempts += 1;
        renderTurnstile();
        if (turnstileWidgetId || attempts >= 40) window.clearInterval(timer);
      }, 250);
    }

    leadForm.addEventListener("submit", function (event) {
      event.preventDefault();

      var submit = leadForm.querySelector('[type="submit"]');
      var previousText = submit ? submit.textContent : "";
      var formData = new FormData(leadForm);
      var payload = {
        kind: text(formData.get("kind")),
        scenario: text(formData.get("scenario")),
        device: text(formData.get("device")),
        device_id: text(formData.get("device_id")),
        name: text(formData.get("name")),
        contact: text(formData.get("contact")),
        message: text(formData.get("message")),
        turnstile_token: text(formData.get("turnstile_token")),
        source: window.location.pathname || "/",
        website: text(formData.get("website"))
      };
      Object.assign(payload, trackingPayload());

      if (!payload.contact) {
        formNote.textContent = "Оставьте контакт, чтобы мы могли ответить.";
        formNote.classList.remove("is-success");
        return;
      }
      if (turnstileContainer && !payload.turnstile_token) {
        formNote.textContent = "Пройдите проверку и отправьте заявку ещё раз.";
        formNote.classList.remove("is-success");
        return;
      }

      if (submit) {
        submit.disabled = true;
        submit.textContent = "Отправляем...";
      }
      formNote.textContent = "Отправляем заявку...";
      formNote.classList.remove("is-success");

      fetch("/lead-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
        .then(function (response) {
          if (!response.ok) throw new Error("HTTP " + response.status);
          return response.json();
        })
        .then(function () {
          leadForm.reset();
          resetTurnstile();
          formNote.textContent = "Заявка принята. Мы свяжемся с вами и предложим спокойный следующий шаг.";
          formNote.classList.add("is-success");
        })
        .catch(function () {
          resetTurnstile();
          formNote.textContent = "Не удалось отправить заявку. Попробуйте еще раз или напишите нам напрямую.";
          formNote.classList.remove("is-success");
        })
        .finally(function () {
          if (submit) {
            submit.disabled = false;
            submit.textContent = previousText;
          }
        });
    });
  }

  function wireReveal() {
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var reveals = document.querySelectorAll(".reveal");
    if (reduce || !("IntersectionObserver" in window)) {
      reveals.forEach(function (element) {
        element.classList.add("in");
      });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -6% 0px" });

    reveals.forEach(function (element) {
      observer.observe(element);
    });

    setTimeout(function () {
      reveals.forEach(function (element) {
        element.classList.add("in");
      });
    }, 2500);
  }

  wireMobileNav();
  wireCatalogFilters();
  wireLeadForm();
  wireReveal();
})();
