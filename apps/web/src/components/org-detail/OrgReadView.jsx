import { useState } from "react";
import { Link } from "react-router";
import { UserPlus, Trash2 } from "lucide-react";
import { api } from "../../lib/api.js";
import { useAuth } from "../../context/AuthContext.jsx";
import ContactsCard from "../ContactsCard.jsx";
import OrgCompletenessCard from "../OrgCompletenessCard.jsx";
import {
  TAX_SYSTEM_LABELS,
  DIGITAL_SIGNATURE_LABELS,
  REPORTING_CHANNEL_LABELS,
  SERVICE_TYPE_LABELS,
  ROLE_LABELS,
  PAYMENT_DESTINATION_LABELS,
  PAYMENT_FREQUENCY_LABELS,
  formatCurrency,
  formatDate,
} from "./orgDetailConstants.js";

/** Compact key-value field for read mode. */
export function Field({ label, value }) {
  const empty = value == null || value === "" || value === "—";
  if (empty) {
    // Hide empty fields on mobile entirely — desktop keeps the "—" placeholder
    return (
      <div className="hidden sm:block min-w-0">
        <dt className="text-[11px] font-semibold text-subtle uppercase tracking-wide leading-none">
          {label}
        </dt>
        <dd className="text-sm text-body mt-1 leading-snug">
          <span className="text-subtle">—</span>
        </dd>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      {/* Mobile: inline label + value on one line */}
      <div className="flex sm:hidden items-baseline gap-2 text-sm leading-snug">
        <dt className="text-[10px] font-semibold text-subtle uppercase tracking-wide shrink-0">
          {label}
        </dt>
        <dd className="text-body break-words flex-1 min-w-0">{value}</dd>
      </div>
      {/* Desktop: stacked */}
      <div className="hidden sm:block">
        <dt className="text-[11px] font-semibold text-subtle uppercase tracking-wide leading-none">
          {label}
        </dt>
        <dd className="text-sm text-body mt-1 leading-snug break-words">{value}</dd>
      </div>
    </div>
  );
}

function PriceHistoryAddForm({ orgId, onAdded }) {
  const [price, setPrice] = useState("");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleAdd(e) {
    e.preventDefault();
    if (!price || !date) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api(`/api/organizations/${orgId}/price-history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price, effectiveFrom: date }),
      });
      if (res.ok) {
        setPrice("");
        setDate("");
        onAdded();
      } else {
        setError("Не удалось сохранить");
      }
    } catch {
      setError("Ошибка сети");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleAdd} className="pt-2 border-t border-line mt-2 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] font-medium text-subtle mb-0.5">Дата</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-2.5 py-1.5 border border-line rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            required
          />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-subtle mb-0.5">Сумма ₽</label>
          <input
            type="number"
            step="1"
            min="0"
            placeholder="10 000"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-full px-2.5 py-1.5 border border-line rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            required
          />
        </div>
      </div>
      {error && <div className="text-xs text-red-500 dark:text-red-400">{error}</div>}
      <button
        type="submit"
        disabled={saving || !price || !date}
        className="w-full py-1.5 text-xs font-medium text-white bg-gradient-to-r from-[#6567F1] to-[#5557E1] rounded-lg hover:from-[#5557E1] hover:to-[#4547D1] disabled:opacity-50 transition-all"
      >
        Добавить запись
      </button>
    </form>
  );
}

/** Read-mode card grid: org data, completeness, members, contacts. */
export default function OrgReadView({ org, canEdit, onDataChanged, onAddMemberClick }) {
  const { hasRole } = useAuth();
  const [priceHistoryOpen, setPriceHistoryOpen] = useState(false);

  const hasRequisites =
    org.checkingAccount || org.bik || org.correspondentAccount || org.requisitesBank;

  async function handleDeletePriceEntry(entryId) {
    try {
      const res = await api(`/api/organizations/${org.id}/price-history/${entryId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        onDataChanged();
      } else {
        alert("Не удалось удалить запись");
      }
    } catch {
      alert("Ошибка сети");
    }
  }

  async function handleRemoveMember(userId) {
    if (!confirm("Удалить участника из организации?")) return;
    try {
      const res = await api(`/api/organizations/${org.id}/members/${userId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to remove member");
      }
      onDataChanged();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
      {/* Mobile-only: Contacts above main data so they're visible right away */}
      <div className="lg:hidden">
        <ContactsCard
          organizationId={org.id}
          contacts={org.contacts || []}
          canEdit={canEdit}
          onDataChanged={onDataChanged}
        />
      </div>

      {/* ── Left: all org data in one card ── */}
      <div className="lg:col-span-2 bg-surface rounded-2xl shadow-lg border border-line divide-y divide-line">
        {/* Основные сведения */}
        <div className="p-4 sm:p-5">
          <h3 className="text-[11px] font-semibold text-subtle uppercase tracking-widest mb-2 sm:mb-3">
            Основные сведения
          </h3>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-1 sm:gap-y-3">
            <Field label="ИНН" value={org.inn} />
            <Field label="ОГРН" value={org.ogrn} />
            {org.form !== "IP" && <Field label="КПП" value={org.kpp} />}
            <Field
              label="Участок"
              value={
                org.section
                  ? `№${org.section.number}${org.section.name ? ` ${org.section.name}` : ""}`
                  : null
              }
            />
            {org.clientGroup ? (
              <div>
                <dt className="text-[11px] font-medium text-subtle uppercase tracking-wider">
                  Группа клиента
                </dt>
                <dd className="mt-0.5 text-sm">
                  <Link
                    to={`/client-groups/${org.clientGroup.id}`}
                    className="text-primary hover:underline font-medium"
                  >
                    {org.clientGroup.name}
                  </Link>
                </dd>
              </div>
            ) : (
              <Field label="Группа клиента" value={null} />
            )}
            <Field
              label="Сотрудники"
              value={org.employeeCount != null ? org.employeeCount : null}
            />

            <Field label="Касса" value={org.hasCashRegister ? "Да" : "Нет"} />
            <Field
              label="Налогообложение"
              value={
                org.taxSystems?.length
                  ? org.taxSystems.map((k) => TAX_SYSTEM_LABELS[k] || k).join(", ")
                  : null
              }
            />
          </dl>
          {org.legalAddress && (
            <div className="mt-3">
              <Field label="Юр. адрес" value={org.legalAddress} />
            </div>
          )}
        </div>

        {/* Бухгалтерия */}
        <div className="p-4 sm:p-5">
          <h3 className="text-[11px] font-semibold text-subtle uppercase tracking-widest mb-2 sm:mb-3">
            Бухгалтерия
          </h3>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-1 sm:gap-y-3">
            <Field label="ЭЦП" value={DIGITAL_SIGNATURE_LABELS[org.digitalSignature] || null} />
            <Field label="Срок ЭЦП" value={formatDate(org.digitalSignatureExpiry)} />
            <Field
              label="Отчётность"
              value={REPORTING_CHANNEL_LABELS[org.reportingChannel] || null}
            />
            <Field label="Тип обслуживания" value={SERVICE_TYPE_LABELS[org.serviceType] || null} />
          </dl>
        </div>

        {/* Финансы */}
        <div className="p-4 sm:p-5">
          <h3 className="text-[11px] font-semibold text-subtle uppercase tracking-widest mb-2 sm:mb-3">
            Финансы
          </h3>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-1 sm:gap-y-3">
            <div className="min-w-0">
              <dt className="text-[11px] font-semibold text-subtle uppercase tracking-wide leading-none">
                Ежемес. платёж
              </dt>
              <dd className="text-sm text-body mt-1 leading-snug">
                {org.monthlyPayment ? (
                  formatCurrency(org.monthlyPayment)
                ) : (
                  <span className="text-subtle">—</span>
                )}
                {(org.priceHistory?.length > 0 || canEdit) && (
                  <button
                    onClick={() => setPriceHistoryOpen((v) => !v)}
                    className="ml-2 text-xs text-primary hover:underline"
                  >
                    история{org.priceHistory?.length ? ` · ${org.priceHistory.length}` : ""}
                  </button>
                )}
              </dd>
              {priceHistoryOpen && (
                <div className="mt-2 bg-canvas rounded-lg border border-line p-2 text-xs space-y-1">
                  {(org.priceHistory || []).length > 0 &&
                    [...org.priceHistory].reverse().map((h) => (
                      <div key={h.id} className="flex items-center justify-between gap-3">
                        <span className="text-subtle">
                          с {new Date(h.effectiveFrom).toLocaleDateString("ru-RU")}
                        </span>
                        <span className="font-medium text-body">{formatCurrency(h.price)}</span>
                        {canEdit && (
                          <button
                            onClick={() => handleDeletePriceEntry(h.id)}
                            className="text-subtle hover:text-red-500 dark:hover:text-red-400 transition-colors"
                            title="Удалить"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  {canEdit && <PriceHistoryAddForm orgId={org.id} onAdded={onDataChanged} />}
                </div>
              )}
            </div>
            <Field
              label="Куда поступает"
              value={PAYMENT_DESTINATION_LABELS[org.paymentDestination] || null}
            />
            <Field
              label="Частота оплаты"
              value={PAYMENT_FREQUENCY_LABELS[org.paymentFrequency] || null}
            />
            <Field
              label="Начало обслуживания"
              value={
                org.serviceStartDate
                  ? new Date(org.serviceStartDate).toLocaleDateString("ru-RU")
                  : null
              }
            />
            <Field label="Задолженность" value={formatCurrency(org.debtAmount)} />
          </dl>
        </div>

        {/* Реквизиты (only if any filled) */}
        {hasRequisites && (
          <div className="p-4 sm:p-5">
            <h3 className="text-[11px] font-semibold text-subtle uppercase tracking-widest mb-2 sm:mb-3">
              Реквизиты
            </h3>
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-1 sm:gap-y-3">
              <Field label="Р/С" value={org.checkingAccount} />
              <Field label="БИК" value={org.bik} />
              <Field label="К/С" value={org.correspondentAccount} />
              <Field label="Банк" value={org.requisitesBank} />
            </dl>
          </div>
        )}
      </div>

      {/* ── Right: Completeness + Members + Contacts ── */}
      <div className="flex flex-col gap-4">
        {/* Completeness indicator — hidden for clients */}
        {!hasRole("client") && <OrgCompletenessCard org={org} />}

        {/* Members */}
        <div className="bg-surface rounded-2xl shadow-lg border border-line p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-body">Участники</h3>
            {hasRole("admin") && (
              <button
                onClick={onAddMemberClick}
                className="inline-flex items-center gap-1 text-xs text-primary hover:text-[#5557E1] font-medium"
              >
                <UserPlus size={13} /> Добавить
              </button>
            )}
          </div>

          {org.members?.length === 0 ? (
            <p className="text-xs text-subtle">Нет участников</p>
          ) : (
            <div className="space-y-2.5">
              {org.members?.map((m) => (
                <div key={m.id} className="flex items-start justify-between group">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-heading leading-tight">
                      {m.user.lastName} {m.user.firstName}
                    </p>
                    <p className="text-xs text-subtle truncate mt-0.5">{m.user.email}</p>
                    <span className="inline-block mt-1 bg-primary/10 text-primary px-1.5 py-0.5 rounded-full text-[11px] font-medium">
                      {ROLE_LABELS[m.role] ?? m.role}
                    </span>
                  </div>
                  {hasRole("admin") && (
                    <button
                      onClick={() => handleRemoveMember(m.user.id)}
                      className="ml-2 mt-0.5 shrink-0 text-subtle hover:text-red-500 dark:hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Contacts — desktop only (mobile version is rendered above the grid) */}
        <div className="hidden lg:block">
          <ContactsCard
            organizationId={org.id}
            contacts={org.contacts || []}
            canEdit={canEdit}
            onDataChanged={onDataChanged}
          />
        </div>
      </div>
    </div>
  );
}
