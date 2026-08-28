import type { DevicePageSettings, DevicePassport, PassportState } from "@vtoroy/shared";
import { cn } from "../lib/cn";
import { CertificateViewer } from "./CertificateViewer";

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
  certificateStoreNote: "Полный паспорт (сертификат) устройства доступен в магазине.",
};

export function PassportSummary({
  copy = defaultPassportCopy,
  conditionTitle,
  passport,
}: {
  copy?: PassportCopy;
  conditionTitle: string;
  passport: DevicePassport;
}) {
  const checklist = passport.diagnostics.checklist ?? [];
  const summaryRows = passport.summaryRows ?? [];
  const conditionDetails =
    passport.condition.notes.length > 0
      ? passport.condition.notes
      : passport.condition.note
        ? [passport.condition.note]
        : [];

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
        {summaryRows.length > 0 ? (
          <dl className="mb-5 grid gap-3 sm:grid-cols-2">
            {summaryRows.map((row) => (
              <div
                key={`${row.label}-${row.value}`}
                className="rounded-card border border-hairline p-4"
              >
                <dt className="text-xs font-medium uppercase tracking-wide text-muted">
                  {row.label}
                </dt>
                <dd className="mt-1 flex items-start gap-2 text-sm font-semibold text-carbon">
                  <span
                    className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", stateDot[row.state])}
                  />
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
        {conditionDetails.length > 0 ? (
          <section className="mb-5 border-l-2 border-accent bg-surface px-4 py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              {passport.condition.gradeText || conditionTitle}
            </p>
            <h3 className="mt-1 font-semibold text-carbon">{conditionTitle}</h3>
            <ul className="mt-3 grid gap-2 text-sm leading-relaxed text-muted">
              {conditionDetails.map((note) => (
                <li key={note} className="flex items-start gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
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

        {passport.diagnosticReport?.publicCertificateUrl ? (
          <div className="mt-5 border-t border-hairline pt-5">
            <CertificateViewer
              href={passport.diagnosticReport.publicCertificateUrl}
              downloadHref={passport.diagnosticReport.publicCertificateDownloadUrl}
              provider={passport.diagnosticReport.provider}
              testedAt={passport.diagnosticReport.testedAt}
              note={passport.diagnosticReport.publicNote}
              storeNote={copy.certificateStoreNote}
            />
          </div>
        ) : null}
      </div>
    </aside>
  );
}
