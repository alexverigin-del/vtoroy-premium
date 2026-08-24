#!/usr/bin/env node
/**
 * Reconcile hidden Club pilot content with its current draft lifecycle.
 *
 * Content and relations are preserved. Re-running this script is safe.
 */

console.log(String.raw`
\set ON_ERROR_STOP on
BEGIN;

UPDATE navigation_items item
SET is_active = EXISTS (
  SELECT 1 FROM site_pages page
  WHERE page.slug='club' AND page.status='published'
)
WHERE item.id='98310275-35d5-4e2e-a248-5ddf871b68be';

UPDATE page_sections section
SET is_active=false
FROM site_pages page
WHERE section.page=page.id
  AND page.slug='club'
  AND page.status<>'published'
  AND section.is_active=true;

UPDATE club_offers offer
SET offer_status='paused', updated_at=now()
FROM products product
WHERE offer.product=product.id
  AND offer.status='published'
  AND offer.offer_status IN ('approved','waitlist')
  AND (
    product.status<>'published'
    OR product.stock_status<>'available'
    OR coalesce(product.stock_quantity,0)<=0
  );

SELECT 'club.navigation.active', count(*)::text
FROM navigation_items
WHERE id='98310275-35d5-4e2e-a248-5ddf871b68be' AND is_active=true
UNION ALL
SELECT 'club.draft.active_sections', count(*)::text
FROM page_sections section
JOIN site_pages page ON page.id=section.page
WHERE page.slug='club' AND page.status<>'published' AND section.is_active=true
UNION ALL
SELECT 'club.invalid_public_offers', count(*)::text
FROM club_offers offer
LEFT JOIN products product ON product.id=offer.product
WHERE offer.status='published'
  AND offer.offer_status IN ('approved','waitlist')
  AND (
    product.id IS NULL
    OR product.status<>'published'
    OR product.stock_status<>'available'
    OR coalesce(product.stock_quantity,0)<=0
  );

COMMIT;
`);
