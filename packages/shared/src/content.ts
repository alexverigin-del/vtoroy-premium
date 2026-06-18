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
  phone?: string;
  telegram?: string;
  email?: string;
  address?: string;
  footerLegal?: string;
  maintenanceMode?: boolean;
}

export type NavLocation = "header" | "footer" | "mobile";

export interface NavigationItem {
  id: string;
  label: string;
  url: string;
  location: NavLocation;
  sort: number;
  isActive: boolean;
  openInNew?: boolean;
}

/** Section-specific structured payloads keyed loosely by section_key. */
export interface SectionContent {
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
  // passport_preview
  features?: { title: string; text: string; icon?: string }[];
  passport?: {
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
  sort: number;
  isActive: boolean;
}
