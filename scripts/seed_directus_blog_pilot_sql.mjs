#!/usr/bin/env node
/**
 * Print idempotent SQL for the first editorial blog draft.
 *
 * Required env:
 *   BLOG_PILOT_COVER_FILE_ID
 */

const coverFileId = (process.env.BLOG_PILOT_COVER_FILE_ID || "").trim();

if (!/^[0-9a-f-]{36}$/i.test(coverFileId)) {
  console.error("BLOG_PILOT_COVER_FILE_ID must be a Directus file UUID.");
  process.exit(1);
}

function sql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const excerpt =
  "Диагностика помогает отделить понятное состояние устройства от красивого описания. Разбираем, какие проверки действительно влияют на решение о покупке.";

const body = `
<p>Внешне аккуратный iPhone может скрывать изношенную батарею, неоригинальные детали или следы ремонта. Поэтому до покупки важно смотреть не на один показатель, а на связную картину состояния устройства.</p>
<h2>1. Батарея и характер износа</h2>
<p>Процент максимальной ёмкости полезен, но сам по себе не объясняет всё. Важно сопоставить его с количеством циклов, стабильностью заряда и поведением устройства под нагрузкой. Резкие выключения или быстрый нагрев требуют дополнительной проверки.</p>
<h2>2. Дисплей и сенсор</h2>
<p>Проверка экрана включает не только отсутствие трещин. Нужно оценить равномерность подсветки, выгорание, работу сенсора по всей площади и корректность True Tone. Отсутствие True Tone иногда указывает на замену дисплея или некорректный ремонт.</p>
<h2>3. Камеры, микрофоны и динамики</h2>
<p>Каждый модуль камеры проверяют отдельно: фокус, стабилизацию, переключение объективов и запись видео. Для микрофонов и динамиков важны чистый звук, нормальная громкость и отсутствие хрипов.</p>
<h2>4. Корпус и следы вмешательства</h2>
<p>Зазоры, винты, рамка и блок камер могут рассказать о падениях и вскрытии устройства. Сам факт ремонта не всегда критичен, но покупатель должен заранее понимать, что менялось и как это влияет на ресурс и цену.</p>
<h2>5. История деталей и функций</h2>
<p>Face ID, беспроводные интерфейсы, датчики, зарядка и кнопки должны работать без оговорок. Системные сообщения о деталях необходимо сопоставить с фактической историей обслуживания.</p>
<blockquote><p>Хорошая диагностика не обещает идеальное устройство. Она делает его состояние понятным до оплаты.</p></blockquote>
<h2>Что должно остаться у покупателя</h2>
<p>Результат проверки полезен, когда он зафиксирован: состояние батареи, корпуса, экрана, камер, функций и известные ремонты. В I СВОИ эти сведения собираются в Passport устройства, чтобы сравнивать варианты по фактам, а не по формулировкам объявления.</p>
`.trim();

process.stdout.write(String.raw`
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_category uuid;
  v_author uuid;
  v_tag uuid;
  v_post uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM directus_files WHERE id=${sql(coverFileId)}::uuid) THEN
    RAISE EXCEPTION 'Pilot cover file does not exist';
  END IF;

  INSERT INTO blog_categories (id,name,slug,description,is_active,sort)
  VALUES (
    gen_random_uuid(),
    'Гид по покупке',
    'buying-guide',
    'Практические материалы о проверке и выборе техники до покупки.',
    true,
    10
  )
  ON CONFLICT (slug) DO UPDATE SET
    name=EXCLUDED.name,
    description=EXCLUDED.description,
    is_active=true,
    sort=EXCLUDED.sort
  RETURNING id INTO v_category;

  INSERT INTO blog_authors (id,name,slug,role_title,bio,is_active,sort)
  VALUES (
    gen_random_uuid(),
    'Редакция I СВОИ',
    'isvoi-editorial',
    'Эксперты по диагностике и выбору техники',
    'Команда I СВОИ проверяет устройства и переводит технические результаты в понятные покупателю факты.',
    true,
    10
  )
  ON CONFLICT (slug) DO UPDATE SET
    name=EXCLUDED.name,
    role_title=EXCLUDED.role_title,
    bio=EXCLUDED.bio,
    is_active=true,
    sort=EXCLUDED.sort
  RETURNING id INTO v_author;

  INSERT INTO blog_tags (id,name,slug,is_active)
  VALUES (gen_random_uuid(),'Диагностика','diagnostics',true)
  ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name,is_active=true
  RETURNING id INTO v_tag;

  INSERT INTO blog_posts (
    id,status,slug,title,excerpt,body,cover_image,cover_alt,cover_caption,
    category,author,featured,seo_title,meta_description,no_index
  )
  VALUES (
    gen_random_uuid(),
    'draft',
    'chto-pokazyvaet-diagnostika-iphone',
    'Что показывает диагностика iPhone перед покупкой',
    ${sql(excerpt)},
    ${sql(body)},
    ${sql(coverFileId)}::uuid,
    'Экран диагностики устройства перед покупкой',
    'Иллюстрация процесса диагностики I СВОИ',
    v_category,
    v_author,
    false,
    'Что проверяет диагностика iPhone перед покупкой',
    'Разбираем проверку батареи, дисплея, камер, корпуса и истории деталей iPhone перед покупкой.',
    true
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_post;

  IF v_post IS NULL THEN
    SELECT id INTO v_post
    FROM blog_posts
    WHERE slug='chto-pokazyvaet-diagnostika-iphone';
  END IF;

  INSERT INTO blog_post_blocks (id,post,sort,block_type,body,image_width)
  SELECT gen_random_uuid(),v_post,100,'rich_text',${sql(body)},'content'
  WHERE NOT EXISTS (SELECT 1 FROM blog_post_blocks block WHERE block.post=v_post);

  INSERT INTO blog_posts_tags (id,blog_posts_id,blog_tags_id)
  VALUES (gen_random_uuid(),v_post,v_tag)
  ON CONFLICT (blog_posts_id,blog_tags_id) DO NOTHING;

  IF EXISTS (SELECT 1 FROM devices WHERE id='iphone-13-pro') THEN
    INSERT INTO blog_posts_devices (id,blog_posts_id,devices_id,sort)
    VALUES (gen_random_uuid(),v_post,'iphone-13-pro',10)
    ON CONFLICT (blog_posts_id,devices_id) DO NOTHING;
  END IF;
END;
$$;

COMMIT;

SELECT 'blog.pilot_category' AS check_name, count(*)::text AS value
FROM blog_categories WHERE slug='buying-guide'
UNION ALL
SELECT 'blog.pilot_author', count(*)::text
FROM blog_authors WHERE slug='isvoi-editorial'
UNION ALL
SELECT 'blog.pilot_draft', count(*)::text
FROM blog_posts
WHERE slug='chto-pokazyvaet-diagnostika-iphone' AND status='draft'
UNION ALL
SELECT 'blog.pilot_public', count(*)::text
FROM blog_posts
WHERE slug='chto-pokazyvaet-diagnostika-iphone' AND status='published';
`);
