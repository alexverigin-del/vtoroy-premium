import type { DevicePageSettings, DevicePassport, PassportState } from "@vtoroy/shared";
import { cn } from "../lib/cn";

const stateDot: Record<PassportState, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  bad: "bg-red-500",
};

type PassportCopy = DevicePageSettings["passport"];

const defaultPassportCopy: PassportCopy = {
  eyebrow: "I СВОИ Passport",
  title: "Проверка вещи",
  body: "Чеклист функций, которые были проверены перед публикацией.",
  diagnosticsTitle: "Диагностика",
  statusPrefix: "Статус:",
  statusFallback: "зафиксирована",
  verifiedLabel: "Проверено",
};

export function PassportSummary({
  copy = defaultPassportCopy,
  passport,
}: {
  copy?: PassportCopy;
  passport: DevicePassport;
}) {
  const checklist = passport.diagnostics.checklist ?? [];

  return (
    <aside className="card overflow-hidden" data-component="PassportSummary">
      <div className="border-b border-hairline bg-ink px-6 py-5 text-white">
        <p className="text-xs font-medium uppercase tracking-eyebrow text-white/60">
          {copy.eyebrow}
        </p>
        <div className="mt-2 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">{copy.title}</h2>
            <p className="mt-1 text-sm text-white/65">{copy.body}</p>
          </div>
        </div>
      </div>

      <div className="p-6">
        <section className="rounded-card border border-hairline p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold">{copy.diagnosticsTitle}</h3>
              <p className="mt-1 text-sm text-muted">
                {copy.statusPrefix} {passport.diagnostics.status || copy.statusFallback}
              </p>
            </div>
            <span className="rounded-pill bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              {copy.verifiedLabel}
            </span>
          </div>

          {checklist.length > 0 ? (
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {checklist.map((item) => (
                <li key={item.text} className="flex items-start gap-2 text-sm">
                  <span
                    className={cn(
                      "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                      stateDot[item.state] ?? "bg-muted",
                    )}
                  />
                  <span className="text-muted">{item.text}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>
    </aside>
  );
}
