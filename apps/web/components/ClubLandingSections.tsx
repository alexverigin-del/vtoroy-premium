import type {
  ClubOffer,
  ClubPageSettings,
  ClubPlan,
  ClubRuleItem,
  PageSection,
} from "@vtoroy/shared";
import { cn } from "@/lib/cn";
import { ProductImage } from "./ProductImage";
import { ClubLeadForm } from "./ClubLeadForm";
import { primaryCtaClass, secondaryCtaClass } from "./ui-classes";

const cycleScenarios = [
  {
    title: "Продлить",
    body: "Оставить устройство ещё на срок, если оно по-прежнему закрывает задачу.",
  },
  {
    title: "Сменить",
    body: "Перейти на другую модель после проверки и согласования новых условий.",
  },
  {
    title: "Выкупить",
    body: "Зафиксировать остаточную стоимость и оставить устройство себе.",
  },
  {
    title: "Вернуть",
    body: "Закрыть цикл по правилам нормального износа и проверки состояния.",
  },
];

function sectionEyebrow(value: string) {
  return <p className="text-sm font-semibold leading-snug text-link-blue">{value}</p>;
}

function termLabel(offer: ClubOffer) {
  if (!offer.termMonths) return "Срок по заявке";
  return `от ${offer.termMonths} мес.`;
}

export function ClubHeroSection({
  section,
  settings,
}: {
  section?: PageSection;
  settings: ClubPageSettings;
}) {
  return (
    <section className="bg-white py-20 md:py-28" data-component="ClubHeroSection">
      <div className="mx-auto grid max-w-page items-center gap-10 px-4 lg:grid-cols-2">
        <div>
          {sectionEyebrow(section?.eyebrow || "I СВОИ Club")}
          <h1 className="leading-display mt-4 text-5xl font-semibold tracking-normal text-carbon md:text-7xl">
            {section?.headline || "Своя, пока нужна."}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-graphite">
            {section?.body ||
              "Устройство по фиксированной ежемесячной модели. В конце срока можно продолжить, сменить, выкупить или вернуть."}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a href={section?.primaryCtaUrl || "#club-request"} className={primaryCtaClass}>
              {section?.primaryCtaLabel || settings.offerCtaLabel}
            </a>
            <a href={section?.secondaryCtaUrl || "#how-it-works"} className={secondaryCtaClass}>
              {section?.secondaryCtaLabel || "Как работает"}
            </a>
          </div>
          <p className="mt-6 rounded-card border border-hairline bg-surface p-4 text-sm leading-relaxed text-muted">
            {settings.heroDisclaimer}
          </p>
        </div>
        <div className="rounded-card border border-hairline bg-surface p-4">
          <div className="rounded-card bg-white p-5 shadow-soft">
            <p className="text-sm font-semibold text-link-blue">Passport цикла</p>
            <div className="mt-5 space-y-3">
              {["Передача устройства", "Период пользования", "Возврат / смена / выкуп"].map(
                (item, index) => (
                  <div key={item} className="flex items-center gap-3 rounded-card bg-surface p-4">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-carbon text-sm font-semibold text-white">
                      {index + 1}
                    </span>
                    <span className="text-sm font-semibold text-carbon">{item}</span>
                  </div>
                ),
              )}
            </div>
            <p className="mt-5 text-sm leading-relaxed text-graphite">
              Club стартует как пилот с ручным расчётом: без публичной оплаты, скоринга и личного
              кабинета в первом релизе.
            </p>
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
                  <a href="#club-request" className={cn(primaryCtaClass, "mt-6 w-full")}>
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
              {settings.offerCtaLabel}
            </a>
          </div>
        )}
      </div>
    </section>
  );
}

export function ClubCycleSection() {
  return (
    <section id="how-it-works" className="bg-surface py-16 md:py-24">
      <div className="mx-auto max-w-page px-4">
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            {sectionEyebrow("I СВОИ Club · как работает")}
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-carbon md:text-5xl">
              В конце срока есть четыре понятных сценария.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-graphite">
              Club не заставляет покупать устройство сразу. Сначала вы пользуетесь им в рамках
              согласованной модели, затем выбираете следующий шаг.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {cycleScenarios.map((scenario, index) => (
              <article
                key={scenario.title}
                className="rounded-card border border-hairline bg-white p-5"
              >
                <p className="text-sm font-semibold text-link-blue">0{index + 1}</p>
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

export function ClubPassportCycleSection() {
  return (
    <section className="bg-white py-16 md:py-24">
      <div className="mx-auto max-w-page px-4">
        <div className="rounded-card border border-hairline bg-carbon p-6 text-white md:p-10">
          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              {sectionEyebrow("I СВОИ Passport · цикл владения")}
              <h2 className="mt-3 text-3xl font-semibold leading-tight md:text-5xl">
                Передача и возврат фиксируются двумя проверками.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-white/70">
                Passport помогает отделить нормальный износ от спорных повреждений: состояние
                фиксируется в начале Club-цикла и повторно проверяется при возврате или выкупе.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-card border border-white/10 bg-white/5 p-5">
                <p className="text-sm font-semibold text-white/65">Старт</p>
                <h3 className="mt-3 text-xl font-semibold">Паспорт передачи</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/70">
                  Модель, комплект, состояние корпуса, экран, батарея, важные серийные признаки.
                </p>
              </div>
              <div className="rounded-card border border-white/10 bg-white/5 p-5">
                <p className="text-sm font-semibold text-white/65">Финиш</p>
                <h3 className="mt-3 text-xl font-semibold">Паспорт возврата</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/70">
                  Повторная проверка перед продлением, сменой, выкупом или закрытием цикла.
                </p>
              </div>
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
  return (
    <section id="rules" className="bg-white py-16 md:py-24">
      <div className="mx-auto max-w-page px-4">
        <div className="max-w-3xl">
          {sectionEyebrow(settings.rulesEyebrow)}
          <h2 className="mt-3 text-3xl font-semibold leading-tight text-carbon md:text-5xl">
            {settings.rulesTitle}
          </h2>
        </div>
        <div className="mt-10 grid gap-3 md:grid-cols-2">
          {rules.map((rule) => (
            <article key={rule.id} className="rounded-card border border-hairline bg-surface p-5">
              <p className="text-xs font-semibold uppercase text-muted">{rule.category}</p>
              <h3 className="mt-3 text-xl font-semibold text-carbon">{rule.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-graphite">{rule.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ClubFinalSection({
  settings,
  offers,
  plans,
}: {
  settings: ClubPageSettings;
  offers: ClubOffer[];
  plans: ClubPlan[];
}) {
  return (
    <section className="bg-surface py-16 md:py-24">
      <div className="mx-auto grid max-w-page gap-8 px-4 lg:grid-cols-2">
        <div>
          {sectionEyebrow("I СВОИ Club · заявка")}
          <h2 className="mt-3 text-3xl font-semibold leading-tight text-carbon md:text-5xl">
            Получите ручной расчёт Club под устройство и срок.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-graphite">
            В пилоте мы считаем условия вручную: проверяем устройство, срок, тариф, комфортный
            ежемесячный платёж и сценарий в конце срока.
          </p>
          <p className="mt-5 rounded-card border border-hairline bg-white p-4 text-sm leading-relaxed text-muted">
            {settings.heroDisclaimer}
          </p>
        </div>
        <ClubLeadForm settings={settings} offers={offers} plans={plans} />
      </div>
    </section>
  );
}
