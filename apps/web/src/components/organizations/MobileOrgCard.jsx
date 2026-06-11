import { Link } from "react-router";
import {
  Layers,
  Calculator,
  FileText,
  ShieldCheck,
  Receipt,
  Users as UsersIcon,
  CalendarClock,
  RefreshCw as RefreshIcon,
} from "lucide-react";
import SectionIcon from "../SectionIcon.jsx";
import { fmtMoney } from "../../lib/format.js";
import {
  TAX_SYSTEM_LABELS,
  SERVICE_TYPE_LABELS,
  REPORTING_CHANNEL_LABELS,
  DIGITAL_SIGNATURE_LABELS,
  ORG_FORM_LABELS,
  PAYMENT_DEST_LABELS,
  PAYMENT_FREQ_LABELS,
  INACTIVE_STATUSES,
  STATUS_LABELS,
  STATUS_ACCENT,
  statusBadge,
  renderCell,
} from "./orgConstants.jsx";

export default function MobileOrgCard({ org, index, isSelected, canSelect, onToggleSelect }) {
  const expiry = renderCell("digitalSignatureExpiry", org);
  const debt = Number(org.debtAmount) || 0;
  const showDebt = debt > 0;
  const showPaymentDest = !INACTIVE_STATUSES.has(org.status) && org.paymentDestination;
  const accent = STATUS_ACCENT[org.status] || STATUS_ACCENT.new;

  return (
    <div
      className={`relative bg-surface border rounded-2xl pl-4 pr-3 py-3 overflow-hidden transition-all duration-200 ${
        isSelected ? "border-primary/50 shadow-lg" : "border-line hover:shadow-md"
      }`}
      style={
        isSelected
          ? { boxShadow: `0 0 0 1px ${accent.ring}, 0 10px 24px -8px ${accent.ring}` }
          : undefined
      }
    >
      {/* Status accent bar — left edge */}
      <div
        className="pointer-events-none absolute top-0 left-0 bottom-0 w-1"
        style={{ background: accent.bar, boxShadow: `0 0 12px 0 ${accent.ring}` }}
      />
      {/* Aurora glow — top right */}
      <div
        className="pointer-events-none absolute -top-12 -right-12 w-40 h-40 rounded-full opacity-30 dark:opacity-25 blur-3xl"
        style={{ background: `radial-gradient(circle, ${accent.aurora} 0%, transparent 70%)` }}
      />

      <div className="relative flex items-start gap-2.5">
        {canSelect && (
          <input
            type="checkbox"
            className="w-4 h-4 mt-1 rounded border-line text-primary focus:ring-primary/30 shrink-0"
            checked={isSelected}
            onChange={onToggleSelect}
            aria-label="Выбрать"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] text-subtle tabular-nums font-medium tracking-wider">
                #{index}
              </div>
              <Link
                to={`/organizations/${org.id}`}
                className="text-base font-bold leading-tight block hover:opacity-80 transition-opacity"
                style={{
                  background: accent.nameGrad,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                {org.name}
              </Link>
              {org.clientGroup && (
                <Link
                  to={`/client-groups/${org.clientGroup.id}`}
                  className="mt-0.5 text-[11px] text-subtle hover:text-primary inline-flex items-center gap-1"
                >
                  <Layers size={10} />
                  {org.clientGroup.name}
                </Link>
              )}
            </div>
            <span
              className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold ${statusBadge(org.status)}`}
              style={{ boxShadow: `0 0 8px 0 ${accent.ring}` }}
            >
              {STATUS_LABELS[org.status] || org.status}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 text-xs">
            {org.inn && (
              <span className="text-subtle tabular-nums">
                <span className="text-[10px] uppercase tracking-wider opacity-70">ИНН </span>
                {org.inn}
              </span>
            )}
            {org.form && (
              <span className="px-1.5 py-0.5 rounded-md bg-primary/10 text-primary text-[11px] font-semibold">
                {ORG_FORM_LABELS[org.form]}
              </span>
            )}
            {org.section && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-canvas border border-line text-body text-[11px] font-medium">
                <SectionIcon section={org.section} size={11} className="text-primary" />№
                {org.section.number}
              </span>
            )}
            {org.serviceType && (
              <span className="text-subtle text-[11px]">
                · {SERVICE_TYPE_LABELS[org.serviceType]}
              </span>
            )}
          </div>

          {/* Meta facts strip: tax systems, reporting, signature, cash, employees, payment freq */}
          {(org.taxSystems?.length ||
            org.reportingChannel ||
            org.digitalSignature ||
            org.hasCashRegister ||
            org.employeeCount != null ||
            org.paymentFrequency) && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {org.taxSystems?.length > 0 && (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-primary/10 text-primary"
                  title="Система налогообложения"
                >
                  <Calculator size={10} />
                  {org.taxSystems.map((k) => TAX_SYSTEM_LABELS[k] || k).join(", ")}
                </span>
              )}
              {org.reportingChannel && (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-sky-500/10 text-sky-600 dark:text-sky-300"
                  title="Канал отчётности"
                >
                  <FileText size={10} />
                  {REPORTING_CHANNEL_LABELS[org.reportingChannel]}
                </span>
              )}
              {org.digitalSignature && org.digitalSignature !== "NONE" && (
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium ${
                    org.digitalSignature === "US"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                      : "bg-amber-500/10 text-amber-600 dark:text-amber-300"
                  }`}
                  title="ЭЦП"
                >
                  <ShieldCheck size={10} />
                  ЭЦП: {DIGITAL_SIGNATURE_LABELS[org.digitalSignature]}
                </span>
              )}
              {org.hasCashRegister && (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-300"
                  title="Онлайн-касса"
                >
                  <Receipt size={10} />
                  Касса
                </span>
              )}
              {org.employeeCount != null && org.employeeCount > 0 && (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-canvas border border-line text-body"
                  title="Сотрудников"
                >
                  <UsersIcon size={10} />
                  {org.employeeCount}
                </span>
              )}
              {org.paymentFrequency && org.paymentFrequency !== "MONTHLY" && (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-canvas border border-line text-subtle"
                  title="Частота оплаты"
                >
                  <RefreshIcon size={10} />
                  {PAYMENT_FREQ_LABELS[org.paymentFrequency]}
                </span>
              )}
              {org.serviceStartDate && (
                <span
                  className="inline-flex items-center gap-1 text-[10px] text-subtle"
                  title="Начало обслуживания"
                >
                  <CalendarClock size={10} />с{" "}
                  {new Date(org.serviceStartDate).toLocaleDateString("ru-RU", {
                    month: "short",
                    year: "2-digit",
                  })}
                </span>
              )}
            </div>
          )}

          {(showDebt || showPaymentDest || org.monthlyPayment) && (
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 mt-2 text-xs">
              {org.monthlyPayment != null && (
                <span className="inline-flex items-baseline gap-1 text-body tabular-nums font-semibold">
                  {fmtMoney(org.monthlyPayment)}
                  <span className="text-[10px] text-subtle font-normal">/ мес</span>
                </span>
              )}
              {showDebt && (
                <span
                  className="px-1.5 py-0.5 rounded-md font-bold tabular-nums text-red-600 dark:text-red-200 bg-red-500/10"
                  style={{ boxShadow: "0 0 10px 0 rgba(239,68,68,0.35)" }}
                >
                  Долг {fmtMoney(debt)}
                </span>
              )}
              {showPaymentDest && (
                <span className="text-subtle">→ {PAYMENT_DEST_LABELS[org.paymentDestination]}</span>
              )}
            </div>
          )}

          {expiry?.__expiry && (
            <div className="mt-1.5 text-xs">
              <span className="text-subtle">ЭЦП до </span>
              <span className={expiry.cls}>{expiry.label}</span>
            </div>
          )}

          {org.members?.length > 0 && (
            <div className="mt-2 text-xs text-subtle truncate">
              <span className="text-[10px] uppercase tracking-wider opacity-70">Отв. </span>
              <span className="text-body">
                {org.members.map((m) => `${m.user.lastName} ${m.user.firstName[0]}.`).join(", ")}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
