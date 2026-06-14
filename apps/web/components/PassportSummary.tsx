import type { DevicePassport, PassportState } from "@vtoroy/shared";

const stateColor: Record<PassportState, string> = {
  ok: "text-emerald-600",
  warn: "text-amber-600",
  bad: "text-red-600",
};

export function PassportSummary({ passport }: { passport: DevicePassport }) {
  return (
    <div className="card p-6">
      <h2 className="text-lg font-semibold">Паспорт Премиума</h2>

      <dl className="mt-4 divide-y divide-hairline">
        {passport.summaryRows.map((row) => (
          <div key={row.label} className="flex justify-between py-2 text-sm">
            <dt className="text-muted">{row.label}</dt>
            <dd className={`font-medium ${stateColor[row.state] ?? ""}`}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-6">
        <p className="text-sm font-medium">
          Диагностика: {passport.diagnostics.status}
        </p>
        <ul className="mt-2 space-y-1">
          {passport.diagnostics.checklist.map((item) => (
            <li key={item.text} className="flex items-start gap-2 text-sm">
              <span className={stateColor[item.state] ?? ""}>•</span>
              <span className="text-muted">{item.text}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6 rounded-card bg-surface p-4 text-sm">
        <p className="font-medium">{passport.condition.gradeText}</p>
        <p className="mt-1 text-muted">{passport.condition.note}</p>
      </div>

      <div className="mt-6 text-sm">
        <p className="font-medium">Цена выхода: {passport.exitPrice.headline}</p>
        <p className="mt-1 text-muted">{passport.exitPrice.note}</p>
      </div>
    </div>
  );
}
