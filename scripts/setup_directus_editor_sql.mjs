#!/usr/bin/env node

/**
 * Print idempotent SQL that organizes Directus Studio for catalog editors.
 *
 * Usage:
 *   node scripts/setup_directus_editor_sql.mjs \
 *     | docker compose exec -T database sh -lc 'psql -U $POSTGRES_USER -d $POSTGRES_DB -v ON_ERROR_STOP=1'
 */

process.stdout.write(String.raw`
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION isvoi_role_id(p_name text)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM directus_roles WHERE name = p_name LIMIT 1;
  IF v_id IS NULL THEN
    v_id := gen_random_uuid();
    INSERT INTO directus_roles (id, name, icon, description)
    VALUES (
      v_id,
      p_name,
      CASE p_name
        WHEN 'ISVOI Editor' THEN 'edit_note'
        WHEN 'ISVOI Importer' THEN 'upload_file'
        ELSE 'person'
      END,
      CASE p_name
        WHEN 'ISVOI Editor' THEN 'Редактор каталога: ручное ведение карточек, фото и заявок без доступа к системным настройкам.'
        WHEN 'ISVOI Importer' THEN 'Импорт каталога: загрузка устройств, файлов и служебных import/source полей без управления ролями.'
        ELSE NULL
      END
    );
  ELSE
    UPDATE directus_roles
    SET icon = CASE p_name
        WHEN 'ISVOI Editor' THEN 'edit_note'
        WHEN 'ISVOI Importer' THEN 'upload_file'
        ELSE icon
      END,
      description = CASE p_name
        WHEN 'ISVOI Editor' THEN 'Редактор каталога: ручное ведение карточек, фото и заявок без доступа к системным настройкам.'
        WHEN 'ISVOI Importer' THEN 'Импорт каталога: загрузка устройств, файлов и служебных import/source полей без управления ролями.'
        ELSE description
      END
    WHERE id = v_id;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION isvoi_policy_id(p_name text, p_icon text, p_description text, p_app_access boolean)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM directus_policies WHERE name = p_name LIMIT 1;
  IF v_id IS NULL THEN
    v_id := gen_random_uuid();
    INSERT INTO directus_policies (id, name, icon, description, app_access, admin_access, enforce_tfa)
    VALUES (v_id, p_name, p_icon, p_description, p_app_access, false, false);
  ELSE
    UPDATE directus_policies
    SET icon = p_icon,
      description = p_description,
      app_access = p_app_access,
      admin_access = false
    WHERE id = v_id;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION isvoi_bind_policy_to_role(p_role_name text, p_policy_name text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_role uuid;
  v_policy uuid;
BEGIN
  SELECT id INTO v_role FROM directus_roles WHERE name = p_role_name LIMIT 1;
  SELECT id INTO v_policy FROM directus_policies WHERE name = p_policy_name LIMIT 1;
  IF v_role IS NULL OR v_policy IS NULL THEN
    RAISE EXCEPTION 'Missing role or policy: %, %', p_role_name, p_policy_name;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM directus_access WHERE role = v_role AND policy = v_policy
  ) THEN
    INSERT INTO directus_access (id, role, policy, sort)
    VALUES (gen_random_uuid(), v_role, v_policy, 1);
  END IF;
END;
$$;

SELECT isvoi_role_id('ISVOI Editor');
SELECT isvoi_role_id('ISVOI Importer');
SELECT isvoi_policy_id(
  'ISVOI Editor',
  'edit_note',
  'Manual catalog/content editing: devices, device images and lead processing. No system administration.',
  true
);
SELECT isvoi_policy_id(
  'ISVOI Importer',
  'upload_file',
  'Catalog import automation: device rows, media rows and file uploads. No system administration.',
  true
);
SELECT isvoi_bind_policy_to_role('ISVOI Editor', 'ISVOI Editor');
SELECT isvoi_bind_policy_to_role('ISVOI Importer', 'ISVOI Importer');

CREATE OR REPLACE FUNCTION isvoi_upsert_collection_metadata(
  p_collection varchar,
  p_icon varchar,
  p_note text,
  p_display_template varchar,
  p_sort_field varchar DEFAULT NULL,
  p_color varchar DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM directus_collections WHERE collection = p_collection
  ) THEN
    UPDATE directus_collections
    SET icon = p_icon,
      note = p_note,
      display_template = p_display_template,
      hidden = false,
      singleton = false,
      sort_field = p_sort_field,
      accountability = COALESCE(accountability, 'all'),
      color = p_color
    WHERE collection = p_collection;
  ELSE
    INSERT INTO directus_collections (
      collection, icon, note, display_template, hidden, singleton, sort_field,
      accountability, color
    ) VALUES (
      p_collection, p_icon, p_note, p_display_template, false, false,
      p_sort_field, 'all', p_color
    );
  END IF;
END;
$$;

SELECT isvoi_upsert_collection_metadata(
  'devices',
  'devices',
  'Редакторский каталог устройств. Заполняйте публикацию, цену, основные характеристики, фото и тексты; import/source поля обычно меняются импорт-скриптами.',
  '{{title}} · {{price_text}} · {{stock_status}}',
  'sort',
  '#111827'
);
SELECT isvoi_upsert_collection_metadata(
  'device_images',
  'photo_library',
  'Управляемые фото устройств. Для публикации нужны status=published и shot_status=approved.',
  '{{device.title}} · {{role}} · {{label}}',
  'sort',
  '#2563eb'
);
SELECT isvoi_upsert_collection_metadata(
  'leads',
  'contact_mail',
  'Заявки с сайта. Редактор/менеджер видит и меняет статус обработки, но публичный сайт только создает заявки через отдельную политику.',
  '{{kind}} · {{contact}} · {{status}}',
  NULL,
  '#16a34a'
);

CREATE OR REPLACE FUNCTION isvoi_upsert_permission(
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
DECLARE
  v_policy uuid;
BEGIN
  SELECT id INTO v_policy FROM directus_policies WHERE name = p_policy_name LIMIT 1;
  IF v_policy IS NULL THEN
    RAISE EXCEPTION 'Missing policy %', p_policy_name;
  END IF;

  IF EXISTS (
    SELECT 1 FROM directus_permissions
    WHERE policy = v_policy AND collection = p_collection AND action = p_action
  ) THEN
    UPDATE directus_permissions
    SET fields = p_fields,
      permissions = p_permissions,
      validation = p_validation,
      presets = p_presets
    WHERE policy = v_policy AND collection = p_collection AND action = p_action;
  ELSE
    INSERT INTO directus_permissions (
      policy, collection, action, fields, permissions, validation, presets
    ) VALUES (
      v_policy, p_collection, p_action, p_fields, p_permissions, p_validation, p_presets
    );
  END IF;
END;
$$;

-- Editor: manual catalog work and lead processing. No delete on devices.
SELECT isvoi_upsert_permission('ISVOI Editor', 'devices', 'read', '*', NULL);
SELECT isvoi_upsert_permission(
  'ISVOI Editor',
  'devices',
  'create',
  'id,status,stock_status,content_status,sort,tags,category,title,model,specs,storage,color,serial,price,price_text,grade,battery,battery_text,meta_battery,warranty,warranty_text,exit,exit_text,availability,short_description,headline,listing_file,listing_image,listing_alt,cta_label,has_detail_page,detail_href,visual_class,gallery,passport,trade,admin_note',
  NULL,
  '{"id":{"_nnull":true},"title":{"_nnull":true},"category":{"_nnull":true},"status":{"_in":["draft","published","archived"]},"stock_status":{"_in":["available","reserved","sold","hidden"]},"content_status":{"_in":["needs_content","needs_photo","review","ready"]}}'::json,
  '{"status":"draft","stock_status":"available","content_status":"review","source_system":"manual"}'::json
);
SELECT isvoi_upsert_permission(
  'ISVOI Editor',
  'devices',
  'update',
  'status,stock_status,content_status,sort,tags,category,title,model,specs,storage,color,serial,price,price_text,grade,battery,battery_text,meta_battery,warranty,warranty_text,exit,exit_text,availability,short_description,headline,listing_file,listing_image,listing_alt,cta_label,has_detail_page,detail_href,visual_class,gallery,passport,trade,admin_note',
  NULL,
  '{"status":{"_in":["draft","published","archived"]},"stock_status":{"_in":["available","reserved","sold","hidden"]},"content_status":{"_in":["needs_content","needs_photo","review","ready"]}}'::json
);
SELECT isvoi_upsert_permission('ISVOI Editor', 'device_images', 'read', '*', NULL);
SELECT isvoi_upsert_permission(
  'ISVOI Editor',
  'device_images',
  'create',
  'status,shot_status,device,role,sort,image,label,alt',
  NULL,
  '{"device":{"_nnull":true},"image":{"_nnull":true},"role":{"_in":["card","main","screen","body","defect","other"]},"status":{"_in":["draft","published","archived"]},"shot_status":{"_in":["needs_review","approved","rejected"]}}'::json,
  '{"status":"draft","shot_status":"needs_review"}'::json
);
SELECT isvoi_upsert_permission(
  'ISVOI Editor',
  'device_images',
  'update',
  'status,shot_status,device,role,sort,image,label,alt',
  NULL,
  '{"role":{"_in":["card","main","screen","body","defect","other"]},"status":{"_in":["draft","published","archived"]},"shot_status":{"_in":["needs_review","approved","rejected"]}}'::json
);
SELECT isvoi_upsert_permission('ISVOI Editor', 'device_images', 'delete', '*', NULL);
SELECT isvoi_upsert_permission('ISVOI Editor', 'directus_files', 'read', 'id,filename_download,title,description,type,width,height,focal_point_x,focal_point_y,folder,uploaded_on,modified_on', NULL);
SELECT isvoi_upsert_permission('ISVOI Editor', 'directus_files', 'create', 'title,description,folder,file,tags', NULL);
SELECT isvoi_upsert_permission('ISVOI Editor', 'directus_files', 'update', 'title,description,folder,tags,focal_point_x,focal_point_y', NULL);
SELECT isvoi_upsert_permission('ISVOI Editor', 'leads', 'read', '*', NULL);
SELECT isvoi_upsert_permission(
  'ISVOI Editor',
  'leads',
  'update',
  'status,priority,assigned_to,contact_channel,next_action_at,last_contacted_at,manager_note,kind,scenario,name,contact,device,device_id,message,source_path,source_url,page_title,referrer,utm_source,utm_medium,utm_campaign,utm_content,utm_term',
  NULL,
  '{"status":{"_in":["new","in_progress","waiting_client","contacted","won","lost","archived"]},"priority":{"_in":["normal","high"]}}'::json
);
SELECT isvoi_upsert_permission('ISVOI Editor', 'lead_comments', 'read', '*', NULL);
SELECT isvoi_upsert_permission(
  'ISVOI Editor',
  'lead_comments',
  'create',
  'lead,created_by,comment,outcome,next_action_at',
  NULL,
  '{"lead":{"_nnull":true},"comment":{"_nnull":true}}'::json
);
SELECT isvoi_upsert_permission(
  'ISVOI Editor',
  'lead_comments',
  'update',
  'created_by,comment,outcome,next_action_at',
  NULL,
  '{"comment":{"_nnull":true}}'::json
);

-- Importer: automation/import work. Can delete media rows to replace import batches, but not leads.
SELECT isvoi_upsert_permission('ISVOI Importer', 'devices', 'read', '*', NULL);
SELECT isvoi_upsert_permission(
  'ISVOI Importer',
  'devices',
  'create',
  '*',
  NULL,
  '{"id":{"_nnull":true},"source_system":{"_nnull":true},"status":{"_in":["draft","published","archived"]},"stock_status":{"_in":["available","reserved","sold","hidden"]}}'::json,
  '{"status":"draft","stock_status":"available","content_status":"review","source_system":"xlsx"}'::json
);
SELECT isvoi_upsert_permission(
  'ISVOI Importer',
  'devices',
  'update',
  '*',
  NULL,
  '{"status":{"_in":["draft","published","archived"]},"stock_status":{"_in":["available","reserved","sold","hidden"]}}'::json
);
SELECT isvoi_upsert_permission('ISVOI Importer', 'device_images', 'read', '*', NULL);
SELECT isvoi_upsert_permission(
  'ISVOI Importer',
  'device_images',
  'create',
  '*',
  NULL,
  '{"device":{"_nnull":true},"role":{"_in":["card","main","screen","body","defect","other"]},"status":{"_in":["draft","published","archived"]},"shot_status":{"_in":["needs_review","approved","rejected"]}}'::json,
  '{"status":"published","shot_status":"approved"}'::json
);
SELECT isvoi_upsert_permission('ISVOI Importer', 'device_images', 'update', '*', NULL);
SELECT isvoi_upsert_permission('ISVOI Importer', 'device_images', 'delete', '*', NULL);
SELECT isvoi_upsert_permission('ISVOI Importer', 'directus_files', 'read', '*', NULL);
SELECT isvoi_upsert_permission('ISVOI Importer', 'directus_files', 'create', '*', NULL);
SELECT isvoi_upsert_permission('ISVOI Importer', 'directus_files', 'update', '*', NULL);

CREATE OR REPLACE FUNCTION isvoi_upsert_directus_field(
  p_collection varchar,
  p_field varchar,
  p_interface varchar,
  p_display varchar,
  p_options json,
  p_width varchar,
  p_sort integer,
  p_note text,
  p_readonly boolean DEFAULT false,
  p_special varchar DEFAULT NULL,
  p_group varchar DEFAULT NULL,
  p_required boolean DEFAULT false,
  p_validation json DEFAULT NULL,
  p_validation_message text DEFAULT NULL,
  p_hidden boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM directus_fields WHERE collection = p_collection AND field = p_field
  ) THEN
    UPDATE directus_fields
    SET interface = p_interface,
      display = p_display,
      options = p_options,
      width = p_width,
      sort = p_sort,
      note = p_note,
      readonly = p_readonly,
      special = p_special,
      "group" = p_group,
      required = p_required,
      validation = p_validation,
      validation_message = p_validation_message,
      hidden = p_hidden
    WHERE collection = p_collection AND field = p_field;
  ELSE
    INSERT INTO directus_fields (
      collection, field, interface, display, options, width, sort, note,
      readonly, special, "group", required, validation, validation_message, hidden
    ) VALUES (
      p_collection, p_field, p_interface, p_display, p_options, p_width, p_sort, p_note,
      p_readonly, p_special, p_group, p_required, p_validation, p_validation_message, p_hidden
    );
  END IF;
END;
$$;

-- Device Studio groups. Alias fields do not change the actual devices table.
SELECT isvoi_upsert_directus_field('devices', 'group_publish', 'group-detail', NULL, '{"headerIcon":"fact_check","start":"open"}'::json, 'full', 1, 'Публикация, складской статус и готовность карточки.', false, 'alias,no-data,group');
SELECT isvoi_upsert_directus_field('devices', 'group_identity', 'group-detail', NULL, '{"headerIcon":"devices","start":"open"}'::json, 'full', 10, 'Название, категория и основные характеристики.', false, 'alias,no-data,group');
SELECT isvoi_upsert_directus_field('devices', 'group_price', 'group-detail', NULL, '{"headerIcon":"payments"}'::json, 'full', 30, 'Цена, гарантия, грейд и цена выхода.', false, 'alias,no-data,group');
SELECT isvoi_upsert_directus_field('devices', 'group_media', 'group-detail', NULL, '{"headerIcon":"image"}'::json, 'full', 50, 'Фото карточки и визуальные fallback-поля.', false, 'alias,no-data,group');
SELECT isvoi_upsert_directus_field('devices', 'group_copy', 'group-detail', NULL, '{"headerIcon":"article"}'::json, 'full', 70, 'Тексты карточки, товарной страницы и CTA.', false, 'alias,no-data,group');
SELECT isvoi_upsert_directus_field('devices', 'group_structured', 'group-detail', NULL, '{"headerIcon":"data_object"}'::json, 'full', 90, 'JSON-поля Passport, галереи и Trade. Редактируйте осторожно.', false, 'alias,no-data,group');
SELECT isvoi_upsert_directus_field('devices', 'group_import', 'group-detail', NULL, '{"headerIcon":"sync"}'::json, 'full', 110, 'Импорт, источники и служебные поля. Обычно меняются импорт-скриптами.', false, 'alias,no-data,group');

-- Devices: publishing.
SELECT isvoi_upsert_directus_field('devices', 'id', 'input', NULL, NULL, 'half', 2, 'Публичный slug и primary key. Используется в URL /device/{id}.', false, NULL, 'group_publish', true, '{"_regex":"^[a-z0-9]+(?:-[a-z0-9]+)*$"}'::json, 'Используйте латиницу, цифры и дефисы: iphone-15-pro-256-blue.');
SELECT isvoi_upsert_directus_field('devices', 'status', 'select-dropdown', 'labels', '{"choices":[{"text":"Черновик","value":"draft","color":"#6b7280"},{"text":"Опубликовано","value":"published","color":"#10b981"},{"text":"Архив","value":"archived","color":"#6b7280"}]}'::json, 'half', 3, 'Публичная видимость. Сайт показывает только published.', false, NULL, 'group_publish', true);
SELECT isvoi_upsert_directus_field('devices', 'stock_status', 'select-dropdown', 'labels', '{"choices":[{"text":"В наличии","value":"available","color":"#10b981"},{"text":"Бронь","value":"reserved","color":"#f59e0b"},{"text":"Продано","value":"sold","color":"#6b7280"},{"text":"Скрыть","value":"hidden","color":"#111827"}]}'::json, 'half', 4, 'Операционный статус склада. Hidden полностью убирает карточку с публичной витрины.', false, NULL, 'group_publish', true);
SELECT isvoi_upsert_directus_field('devices', 'content_status', 'select-dropdown', 'labels', '{"choices":[{"text":"Нужны данные","value":"needs_content","color":"#ef4444"},{"text":"Нужны фото","value":"needs_photo","color":"#f59e0b"},{"text":"На проверке","value":"review","color":"#3b82f6"},{"text":"Готово","value":"ready","color":"#10b981"}]}'::json, 'half', 5, 'Редакционный статус карточки перед публикацией.', false, NULL, 'group_publish', true);
SELECT isvoi_upsert_directus_field('devices', 'sort', 'input', NULL, NULL, 'half', 6, 'Порядок в каталоге. Меньше число — выше карточка.', false, NULL, 'group_publish');

-- Devices: identity/specs.
SELECT isvoi_upsert_directus_field('devices', 'category', 'select-dropdown', 'labels', '{"choices":[{"text":"iPhone","value":"iphone"},{"text":"iPad","value":"ipad"},{"text":"MacBook","value":"macbook"},{"text":"Watch","value":"watch"},{"text":"AirPods","value":"airpods"},{"text":"Другое","value":"other"}]}'::json, 'half', 11, 'Категория для фильтров витрины.', false, NULL, 'group_identity', true);
SELECT isvoi_upsert_directus_field('devices', 'tags', 'tags', NULL, NULL, 'half', 12, 'Теги для дополнительных фильтров: iphone, club и т.п.', false, 'cast-json', 'group_identity');
SELECT isvoi_upsert_directus_field('devices', 'title', 'input', NULL, NULL, 'half', 13, 'Название в карточке и в заявках.', false, NULL, 'group_identity', true);
SELECT isvoi_upsert_directus_field('devices', 'model', 'input', NULL, NULL, 'half', 14, 'Модель/линейка для похожих устройств.', false, NULL, 'group_identity');
SELECT isvoi_upsert_directus_field('devices', 'specs', 'input', NULL, NULL, 'half', 15, 'Ключевая спецификация: 256 GB, 8/256 GB и т.п.', false, NULL, 'group_identity');
SELECT isvoi_upsert_directus_field('devices', 'storage', 'input', NULL, NULL, 'half', 16, 'Объём памяти, если нужен отдельно от specs.', false, NULL, 'group_identity');
SELECT isvoi_upsert_directus_field('devices', 'color', 'input', NULL, NULL, 'half', 17, 'Цвет для карточки и товарной страницы.', false, NULL, 'group_identity');
SELECT isvoi_upsert_directus_field('devices', 'serial', 'input', NULL, NULL, 'half', 18, 'Маскированный IMEI/SN. Не публикуйте полный серийный номер.', false, NULL, 'group_identity');

-- Devices: price/condition.
SELECT isvoi_upsert_directus_field('devices', 'price', 'input', 'formatted-value', NULL, 'half', 31, 'Цена числом в рублях. Нужна для сортировки и фильтров.', false, NULL, 'group_price', true);
SELECT isvoi_upsert_directus_field('devices', 'price_text', 'input', NULL, NULL, 'half', 32, 'Готовая строка цены для интерфейса, например 59 900 ₽.', false, NULL, 'group_price', true);
SELECT isvoi_upsert_directus_field('devices', 'grade', 'input', NULL, NULL, 'half', 33, 'Грейд состояния: A, A−, B+ и т.п.', false, NULL, 'group_price');
SELECT isvoi_upsert_directus_field('devices', 'battery', 'input', NULL, NULL, 'half', 34, 'Краткое значение батареи или циклов.', false, NULL, 'group_price');
SELECT isvoi_upsert_directus_field('devices', 'battery_text', 'input', NULL, NULL, 'half', 35, 'Строка батареи в карточке.', false, NULL, 'group_price');
SELECT isvoi_upsert_directus_field('devices', 'meta_battery', 'input', NULL, NULL, 'half', 36, 'Короткая строка батареи/циклов для мета-строки карточки.', false, NULL, 'group_price');
SELECT isvoi_upsert_directus_field('devices', 'warranty', 'input', NULL, NULL, 'half', 37, 'Срок гарантии как значение.', false, NULL, 'group_price');
SELECT isvoi_upsert_directus_field('devices', 'warranty_text', 'input', NULL, NULL, 'half', 38, 'Строка гарантии в карточке.', false, NULL, 'group_price');
SELECT isvoi_upsert_directus_field('devices', 'exit', 'input', NULL, NULL, 'half', 39, 'Ориентир цены выхода как значение.', false, NULL, 'group_price');
SELECT isvoi_upsert_directus_field('devices', 'exit_text', 'input', NULL, NULL, 'half', 40, 'Строка цены выхода в карточке.', false, NULL, 'group_price');
SELECT isvoi_upsert_directus_field('devices', 'availability', 'input-multiline', NULL, NULL, 'full', 41, 'Пояснение по наличию/условиям просмотра.', false, NULL, 'group_price');

-- Devices: media.
SELECT isvoi_upsert_directus_field('devices', 'listing_file', 'file-image', 'image', NULL, 'full', 51, 'Основное фото карточки из Directus Files. Для новых устройств используйте это поле или device_images role=card.', false, 'm2o', 'group_media');
SELECT isvoi_upsert_directus_field('devices', 'listing_image', 'input', NULL, NULL, 'half', 52, 'Legacy fallback path. Для новых устройств оставляйте пустым.', false, NULL, 'group_media');
SELECT isvoi_upsert_directus_field('devices', 'listing_alt', 'input', NULL, NULL, 'half', 53, 'Alt-текст основного фото.', false, NULL, 'group_media');
SELECT isvoi_upsert_directus_field('devices', 'visual_class', 'input', NULL, NULL, 'half', 54, 'Legacy CSS-класс визуала. Обычно не нужен при Directus Files.', false, NULL, 'group_media');

-- Devices: copy/CTA.
SELECT isvoi_upsert_directus_field('devices', 'short_description', 'input-multiline', NULL, NULL, 'full', 71, 'Короткое описание для карточки каталога.', false, NULL, 'group_copy');
SELECT isvoi_upsert_directus_field('devices', 'headline', 'input', NULL, NULL, 'full', 72, 'Заголовок товарной страницы.', false, NULL, 'group_copy');
SELECT isvoi_upsert_directus_field('devices', 'cta_label', 'input', NULL, NULL, 'half', 73, 'Текст CTA карточки. Обычно: Смотреть паспорт.', false, NULL, 'group_copy');
SELECT isvoi_upsert_directus_field('devices', 'has_detail_page', 'boolean', 'boolean', NULL, 'half', 74, 'Есть ли отдельная товарная страница.', false, NULL, 'group_copy');
SELECT isvoi_upsert_directus_field('devices', 'detail_href', 'input', NULL, NULL, 'half', 75, 'Путь к товарной странице. Если пусто, сайт использует /device/{id}.', false, NULL, 'group_copy');

-- Devices: structured JSON.
SELECT isvoi_upsert_directus_field('devices', 'gallery', 'list', NULL, NULL, 'full', 91, 'Legacy JSON-галерея. Новые фото лучше вести через device_images.', false, 'cast-json', 'group_structured');
SELECT isvoi_upsert_directus_field('devices', 'passport', 'input-code', NULL, '{"language":"json"}'::json, 'full', 92, 'JSON ISVOI Passport. Перед публикацией проверяйте формат.', false, 'cast-json', 'group_structured');
SELECT isvoi_upsert_directus_field('devices', 'trade', 'input-code', NULL, '{"language":"json"}'::json, 'full', 93, 'JSON trade options.', false, 'cast-json', 'group_structured');

-- Devices: import/audit.
SELECT isvoi_upsert_directus_field('devices', 'source_system', 'input', NULL, NULL, 'half', 111, 'Источник импорта: manual, xlsx, crm, supplier.', false, NULL, 'group_import');
SELECT isvoi_upsert_directus_field('devices', 'source_id', 'input', NULL, NULL, 'half', 112, 'Стабильный внешний ID из источника. Вместе с source_system защищает от дублей.', false, NULL, 'group_import');
SELECT isvoi_upsert_directus_field('devices', 'import_batch', 'input', NULL, NULL, 'half', 113, 'Метка партии импорта, например 2026-06-stock.', false, NULL, 'group_import');
SELECT isvoi_upsert_directus_field('devices', 'imported_at', 'datetime', 'datetime', NULL, 'half', 114, 'Когда строка была импортирована.', false, NULL, 'group_import');
SELECT isvoi_upsert_directus_field('devices', 'admin_note', 'input-multiline', NULL, NULL, 'full', 115, 'Внутренняя заметка для редактора/менеджера. На сайт не выводится.', false, NULL, 'group_import');
SELECT isvoi_upsert_directus_field('devices', 'created_at', 'datetime', 'datetime', NULL, 'half', 116, 'Когда карточка создана.', true, 'date-created', 'group_import');
SELECT isvoi_upsert_directus_field('devices', 'updated_at', 'datetime', 'datetime', NULL, 'half', 117, 'Когда карточка обновлена.', true, 'date-updated', 'group_import');

-- Device images groups.
SELECT isvoi_upsert_directus_field('device_images', 'group_image_main', 'group-detail', NULL, '{"headerIcon":"photo_library","start":"open"}'::json, 'full', 1, 'Связь изображения с устройством и публикацией.', false, 'alias,no-data,group');
SELECT isvoi_upsert_directus_field('device_images', 'group_image_import', 'group-detail', NULL, '{"headerIcon":"sync"}'::json, 'full', 90, 'Служебные поля импорта изображения.', false, 'alias,no-data,group');
SELECT isvoi_upsert_directus_field('device_images', 'id', 'input', NULL, NULL, 'half', 2, 'ID изображения.', true, 'uuid', 'group_image_main');
SELECT isvoi_upsert_directus_field('device_images', 'status', 'select-dropdown', 'labels', '{"choices":[{"text":"Черновик","value":"draft","color":"#6b7280"},{"text":"Опубликовано","value":"published","color":"#10b981"},{"text":"Архив","value":"archived","color":"#6b7280"}]}'::json, 'half', 3, 'Публичная видимость строки изображения.', false, NULL, 'group_image_main', true);
SELECT isvoi_upsert_directus_field('device_images', 'shot_status', 'select-dropdown', 'labels', '{"choices":[{"text":"На проверке","value":"needs_review","color":"#f59e0b"},{"text":"Одобрено","value":"approved","color":"#10b981"},{"text":"Заменить","value":"rejected","color":"#ef4444"}]}'::json, 'half', 4, 'Качество кадра перед публикацией.', false, NULL, 'group_image_main', true);
SELECT isvoi_upsert_directus_field('device_images', 'device', 'select-dropdown-m2o', 'related-values', '{"template":"{{title}} · {{price_text}} · {{stock_status}}"}'::json, 'half', 5, 'Связанное устройство.', false, 'm2o', 'group_image_main', true);
SELECT isvoi_upsert_directus_field('device_images', 'role', 'select-dropdown', 'labels', '{"choices":[{"text":"Карточка","value":"card"},{"text":"Главный вид","value":"main"},{"text":"Экран","value":"screen"},{"text":"Корпус","value":"body"},{"text":"Дефект","value":"defect"},{"text":"Другое","value":"other"}]}'::json, 'half', 6, 'Роль фото. role=card используется для плитки каталога.', false, NULL, 'group_image_main', true);
SELECT isvoi_upsert_directus_field('device_images', 'sort', 'input', NULL, NULL, 'half', 7, 'Порядок в галерее.', false, NULL, 'group_image_main');
SELECT isvoi_upsert_directus_field('device_images', 'image', 'file-image', 'image', NULL, 'full', 8, 'Файл из Directus Files.', false, 'm2o', 'group_image_main', true);
SELECT isvoi_upsert_directus_field('device_images', 'label', 'input', NULL, NULL, 'half', 9, 'Подпись кадра.', false, NULL, 'group_image_main');
SELECT isvoi_upsert_directus_field('device_images', 'alt', 'input-multiline', NULL, NULL, 'full', 10, 'Alt-текст изображения.', false, NULL, 'group_image_main');
SELECT isvoi_upsert_directus_field('device_images', 'source_path', 'input', NULL, NULL, 'full', 91, 'Исходный путь/имя файла при импорте.', false, NULL, 'group_image_import');
SELECT isvoi_upsert_directus_field('device_images', 'import_batch', 'input', NULL, NULL, 'half', 92, 'Метка партии импорта.', false, NULL, 'group_image_import');
SELECT isvoi_upsert_directus_field('device_images', 'created_at', 'datetime', 'datetime', NULL, 'half', 93, 'Когда строка создана.', true, 'date-created', 'group_image_import');
SELECT isvoi_upsert_directus_field('device_images', 'updated_at', 'datetime', 'datetime', NULL, 'half', 94, 'Когда строка обновлена.', true, 'date-updated', 'group_image_import');

DROP FUNCTION isvoi_upsert_directus_field(varchar, varchar, varchar, varchar, json, varchar, integer, text, boolean, varchar, varchar, boolean, json, text, boolean);
DROP FUNCTION isvoi_upsert_permission(text, varchar, varchar, text, json, json, json);
DROP FUNCTION isvoi_upsert_collection_metadata(varchar, varchar, text, varchar, varchar, varchar);
DROP FUNCTION isvoi_bind_policy_to_role(text, text);
DROP FUNCTION isvoi_policy_id(text, text, text, boolean);
DROP FUNCTION isvoi_role_id(text);

COMMIT;

SELECT 'directus_editor_roles' AS check_name, count(*)::text AS value
FROM directus_roles
WHERE name IN ('ISVOI Editor', 'ISVOI Importer')
UNION ALL
SELECT 'directus_editor_policies' AS check_name, count(*)::text AS value
FROM directus_policies
WHERE name IN ('ISVOI Editor', 'ISVOI Importer')
UNION ALL
SELECT 'devices_group_fields' AS check_name, count(*)::text AS value
FROM directus_fields
WHERE collection = 'devices'
  AND field LIKE 'group_%'
UNION ALL
SELECT 'editor_permissions' AS check_name, count(*)::text AS value
FROM directus_permissions
WHERE policy IN (SELECT id FROM directus_policies WHERE name IN ('ISVOI Editor', 'ISVOI Importer'));
`);
