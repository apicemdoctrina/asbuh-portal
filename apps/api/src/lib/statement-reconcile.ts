import type { ParsedStatement, ReconcileResult, AccountReconcile } from "./statement-types.js";

const round2 = (n: number) => Math.round(n * 100) / 100;

export function reconcile(st: ParsedStatement): ReconcileResult {
  const perAccount: AccountReconcile[] = st.accounts.map((acc) => {
    const sumIn = round2(
      acc.operations.filter((o) => o.direction === "in").reduce((s, o) => s + o.amount, 0),
    );
    const sumOut = round2(
      acc.operations.filter((o) => o.direction === "out").reduce((s, o) => s + o.amount, 0),
    );
    const computedClosing = round2(acc.openingBalance + sumIn - sumOut);
    const declaredClosing = acc.closingBalance;
    const diff = round2(declaredClosing - computedClosing);

    let ok: boolean;
    let note: string | null = null;
    if (!acc.hasClosing) {
      ok = false;
      note = "Нет данных для сверки (отсутствует конечный остаток)";
    } else {
      ok = diff === 0;
      if (!ok) note = `Расхождение ${diff.toFixed(2)} ₽`;
    }

    return {
      accountNumber: acc.accountNumber,
      openingBalance: acc.openingBalance,
      computedClosing,
      declaredClosing,
      sumIn,
      sumOut,
      diff,
      ok,
      note,
    };
  });

  const status = perAccount.every((a) => a.ok) ? "OK" : "MISMATCH";
  const totalDiff = round2(perAccount.reduce((s, a) => s + Math.abs(a.diff), 0));
  return { status, totalDiff, perAccount };
}
