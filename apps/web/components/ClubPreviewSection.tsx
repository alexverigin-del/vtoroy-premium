import Link from "next/link";
import type { PageSection } from "@vtoroy/shared";
import { normalizeSiteUrl } from "./site-chrome-utils";

type ClubLevel = {
  badge: string;
  name: string;
  tag: string;
  features: string[];
  featured: boolean;
};

const DEFAULT_LEVELS: ClubLevel[] = [
  {
    badge: "Care",
    name: "Care",
    tag: "Спокойное владение с защитой и приоритетным сервисом.",
    features: ["Продлённая гарантия", "Приоритетная диагностика", "Зафиксированная цена выкупа"],
    featured: false,
  },
  {
    badge: "Популярный",
    name: "Upgrade",
    tag: "Плановое обновление на следующую вещь без потери в цене.",
    features: ["Всё из уровня Care", "Обновление по известной цене выхода", "Ранний доступ к новым лотам в кругу"],
    featured: true,
  },
  {
    badge: "Flex",
    name: "Flex",
    tag: "Максимум гибкости: пользуйтесь, выкупайте или возвращайте.",
    features: ["Всё из уровня Upgrade", "Право возврата устройства", "Выкуп в собственность в любой момент"],
    featured: false,
  },
];

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function clubLevelList(value: unknown): ClubLevel[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const badge = typeof record.badge === "string" ? record.badge : "";
    const name = typeof record.name === "string" ? record.name : "";
    const tag = typeof record.tag === "string" ? record.tag : "";
    const features = stringList(record.features);
    const featured = typeof record.featured === "boolean" ? record.featured : false;
    return name || tag || features.length > 0 ? [{ badge, name, tag, features, featured }] : [];
  });
}

function CheckIcon() {
  return (
    <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M5 12l4 4 10-10" />
    </svg>
  );
}

export function ClubPreviewSection({ section }: { section: PageSection }) {
  const levels = clubLevelList(section.content.levels);
  const renderedLevels = levels.length > 0 ? levels : DEFAULT_LEVELS;

  return (
    <section className="bg-carbon py-16 text-white md:py-20" id="club">
      <div className="mx-auto max-w-[1180px] px-4 md:px-6">
        <div className="mx-auto max-w-[780px] text-center">
          {section.eyebrow ? (
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-white/55">{section.eyebrow}</div>
          ) : null}
          {section.headline ? (
            <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-normal text-white md:text-5xl">
              {section.headline}
            </h2>
          ) : null}
          {section.body ? <p className="mt-4 text-[17px] leading-relaxed text-white/70">{section.body}</p> : null}
        </div>

        <div className="mt-10 grid gap-3 md:grid-cols-3">
          {renderedLevels.map((level) => (
            <div
              key={`${level.name}-${level.tag}`}
              className={[
                "rounded-card border p-5",
                level.featured
                  ? "border-link-blue bg-white text-carbon shadow-product"
                  : "border-white/12 bg-white/[0.06] text-white",
              ].join(" ")}
            >
              {level.badge ? (
                <div
                  className={[
                    "inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em]",
                    level.featured ? "bg-link-blue/10 text-link-blue" : "bg-white/10 text-white/65",
                  ].join(" ")}
                >
                  {level.badge}
                </div>
              ) : null}
              {level.name ? <div className="mt-5 text-2xl font-semibold leading-tight">{level.name}</div> : null}
              {level.tag ? (
                <div className={["mt-3 text-sm leading-relaxed", level.featured ? "text-graphite" : "text-white/70"].join(" ")}>
                  {level.tag}
                </div>
              ) : null}
              {level.features.length > 0 ? (
                <ul className="mt-6 grid gap-3">
                  {level.features.map((feature) => (
                    <li
                      key={feature}
                      className={[
                        "flex gap-2 text-sm leading-relaxed",
                        level.featured ? "text-carbon" : "text-white/78",
                      ].join(" ")}
                    >
                      <span className={level.featured ? "text-link-blue" : "text-white"}>
                        <CheckIcon />
                      </span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>

        {section.primaryCtaLabel || section.secondaryCtaLabel ? (
          <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
            {section.primaryCtaLabel ? (
              <Link
                href={normalizeSiteUrl(section.primaryCtaUrl || "/club")}
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-action px-7 py-3 text-sm font-semibold text-white transition hover:bg-action-blue focus-ring"
              >
                {section.primaryCtaLabel}
              </Link>
            ) : null}
            {section.secondaryCtaLabel ? (
              <Link
                href={normalizeSiteUrl(section.secondaryCtaUrl || "/#final")}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/18 bg-white/5 px-7 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10 focus-ring"
              >
                {section.secondaryCtaLabel}
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
