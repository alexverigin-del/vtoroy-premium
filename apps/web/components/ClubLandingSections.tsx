import type {
  ClubLegalDocument,
  ClubOffer,
  ClubPageSettings,
  ClubPlan,
  ClubProcessItem,
  ClubRuleItem,
} from "@vtoroy/shared";
import { cn } from "@/lib/cn";
import { ProductImage } from "./ProductImage";
import { ClubLeadForm } from "./ClubLeadForm";
import { primaryCtaClass, secondaryCtaClass } from "./ui-classes";

function sectionEyebrow(value: string) {
  return <p className="text-sm font-semibold leading-snug text-link-blue">{value}</p>;
}

function termLabel(offer: ClubOffer) {
  if (!offer.termMonths) return "Срок по заявке";
  return `от ${offer.termMonths} мес.`;
}

function processGroup(items: ClubProcessItem[], group: ClubProcessItem["group"]) {
  return items.filter((item) => item.group === group).sort((a, b) => a.sort - b.sort);
}

export function ClubHeroSection({
  settings,
  passportItems,
}: {
  settings: ClubPageSettings;
  passportItems: ClubProcessItem[];
}) {
  return (
    <section className="bg-white py-20 md:py-28" data-component="ClubHeroSection">
      <div className="mx-auto grid max-w-page items-center gap-10 px-4 lg:grid-cols-2">
        <div>
          {sectionEyebrow(settings.heroEyebrow)}
          <h1 className="leading-display mt-4 text-5xl font-semibold tracking-normal text-carbon md:text-7xl">
            {settings.heroTitle}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-graphite">
            {settings.heroBody}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a href={settings.heroPrimaryUrl} className={primaryCtaClass}>
              {settings.heroPrimaryLabel}
            </a>
            <a href={settings.heroSecondaryUrl} className={secondaryCtaClass}>
              {settings.heroSecondaryLabel}
            </a>
          </div>
          <p className="mt-6 rounded-card border border-hairline bg-surface p-4 text-sm leading-relaxed text-muted">
            {settings.heroDisclaimer}
          </p>
        </div>
        <div className="rounded-card border border-hairline bg-surface p-4">
          <div className="rounded-card bg-white p-5 shadow-soft">
            <p className="text-sm font-semibold text-link-blue">{settings.heroPanelEyebrow}</p>
            <h2 className="mt-3 text-2xl font-semibold text-carbon">{settings.heroPanelTitle}</h2>
            <div className="mt-5 space-y-3">
              {passportItems.map((item, index) => (
                <div key={item.id} className="flex items-center gap-3 rounded-card bg-surface p-4">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-carbon text-sm font-semibold text-white">
                    {index + 1}
                  </span>
                  <span className="text-sm font-semibold text-carbon">{item.title}</span>
                </div>
              ))}
            </div>
            <p className="mt-5 text-sm leading-relaxed text-graphite">{settings.heroPanelBody}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function ClubOfferSection({
  offers,
  settings,
}: {
  offers: ClubOffer[];
  settings: ClubPageSettings;
}) {
  return (
    <section id="devices" className="bg-white py-16 md:py-24">
      <div className="mx-auto max-w-page px-4">
        <div className="max-w-3xl">
          {sectionEyebrow(settings.offersEyebrow)}
          <h2 className="mt-3 text-3xl font-semibold leading-tight text-carbon md:text-5xl">
            {settings.offersTitle}
          </h2>
        </div>
        {offers.length > 0 ? (
          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {offers.map((offer) => (
              <article
                key={offer.id}
                className="flex min-h-full flex-col overflow-hidden rounded-card border border-hairline bg-surface"
              >
                <a
                  href={`https://isvoi.ru/product/${offer.product.id}`}
                  className="block h-64 bg-white sm:h-80"
                >
                  {offer.product.listingImage ? (
                    <ProductImage
                      src={offer.product.listingImage}
                      alt={offer.product.listingAlt || offer.product.title}
                      width={640}
                      height={480}
                      sizes="(min-width: 1280px) 30vw, (min-width: 768px) 45vw, 92vw"
                      className="h-full w-full object-contain p-6"
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center px-6 text-sm text-muted">
                      Фото готовится
                    </span>
                  )}
                </a>
                <div className="flex flex-1 flex-col p-5">
                  <div className="flex flex-wrap gap-2">
                    {offer.badge ? (
                      <span className="rounded-pill bg-white px-3 py-1 text-xs font-semibold text-link-blue">
                        {offer.badge}
                      </span>
                    ) : null}
                    <span className="rounded-pill bg-white px-3 py-1 text-xs font-semibold text-muted">
                      {termLabel(offer)}
                    </span>
                  </div>
                  <h3 className="mt-4 text-xl font-semibold text-carbon">{offer.product.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-graphite">
                    {offer.product.model || offer.product.category.name}
                  </p>
                  <p className="mt-5 text-2xl font-semibold text-carbon">{offer.monthlyText}</p>
                  {offer.termsText ? (
                    <p className="mt-2 text-xs leading-relaxed text-muted">{offer.termsText}</p>
                  ) : null}
                  <a
                    href={`?club_offer=${encodeURIComponent(offer.id)}#club-request`}
                    className={cn(primaryCtaClass, "mt-6 w-full")}
                  >
                    {offer.ctaLabel}
                  </a>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-10 rounded-card border border-hairline bg-surface p-6 md:p-8">
            <h3 className="text-2xl font-semibold text-carbon">{settings.offersEmptyTitle}</h3>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-graphite">
              {settings.offersEmptyBody}
            </p>
            <a href="#club-request" className={cn(primaryCtaClass, "mt-6")}>
              Начать подбор
            </a>
          </div>
        )}
      </div>
    </section>
  );
}

export function ClubCycleSection({
  settings,
  items,
}: {
  settings: ClubPageSettings;
  items: ClubProcessItem[];
}) {
  const scenarios = processGroup(items, "scenario");
  return (
    <section id="how-it-works" className="bg-surface py-16 md:py-24">
      <div className="mx-auto max-w-page px-4">
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            {sectionEyebrow(settings.cycleEyebrow)}
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-carbon md:text-5xl">
              {settings.cycleTitle}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-graphite">{settings.cycleBody}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {scenarios.map((scenario, index) => (
              <article
                key={scenario.title}
                className="rounded-card border border-hairline bg-white p-5"
              >
                <p className="text-sm font-semibold text-link-blue">
                  {scenario.label || String(index + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-4 text-xl font-semibold text-carbon">{scenario.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-graphite">{scenario.body}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function ClubPassportCycleSection({
  settings,
  items,
}: {
  settings: ClubPageSettings;
  items: ClubProcessItem[];
}) {
  const passportItems = processGroup(items, "passport");
  return (
    <section className="bg-white py-16 md:py-24">
      <div className="mx-auto max-w-page px-4">
        <div className="rounded-card border border-hairline bg-carbon p-6 text-white md:p-10">
          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              {sectionEyebrow(settings.passportEyebrow)}
              <h2 className="mt-3 text-3xl font-semibold leading-tight md:text-5xl">
                {settings.passportTitle}
              </h2>
              <p className="mt-4 text-base leading-relaxed text-white/70">
                {settings.passportBody}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {passportItems.map((item) => (
                <article
                  key={item.id}
                  className="rounded-card border border-white/10 bg-white/5 p-5"
                >
                  <p className="text-sm font-semibold text-white/65">{item.label}</p>
                  <h3 className="mt-3 text-xl font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/70">{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function ClubPlansSection({
  plans,
  settings,
}: {
  plans: ClubPlan[];
  settings: ClubPageSettings;
}) {
  const activePlans = plans.filter((plan) => !plan.isFuture);
  const comparisonRows = [
    {
      label: "Минимальный срок",
      value: (plan: ClubPlan) => (plan.minTermMonths ? `от ${plan.minTermMonths} мес.` : ""),
    },
    { label: "Сопровождение", value: (plan: ClubPlan) => plan.supportLevel || "" },
    { label: "Ответ по сервису", value: (plan: ClubPlan) => plan.serviceResponseText || "" },
    { label: "Диагностика", value: (plan: ClubPlan) => plan.diagnosticsText || "" },
    { label: "Подменное устройство", value: (plan: ClubPlan) => plan.replacementText || "" },
    { label: "Досрочный выход", value: (plan: ClubPlan) => plan.earlyExitText || "" },
    { label: "Повреждения", value: (plan: ClubPlan) => plan.damageText || "" },
  ].filter((row) => activePlans.some((plan) => row.value(plan)));

  return (
    <section id="plans" className="bg-surface py-16 md:py-24">
      <div className="mx-auto max-w-page px-4">
        {sectionEyebrow(settings.plansEyebrow)}
        <h2 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight text-carbon md:text-5xl">
          {settings.plansTitle}
        </h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {plans.map((plan) => (
            <article
              key={plan.id}
              className="flex min-h-full flex-col rounded-card border border-hairline bg-white p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-2xl font-semibold text-carbon">{plan.name}</h3>
                {plan.badge ? (
                  <span className="rounded-pill bg-surface px-3 py-1 text-xs font-semibold text-link-blue">
                    {plan.badge}
                  </span>
                ) : null}
              </div>
              <p className="mt-3 text-sm leading-relaxed text-graphite">{plan.summary}</p>
              <ul className="mt-5 space-y-2 text-sm leading-relaxed text-graphite">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-link-blue" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              {plan.isFuture ? (
                <p className="mt-auto pt-6 text-sm font-semibold text-muted">
                  Будущий формат, доступен как лист ожидания.
                </p>
              ) : (
                <a href="#club-request" className={cn(secondaryCtaClass, "mt-auto pt-3")}>
                  Рассчитать {plan.name}
                </a>
              )}
            </article>
          ))}
        </div>
        {activePlans.length > 1 && comparisonRows.length > 0 ? (
          <div className="mt-8 overflow-x-auto rounded-card border border-hairline bg-white">
            <table className="w-full min-w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-hairline bg-frost">
                  <th className="p-4 font-semibold text-carbon">Сравнение</th>
                  {activePlans.map((plan) => (
                    <th key={plan.id} className="p-4 font-semibold text-carbon">
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row) => (
                  <tr key={row.label} className="border-b border-hairline last:border-b-0">
                    <th className="p-4 font-medium text-graphite">{row.label}</th>
                    {activePlans.map((plan) => (
                      <td key={plan.id} className="p-4 leading-relaxed text-graphite">
                        {row.value(plan) || "Не заявлено"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function ClubRulesSection({
  rules,
  settings,
}: {
  rules: ClubRuleItem[];
  settings: ClubPageSettings;
}) {
  const categoryLabels: Record<string, string> = {
    wear: "Нормальный износ",
    damage: "Повреждения",
    return: "Возврат",
    buyout: "Выкуп",
    early_exit: "Досрочный выход",
    payment: "Платежи",
    loss: "Потеря или кража",
    data: "Данные и Apple ID",
    service: "Сервис",
  };
  const wearRules = rules.filter((rule) => rule.category === "wear");
  const otherRules = rules.filter((rule) => rule.category !== "wear");

  return (
    <section id="rules" className="bg-white py-16 md:py-24">
      <div className="mx-auto max-w-page px-4">
        <div className="max-w-3xl">
          {sectionEyebrow(settings.rulesEyebrow)}
          <h2 className="mt-3 text-3xl font-semibold leading-tight text-carbon md:text-5xl">
            {settings.rulesTitle}
          </h2>
        </div>
        {wearRules.length > 0 ? (
          <div className="mt-10 rounded-card border border-hairline bg-carbon p-6 text-white md:p-8">
            <p className="text-sm font-semibold text-white/65">Что считается нормальным износом</p>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {wearRules.map((rule) => (
                <article
                  key={rule.id}
                  className="rounded-card border border-white/10 bg-white/5 p-5"
                >
                  <h3 className="text-xl font-semibold">{rule.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/70">{rule.body}</p>
                </article>
              ))}
            </div>
          </div>
        ) : null}
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {otherRules.map((rule) => (
            <article key={rule.id} className="rounded-card border border-hairline bg-surface p-5">
              <p className="text-xs font-semibold text-muted">
                {categoryLabels[rule.category] || "Условия пилота"}
              </p>
              <h3 className="mt-3 text-xl font-semibold text-carbon">{rule.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-graphite">{rule.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ClubParticipationSection({
  settings,
  items,
}: {
  settings: ClubPageSettings;
  items: ClubProcessItem[];
}) {
  const participationItems = processGroup(items, "participation");
  if (participationItems.length === 0) return null;

  return (
    <section className="bg-surface py-16 md:py-24">
      <div className="mx-auto max-w-page px-4">
        {sectionEyebrow(settings.participationEyebrow)}
        <h2 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight text-carbon md:text-5xl">
          {settings.participationTitle}
        </h2>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-graphite">
          {settings.participationBody}
        </p>
        <div className="mt-10 grid gap-3 md:grid-cols-3">
          {participationItems.map((item, index) => (
            <article key={item.id} className="rounded-card border border-hairline bg-white p-5">
              <p className="text-sm font-semibold text-link-blue">
                {item.label || String(index + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-4 text-xl font-semibold text-carbon">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-graphite">{item.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ClubLegalSection({
  settings,
  documents,
}: {
  settings: ClubPageSettings;
  documents: ClubLegalDocument[];
}) {
  return (
    <section className="bg-white py-16 md:py-24">
      <div className="mx-auto max-w-page px-4">
        {sectionEyebrow(settings.legalEyebrow)}
        <h2 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight text-carbon md:text-5xl">
          {settings.legalTitle}
        </h2>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-graphite">
          {settings.legalBody}
        </p>
        {documents.length > 0 ? (
          <div className="mt-8 grid gap-3 md:grid-cols-3">
            {documents.map((document) => (
              <article
                key={document.id}
                className="rounded-card border border-hairline bg-surface p-5"
              >
                <p className="text-xs font-semibold text-muted">
                  Версия {document.version || "на проверке"}
                </p>
                <h3 className="mt-3 text-xl font-semibold text-carbon">{document.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-graphite">{document.summary}</p>
                <a
                  href={`/legal/${document.slug}`}
                  className={cn(secondaryCtaClass, "mt-5 w-full")}
                >
                  Открыть документ
                </a>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-8 rounded-card border border-hairline bg-surface p-5 text-sm leading-relaxed text-muted">
            Условия пилота и проект договора проходят проверку. До публикации документов Club
            остаётся закрытым от поисковой индексации.
          </p>
        )}
      </div>
    </section>
  );
}

export function ClubFinalSection({
  settings,
  offers,
  plans,
  selectedOfferId,
}: {
  settings: ClubPageSettings;
  offers: ClubOffer[];
  plans: ClubPlan[];
  selectedOfferId?: string;
}) {
  return (
    <section className="bg-surface py-16 md:py-24">
      <div className="mx-auto grid max-w-page gap-8 px-4 lg:grid-cols-2">
        <div>
          {sectionEyebrow(settings.finalEyebrow)}
          <h2 className="mt-3 text-3xl font-semibold leading-tight text-carbon md:text-5xl">
            {settings.finalTitle}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-graphite">{settings.finalBody}</p>
          <p className="mt-5 rounded-card border border-hairline bg-white p-4 text-sm leading-relaxed text-muted">
            {settings.heroDisclaimer}
          </p>
        </div>
        <ClubLeadForm
          settings={settings}
          offers={offers}
          plans={plans}
          selectedOfferId={selectedOfferId}
        />
      </div>
    </section>
  );
}
