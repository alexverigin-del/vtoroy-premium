---
name: ISVOI
description: Calm premium storefront for verified devices moving through trusted hands.
colors:
  action-blue: "#0071e3"
  link-blue: "#0066cc"
  signal-blue: "#2997ff"
  carbon: "#1d1d1f"
  frost: "#f5f5f7"
  ice: "#f4f8fb"
  smoke: "#333333"
  graphite: "#474747"
  ash: "#707070"
  mist: "#858585"
  onyx: "#000000"
  pebble: "#e2e2e5"
  hairline: "#d2d2d7"
  white: "#ffffff"
  success-green: "#237a3b"
  warning-amber: "#946000"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "clamp(48px, 7vw, 64px)"
    fontWeight: 600
    lineHeight: 1.07
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "clamp(32px, 5vw, 48px)"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "clamp(24px, 3vw, 28px)"
    fontWeight: 600
    lineHeight: 1.18
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.47
    letterSpacing: "-0.016em"
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0"
rounded:
  card: "8px"
  image: "8px"
  input: "8px"
  pill: "980px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  section: "120px"
components:
  button-primary:
    backgroundColor: "{colors.action-blue}"
    textColor: "{colors.white}"
    rounded: "{rounded.pill}"
    padding: "12px 22px"
  button-primary-small:
    backgroundColor: "{colors.action-blue}"
    textColor: "{colors.white}"
    rounded: "{rounded.pill}"
    padding: "8px 16px"
  button-outlined:
    backgroundColor: "transparent"
    textColor: "{colors.link-blue}"
    rounded: "{rounded.pill}"
    padding: "12px 22px"
  filter-chip:
    backgroundColor: "transparent"
    textColor: "{colors.graphite}"
    rounded: "{rounded.pill}"
    padding: "6px 14px"
  device-card:
    backgroundColor: "{colors.white}"
    textColor: "{colors.carbon}"
    rounded: "{rounded.card}"
    padding: "22px"
  input-field:
    backgroundColor: "{colors.frost}"
    textColor: "{colors.carbon}"
    rounded: "{rounded.input}"
    height: "46px"
---

# Design System: ISVOI

## 1. Overview

**Creative North Star: "The Verified Inner-Circle Storefront"**

ISVOI is a restrained premium storefront for verified devices. The system should feel like a precise private retail room: light, quiet, highly legible, and product-first. It earns trust through calm hierarchy, real device detail, visible verification modules, and predictable paths into Store, Passport, Trade, and Club.

The current visual language is Apple-adjacent by design: near-black ink, cool light surfaces, one confident blue, hairline dividers, pill actions, and carefully cropped product imagery. That restraint is useful, but it must stay attached to ISVOI's own promise: good things move through trusted hands, not through anonymous marketplace noise.

Implementation is intentionally hybrid during migration. `globals.css` loads Tailwind and owns minimal global primitives, `site.css` owns the renderer-generated marketing layer, and new React/Next product, catalog, and lead UI should be Tailwind-first with shared tokens rather than new large global CSS blocks.

The system explicitly rejects generic electronics-store clutter, aggressive discount banners, anonymous marketplace noise, heavy casino-like promotions, fake luxury, and purely decorative AI-style visuals when real product information is needed.

**Key Characteristics:**
- Light premium surfaces with near-black text and restrained blue actions.
- Product and passport information first; decoration only supports trust.
- Rounded pills for actions and chips; 8px cards for operational clarity.
- Quiet motion and tactile hover states, never attention-hungry animation.
- Editor-safe layouts that survive variable Directus content and logo lockups.
- Tailwind-first implementation for new React/Next UI; `site.css` is a transition layer for renderer-generated HTML.

## 2. Colors

The palette is restrained and trust-led: a cool Apple-like neutral field, near-black ink, and one blue action family used sparingly for decisions and links.

### Primary
- **Action Blue**: The filled action color for primary CTAs and form submission. Use it where the user can move forward: enter the circle, submit a lead, choose a catalog path.
- **Link Blue**: The outline/link color for secondary CTAs, detail prices, active chips, and lower-commitment navigation.
- **Signal Blue**: A decorative signal used for small accents, icons, and glow materials. Do not use it as small body text unless contrast is verified.

### Neutral
- **Carbon**: Primary text and serious UI ink.
- **Frost**: Main canvas and quiet control background.
- **Ice**: Elevated wash for callouts, exit-price panels, and soft information zones.
- **White**: Cards, forms, catalog items, and high-legibility content surfaces.
- **Graphite**: Secondary text with stronger presence than muted ash.
- **Ash**: Muted labels, footnotes, and low-priority supporting copy.
- **Hairline**: Dividers, card borders, input strokes, and mobile menu separators.
- **Pebble / Mist / Smoke / Onyx**: Supporting neutral steps for imagery, dark bands, and rare high-contrast accents.

### Secondary
- **Success Green**: Availability, passed checks, and positive passport states.
- **Warning Amber**: Reserved or cautionary availability states.

### Named Rules

**The Blue Rarity Rule.** Blue is an action and verification signal, not wallpaper. If more than one thing in a viewport is shouting in blue, reduce the least important one to neutral.

**The Trust Contrast Rule.** Small text must pass WCAG AA. The current signal blue and green statuses are close to the line; when text is 14px or smaller, darken the foreground instead of thinning the message.

## 3. Typography

**Display Font:** Inter with system UI fallbacks.
**Body Font:** Inter with system UI fallbacks.
**Label/Mono Font:** No mono family is part of the current identity.

**Character:** The type is clean, precise, and retail-technical without becoming cold. It behaves like a product label and a verification card: compact enough for catalog data, but spacious enough for trust-building narrative.

### Hierarchy
- **Display** (600, `clamp(48px, 7vw, 64px)`, 1.07): Hero headlines and the largest brand claims only.
- **Headline** (600, `clamp(32px, 5vw, 48px)`, 1.1): Section introductions and major page promises.
- **Title** (600, `clamp(24px, 3vw, 28px)`, 1.18): Cards, module headings, and device section titles.
- **Body** (400, 17px, 1.47): Main prose, form copy, and explanatory content. Keep long prose near 65-75ch.
- **Label** (600, 12px, 1.4): Chips, badges, metadata, footer links, and compact device facts.

### Named Rules

**The No-Mono Costume Rule.** Do not introduce monospace as shorthand for "technical". ISVOI's technical competence comes from precise content and passport structure, not terminal styling.

**The Lockup Discipline Rule.** The logo may carry a second line, but captions must remain clear at header size. If the uploaded logo already includes a descriptor, do not duplicate it with another live caption.

## 4. Elevation

The system is mostly flat and layered by tone. Surfaces are separated by white-on-frost contrast, hairline borders, and careful spacing. Shadows exist only to ground product imagery or special elevated visuals, not as generic card decoration.

### Shadow Vocabulary
- **Product Grounding** (`rgba(0, 0, 0, 0.18) 0 26px 90px`): Use only for hero/detail product renders or major device imagery.
- **Soft Product Shadow** (`rgba(0, 0, 0, 0.08) 0 18px 55px`): Use for subtle product objects and rare lifted visual moments.
- **Form Focus Ring** (`0 0 0 2px rgba(0,113,227,0.14)`): Use on focused inputs only, paired with the action blue border.

### Named Rules

**The Flat Retail Rule.** Cards are flat at rest. If a card needs emphasis, use hierarchy, product image quality, or a stronger border state before adding a shadow.

## 5. Components

### Buttons

- **Shape:** Full-pill actions (`980px`) with compact but confident padding.
- **Primary:** Action Blue fill with White text; used for the main forward path in a section or form.
- **Secondary / Outlined:** Transparent fill, Link Blue stroke and text; used for secondary exploration.
- **Ghost:** Link Blue text, no chrome; used only where surrounding layout already makes the action obvious.
- **Hover / Active:** Primary darkens slightly; outlined gains a faint blue wash; active state scales to `0.98`.

### Chips

- **Style:** Hairline pill with transparent background, Graphite text, and 14px body-small type.
- **State:** Active chips switch to Link Blue border and text with a faint blue wash.
- **Caution:** Current chip height is 34px. For mobile-first production work, new chips should target at least 44px touch height unless they are purely informational.

### Cards / Containers

- **Corner Style:** Gently squared premium cards (`8px`), not oversized rounded panels.
- **Background:** White cards on Frost or Ice canvases.
- **Shadow Strategy:** No default card shadow. Use hairline border and hover translation for catalog cards.
- **Border:** Hairline stroke is the default structural separator.
- **Internal Padding:** Catalog cards use 22px body padding; lead forms use 26px; detail panels use 24-34px depending on density.

### Inputs / Fields

- **Style:** Frost fill, Hairline stroke, 8px radius, 46px height, 14px text.
- **Focus:** Action Blue border plus a soft 2px blue ring.
- **Error / Disabled:** Not fully expressed in current CSS; future work should add explicit error and disabled states before expanding form flows.

### Navigation

- **Style:** Sticky frosted header with subtle blur, hairline bottom border, compact 12px desktop links, and a small filled CTA.
- **Brand:** `brand-logo` supports text lockups, uploaded images, custom width/height, and optional captions. Header captions are intentionally small and must not crowd the nav.
- **Mobile:** Links collapse into a frosted vertical menu below the header. The menu button is visually compact today; new work should increase the tap area to at least 44px.

### Device Card

Device cards are the commerce workhorse. They combine real product imagery, stock badge, updated date, device title, grade, key facts, price, and a passport CTA in one flat bordered card. The card should feel like a verified dossier, not a discount tile.

### Passport / Detail Panels

Detail pages use white bordered modules for gallery, buy panel, passport panel, and trade widget. The hierarchy is information-led: price and verification facts are visible before softer storytelling.

### Implementation Model

- **Global layer:** `globals.css` loads Tailwind base/components/utilities and keeps only minimal tokens, base styles, and shared primitives.
- **Renderer transition layer:** `site.css` owns the large renderer/legacy marketing layer emitted by `site-renderer.ts`.
- **New UI:** Product, catalog, lead, and future React/Next components should use Tailwind utilities and shared tokens directly.
- **Migration:** When a renderer section moves into React, move its styling into Tailwind at the same time and delete obsolete `site.css` rules.

**The Tailwind-First Migration Rule.** Do not grow `site.css` for normal product/catalog/lead UI. Use Tailwind-first React components unless the change specifically touches renderer-generated markup that still depends on `site.css`.

## 6. Do's and Don'ts

### Do:

- **Do** preserve the calm premium Apple-adjacent baseline while making ISVOI's own verification promise more specific.
- **Do** use Action Blue only for decisive forward actions and Link Blue for secondary exploration.
- **Do** keep cards at 8px radius unless a component is explicitly a pill, chip, or device render.
- **Do** use real product imagery and passport facts before decorative visuals.
- **Do** keep Directus-managed logo captions short enough to fit inside the header at mobile widths.
- **Do** verify contrast for all 12-14px labels, badges, and eyebrow text.
- **Do** respect reduced motion; reveal transitions must never hide content by default.
- **Do** build new React/Next product, catalog, lead, and component UI with Tailwind utilities and shared tokens.
- **Do** migrate styling out of `site.css` when renderer/legacy sections are moved into React.

### Don't:

- **Don't** introduce generic electronics-store clutter, aggressive discount banners, anonymous marketplace noise, heavy casino-like promotions, or fake luxury.
- **Don't** use purely decorative AI-style visuals where real product information, trust signals, and clear navigation are needed.
- **Don't** rely on repeated tiny uppercase eyebrows as section scaffolding. One deliberate label is fine; a page full of them becomes template grammar.
- **Don't** add gradient text, decorative glassmorphism cards, or oversized rounded card panels.
- **Don't** use monospace as a lazy signal of technical competence.
- **Don't** duplicate a logo descriptor: if the uploaded asset already says "Проверенная техника для своих", leave the live caption empty.
- **Don't** let mobile controls remain below comfortable touch size when they are primary filters, menu buttons, or gallery tabs.
- **Don't** add new large global CSS blocks for normal product/catalog/lead UI.
- **Don't** treat `site.css` as the permanent home for new React component styling.
