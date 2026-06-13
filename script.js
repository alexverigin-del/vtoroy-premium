// Второй Премиум — interactions
(function () {
  'use strict';

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

  // Prototype lead form: show a clear success state without sending data.
  var leadForm = document.getElementById('leadForm');
  var formNote = document.getElementById('formNote');
  if (leadForm && formNote) {
    leadForm.addEventListener('submit', function (event) {
      event.preventDefault();
      formNote.textContent = 'Заявка в прототипе не отправляется. Для реального запуска подключите CRM, Telegram-бота или форму записи.';
      formNote.classList.add('is-success');
    });
  }

  // Main site prototype: catalog filters + interactive device detail.
  var devices = {
    'iphone-13-pro': {
      title: 'iPhone 13 Pro',
      sub: '256 GB · Graphite · IMEI ···4821',
      price: 59900,
      priceText: '59 900 ₽',
      grade: 'A−',
      battery: '89%',
      batteryText: 'Батарея 89%',
      exitText: 'до 42 000 ₽',
      repair: 'не вскрывался',
      visualClass: 'detail-product detail-product--phone'
    },
    'iphone-14': {
      title: 'iPhone 14',
      sub: '128 GB · Starlight · IMEI ···7310',
      price: 64900,
      priceText: '64 900 ₽',
      grade: 'A',
      battery: '94%',
      batteryText: 'Батарея 94%',
      exitText: 'до 45 000 ₽',
      repair: 'оригинальный сервис',
      visualClass: 'detail-product detail-product--phone'
    },
    'macbook-air-m1': {
      title: 'MacBook Air M1',
      sub: '8 / 256 GB · Silver · SN ···1094',
      price: 72900,
      priceText: '72 900 ₽',
      grade: 'B+',
      battery: '214 циклов',
      batteryText: 'Циклы 214',
      exitText: 'до 49 000 ₽',
      repair: 'не вскрывался',
      visualClass: 'detail-product detail-product--laptop'
    },
    'ipad-air': {
      title: 'iPad Air',
      sub: '64 GB · Wi‑Fi · SN ···5208',
      price: 44900,
      priceText: '44 900 ₽',
      grade: 'A',
      battery: 'норма',
      batteryText: 'Батарея в норме',
      exitText: 'до 31 000 ₽',
      repair: 'не вскрывался',
      visualClass: 'detail-product detail-product--tablet'
    }
  };

  var selectedDevice = devices['iphone-13-pro'];

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

  function openDevice(id) {
    var device = devices[id] || devices['iphone-13-pro'];
    selectedDevice = device;

    var map = {
      detailTitle: device.title,
      detailSub: device.sub,
      detailPrice: device.priceText,
      detailGrade: 'Грейд ' + device.grade,
      detailBattery: device.batteryText,
      detailExit: device.exitText,
      passportDevice: device.title,
      passportSub: device.sub + ' · проверка пройдена',
      passportGrade: device.grade,
      passportBattery: device.battery,
      passportRepair: device.repair,
      passportExit: device.exitText
    };
    Object.keys(map).forEach(function (key) {
      var el = document.getElementById(key);
      if (el) el.textContent = map[key];
    });

    var detailVisual = document.getElementById('detailVisual');
    if (detailVisual) {
      detailVisual.innerHTML = '';
      var product = document.createElement('div');
      product.className = device.visualClass;
      detailVisual.appendChild(product);
    }

    updateTopup();
    var section = document.getElementById('device-detail');
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  document.querySelectorAll('[data-open-device]').forEach(function (button) {
    button.addEventListener('click', function () {
      openDevice(button.getAttribute('data-open-device'));
    });
  });

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

  var oldDeviceSelect = document.getElementById('oldDevice');
  if (oldDeviceSelect) oldDeviceSelect.addEventListener('change', updateTopup);
  updateTopup();

  // Device page gallery.
  var galleryImage = document.getElementById('deviceGalleryImage');
  if (galleryImage) {
    document.querySelectorAll('[data-gallery-src]').forEach(function (thumb) {
      thumb.addEventListener('click', function () {
        galleryImage.src = thumb.getAttribute('data-gallery-src');
        galleryImage.alt = thumb.getAttribute('data-gallery-alt') || '';
        document.querySelectorAll('[data-gallery-src]').forEach(function (item) { item.classList.remove('is-active'); });
        thumb.classList.add('is-active');
      });
    });
  }

  // Scroll reveal
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var reveals = document.querySelectorAll('.reveal');
  if (reduce || !('IntersectionObserver' in window)) {
    reveals.forEach(function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });
    reveals.forEach(function (el) { io.observe(el); });
    // Safety net: never leave content hidden if the observer is bypassed.
    setTimeout(function () {
      reveals.forEach(function (el) { el.classList.add('in'); });
    }, 2500);
  }
})();
