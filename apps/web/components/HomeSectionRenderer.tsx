import Image from "next/image";
import Link from "next/link";
import type { Device, PageSection } from "@vtoroy/shared";
import { CatalogPreviewSection } from "./CatalogPreviewSection";
import { ClubPreviewSection } from "./ClubPreviewSection";
import { DiagnosticsCompareSection } from "./DiagnosticsCompareSection";
import { FinalCtaSection } from "./FinalCtaSection";
import { PassportPreviewSection } from "./PassportPreviewSection";
import { StorePreviewSection } from "./StorePreviewSection";
import { TradePreviewSection } from "./TradePreviewSection";
import { cn } from "../lib/cn";
import { normalizeSiteUrl } from "./site-chrome-utils";

type HomeSectionRendererProps = {
  section: PageSection;
  devices?: Device[];
};

type HeroPassport = {
  ariaLabel: string;
  device: string;
  sub: string;
  grade: string;
  gradeLabel: string;
  rows: { label: string; value: string; state: string }[];
  exitLabel: string;
  exitValue: string;
  warranty: string;
  warrantyStrong: string;
};

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function textField(
  record: Record<string, unknown>,
  camelKey: string,
  snakeKey: string,
  fallback: string,
): string {
  const camelField = record[camelKey];
  const snakeField = record[snakeKey];
  if (typeof camelField === "string" && camelField.trim()) return camelField;
  if (typeof snakeField === "string" && snakeField.trim()) return snakeField;
  return fallback;
}

function sectionItemList(value: unknown): { title: string; text: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const title = typeof record.title === "string" ? record.title : "";
    const text = typeof record.text === "string" ? record.text : "";
    return title || text ? [{ title, text }] : [];
  });
}

function pathCardList(
  value: unknown,
): { title: string; text: string; url: string; label: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const title = typeof record.title === "string" ? record.title : "";
    const text = typeof record.text === "string" ? record.text : "";
    const url = typeof record.url === "string" ? record.url : "#final";
    const label = typeof record.label === "string" ? record.label : "Подробнее";
    return title || text ? [{ title, text, url, label }] : [];
  });
}

function heroVisualContent(value: unknown): { imageSrc: string; imageAlt: string } {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    imageSrc: textField(
      record,
      "imageSrc",
      "image_src",
      "/assets/hero-apple-like-single-phone-clean.webp",
    ),
    imageAlt: textField(
      record,
      "imageAlt",
      "image_alt",
      "Премиальный графитовый смартфон на светло-серой студийной поверхности",
    ),
  };
}

function passportRows(value: unknown): { label: string; value: string; state: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const label = typeof record.label === "string" ? record.label : "";
    const rowValue = typeof record.value === "string" ? record.value : "";
    const state = typeof record.state === "string" ? record.state : "ok";
    return label || rowValue ? [{ label, value: rowValue, state }] : [];
  });
}

function heroPassportContent(value: unknown): HeroPassport {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const rows = passportRows(record.rows);

  return {
    ariaLabel: textField(record, "ariaLabel", "aria_label", "ISVOI Passport вещи"),
    device: textField(record, "device", "device", "iPhone 13 Pro"),
    sub: textField(record, "sub", "sub", "256 GB · Графитовый"),
    grade: textField(record, "grade", "grade", "A-"),
    gradeLabel: textField(record, "gradeLabel", "grade_label", "Грейд"),
    rows:
      rows.length > 0
        ? rows
        : [
            { label: "Батарея", value: "89%", state: "ok" },
            { label: "Ремонт", value: "не вскрывался", state: "ok" },
            { label: "Face ID", value: "работает", state: "ok" },
            { label: "Влага", value: "следов нет", state: "ok" },
          ],
    exitLabel: textField(record, "exitLabel", "exit_label", "Цена выхода через 6 мес"),
    exitValue: textField(record, "exitValue", "exit_value", "до 42 000 ₽"),
    warranty: textField(record, "warranty", "warranty", "Гарантия"),
    warrantyStrong: textField(record, "warrantyStrong", "warranty_strong", "90 дней"),
  };
}

function statusClasses(state: string): string {
  if (state === "warn") return "bg-warning text-carbon";
  if (state === "bad") return "bg-red-500 text-white";
  return "bg-success text-white";
}

function PassportQr() {
  return (
    <svg className="h-11 w-11 rounded-md bg-frost p-1" viewBox="0 0 44 44" aria-hidden="true">
      <g fill="#1d1d1f">
        <rect x="6" y="6" width="11" height="11" />
        <rect x="9" y="9" width="5" height="5" fill="#f5f5f7" />
        <rect x="27" y="6" width="11" height="11" />
        <rect x="30" y="9" width="5" height="5" fill="#f5f5f7" />
        <rect x="6" y="27" width="11" height="11" />
        <rect x="9" y="30" width="5" height="5" fill="#f5f5f7" />
        <rect x="21" y="6" width="3" height="3" />
        <rect x="21" y="14" width="3" height="3" />
        <rect x="21" y="21" width="3" height="3" />
        <rect x="27" y="21" width="3" height="3" />
        <rect x="33" y="21" width="3" height="3" />
        <rect x="21" y="27" width="3" height="3" />
        <rect x="27" y="27" width="3" height="3" />
        <rect x="33" y="33" width="3" height="3" />
        <rect x="27" y="33" width="3" height="3" />
        <rect x="33" y="27" width="3" height="3" />
      </g>
    </svg>
  );
}

function HomeHeroSection({ section }: { section: PageSection }) {
  const assurance = stringList(section.content.assurance);
  const visual = heroVisualContent(section.content.visual);
  const passport = heroPassportContent(section.content.passport);
  const imageSrc = section.image || visual.imageSrc;
  const primaryLabel = section.primaryCtaLabel || "Войти в круг";
  const primaryUrl = normalizeSiteUrl(section.primaryCtaUrl || "#final");
  const secondaryLabel = section.secondaryCtaLabel || "Смотреть Store";
  const secondaryUrl = normalizeSiteUrl(section.secondaryCtaUrl || "/catalog");
  const assuranceItems =
    assurance.length > 0
      ? assurance
      : ["В кругу своих", "С историей и проверкой", "Store в Северодвинске"];

  return (
    <section className="mx-auto max-w-[1180px] px-4 pb-16 pt-14 text-center md:px-6 md:pb-20 md:pt-20">
      {section.eyebrow ? (
        <div className="mx-auto max-w-[760px] text-xs font-semibold uppercase tracking-[0.12em] text-link-blue">
          {section.eyebrow}
        </div>
      ) : null}
      {section.headline ? (
        <h1 className="mx-auto mt-4 max-w-[900px] text-5xl font-semibold leading-[1.03] tracking-normal text-carbon md:text-7xl">
          {section.headline}
        </h1>
      ) : null}
      {section.body ? (
        <p className="mx-auto mt-5 max-w-[660px] text-lg leading-relaxed text-graphite md:text-xl">
          {section.body}
        </p>
      ) : null}

      <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
        <Link
          href={primaryUrl}
          className="focus-ring inline-flex min-h-11 items-center justify-center rounded-full bg-action px-7 py-3 text-sm font-semibold text-white transition hover:bg-action-blue"
        >
          {primaryLabel}
        </Link>
        <Link
          href={secondaryUrl}
          className="focus-ring inline-flex min-h-11 items-center justify-center rounded-full border border-hairline bg-white px-7 py-3 text-sm font-semibold text-carbon transition hover:border-link-blue hover:text-link-blue"
        >
          {secondaryLabel}
        </Link>
      </div>

      <div
        className="mx-auto mt-6 flex max-w-[780px] flex-wrap justify-center gap-2"
        aria-label="Принципы клуба"
      >
        {assuranceItems.map((item) => (
          <span
            key={item}
            className="rounded-full border border-hairline bg-frost px-3 py-2 text-sm text-graphite"
          >
            {item}
          </span>
        ))}
      </div>

      <div className="relative mx-auto mt-10 min-h-[560px] max-w-[1040px] overflow-hidden rounded-img bg-frost md:min-h-[620px]">
        <Image
          src={imageSrc}
          alt={visual.imageAlt}
          fill
          priority
          sizes="(min-width: 1180px) 1040px, 92vw"
          className="object-cover"
        />
        <div
          className="absolute inset-x-4 bottom-4 mx-auto max-w-[520px] rounded-card border border-white/70 bg-white/95 p-4 text-left shadow-product backdrop-blur md:inset-x-auto md:bottom-8 md:right-8 md:w-[390px] md:p-5"
          aria-label={passport.ariaLabel}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-base font-semibold text-carbon">{passport.device}</div>
              <div className="mt-1 text-sm text-ash">{passport.sub}</div>
            </div>
            <div className="rounded-card border border-hairline bg-frost px-3 py-2 text-center">
              <b className="block text-lg text-carbon">{passport.grade}</b>
              <span className="text-[11px] uppercase tracking-[0.08em] text-ash">
                {passport.gradeLabel}
              </span>
            </div>
          </div>

          <div className="mt-4 grid gap-2">
            {passport.rows.map((row) => (
              <div
                key={`${row.label}-${row.value}`}
                className="flex items-center justify-between gap-4 rounded-card bg-frost px-3 py-2 text-sm"
              >
                <span className="flex items-center gap-2 text-graphite">
                  <span className={cn("h-2 w-2 rounded-full", statusClasses(row.state))} />
                  {row.label}
                </span>
                <span className="font-medium text-carbon">{row.value}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-card bg-carbon px-4 py-3 text-white">
            <span className="block text-xs text-white/70">{passport.exitLabel}</span>
            <span className="mt-1 block text-lg font-semibold">{passport.exitValue}</span>
          </div>

          <div className="mt-4 flex items-center justify-between gap-4">
            <span className="text-sm text-graphite">
              {passport.warranty} <b className="text-carbon">{passport.warrantyStrong}</b>
            </span>
            <PassportQr />
          </div>
        </div>
      </div>
    </section>
  );
}

function TrustSection({ section }: { section: PageSection }) {
  const items = sectionItemList(section.content.items);
  if (items.length === 0) return null;

  return (
    <section
      className="border-y border-hairline bg-white py-8"
      aria-label={section.eyebrow || "Принципы клуба"}
    >
      <div className="mx-auto grid max-w-[1180px] gap-px px-4 md:grid-cols-3 md:px-6">
        {items.map((item) => (
          <div
            key={`${item.title}-${item.text}`}
            className="bg-frost px-5 py-6 text-center md:px-6"
          >
            <div className="text-2xl font-semibold leading-tight text-carbon md:text-3xl">
              {item.title}
            </div>
            <div className="mx-auto mt-2 max-w-[280px] text-sm leading-relaxed text-ash">
              {item.text}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PathRouterSection({ section }: { section: PageSection }) {
  const cards = pathCardList(section.content.cards);
  if (cards.length === 0) return null;

  return (
    <section
      className="bg-white py-16 md:py-20"
      aria-label={section.eyebrow || "Выберите свой сценарий"}
    >
      <div className="mx-auto max-w-[1180px] px-4 md:px-6">
        <div className="mx-auto max-w-[760px] text-center">
          {section.eyebrow ? (
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-link-blue">
              {section.eyebrow}
            </div>
          ) : null}
          {section.headline ? (
            <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-normal text-carbon md:text-5xl">
              {section.headline}
            </h2>
          ) : null}
          {section.body ? (
            <p className="mt-4 text-[17px] leading-relaxed text-graphite">{section.body}</p>
          ) : null}
        </div>

        <div className="mt-10 grid gap-3 md:grid-cols-3">
          {cards.map((card, index) => {
            const number = String(index + 1).padStart(2, "0");
            return (
              <Link
                key={`${card.title}-${card.url}`}
                href={normalizeSiteUrl(card.url)}
                className="focus-ring group flex min-h-[230px] flex-col rounded-card border border-hairline bg-frost p-5 text-left transition hover:-translate-y-0.5 hover:border-link-blue hover:bg-white hover:shadow-soft"
              >
                <span className="text-sm font-semibold text-link-blue">{number}</span>
                <strong className="mt-8 text-xl font-semibold leading-tight text-carbon">
                  {card.title}
                </strong>
                <p className="mt-3 text-sm leading-relaxed text-graphite">{card.text}</p>
                <span className="mt-auto pt-6 text-sm font-semibold text-link-blue group-hover:text-action">
                  {card.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function HomeSectionRenderer({ section, devices = [] }: HomeSectionRendererProps) {
  if (section.sectionKey === "hero") return <HomeHeroSection section={section} />;
  if (section.sectionKey === "trust") return <TrustSection section={section} />;
  if (section.sectionKey === "path_router") return <PathRouterSection section={section} />;
  if (section.sectionKey === "catalog_preview")
    return <CatalogPreviewSection section={section} devices={devices} />;
  if (section.sectionKey === "passport_preview")
    return <PassportPreviewSection section={section} />;
  if (section.sectionKey === "store_preview") return <StorePreviewSection section={section} />;
  if (section.sectionKey === "trade_preview") return <TradePreviewSection section={section} />;
  if (section.sectionKey === "club_preview") return <ClubPreviewSection section={section} />;
  if (section.sectionKey === "diagnostics_compare")
    return <DiagnosticsCompareSection section={section} />;
  if (section.sectionKey === "final_cta") return <FinalCtaSection section={section} />;

  return null;
}
