# Conversion v2: implementation and release runbook

`conversion_v2` separates the public content migration from the React/Directus
contracts. The application is backward-compatible with old sections; the
migration performs the coordinated content switch.

## Release inputs that must be approved

Do not publish the draft information pages or `social_proof` until the following
source pack is approved:

- address, business hours, phone, Telegram, map URL and appointment rules;
- legal name, INN, OGRN/OGRNIP and sale-contract details;
- warranty, returns, payment and collection terms;
- diagnostic checklist, A/B/C grade scale and one real Passport;
- canonical iPhone 14 repair history;
- at least three source-linked reviews or cases;
- response SLA and update-value calculation method.

The repository deliberately contains no invented substitutes for these facts.
The optional QA seed fills draft pages and inactive reviews with visibly
labelled test data. It never activates or publishes them.

Until the factual diagnostic fields are completed, the
`conversion_v2.published_devices_missing_required_fields.warning` result is
informational. Repair-history contradictions remain a blocking audit failure.

## Local verification

```bash
npm run web:verify
npm run text:audit
npm run --silent directus:update-conversion-v2-sql > conversion_v2.sql
npm run --silent directus:update-conversion-consistency-sql > conversion_consistency.sql
npm run --silent directus:seed-conversion-v2-test-data-sql > conversion_v2_test_data.sql
npm run --silent directus:audit-conversion-v2:sql > conversion_v2_audit.sql
```

After starting the built site locally:

```bash
SMOKE_BASE_URL=http://127.0.0.1:3000 npm run smoke:copy
SMOKE_BASE_URL=http://127.0.0.1:3000 npm run smoke:links
SMOKE_BASE_URL=http://127.0.0.1:3000 npm run smoke:consistency
```

Production `smoke:copy` is expected to fail until the P0 content update is
applied; that failure is the intended release gate.

## Production sequence

1. Back up PostgreSQL and uploads and verify checksums.
2. Deliver code and the SQL generators without changing public content.
3. Apply the idempotent schema/Studio setup generators:
   `directus:setup:catalog`, `directus:setup:global-content`,
   `directus:setup:site-pages-workflow`, and
   `directus:setup:public-permissions`.
4. Apply the generated `conversion_v2.sql` with `ON_ERROR_STOP=1`.
   For installations that already have conversion v2, apply the separate
   forward-only `conversion_consistency.sql` after it; do not rewrite the
   historical migration.
5. Run `directus:audit:prod`; `conversion-v2` is part of the production audit.
6. Complete the source pack in Directus. Keep information pages in `draft` and
   `social_proof` inactive until approved.
7. Deploy the compatible Next.js build.
8. Review Draft Preview on desktop and mobile.
9. Publish the approved information pages and verified reviews, then switch
   navigation/home content in one release window.
10. Revalidate and run copy, link, SEO, image, visual, performance and
    lead-intake smokes. `smoke:consistency` must also pass for the homepage,
    catalog, Store, Passport, Trade, Club, every published device and every
    published blog route.
11. Save a sanitized production schema snapshot.

Old homepage rows remain in Directus but are inactive. Delete them only in a
later release after rollback is no longer required.

## Conversion contract

- Header/home CTA: `Смотреть устройства`.
- Device CTA: `Записаться на просмотр [модель]`.
- Trade CTA: `Получить предварительную оценку`.
- Club is hidden from the header and homepage; the footer labels it
  `Club — пилот`.
- Any update value is preliminary and confirmed after repeat diagnostics.
- Store must not promote Club in the primary purchase journey.
- Trade CTAs stay on `/trade#final`; its form has Trade-specific scenarios and
  consent copy.
- Catalog cards use `Смотреть устройство`; the catalog has no Club filter.
- Public copy does not use `цена выхода`, `ориентир выхода` or `ISVOI`.
- Product structured data uses `Apple`, `UsedCondition`, and the shared seller
  organization.
- Organization/LocalBusiness data, footer contacts and legal identifiers read
  from the same `site_settings` row.
