import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { ArrowLeft, Pencil, Save, X, Building2, Loader2, Users, CreditCard } from "lucide-react";

const STRATEGY_LABELS = {
  PER_ORG: "Каждая организация платит отдельно",
  CONSOLIDATED: "Одна организация платит за всех",
};

const PAYMENT_DEST_LABELS = {
  BANK_TOCHKA: "Банк (Точка)",
  CARD: "Карта",
  CASH: "Наличные",
  UNKNOWN: "Неизвестно",
};

const FREQ_LABELS = {
  MONTHLY: "Ежемес.",
  QUARTERLY: "Ежекварт.",
  SEMI_ANNUAL: "Полугод.",
};

const STATUS_COLORS = {
  active: "bg-green-100 text-green-700",
  new: "bg-blue-100 text-blue-700",
  archived: "bg-slate-100 text-slate-500",
  left: "bg-red-100 text-red-600",
  closed: "bg-red-100 text-red-600",
};

function fmtMoney(val) {
  if (val == null) return "—";
  return Number(val).toLocaleString("ru-RU") + " ₽";
}

export default function ClientGroupDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("organization", "edit");

  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    paymentStrategy: "PER_ORG",
    payerOrganizationId: "",
  });
  const [saving, setSaving] = useState(false);

  const fetchGroup = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api(`/api/client-groups/${id}`);
      if (!res.ok) {
        navigate("/organizations");
        return;
      }
      const data = await res.json();
      setGroup(data);
      setForm({
        name: data.name || "",
        description: data.description || "",
        paymentStrategy: data.paymentStrategy || "PER_ORG",
        payerOrganizationId: data.payerOrganizationId || "",
      });
    } catch {
      navigate("/organizations");
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    fetchGroup();
  }, [fetchGroup]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await api(`/api/client-groups/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          description: form.description || null,
          paymentStrategy: form.paymentStrategy,
          payerOrganizationId: form.payerOrganizationId || null,
        }),
      });
      if (res.ok) {
        setEditing(false);
        fetchGroup();
      }
    } catch {
      /* */
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 size={24} className="animate-spin" />
      </div>
    );
  }

  if (!group) return null;

  const orgs = group.organizations || [];
  const totalMonthly = orgs.reduce((s, o) => s + Number(o.monthlyPayment || 0), 0);
  const totalDebt = orgs.reduce((s, o) => s + Number(o.debtAmount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Users size={24} className="text-[#6567F1]" />
              {group.name}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {orgs.length} {orgs.length === 1 ? "организация" : "организаций"}
            </p>
          </div>
        </div>
        {canEdit && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-2 px-4 py-2 border-2 border-[#6567F1]/20 text-[#6567F1] rounded-lg text-sm font-medium hover:bg-[#6567F1]/5"
          >
            <Pencil size={14} />
            Редактировать
          </button>
        )}
      </div>

      {/* Edit form */}
      {editing && (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Название группы</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Описание</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Стратегия оплаты
            </label>
            <select
              value={form.paymentStrategy}
              onChange={(e) => setForm({ ...form, paymentStrategy: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
            >
              <option value="PER_ORG">Каждая организация платит отдельно</option>
              <option value="CONSOLIDATED">Одна организация платит за всех</option>
            </select>
          </div>
          {form.paymentStrategy === "CONSOLIDATED" && (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Организация-плательщик
              </label>
              <select
                value={form.payerOrganizationId}
                onChange={(e) => setForm({ ...form, payerOrganizationId: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
              >
                <option value="">Любая из группы</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !form.name}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] text-white rounded-lg text-sm font-medium shadow-lg shadow-[#6567F1]/30 hover:from-[#5557E1] hover:to-[#4547D1] disabled:opacity-50"
            >
              <Save size={14} />
              Сохранить
            </button>
            <button
              onClick={() => setEditing(false)}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              <X size={14} className="inline mr-1" />
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
            <CreditCard size={14} />
            Стратегия оплаты
          </div>
          <div className="text-sm font-medium text-slate-900">
            {STRATEGY_LABELS[group.paymentStrategy]}
          </div>
          {group.paymentStrategy === "CONSOLIDATED" && group.payerOrganization && (
            <div className="text-xs text-[#6567F1] mt-1">
              Плательщик: {group.payerOrganization.name}
            </div>
          )}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
            <Building2 size={14} />
            Общий ежемес. платёж
          </div>
          <div className="text-lg font-bold text-slate-900">{fmtMoney(totalMonthly)}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
            <Building2 size={14} />
            Общая задолженность
          </div>
          <div className={`text-lg font-bold ${totalDebt > 0 ? "text-red-600" : "text-slate-900"}`}>
            {totalDebt > 0 ? fmtMoney(totalDebt) : "—"}
          </div>
        </div>
      </div>

      {/* Description */}
      {group.description && !editing && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-sm text-slate-600">{group.description}</p>
        </div>
      )}

      {/* Organizations table */}
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">Организации в группе</h2>
        </div>
        {orgs.length === 0 ? (
          <div className="text-sm text-slate-400 text-center py-8">
            В этой группе нет организаций
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Организация</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">ИНН</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Статус</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-500">Платёж</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Куда</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Частота</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">Начало</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-500">Долг</th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((o) => (
                  <tr key={o.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <Link
                        to={`/organizations/${o.id}`}
                        className="font-medium text-[#6567F1] hover:underline"
                      >
                        {o.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{o.inn || "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[o.status] || "bg-slate-100 text-slate-500"}`}
                      >
                        {o.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {fmtMoney(o.monthlyPayment)}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {PAYMENT_DEST_LABELS[o.paymentDestination] || "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {FREQ_LABELS[o.paymentFrequency] || "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {o.serviceStartDate
                        ? new Date(o.serviceStartDate).toLocaleDateString("ru-RU")
                        : "—"}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-medium ${Number(o.debtAmount) > 0 ? "text-red-600" : "text-slate-400"}`}
                    >
                      {Number(o.debtAmount) > 0 ? fmtMoney(o.debtAmount) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
