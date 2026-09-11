# Design QA — sold product cards

## Scope

- Target: variant 1 — available products remain in full colour; sold products are visually de-emphasised in grayscale with a clear `Продано` badge.
- Reference: `C:\Users\1\.codex\generated_images\01a04d88-86b2-7830-a38c-2ffb50ccdbd9\exec-b3f5e60c-7157-4575-a5b9-0b8543b931bd.png`.
- Implementation capture: `C:\Users\1\.codex\visualizations\2026\08\29\01a04d88-86b2-7830-a38c-2ffb50ccdbd9\catalog-sold-implementation.png`.
- Combined comparison: `C:\Users\1\.codex\visualizations\2026\08\29\01a04d88-86b2-7830-a38c-2ffb50ccdbd9\catalog-sold-comparison.png`.
- Runtime: existing ISVOI Next.js application, desktop catalogue, Codex in-app browser.

## Visual review

- Sold photography, supporting facts, price and action are grayscale while available cards retain the existing colour treatment.
- The dark neutral `Продано` pill is centred over the product image and remains legible against both light and dark photography.
- The sold card keeps the existing card geometry, typography, radius and spacing; the catalogue grid does not shift.
- The sold price and action are de-emphasised without making the card unreadable.
- The existing CMS action remains authoritative, so production can continue to use `Узнать о поступлении` and retain access to the product Passport instead of presenting a misleading destination.

## Behaviour and accessibility

- The whole card remains one keyboard-focusable link with the existing visible focus ring.
- `Продано` is exposed once in the accessible name; the duplicate status line is omitted for sold cards.
- Available and reserved cards are unchanged.
- Default V3 catalogue sorting requests `available → reserved → sold`; explicit price and update sorting remains unchanged.

## Verification

- Sold-visibility and default-sort contract: passed.
- Targeted ESLint: passed.
- TypeScript typecheck: passed.
- Next.js production build: passed.
- Client bundle budget: passed (`889.5 kB` raw of `905.0 kB`).
- In-app browser desktop visual review: passed.

## Issues

- P0: none.
- P1: none.
- P2: none.

## Follow-up — one-line sold badge

- Source visual truth: `C:\Users\1\AppData\Local\Temp\codex-clipboard-b5f18c27-04d8-4e3f-8d05-807fb2813617.png` (`358 × 355` px).
- Implementation screenshot: `C:\Users\1\.codex\visualizations\2026\08\29\01a04d88-86b2-7830-a38c-2ffb50ccdbd9\catalog-sold-badge-oneline.png` (`290 × 300` px).
- Focused comparison: `C:\Users\1\.codex\visualizations\2026\08\29\01a04d88-86b2-7830-a38c-2ffb50ccdbd9\catalog-sold-badge-oneline-comparison.png`.
- Viewport: desktop catalogue in the Codex in-app browser, `1264 × 712` CSS px, density `1`; implementation clip `289.6 × 300` CSS px, normalized to `290 × 300` output pixels.
- State: sold card with the managed Directus label `Белгород · Продано`.
- Full-view evidence: the supplied reference is itself a focused card crop; the implementation capture includes the complete image region and the beginning of the card metadata, confirming that the pill remains centred and contained by the card.
- Focused-region evidence: the combined before/after image shows the same sold badge changing from two lines to one without changing colour, radius, typography, or image treatment.

### Comparison history

- Earlier P2: the managed city/status label wrapped after `Белгород ·`, increasing the pill height and weakening the compact overlay hierarchy.
- Fix: added the existing Tailwind `whitespace-nowrap` utility to the badge only.
- Post-fix evidence: computed `white-space` is `nowrap`; badge size is `172.29 × 36` CSS px inside a `289.6` px image region, leaving safe horizontal space on both sides.

### Fidelity surfaces

- Fonts and typography: existing Inter family, size, weight, line height, and antialiasing are unchanged; wrapping is removed as requested.
- Spacing and layout rhythm: existing padding, pill radius, centring, and card grid are unchanged.
- Colours and tokens: existing `bg-carbon/80` and `text-white` tokens are unchanged.
- Image quality: the original product asset, crop, grayscale treatment, and scaling are unchanged.
- Copy and content: the label still comes from Directus and remains `Белгород · Продано`.

### Follow-up findings

- P0: none.
- P1: none.
- P2: none after the one-line fix.
- P3: none required for this scoped change.

Final result: passed
