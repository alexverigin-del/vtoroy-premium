// ISVOI — interactions
(function () {
  'use strict';

  // Path prefix from site root to the current page (""/"../"/"../../").
  // Declared per page via <body data-base-path="..">. Used to resolve the
  // root-relative asset/link paths stored in the device data.
  var BASE = document.body.getAttribute('data-base-path') || '';
  function resolve(path) {
    if (!path) return path;
    return BASE + path;
  }

  // Mobile nav toggle
  var toggle = document.getElementById('navToggle');
  var links = document.getElementById('navLinks');
  if (toggle && links) {
    toggle.addEventListener('click', function () {
      var open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    // Close menu after clicking a link
    links.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        links.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Lead form: send to the Next.js API. The API writes to Directus when a
  // create-only token is configured, otherwise to a private JSONL server log.
  var leadForm = document.getElementById('leadForm');
  var formNote = document.getElementById('formNote');
  if (leadForm && formNote) {
    leadForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var submit = leadForm.querySelector('[type="submit"]');
      var previousText = submit ? submit.textContent : '';
      var formData = new FormData(leadForm);
      var payload = {
        scenario: formData.get('scenario') || '',
        device: formData.get('device') || '',
        contact: formData.get('contact') || '',
        source: window.location.pathname || '/',
        website: formData.get('website') || ''
      };

      if (!payload.contact) {
        formNote.textContent = 'Оставьте контакт, чтобы мы могли ответить.';
        formNote.classList.remove('is-success');
        return;
      }

      if (submit) {
        submit.disabled = true;
        submit.textContent = 'Отправляем...';
      }
      formNote.textContent = 'Отправляем заявку...';
      formNote.classList.remove('is-success');

      fetch('/lead-intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(function () {
          leadForm.reset();
          formNote.textContent = 'Заявка принята. Мы свяжемся с вами и предложим спокойный следующий шаг.';
          formNote.classList.add('is-success');
        })
        .catch(function () {
          formNote.textContent = 'Не удалось отправить заявку. Попробуйте ещё раз или напишите нам напрямую.';
          formNote.classList.remove('is-success');
        })
        .finally(function () {
          if (submit) {
            submit.disabled = false;
            submit.textContent = previousText;
          }
        });
    });
  }

  // --- Device data loading ---------------------------------------------
  // Prefer the structured JSON file when served over HTTP. Fall back to the
  // embedded window.VP_DEVICES object (data/devices.js) when fetch is blocked
  // (e.g. opening pages over file://). Either way we end up with a list.
  function needsDevices() {
    return !!(document.getElementById('catalogGrid') ||
              document.getElementById('productPage'));
  }

  function loadDevices() {
    var embedded = (window.VP_DEVICES && window.VP_DEVICES.devices) || null;
    // Pages without a catalog grid or product host (Store, Trade, Club,
    // Passport) never consume the device list — skip the fetch so we don't
    // log a spurious 404 for a data file they don't need.
    if (!needsDevices()) {
      return Promise.resolve(embedded || []);
    }
    if (!('fetch' in window) || location.protocol === 'file:') {
      return Promise.resolve(embedded || []);
    }
    return fetch(resolve('data/devices.json'))
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (json) {
        return (json && json.devices) || embedded || [];
      })
      .catch(function () {
        return embedded || [];
      });
  }

  function indexById(list) {
    var map = {};
    list.forEach(function (d) { map[d.id] = d; });
    return map;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  // --- Catalog rendering ------------------------------------------------
  function buildCard(device) {
    var article = el('article', 'device-card');
    article.setAttribute('data-device', device.id);
    article.setAttribute('data-type', (device.tags || []).join(' '));

    var media = el('div', 'device-card__media device-card__media--photo');
    var img = el('img');
    img.src = resolve(device.listingImage);
    img.alt = device.listingAlt || device.title;
    img.loading = 'lazy';
    media.appendChild(img);

    var body = el('div', 'device-card__body');

    var top = el('div', 'device-card__top');
    var titleWrap = el('div');
    titleWrap.appendChild(el('h3', null, device.title));
    titleWrap.appendChild(el('p', null, [device.specs, device.color].filter(Boolean).join(' · ')));
    top.appendChild(titleWrap);
    top.appendChild(el('span', 'grade-mini', device.grade));
    body.appendChild(top);

    var meta = el('div', 'device-card__meta');
    meta.appendChild(el('span', null, device.metaBattery || device.batteryText));
    meta.appendChild(el('span', null, device.warrantyText || ('Гарантия ' + device.warranty)));
    meta.appendChild(el('span', null, device.exitText || ('Выход ' + device.exit)));
    body.appendChild(meta);

    body.appendChild(el('div', 'device-card__price', device.priceText));

    // Every card navigates to a product page: the device's own page when it
    // has one, otherwise the iPhone 13 Pro page as the shared example target.
    var link = el('a', 'btn btn--outlined device-card__cta', device.ctaLabel || 'Смотреть паспорт');
    link.href = resolve(device.hasDetailPage
      ? (device.detailHref || ('device/' + device.id + '/index.html'))
      : 'device/iphone-13-pro/index.html');
    body.appendChild(link);

    article.appendChild(media);
    article.appendChild(body);
    return article;
  }

  function renderCatalog(list) {
    var grid = document.getElementById('catalogGrid');
    if (!grid) return;
    grid.innerHTML = '';
    list.forEach(function (device) { grid.appendChild(buildCard(device)); });
  }

  // --- Index in-page device detail + trade calculator -------------------
  var selectedDevice = null;

  function formatRub(value) {
    var safe = Math.max(0, value);
    return 'от ' + safe.toLocaleString('ru-RU') + ' ₽';
  }

  function updateTopup() {
    var oldDevice = document.getElementById('oldDevice');
    var topupResult = document.getElementById('topupResult');
    if (!oldDevice || !topupResult || !selectedDevice) return;
    topupResult.textContent = formatRub(selectedDevice.price - Number(oldDevice.value || 0));
  }

  // --- Product (detail) page rendering ----------------------------------
  function renderGallery(device) {
    var mainImg = document.getElementById('deviceGalleryImage');
    var thumbsWrap = document.getElementById('deviceGalleryThumbs');
    if (!mainImg || !thumbsWrap || !device.gallery || !device.gallery.length) return;

    var first = device.gallery[0];
    mainImg.src = resolve(first.src);
    mainImg.alt = first.alt || device.title;

    thumbsWrap.innerHTML = '';
    device.gallery.forEach(function (shot, i) {
      var btn = el('button', 'thumb' + (i === 0 ? ' is-active' : ''), shot.label);
      btn.type = 'button';
      btn.setAttribute('data-gallery-src', resolve(shot.src));
      btn.setAttribute('data-gallery-alt', shot.alt || '');
      btn.addEventListener('click', function () {
        mainImg.src = btn.getAttribute('data-gallery-src');
        mainImg.alt = btn.getAttribute('data-gallery-alt') || '';
        thumbsWrap.querySelectorAll('.thumb').forEach(function (t) { t.classList.remove('is-active'); });
        btn.classList.add('is-active');
      });
      thumbsWrap.appendChild(btn);
    });
  }

  function setText(id, value) {
    var node = document.getElementById(id);
    if (node && value != null) node.textContent = value;
  }

  function renderProduct(device) {
    if (!device) return;
    var sub = [device.specs, device.color, device.serial].filter(Boolean).join(' · ');
    var p = device.passport || {};

    document.title = device.title + ' с ISVOI Passport — ISVOI';

    setText('productBreadcrumb', 'Store / ' + device.title);
    setText('productHeadline', device.headline || (device.title + '. Проверен. Идёт дальше.'));
    setText('productLead', device.shortDescription);
    setText('productPrice', device.priceText);
    setText('productAvailability', device.availability);

    // Chips
    var chips = document.getElementById('productChips');
    if (chips) {
      chips.innerHTML = '';
      chips.appendChild(el('span', null, 'Грейд ' + device.grade));
      chips.appendChild(el('span', null, device.batteryText));
      chips.appendChild(el('span', null, 'Гарантия ' + device.warranty));
    }
    setText('productExitChip', device.exit);

    renderGallery(device);

    // Passport summary panel
    setText('passportDevice', device.title);
    setText('passportSub', sub);
    setText('passportGrade', device.grade);
    var rowsWrap = document.getElementById('passportRows');
    if (rowsWrap && p.summaryRows) {
      rowsWrap.innerHTML = '';
      p.summaryRows.forEach(function (row) {
        var prow = el('div', 'prow');
        var lbl = el('span', 'lbl');
        lbl.appendChild(el('span', 'dot dot--' + (row.state || 'ok')));
        lbl.appendChild(document.createTextNode(row.label));
        prow.appendChild(lbl);
        prow.appendChild(el('span', 'val' + (row.state === 'ok' ? ' val--ok' : ''), row.value));
        rowsWrap.appendChild(prow);
      });
    }
    setText('passportExit', device.exit);

    // Trade calculator
    var oldDevice = document.getElementById('oldDevice');
    if (oldDevice && device.trade && device.trade.options) {
      oldDevice.innerHTML = '';
      device.trade.options.forEach(function (opt) {
        var o = el('option', null, opt.label);
        o.value = opt.value;
        oldDevice.appendChild(o);
      });
    }
    setText('tradeTarget', 'Доплата до ' + device.title);

    // Full passport accordion
    var diag = p.diagnostics || {};
    setText('passportDiagStatus', diag.status);
    var checkGrid = document.getElementById('passportCheckGrid');
    if (checkGrid && diag.checklist) {
      checkGrid.innerHTML = '';
      diag.checklist.forEach(function (item) {
        var cell = el('div');
        cell.appendChild(el('span', 'dot dot--' + (item.state || 'ok')));
        cell.appendChild(document.createTextNode(item.text));
        checkGrid.appendChild(cell);
      });
    }

    var cond = p.condition || {};
    setText('passportConditionGrade', cond.gradeText || ('грейд ' + device.grade));
    setText('passportConditionNote', cond.note);
    var condList = document.getElementById('passportConditionList');
    if (condList && cond.notes) {
      condList.innerHTML = '';
      cond.notes.forEach(function (n) { condList.appendChild(el('li', null, n)); });
    }
    var defectImg = document.getElementById('passportDefectPhoto');
    if (defectImg && cond.defectPhoto) {
      defectImg.src = resolve(cond.defectPhoto);
      defectImg.alt = cond.defectPhotoAlt || '';
    }

    var warr = p.warranty || {};
    setText('passportWarrantyDuration', warr.duration || device.warranty);
    setText('passportWarrantyCovered', warr.covered);
    setText('passportWarrantyNotCovered', warr.notCovered);

    var exit = p.exitPrice || {};
    setText('passportExitHeadline', exit.headline || device.exit);
    setText('passportExitBuyToday', exit.buyToday || device.priceText);
    setText('passportExitTradeIn', exit.tradeInEstimate || device.exit);
    setText('passportExitCondition', exit.condition);
    setText('passportExitNote', exit.note);

    // Wire trade calculator with this device as the target.
    selectedDevice = device;
    updateTopup();
  }

  // --- Wire up after data loads ----------------------------------------
  function wireFilters() {
    document.querySelectorAll('.filter-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        var filter = chip.getAttribute('data-filter');
        document.querySelectorAll('.filter-chip').forEach(function (item) { item.classList.remove('is-active'); });
        chip.classList.add('is-active');
        document.querySelectorAll('.device-card').forEach(function (card) {
          var type = card.getAttribute('data-type') || '';
          card.hidden = filter !== 'all' && type.indexOf(filter) === -1;
        });
      });
    });
  }

  loadDevices().then(function (list) {
    var byId = indexById(list);

    // Catalog pages (index preview + full catalog).
    if (document.getElementById('catalogGrid')) {
      renderCatalog(list);
      wireFilters();
    }

    // Product detail page.
    var productHost = document.getElementById('productPage');
    if (productHost) {
      var pid = productHost.getAttribute('data-device-id');
      renderProduct(byId[pid] || byId['iphone-13-pro']);
    }

    var oldDeviceSelect = document.getElementById('oldDevice');
    if (oldDeviceSelect) oldDeviceSelect.addEventListener('change', updateTopup);
    updateTopup();
  });

  // Scroll reveal (independent of data load)
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var reveals = document.querySelectorAll('.reveal');
  if (reduce || !('IntersectionObserver' in window)) {
    reveals.forEach(function (elm) { elm.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });
    reveals.forEach(function (elm) { io.observe(elm); });
    setTimeout(function () {
      reveals.forEach(function (elm) { elm.classList.add('in'); });
    }, 2500);
  }
})();

// Lead form override for the Next.js-rendered homepage. Kept outside the legacy
// interaction bundle so the user-facing messages stay valid UTF-8.
(function () {
  'use strict';

  var leadForm = document.getElementById('leadForm');
  var formNote = document.getElementById('formNote');
  if (!leadForm || !formNote) return;

  leadForm.addEventListener('submit', function (event) {
    event.preventDefault();
    event.stopImmediatePropagation();

    var submit = leadForm.querySelector('[type="submit"]');
    var previousText = submit ? submit.textContent : '';
    var formData = new FormData(leadForm);
    var payload = {
      scenario: formData.get('scenario') || '',
      device: formData.get('device') || '',
      contact: formData.get('contact') || '',
      source: window.location.pathname || '/',
      website: formData.get('website') || ''
    };

    if (!payload.contact) {
      formNote.textContent = 'Оставьте контакт, чтобы мы могли ответить.';
      formNote.classList.remove('is-success');
      return;
    }

    if (submit) {
      submit.disabled = true;
      submit.textContent = 'Отправляем...';
    }
    formNote.textContent = 'Отправляем заявку...';
    formNote.classList.remove('is-success');

    fetch('/lead-intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function () {
        leadForm.reset();
        formNote.textContent = 'Заявка принята. Мы свяжемся с вами и предложим спокойный следующий шаг.';
        formNote.classList.add('is-success');
      })
      .catch(function () {
        formNote.textContent = 'Не удалось отправить заявку. Попробуйте ещё раз или напишите нам напрямую.';
        formNote.classList.remove('is-success');
      })
      .finally(function () {
        if (submit) {
          submit.disabled = false;
          submit.textContent = previousText;
        }
      });
  }, true);
})();
