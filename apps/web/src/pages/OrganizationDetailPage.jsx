import { useState, useEffect, useCallback } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router";
import { api } from "../lib/api.js";
import OrgFinanceSection from "../components/OrgFinanceSection.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import {
  ArrowLeft,
  Save,
  Pencil,
  X,
  UserPlus,
  Trash2,
  Link2,
  Copy,
  Check,
  CalendarDays,
  MessageSquare,
  ClipboardList,
  Loader2,
} from "lucide-react";
import TaskCommentsModal from "../components/TaskCommentsModal.jsx";
import BankAccountsCard from "../components/BankAccountsCard.jsx";
import SystemAccessesCard from "../components/SystemAccessesCard.jsx";
import ContactsCard from "../components/ContactsCard.jsx";
import DocumentsCard from "../components/DocumentsCard.jsx";
import OrgCompletenessCard from "../components/OrgCompletenessCard.jsx";
import OrgTransactionsCard from "../components/OrgTransactionsCard.jsx";

const TAX_SYSTEM_LABELS = {
  USN6: "УСН 6%",
  USN15: "УСН 15%",
  AUSN8: "АУСН 8%",
  AUSN20: "АУСН 20%",
  PSN: "ПСН",
  OSNO: "ОСНО",
  USN_NDS5: "НДС 5%",
  USN_NDS7: "НДС 7%",
  USN_NDS22: "НДС 22%",
};
const DIGITAL_SIGNATURE_LABELS = { NONE: "Нет", CLIENT: "У клиента", US: "У нас", MCHD: "МЧД" };
const REPORTING_CHANNEL_LABELS = { KONTUR: "Контур", SBIS: "СБИС", ASTRAL: "Астрал", ONE_C: "1С" };
const SERVICE_TYPE_LABELS = {
  ZERO: "Нулёвка",
  MINIMAL: "Минимальное",
  FULL: "Полное",
  HR: "Кадры",
  REPORTING: "Отчётность",
  HR_REPORTING: "Кадры+Отчётность",
  PARTIAL: "Частичное",
};
const STATUS_LABELS = {
  active: "Активный",
  new: "Новый",
  liquidating: "В процессе ликвидации",
  left: "Ушёл",
  closed: "Закрылся",
  not_paying: "Не платит",
  ceased: "Прекратили сотрудничество",
  own: "Наша организация",
  blacklisted: "Чёрный список",
};
const ROLE_LABELS = {
  admin: "Администратор",
  supervisor: "Руководитель",
  manager: "Менеджер",
  accountant: "Бухгалтер",
  client: "Клиент",
};
const ORG_FORM_LABELS = { OOO: "ООО", IP: "ИП", NKO: "НКО", AO: "АО", PAO: "ПАО" };
const ARCHIVED_STATUSES = ["left", "closed", "ceased"];
const STATUS_BADGE_COLORS = {
  active: "bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300",
  new: "bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300",
  liquidating: "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300",
  left: "bg-muted text-subtle",
  closed: "bg-muted text-subtle",
  not_paying: "bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300",
  ceased: "bg-muted text-subtle",
  own: "bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300",
  blacklisted: "bg-slate-900 text-white",
};

const INPUT_CLS =
  "w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary";
const SELECT_CLS = `${INPUT_CLS} bg-surface`;
const LABEL_CLS = "block text-sm font-medium text-body mb-1";

function toIntOrNull(v) {
  const n = parseInt(v, 10);
  return isNaN(n) || n < 0 ? null : n;
}
function toDecimalOrNull(v) {
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  return isNaN(n) ? null : s;
}
function formatCurrency(val) {
  if (val == null) return "—";
  return Number(val).toLocaleString("ru-RU") + " ₽";
}
function formatDate(val) {
  if (!val) return "—";
  return new Date(val).toLocaleDateString("ru-RU");
}

/** Compact key-value field for read mode. */
function Field({ label, value }) {
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

const INITIAL_FORM = {
  name: "",
  inn: "",
  ogrn: "",
  kpp: "",
  form: "",
  status: "active",
  sectionId: "",
  clientGroupId: "",
  taxSystems: [],
  employeeCount: "",

  hasCashRegister: false,
  legalAddress: "",
  importantComment: "",
  digitalSignature: "",
  digitalSignatureExpiry: "",
  reportingChannel: "",
  serviceType: "",
  monthlyPayment: "",
  paymentDestination: "",
  paymentFrequency: "MONTHLY",
  serviceStartDate: "",
  debtAmount: "",
  checkingAccount: "",
  bik: "",
  correspondentAccount: "",
  requisitesBank: "",
};

export default function OrganizationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission, hasRole } = useAuth();
  const isAdmin = hasRole("admin") || hasRole("supervisor");

  const [organization, setOrganization] = useState(null);
  const [sections, setSections] = useState([]);
  const [clientGroups, setClientGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const [showAddMember, setShowAddMember] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [addingMember, setAddingMember] = useState(false);
  const [memberError, setMemberError] = useState("");

  const [showInvite, setShowInvite] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [inviteExpiry, setInviteExpiry] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [copied, setCopied] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteEmailSent, setInviteEmailSent] = useState(false);
  const [inviteEmailWarning, setInviteEmailWarning] = useState("");

  // Tasks for this org (shown in OrgOpenTasksBanner)
  const [orgTasks, setOrgTasks] = useState([]);
  const [commentTask, setCommentTask] = useState(null);
  const [priceHistoryOpen, setPriceHistoryOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const canEdit = hasPermission("organization", "edit") && organization?._editable !== false;

  useEffect(() => {
    if (hasPermission("section", "view")) {
      api("/api/sections?limit=100")
        .then((res) => (res.ok ? res.json() : { sections: [] }))
        .then((data) => setSections(data.sections || []))
        .catch(() => {});
    }
  }, [hasPermission]);

  useEffect(() => {
    if (hasPermission("organization", "view")) {
      api("/api/client-groups")
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => setClientGroups(Array.isArray(data) ? data : []))
        .catch(() => {});
    }
  }, [hasPermission]);

  function populateForm(data) {
    setForm({
      name: data.name || "",
      inn: data.inn || "",
      ogrn: data.ogrn || "",
      kpp: data.kpp || "",
      form: data.form || "",
      status: data.status || "active",
      sectionId: data.sectionId || "",
      clientGroupId: data.clientGroupId || "",
      taxSystems: data.taxSystems || [],
      employeeCount: data.employeeCount != null ? String(data.employeeCount) : "",

      hasCashRegister: data.hasCashRegister || false,
      legalAddress: data.legalAddress || "",
      importantComment: data.importantComment || "",
      digitalSignature: data.digitalSignature || "",
      digitalSignatureExpiry: data.digitalSignatureExpiry
        ? data.digitalSignatureExpiry.slice(0, 10)
        : "",
      reportingChannel: data.reportingChannel || "",
      serviceType: data.serviceType || "",
      monthlyPayment: data.monthlyPayment != null ? String(data.monthlyPayment) : "",
      paymentDestination: data.paymentDestination || "",
      paymentFrequency: data.paymentFrequency || "MONTHLY",
      serviceStartDate: data.serviceStartDate ? data.serviceStartDate.slice(0, 10) : "",
      debtAmount: data.debtAmount != null ? String(data.debtAmount) : "",
      checkingAccount: data.checkingAccount || "",
      bik: data.bik || "",
      correspondentAccount: data.correspondentAccount || "",
      requisitesBank: data.requisitesBank || "",
    });
  }

  const fetchOrganization = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);
      setError("");
      try {
        const res = await api(`/api/organizations/${id}`);
        if (!res.ok) {
          if (res.status === 404) throw new Error("Организация не найдена");
          throw new Error("Failed to load organization");
        }
        const data = await res.json();
        setOrganization(data);
        populateForm(data);
      } catch (err) {
        setError(err.message);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    fetchOrganization();
  }, [fetchOrganization]);

  const [searchParams, setSearchParams] = useSearchParams();
  const [sberMsg, setSberMsg] = useState(null); // { ok, text } | null

  useEffect(() => {
    const providers = { sber: "Сбер", alfa: "Альфа", tochka: "Точка" };
    for (const [key, label] of Object.entries(providers)) {
      const status = searchParams.get(key);
      if (!status) continue;
      const reason = searchParams.get("reason");
      if (status === "connected") {
        setSberMsg({ ok: true, text: `${label} подключён.` });
      } else {
        setSberMsg({
          ok: false,
          text: reason
            ? `Не удалось подключить ${label}: ${reason}`
            : `Не удалось подключить ${label}.`,
        });
      }
      fetchOrganization();
      searchParams.delete(key);
      searchParams.delete("reason");
      setSearchParams(searchParams, { replace: true });
      break;
    }
  }, []);

  const fetchOrgTasks = useCallback(async () => {
    if (!hasPermission("task", "view")) return;
    try {
      const res = await api(`/api/tasks?organizationId=${id}`);
      if (res.ok) setOrgTasks(await res.json());
    } catch {
      // silent
    }
  }, [id, hasPermission]);

  useEffect(() => {
    fetchOrgTasks();
  }, [fetchOrgTasks]);

  useEffect(() => {
    if (!showAddMember) return;
    api("/api/users")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        const existingIds = new Set(organization?.members?.map((m) => m.user.id) || []);
        setAllUsers(data.filter((u) => !existingIds.has(u.id)));
      })
      .catch(() => {});
  }, [showAddMember, organization]);

  function toggleTaxSystem(key) {
    setField(
      "taxSystems",
      form.taxSystems.includes(key)
        ? form.taxSystems.filter((k) => k !== key)
        : [...form.taxSystems, key],
    );
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setSaveMsg("");
    try {
      const res = await api(`/api/organizations/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: form.name,
          inn: form.inn || null,
          ogrn: form.ogrn || null,
          kpp: form.kpp || null,
          form: form.form || null,
          status: form.status,
          sectionId: form.sectionId || null,
          clientGroupId: form.clientGroupId || null,
          taxSystems: form.taxSystems,
          employeeCount: toIntOrNull(form.employeeCount),

          hasCashRegister: form.hasCashRegister,
          legalAddress: form.legalAddress || null,
          importantComment: form.importantComment || null,
          digitalSignature: form.digitalSignature || null,
          digitalSignatureExpiry: form.digitalSignatureExpiry || null,
          reportingChannel: form.reportingChannel || null,
          serviceType: form.serviceType || null,
          monthlyPayment: toDecimalOrNull(form.monthlyPayment),
          paymentDestination: form.paymentDestination || null,
          paymentFrequency: form.paymentFrequency || "MONTHLY",
          serviceStartDate: form.serviceStartDate || null,
          debtAmount: toDecimalOrNull(form.debtAmount),
          checkingAccount: form.checkingAccount || null,
          bik: form.bik || null,
          correspondentAccount: form.correspondentAccount || null,
          requisitesBank: form.requisitesBank || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update");
      }
      await fetchOrganization();
      setEditing(false);
      setSaveMsg("Сохранено");
      setTimeout(() => setSaveMsg(""), 2000);
    } catch (err) {
      setSaveMsg(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddMember(e) {
    e.preventDefault();
    if (!selectedUser) {
      setMemberError("Выберите пользователя из списка");
      return;
    }
    setAddingMember(true);
    setMemberError("");
    try {
      const res = await api(`/api/organizations/${id}/members`, {
        method: "POST",
        body: JSON.stringify({ email: selectedUser.email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to add member");
      }
      setSelectedUser(null);
      setAllUsers([]);
      setShowAddMember(false);
      fetchOrganization();
    } catch (err) {
      setMemberError(err.message);
    } finally {
      setAddingMember(false);
    }
  }

  async function handleRemoveMember(userId) {
    if (!confirm("Удалить участника из организации?")) return;
    try {
      const res = await api(`/api/organizations/${id}/members/${userId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to remove member");
      }
      fetchOrganization();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleGenerateInvite() {
    setInviteLoading(true);
    setInviteError("");
    setInviteLink("");
    setInviteEmailSent(false);
    setInviteEmailWarning("");
    setCopied(false);
    try {
      const trimmedEmail = inviteEmail.trim();
      const body = { organizationId: id };
      if (trimmedEmail) body.email = trimmedEmail;
      const res = await api("/api/auth/invite", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Ошибка генерации приглашения");
      }
      const data = await res.json();
      setInviteLink(`${window.location.origin}/invite/${data.token}`);
      setInviteExpiry(new Date(data.expiresAt).toLocaleString("ru-RU"));
      setInviteEmailSent(!!data.emailSent);
      if (data.emailError) setInviteEmailWarning(data.emailError);
    } catch (err) {
      setInviteError(err.message);
    } finally {
      setInviteLoading(false);
    }
  }

  async function handleCopyInvite() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }

  async function handleDeletePriceEntry(entryId) {
    try {
      const res = await api(`/api/organizations/${id}/price-history/${entryId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchOrganization();
      } else {
        alert("Не удалось удалить запись");
      }
    } catch {
      alert("Ошибка сети");
    }
  }

  function openAddMember() {
    setShowAddMember(true);
    setSelectedUser(null);
    setAllUsers([]);
    setMemberError("");
  }

  if (loading)
    return (
      <div className="flex items-center justify-center py-24 text-subtle">
        <Loader2 size={28} className="animate-spin" />
      </div>
    );
  if (error)
    return (
      <div className="text-red-600 dark:text-red-300 text-sm">
        {error}{" "}
        <Link to="/organizations" className="text-primary hover:underline">
          Назад
        </Link>
      </div>
    );
  if (!organization) return null;

  const org = organization;
  const hasRequisites =
    org.checkingAccount || org.bik || org.correspondentAccount || org.requisitesBank;

  return (
    <>
      <Link
        to="/organizations"
        className="inline-flex items-center gap-1 text-sm text-subtle hover:text-primary mb-3"
      >
        <ArrowLeft size={15} /> Все организации
      </Link>

      {sberMsg && (
        <div
          className={`mb-4 p-3 rounded-xl text-sm border flex items-center justify-between ${
            sberMsg.ok
              ? "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30"
              : "bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/30"
          }`}
        >
          <span>{sberMsg.text}</span>
          <button onClick={() => setSberMsg(null)} className="text-subtle hover:text-body">
            <X size={16} />
          </button>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
        <div className="flex items-start gap-2 flex-wrap min-w-0">
          <h1 className="text-lg sm:text-xl font-bold text-heading leading-tight break-words">
            {org.name}
          </h1>
          {org.form && (
            <span className="shrink-0 px-2 py-0.5 bg-muted text-body rounded text-xs font-semibold mt-0.5">
              {ORG_FORM_LABELS[org.form] || org.form}
            </span>
          )}
          <span
            className={`shrink-0 px-2.5 py-0.5 rounded-full text-xs font-medium mt-0.5 ${STATUS_BADGE_COLORS[org.status] || "bg-muted text-subtle"}`}
          >
            {STATUS_LABELS[org.status] || org.status}
          </span>
          {saveMsg && (
            <span
              className={`text-sm font-medium mt-0.5 ${saveMsg === "Сохранено" ? "text-green-600 dark:text-green-300" : "text-red-600 dark:text-red-300"}`}
            >
              {saveMsg}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 -mx-1 sm:mx-0 overflow-x-auto sm:overflow-visible">
          {canEdit && !editing && (
            <button
              onClick={() => {
                setShowInvite(true);
                setInviteLink("");
                setInviteError("");
                setCopied(false);
              }}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 border border-line text-body hover:bg-canvas rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
              aria-label="Пригласить"
            >
              <Link2 size={14} />
              <span className="hidden sm:inline">Пригласить</span>
            </button>
          )}
          {canEdit && !editing && (
            <button
              onClick={() => {
                populateForm(org);
                setEditing(true);
                setSaveMsg("");
              }}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg text-sm font-medium shadow-md shadow-[#6567F1]/20 transition-all whitespace-nowrap"
              aria-label="Изменить"
            >
              <Pencil size={14} />
              <span className="hidden sm:inline">Изменить</span>
              <span className="sm:hidden">Изменить</span>
            </button>
          )}
          {isAdmin && !editing && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/15 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
              aria-label="Удалить"
            >
              <Trash2 size={14} />
              <span className="hidden sm:inline">Удалить</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Important comment ── */}
      {org.importantComment && (
        <div className="mb-3 px-4 py-2.5 bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 rounded-xl text-sm text-amber-900 dark:text-amber-300">
          <span className="font-semibold">⚠ Важно:</span> {org.importantComment}
        </div>
      )}

      {/* ── Open tasks banner ── */}
      {!editing && <OrgOpenTasksBanner tasks={orgTasks} onComment={setCommentTask} />}

      {editing ? (
        /* ══════════════════ EDIT MODE ══════════════════ */
        <form onSubmit={handleSave} className="space-y-4">
          {/* Основная информация */}
          <div className="bg-surface rounded-2xl shadow-lg border border-line p-4 sm:p-6">
            <h2 className="text-base font-bold text-heading mb-4">Основная информация</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className={LABEL_CLS}>Название *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                  className={INPUT_CLS}
                />
              </div>
              <div>
                <label className={LABEL_CLS}>ИНН</label>
                <input
                  type="text"
                  value={form.inn}
                  onChange={(e) => setField("inn", e.target.value)}
                  className={INPUT_CLS}
                />
              </div>
              <div>
                <label className={LABEL_CLS}>ОГРН</label>
                <input
                  type="text"
                  value={form.ogrn}
                  onChange={(e) => setField("ogrn", e.target.value)}
                  className={INPUT_CLS}
                  placeholder="13 или 15 цифр"
                />
              </div>
              {!ARCHIVED_STATUSES.includes(form.status) && form.form !== "IP" && (
                <div>
                  <label className={LABEL_CLS}>КПП</label>
                  <input
                    type="text"
                    value={form.kpp}
                    onChange={(e) => setField("kpp", e.target.value)}
                    className={INPUT_CLS}
                  />
                </div>
              )}
              <div>
                <label className={LABEL_CLS}>Форма собственности</label>
                <select
                  value={form.form}
                  onChange={(e) => setField("form", e.target.value)}
                  className={SELECT_CLS}
                >
                  <option value="">Не указано</option>
                  <option value="OOO">ООО</option>
                  <option value="IP">ИП</option>
                  <option value="NKO">НКО</option>
                  <option value="AO">АО</option>
                  <option value="PAO">ПАО</option>
                </select>
              </div>
              <div>
                <label className={LABEL_CLS}>Статус</label>
                <select
                  value={form.status}
                  onChange={(e) => setField("status", e.target.value)}
                  className={SELECT_CLS}
                >
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              {!ARCHIVED_STATUSES.includes(form.status) && sections.length > 0 && (
                <div>
                  <label className={LABEL_CLS}>Участок</label>
                  <select
                    value={form.sectionId}
                    onChange={(e) => setField("sectionId", e.target.value)}
                    className={SELECT_CLS}
                  >
                    <option value="">Без участка</option>
                    {sections.map((s) => (
                      <option key={s.id} value={s.id}>
                        №{s.number} {s.name || ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {!ARCHIVED_STATUSES.includes(form.status) && clientGroups.length > 0 && (
                <div>
                  <label className={LABEL_CLS}>Группа клиента</label>
                  <select
                    value={form.clientGroupId}
                    onChange={(e) => setField("clientGroupId", e.target.value)}
                    className={SELECT_CLS}
                  >
                    <option value="">Без группы</option>
                    {clientGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {!ARCHIVED_STATUSES.includes(form.status) && (
                <div>
                  <label className={LABEL_CLS}>Кол-во сотрудников</label>
                  <input
                    type="number"
                    min="0"
                    value={form.employeeCount}
                    onChange={(e) => setField("employeeCount", e.target.value)}
                    className={INPUT_CLS}
                  />
                </div>
              )}
              {!ARCHIVED_STATUSES.includes(form.status) && (
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm text-body cursor-pointer pb-2">
                    <input
                      type="checkbox"
                      checked={form.hasCashRegister}
                      onChange={(e) => setField("hasCashRegister", e.target.checked)}
                      className="w-4 h-4 rounded border-line text-primary focus:ring-primary/30"
                    />
                    Касса
                  </label>
                </div>
              )}
            </div>

            {!ARCHIVED_STATUSES.includes(form.status) && (
              <div className="mt-4">
                <label className={LABEL_CLS}>Система налогообложения</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {Object.entries(TAX_SYSTEM_LABELS).map(([key, label]) => (
                    <label
                      key={key}
                      className="flex items-center gap-1.5 text-sm text-body cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={form.taxSystems.includes(key)}
                        onChange={() => toggleTaxSystem(key)}
                        className="w-4 h-4 rounded border-line text-primary focus:ring-primary/30"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {!ARCHIVED_STATUSES.includes(form.status) && (
              <div className="mt-4">
                <label className={LABEL_CLS}>Юридический адрес</label>
                <textarea
                  value={form.legalAddress}
                  onChange={(e) => setField("legalAddress", e.target.value)}
                  rows={2}
                  className={INPUT_CLS}
                />
              </div>
            )}

            <div className="mt-4">
              <label className={LABEL_CLS}>Важный комментарий</label>
              <textarea
                value={form.importantComment}
                onChange={(e) => setField("importantComment", e.target.value)}
                rows={2}
                placeholder="Отображается в карточке организации"
                className={INPUT_CLS}
              />
            </div>
          </div>

          {/* Реквизиты + Бухгалтерия + Финансы — скрыты для архивных статусов */}
          {!ARCHIVED_STATUSES.includes(form.status) && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="bg-surface rounded-2xl shadow-lg border border-line p-4 sm:p-6">
                <h2 className="text-base font-bold text-heading mb-4">Реквизиты</h2>
                <div className="space-y-3">
                  <div>
                    <label className={LABEL_CLS}>Р/С</label>
                    <input
                      type="text"
                      value={form.checkingAccount}
                      onChange={(e) => setField("checkingAccount", e.target.value)}
                      className={INPUT_CLS}
                      placeholder="40702810..."
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLS}>БИК</label>
                    <input
                      type="text"
                      value={form.bik}
                      onChange={(e) => setField("bik", e.target.value)}
                      className={INPUT_CLS}
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLS}>К/С</label>
                    <input
                      type="text"
                      value={form.correspondentAccount}
                      onChange={(e) => setField("correspondentAccount", e.target.value)}
                      className={INPUT_CLS}
                      placeholder="30101810..."
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLS}>Банк</label>
                    <input
                      type="text"
                      value={form.requisitesBank}
                      onChange={(e) => setField("requisitesBank", e.target.value)}
                      className={INPUT_CLS}
                    />
                  </div>
                </div>
              </div>

              <div className="bg-surface rounded-2xl shadow-lg border border-line p-4 sm:p-6">
                <h2 className="text-base font-bold text-heading mb-4">Бухгалтерия</h2>
                <div className="space-y-3">
                  <div>
                    <label className={LABEL_CLS}>ЭЦП</label>
                    <select
                      value={form.digitalSignature}
                      onChange={(e) => setField("digitalSignature", e.target.value)}
                      className={SELECT_CLS}
                    >
                      <option value="">Не выбрано</option>
                      {Object.entries(DIGITAL_SIGNATURE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={LABEL_CLS}>Срок ЭЦП</label>
                    <input
                      type="date"
                      value={form.digitalSignatureExpiry}
                      onChange={(e) => setField("digitalSignatureExpiry", e.target.value)}
                      className={INPUT_CLS}
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLS}>Канал отчётности</label>
                    <select
                      value={form.reportingChannel}
                      onChange={(e) => setField("reportingChannel", e.target.value)}
                      className={SELECT_CLS}
                    >
                      <option value="">Не выбрано</option>
                      {Object.entries(REPORTING_CHANNEL_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={LABEL_CLS}>Тип обслуживания</label>
                    <select
                      value={form.serviceType}
                      onChange={(e) => setField("serviceType", e.target.value)}
                      className={SELECT_CLS}
                    >
                      <option value="">Не выбрано</option>
                      {Object.entries(SERVICE_TYPE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="bg-surface rounded-2xl shadow-lg border border-line p-4 sm:p-6">
                <h2 className="text-base font-bold text-heading mb-4">Финансы</h2>
                <div className="space-y-3">
                  <div>
                    <label className={LABEL_CLS}>Ежемесячный платёж</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.monthlyPayment}
                      onChange={(e) => setField("monthlyPayment", e.target.value)}
                      className={INPUT_CLS}
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLS}>Куда поступает платёж</label>
                    <select
                      value={form.paymentDestination}
                      onChange={(e) => setField("paymentDestination", e.target.value)}
                      className={INPUT_CLS}
                    >
                      <option value="">—</option>
                      <option value="BANK_TOCHKA">Банк (Точка)</option>
                      <option value="CARD">Карта</option>
                      <option value="CASH">Наличные</option>
                      <option value="UNKNOWN">Неизвестно</option>
                    </select>
                  </div>
                  <div>
                    <label className={LABEL_CLS}>Частота оплаты</label>
                    <select
                      value={form.paymentFrequency}
                      onChange={(e) => setField("paymentFrequency", e.target.value)}
                      className={INPUT_CLS}
                    >
                      <option value="MONTHLY">Ежемесячно</option>
                      <option value="QUARTERLY">Ежеквартально</option>
                      <option value="SEMI_ANNUAL">Раз в полгода</option>
                    </select>
                  </div>
                  <div>
                    <label className={LABEL_CLS}>Начало обслуживания</label>
                    <input
                      type="date"
                      value={form.serviceStartDate}
                      onChange={(e) => setField("serviceStartDate", e.target.value)}
                      className={INPUT_CLS}
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLS}>Сумма задолженности</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.debtAmount}
                      onChange={(e) => setField("debtAmount", e.target.value)}
                      className={INPUT_CLS}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 sticky bottom-2 sm:static z-30 bg-canvas/90 sm:bg-transparent backdrop-blur sm:backdrop-blur-none -mx-3 sm:mx-0 px-3 sm:px-0 py-2 sm:py-0 rounded-xl">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg shadow-lg shadow-[#6567F1]/30 text-sm font-medium transition-all disabled:opacity-50"
            >
              <Save size={16} />
              {saving ? "Сохранение..." : "Сохранить"}
            </button>
            <button
              type="button"
              onClick={() => {
                populateForm(org);
                setEditing(false);
              }}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 border-2 border-line text-body hover:bg-canvas rounded-lg text-sm font-medium transition-colors"
            >
              <X size={16} />
              Отмена
            </button>
          </div>
        </form>
      ) : /* ══════════════════ READ MODE ══════════════════ */
      ARCHIVED_STATUSES.includes(org.status) ? (
        <div className="mb-4 bg-surface rounded-2xl shadow-lg border border-line p-4 sm:p-6">
          <div className="mb-4 px-4 py-2.5 bg-muted border border-line rounded-xl text-sm text-body font-medium">
            Организация в архиве — {STATUS_LABELS[org.status]}
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-1 sm:gap-y-3">
            <Field label="ИНН" value={org.inn} />
            <Field label="ОГРН" value={org.ogrn} />
            <Field
              label="Форма собственности"
              value={ORG_FORM_LABELS[org.form] || org.form || null}
            />
          </dl>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          {/* Mobile-only: Contacts above main data so they're visible right away */}
          <div className="lg:hidden">
            <ContactsCard
              organizationId={id}
              contacts={org.contacts || []}
              canEdit={canEdit}
              onDataChanged={fetchOrganization}
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
                <Field
                  label="Тип обслуживания"
                  value={SERVICE_TYPE_LABELS[org.serviceType] || null}
                />
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
                      {canEdit && <PriceHistoryAddForm orgId={id} onAdded={fetchOrganization} />}
                    </div>
                  )}
                </div>
                <Field
                  label="Куда поступает"
                  value={
                    {
                      BANK_TOCHKA: "Банк (Точка)",
                      CARD: "Карта",
                      CASH: "Наличные",
                      UNKNOWN: "Неизвестно",
                    }[org.paymentDestination] || null
                  }
                />
                <Field
                  label="Частота оплаты"
                  value={
                    {
                      MONTHLY: "Ежемесячно",
                      QUARTERLY: "Ежеквартально",
                      SEMI_ANNUAL: "Раз в полгода",
                    }[org.paymentFrequency] || null
                  }
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
                    onClick={openAddMember}
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
                organizationId={id}
                contacts={org.contacts || []}
                canEdit={canEdit}
                onDataChanged={fetchOrganization}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Always visible: Bank accounts + Documents + Tasks (full width) ── */}
      <div className="space-y-4">
        <div className="bg-surface rounded-2xl shadow-lg border border-line p-4 sm:p-6">
          <h2 className="text-base font-bold text-heading mb-4">Финансы</h2>
          <OrgFinanceSection
            organizationId={id}
            financeVisibleToClient={org.financeVisibleToClient}
            onToggle={async (val) => {
              const res = await api(`/api/organizations/${id}`, {
                method: "PUT",
                body: JSON.stringify({ financeVisibleToClient: val }),
              });
              if (res.ok) setOrganization((o) => ({ ...o, financeVisibleToClient: val }));
            }}
          />
        </div>
        <BankAccountsCard
          organizationId={id}
          bankAccounts={org.bankAccounts || []}
          canEdit={canEdit}
          showLogin={canEdit && !hasRole("client")}
          canViewSecrets={hasPermission("organization_secret", "view")}
          canFetchStatements={hasPermission("bank_statement", "create")}
          canConnectBank={hasPermission("bank_statement", "connect")}
          onDataChanged={fetchOrganization}
        />
        <SystemAccessesCard
          organizationId={id}
          systemAccesses={org.systemAccesses || []}
          canEdit={canEdit && !hasRole("client")}
          canViewSecrets={hasPermission("organization_secret", "view")}
          onDataChanged={fetchOrganization}
        />
        <DocumentsCard
          organizationId={id}
          documents={org.documents || []}
          canCreate={hasPermission("document", "create") && canEdit}
          canDelete={hasPermission("document", "delete") && canEdit}
          onDataChanged={fetchOrganization}
        />
        {(hasRole("admin") ||
          hasRole("supervisor") ||
          hasRole("manager") ||
          hasRole("accountant")) && (
          <OrgTransactionsCard
            organizationId={id}
            debtAmount={org.debtAmount}
            monthlyPayment={org.monthlyPayment}
          />
        )}
        {/* <OrgTicketsCard organizationId={id} /> — hidden until ticket system is released */}
      </div>

      {/* ── Invite Client Modal ── */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-surface rounded-2xl shadow-2xl border border-line w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-bold text-heading mb-4">Пригласить клиента</h2>

            {!inviteLink && !inviteError && (
              <div>
                <p className="text-sm text-subtle mb-4">
                  Будет сгенерирована ссылка-приглашение для регистрации клиента в организации{" "}
                  <span className="font-semibold text-heading">&laquo;{org.name}&raquo;</span>.
                </p>
                <label className="block text-sm font-medium text-body mb-1">
                  Email клиента (необязательно)
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="client@example.com"
                  className="w-full px-3 py-2 mb-2 border border-line rounded-lg text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                />
                <p className="text-xs text-subtle mb-4">
                  Если заполните — клиенту придёт приветственное письмо со ссылкой. Иначе только
                  скопируете ссылку и отправите сами.
                </p>
                <button
                  onClick={handleGenerateInvite}
                  disabled={inviteLoading}
                  className="w-full px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg shadow-lg shadow-[#6567F1]/30 text-sm font-medium transition-all disabled:opacity-50"
                >
                  {inviteLoading
                    ? "Генерация..."
                    : inviteEmail.trim()
                      ? "Сгенерировать и отправить"
                      : "Сгенерировать ссылку"}
                </button>
              </div>
            )}

            {inviteLink && (
              <div className="space-y-3">
                {inviteEmailSent && (
                  <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 rounded-lg text-sm">
                    <Check size={16} className="shrink-0" />
                    <span>
                      Приглашение отправлено на <strong>{inviteEmail.trim()}</strong>
                    </span>
                  </div>
                )}
                {inviteEmailWarning && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 rounded-lg text-sm">
                    {inviteEmailWarning}
                  </div>
                )}
                <p className="text-xs text-subtle">
                  Ссылка-приглашение (можно скопировать и отправить вручную):
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={inviteLink}
                    className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-canvas text-body"
                  />
                  <button
                    onClick={handleCopyInvite}
                    className="shrink-0 inline-flex items-center gap-1 px-3 py-2 border-2 border-primary/20 text-primary hover:bg-primary/5 rounded-lg text-sm font-medium transition-colors"
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                    {copied ? "Скопировано" : "Копировать"}
                  </button>
                </div>
                <p className="text-xs text-subtle">Действительна до: {inviteExpiry}</p>
              </div>
            )}

            {inviteError && (
              <div className="p-3 bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 rounded-lg text-sm">
                {inviteError}
              </div>
            )}

            <div className="flex justify-end mt-4">
              <button
                onClick={() => setShowInvite(false)}
                className="px-4 py-2 border-2 border-primary/20 text-primary hover:bg-primary/5 rounded-lg text-sm font-medium transition-colors"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Member Modal ── */}
      {showAddMember && hasRole("admin") && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-surface rounded-2xl shadow-2xl border border-line w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-bold text-heading mb-4">Добавить участника</h2>
            <form onSubmit={handleAddMember} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-body mb-1">Пользователь *</label>
                <select
                  value={selectedUser?.id || ""}
                  onChange={(e) =>
                    setSelectedUser(allUsers.find((u) => u.id === e.target.value) || null)
                  }
                  autoFocus
                  className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-surface"
                >
                  <option value="">Выберите пользователя...</option>
                  {allUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.lastName} {u.firstName} — {u.email}
                    </option>
                  ))}
                </select>
                {allUsers.length === 0 && (
                  <p className="text-xs text-subtle mt-1">Загрузка пользователей...</p>
                )}
              </div>
              {memberError && (
                <div className="p-3 bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 rounded-lg text-sm">
                  {memberError}
                </div>
              )}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddMember(false)}
                  className="px-4 py-2 border-2 border-primary/20 text-primary hover:bg-primary/5 rounded-lg text-sm font-medium transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={addingMember || !selectedUser}
                  className="px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg shadow-lg shadow-[#6567F1]/30 text-sm font-medium transition-all disabled:opacity-50"
                >
                  {addingMember ? "Добавление..." : "Добавить"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {commentTask && (
        <TaskCommentsModal
          task={commentTask}
          onClose={() => setCommentTask(null)}
          onUpdated={fetchOrgTasks}
        />
      )}

      {/* ── Delete confirmation modal ── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-surface rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-lg font-bold text-heading mb-2">Удалить организацию?</h3>
            <p className="text-sm text-body mb-1">
              Организация <span className="font-semibold">{org.name}</span> будет удалена
              безвозвратно вместе со всеми данными: документами, банковскими счетами, контактами и
              системными доступами.
            </p>
            <p className="text-sm text-red-600 dark:text-red-300 font-medium mb-5">
              Это действие нельзя отменить.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-body hover:bg-muted rounded-lg transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={async () => {
                  setDeleting(true);
                  try {
                    const res = await api(`/api/organizations/${id}/permanent`, {
                      method: "DELETE",
                    });
                    if (res.ok) {
                      navigate("/organizations");
                    } else {
                      const data = await res.json().catch(() => ({}));
                      alert(data.error || "Ошибка удаления");
                      setShowDeleteConfirm(false);
                    }
                  } catch {
                    alert("Ошибка сети");
                    setShowDeleteConfirm(false);
                  } finally {
                    setDeleting(false);
                  }
                }}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {deleting ? "Удаление..." : "Удалить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Open tasks banner shown at the top of the org card ──
const BANNER_PRIORITY_COLORS = {
  LOW: "bg-muted text-subtle",
  MEDIUM: "bg-yellow-100 dark:bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
  HIGH: "bg-orange-100 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300",
  URGENT: "bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300",
};
const BANNER_PRIORITY_LABELS = {
  LOW: "Низкий",
  MEDIUM: "Средний",
  HIGH: "Высокий",
  URGENT: "Срочно",
};
const BANNER_STATUS_LABELS = { OPEN: "Открыта", IN_PROGRESS: "В работе" };
const BANNER_STATUS_COLORS = {
  OPEN: "bg-muted text-body",
  IN_PROGRESS: "bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300",
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function OrgTicketsCard({ organizationId }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const { hasPermission } = useAuth();

  useEffect(() => {
    api(`/api/tickets?organizationId=${organizationId}&limit=10`)
      .then((r) => r.json())
      .then((data) => setTickets(data.tickets || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [organizationId]);

  const statusLabel = {
    NEW: "Новый",
    IN_PROGRESS: "В работе",
    WAITING_CLIENT: "Ожидает клиента",
    CLOSED: "Закрыт",
    ESCALATED: "Эскалация",
    ON_HOLD: "На паузе",
    REOPENED: "Переоткрыт",
  };
  const statusColor = {
    NEW: "bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300",
    IN_PROGRESS: "bg-yellow-100 dark:bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
    WAITING_CLIENT: "bg-orange-100 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300",
    CLOSED: "bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300",
    ESCALATED: "bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300",
    ON_HOLD: "bg-muted text-body",
    REOPENED: "bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300",
  };

  return (
    <div className="bg-surface rounded-2xl shadow-lg border border-line p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-heading">Тикеты</h3>
        <div className="flex items-center gap-2">
          {tickets.length > 0 && (
            <Link
              to={`/tickets?organizationId=${organizationId}`}
              className="text-sm text-primary hover:underline"
            >
              Все тикеты
            </Link>
          )}
          {hasPermission("ticket", "create") && (
            <Link
              to={`/tickets?create=true&orgId=${organizationId}`}
              className="text-sm text-primary hover:underline"
            >
              + Создать
            </Link>
          )}
        </div>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-4 text-subtle">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : tickets.length === 0 ? (
        <p className="text-sm text-subtle">Нет тикетов</p>
      ) : (
        <div className="space-y-2">
          {tickets.map((t) => (
            <Link
              key={t.id}
              to={`/tickets/${t.id}`}
              className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-canvas transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-subtle font-mono">#{t.number}</span>
                <span className="text-sm text-heading truncate">{t.subject}</span>
              </div>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${statusColor[t.status] || "bg-muted text-body"}`}
              >
                {statusLabel[t.status] || t.status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function OrgOpenTasksBanner({ tasks, onComment }) {
  const open = tasks.filter((t) => t.status === "OPEN" || t.status === "IN_PROGRESS");
  if (!open.length) return null;

  return (
    <div className="mb-3 bg-primary/5 border border-primary/20 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <ClipboardList size={15} className="text-primary shrink-0" />
        <span className="text-sm font-semibold text-primary">Открытые задачи — {open.length}</span>
      </div>
      <div className="space-y-2">
        {open.map((task) => {
          const overdue =
            task.dueDate &&
            task.status !== "DONE" &&
            task.status !== "CANCELLED" &&
            new Date(task.dueDate) < new Date();
          return (
            <button
              key={task.id}
              type="button"
              onClick={() => onComment(task)}
              className="w-full text-left px-2 -mx-2 py-1.5 rounded-lg hover:bg-primary/10 transition-colors"
              title="Открыть карточку задачи"
            >
              {/* Title row */}
              <div className="flex items-center gap-2 text-sm">
                <span className="flex-1 text-heading font-medium truncate">{task.title}</span>
                <span
                  className="shrink-0 relative inline-flex items-center justify-center text-subtle"
                  aria-hidden="true"
                >
                  <MessageSquare size={13} />
                  {task._count?.comments > 0 && (
                    <span className="absolute -top-1 -right-1.5 w-3 h-3 bg-primary text-white text-[7px] font-bold rounded-full flex items-center justify-center leading-none">
                      {task._count.comments > 9 ? "9+" : task._count.comments}
                    </span>
                  )}
                </span>
              </div>
              {/* Meta row */}
              <div className="flex items-center flex-wrap gap-1 mt-1">
                <span
                  className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${BANNER_STATUS_COLORS[task.status]}`}
                >
                  {BANNER_STATUS_LABELS[task.status]}
                </span>
                <span
                  className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${BANNER_PRIORITY_COLORS[task.priority]}`}
                >
                  {BANNER_PRIORITY_LABELS[task.priority]}
                </span>
                {task.dueDate && (
                  <span
                    className={`shrink-0 inline-flex items-center gap-1 text-[11px] ${overdue ? "text-red-600 dark:text-red-300 font-semibold" : "text-subtle"}`}
                  >
                    <CalendarDays size={11} />
                    {new Date(task.dueDate).toLocaleDateString("ru-RU")}
                    {overdue && " ⚠"}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
