# Catalog Photo Curation

Use this workflow to correct gallery labels/order and confirmed processing
blemishes without changing the truthful condition of a used device.

These are manually invoked operator tools, not app startup hooks. Deploying their
source does not apply a manifest or create a release identity. Never replay an
already verified batch merely to synchronize GitHub and the production checkout.
The reviewed local preparation workflow uses Node/Sharp/Playwright and Python
with Pillow/NumPy; comparison-sheet rendering currently uses the Windows Arial
font path. The VPS runner itself uses Python's standard library and existing
Node/Docker dependencies; do not install the local retouch stack for a source-only
release.

## Boundaries

- Match by product ID, SKU, gallery row ID and original file SHA-256. Never
  borrow a similar device's photograph or infer identity from color/model alone.
- Review the actual image, not its filename or an assumed numbered shot list.
  A USB/charging-port image is a bottom view; power/volume buttons identify the
  side. When a side cannot be established, use a factual caption such as
  "Экран сбоку" rather than guess.
- Preserve the existing listing image and every gallery row's role/status.
  Never publish drafts, resurrect sold devices or change prices/stock/grades.
- Leave real wear, scratches, reflections and uncertain condition evidence
  intact. Non-generative retouch requires explicit owner approval and reviewed
  masks. Generative re-rendering is not appropriate for used-device condition.
- Raw photographs, masks, snapshots and release manifests live under ignored
  `outputs/` or a protected VPS backup, not Git/public app assets.

## Review And Prepare

1. Export a sanitized media snapshot containing products' `id`, `sku`, `title`,
   `status`, `stock_status`, `listing_file`, `listing_alt`, and gallery rows'
   `row_id`, `file_id`, `sort`, `status`, `role`, `label`, `alt`, dimensions/MIME.
   Do not include financial data, full identifiers or original private filenames.
2. Run `node scripts/review_catalog_product_photos.mjs <snapshot> <outputs-dir>`.
   Immutable anonymous originals are hashed; contact sheets are browser captures.
   Resolve all duplicate/missing-field findings before preparing a change.
3. Author `decisions.json`: `views` maps each SKU to visual classifications in
   ORIGINAL sort order. Allowed views: `overview`, `front`, `front-side`,
   `front-closeup`, `back`, `cameras`, `left`, `right`, `bottom`.
   Do not invent missing camera/rear/side images.
4. For approved background repair, add `retouch` decisions containing SKU, old
   sort, normalized `spot` review window, manually inspected pixel `center` and
   normalized `protected_rects`. Optional `bottom_seam` repairs only a reviewed
   empty-background strip. Inspect the whole mask against the device/shadow.
5. Run `python scripts/retouch_catalog_photo_backgrounds.py --review-dir <review>
--decisions <decisions> --output-dir <retouched>`. Inspect before/after crops,
   whole frames and masks. The lossless WebP must retain decoded pixels outside
   the union mask bit-for-bit; protected-region overlap fails closed.
6. Run `node scripts/prepare_catalog_gallery_curation.mjs <audit-dir>
<retouch-directory-name>`. It keeps the listing image, generates precise
   captions/alt text and canonical order, and links only approved replacements.

## Apply And Verify

- Fresh verified local VPS database + uploads backup is mandatory. The standard
  backup CLI currently cannot read the protected infra env as deploy. The scoped
  server-only `run_catalog_gallery_curation.py --backup-only` uses existing Docker
  access and explicit nonsecret DB/container names, without changing env rights.
- Copy the manifest, replacement directory, `apply_catalog_gallery_curation.mjs`
  as `apply.mjs`, the existing release identity generator as `identity-sql.mjs`,
  and the server runner into a mode-700 `bundle` inside that backup. Make local
  dependency resolution available there; keep all regular operator files 600.
- Execute the server runner with `--bundle` and `--backup-dir` first WITHOUT
  `--apply`. It creates the existing temporary non-admin release identity,
  performs a no-content-write dry-run, then deletes the identity and checks 401
  for its revoked token. Token values never leave the server or appear in output.
- After review/owner authorization, repeat with `--apply`. Only new photo files
  are uploaded. Already matching batch/hash files are reused. The reviewed live
  before-state is checked again; application is one Directus `updateBatch`.
  Pause concurrent gallery editing for the application window: the API preflight
  and postflight detect conflicts but are not database compare-and-swap locks.
- `UNIQUE(product,sort)` requires staging changed sort values and final values
  in the SAME request/transaction. Directus 11.17.4 supports heterogeneous batch
  updates transactionally. No intermediate gallery order is committed.
- Business tables are compared before/after by ordered whole-row hashes. Old
  files are moved to `ISVOI File Review` only after references are removed; never
  deleted. The immutable `curation-state.json` records old/new media fields.
- Directus API writes preserve activity/events/cache purge. The runner also
  calls the existing authenticated site revalidation endpoint server-side.
  There is no app deployment, PM2 worker restart or Avito operation.
- Verify public replacement bytes/dimensions, every gallery tab on desktop and
  mobile, fullscreen navigation and draft 404 using
  `node scripts/smoke_catalog_gallery_curation.mjs <audit-dir>` with the verified
  `curation-state.json`. Run Catalog V3/inventory/passport audits and public smokes.

## Recovery

The runner's `--rollback` restores old folders and old photo references/captions/
order through the same atomic batch mechanism. It refuses later conflicting
editorial changes; do not restore the whole database to undo a photo correction.

`--resume-prepared` is only for a known failed/rolled-back API transaction with
the exact manifest digest and an unchanged ORIGINAL live before-state. It reuses
uploaded batch/hash files. It is not a way to overwrite an applied or partially
edited gallery. Keep failed rehearsal evidence rather than deleting it.

Focused local gates:

```text
python scripts/test_retouch_catalog_photo_backgrounds.py
node --test scripts/test_catalog_gallery_curation.mjs
```

Directus implementation reference:
[11.17.4 ItemsService updateBatch](https://github.com/directus/directus/blob/v11.17.4/api/src/services/items.ts).
