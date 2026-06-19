// ISVOI managed-page interactions.
(function () {
  "use strict";

  function byId(id) {
    return document.getElementById(id);
  }

  function text(value) {
    return value == null ? "" : String(value);
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
    var grid = byId("catalogGrid");
    if (!grid) return;

    document.querySelectorAll(".filter-chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        var filter = chip.getAttribute("data-filter") || "all";

        document.querySelectorAll(".filter-chip").forEach(function (item) {
          item.classList.remove("is-active");
        });
        chip.classList.add("is-active");

        grid.querySelectorAll(".device-card").forEach(function (card) {
          var type = card.getAttribute("data-type") || "";
          card.hidden = filter !== "all" && type.indexOf(filter) === -1;
        });
      });
    });
  }

  function wireLeadForm() {
    var leadForm = byId("leadForm");
    var formNote = byId("formNote");
    if (!leadForm || !formNote) return;

    leadForm.addEventListener("submit", function (event) {
      event.preventDefault();

      var submit = leadForm.querySelector('[type="submit"]');
      var previousText = submit ? submit.textContent : "";
      var formData = new FormData(leadForm);
      var payload = {
        scenario: text(formData.get("scenario")),
        device: text(formData.get("device")),
        contact: text(formData.get("contact")),
        source: window.location.pathname || "/",
        website: text(formData.get("website"))
      };

      if (!payload.contact) {
        formNote.textContent = "Оставьте контакт, чтобы мы могли ответить.";
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
          formNote.textContent = "Заявка принята. Мы свяжемся с вами и предложим спокойный следующий шаг.";
          formNote.classList.add("is-success");
        })
        .catch(function () {
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
