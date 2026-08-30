#!/usr/bin/env node
/** Publish the approved privacy policy and Trade-in consent without enabling the wizard. */

const rehearse = process.argv.includes("--rehearse");

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const consentVersion = "trade-consent-v1-2026-08-30";
const consentLabel =
  "Я даю согласие на обработку телефона или Telegram для ответа по заявке Trade-in и ознакомлен с Политикой обработки персональных данных.";
const consentText =
  "Я свободно, своей волей и в своём интересе даю ИП Башлыкову Сергею Николаевичу, ИНН 290210599993, ОГРНИП 316312300099728, согласие на обработку указанных мной номера телефона или имени пользователя Telegram, сведений об устройстве, его состоянии, выбранном сценарии Trade-in, магазине и пожелании по времени визита, а также технических сведений об источнике заявки. Цели обработки: ответ на заявку, предварительная оценка устройства, согласование диагностики, продажи, обмена или консультации по комиссии, защита формы от злоупотреблений. Разрешаю сбор, запись, систематизацию, накопление, хранение, уточнение, извлечение, использование, передачу уполномоченным обработчикам только для указанных целей, блокирование и уничтожение данных. Если сделка не состоялась, данные заявки хранятся не более 12 месяцев после последнего взаимодействия. Если сделка состоялась, данные заявки и доказательство согласия могут храниться до 3 лет после завершения сделки, а документы, для которых законом установлен больший срок, — в течение такого срока вне системы ISVOI. Согласие можно отозвать письменным заявлением, поданным лично или направленным оператору по адресу: г. Белгород, ул. Костюкова, д. 67А, ТЦ «Виктория», 2 этаж. Отзыв не влияет на законность обработки до его получения и не прекращает обработку, необходимую по закону или для исполнения заключённого договора.";

const privacyHero =
  "Политика описывает, какие данные получает I СВОИ через сайт, зачем они нужны и как можно реализовать свои права.";

const privacyBody = `
<h2>1. Оператор и область действия</h2>
<p>Оператор персональных данных — ИП Башлыков Сергей Николаевич, ИНН 290210599993, ОГРНИП 316312300099728. Адрес для обращений: г. Белгород, ул. Костюкова, д. 67А, ТЦ «Виктория», 2 этаж.</p>
<p>Политика применяется к данным, которые пользователь передаёт через формы сайта isvoi.ru, а также к техническим сведениям, необходимым для работы и защиты сайта.</p>
<h2>2. Какие данные обрабатываются</h2>
<ul><li>имя, если пользователь его указал;</li><li>номер телефона или имя пользователя Telegram;</li><li>сведения об интересующем товаре, устройстве, его состоянии и выбранном сценарии;</li><li>магазин и пожелание по дате или периоду визита;</li><li>адрес страницы, источник перехода, UTM-метки, сведения браузера и временно используемый IP-адрес для ограничения злоупотреблений.</li></ul>
<p>Через формы сайта не запрашиваются паспортные данные, платёжные реквизиты, сведения кассового чека или сканы договоров. Такие документы оформляются отдельно в магазине, когда это необходимо для сделки.</p>
<h2>3. Цели и правовые основания</h2>
<p>Данные используются для ответа на обращение, подбора товара, предварительной оценки Trade-in, согласования диагностики, продажи, обмена или консультации по комиссии, подготовки действий по запросу пользователя до заключения договора, исполнения договора и обязанностей, установленных законом, а также для защиты сайта от спама и злоупотреблений.</p>
<p>Основания обработки — согласие пользователя, действия по его запросу до заключения договора, исполнение заключённого договора и требования законодательства Российской Федерации.</p>
<h2>4. Действия с данными и получатели</h2>
<p>Оператор может выполнять сбор, запись, систематизацию, накопление, хранение, уточнение, извлечение, использование, передачу уполномоченным обработчикам в необходимом объёме, блокирование и уничтожение данных. Доступ получают только сотрудники и подрядчики, которым данные нужны для указанных целей и которые обязаны соблюдать конфиденциальность.</p>
<p>Первичная запись и хранение данных граждан Российской Федерации выполняются в базе данных на территории Российской Федерации. Подключение нового внешнего сервиса, получающего персональные данные, требует отдельной проверки условий обработки и передачи.</p>
<h2>5. Сроки хранения</h2>
<p>Заявка, по которой сделка не состоялась, хранится не более 12 месяцев после последнего взаимодействия. Данные заявки по состоявшейся сделке и доказательство согласия могут храниться до 3 лет после завершения сделки. Документы, которые должны храниться дольше по закону, находятся во внешнем операционном контуре магазина и хранятся в течение обязательного срока.</p>
<p>Технические данные ограничения частоты запросов используются кратковременно. Контактные данные не передаются в неперсональную продуктовую аналитику.</p>
<h2>6. Права пользователя</h2>
<p>Пользователь вправе запросить сведения об обработке, уточнение, блокирование или уничтожение данных, а также отозвать согласие. Для этого необходимо подать письменное заявление лично либо направить его оператору по адресу, указанному в разделе 1. Оператор вправе запросить сведения, необходимые для подтверждения личности заявителя.</p>
<p>После получения отзыва обработка прекращается, кроме случаев, когда её продолжение допускается законом или необходимо для исполнения договора и защиты законных требований.</p>
<h2>7. Защита и изменение политики</h2>
<p>Оператор применяет правовые, организационные и технические меры для защиты данных от неправомерного доступа, изменения, раскрытия или уничтожения. Актуальная редакция политики публикуется на этой странице. Дата начала действия редакции: 30 августа 2026 года.</p>`;

const consentBody = `<p>${consentText}</p><p><strong>Версия:</strong> ${consentVersion}. <strong>Дата начала действия:</strong> 30 августа 2026 года.</p>`;

function sectionUpsert({ key, variant, eyebrow = "", headline, body, sort }) {
  return `
UPDATE page_sections section SET
  variant=${sqlLiteral(variant)}, eyebrow=${sqlLiteral(eyebrow)},
  headline=${sqlLiteral(headline)}, body=${sqlLiteral(body)},
  sort_order=${sort}, is_active=true, content='{}'::json
FROM site_pages page
WHERE section.page=page.id AND page.slug='privacy' AND section.section_key=${sqlLiteral(key)};

INSERT INTO page_sections(page,section_key,variant,eyebrow,headline,body,sort_order,is_active,content)
SELECT page.id,${sqlLiteral(key)},${sqlLiteral(variant)},${sqlLiteral(eyebrow)},
  ${sqlLiteral(headline)},${sqlLiteral(body)},${sort},true,'{}'::json
FROM site_pages page
WHERE page.slug='privacy' AND NOT EXISTS(
  SELECT 1 FROM page_sections section WHERE section.page=page.id AND section.section_key=${sqlLiteral(key)}
);`;
}

const sql = `
BEGIN;

INSERT INTO site_pages(slug,template,status,title,meta_description)
VALUES('privacy','info','published','Обработка персональных данных — I СВОИ','Политика обработки персональных данных и отдельное согласие для заявок Trade-in на isvoi.ru.')
ON CONFLICT(slug) DO UPDATE SET
  template=EXCLUDED.template,status=EXCLUDED.status,title=EXCLUDED.title,meta_description=EXCLUDED.meta_description;

${sectionUpsert({
  key: "privacy_hero",
  variant: "page.hero",
  eyebrow: "I СВОИ · персональные данные",
  headline: "Обработка персональных данных.",
  body: privacyHero,
  sort: 10,
})}

${sectionUpsert({
  key: "privacy_content",
  variant: "rich.text",
  headline: "Политика обработки персональных данных",
  body: privacyBody,
  sort: 20,
})}

${sectionUpsert({
  key: "trade-in-consent",
  variant: "rich.text",
  eyebrow: "Отдельное согласие",
  headline: "Согласие для заявки Trade-in",
  body: consentBody,
  sort: 30,
})}

UPDATE site_settings SET privacy_url='/privacy';

UPDATE page_sections section SET content=(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(coalesce(section.content::jsonb,'{}'::jsonb),'{form,consent_label}',to_jsonb(${sqlLiteral(consentLabel)}::text),true),
        '{form,consent_version}',to_jsonb(${sqlLiteral(consentVersion)}::text),true
      ),
      '{form,consent_url}',to_jsonb('/privacy#trade-in-consent'::text),true
    ),
    '{form,consent_note}',to_jsonb(''::text),true
  )
)::json
FROM site_pages page
WHERE section.page=page.id AND page.slug='trade' AND section.section_key='final_cta';

DO $$
DECLARE approver uuid;
BEGIN
  SELECT user_row.id INTO approver
  FROM directus_users user_row
  WHERE user_row.status='active' AND (
    user_row.role IN (
      SELECT access.role FROM directus_access access
      JOIN directus_policies policy ON policy.id=access.policy
      WHERE policy.name='Administrator' AND access.role IS NOT NULL
    )
    OR EXISTS(
      SELECT 1 FROM directus_access access
      JOIN directus_policies policy ON policy.id=access.policy
      WHERE access."user"=user_row.id AND policy.name='Administrator'
    )
  )
  ORDER BY user_row.last_access DESC NULLS LAST
  LIMIT 1;

  IF approver IS NULL THEN
    RAISE EXCEPTION 'Active Directus administrator is required for Trade-in approval attribution';
  END IF;

  UPDATE trade_settings SET
    economics_status='approved', tax_treatment_confirmed=true,
    tax_regime='usn_income', vat_mode='without_vat', tax_reserve_pct=6,
    primary_document_mode='external_print', kkt_mode='external_terminal',
    payout_cash_enabled=true, payout_transfer_enabled=true, exchange_offset_enabled=true,
    primary_document_status='approved', kkt_workflow_status='approved',
    economics_approved_by=coalesce(economics_approved_by,approver),
    economics_approved_at=coalesce(economics_approved_at,now()),
    economics_approval_note='Подтверждено владельцем проекта: УСН «Доходы» 6%, режим НДС и уведомление Роскомнадзора проверены; договор и ККТ находятся вне ISVOI.',
    legal_status='approved',
    consent_label=${sqlLiteral(consentLabel)}, consent_text=${sqlLiteral(consentText)},
    consent_version=${sqlLiteral(consentVersion)}, consent_url='/privacy#trade-in-consent', privacy_url='/privacy',
    legal_approved_by=coalesce(legal_approved_by,approver),
    legal_approved_at=coalesce(legal_approved_at,now()),
    legal_approval_note='Базово подтверждено владельцем проекта 30.08.2026. Отдельный чекбокс, опубликованная политика, сроки хранения и неизменяемое доказательство согласия обязательны.'
  WHERE id=1;
END $$;

COMMIT;

SELECT 'trade_legal.privacy_page',concat(status,'|',title) FROM site_pages WHERE slug='privacy';
SELECT 'trade_legal.active_sections',count(*)::text FROM page_sections section JOIN site_pages page ON page.id=section.page WHERE page.slug='privacy' AND section.is_active=true;
SELECT 'trade_legal.settings',concat(economics_status,'|',legal_status,'|',consent_version) FROM trade_settings WHERE id=1;
`;

process.stdout.write(rehearse ? `${sql.slice(0, sql.indexOf("\nCOMMIT;"))}\nROLLBACK;\n` : sql);
