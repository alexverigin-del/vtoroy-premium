// Domain types for editable site content (texts), mirroring the Directus
// collections specified in directus/schema/content-model.md.
//
// Structured CMS, not a page builder: templates are fixed; editors fill a
// bounded set of fields per section plus a typed `content` JSON.

export type PublishStatus = "draft" | "published" | "archived";

export type PageSlug =
  | "home"
  | "catalog"
  | "store"
  | "trade"
  | "club"
  | "passport"
  | "product";

export interface SiteSettings {
  brandName: string;
  tagline: string;
  city: string;
  logoFile?: string;
  logoAlt?: string;
  logoHref?: string;
  logoWidth?: number;
  logoHeight?: number;
  logoCaption?: string;
  showBrandName?: boolean;
  headerCtaLabel?: string;
  headerCtaUrl?: string;
  phone?: string;
  telegram?: string;
  email?: string;
  address?: string;
  footerNote?: string;
  footerBrandText?: string;
  footerLegal?: string;
  footerCopyright?: string;
  maintenanceMode?: boolean;
}

export type NavLocation = "header" | "footer" | "mobile" | "utility";
export type NavLinkType = "page" | "section" | "external" | "custom";
export type NavItemRole = "link" | "cta" | "group";

export interface NavigationItem {
  id: string;
  label: string;
  url: string;
  linkType?: NavLinkType;
  page?: string | null;
  sectionAnchor?: string;
  customUrl?: string;
  labelShort?: string;
  ariaLabel?: string;
  itemRole?: NavItemRole;
  icon?: string;
  location: NavLocation;
  parent?: string | null;
  sort: number;
  isActive: boolean;
  openInNew?: boolean;
}

/** Section-specific structured payloads keyed loosely by section_key. */
export interface SectionContent {
  // hero
  assurance?: string[];
  // trust
  items?: { title: string; text: string }[];
  // path_router
  cards?: { title: string; text: string; url: string; label?: string }[];
  // catalog_preview / store_preview
  limit?: number;
  filter?: string;
  filters?: { label: string; value: string }[];
  visual?: {
    imageSrc?: string;
    image_src?: string;
    imageAlt?: string;
    image_alt?: string;
    captionTitle?: string;
    caption_title?: string;
    captionText?: string;
    caption_text?: string;
  };
  steps?: { title: string; text: string }[];
  choices?: { title: string; text: string; icon?: string }[];
  valuation?: {
    heading?: string;
    fromDevice?: string;
    from_device?: string;
    fromNote?: string;
    from_note?: string;
    toDevice?: string;
    to_device?: string;
    toNote?: string;
    to_note?: string;
    label?: string;
    amount?: string;
  };
  levels?: {
    badge?: string;
    name: string;
    tag: string;
    features: string[];
    featured?: boolean;
  }[];
  diagnostics?: {
    imageSrc?: string;
    image_src?: string;
    imageAlt?: string;
    image_alt?: string;
    noteLabel?: string;
    note_label?: string;
    noteText?: string;
    note_text?: string;
  };
  comparison?: {
    ariaLabel?: string;
    aria_label?: string;
    labelHeader?: string;
    label_header?: string;
    badHeader?: string;
    bad_header?: string;
    goodHeader?: string;
    good_header?: string;
    rows?: { label: string; bad: string; good: string }[];
  };
  // final_cta
  proof?: string[];
  form?: {
    scenarioLabel?: string;
    scenario_label?: string;
    scenarioAriaLabel?: string;
    scenario_aria_label?: string;
    scenarioOptions?: string[];
    scenario_options?: string[];
    deviceLabel?: string;
    device_label?: string;
    devicePlaceholder?: string;
    device_placeholder?: string;
    contactLabel?: string;
    contact_label?: string;
    contactPlaceholder?: string;
    contact_placeholder?: string;
    submitLabel?: string;
    submit_label?: string;
    note?: string;
  };
  footerNote?: string;
  footer_note?: string;
  // passport_preview
  features?: { title: string; text: string; icon?: string }[];
  passport?: {
    ariaLabel?: string;
    aria_label?: string;
    device?: string;
    sub?: string;
    grade?: string;
    gradeLabel?: string;
    grade_label?: string;
    rows?: { label: string; value: string; state?: "ok" | "warn" | "bad" | string }[];
    exitLabel?: string;
    exit_label?: string;
    exitValue?: string;
    exit_value?: string;
    warranty?: string;
    warrantyStrong?: string;
    warranty_strong?: string;
  };
  // trade_calculator_intro
  note?: string;
  disclaimer?: string;
  // faq
  faqKeys?: string[];
  // passport_disclaimer / generic text
  text?: string;
  // escape hatch for anything else
  [key: string]: unknown;
}

export interface PageSection {
  id: string;
  sectionKey: string;
  variant?: string;
  eyebrow?: string;
  headline?: string;
  subheadline?: string;
  body?: string;
  primaryCtaLabel?: string;
  primaryCtaUrl?: string;
  secondaryCtaLabel?: string;
  secondaryCtaUrl?: string;
  /** Absolute image URL (already resolved from a Directus file id). */
  image?: string;
  sortOrder: number;
  isActive: boolean;
  content: SectionContent;
}

export interface SitePage {
  slug: PageSlug | string;
  template: string;
  status: PublishStatus;
  title: string;
  metaDescription?: string;
  ogImage?: string;
  sections: PageSection[];
}

export interface FaqItem {
  id: string;
  key: string;
  question: string;
  answer: string;
  category: "passport" | "trade" | "club" | "general" | string;
  page?: string | null;
  sort: number;
  isActive: boolean;
}
