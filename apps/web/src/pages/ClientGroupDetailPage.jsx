import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { ArrowLeft, Pencil, Save, X, Building2, Loader2, Users } from "lucide-react";
import OrgTransactionsCard from "../components/OrgTransactionsCard.jsx";
import { fmtMoney } from "../lib/format.js";

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
  active: "bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300",
  new: "bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300",
  archived: "bg-muted text-subtle",
  left: "bg-red-100 dark:bg-red-500/15 text-red-600 dark:text-red-300",
  closed: "bg-red-100 dark:bg-red-500/15 text-red-600 dark:text-red-300",
};

export default function ClientGroupDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission, hasRole } = useAuth();
  const canEdit = hasPermission("organization", "edit");

  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
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
      <div className="flex items-center justify-center py-16 text-subtle">
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
            className="p-2 rounded-lg text-subtle hover:text-body hover:bg-muted transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-heading flex items-center gap-2">
              <Users size={24} className="text-primary" />
              {group.name}
            </h1>
            <p className="text-sm text-subtle mt-0.5">
              {orgs.length} {orgs.length === 1 ? "организация" : "организаций"}
            </p>
          </div>
        </div>
        {canEdit && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-2 px-4 py-2 border-2 border-primary/20 text-primary rounded-lg text-sm font-medium hover:bg-primary/5"
          >
            <Pencil size={14} />
            Редактировать
          </button>
        )}
      </div>

      {/* Edit form */}
      {editing && (
        <div className="bg-surface rounded-2xl shadow-lg border border-line p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-subtle mb-1">Название группы</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-subtle mb-1">Описание</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
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
              className="px-4 py-2 text-sm text-body hover:bg-muted rounded-lg"
            >
              <X size={14} className="inline mr-1" />
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-surface rounded-xl border border-line p-4">
          <div className="flex items-center gap-2 text-sm text-subtle mb-1">
            <Building2 size={14} />
            Общий ежемес. платёж
          </div>
          <div className="text-lg font-bold text-heading">{fmtMoney(totalMonthly)}</div>
        </div>
        <div className="bg-surface rounded-xl border border-line p-4">
          <div className="flex items-center gap-2 text-sm text-subtle mb-1">
            <Building2 size={14} />
            Общая задолженность
          </div>
          <div
            className={`text-lg font-bold ${totalDebt > 0 ? "text-red-600 dark:text-red-300" : "text-heading"}`}
          >
            {totalDebt > 0 ? fmtMoney(totalDebt) : "—"}
          </div>
        </div>
      </div>

      {/* Description */}
      {group.description && !editing && (
        <div className="bg-surface rounded-xl border border-line p-4">
          <p className="text-sm text-body">{group.description}</p>
        </div>
      )}

      {/* Organizations table */}
      <div className="bg-surface rounded-2xl shadow-lg border border-line overflow-hidden">
        <div className="px-6 py-4 border-b border-line">
          <h2 className="text-base font-bold text-heading">Организации в группе</h2>
        </div>
        {orgs.length === 0 ? (
          <div className="text-sm text-subtle text-center py-8">В этой группе нет организаций</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas/50">
                  <th className="text-left px-4 py-3 font-medium text-subtle">Организация</th>
                  <th className="text-left px-4 py-3 font-medium text-subtle">ИНН</th>
                  <th className="text-left px-4 py-3 font-medium text-subtle">Статус</th>
                  <th className="text-right px-4 py-3 font-medium text-subtle">Платёж</th>
                  <th className="text-left px-4 py-3 font-medium text-subtle">Куда</th>
                  <th className="text-left px-4 py-3 font-medium text-subtle">Частота</th>
                  <th className="text-left px-4 py-3 font-medium text-subtle">Начало</th>
                  <th className="text-right px-4 py-3 font-medium text-subtle">Долг</th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((o) => (
                  <tr key={o.id} className="border-b border-line hover:bg-canvas/50">
                    <td className="px-4 py-3">
                      <Link
                        to={`/organizations/${o.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {o.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-subtle">{o.inn || "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[o.status] || "bg-muted text-subtle"}`}
                      >
                        {o.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {fmtMoney(o.monthlyPayment)}
                    </td>
                    <td className="px-4 py-3 text-subtle">
                      {PAYMENT_DEST_LABELS[o.paymentDestination] || "—"}
                    </td>
                    <td className="px-4 py-3 text-subtle">
                      {FREQ_LABELS[o.paymentFrequency] || "—"}
                    </td>
                    <td className="px-4 py-3 text-subtle">
                      {o.serviceStartDate
                        ? new Date(o.serviceStartDate).toLocaleDateString("ru-RU")
                        : "—"}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-medium ${Number(o.debtAmount) > 0 ? "text-red-600 dark:text-red-300" : "text-subtle"}`}
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

      {/* Transactions for the whole group */}
      {(hasRole("admin") || hasRole("supervisor")) && (
        <OrgTransactionsCard clientGroupId={id} showOrgName />
      )}
    </div>
  );
}
