#!/usr/bin/env node
/**
 * Rehearse the real Directus blog workflow with an Editor-scoped token.
 *
 * Required env:
 *   DIRECTUS_EDITOR_TOKEN
 *   BLOG_WORK_FOLDER_ID
 *   BLOG_EDITORIAL_FOLDER_ID
 *
 * Optional env:
 *   DIRECTUS_URL=http://127.0.0.1:8055
 *   BLOG_GROWTH_PHASE=prepare|promote|schedule|finalize|audit
 */

import process from "node:process";

const endpoint = (process.env.DIRECTUS_URL || "http://127.0.0.1:8055").replace(/\/+$/, "");
const token = (process.env.DIRECTUS_EDITOR_TOKEN || "").trim();
const workFolder = (process.env.BLOG_WORK_FOLDER_ID || "").trim();
const editorialFolder = (process.env.BLOG_EDITORIAL_FOLDER_ID || "").trim();
const phase = (process.env.BLOG_GROWTH_PHASE || "audit").trim().toLowerCase();
const uuidPattern = /^[0-9a-f-]{36}$/i;

if (!token) throw new Error("DIRECTUS_EDITOR_TOKEN is required.");
if (!new Set(["prepare", "promote", "schedule", "finalize", "audit"]).has(phase)) {
  throw new Error("BLOG_GROWTH_PHASE must be prepare, promote, schedule, finalize or audit.");
}
if (["prepare", "promote"].includes(phase)) {
  if (!uuidPattern.test(workFolder) || !uuidPattern.test(editorialFolder)) {
    throw new Error("BLOG_WORK_FOLDER_ID and BLOG_EDITORIAL_FOLDER_ID must be Directus UUIDs.");
  }
}

const VERSION_KEY = "structured-editorial-qa-2026-07-19";
const PILOT_SLUG = "chto-pokazyvaet-diagnostika-iphone";

const media = {
  pilotContent: {
    title: "ISVOI Blog: диагностика экрана iPhone",
    filename: "blog-iphone-screen-diagnostics.webp",
    description: "Иллюстрация проверки дисплея для статьи о диагностике iPhone.",
    source: "779a7aba-a613-4686-8001-4a379931ccca",
  },
  pilotWide: {
    title: "ISVOI Blog: проверка корпуса iPhone",
    filename: "blog-iphone-body-inspection.webp",
    description: "Широкая иллюстрация проверки корпуса и следов вмешательства.",
    source: "052dc843-56cf-44c9-a86a-9aad42e1efc4",
  },
  batteryCover: {
    title: "ISVOI Blog: батарея iPhone перед покупкой",
    filename: "blog-iphone-battery-guide-cover.webp",
    description: "Обложка практического материала о проверке батареи iPhone.",
    source: "d53389f2-b8d5-46f4-b9ad-66a3ea95c8a4",
  },
  repairCover: {
    title: "ISVOI Blog: история деталей и ремонта iPhone",
    filename: "blog-iphone-repair-history-cover.webp",
    description: "Обложка материала об истории деталей и ремонта iPhone.",
    source: "8030c434-de94-4c57-9472-20ab97dea0ab",
  },
};

const articles = [
  {
    slug: "kak-proverit-batareyu-iphone",
    title: "Как проверить батарею iPhone перед покупкой",
    excerpt:
      "Процент ёмкости — только начало проверки. Разбираем циклы, нагрев, разряд под нагрузкой и признаки, которые важно сопоставить до покупки.",
    coverKey: "batteryCover",
    coverAlt: "iPhone для проверки состояния батареи перед покупкой",
    coverCaption: "Оценивать батарею лучше по нескольким связанным признакам.",
    tag: { name: "Батарея", slug: "battery" },
    device: "iphone-14",
    seoTitle: "Как проверить батарею iPhone перед покупкой",
    metaDescription:
      "Практическая проверка батареи iPhone: максимальная ёмкость, циклы, нагрев, разряд под нагрузкой и вопросы продавцу.",
    blocks: [
      `<p>Состояние батареи влияет не только на время работы. Изношенный аккумулятор может ограничивать производительность, заметно нагреваться и потребовать расходов вскоре после покупки. Поэтому одного числа в настройках недостаточно.</p>
<h2>Начните с максимальной ёмкости</h2>
<p>Показатель в разделе «Состояние аккумулятора» помогает быстро оценить износ, но его нельзя читать отдельно от возраста устройства и сценария использования. Ровная работа при умеренной ёмкости бывает предпочтительнее красивой цифры без понятной истории.</p>
<h2>Сопоставьте ёмкость и циклы</h2>
<p>Количество циклов показывает интенсивность эксплуатации. Если доступ к этому показателю есть, сравните его с ёмкостью и возрастом устройства. Сильное расхождение — повод уточнить, меняли ли батарею и где выполняли работу.</p>`,
      `<h2>Проверьте поведение под нагрузкой</h2>
<p>Запустите камеру, навигацию или короткое видео и понаблюдайте за зарядом и температурой корпуса. Быстрый спад процента, заметный нагрев без тяжёлой задачи или внезапное выключение требуют дополнительной диагностики.</p>
<h2>Уточните историю замены</h2>
<p>Замена аккумулятора сама по себе не делает устройство плохим. Важно знать происхождение детали, качество установки и наличие системных сообщений. Эти факты влияют на прогноз ресурса и справедливую цену.</p>`,
      `<blockquote><p>Хорошая проверка батареи отвечает не на вопрос «какой процент», а на вопрос «как устройство будет вести себя после покупки».</p></blockquote>
<h2>Что зафиксировать перед решением</h2>
<p>Запишите ёмкость, доступные сведения о циклах, поведение под нагрузкой, нагрев и историю замены. Так два похожих iPhone можно сравнить по будущим расходам, а не только по цене объявления.</p>`,
    ],
  },
  {
    slug: "kak-ponyat-kakie-detali-menyali-v-iphone",
    title: "Как понять, какие детали меняли в iPhone",
    excerpt:
      "Системные сообщения, True Tone, Face ID и следы вскрытия помогают восстановить историю устройства. Собрали спокойный порядок проверки без поспешных выводов.",
    coverKey: "repairCover",
    coverAlt: "Корпус iPhone при проверке истории деталей и ремонта",
    coverCaption: "Историю ремонта оценивают по системе, функциям и физическим признакам вместе.",
    tag: { name: "Ремонт", slug: "repair-history" },
    device: "iphone-13-pro",
    seoTitle: "Как проверить историю деталей и ремонта iPhone",
    metaDescription:
      "Как проверить замену дисплея, батареи и камер iPhone: системные сообщения, функции, корпус и вопросы об истории ремонта.",
    blocks: [
      `<p>Факт ремонта не всегда означает плохую покупку. Риск появляется, когда неизвестно, что меняли, почему и как устройство работает после вмешательства. Проверку стоит строить от системных данных к функциям и корпусу.</p>
<h2>Посмотрите историю деталей в iOS</h2>
<p>На поддерживаемых моделях система показывает сведения о некоторых заменённых компонентах. Сообщение нужно воспринимать как часть картины: оно фиксирует деталь, но не заменяет проверку качества ремонта и текущей работы устройства.</p>
<h2>Проверьте функции, связанные с ремонтом</h2>
<p>Для дисплея важны сенсор по всей площади, равномерность изображения и True Tone. Для фронтального модуля — Face ID, для камер — фокус, стабилизация и переключение объективов. После качественного ремонта функции должны работать без оговорок.</p>`,
      `<h2>Осмотрите корпус и крепёж</h2>
<p>Неравномерные зазоры, следы на винтах, пыль под стеклом камеры или изменённая посадка дисплея могут указывать на вскрытие. Отдельный признак не является приговором, но несколько совпадений требуют уточнить историю.</p>
<h2>Спросите о причине и документах</h2>
<p>Полезно узнать, из-за чего выполнялся ремонт, какие детали установили и сохранились ли документы сервиса. Понятная история позволяет оценить последствия, а уклончивый ответ увеличивает неопределённость.</p>`,
      `<blockquote><p>Задача диагностики — не найти повод отказаться от любого ремонта, а сделать его последствия понятными до оплаты.</p></blockquote>
<h2>Как принять решение</h2>
<p>Сопоставьте системные сообщения, работу функций, физические признаки и слова продавца. Зафиксируйте известные замены в отчёте и учитывайте их при сравнении цены, состояния и будущего обслуживания.</p>`,
    ],
  },
];

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  let body = options.body;
  if (body && !(body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(body);
  }
  const response = await fetch(`${endpoint}${path}`, { ...options, headers, body });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1200);
    throw new Error(`${options.method || "GET"} ${path} failed (${response.status}): ${detail}`);
  }
  if (response.status === 204) return null;
  return (await response.json()).data;
}

async function one(collection, field, value, fields = "*") {
  const query = new URLSearchParams({ fields, limit: "1" });
  query.set(`filter[${field}][_eq]`, value);
  const rows = await api(`/items/${collection}?${query}`);
  return rows[0] || null;
}

async function ensureMedia(spec) {
  const query = new URLSearchParams({ fields: "id,folder,title", limit: "1" });
  query.set("filter[title][_eq]", spec.title);
  const existing = (await api(`/files?${query}`))[0];
  if (existing) return existing;

  const source = await fetch(`${endpoint}/assets/${spec.source}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!source.ok) throw new Error(`Unable to read source image ${spec.source}: ${source.status}`);
  const blob = await source.blob();
  const form = new FormData();
  form.set("folder", workFolder);
  form.set("title", spec.title);
  form.set("description", spec.description);
  form.set("file", blob, spec.filename);
  return api("/files", { method: "POST", body: form });
}

async function fileByTitle(title) {
  const query = new URLSearchParams({ fields: "id,folder,title", limit: "1" });
  query.set("filter[title][_eq]", title);
  return (await api(`/files?${query}`))[0] || null;
}

async function ensureTag(tag) {
  return (
    (await one("blog_tags", "slug", tag.slug, "id,name,slug")) ||
    (await api("/items/blog_tags", {
      method: "POST",
      body: { ...tag, is_active: true },
    }))
  );
}

async function ensureVersion(post, name, { replaceOutdated = false } = {}) {
  const query = new URLSearchParams({ fields: "id,key,name,item,collection", limit: "1" });
  query.set("filter[item][_eq]", post.id);
  query.set("filter[key][_eq]", VERSION_KEY);
  let existing = (await api(`/versions?${query}`))[0];
  if (existing && replaceOutdated) {
    const comparison = await api(`/versions/${existing.id}/compare`);
    if (comparison.outdated) {
      await api(`/versions/${existing.id}`, { method: "DELETE" });
      existing = null;
    }
  }
  return (
    existing ||
    (await api("/versions", {
      method: "POST",
      body: { key: VERSION_KEY, name, collection: "blog_posts", item: post.id },
    }))
  );
}

async function versionedPost(postId) {
  const query = new URLSearchParams({
    version: VERSION_KEY,
    fields:
      "id,status,no_index,body,blocks.id,blocks.block_type,blocks.body,blocks.image,blocks.image_width",
  });
  return api(`/items/blog_posts/${postId}?${query}`);
}

async function saveMissingVersionBlocks(version, postId, blocks, state = {}) {
  const current = await versionedPost(postId);
  const existingImages = new Set(
    (current.blocks || []).map((block) =>
      typeof block.image === "string" ? block.image : block.image?.id,
    ),
  );
  const existingBodies = new Set((current.blocks || []).map((block) => block.body).filter(Boolean));
  const create = blocks.filter(
    (block) =>
      (block.image && !existingImages.has(block.image)) ||
      (block.body && !existingBodies.has(block.body)),
  );
  if (!create.length && Object.keys(state).every((key) => current[key] === state[key])) return;
  await api(`/versions/${version.id}/save`, {
    method: "POST",
    body: { ...state, ...(create.length ? { blocks: { create } } : {}) },
  });
}

async function ensurePost(article, files, category, author) {
  let post = await one("blog_posts", "slug", article.slug, "id,status,slug,body");
  if (!post) {
    post = await api("/items/blog_posts", {
      method: "POST",
      body: {
        status: "draft",
        slug: article.slug,
        title: article.title,
        excerpt: article.excerpt,
        cover_image: files[article.coverKey].id,
        cover_alt: article.coverAlt,
        cover_caption: article.coverCaption,
        category: category.id,
        author: author.id,
        featured: false,
        seo_title: article.seoTitle,
        meta_description: article.metaDescription,
        no_index: true,
      },
    });
  }
  if (post.body)
    throw new Error(`${article.slug} must remain block-only; legacy body is populated.`);

  const blocksQuery = new URLSearchParams({ fields: "id,body", limit: "100" });
  blocksQuery.set("filter[post][_eq]", post.id);
  const blocks = await api(`/items/blog_post_blocks?${blocksQuery}`);
  if (blocks.length === 0) {
    for (const [index, body] of article.blocks.slice(0, 2).entries()) {
      await api("/items/blog_post_blocks", {
        method: "POST",
        body: {
          post: post.id,
          sort: (index + 1) * 100,
          block_type: "rich_text",
          body,
          image_width: "content",
        },
      });
    }
  }

  const tag = await ensureTag(article.tag);
  const tagQuery = new URLSearchParams({ fields: "id", limit: "1" });
  tagQuery.set("filter[blog_posts_id][_eq]", post.id);
  tagQuery.set("filter[blog_tags_id][_eq]", tag.id);
  if ((await api(`/items/blog_posts_tags?${tagQuery}`)).length === 0) {
    await api("/items/blog_posts_tags", {
      method: "POST",
      body: { blog_posts_id: post.id, blog_tags_id: tag.id },
    });
  }

  const deviceQuery = new URLSearchParams({ fields: "id", limit: "1" });
  deviceQuery.set("filter[blog_posts_id][_eq]", post.id);
  deviceQuery.set("filter[devices_id][_eq]", article.device);
  if ((await api(`/items/blog_posts_devices?${deviceQuery}`)).length === 0) {
    await api("/items/blog_posts_devices", {
      method: "POST",
      body: { blog_posts_id: post.id, devices_id: article.device, sort: 10 },
    });
  }

  const version = await ensureVersion(post, `Publication QA: ${article.title}`, {
    replaceOutdated: true,
  });
  await saveMissingVersionBlocks(
    version,
    post.id,
    [
      {
        post: post.id,
        sort: 300,
        block_type: "rich_text",
        body: article.blocks[2],
        image_width: "content",
      },
    ],
    { status: "review", no_index: false },
  );
  return { post, version };
}

async function prepare() {
  const files = {};
  for (const [key, spec] of Object.entries(media)) files[key] = await ensureMedia(spec);
  const pilot = await one("blog_posts", "slug", PILOT_SLUG, "id,status,slug,body");
  const category = await one("blog_categories", "slug", "buying-guide", "id,slug");
  const author = await one("blog_authors", "slug", "isvoi-editorial", "id,slug");
  if (!pilot || !category || !author)
    throw new Error("Pilot, buying-guide category or editorial author is missing.");

  const pilotVersion = await ensureVersion(pilot, "Structured images editorial QA", {
    replaceOutdated: true,
  });
  await saveMissingVersionBlocks(pilotVersion, pilot.id, [
    {
      post: pilot.id,
      sort: 200,
      block_type: "image",
      image: files.pilotContent.id,
      image_alt: "Проверка дисплея iPhone по всей площади экрана",
      image_caption: "Экран проверяют на равномерность, сенсор и работу True Tone.",
      image_width: "content",
    },
    {
      post: pilot.id,
      sort: 300,
      block_type: "image",
      image: files.pilotWide.id,
      image_alt: "Осмотр корпуса iPhone и следов предыдущего вмешательства",
      image_caption:
        "Зазоры, крепёж и состояние корпуса рассматривают вместе с функциональной диагностикой.",
      image_width: "wide",
    },
  ]);

  const growth = [];
  for (const article of articles) growth.push(await ensurePost(article, files, category, author));
  const pilotPreview = await versionedPost(pilot.id);
  if ((pilotPreview.blocks || []).filter((block) => block.block_type === "image").length < 2) {
    throw new Error("Pilot version does not contain both structured image blocks.");
  }
  for (const { post } of growth) {
    const preview = await versionedPost(post.id);
    if (preview.body) throw new Error(`${post.slug} version unexpectedly contains legacy body.`);
    if ((preview.blocks || []).filter((block) => block.block_type === "rich_text").length < 3) {
      throw new Error(`${post.slug} version did not restore all O2M rich-text blocks.`);
    }
  }
  console.log(
    JSON.stringify(
      {
        phase,
        pilot: pilot.id,
        versions: [pilotVersion.id, ...growth.map(({ version }) => version.id)],
        files,
      },
      null,
      2,
    ),
  );
}

async function compareAndPromote(post) {
  const version = await ensureVersion(post, `Editorial QA: ${post.slug}`);
  const comparison = await api(`/versions/${version.id}/compare`);
  if (comparison.outdated) throw new Error(`${post.slug} version is outdated.`);
  if (!comparison.mainHash) throw new Error(`${post.slug} compare did not return mainHash.`);
  if (!comparison.current?.blocks)
    throw new Error(`${post.slug} compare did not include O2M blocks.`);
  await api(`/versions/${version.id}/promote`, {
    method: "POST",
    body: { mainHash: comparison.mainHash },
  });
  const main = await api(
    `/items/blog_posts/${post.id}?fields=id,status,body,blocks.id,blocks.block_type,blocks.image`,
  );
  if (!main.blocks?.length) throw new Error(`${post.slug} promotion lost article blocks.`);
  return { version: version.id, blocks: main.blocks.length, legacyBody: Boolean(main.body) };
}

async function promote() {
  const files = {};
  for (const [key, spec] of Object.entries(media)) {
    const file = await fileByTitle(spec.title);
    if (!file) throw new Error(`Prepared file is missing: ${spec.title}`);
    if (file.folder !== editorialFolder) {
      await api(`/files/${file.id}`, { method: "PATCH", body: { folder: editorialFolder } });
    }
    files[key] = file;
  }
  const posts = [PILOT_SLUG, ...articles.map((article) => article.slug)];
  const results = [];
  for (const slug of posts) {
    const post = await one("blog_posts", "slug", slug, "id,slug,status,body");
    if (!post) throw new Error(`Prepared post is missing: ${slug}`);
    results.push({ slug, ...(await compareAndPromote(post)) });
  }
  console.log(JSON.stringify({ phase, results }, null, 2));
}

async function schedule() {
  const publishAt = new Date(Date.now() + 90_000).toISOString();
  for (const article of articles) {
    const post = await one("blog_posts", "slug", article.slug, "id,status,slug,body");
    if (!post) throw new Error(`Prepared post is missing: ${article.slug}`);
    if (post.body) throw new Error(`${article.slug} must remain block-only.`);
    if (post.status !== "published") {
      await api(`/items/blog_posts/${post.id}`, {
        method: "PATCH",
        body: { status: "scheduled", publish_at: publishAt, no_index: false },
      });
    }
  }
  console.log(
    JSON.stringify({ phase, publishAt, posts: articles.map(({ slug }) => slug) }, null, 2),
  );
}

async function auditState() {
  const result = [];
  for (const slug of [PILOT_SLUG, ...articles.map((article) => article.slug)]) {
    const post = await one(
      "blog_posts",
      "slug",
      slug,
      "id,status,slug,body,published_at,cover_image,blocks.id,blocks.block_type,blocks.image,blocks.image_width",
    );
    if (!post) throw new Error(`Expected post is missing: ${slug}`);
    result.push({
      slug,
      status: post.status,
      legacyBody: Boolean(post.body),
      blocks: post.blocks?.length || 0,
      images: (post.blocks || []).filter((block) => block.block_type === "image").length,
      publishedAt: post.published_at,
    });
  }
  return result;
}

async function finalize() {
  const state = await auditState();
  if (state.some((post) => post.status !== "published")) {
    throw new Error(
      `All three posts must be published before finalization: ${JSON.stringify(state)}`,
    );
  }
  for (const post of state.filter((item) => item.legacyBody)) {
    const row = await one("blog_posts", "slug", post.slug, "id");
    await api(`/items/blog_posts/${row.id}`, { method: "PATCH", body: { body: null } });
  }
  const finalState = await auditState();
  if (finalState.some((post) => post.legacyBody || post.blocks < 1)) {
    throw new Error(`Legacy cleanup or block completeness failed: ${JSON.stringify(finalState)}`);
  }
  console.log(JSON.stringify({ phase, posts: finalState }, null, 2));
}

if (phase === "prepare") await prepare();
if (phase === "promote") await promote();
if (phase === "schedule") await schedule();
if (phase === "finalize") await finalize();
if (phase === "audit") console.log(JSON.stringify({ phase, posts: await auditState() }, null, 2));
