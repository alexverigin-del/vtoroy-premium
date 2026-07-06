// AUTO-GENERATED fallback data for the Catalog MVP — do not edit by hand.
// Mirror of repo-root data/devices.json so apps/web builds and runs with NO
// Directus backend and NO runtime file reads. Live Directus data takes over when
// configured; this is only the fallback. Regenerate per docs/directus-catalog-mvp.md.
import type { Device } from "@vtoroy/shared";

export const fallbackDevices: Device[] = [
  {
    id: "iphone-13-pro",
    tags: ["iphone", "club"],
    category: "iphone",
    title: "iPhone 13 Pro",
    model: "iPhone 13 Pro",
    specs: "256 GB",
    storage: "256 GB",
    color: "Graphite",
    serial: "IMEI ···4821",
    price: 59900,
    priceText: "59 900 ₽",
    grade: "A−",
    battery: "89%",
    batteryText: "Батарея 89%",
    metaBattery: "Батарея 89%",
    warranty: "90 дней",
    warrantyText: "Гарантия 90 дней",
    exit: "до 42 000 ₽",
    exitText: "Ориентир выхода до 42 000 ₽",
    availability: "Устройство в наличии в Store. Карточка проверена перед публикацией.",
    shortDescription:
      "256 GB · Graphite · грейд A− · батарея 89% · гарантия 90 дней · ориентир выхода до 42 000 ₽.",
    headline: "iPhone 13 Pro. Проверен. Идёт дальше.",
    listingImage: "assets/catalog-iphone-13-pro.webp",
    listingAlt: "iPhone 13 Pro в графитовом цвете на светлой студийной поверхности",
    ctaLabel: "Проверить наличие",
    hasDetailPage: true,
    detailHref: "device/iphone-13-pro",
    visualClass: "detail-product detail-product--phone",
    gallery: [
      {
        src: "assets/device-iphone-13-main.webp",
        label: "Общий вид",
        alt: "iPhone 13 Pro в графитовом цвете на светлой каменной поверхности",
      },
      {
        src: "assets/device-iphone-13-screen.webp",
        label: "Экран",
        alt: "Экран iPhone 13 Pro с выключенным чёрным стеклом и отражениями",
      },
      {
        src: "assets/device-iphone-13-body.webp",
        label: "Корпус",
        alt: "Корпус iPhone 13 Pro крупным планом с микроследами использования",
      },
      {
        src: "assets/device-iphone-13-defect.webp",
        label: "Дефекты",
        alt: "Крупный план маленькой царапины на металлическом ребре устройства",
      },
    ],
    passport: {
      summaryRows: [
        {
          label: "Батарея",
          value: "89%",
          state: "ok",
        },
        {
          label: "Ремонт",
          value: "не вскрывался",
          state: "ok",
        },
        {
          label: "Face ID",
          value: "работает",
          state: "ok",
        },
        {
          label: "Влага",
          value: "следов нет",
          state: "ok",
        },
      ],
      repair: "не вскрывался",
      water: "следов нет",
      diagnostics: {
        status: "пройдена",
        checklist: [
          {
            text: "Face ID работает",
            state: "ok",
          },
          {
            text: "Камеры проверены",
            state: "ok",
          },
          {
            text: "Динамики и микрофоны работают",
            state: "ok",
          },
          {
            text: "Wi‑Fi / Bluetooth / связь в норме",
            state: "ok",
          },
          {
            text: "Кнопки и разъём проверены",
            state: "ok",
          },
          {
            text: "Следов влаги не обнаружено",
            state: "ok",
          },
        ],
      },
      condition: {
        gradeText: "грейд A−",
        note: "Устройство в отличном состоянии, но не называется «как новое». На металлическом ребре есть небольшие следы использования, учтённые в грейде A− и цене.",
        notes: [
          "Экран: микроцарапины видны только под углом.",
          "Корпус: небольшие следы на ребре.",
          "Функционально: без ограничений.",
        ],
        defectPhoto: "assets/device-iphone-13-defect.webp",
        defectPhotoAlt: "Крупный план маленькой царапины на металлическом ребре устройства",
      },
      story: {
        title: "Рабочий телефон из закрытого круга",
        body: "Эта вещь пришла от постоянного клиента I СВОИ: использовалась как основной рабочий телефон для встреч, поездок и деловой связи. Перед передачей данные удалены, устройство прошло диагностику, а небольшие следы на ребре уже учтены в грейде и цене.",
        facts: [
          "Один аккуратный владелец",
          "Передан после планового обновления",
          "История без сервисного вскрытия",
        ],
      },
      warranty: {
        duration: "90 дней",
        covered:
          "Заявленные функции устройства: связь, экран, камеры, Face ID, разъёмы, динамики, микрофоны и базовая работоспособность.",
        notCovered:
          "Механические повреждения после покупки, следы влаги после передачи, самостоятельный ремонт и нарушение условий эксплуатации.",
      },
      exitPrice: {
        headline: "до 42 000 ₽",
        buyToday: "59 900 ₽",
        tradeInEstimate: "до 42 000 ₽",
        condition: "состояние не ниже B+",
        note: "Ориентир выхода не является безусловным обещанием выкупа: финальная сумма зависит от состояния, комплектации, спроса и результатов повторной диагностики.",
      },
    },
    trade: {
      options: [
        {
          value: 26000,
          label: "iPhone 12 · 26 000 ₽",
        },
        {
          value: 32000,
          label: "iPhone 12 Pro · 32 000 ₽",
        },
        {
          value: 38000,
          label: "iPhone 13 · 38 000 ₽",
        },
      ],
    },
  },
  {
    id: "iphone-14",
    tags: ["iphone"],
    category: "iphone",
    title: "iPhone 14",
    model: "iPhone 14",
    specs: "128 GB",
    storage: "128 GB",
    color: "Starlight",
    serial: "IMEI ···7310",
    price: 64900,
    priceText: "64 900 ₽",
    grade: "A",
    battery: "94%",
    batteryText: "Батарея 94%",
    metaBattery: "Батарея 94%",
    warranty: "90 дней",
    warrantyText: "Гарантия 90 дней",
    exit: "до 45 000 ₽",
    exitText: "Ориентир выхода до 45 000 ₽",
    availability: "Устройство в наличии в Store. Карточка проверена перед публикацией.",
    shortDescription:
      "128 GB · Starlight · грейд A · батарея 94% · гарантия 90 дней · ориентир выхода до 45 000 ₽.",
    headline: "iPhone 14. Проверен. Идёт дальше.",
    listingImage: "assets/catalog-iphone-14.webp",
    listingAlt: "Светлый премиальный смартфон на витринной поверхности",
    ctaLabel: "Проверить наличие",
    hasDetailPage: true,
    detailHref: "device/iphone-14",
    visualClass: "detail-product detail-product--phone",
    gallery: [
      {
        src: "assets/catalog-iphone-14.webp",
        label: "Общий вид",
        alt: "iPhone 14 Starlight на светлой витринной поверхности",
      },
      {
        src: "assets/device-iphone-14-screen.webp",
        label: "Экран",
        alt: "Экран iPhone 14 с выключенным чёрным стеклом и отражениями",
      },
      {
        src: "assets/device-iphone-14-body.webp",
        label: "Корпус",
        alt: "Корпус iPhone 14 Starlight крупным планом с микроследами использования",
      },
      {
        src: "assets/device-iphone-14-defect.webp",
        label: "Дефекты",
        alt: "Крупный план кромки корпуса iPhone 14 с минимальными следами использования",
      },
    ],
    passport: {
      summaryRows: [
        {
          label: "Батарея",
          value: "94%",
          state: "ok",
        },
        {
          label: "Ремонт",
          value: "оригинальный сервис",
          state: "ok",
        },
        {
          label: "Face ID",
          value: "работает",
          state: "ok",
        },
        {
          label: "Влага",
          value: "следов нет",
          state: "ok",
        },
      ],
      repair: "оригинальный сервис",
      water: "следов нет",
      diagnostics: {
        status: "пройдена",
        checklist: [
          {
            text: "Face ID работает",
            state: "ok",
          },
          {
            text: "Камеры проверены",
            state: "ok",
          },
          {
            text: "Динамики и микрофоны работают",
            state: "ok",
          },
          {
            text: "Wi‑Fi / Bluetooth / связь в норме",
            state: "ok",
          },
          {
            text: "Кнопки и разъём проверены",
            state: "ok",
          },
          {
            text: "Следов влаги не обнаружено",
            state: "ok",
          },
        ],
      },
      condition: {
        gradeText: "грейд A",
        note: "Устройство в почти безупречном состоянии. Обслуживалось в оригинальном сервисе, следов вскрытия нет. Корпус и экран без значимых повреждений.",
        notes: [
          "Экран: без царапин при обычном освещении.",
          "Корпус: без вмятин и сколов.",
          "Функционально: без ограничений.",
        ],
        defectPhoto: "assets/device-iphone-14-defect.webp",
        defectPhotoAlt:
          "Крупный план кромки корпуса iPhone 14 с минимальными следами использования",
      },
      story: {
        title: "Телефон после аккуратного апгрейда",
        body: "iPhone перешёл в I СВОИ после планового обновления на свежую модель. Им пользовались бережно: без ремонта, без следов влаги и без спорных сервисных вмешательств. Поэтому история вещи короткая и понятная: покупка, аккуратное использование, проверка, новая карточка в Store.",
        facts: [
          "Плановый апгрейд владельца",
          "Оригинальная история обслуживания",
          "Без скрытых сервисных работ",
        ],
      },
      warranty: {
        duration: "90 дней",
        covered:
          "Заявленные функции устройства: связь, экран, камеры, Face ID, разъёмы, динамики, микрофоны и базовая работоспособность.",
        notCovered:
          "Механические повреждения после покупки, следы влаги после передачи, самостоятельный ремонт и нарушение условий эксплуатации.",
      },
      exitPrice: {
        headline: "до 45 000 ₽",
        buyToday: "64 900 ₽",
        tradeInEstimate: "до 45 000 ₽",
        condition: "состояние не ниже B+",
        note: "Ориентир выхода не является безусловным обещанием выкупа: финальная сумма зависит от состояния, комплектации, спроса и результатов повторной диагностики.",
      },
    },
    trade: {
      options: [
        {
          value: 30000,
          label: "iPhone 12 · 30 000 ₽",
        },
        {
          value: 38000,
          label: "iPhone 13 · 38 000 ₽",
        },
        {
          value: 44000,
          label: "iPhone 13 Pro · 44 000 ₽",
        },
      ],
    },
  },
  {
    id: "macbook-air-m1",
    tags: ["macbook", "club"],
    category: "macbook",
    title: "MacBook Air M1",
    model: "MacBook Air M1",
    specs: "8 / 256 GB",
    storage: "8 / 256 GB",
    color: "Silver",
    serial: "SN ···1094",
    price: 72900,
    priceText: "72 900 ₽",
    grade: "B+",
    battery: "214 циклов",
    batteryText: "Циклы 214",
    metaBattery: "Циклы 214",
    warranty: "90 дней",
    warrantyText: "Гарантия 90 дней",
    exit: "до 49 000 ₽",
    exitText: "Ориентир выхода до 49 000 ₽",
    availability: "Устройство в наличии в Store. Карточка проверена перед публикацией.",
    shortDescription:
      "8 / 256 GB · Silver · грейд B+ · 214 циклов · гарантия 90 дней · ориентир выхода до 49 000 ₽.",
    headline: "MacBook Air M1. Проверен. Идёт дальше.",
    listingImage: "assets/catalog-macbook-air.webp",
    listingAlt: "Серебристый тонкий ноутбук на каменной витрине",
    ctaLabel: "Проверить наличие",
    hasDetailPage: true,
    detailHref: "device/macbook-air-m1",
    visualClass: "detail-product detail-product--laptop",
    gallery: [
      {
        src: "assets/catalog-macbook-air.webp",
        label: "Общий вид",
        alt: "Серебристый MacBook Air M1 на каменной витрине",
      },
      {
        src: "assets/device-macbook-air-screen.webp",
        label: "Экран",
        alt: "Экран MacBook Air M1 с выключенной матовой матрицей и отражениями",
      },
      {
        src: "assets/device-macbook-air-body.webp",
        label: "Корпус",
        alt: "Корпус MacBook Air M1 крупным планом с лёгкими следами эксплуатации",
      },
      {
        src: "assets/device-macbook-air-defect.webp",
        label: "Дефекты",
        alt: "Крупный план потёртости на нижней крышке MacBook Air M1",
      },
    ],
    passport: {
      summaryRows: [
        {
          label: "Циклы АКБ",
          value: "214",
          state: "ok",
        },
        {
          label: "Ремонт",
          value: "не вскрывался",
          state: "ok",
        },
        {
          label: "Клавиатура",
          value: "работает",
          state: "ok",
        },
        {
          label: "Влага",
          value: "следов нет",
          state: "ok",
        },
      ],
      repair: "не вскрывался",
      water: "следов нет",
      diagnostics: {
        status: "пройдена",
        checklist: [
          {
            text: "Клавиатура и трекпад работают",
            state: "ok",
          },
          {
            text: "Экран без битых пикселей",
            state: "ok",
          },
          {
            text: "Динамики и микрофоны работают",
            state: "ok",
          },
          {
            text: "Wi‑Fi / Bluetooth в норме",
            state: "ok",
          },
          {
            text: "Порты и зарядка проверены",
            state: "ok",
          },
          {
            text: "Следов влаги не обнаружено",
            state: "ok",
          },
        ],
      },
      condition: {
        gradeText: "грейд B+",
        note: "Рабочий ноутбук с аккуратными следами эксплуатации. 214 циклов батареи, состояние корпуса хорошее. Грейд B+ и цена это учитывают.",
        notes: [
          "Экран: без царапин и засветов.",
          "Корпус: лёгкие потёртости на дне.",
          "Батарея: 214 циклов, ёмкость в норме.",
        ],
        defectPhoto: "assets/device-macbook-air-defect.webp",
        defectPhotoAlt: "Крупный план потёртости на нижней крышке MacBook Air M1",
      },
      story: {
        title: "Ноутбук для поездок и документов",
        body: "MacBook использовался как лёгкий рабочий ноутбук: документы, переговоры, поездки и ежедневная связь. Следы на нижней крышке честно вынесены в грейд B+, зато экран, клавиатура, трекпад и батарея прошли проверку без замечаний.",
        facts: ["Рабочая история без ремонта", "214 циклов батареи", "Следы корпуса учтены в цене"],
      },
      warranty: {
        duration: "90 дней",
        covered:
          "Заявленные функции устройства: экран, клавиатура, трекпад, порты, динамики, микрофоны, Wi‑Fi и базовая работоспособность.",
        notCovered:
          "Механические повреждения после покупки, следы влаги после передачи, самостоятельный ремонт и нарушение условий эксплуатации.",
      },
      exitPrice: {
        headline: "до 49 000 ₽",
        buyToday: "72 900 ₽",
        tradeInEstimate: "до 49 000 ₽",
        condition: "состояние не ниже B",
        note: "Ориентир выхода не является безусловным обещанием выкупа: финальная сумма зависит от состояния, числа циклов, спроса и результатов повторной диагностики.",
      },
    },
    trade: {
      options: [
        {
          value: 30000,
          label: "MacBook Air 2019 · 30 000 ₽",
        },
        {
          value: 42000,
          label: "MacBook Air M1 (B) · 42 000 ₽",
        },
        {
          value: 52000,
          label: "MacBook Pro 13 M1 · 52 000 ₽",
        },
      ],
    },
  },
  {
    id: "ipad-air",
    tags: ["ipad", "club"],
    category: "ipad",
    title: "iPad Air",
    model: "iPad Air",
    specs: "64 GB",
    storage: "64 GB",
    color: "Wi‑Fi",
    serial: "SN ···5208",
    price: 44900,
    priceText: "44 900 ₽",
    grade: "A",
    battery: "норма",
    batteryText: "Батарея в норме",
    metaBattery: "Корпус A",
    warranty: "90 дней",
    warrantyText: "Гарантия 90 дней",
    exit: "до 31 000 ₽",
    exitText: "Ориентир выхода до 31 000 ₽",
    availability: "Устройство в наличии в Store. Карточка проверена перед публикацией.",
    shortDescription: "64 GB · Wi‑Fi · грейд A · гарантия 90 дней · ориентир выхода до 31 000 ₽.",
    headline: "iPad Air. Проверен. Идёт дальше.",
    listingImage: "assets/catalog-ipad-air.webp",
    listingAlt: "Светлый планшет на минималистичной студийной поверхности",
    ctaLabel: "Проверить наличие",
    hasDetailPage: true,
    detailHref: "device/ipad-air",
    visualClass: "detail-product detail-product--tablet",
    gallery: [
      {
        src: "assets/catalog-ipad-air.webp",
        label: "Общий вид",
        alt: "iPad Air на минималистичной студийной поверхности",
      },
      {
        src: "assets/device-ipad-air-screen.webp",
        label: "Экран",
        alt: "Экран iPad Air с выключенным чёрным стеклом и отражениями",
      },
      {
        src: "assets/device-ipad-air-body.webp",
        label: "Корпус",
        alt: "Корпус iPad Air крупным планом с минимальными следами использования",
      },
      {
        src: "assets/device-ipad-air-defect.webp",
        label: "Дефекты",
        alt: "Крупный план кромки корпуса iPad Air с небольшим следом использования",
      },
    ],
    passport: {
      summaryRows: [
        {
          label: "Батарея",
          value: "в норме",
          state: "ok",
        },
        {
          label: "Ремонт",
          value: "не вскрывался",
          state: "ok",
        },
        {
          label: "Touch ID",
          value: "работает",
          state: "ok",
        },
        {
          label: "Влага",
          value: "следов нет",
          state: "ok",
        },
      ],
      repair: "не вскрывался",
      water: "следов нет",
      diagnostics: {
        status: "пройдена",
        checklist: [
          {
            text: "Touch ID работает",
            state: "ok",
          },
          {
            text: "Камеры проверены",
            state: "ok",
          },
          {
            text: "Динамики и микрофоны работают",
            state: "ok",
          },
          {
            text: "Wi‑Fi / Bluetooth в норме",
            state: "ok",
          },
          {
            text: "Сенсор и кнопки проверены",
            state: "ok",
          },
          {
            text: "Следов влаги не обнаружено",
            state: "ok",
          },
        ],
      },
      condition: {
        gradeText: "грейд A",
        note: "Планшет в отличном состоянии. Корпус грейда A, экран без значимых дефектов, аккумулятор в норме.",
        notes: [
          "Экран: без царапин при обычном освещении.",
          "Корпус: без вмятин и сколов.",
          "Функционально: без ограничений.",
        ],
        defectPhoto: "assets/device-ipad-air-defect.webp",
        defectPhotoAlt: "Крупный план кромки корпуса iPad Air с небольшим следом использования",
      },
      story: {
        title: "Домашний планшет с понятным сценарием",
        body: "iPad был домашним устройством для чтения, видео и поездок, без тяжёлых рабочих нагрузок и спорного ремонта. Перед публикацией его проверили по экрану, Touch ID, камерам, динамикам и зарядке, а небольшой след на кромке зафиксировали отдельно.",
        facts: [
          "Домашний сценарий использования",
          "Touch ID и экран проверены",
          "Нюанс корпуса раскрыт заранее",
        ],
      },
      warranty: {
        duration: "90 дней",
        covered:
          "Заявленные функции устройства: экран, Touch ID, камеры, разъёмы, динамики, микрофоны, Wi‑Fi и базовая работоспособность.",
        notCovered:
          "Механические повреждения после покупки, следы влаги после передачи, самостоятельный ремонт и нарушение условий эксплуатации.",
      },
      exitPrice: {
        headline: "до 31 000 ₽",
        buyToday: "44 900 ₽",
        tradeInEstimate: "до 31 000 ₽",
        condition: "состояние не ниже B+",
        note: "Ориентир выхода не является безусловным обещанием выкупа: финальная сумма зависит от состояния, комплектации, спроса и результатов повторной диагностики.",
      },
    },
    trade: {
      options: [
        {
          value: 16000,
          label: "iPad 9 · 16 000 ₽",
        },
        {
          value: 22000,
          label: "iPad Air 3 · 22 000 ₽",
        },
        {
          value: 28000,
          label: "iPad Pro 11 (2020) · 28 000 ₽",
        },
      ],
    },
  },
] as Device[];
