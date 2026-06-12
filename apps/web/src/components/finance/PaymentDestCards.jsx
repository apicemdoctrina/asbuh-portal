import { useNavigate } from "react-router";
import { Wallet, Banknote, CreditCard, DollarSign } from "lucide-react";

const DESTINATIONS = [
  {
    key: "BANK_TOCHKA",
    label: "Банк (Точка)",
    icon: Banknote,
    color: "text-emerald-600 dark:text-emerald-300",
    bg: "bg-emerald-50 dark:bg-emerald-500/15",
    ring: "hover:ring-emerald-300",
    link: "/payments",
  },
  {
    key: "CARD",
    label: "Карта",
    icon: CreditCard,
    color: "text-blue-600 dark:text-blue-300",
    bg: "bg-blue-50 dark:bg-blue-500/15",
    ring: "hover:ring-blue-300",
    link: "/payments?tab=cashcard",
  },
  {
    key: "CASH",
    label: "Наличные",
    icon: DollarSign,
    color: "text-amber-600 dark:text-amber-300",
    bg: "bg-amber-50 dark:bg-amber-500/15",
    ring: "hover:ring-amber-300",
    link: "/payments?tab=cashcard",
  },
];

/** Revenue split by payment destination, each card links to the matching payments view. */
export default function PaymentDestCards({ byPaymentDest }) {
  const navigate = useNavigate();
  if (!byPaymentDest) return null;

  return (
    <div className="bg-surface rounded-2xl shadow-lg border border-line p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-4">
        <Wallet size={18} className="text-primary" />
        <h2 className="text-base font-semibold text-heading">Куда поступают платежи</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {DESTINATIONS.map(({ key, label, icon: Icon, color, bg, ring, link }) => {
          const item = byPaymentDest.find((d) => d.destination === key);
          const revenue = item?.revenue ?? 0;
          const count = item?.count ?? 0;
          return (
            <div
              key={key}
              className={`${bg} rounded-xl p-3 sm:p-4 cursor-pointer hover:ring-2 ${ring} transition-all flex sm:block items-center gap-3`}
              onClick={() => navigate(link)}
            >
              <div
                className={`shrink-0 p-2 rounded-lg bg-white/50 dark:bg-white/5 sm:bg-transparent sm:dark:bg-transparent sm:p-0 ${color}`}
              >
                <Icon size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex sm:block items-baseline justify-between gap-2 sm:mb-2">
                  <span className="text-sm font-medium text-body">{label}</span>
                  <span className="text-xs text-subtle sm:hidden">{count} орг.</span>
                </div>
                <div className={`text-base sm:text-lg font-bold tabular-nums ${color}`}>
                  {revenue.toLocaleString("ru-RU")} ₽
                </div>
                <div className="hidden sm:block text-xs text-subtle mt-1">{count} орг.</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
