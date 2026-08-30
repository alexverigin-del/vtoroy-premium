#!/usr/bin/env node

process.stdout.write(String.raw`
SELECT 'trade_legal.privacy_page_missing',count(*)::text
FROM (VALUES(1)) marker(value)
WHERE NOT EXISTS(
  SELECT 1 FROM site_pages
  WHERE slug='privacy' AND status='published' AND nullif(title,'') IS NOT NULL
)
UNION ALL
SELECT 'trade_legal.privacy_sections_missing',count(*)::text
FROM (VALUES('privacy_hero'),('privacy_content'),('trade-in-consent')) expected(section_key)
WHERE NOT EXISTS(
  SELECT 1 FROM page_sections section JOIN site_pages page ON page.id=section.page
  WHERE page.slug='privacy' AND section.section_key=expected.section_key
    AND section.is_active=true AND nullif(section.headline,'') IS NOT NULL
    AND nullif(section.body,'') IS NOT NULL
)
UNION ALL
SELECT 'trade_legal.privacy_operator_copy_missing',count(*)::text
FROM (VALUES(1)) marker(value)
WHERE NOT EXISTS(
  SELECT 1 FROM page_sections section JOIN site_pages page ON page.id=section.page
  WHERE page.slug='privacy' AND section.section_key='privacy_content'
    AND section.body LIKE '%ИП Башлыков Сергей Николаевич%'
    AND section.body LIKE '%290210599993%'
    AND section.body LIKE '%316312300099728%'
)
UNION ALL
SELECT 'trade_legal.site_privacy_link_missing',count(*)::text
FROM site_settings WHERE privacy_url IS DISTINCT FROM '/privacy'
UNION ALL
SELECT 'trade_legal.settings_not_approved',count(*)::text
FROM trade_settings
WHERE id=1 AND (
  economics_status IS DISTINCT FROM 'approved' OR legal_status IS DISTINCT FROM 'approved' OR
  tax_treatment_confirmed IS DISTINCT FROM true OR
  primary_document_status IS DISTINCT FROM 'approved' OR
  kkt_workflow_status IS DISTINCT FROM 'approved' OR
  legal_approved_by IS NULL OR legal_approved_at IS NULL OR
  consent_version IS DISTINCT FROM 'trade-consent-v1-2026-08-30' OR
  consent_url IS DISTINCT FROM '/privacy#trade-in-consent' OR privacy_url IS DISTINCT FROM '/privacy' OR
  nullif(consent_label,'') IS NULL OR nullif(consent_text,'') IS NULL
)
UNION ALL
SELECT 'trade_legal.trade_form_consent_missing',count(*)::text
FROM (VALUES(1)) marker(value)
WHERE NOT EXISTS(
  SELECT 1 FROM page_sections section JOIN site_pages page ON page.id=section.page
  WHERE page.slug='trade' AND section.section_key='final_cta'
    AND section.content::jsonb #>> '{form,consent_version}'='trade-consent-v1-2026-08-30'
    AND section.content::jsonb #>> '{form,consent_url}'='/privacy#trade-in-consent'
    AND nullif(section.content::jsonb #>> '{form,consent_label}','') IS NOT NULL
)
UNION ALL
SELECT 'trade_legal.exchange_offer_excluded_by_product_summary',count(*)::text
FROM products product JOIN product_offers offer ON offer.product=product.id
WHERE product.status='published' AND product.content_status='ready'
  AND offer.status='published' AND offer.stock_status='available' AND offer.stock_quantity>0
  AND (product.stock_status='hidden' OR product.stock_quantity<=0)
UNION ALL
SELECT 'trade_legal.exchange_card_missing_listing_file',count(DISTINCT product.id)::text
FROM products product JOIN product_offers offer ON offer.product=product.id
WHERE product.status='published' AND product.content_status='ready'
  AND product.stock_status<>'hidden' AND product.stock_quantity>0
  AND offer.status='published' AND offer.stock_status='available' AND offer.stock_quantity>0
  AND product.listing_file IS NULL
UNION ALL
SELECT 'trade_legal.info.exchange_card_count',count(DISTINCT product.id)::text
FROM products product JOIN product_offers offer ON offer.product=product.id
WHERE product.status='published' AND product.content_status='ready'
  AND product.stock_status<>'hidden' AND product.stock_quantity>0
  AND offer.status='published' AND offer.stock_status='available' AND offer.stock_quantity>0
UNION ALL
SELECT 'trade_legal.info.consent_version',consent_version
FROM trade_settings WHERE id=1;
`);
