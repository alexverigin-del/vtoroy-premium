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

Final result: passed
