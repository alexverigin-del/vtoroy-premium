# Device Model Specifications

Technical specifications belong to `device_models` through
`device_model_specifications`, not to an individual stock unit or Passport.
All device cards linked to the model read its active specification rows.

## Editor Workflow

1. Select the exact model in the product card; do not infer its regional variant
   from the colour, storage or marketing name.
2. In Studio, open the model specifications collection and filter by that model.
3. Add active rows for screen, chip, cameras, connector/charging, connectivity,
   factory protection and dimensions/weight. Keep the existing Russian labels
   and sort values 10 through 70 for smartphone cards.
4. Record the official source URL and verification date on each row. Regional
   SIM/chip/weight differences must be qualified until the unit's identifier is
   confirmed. Battery health, condition and actual diagnostics remain in Passport.
5. Before publication, inspect the real card on desktop and mobile. Model IP68
   specifications are not a warranty of water resistance for a used unit.

Existing Studio edits trigger the normal site-content revalidation Flow. SQL
content additions do not trigger that Flow and require explicit invalidation.

## September 2026 Completion

The source-backed manifest is
`directus/content-inserts/2026-09-04-device-model-specifications.json`.
It adds seven rows each for iPhone 15 Pro and Galaxy S22/S23/S24 Ultra.
Sources are [Apple](https://support.apple.com/en-us/111829),
[Samsung S22 Ultra](https://news.samsung.com/global/samsung-galaxy-s22-ultra-offers-the-ultimate-and-most-premium-s-series-experience-yet),
[Samsung S23 Ultra](https://news.samsung.com/global/take-your-passions-further-with-the-new-samsung-galaxy-s23-series-designed-for-a-premium-experience-today-and-beyond)
and [Samsung S24 Ultra](https://news.samsung.com/global/enter-the-new-era-of-mobile-ai-with-samsung-galaxy-s24-series).
The S22 regional chip distinction is also supported by Samsung's
[European comparison](https://www.samsung.com/sk/support/mobile-devices/porovnavanie-galaxy-s22-a-s22-plus-a-s22-ultra/)
and [India launch](https://news.samsung.com/in/samsung-galaxy-s22-series-to-be-powered-by-snapdragon-8-gen-1-in-india).

`node scripts/insert_missing_model_specs_sql.mjs` emits a transaction ending in
ROLLBACK. `--commit` emits COMMIT; it does not execute or connect to production.
Use only after explicit content authorization, review and a verified VPS backup.
This is a fixed one-time content insert, not a deployment seed or schema setup:

- validates the four exact model UUID/slug pairs;
- refuses conflicting existing editor-owned values, including inactive rows;
- inserts missing rows only; repeat runs insert zero;
- checks preservation of existing specification and product rows;
- uses transaction, statement and lock timeouts.

Never use the historical Passport setup to refresh model content. Future models
need their own reviewed source data, preferably entered through Studio.

## Verification

`node scripts/run_directus_sql_audit.mjs product-passports-v8` now also rejects
published devices without a nonempty active model specification. Archive and
draft QA rows are excluded from this publication check.

`node scripts/smoke_model_specifications.mjs` checks the current smartphone
catalog at 1366 and 390 px: all seven labels/values, one model heading, the IP68
disclaimer and horizontal overflow. Set `SMOKE_EXPECT_MIN_PRODUCTS=17` for the
September snapshot. Results and sample captures are written under
`output/playwright/model-specifications`. This snapshot smoke assumes the current
all-smartphone catalog; extend its discovery/type-specific expectations before
using it for a mixed catalog or paginated listing.
