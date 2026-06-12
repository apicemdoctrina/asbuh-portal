/** Client bank statistics: totals and per-bank breakdown (mobile cards + desktop table). */
export default function BankStatsBlock({ bankStats }) {
  if (!bankStats || bankStats.banks.length === 0) return null;

  return (
    <div className="bg-surface rounded-2xl shadow-lg border border-line p-4 sm:p-6">
      <h2 className="text-lg font-bold text-heading mb-4">Банки клиентов</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="rounded-lg border border-line p-3">
          <div className="text-xs text-subtle">Всего счетов</div>
          <div className="text-xl sm:text-2xl font-bold text-heading mt-1">
            {bankStats.totals.accounts}
          </div>
        </div>
        <div className="rounded-lg border border-line p-3">
          <div className="text-xs text-subtle">Организаций</div>
          <div className="text-xl sm:text-2xl font-bold text-heading mt-1">
            {bankStats.totals.organizations}
          </div>
        </div>
        <div className="rounded-lg border border-line p-3">
          <div className="text-xs text-subtle">Подключено к API</div>
          <div className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-300 mt-1">
            {bankStats.totals.apiConnected}
          </div>
        </div>
        <div className="rounded-lg border border-line p-3">
          <div className="text-xs text-subtle">Авто-выгрузка ВКЛ</div>
          <div className="text-xl sm:text-2xl font-bold text-primary mt-1">
            {bankStats.totals.autoFetch}
          </div>
        </div>
      </div>

      {/* Mobile: card list */}
      <div className="sm:hidden divide-y divide-line border-t border-line -mx-4">
        {bankStats.banks.map((b) => (
          <div key={b.bankName} className="px-4 py-3">
            <div className="text-sm font-semibold text-heading mb-1.5">{b.bankName}</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <div className="text-subtle">Счетов</div>
              <div className="text-right text-body tabular-nums">{b.accounts}</div>
              <div className="text-subtle">Организаций</div>
              <div className="text-right text-body tabular-nums">{b.organizations}</div>
              <div className="text-subtle">API подключено</div>
              <div className="text-right tabular-nums text-emerald-600 dark:text-emerald-300">
                {b.apiConnected || "—"}
              </div>
              <div className="text-subtle">Авто-выгрузка</div>
              <div className="text-right tabular-nums text-primary">{b.autoFetch || "—"}</div>
            </div>
          </div>
        ))}
      </div>

      {/* sm+: full table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-subtle border-b border-line">
            <tr className="text-left">
              <th className="pb-2 font-medium">Банк</th>
              <th className="pb-2 font-medium text-right">Счетов</th>
              <th className="pb-2 font-medium text-right">Организаций</th>
              <th className="pb-2 font-medium text-right">API подключено</th>
              <th className="pb-2 font-medium text-right">Авто-выгрузка</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {bankStats.banks.map((b) => (
              <tr key={b.bankName}>
                <td className="py-2.5 text-body font-medium">{b.bankName}</td>
                <td className="py-2.5 text-right text-body">{b.accounts}</td>
                <td className="py-2.5 text-right text-body">{b.organizations}</td>
                <td className="py-2.5 text-right text-emerald-600 dark:text-emerald-300">
                  {b.apiConnected || "—"}
                </td>
                <td className="py-2.5 text-right text-primary">{b.autoFetch || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
