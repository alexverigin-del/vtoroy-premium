#!/usr/bin/env node
/**
 * Print idempotent SQL for the ISVOI editorial blog model and Studio workflow.
 *
 * The script only prepares Directus. It does not publish navigation items or
 * seed public posts, so it is safe to run before the web routes are deployed.
 *
 * Usage:
 *   node scripts/setup_directus_blog_sql.mjs > /tmp/isvoi_setup_directus_blog.sql
 *   cd infra/directus-beget
 *   set -a && . ./.env && set +a
 *   docker compose exec -T database psql -U "$DB_USER" -d "$DB_DATABASE" -v ON_ERROR_STOP=1 < /tmp/isvoi_setup_directus_blog.sql
 */

process.stdout.write(String.raw`
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION isvoi_blog_policy_id(
  p_name text, p_icon text, p_description text
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM directus_policies WHERE name=p_name LIMIT 1;
  IF v_id IS NULL THEN
    v_id := gen_random_uuid();
    INSERT INTO directus_policies (
      id,name,icon,description,app_access,admin_access,enforce_tfa
    ) VALUES (
      v_id,p_name,p_icon,p_description,false,false,false
    );
  ELSE
    UPDATE directus_policies SET
      icon=p_icon,description=p_description,app_access=false,admin_access=false,enforce_tfa=false
    WHERE id=v_id;
  END IF;
  RETURN v_id;
END;
$$;

SELECT isvoi_blog_policy_id(
  'ISVOI Blog Preview',
  'preview',
  'Headless read-only policy for Next.js Draft Mode. Reads blog drafts and only the related file/device fields required by preview.'
);

DROP FUNCTION isvoi_blog_policy_id(text,text,text);

CREATE TABLE IF NOT EXISTS blog_authors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(160) NOT NULL,
  slug varchar(160) NOT NULL UNIQUE,
  role_title varchar(160),
  bio text,
  avatar uuid,
  is_active boolean NOT NULL DEFAULT true,
  sort integer NOT NULL DEFAULT 100,
  date_created timestamptz NOT NULL DEFAULT now(),
  date_updated timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS blog_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL,
  slug varchar(120) NOT NULL UNIQUE,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort integer NOT NULL DEFAULT 100,
  date_created timestamptz NOT NULL DEFAULT now(),
  date_updated timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS blog_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL,
  slug varchar(120) NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  date_created timestamptz NOT NULL DEFAULT now(),
  date_updated timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status varchar(32) NOT NULL DEFAULT 'draft',
  slug varchar(180) NOT NULL UNIQUE,
  title varchar(255) NOT NULL,
  excerpt text,
  body text,
  cover_image uuid,
  cover_alt varchar(255),
  cover_caption text,
  category uuid,
  author uuid,
  featured boolean NOT NULL DEFAULT false,
  publish_at timestamptz,
  published_at timestamptz,
  seo_title varchar(255),
  meta_description text,
  canonical_url text,
  no_index boolean NOT NULL DEFAULT false,
  og_image uuid,
  date_created timestamptz NOT NULL DEFAULT now(),
  date_updated timestamptz NOT NULL DEFAULT now(),
  user_created uuid,
  user_updated uuid,
  CONSTRAINT blog_posts_status_check CHECK (
    status IN ('draft', 'review', 'scheduled', 'published', 'archived')
  )
);

CREATE TABLE IF NOT EXISTS blog_posts_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blog_posts_id uuid NOT NULL,
  blog_tags_id uuid NOT NULL,
  CONSTRAINT blog_posts_tags_unique UNIQUE (blog_posts_id, blog_tags_id)
);

CREATE TABLE IF NOT EXISTS blog_posts_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blog_posts_id uuid NOT NULL,
  devices_id varchar NOT NULL,
  sort integer NOT NULL DEFAULT 100,
  CONSTRAINT blog_posts_devices_unique UNIQUE (blog_posts_id, devices_id)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'blog_authors_avatar_fkey') THEN
    ALTER TABLE blog_authors ADD CONSTRAINT blog_authors_avatar_fkey
      FOREIGN KEY (avatar) REFERENCES directus_files(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'blog_posts_cover_image_fkey') THEN
    ALTER TABLE blog_posts ADD CONSTRAINT blog_posts_cover_image_fkey
      FOREIGN KEY (cover_image) REFERENCES directus_files(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'blog_posts_og_image_fkey') THEN
    ALTER TABLE blog_posts ADD CONSTRAINT blog_posts_og_image_fkey
      FOREIGN KEY (og_image) REFERENCES directus_files(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'blog_posts_category_fkey') THEN
    ALTER TABLE blog_posts ADD CONSTRAINT blog_posts_category_fkey
      FOREIGN KEY (category) REFERENCES blog_categories(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'blog_posts_author_fkey') THEN
    ALTER TABLE blog_posts ADD CONSTRAINT blog_posts_author_fkey
      FOREIGN KEY (author) REFERENCES blog_authors(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'blog_posts_user_created_fkey') THEN
    ALTER TABLE blog_posts ADD CONSTRAINT blog_posts_user_created_fkey
      FOREIGN KEY (user_created) REFERENCES directus_users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'blog_posts_user_updated_fkey') THEN
    ALTER TABLE blog_posts ADD CONSTRAINT blog_posts_user_updated_fkey
      FOREIGN KEY (user_updated) REFERENCES directus_users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'blog_posts_tags_post_fkey') THEN
    ALTER TABLE blog_posts_tags ADD CONSTRAINT blog_posts_tags_post_fkey
      FOREIGN KEY (blog_posts_id) REFERENCES blog_posts(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'blog_posts_tags_tag_fkey') THEN
    ALTER TABLE blog_posts_tags ADD CONSTRAINT blog_posts_tags_tag_fkey
      FOREIGN KEY (blog_tags_id) REFERENCES blog_tags(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'blog_posts_devices_post_fkey') THEN
    ALTER TABLE blog_posts_devices ADD CONSTRAINT blog_posts_devices_post_fkey
      FOREIGN KEY (blog_posts_id) REFERENCES blog_posts(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'blog_posts_devices_device_fkey') THEN
    ALTER TABLE blog_posts_devices ADD CONSTRAINT blog_posts_devices_device_fkey
      FOREIGN KEY (devices_id) REFERENCES devices(id) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS blog_posts_public_idx ON blog_posts (status, published_at DESC);
CREATE INDEX IF NOT EXISTS blog_posts_publish_at_idx ON blog_posts (publish_at);
CREATE INDEX IF NOT EXISTS blog_posts_category_idx ON blog_posts (category);
CREATE INDEX IF NOT EXISTS blog_posts_author_idx ON blog_posts (author);
CREATE INDEX IF NOT EXISTS blog_posts_featured_idx ON blog_posts (featured, published_at DESC);
CREATE INDEX IF NOT EXISTS blog_posts_tags_post_idx ON blog_posts_tags (blog_posts_id);
CREATE INDEX IF NOT EXISTS blog_posts_tags_tag_idx ON blog_posts_tags (blog_tags_id);
CREATE INDEX IF NOT EXISTS blog_posts_devices_post_idx ON blog_posts_devices (blog_posts_id, sort);
CREATE INDEX IF NOT EXISTS blog_posts_devices_device_idx ON blog_posts_devices (devices_id);

CREATE OR REPLACE FUNCTION isvoi_blog_touch_date_updated()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.date_updated = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION isvoi_blog_set_published_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'published' AND NEW.published_at IS NULL THEN
    NEW.published_at = coalesce(NEW.publish_at, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS blog_authors_touch_date_updated ON blog_authors;
CREATE TRIGGER blog_authors_touch_date_updated BEFORE UPDATE ON blog_authors
FOR EACH ROW EXECUTE FUNCTION isvoi_blog_touch_date_updated();
DROP TRIGGER IF EXISTS blog_categories_touch_date_updated ON blog_categories;
CREATE TRIGGER blog_categories_touch_date_updated BEFORE UPDATE ON blog_categories
FOR EACH ROW EXECUTE FUNCTION isvoi_blog_touch_date_updated();
DROP TRIGGER IF EXISTS blog_tags_touch_date_updated ON blog_tags;
CREATE TRIGGER blog_tags_touch_date_updated BEFORE UPDATE ON blog_tags
FOR EACH ROW EXECUTE FUNCTION isvoi_blog_touch_date_updated();
DROP TRIGGER IF EXISTS blog_posts_touch_date_updated ON blog_posts;
CREATE TRIGGER blog_posts_touch_date_updated BEFORE UPDATE ON blog_posts
FOR EACH ROW EXECUTE FUNCTION isvoi_blog_touch_date_updated();
DROP TRIGGER IF EXISTS blog_posts_set_published_at ON blog_posts;
CREATE TRIGGER blog_posts_set_published_at BEFORE INSERT OR UPDATE ON blog_posts
FOR EACH ROW EXECUTE FUNCTION isvoi_blog_set_published_at();

CREATE OR REPLACE FUNCTION isvoi_blog_folder_id()
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM directus_folders
  WHERE name = 'ISVOI Blog' AND parent IS NULL LIMIT 1;
  IF v_id IS NULL THEN
    v_id := gen_random_uuid();
    INSERT INTO directus_folders (id, name, parent) VALUES (v_id, 'ISVOI Blog', NULL);
  END IF;
  RETURN v_id;
END;
$$;
SELECT isvoi_blog_folder_id();
DROP FUNCTION isvoi_blog_folder_id();

CREATE OR REPLACE FUNCTION isvoi_blog_upsert_collection(
  p_collection varchar,
  p_icon varchar,
  p_note text,
  p_display_template varchar,
  p_archive_field varchar,
  p_sort_field varchar,
  p_sort integer,
  p_color varchar,
  p_translation text
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM directus_collections WHERE collection = p_collection) THEN
    UPDATE directus_collections SET
      icon = p_icon, note = p_note, display_template = p_display_template,
      hidden = false, singleton = false, archive_field = p_archive_field,
      archive_value = CASE WHEN p_archive_field IS NULL THEN NULL ELSE 'archived' END,
      unarchive_value = CASE WHEN p_archive_field IS NULL THEN NULL ELSE 'draft' END,
      sort_field = p_sort_field, accountability = 'all', sort = p_sort,
      color = p_color,
      translations = json_build_array(json_build_object('language','ru-RU','translation',p_translation))::json
    WHERE collection = p_collection;
  ELSE
    INSERT INTO directus_collections (
      collection, icon, note, display_template, hidden, singleton,
      archive_field, archive_value, unarchive_value, sort_field,
      accountability, sort, color, translations
    ) VALUES (
      p_collection, p_icon, p_note, p_display_template, false, false,
      p_archive_field,
      CASE WHEN p_archive_field IS NULL THEN NULL ELSE 'archived' END,
      CASE WHEN p_archive_field IS NULL THEN NULL ELSE 'draft' END,
      p_sort_field, 'all', p_sort, p_color,
      json_build_array(json_build_object('language','ru-RU','translation',p_translation))::json
    );
  END IF;
END;
$$;

SELECT isvoi_blog_upsert_collection('blog_posts','article','Редакционные материалы ISVOI. Публикуйте только после проверки текста, обложки, автора, категории, SEO и даты публикации.','{{status}} · {{title}}','status',NULL,40,'#2563eb','Блог · Материалы');
SELECT isvoi_blog_upsert_collection('blog_categories','topic','Рубрики блога. Держите список коротким и устойчивым: рубрика отражает тему, а не формат материала.','{{name}} · {{slug}}',NULL,'sort',41,'#0f766e','Блог · Рубрики');
SELECT isvoi_blog_upsert_collection('blog_tags','sell','Теги для точной тематической навигации. Не создавайте синонимы и одноразовые теги.','{{name}} · {{slug}}',NULL,NULL,42,'#6b7280','Блог · Теги');
SELECT isvoi_blog_upsert_collection('blog_authors','person','Публичные авторы и эксперты ISVOI. Биография должна объяснять компетенцию без лишних персональных данных.','{{name}} · {{role_title}}',NULL,'sort',43,'#ca8a04','Блог · Авторы');
SELECT isvoi_blog_upsert_collection('blog_posts_tags','link','Системная связь материалов и тегов. Обычно редактируется из карточки материала.',NULL,NULL,NULL,44,'#9ca3af','Блог · Связи тегов');
SELECT isvoi_blog_upsert_collection('blog_posts_devices','devices','Связь материала с релевантными устройствами каталога. Порядок задает выдачу карточек в статье.',NULL,NULL,'sort',45,'#9ca3af','Блог · Связи устройств');

UPDATE directus_collections SET hidden = true
WHERE collection IN ('blog_posts_tags','blog_posts_devices');

UPDATE directus_collections SET versioning = true
WHERE collection = 'blog_posts';

UPDATE directus_fields
SET options = '{"choices":[{"text":"Главная","value":"home","color":"#0f766e"},{"text":"Каталог","value":"catalog","color":"#111827"},{"text":"Store","value":"store","color":"#2563eb"},{"text":"Trade","value":"trade","color":"#7c3aed"},{"text":"Passport","value":"passport","color":"#dc2626"},{"text":"Club","value":"club","color":"#ca8a04"},{"text":"Блог","value":"blog","color":"#2563eb"}]}'::json,
  note = 'Шаблон рендера в Next. Обычно не менять. Блог использует template=blog и секцию blog.index.'
WHERE collection='site_pages' AND field='template';

INSERT INTO site_pages (slug,template,status,title,meta_description)
VALUES (
  'blog',
  'blog',
  'published',
  'Блог I СВОИ — разумный выбор и владение техникой',
  'Практические разборы I СВОИ: диагностика, состояние, батарея, ремонт, цена выхода и спокойная покупка без чужой неизвестности.'
)
ON CONFLICT (slug) DO UPDATE SET
  template=EXCLUDED.template,
  title=COALESCE(NULLIF(site_pages.title,''),EXCLUDED.title),
  meta_description=COALESCE(NULLIF(site_pages.meta_description,''),EXCLUDED.meta_description);

INSERT INTO page_sections (
  page,section_key,variant,eyebrow,headline,subheadline,sort_order,is_active,content
)
SELECT
  sp.id,
  'blog_index_live',
  'blog.index',
  'Блог I СВОИ',
  'Разумный выбор и владение техникой',
  'Практические разборы о диагностике, состоянии, батарее, ремонте и цене выхода — без кликбейта и чужой неизвестности.',
  1,
  true,
  '{}'::json
FROM site_pages sp
WHERE sp.slug='blog'
  AND NOT EXISTS (
    SELECT 1 FROM page_sections ps
    WHERE ps.page=sp.id AND ps.section_key='blog_index_live'
  );

DROP FUNCTION isvoi_blog_upsert_collection(varchar,varchar,text,varchar,varchar,varchar,integer,varchar,text);

CREATE OR REPLACE FUNCTION isvoi_blog_upsert_field(
  p_collection varchar,
  p_field varchar,
  p_interface varchar,
  p_display varchar,
  p_options json,
  p_width varchar,
  p_sort integer,
  p_note text,
  p_readonly boolean DEFAULT false,
  p_hidden boolean DEFAULT false,
  p_required boolean DEFAULT false,
  p_special varchar DEFAULT NULL,
  p_group varchar DEFAULT NULL,
  p_translation text DEFAULT NULL,
  p_validation json DEFAULT NULL,
  p_validation_message text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_translations json;
BEGIN
  v_translations := CASE WHEN p_translation IS NULL THEN NULL ELSE
    json_build_array(json_build_object('language','ru-RU','translation',p_translation))::json END;
  IF EXISTS (SELECT 1 FROM directus_fields WHERE collection=p_collection AND field=p_field) THEN
    UPDATE directus_fields SET interface=p_interface, display=p_display, options=p_options,
      width=p_width, sort=p_sort, note=p_note, readonly=p_readonly, hidden=p_hidden,
      required=p_required, special=p_special, "group"=p_group, translations=v_translations,
      validation=p_validation, validation_message=p_validation_message
    WHERE collection=p_collection AND field=p_field;
  ELSE
    INSERT INTO directus_fields (
      collection,field,interface,display,options,width,sort,note,readonly,hidden,
      required,special,"group",translations,validation,validation_message
    ) VALUES (
      p_collection,p_field,p_interface,p_display,p_options,p_width,p_sort,p_note,p_readonly,p_hidden,
      p_required,p_special,p_group,v_translations,p_validation,p_validation_message
    );
  END IF;
END;
$$;

-- Post editor groups.
SELECT isvoi_blog_upsert_field('blog_posts','group_publication','group-detail',NULL,'{"headerIcon":"publish","start":"open"}'::json,'full',1,'Статус и календарь публикации.',false,false,false,'alias,no-data,group',NULL,'Публикация');
SELECT isvoi_blog_upsert_field('blog_posts','group_content','group-detail',NULL,'{"headerIcon":"article","start":"open"}'::json,'full',20,'Заголовок, лид и основной текст.',false,false,false,'alias,no-data,group',NULL,'Материал');
SELECT isvoi_blog_upsert_field('blog_posts','group_media','group-detail',NULL,'{"headerIcon":"image","start":"open"}'::json,'full',50,'Обложка и доступное описание изображения.',false,false,false,'alias,no-data,group',NULL,'Обложка');
SELECT isvoi_blog_upsert_field('blog_posts','group_relations','group-detail',NULL,'{"headerIcon":"hub","start":"open"}'::json,'full',70,'Рубрика, автор, теги и связанные устройства.',false,false,false,'alias,no-data,group',NULL,'Связи');
SELECT isvoi_blog_upsert_field('blog_posts','group_seo','group-detail',NULL,'{"headerIcon":"search","start":"closed"}'::json,'full',90,'Поисковый сниппет, canonical и Open Graph.',false,false,false,'alias,no-data,group',NULL,'SEO');
SELECT isvoi_blog_upsert_field('blog_posts','group_system','group-detail',NULL,'{"headerIcon":"settings","start":"closed"}'::json,'full',120,'Системные поля и история изменения.',false,false,false,'alias,no-data,group',NULL,'Системное');

SELECT isvoi_blog_upsert_field('blog_posts','status','select-dropdown','labels','{"choices":[{"text":"Черновик","value":"draft","color":"#6b7280"},{"text":"На проверке","value":"review","color":"#ca8a04"},{"text":"Запланирован","value":"scheduled","color":"#7c3aed"},{"text":"Опубликован","value":"published","color":"#16a34a"},{"text":"Архив","value":"archived","color":"#9ca3af"}]}'::json,'half',2,'Черновик не виден на сайте. Published требует заполненных обязательных публичных полей.',false,false,true,NULL,'group_publication','Статус','{"status":{"_in":["draft","review","scheduled","published","archived"]}}'::json,'Выберите рабочий статус.');
SELECT isvoi_blog_upsert_field('blog_posts','featured','boolean','boolean',NULL,'half',3,'Показывать материал в выделенной позиции на главной блога.',false,false,false,NULL,'group_publication','Избранный');
SELECT isvoi_blog_upsert_field('blog_posts','publish_at','datetime','datetime','{"includeSeconds":false,"use24":true}'::json,'half',4,'Плановая дата. Нужна для статуса scheduled; автоматическая публикация будет настроена отдельным Flow.',false,false,false,NULL,'group_publication','Запланировать на');
SELECT isvoi_blog_upsert_field('blog_posts','published_at','datetime','datetime','{"includeSeconds":false,"use24":true}'::json,'half',5,'Фактическая публичная дата. Публичный API не отдает материал, пока эта дата не наступила.',false,false,false,NULL,'group_publication','Опубликовано');

SELECT isvoi_blog_upsert_field('blog_posts','title','input',NULL,'{"placeholder":"Что важно проверить перед покупкой iPhone"}'::json,'full',21,'Ясный человеческий заголовок без кликбейта.',false,false,true,NULL,'group_content','Заголовок','{"title":{"_nnull":true}}'::json,'Заполните заголовок.');
SELECT isvoi_blog_upsert_field('blog_posts','slug','input',NULL,'{"slug":true,"trim":true,"placeholder":"kak-proverit-iphone"}'::json,'full',22,'Постоянный URL латиницей. После публикации не меняйте без redirect.',false,false,true,NULL,'group_content','URL slug','{"slug":{"_regex":"^[a-z0-9]+(?:-[a-z0-9]+)*$"}}'::json,'Используйте латиницу, цифры и дефисы.');
SELECT isvoi_blog_upsert_field('blog_posts','excerpt','input-multiline',NULL,'{"trim":true}'::json,'full',23,'Короткий лид для карточек и верхней части статьи, обычно 140–220 знаков.',false,false,false,NULL,'group_content','Лид');
SELECT isvoi_blog_upsert_field('blog_posts','body','input-rich-text-html',NULL,'{"toolbar":["bold","italic","bullist","numlist","blockquote","link","removeformat"],"folder":"ISVOI Blog"}'::json,'full',24,'Основной текст. Используйте короткие абзацы, H2/H3, списки и ссылки; не вставляйте стили, скрипты и произвольную вёрстку.',false,false,false,NULL,'group_content','Текст');

SELECT isvoi_blog_upsert_field('blog_posts','cover_image','file-image','image','{"folder":"ISVOI Blog"}'::json,'half',51,'Основная обложка из папки ISVOI Blog.',false,false,false,'m2o','group_media','Обложка');
SELECT isvoi_blog_upsert_field('blog_posts','cover_alt','input',NULL,NULL,'half',52,'Кратко опишите полезное содержание обложки. Для публикации поле обязательно.',false,false,false,NULL,'group_media','Alt-текст');
SELECT isvoi_blog_upsert_field('blog_posts','cover_caption','input-multiline',NULL,NULL,'full',53,'Необязательная подпись или источник изображения.',false,false,false,NULL,'group_media','Подпись');

SELECT isvoi_blog_upsert_field('blog_posts','category','select-dropdown-m2o','related-values','{"template":"{{name}} · {{slug}}","filter":{"is_active":{"_eq":true}}}'::json,'half',71,'Одна основная рубрика материала.',false,false,false,'m2o','group_relations','Рубрика');
SELECT isvoi_blog_upsert_field('blog_posts','author','select-dropdown-m2o','related-values','{"template":"{{name}} · {{role_title}}","filter":{"is_active":{"_eq":true}}}'::json,'half',72,'Публичный автор или эксперт, отвечающий за материал.',false,false,false,'m2o','group_relations','Автор');
SELECT isvoi_blog_upsert_field('blog_posts','tags','list-m2m','related-values','{"template":"{{blog_tags_id.name}}","enableCreate":true,"enableSelect":true}'::json,'full',73,'Только устойчивые тематические теги, без дублей и синонимов.',false,false,false,'m2m','group_relations','Теги');
SELECT isvoi_blog_upsert_field('blog_posts','devices','list-m2m','related-values','{"template":"{{devices_id.title}} · {{devices_id.price_text}}","enableCreate":true,"enableSelect":true,"fields":["sort","devices_id"]}'::json,'full',74,'Опциональные карточки релевантных устройств из каталога.',false,false,false,'m2m','group_relations','Связанные устройства');

SELECT isvoi_blog_upsert_field('blog_posts','seo_title','input',NULL,'{"trim":true}'::json,'full',91,'Необязательно. Если пусто, используется заголовок материала.',false,false,false,NULL,'group_seo','SEO title');
SELECT isvoi_blog_upsert_field('blog_posts','meta_description','input-multiline',NULL,'{"trim":true}'::json,'full',92,'Описание поискового сниппета, ориентир 140–160 знаков.',false,false,false,NULL,'group_seo','Meta description');
SELECT isvoi_blog_upsert_field('blog_posts','canonical_url','input',NULL,'{"placeholder":"https://isvoi.ru/blog/..."}'::json,'full',93,'Только для дублируемого материала с внешним каноническим источником.',false,false,false,NULL,'group_seo','Canonical URL');
SELECT isvoi_blog_upsert_field('blog_posts','no_index','boolean','boolean',NULL,'half',94,'Запретить индексацию, сохранив доступ по прямой ссылке.',false,false,false,NULL,'group_seo','No index');
SELECT isvoi_blog_upsert_field('blog_posts','og_image','file-image','image','{"folder":"ISVOI Blog"}'::json,'half',95,'Отдельная social preview-картинка. Если пусто, используется обложка.',false,false,false,'m2o','group_seo','OG image');

SELECT isvoi_blog_upsert_field('blog_posts','id','input',NULL,NULL,'half',121,'Системный ID.',true,true,false,'uuid','group_system','ID');
SELECT isvoi_blog_upsert_field('blog_posts','date_created','datetime','datetime',NULL,'half',122,'Создано.',true,false,false,'date-created','group_system','Создано');
SELECT isvoi_blog_upsert_field('blog_posts','date_updated','datetime','datetime',NULL,'half',123,'Обновлено.',true,false,false,'date-updated','group_system','Обновлено');
SELECT isvoi_blog_upsert_field('blog_posts','user_created','select-dropdown-m2o','user',NULL,'half',124,'Кто создал запись.',true,false,false,'user-created,m2o','group_system','Создал');
SELECT isvoi_blog_upsert_field('blog_posts','user_updated','select-dropdown-m2o','user',NULL,'half',125,'Кто обновил запись.',true,false,false,'user-updated,m2o','group_system','Обновил');

-- Supporting dictionaries.
SELECT isvoi_blog_upsert_field('blog_authors','name','input',NULL,NULL,'full',1,'Публичное имя автора.',false,false,true,NULL,NULL,'Имя');
SELECT isvoi_blog_upsert_field('blog_authors','slug','input',NULL,'{"slug":true,"trim":true}'::json,'half',2,'Стабильный slug латиницей.',false,false,true,NULL,NULL,'Slug','{"slug":{"_regex":"^[a-z0-9]+(?:-[a-z0-9]+)*$"}}'::json,'Используйте латиницу, цифры и дефисы.');
SELECT isvoi_blog_upsert_field('blog_authors','role_title','input',NULL,NULL,'half',3,'Роль или область экспертизы.',false,false,false,NULL,NULL,'Роль');
SELECT isvoi_blog_upsert_field('blog_authors','bio','input-multiline',NULL,NULL,'full',4,'Коротко объясните опыт и компетенцию автора.',false,false,false,NULL,NULL,'Биография');
SELECT isvoi_blog_upsert_field('blog_authors','avatar','file-image','image','{"folder":"ISVOI Blog"}'::json,'half',5,'Портрет из папки ISVOI Blog.',false,false,false,'m2o',NULL,'Фото');
SELECT isvoi_blog_upsert_field('blog_authors','is_active','boolean','boolean',NULL,'half',6,'Доступен для новых и публичных материалов.',false,false,false,NULL,NULL,'Активен');
SELECT isvoi_blog_upsert_field('blog_authors','sort','input',NULL,'{"min":1,"step":1}'::json,'half',7,'Порядок в справочнике.',false,false,false,NULL,NULL,'Порядок');
SELECT isvoi_blog_upsert_field('blog_authors','id','input',NULL,NULL,'half',90,'Системный ID.',true,true,false,'uuid',NULL,'ID');
SELECT isvoi_blog_upsert_field('blog_authors','date_created','datetime','datetime',NULL,'half',91,'Создано.',true,true,false,'date-created',NULL,'Создано');
SELECT isvoi_blog_upsert_field('blog_authors','date_updated','datetime','datetime',NULL,'half',92,'Обновлено.',true,true,false,'date-updated',NULL,'Обновлено');

SELECT isvoi_blog_upsert_field('blog_categories','name','input',NULL,NULL,'full',1,'Название рубрики для посетителя.',false,false,true,NULL,NULL,'Название');
SELECT isvoi_blog_upsert_field('blog_categories','slug','input',NULL,'{"slug":true,"trim":true}'::json,'half',2,'Стабильный slug латиницей.',false,false,true,NULL,NULL,'Slug','{"slug":{"_regex":"^[a-z0-9]+(?:-[a-z0-9]+)*$"}}'::json,'Используйте латиницу, цифры и дефисы.');
SELECT isvoi_blog_upsert_field('blog_categories','description','input-multiline',NULL,NULL,'full',3,'Короткое описание тематической рубрики.',false,false,false,NULL,NULL,'Описание');
SELECT isvoi_blog_upsert_field('blog_categories','is_active','boolean','boolean',NULL,'half',4,'Показывать рубрику и разрешать выбор в материалах.',false,false,false,NULL,NULL,'Активна');
SELECT isvoi_blog_upsert_field('blog_categories','sort','input',NULL,'{"min":1,"step":1}'::json,'half',5,'Порядок рубрик.',false,false,false,NULL,NULL,'Порядок');
SELECT isvoi_blog_upsert_field('blog_categories','id','input',NULL,NULL,'half',90,'Системный ID.',true,true,false,'uuid',NULL,'ID');
SELECT isvoi_blog_upsert_field('blog_categories','date_created','datetime','datetime',NULL,'half',91,'Создано.',true,true,false,'date-created',NULL,'Создано');
SELECT isvoi_blog_upsert_field('blog_categories','date_updated','datetime','datetime',NULL,'half',92,'Обновлено.',true,true,false,'date-updated',NULL,'Обновлено');

SELECT isvoi_blog_upsert_field('blog_tags','name','input',NULL,NULL,'full',1,'Короткое название тега.',false,false,true,NULL,NULL,'Название');
SELECT isvoi_blog_upsert_field('blog_tags','slug','input',NULL,'{"slug":true,"trim":true}'::json,'half',2,'Стабильный slug латиницей.',false,false,true,NULL,NULL,'Slug','{"slug":{"_regex":"^[a-z0-9]+(?:-[a-z0-9]+)*$"}}'::json,'Используйте латиницу, цифры и дефисы.');
SELECT isvoi_blog_upsert_field('blog_tags','is_active','boolean','boolean',NULL,'half',3,'Доступен для новых и публичных материалов.',false,false,false,NULL,NULL,'Активен');
SELECT isvoi_blog_upsert_field('blog_tags','id','input',NULL,NULL,'half',90,'Системный ID.',true,true,false,'uuid',NULL,'ID');
SELECT isvoi_blog_upsert_field('blog_tags','date_created','datetime','datetime',NULL,'half',91,'Создано.',true,true,false,'date-created',NULL,'Создано');
SELECT isvoi_blog_upsert_field('blog_tags','date_updated','datetime','datetime',NULL,'half',92,'Обновлено.',true,true,false,'date-updated',NULL,'Обновлено');

-- Junction fields are hidden from normal navigation but remain fully modeled.
SELECT isvoi_blog_upsert_field('blog_posts_tags','id','input',NULL,NULL,'half',1,'Системный ID.',true,true,false,'uuid',NULL,'ID');
SELECT isvoi_blog_upsert_field('blog_posts_tags','blog_posts_id','select-dropdown-m2o','related-values','{"template":"{{title}}"}'::json,'half',2,'Материал.',false,false,true,'m2o',NULL,'Материал');
SELECT isvoi_blog_upsert_field('blog_posts_tags','blog_tags_id','select-dropdown-m2o','related-values','{"template":"{{name}}"}'::json,'half',3,'Тег.',false,false,true,'m2o',NULL,'Тег');
SELECT isvoi_blog_upsert_field('blog_posts_devices','id','input',NULL,NULL,'half',1,'Системный ID.',true,true,false,'uuid',NULL,'ID');
SELECT isvoi_blog_upsert_field('blog_posts_devices','blog_posts_id','select-dropdown-m2o','related-values','{"template":"{{title}}"}'::json,'half',2,'Материал.',false,false,true,'m2o',NULL,'Материал');
SELECT isvoi_blog_upsert_field('blog_posts_devices','devices_id','select-dropdown-m2o','related-values','{"template":"{{title}} · {{price_text}}"}'::json,'full',3,'Устройство каталога.',false,false,true,'m2o',NULL,'Устройство');
SELECT isvoi_blog_upsert_field('blog_posts_devices','sort','input',NULL,'{"min":1,"step":1}'::json,'half',4,'Порядок карточки в материале.',false,false,false,NULL,NULL,'Порядок');

DROP FUNCTION isvoi_blog_upsert_field(varchar,varchar,varchar,varchar,json,varchar,integer,text,boolean,boolean,boolean,varchar,varchar,text,json,text);

CREATE OR REPLACE FUNCTION isvoi_blog_upsert_relation(
  p_many_collection varchar,
  p_many_field varchar,
  p_one_collection varchar,
  p_one_field varchar,
  p_one_deselect_action varchar,
  p_junction_field varchar DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM directus_relations WHERE many_collection=p_many_collection AND many_field=p_many_field) THEN
    UPDATE directus_relations SET one_collection=p_one_collection, one_field=p_one_field,
      one_deselect_action=p_one_deselect_action, junction_field=p_junction_field
    WHERE many_collection=p_many_collection AND many_field=p_many_field;
  ELSE
    INSERT INTO directus_relations (
      many_collection,many_field,one_collection,one_field,one_deselect_action,junction_field
    ) VALUES (
      p_many_collection,p_many_field,p_one_collection,p_one_field,p_one_deselect_action,p_junction_field
    );
  END IF;
END;
$$;

SELECT isvoi_blog_upsert_relation('blog_authors','avatar','directus_files',NULL,'nullify');
SELECT isvoi_blog_upsert_relation('blog_posts','cover_image','directus_files',NULL,'nullify');
SELECT isvoi_blog_upsert_relation('blog_posts','og_image','directus_files',NULL,'nullify');
SELECT isvoi_blog_upsert_relation('blog_posts','category','blog_categories',NULL,'nullify');
SELECT isvoi_blog_upsert_relation('blog_posts','author','blog_authors',NULL,'nullify');
SELECT isvoi_blog_upsert_relation('blog_posts','user_created','directus_users',NULL,'nullify');
SELECT isvoi_blog_upsert_relation('blog_posts','user_updated','directus_users',NULL,'nullify');
SELECT isvoi_blog_upsert_relation('blog_posts_tags','blog_posts_id','blog_posts','tags','delete','blog_tags_id');
SELECT isvoi_blog_upsert_relation('blog_posts_tags','blog_tags_id','blog_tags',NULL,'delete','blog_posts_id');
SELECT isvoi_blog_upsert_relation('blog_posts_devices','blog_posts_id','blog_posts','devices','delete','devices_id');
SELECT isvoi_blog_upsert_relation('blog_posts_devices','devices_id','devices',NULL,'delete','blog_posts_id');

DROP FUNCTION isvoi_blog_upsert_relation(varchar,varchar,varchar,varchar,varchar,varchar);

CREATE OR REPLACE FUNCTION isvoi_blog_upsert_permission(
  p_policy_name text,
  p_collection varchar,
  p_action varchar,
  p_fields text,
  p_permissions json DEFAULT NULL,
  p_validation json DEFAULT NULL,
  p_presets json DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE v_policy uuid;
BEGIN
  SELECT id INTO v_policy FROM directus_policies WHERE name=p_policy_name LIMIT 1;
  IF v_policy IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM directus_permissions WHERE policy=v_policy AND collection=p_collection AND action=p_action) THEN
    UPDATE directus_permissions SET fields=p_fields, permissions=p_permissions,
      validation=p_validation, presets=p_presets
    WHERE policy=v_policy AND collection=p_collection AND action=p_action;
  ELSE
    INSERT INTO directus_permissions (policy,collection,action,fields,permissions,validation,presets)
    VALUES (v_policy,p_collection,p_action,p_fields,p_permissions,p_validation,p_presets);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION isvoi_blog_delete_permission(
  p_policy_name text, p_collection varchar, p_action varchar
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE v_policy uuid;
BEGIN
  SELECT id INTO v_policy FROM directus_policies WHERE name=p_policy_name LIMIT 1;
  IF v_policy IS NULL THEN RETURN; END IF;
  DELETE FROM directus_permissions WHERE policy=v_policy AND collection=p_collection AND action=p_action;
END;
$$;

SELECT isvoi_blog_upsert_permission('ISVOI Editor','blog_posts','read','id,status,slug,title,excerpt,body,cover_image,cover_alt,cover_caption,category,author,featured,publish_at,published_at,seo_title,meta_description,canonical_url,no_index,og_image,date_created,date_updated,user_created,user_updated,tags,devices',NULL);
SELECT isvoi_blog_upsert_permission('ISVOI Editor','blog_posts','create','status,slug,title,excerpt,body,cover_image,cover_alt,cover_caption,category,author,featured,publish_at,published_at,seo_title,meta_description,canonical_url,no_index,og_image,tags,devices',NULL,'{"status":{"_in":["draft","review","scheduled","published","archived"]},"slug":{"_regex":"^[a-z0-9]+(?:-[a-z0-9]+)*$"},"title":{"_nnull":true}}'::json,'{"status":"draft","featured":false,"no_index":false}'::json);
SELECT isvoi_blog_upsert_permission('ISVOI Editor','blog_posts','update','status,slug,title,excerpt,body,cover_image,cover_alt,cover_caption,category,author,featured,publish_at,published_at,seo_title,meta_description,canonical_url,no_index,og_image,tags,devices',NULL,'{"status":{"_in":["draft","review","scheduled","published","archived"]},"slug":{"_regex":"^[a-z0-9]+(?:-[a-z0-9]+)*$"},"title":{"_nnull":true}}'::json);

SELECT isvoi_blog_upsert_permission('ISVOI Editor','blog_authors','read','id,name,slug,role_title,bio,avatar,is_active,sort,date_created,date_updated',NULL);
SELECT isvoi_blog_upsert_permission('ISVOI Editor','blog_authors','create','name,slug,role_title,bio,avatar,is_active,sort',NULL,'{"name":{"_nnull":true},"slug":{"_regex":"^[a-z0-9]+(?:-[a-z0-9]+)*$"}}'::json,'{"is_active":true,"sort":100}'::json);
SELECT isvoi_blog_upsert_permission('ISVOI Editor','blog_authors','update','name,slug,role_title,bio,avatar,is_active,sort',NULL,'{"name":{"_nnull":true},"slug":{"_regex":"^[a-z0-9]+(?:-[a-z0-9]+)*$"}}'::json);
SELECT isvoi_blog_upsert_permission('ISVOI Editor','blog_categories','read','id,name,slug,description,is_active,sort,date_created,date_updated',NULL);
SELECT isvoi_blog_upsert_permission('ISVOI Editor','blog_categories','create','name,slug,description,is_active,sort',NULL,'{"name":{"_nnull":true},"slug":{"_regex":"^[a-z0-9]+(?:-[a-z0-9]+)*$"}}'::json,'{"is_active":true,"sort":100}'::json);
SELECT isvoi_blog_upsert_permission('ISVOI Editor','blog_categories','update','name,slug,description,is_active,sort',NULL,'{"name":{"_nnull":true},"slug":{"_regex":"^[a-z0-9]+(?:-[a-z0-9]+)*$"}}'::json);
SELECT isvoi_blog_upsert_permission('ISVOI Editor','blog_tags','read','id,name,slug,is_active,date_created,date_updated',NULL);
SELECT isvoi_blog_upsert_permission('ISVOI Editor','blog_tags','create','name,slug,is_active',NULL,'{"name":{"_nnull":true},"slug":{"_regex":"^[a-z0-9]+(?:-[a-z0-9]+)*$"}}'::json,'{"is_active":true}'::json);
SELECT isvoi_blog_upsert_permission('ISVOI Editor','blog_tags','update','name,slug,is_active',NULL,'{"name":{"_nnull":true},"slug":{"_regex":"^[a-z0-9]+(?:-[a-z0-9]+)*$"}}'::json);
SELECT isvoi_blog_upsert_permission('ISVOI Editor','blog_posts_tags','read','id,blog_posts_id,blog_tags_id',NULL);
SELECT isvoi_blog_upsert_permission('ISVOI Editor','blog_posts_tags','create','blog_posts_id,blog_tags_id',NULL,'{"blog_posts_id":{"_nnull":true},"blog_tags_id":{"_nnull":true}}'::json);
SELECT isvoi_blog_upsert_permission('ISVOI Editor','blog_posts_tags','update','blog_posts_id,blog_tags_id',NULL);
SELECT isvoi_blog_upsert_permission('ISVOI Editor','blog_posts_devices','read','id,blog_posts_id,devices_id,sort',NULL);
SELECT isvoi_blog_upsert_permission('ISVOI Editor','blog_posts_devices','create','blog_posts_id,devices_id,sort',NULL,'{"blog_posts_id":{"_nnull":true},"devices_id":{"_nnull":true}}'::json,'{"sort":100}'::json);
SELECT isvoi_blog_upsert_permission('ISVOI Editor','blog_posts_devices','update','blog_posts_id,devices_id,sort',NULL);

-- Content Versions are a system collection, so keep Editor access scoped to
-- blog_posts and to the exact fields needed by Directus version workflows.
SELECT isvoi_blog_upsert_permission('ISVOI Editor','directus_versions','read','id,key,name,collection,item,hash,date_created,date_updated,user_created,user_updated,delta','{"collection":{"_eq":"blog_posts"}}'::json);
SELECT isvoi_blog_upsert_permission('ISVOI Editor','directus_versions','create','key,name,collection,item',NULL,'{"collection":{"_eq":"blog_posts"}}'::json,'{"collection":"blog_posts"}'::json);
SELECT isvoi_blog_upsert_permission('ISVOI Editor','directus_versions','update','key,name,delta','{"collection":{"_eq":"blog_posts"}}'::json);
SELECT isvoi_blog_upsert_permission('ISVOI Editor','directus_versions','delete','id,key,name,collection,item','{"collection":{"_eq":"blog_posts"}}'::json);

SELECT isvoi_blog_delete_permission('ISVOI Editor','blog_posts','delete');
SELECT isvoi_blog_delete_permission('ISVOI Editor','blog_authors','delete');
SELECT isvoi_blog_delete_permission('ISVOI Editor','blog_categories','delete');
SELECT isvoi_blog_delete_permission('ISVOI Editor','blog_tags','delete');
SELECT isvoi_blog_upsert_permission('ISVOI Editor','blog_posts_tags','delete','id,blog_posts_id,blog_tags_id',NULL);
SELECT isvoi_blog_upsert_permission('ISVOI Editor','blog_posts_devices','delete','id,blog_posts_id,devices_id',NULL);

SELECT isvoi_blog_upsert_permission('ISVOI Public Read','blog_posts','read','id,slug,title,excerpt,body,cover_image,cover_alt,cover_caption,category,author,featured,published_at,seo_title,meta_description,canonical_url,no_index,og_image,date_updated,tags,devices','{"_and":[{"status":{"_eq":"published"}},{"published_at":{"_lte":"$NOW"}}]}'::json);
SELECT isvoi_blog_upsert_permission('ISVOI Public Read','blog_authors','read','id,name,slug,role_title,bio,avatar,sort','{"is_active":{"_eq":true}}'::json);
SELECT isvoi_blog_upsert_permission('ISVOI Public Read','blog_categories','read','id,name,slug,description,sort','{"is_active":{"_eq":true}}'::json);
SELECT isvoi_blog_upsert_permission('ISVOI Public Read','blog_tags','read','id,name,slug','{"is_active":{"_eq":true}}'::json);
SELECT isvoi_blog_upsert_permission('ISVOI Public Read','blog_posts_tags','read','id,blog_posts_id,blog_tags_id','{"blog_posts_id":{"_and":[{"status":{"_eq":"published"}},{"published_at":{"_lte":"$NOW"}}]}}'::json);
SELECT isvoi_blog_upsert_permission('ISVOI Public Read','blog_posts_devices','read','id,blog_posts_id,devices_id,sort','{"blog_posts_id":{"_and":[{"status":{"_eq":"published"}},{"published_at":{"_lte":"$NOW"}}]}}'::json);

SELECT isvoi_blog_upsert_permission('ISVOI Blog Preview','blog_posts','read','id,status,slug,title,excerpt,body,cover_image,cover_alt,cover_caption,category,author,featured,publish_at,published_at,seo_title,meta_description,canonical_url,no_index,og_image,date_created,date_updated,tags,devices',NULL);
SELECT isvoi_blog_upsert_permission('ISVOI Blog Preview','blog_authors','read','id,name,slug,role_title,bio,avatar,is_active,sort,date_created,date_updated',NULL);
SELECT isvoi_blog_upsert_permission('ISVOI Blog Preview','blog_categories','read','id,name,slug,description,is_active,sort,date_created,date_updated',NULL);
SELECT isvoi_blog_upsert_permission('ISVOI Blog Preview','blog_tags','read','id,name,slug,is_active,date_created,date_updated',NULL);
SELECT isvoi_blog_upsert_permission('ISVOI Blog Preview','blog_posts_tags','read','id,blog_posts_id,blog_tags_id',NULL);
SELECT isvoi_blog_upsert_permission('ISVOI Blog Preview','blog_posts_devices','read','id,blog_posts_id,devices_id,sort',NULL);
SELECT isvoi_blog_upsert_permission('ISVOI Blog Preview','directus_files','read','id,filename_download,type,width,height,focal_point_x,focal_point_y',NULL);
SELECT isvoi_blog_upsert_permission('ISVOI Blog Preview','devices','read','id,title,price_text,stock_status',NULL);
SELECT isvoi_blog_upsert_permission('ISVOI Blog Preview','directus_versions','read','id,key,name,collection,item,hash,date_created,date_updated,delta','{"collection":{"_eq":"blog_posts"}}'::json);

DROP FUNCTION isvoi_blog_upsert_permission(text,varchar,varchar,text,json,json,json);
DROP FUNCTION isvoi_blog_delete_permission(text,varchar,varchar);

CREATE OR REPLACE FUNCTION isvoi_blog_upsert_preset(
  p_role_name text,
  p_collection varchar,
  p_bookmark varchar,
  p_icon varchar,
  p_color varchar,
  p_filter json,
  p_layout_query json
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE v_role uuid;
BEGIN
  SELECT id INTO v_role FROM directus_roles WHERE name=p_role_name LIMIT 1;
  IF v_role IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM directus_presets WHERE role=v_role AND collection=p_collection AND bookmark=p_bookmark AND "user" IS NULL) THEN
    UPDATE directus_presets SET icon=p_icon,color=p_color,filter=p_filter,layout='tabular',
      layout_query=p_layout_query,layout_options=NULL,refresh_interval=NULL,search=NULL
    WHERE role=v_role AND collection=p_collection AND bookmark=p_bookmark AND "user" IS NULL;
  ELSE
    INSERT INTO directus_presets (bookmark,role,"user",collection,search,layout,layout_query,layout_options,refresh_interval,filter,icon,color)
    VALUES (p_bookmark,v_role,NULL,p_collection,NULL,'tabular',p_layout_query,NULL,NULL,p_filter,p_icon,p_color);
  END IF;
END;
$$;

SELECT isvoi_blog_upsert_preset('ISVOI Editor','blog_posts','Черновики','edit_note','#6b7280','{"status":{"_eq":"draft"}}'::json,'{"tabular":{"sort":["-date_updated"],"fields":["status","title","category","author","date_updated"],"page":1}}'::json);
SELECT isvoi_blog_upsert_preset('ISVOI Editor','blog_posts','На проверке','fact_check','#ca8a04','{"status":{"_eq":"review"}}'::json,'{"tabular":{"sort":["-date_updated"],"fields":["status","title","category","author","date_updated"],"page":1}}'::json);
SELECT isvoi_blog_upsert_preset('ISVOI Editor','blog_posts','Запланированные','schedule','#7c3aed','{"status":{"_eq":"scheduled"}}'::json,'{"tabular":{"sort":["publish_at"],"fields":["status","publish_at","title","category","author"],"page":1}}'::json);
SELECT isvoi_blog_upsert_preset('ISVOI Editor','blog_posts','Опубликованные','public','#16a34a','{"status":{"_eq":"published"}}'::json,'{"tabular":{"sort":["-published_at"],"fields":["featured","published_at","title","category","author"],"page":1}}'::json);
SELECT isvoi_blog_upsert_preset('ISVOI Editor','blog_posts','Неполные материалы','warning','#dc2626','{"_or":[{"excerpt":{"_null":true}},{"body":{"_null":true}},{"cover_image":{"_null":true}},{"category":{"_null":true}},{"author":{"_null":true}}]}'::json,'{"tabular":{"sort":["-date_updated"],"fields":["status","title","excerpt","cover_image","category","author"],"page":1}}'::json);

DROP FUNCTION isvoi_blog_upsert_preset(text,varchar,varchar,varchar,varchar,json,json);

COMMIT;

SELECT 'blog.collections' AS check_name, count(*)::text AS value
FROM directus_collections WHERE collection IN ('blog_posts','blog_authors','blog_categories','blog_tags','blog_posts_tags','blog_posts_devices')
UNION ALL
SELECT 'blog.folder', count(*)::text FROM directus_folders WHERE name='ISVOI Blog' AND parent IS NULL
UNION ALL
SELECT 'blog.relations', count(*)::text FROM directus_relations WHERE many_collection LIKE 'blog_%'
UNION ALL
SELECT 'blog.editor_permissions', count(*)::text FROM directus_permissions
WHERE policy IN (SELECT id FROM directus_policies WHERE name='ISVOI Editor') AND collection LIKE 'blog_%'
UNION ALL
SELECT 'blog.public_permissions', count(*)::text FROM directus_permissions
WHERE policy IN (SELECT id FROM directus_policies WHERE name='ISVOI Public Read') AND collection LIKE 'blog_%'
UNION ALL
SELECT 'blog.preview_permissions', count(*)::text FROM directus_permissions
WHERE policy IN (SELECT id FROM directus_policies WHERE name='ISVOI Blog Preview');
`);
