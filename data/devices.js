// Второй Премиум — embedded device data fallback.
// Mirrors data/devices.json so the site still renders when fetch() is
// blocked (e.g. opening pages directly over file://). When served over
// HTTP the loader prefers the JSON file; this object is the safety net.
window.VP_DEVICES = {
  "devices": [
    {
      "id": "iphone-13-pro",
      "tags": ["iphone", "club"],
      "category": "iphone",
      "title": "iPhone 13 Pro",
      "model": "iPhone 13 Pro",
      "specs": "256 GB",
      "storage": "256 GB",
      "color": "Graphite",
      "serial": "IMEI ···4821",
      "price": 59900,
      "priceText": "59 900 ₽",
      "grade": "A−",
      "battery": "89%",
      "batteryText": "Батарея 89%",
      "metaBattery": "Батарея 89%",
      "warranty": "90 дней",
      "warrantyText": "Гарантия 90 дней",
      "exit": "до 42 000 ₽",
      "exitText": "Выход до 42 000 ₽",
      "availability": "Устройство в наличии в Store. Иллюстративная карточка прототипа.",
      "shortDescription": "256 GB · Graphite · грейд A− · батарея 89% · гарантия 90 дней · цена выхода до 42 000 ₽.",
      "headline": "iPhone 13 Pro. Не новый. Проверенный.",
      "listingImage": "assets/catalog-iphone-13-pro.webp",
      "listingAlt": "iPhone 13 Pro в графитовом цвете на светлой студийной поверхности",
      "ctaLabel": "Смотреть паспорт",
      "hasDetailPage": true,
      "visualClass": "detail-product detail-product--phone",
      "gallery": [
        { "src": "assets/device-iphone-13-main.webp", "label": "Общий вид", "alt": "iPhone 13 Pro в графитовом цвете на светлой каменной поверхности" },
        { "src": "assets/device-iphone-13-screen.webp", "label": "Экран", "alt": "Экран iPhone 13 Pro с выключенным чёрным стеклом и отражениями" },
        { "src": "assets/device-iphone-13-body.webp", "label": "Корпус", "alt": "Корпус iPhone 13 Pro крупным планом с микроследами использования" },
        { "src": "assets/device-iphone-13-defect.webp", "label": "Дефекты", "alt": "Крупный план маленькой царапины на металлическом ребре устройства" }
      ],
      "passport": {
        "summaryRows": [
          { "label": "Батарея", "value": "89%", "state": "ok" },
          { "label": "Ремонт", "value": "не вскрывался", "state": "ok" },
          { "label": "Face ID", "value": "работает", "state": "ok" },
          { "label": "Влага", "value": "следов нет", "state": "ok" }
        ],
        "repair": "не вскрывался",
        "water": "следов нет",
        "diagnostics": {
          "status": "пройдена",
          "checklist": [
            { "text": "Face ID работает", "state": "ok" },
            { "text": "Камеры проверены", "state": "ok" },
            { "text": "Динамики и микрофоны работают", "state": "ok" },
            { "text": "Wi‑Fi / Bluetooth / связь в норме", "state": "ok" },
            { "text": "Кнопки и разъём проверены", "state": "ok" },
            { "text": "Следов влаги не обнаружено", "state": "ok" }
          ]
        },
        "condition": {
          "gradeText": "грейд A−",
          "note": "Устройство в отличном состоянии, но не называется «как новое». На металлическом ребре есть небольшие следы использования, учтённые в грейде A− и цене.",
          "notes": [
            "Экран: микроцарапины видны только под углом.",
            "Корпус: небольшие следы на ребре.",
            "Функционально: без ограничений."
          ],
          "defectPhoto": "assets/device-iphone-13-defect.webp",
          "defectPhotoAlt": "Крупный план маленькой царапины на металлическом ребре устройства"
        },
        "warranty": {
          "duration": "90 дней",
          "covered": "Заявленные функции устройства: связь, экран, камеры, Face ID, разъёмы, динамики, микрофоны и базовая работоспособность.",
          "notCovered": "Механические повреждения после покупки, следы влаги после передачи, самостоятельный ремонт и нарушение условий эксплуатации."
        },
        "exitPrice": {
          "headline": "до 42 000 ₽",
          "buyToday": "59 900 ₽",
          "tradeInEstimate": "до 42 000 ₽",
          "condition": "состояние не ниже B+",
          "note": "Цена выхода не является безусловным обещанием выкупа: финальная сумма зависит от состояния, комплектации, спроса и результатов повторной диагностики."
        }
      },
      "trade": {
        "options": [
          { "value": 26000, "label": "iPhone 12 · 26 000 ₽" },
          { "value": 32000, "label": "iPhone 12 Pro · 32 000 ₽" },
          { "value": 38000, "label": "iPhone 13 · 38 000 ₽" }
        ]
      }
    },
    {
      "id": "iphone-14",
      "tags": ["iphone"],
      "category": "iphone",
      "title": "iPhone 14",
      "model": "iPhone 14",
      "specs": "128 GB",
      "storage": "128 GB",
      "color": "Starlight",
      "serial": "IMEI ···7310",
      "price": 64900,
      "priceText": "64 900 ₽",
      "grade": "A",
      "battery": "94%",
      "batteryText": "Батарея 94%",
      "metaBattery": "Батарея 94%",
      "warranty": "90 дней",
      "warrantyText": "Гарантия 90 дней",
      "exit": "до 45 000 ₽",
      "exitText": "Выход до 45 000 ₽",
      "availability": "Пример карточки. Устройство уточняется в Store.",
      "shortDescription": "128 GB · Starlight · грейд A · батарея 94% · гарантия 90 дней · цена выхода до 45 000 ₽.",
      "headline": "iPhone 14. Не новый. Проверенный.",
      "listingImage": "assets/catalog-iphone-14.webp",
      "listingAlt": "Светлый премиальный смартфон на витринной поверхности",
      "ctaLabel": "Смотреть пример",
      "hasDetailPage": false,
      "visualClass": "detail-product detail-product--phone",
      "repair": "оригинальный сервис"
    },
    {
      "id": "macbook-air-m1",
      "tags": ["macbook", "club"],
      "category": "macbook",
      "title": "MacBook Air M1",
      "model": "MacBook Air M1",
      "specs": "8 / 256 GB",
      "storage": "8 / 256 GB",
      "color": "Silver",
      "serial": "SN ···1094",
      "price": 72900,
      "priceText": "72 900 ₽",
      "grade": "B+",
      "battery": "214 циклов",
      "batteryText": "Циклы 214",
      "metaBattery": "Циклы 214",
      "warranty": "90 дней",
      "warrantyText": "Гарантия 90 дней",
      "exit": "до 49 000 ₽",
      "exitText": "Выход до 49 000 ₽",
      "availability": "Пример карточки. Устройство уточняется в Store.",
      "shortDescription": "8 / 256 GB · Silver · грейд B+ · 214 циклов · гарантия 90 дней · цена выхода до 49 000 ₽.",
      "headline": "MacBook Air M1. Не новый. Проверенный.",
      "listingImage": "assets/catalog-macbook-air.webp",
      "listingAlt": "Серебристый тонкий ноутбук на каменной витрине",
      "ctaLabel": "Смотреть пример",
      "hasDetailPage": false,
      "visualClass": "detail-product detail-product--laptop",
      "repair": "не вскрывался"
    },
    {
      "id": "ipad-air",
      "tags": ["ipad", "club"],
      "category": "ipad",
      "title": "iPad Air",
      "model": "iPad Air",
      "specs": "64 GB",
      "storage": "64 GB",
      "color": "Wi‑Fi",
      "serial": "SN ···5208",
      "price": 44900,
      "priceText": "44 900 ₽",
      "grade": "A",
      "battery": "норма",
      "batteryText": "Батарея в норме",
      "metaBattery": "Корпус A",
      "warranty": "90 дней",
      "warrantyText": "Гарантия 90 дней",
      "exit": "до 31 000 ₽",
      "exitText": "Выход до 31 000 ₽",
      "availability": "Пример карточки. Устройство уточняется в Store.",
      "shortDescription": "64 GB · Wi‑Fi · грейд A · гарантия 90 дней · цена выхода до 31 000 ₽.",
      "headline": "iPad Air. Не новый. Проверенный.",
      "listingImage": "assets/catalog-ipad-air.webp",
      "listingAlt": "Светлый планшет на минималистичной студийной поверхности",
      "ctaLabel": "Смотреть пример",
      "hasDetailPage": false,
      "visualClass": "detail-product detail-product--tablet",
      "repair": "не вскрывался"
    }
  ]
};
