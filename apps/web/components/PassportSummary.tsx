import type { DevicePassport, PassportState } from "@vtoroy/shared";

const stateColor: Record<PassportState, string> = {
  ok: "text-emerald-600",
  warn: "text-amber-600",
  bad: "text-red-600",
};

const stateDot: Record<PassportState, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  bad: "bg-red-500",
};

export function PassportSummary({ passport }: { passport: DevicePassport }) {
  const checklist = passport.diagnostics.checklist ?? [];
  const conditionNotes = passport.condition.notes ?? [];

  return (
    <aside className="card overflow-hidden">
      <div className="border-b border-hairline bg-ink px-6 py-5 text-white">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/60">
          ISVOI Passport
        </p>
        <div className="mt-2 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              Проверка вещи
            </h2>
            <p className="mt-1 text-sm text-white/65">
              Состояние, история и условия выхода в одном документе.
            </p>
          </div>
          {passport.condition.gradeText ? (
            <div className="rounded-card border border-white/15 px-4 py-3 text-right">
              <span className="block text-xs text-white/55">Грейд</span>
              <strong className="text-xl">
                {passport.condition.gradeText.replace(/^грейд\s*/i, "")}
              </strong>
            </div>
          ) : null}
        </div>
      </div>

      <div className="p-6">
        <dl className="grid gap-3 sm:grid-cols-2">
          {passport.summaryRows.map((row) => (
            <div
              key={row.label}
              className="rounded-card border border-hairline bg-surface p-4"
            >
              <dt className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted">
                <span
                  className={`h-2 w-2 rounded-full ${stateDot[row.state] ?? "bg-muted"}`}
                />
                {row.label}
              </dt>
              <dd className={`mt-2 text-lg font-semibold ${stateColor[row.state] ?? "text-ink"}`}>
                {row.value}
              </dd>
            </div>
          ))}
        </dl>

        <section className="mt-6 rounded-card border border-hairline p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold">Диагностика</h3>
              <p className="mt-1 text-sm text-muted">
                Статус: {passport.diagnostics.status || "зафиксирована"}
              </p>
            </div>
            <span className="rounded-pill bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              Проверено
            </span>
          </div>

          {checklist.length > 0 ? (
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {checklist.map((item) => (
                <li key={item.text} className="flex items-start gap-2 text-sm">
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${stateDot[item.state] ?? "bg-muted"}`}
                  />
                  <span className="text-muted">{item.text}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="mt-4 rounded-card bg-surface p-5">
          <h3 className="font-semibold">Состояние</h3>
          <p className="mt-2 text-sm text-muted">{passport.condition.note}</p>
          {conditionNotes.length > 0 ? (
            <ul className="mt-3 space-y-1 text-sm text-muted">
              {conditionNotes.map((note) => (
                <li key={note}>- {note}</li>
              ))}
            </ul>
          ) : null}
        </section>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <section className="rounded-card border border-hairline p-5">
            <h3 className="font-semibold">Гарантия</h3>
            <p className="mt-2 text-sm text-muted">
              {passport.warranty.duration || "90 дней"}
            </p>
            {passport.warranty.covered ? (
              <p className="mt-3 text-xs text-muted">{passport.warranty.covered}</p>
            ) : null}
          </section>

          <section className="rounded-card border border-hairline p-5">
            <h3 className="font-semibold">Цена выхода</h3>
            <p className="mt-2 text-lg font-semibold text-accent">
              {passport.exitPrice.headline}
            </p>
            <p className="mt-2 text-xs text-muted">{passport.exitPrice.note}</p>
          </section>
        </div>
      </div>
    </aside>
  );
}
