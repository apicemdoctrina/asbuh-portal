import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { api } from "../lib/api.js";
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
  Plus,
  CalendarDays,
  User,
  MessageSquare,
  ClipboardList,
  RefreshCw,
  CheckSquare,
  Loader2,
} from "lucide-react";
import TaskCommentsModal from "../components/TaskCommentsModal.jsx";
import BankAccountsCard from "../components/BankAccountsCard.jsx";
import SystemAccessesCard from "../components/SystemAccessesCard.jsx";
import ContactsCard from "../components/ContactsCard.jsx";
import DocumentsCard from "../components/DocumentsCard.jsx";
import OrgCompletenessCard from "../components/OrgCompletenessCard.jsx";
import MessageHistoryCard from "../components/MessageHistoryCard.jsx";
import SendMessageModal from "../components/SendMessageModal.jsx";
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
  active: "bg-green-100 text-green-700",
  new: "bg-blue-100 text-blue-700",
  liquidating: "bg-amber-100 text-amber-700",
  left: "bg-slate-100 text-slate-500",
  closed: "bg-slate-100 text-slate-500",
  not_paying: "bg-red-100 text-red-700",
  ceased: "bg-slate-100 text-slate-500",
  own: "bg-purple-100 text-purple-700",
  blacklisted: "bg-slate-900 text-white",
};

const INPUT_CLS =
  "w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]";
const SELECT_CLS = `${INPUT_CLS} bg-white`;
const LABEL_CLS = "block text-sm font-medium text-slate-700 mb-1";

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
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide leading-none">
        {label}
      </dt>
      <dd className="text-sm text-slate-700 mt-1 leading-snug break-words">
        {empty ? <span className="text-slate-300">—</span> : value}
      </dd>
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
    <form onSubmit={handleAdd} className="pt-2 border-t border-slate-200 mt-2 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] font-medium text-slate-400 mb-0.5">Дата</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
            required
          />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-slate-400 mb-0.5">Сумма ₽</label>
          <input
            type="number"
            step="1"
            min="0"
            placeholder="10 000"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
            required
          />
        </div>
      </div>
      {error && <div className="text-xs text-red-500">{error}</div>}
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
  const { user, hasPermission, hasRole } = useAuth();
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

  // Tasks for this org (shared between banner and OrgTasksCard)
  const [orgTasks, setOrgTasks] = useState([]);
  const [orgTasksLoading, setOrgTasksLoading] = useState(false);
  const [commentTask, setCommentTask] = useState(null);
  const [showSendMessage, setShowSendMessage] = useState(false);
  const [messageHistoryKey, setMessageHistoryKey] = useState(0);
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

  const fetchOrganization = useCallback(async () => {
    setLoading(true);
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
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchOrganization();
  }, [fetchOrganization]);

  const fetchOrgTasks = useCallback(async () => {
    if (!hasPermission("task", "view")) return;
    setOrgTasksLoading(true);
    try {
      const res = await api(`/api/tasks?organizationId=${id}`);
      if (res.ok) setOrgTasks(await res.json());
    } catch {
      // silent
    } finally {
      setOrgTasksLoading(false);
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
    setCopied(false);
    try {
      const res = await api("/api/auth/invite", {
        method: "POST",
        body: JSON.stringify({ organizationId: id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Ошибка генерации приглашения");
      }
      const data = await res.json();
      setInviteLink(`${window.location.origin}/invite/${data.token}`);
      setInviteExpiry(new Date(data.expiresAt).toLocaleString("ru-RU"));
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
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Loader2 size={28} className="animate-spin" />
      </div>
    );
  if (error)
    return (
      <div className="text-red-600 text-sm">
        {error}{" "}
        <Link to="/organizations" className="text-[#6567F1] hover:underline">
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
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-[#6567F1] mb-3"
      >
        <ArrowLeft size={15} /> Все организации
      </Link>

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2.5 flex-wrap min-w-0">
          <h1 className="text-xl font-bold text-slate-900 leading-tight">{org.name}</h1>
          {org.form && (
            <span className="shrink-0 px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs font-semibold">
              {ORG_FORM_LABELS[org.form] || org.form}
            </span>
          )}
          <span
            className={`shrink-0 px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE_COLORS[org.status] || "bg-slate-100 text-slate-500"}`}
          >
            {STATUS_LABELS[org.status] || org.status}
          </span>
          {saveMsg && (
            <span
              className={`text-sm font-medium ${saveMsg === "Сохранено" ? "text-green-600" : "text-red-600"}`}
            >
              {saveMsg}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canEdit && !editing && (
            <button
              onClick={() => {
                setShowInvite(true);
                setInviteLink("");
                setInviteError("");
                setCopied(false);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors"
            >
              <Link2 size={14} /> Пригласить
            </button>
          )}
          {canEdit && !editing && (
            <button
              onClick={() => {
                populateForm(org);
                setEditing(true);
                setSaveMsg("");
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg text-sm font-medium shadow-md shadow-[#6567F1]/20 transition-all"
            >
              <Pencil size={14} /> Изменить
            </button>
          )}
          {isAdmin && !editing && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-red-200 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors"
            >
              <Trash2 size={14} /> Удалить
            </button>
          )}
        </div>
      </div>

      {/* ── Important comment ── */}
      {org.importantComment && (
        <div className="mb-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900">
          <span className="font-semibold">⚠ Важно:</span> {org.importantComment}
        </div>
      )}

      {/* ── Open tasks banner ── */}
      {!editing && <OrgOpenTasksBanner tasks={orgTasks} onComment={setCommentTask} />}

      {editing ? (
        /* ══════════════════ EDIT MODE ══════════════════ */
        <form onSubmit={handleSave} className="space-y-4">
          {/* Основная информация */}
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
            <h2 className="text-base font-bold text-slate-900 mb-4">Основная информация</h2>
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
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer pb-2">
                    <input
                      type="checkbox"
                      checked={form.hasCashRegister}
                      onChange={(e) => setField("hasCashRegister", e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-[#6567F1] focus:ring-[#6567F1]/30"
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
                      className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={form.taxSystems.includes(key)}
                        onChange={() => toggleTaxSystem(key)}
                        className="w-4 h-4 rounded border-slate-300 text-[#6567F1] focus:ring-[#6567F1]/30"
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
              <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
                <h2 className="text-base font-bold text-slate-900 mb-4">Реквизиты</h2>
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

              <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
                <h2 className="text-base font-bold text-slate-900 mb-4">Бухгалтерия</h2>
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

              <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
                <h2 className="text-base font-bold text-slate-900 mb-4">Финансы</h2>
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

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg shadow-lg shadow-[#6567F1]/30 text-sm font-medium transition-all disabled:opacity-50"
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
              className="inline-flex items-center gap-2 px-4 py-2 border-2 border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors"
            >
              <X size={16} />
              Отмена
            </button>
          </div>
        </form>
      ) : /* ══════════════════ READ MODE ══════════════════ */
      ARCHIVED_STATUSES.includes(org.status) ? (
        <div className="mb-4 bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
          <div className="mb-4 px-4 py-2.5 bg-slate-100 border border-slate-300 rounded-xl text-sm text-slate-600 font-medium">
            Организация в архиве — {STATUS_LABELS[org.status]}
          </div>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
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
          {/* ── Left: all org data in one card ── */}
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-lg border border-slate-200 divide-y divide-slate-100">
            {/* Основные сведения */}
            <div className="p-5">
              <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
                Основные сведения
              </h3>
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
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
                    <dt className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                      Группа клиента
                    </dt>
                    <dd className="mt-0.5 text-sm">
                      <Link
                        to={`/client-groups/${org.clientGroup.id}`}
                        className="text-[#6567F1] hover:underline font-medium"
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
            <div className="p-5">
              <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
                Бухгалтерия
              </h3>
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
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
            <div className="p-5">
              <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
                Финансы
              </h3>
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
                <div className="min-w-0">
                  <dt className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide leading-none">
                    Ежемес. платёж
                  </dt>
                  <dd className="text-sm text-slate-700 mt-1 leading-snug">
                    {org.monthlyPayment ? (
                      formatCurrency(org.monthlyPayment)
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                    {(org.priceHistory?.length > 0 || canEdit) && (
                      <button
                        onClick={() => setPriceHistoryOpen((v) => !v)}
                        className="ml-2 text-xs text-[#6567F1] hover:underline"
                      >
                        история{org.priceHistory?.length ? ` · ${org.priceHistory.length}` : ""}
                      </button>
                    )}
                  </dd>
                  {priceHistoryOpen && (
                    <div className="mt-2 bg-slate-50 rounded-lg border border-slate-200 p-2 text-xs space-y-1">
                      {(org.priceHistory || []).length > 0 &&
                        [...org.priceHistory].reverse().map((h) => (
                          <div key={h.id} className="flex items-center justify-between gap-3">
                            <span className="text-slate-500">
                              с {new Date(h.effectiveFrom).toLocaleDateString("ru-RU")}
                            </span>
                            <span className="font-medium text-slate-700">
                              {formatCurrency(h.price)}
                            </span>
                            {canEdit && (
                              <button
                                onClick={() => handleDeletePriceEntry(h.id)}
                                className="text-slate-300 hover:text-red-500 transition-colors"
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
              <div className="p-5">
                <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
                  Реквизиты
                </h3>
                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
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
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-700">Участники</h3>
                {hasRole("admin") && (
                  <button
                    onClick={openAddMember}
                    className="inline-flex items-center gap-1 text-xs text-[#6567F1] hover:text-[#5557E1] font-medium"
                  >
                    <UserPlus size={13} /> Добавить
                  </button>
                )}
              </div>

              {org.members?.length === 0 ? (
                <p className="text-xs text-slate-400">Нет участников</p>
              ) : (
                <div className="space-y-2.5">
                  {org.members?.map((m) => (
                    <div key={m.id} className="flex items-start justify-between group">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 leading-tight">
                          {m.user.lastName} {m.user.firstName}
                        </p>
                        <p className="text-xs text-slate-400 truncate mt-0.5">{m.user.email}</p>
                        <span className="inline-block mt-1 bg-[#6567F1]/10 text-[#6567F1] px-1.5 py-0.5 rounded-full text-[11px] font-medium">
                          {ROLE_LABELS[m.role] ?? m.role}
                        </span>
                      </div>
                      {hasRole("admin") && (
                        <button
                          onClick={() => handleRemoveMember(m.user.id)}
                          className="ml-2 mt-0.5 shrink-0 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Contacts */}
            <ContactsCard
              organizationId={id}
              contacts={org.contacts || []}
              canEdit={canEdit}
              onDataChanged={fetchOrganization}
            />
          </div>
        </div>
      )}

      {/* ── Always visible: Bank accounts + Documents + Tasks (full width) ── */}
      <div className="space-y-4">
        <BankAccountsCard
          organizationId={id}
          bankAccounts={org.bankAccounts || []}
          canEdit={canEdit}
          showLogin={canEdit && !hasRole("client")}
          canViewSecrets={hasPermission("organization_secret", "view")}
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
        {hasPermission("task", "view") && (
          <OrgTasksCard
            organizationId={id}
            tasks={orgTasks}
            loading={orgTasksLoading}
            onTasksChanged={fetchOrgTasks}
            onComment={setCommentTask}
            canCreate={hasPermission("task", "create")}
            canEditAny={
              hasPermission("task", "edit") &&
              (hasRole("admin") || hasRole("supervisor") || hasRole("manager"))
            }
            canEditOwn={hasPermission("task", "edit")}
            canDeleteAny={
              hasPermission("task", "delete") &&
              (hasRole("admin") || hasRole("supervisor") || hasRole("manager"))
            }
            canDeleteOwn={hasPermission("task", "delete")}
            members={org?.members || []}
          />
        )}
        {hasPermission("message", "view") && (
          <MessageHistoryCard
            key={messageHistoryKey}
            orgId={id}
            onSendClick={
              hasPermission("message", "send") ? () => setShowSendMessage(true) : undefined
            }
          />
        )}
        {(hasRole("admin") ||
          hasRole("supervisor") ||
          hasRole("manager") ||
          hasRole("accountant")) && <OrgTransactionsCard organizationId={id} />}
        {/* <OrgTicketsCard organizationId={id} /> — hidden until ticket system is released */}
      </div>

      {/* ── Send Message Modal ── */}
      {showSendMessage && (
        <SendMessageModal
          orgId={id}
          orgName={org.name}
          contacts={org.contacts || []}
          senderName={user ? `${user.firstName} ${user.lastName}` : ""}
          onClose={() => setShowSendMessage(false)}
          onSent={() => setMessageHistoryKey((k) => k + 1)}
        />
      )}

      {/* ── Invite Client Modal ── */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Пригласить клиента</h2>

            {!inviteLink && !inviteError && (
              <div className="text-center">
                <p className="text-sm text-slate-500 mb-4">
                  Будет сгенерирована ссылка-приглашение для регистрации клиента в организации{" "}
                  <span className="font-semibold text-slate-900">&laquo;{org.name}&raquo;</span>.
                </p>
                <button
                  onClick={handleGenerateInvite}
                  disabled={inviteLoading}
                  className="px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg shadow-lg shadow-[#6567F1]/30 text-sm font-medium transition-all disabled:opacity-50"
                >
                  {inviteLoading ? "Генерация..." : "Сгенерировать ссылку"}
                </button>
              </div>
            )}

            {inviteLink && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={inviteLink}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-700"
                  />
                  <button
                    onClick={handleCopyInvite}
                    className="shrink-0 inline-flex items-center gap-1 px-3 py-2 border-2 border-[#6567F1]/20 text-[#6567F1] hover:bg-[#6567F1]/5 rounded-lg text-sm font-medium transition-colors"
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                    {copied ? "Скопировано" : "Копировать"}
                  </button>
                </div>
                <p className="text-xs text-slate-400">Действительна до: {inviteExpiry}</p>
              </div>
            )}

            {inviteError && (
              <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{inviteError}</div>
            )}

            <div className="flex justify-end mt-4">
              <button
                onClick={() => setShowInvite(false)}
                className="px-4 py-2 border-2 border-[#6567F1]/20 text-[#6567F1] hover:bg-[#6567F1]/5 rounded-lg text-sm font-medium transition-colors"
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
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Добавить участника</h2>
            <form onSubmit={handleAddMember} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Пользователь *
                </label>
                <select
                  value={selectedUser?.id || ""}
                  onChange={(e) =>
                    setSelectedUser(allUsers.find((u) => u.id === e.target.value) || null)
                  }
                  autoFocus
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1] bg-white"
                >
                  <option value="">Выберите пользователя...</option>
                  {allUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.lastName} {u.firstName} — {u.email}
                    </option>
                  ))}
                </select>
                {allUsers.length === 0 && (
                  <p className="text-xs text-slate-400 mt-1">Загрузка пользователей...</p>
                )}
              </div>
              {memberError && (
                <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{memberError}</div>
              )}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddMember(false)}
                  className="px-4 py-2 border-2 border-[#6567F1]/20 text-[#6567F1] hover:bg-[#6567F1]/5 rounded-lg text-sm font-medium transition-colors"
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

      {commentTask && <TaskCommentsModal task={commentTask} onClose={() => setCommentTask(null)} />}

      {/* ── Delete confirmation modal ── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Удалить организацию?</h3>
            <p className="text-sm text-slate-600 mb-1">
              Организация <span className="font-semibold">{org.name}</span> будет удалена
              безвозвратно вместе со всеми данными: документами, банковскими счетами, контактами и
              системными доступами.
            </p>
            <p className="text-sm text-red-600 font-medium mb-5">Это действие нельзя отменить.</p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
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
  LOW: "bg-slate-100 text-slate-500",
  MEDIUM: "bg-yellow-100 text-yellow-700",
  HIGH: "bg-orange-100 text-orange-700",
  URGENT: "bg-red-100 text-red-700",
};
const BANNER_PRIORITY_LABELS = {
  LOW: "Низкий",
  MEDIUM: "Средний",
  HIGH: "Высокий",
  URGENT: "Срочно",
};
const BANNER_STATUS_LABELS = { OPEN: "Открыта", IN_PROGRESS: "В работе" };
const BANNER_STATUS_COLORS = {
  OPEN: "bg-slate-100 text-slate-600",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
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
    NEW: "bg-blue-100 text-blue-700",
    IN_PROGRESS: "bg-yellow-100 text-yellow-700",
    WAITING_CLIENT: "bg-orange-100 text-orange-700",
    CLOSED: "bg-green-100 text-green-700",
    ESCALATED: "bg-red-100 text-red-700",
    ON_HOLD: "bg-slate-100 text-slate-600",
    REOPENED: "bg-purple-100 text-purple-700",
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-slate-900">Тикеты</h3>
        <div className="flex items-center gap-2">
          {tickets.length > 0 && (
            <Link
              to={`/tickets?organizationId=${organizationId}`}
              className="text-sm text-[#6567F1] hover:underline"
            >
              Все тикеты
            </Link>
          )}
          {hasPermission("ticket", "create") && (
            <Link
              to={`/tickets?create=true&orgId=${organizationId}`}
              className="text-sm text-[#6567F1] hover:underline"
            >
              + Создать
            </Link>
          )}
        </div>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-4 text-slate-400">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : tickets.length === 0 ? (
        <p className="text-sm text-slate-400">Нет тикетов</p>
      ) : (
        <div className="space-y-2">
          {tickets.map((t) => (
            <Link
              key={t.id}
              to={`/tickets/${t.id}`}
              className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-slate-400 font-mono">#{t.number}</span>
                <span className="text-sm text-slate-900 truncate">{t.subject}</span>
              </div>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${statusColor[t.status] || "bg-slate-100 text-slate-600"}`}
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
    <div className="mb-3 bg-[#6567F1]/5 border border-[#6567F1]/20 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <ClipboardList size={15} className="text-[#6567F1] shrink-0" />
        <span className="text-sm font-semibold text-[#6567F1]">
          Открытые задачи — {open.length}
        </span>
      </div>
      <div className="space-y-2">
        {open.map((task) => {
          const overdue =
            task.dueDate &&
            task.status !== "DONE" &&
            task.status !== "CANCELLED" &&
            new Date(task.dueDate) < new Date();
          return (
            <div key={task.id} className="flex items-center gap-2 text-sm">
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
              <span className="flex-1 text-slate-800 font-medium truncate">{task.title}</span>
              {task.dueDate && (
                <span
                  className={`shrink-0 flex items-center gap-1 text-xs ${overdue ? "text-red-600 font-semibold" : "text-slate-400"}`}
                >
                  <CalendarDays size={11} />
                  {new Date(task.dueDate).toLocaleDateString("ru-RU")}
                  {overdue && " ⚠"}
                </span>
              )}
              <button
                onClick={() => onComment(task)}
                className="shrink-0 relative p-1 text-slate-400 hover:text-[#6567F1] transition-colors"
                title="Комментарии"
              >
                <MessageSquare size={13} />
                {task._count?.comments > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-[#6567F1] text-white text-[7px] font-bold rounded-full flex items-center justify-center leading-none">
                    {task._count.comments > 9 ? "9+" : task._count.comments}
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Task constants (reused from TasksPage) ──
const TASK_STATUS_LABELS = {
  OPEN: "Открыта",
  IN_PROGRESS: "В работе",
  DONE: "Выполнена",
  CANCELLED: "Отменена",
};
const TASK_PRIORITY_LABELS = {
  LOW: "Низкий",
  MEDIUM: "Средний",
  HIGH: "Высокий",
  URGENT: "Срочно",
};
const TASK_CATEGORY_LABELS = {
  REPORTING: "Отчётность",
  DOCUMENTS: "Документы",
  PAYMENT: "Оплата",
  OTHER: "Прочее",
};
const TASK_STATUS_COLORS = {
  OPEN: "bg-slate-100 text-slate-600",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  DONE: "bg-green-100 text-green-700",
  CANCELLED: "bg-slate-100 text-slate-400",
};
const TASK_PRIORITY_COLORS = {
  LOW: "bg-slate-100 text-slate-500",
  MEDIUM: "bg-yellow-100 text-yellow-700",
  HIGH: "bg-orange-100 text-orange-700",
  URGENT: "bg-red-100 text-red-700",
};

const TASK_INPUT_CLS =
  "w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1] bg-white";
const TASK_LABEL_CLS = "block text-sm font-medium text-slate-700 mb-1";
const TASK_EMPTY_FORM = {
  title: "",
  description: "",
  priority: "MEDIUM",
  category: "OTHER",
  dueDate: "",
  assignedToIds: [],
};

function isTaskOverdue(task) {
  if (!task.dueDate || task.status === "DONE" || task.status === "CANCELLED") return false;
  return new Date(task.dueDate) < new Date();
}

function OrgTasksCard({
  organizationId,
  tasks,
  loading,
  onTasksChanged,
  onComment,
  canCreate,
  canEditAny,
  canEditOwn,
  canDeleteAny,
  canDeleteOwn,
  members,
}) {
  const { user } = useAuth();

  function canEditTask(task) {
    if (canEditAny) return true;
    if (canEditOwn) return task.createdBy?.id === user?.id;
    return false;
  }

  function canDeleteTask(task) {
    if (canDeleteAny) return true;
    if (canDeleteOwn) return task.createdBy?.id === user?.id;
    return false;
  }

  const assignableUsers = (members || []).filter((m) => m.role !== "client").map((m) => m.user);

  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [form, setForm] = useState(TASK_EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  // Generate tasks preview modal
  const [showGenerate, setShowGenerate] = useState(false);
  const [preview, setPreview] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState(null);

  async function openGenerateModal() {
    setShowGenerate(true);
    setGenerateResult(null);
    setPreviewLoading(true);
    try {
      const res = await api(`/api/organizations/${organizationId}/generate-tasks/preview`);
      if (res.ok) setPreview(await res.json());
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await api(`/api/organizations/${organizationId}/generate-tasks`, {
        method: "POST",
      });
      if (res.ok) {
        const result = await res.json();
        setGenerateResult(result);
        onTasksChanged();
      }
    } finally {
      setGenerating(false);
    }
  }

  function openCreate() {
    setEditingTask(null);
    setForm({
      ...TASK_EMPTY_FORM,
      assignedToIds: assignableUsers.length === 1 ? [assignableUsers[0].id] : [],
    });
    setFormError(null);
    setShowModal(true);
  }

  function openEdit(task) {
    setEditingTask(task);
    setForm({
      title: task.title,
      description: task.description || "",
      priority: task.priority,
      category: task.category,
      dueDate: task.dueDate ? task.dueDate.slice(0, 10) : "",
      assignedToIds: task.assignees?.map((a) => a.userId) ?? [],
    });
    setFormError(null);
    setShowModal(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) {
      setFormError("Заголовок обязателен");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const body = {
        title: form.title.trim(),
        description: form.description || null,
        priority: form.priority,
        category: form.category,
        dueDate: form.dueDate || null,
        organizationId,
        assignedToIds: form.assignedToIds,
      };
      if (editingTask) {
        const res = await api(`/api/tasks/${editingTask.id}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error();
      } else {
        const res = await api("/api/tasks", { method: "POST", body: JSON.stringify(body) });
        if (!res.ok) throw new Error();
      }
      setShowModal(false);
      onTasksChanged();
    } catch {
      setFormError("Не удалось сохранить задачу");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(task, newStatus) {
    try {
      await api(`/api/tasks/${task.id}`, {
        method: "PUT",
        body: JSON.stringify({ status: newStatus }),
      });
      onTasksChanged();
    } catch {
      /* silent */
    }
  }

  async function handleDelete(task) {
    if (!confirm(`Удалить задачу «${task.title}»?`)) return;
    try {
      await api(`/api/tasks/${task.id}`, { method: "DELETE" });
      onTasksChanged();
    } catch {
      /* silent */
    }
  }

  return (
    <>
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-700">Задачи</h3>
          {canCreate && (
            <div className="flex items-center gap-3">
              <button
                onClick={openGenerateModal}
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-[#6567F1] font-medium transition-colors"
                title="Сгенерировать стандартные задачи по параметрам организации"
              >
                <RefreshCw size={12} /> Сгенерировать
              </button>
              <button
                onClick={openCreate}
                className="inline-flex items-center gap-1 text-xs text-[#6567F1] hover:text-[#5557E1] font-medium"
              >
                <Plus size={13} /> Добавить
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <p className="text-xs text-slate-400">Загрузка...</p>
        ) : tasks.length === 0 ? (
          <p className="text-xs text-slate-400">Нет задач</p>
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => {
              const overdue = isTaskOverdue(task);
              return (
                <div
                  key={task.id}
                  className="flex items-start gap-2 py-2 border-b border-slate-100 last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap gap-1 mb-0.5">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${TASK_STATUS_COLORS[task.status]}`}
                      >
                        {TASK_STATUS_LABELS[task.status]}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${TASK_PRIORITY_COLORS[task.priority]}`}
                      >
                        {TASK_PRIORITY_LABELS[task.priority]}
                      </span>
                    </div>
                    <p
                      className={`text-sm font-medium leading-snug ${task.status === "CANCELLED" ? "line-through text-slate-400" : "text-slate-900"}`}
                    >
                      {task.title}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 mt-0.5 text-xs text-slate-400">
                      {task.assignees?.length > 0 && (
                        <span className="flex items-center gap-1">
                          <User size={11} />
                          {task.assignees
                            .map((a) => `${a.user.lastName} ${a.user.firstName}`)
                            .join(", ")}
                        </span>
                      )}
                      {task.dueDate && (
                        <span
                          className={`flex items-center gap-1 ${overdue ? "text-red-500 font-medium" : ""}`}
                        >
                          <CalendarDays size={11} />
                          {new Date(task.dueDate).toLocaleDateString("ru-RU")}
                          {overdue && " — просрочено"}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {canEditTask(task) && (
                      <select
                        value={task.status}
                        onChange={(e) => handleStatusChange(task, e.target.value)}
                        className="text-[10px] border border-slate-200 rounded-lg px-1.5 py-1 bg-white focus:outline-none cursor-pointer"
                      >
                        {Object.entries(TASK_STATUS_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      onClick={() => onComment(task)}
                      className="relative p-1 text-slate-300 hover:text-[#6567F1] transition-colors"
                      title="Комментарии"
                    >
                      <MessageSquare size={13} />
                      {task._count?.comments > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-[#6567F1] text-white text-[7px] font-bold rounded-full flex items-center justify-center leading-none">
                          {task._count.comments > 9 ? "9+" : task._count.comments}
                        </span>
                      )}
                    </button>
                    {canEditTask(task) && (
                      <button
                        onClick={() => openEdit(task)}
                        className="p-1 text-slate-300 hover:text-[#6567F1] transition-colors"
                      >
                        <Pencil size={13} />
                      </button>
                    )}
                    {canDeleteTask(task) && (
                      <button
                        onClick={() => handleDelete(task)}
                        className="p-1 text-slate-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Task modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">
                {editingTask ? "Редактировать задачу" : "Новая задача"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className={TASK_LABEL_CLS}>Заголовок *</label>
                <input
                  autoFocus
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className={TASK_INPUT_CLS}
                />
              </div>
              <div>
                <label className={TASK_LABEL_CLS}>Описание</label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className={TASK_INPUT_CLS}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={TASK_LABEL_CLS}>Приоритет</label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                    className={TASK_INPUT_CLS}
                  >
                    {Object.entries(TASK_PRIORITY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={TASK_LABEL_CLS}>Категория</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    className={TASK_INPUT_CLS}
                  >
                    {Object.entries(TASK_CATEGORY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className={TASK_LABEL_CLS}>Дедлайн</label>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                  className={TASK_INPUT_CLS}
                />
              </div>
              <div>
                <label className={TASK_LABEL_CLS}>Исполнители</label>
                <OrgAssigneeMultiSelect
                  options={assignableUsers}
                  value={form.assignedToIds}
                  onChange={(ids) => setForm((f) => ({ ...f, assignedToIds: ids }))}
                />
              </div>
              {formError && (
                <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{formError}</div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border-2 border-[#6567F1]/20 text-[#6567F1] hover:bg-[#6567F1]/5 rounded-lg text-sm font-medium transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg shadow-lg shadow-[#6567F1]/30 text-sm font-medium transition-all disabled:opacity-50"
                >
                  <Save size={16} />
                  {saving ? "Сохранение..." : "Сохранить"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Generate tasks preview modal */}
      {showGenerate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900">Сгенерировать задачи</h2>
                <p className="text-xs text-slate-400 mt-0.5">На основе параметров организации</p>
              </div>
              <button
                onClick={() => setShowGenerate(false)}
                className="text-slate-400 hover:text-slate-700 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
              {previewLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : generateResult ? (
                <div className="text-center py-6">
                  <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <CheckSquare size={22} className="text-emerald-600" />
                  </div>
                  <p className="text-base font-semibold text-slate-900">Готово!</p>
                  <p className="text-sm text-slate-500 mt-1">
                    Создано задач:{" "}
                    <span className="font-medium text-emerald-600">{generateResult.generated}</span>
                    {generateResult.skipped > 0 && (
                      <>
                        , пропущено (уже существуют):{" "}
                        <span className="font-medium">{generateResult.skipped}</span>
                      </>
                    )}
                  </p>
                </div>
              ) : preview.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">
                  Нет параметров для генерации задач. Заполните карточку организации (система Н/О,
                  тип обслуживания, ЭЦП).
                </p>
              ) : (
                <div className="space-y-2">
                  {preview.map((t, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-3 p-3 rounded-xl border ${
                        t.alreadyExists
                          ? "bg-slate-50 border-slate-100 opacity-50"
                          : "bg-white border-slate-200"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm font-medium ${t.alreadyExists ? "line-through text-slate-400" : "text-slate-800"}`}
                        >
                          {t.title}
                        </p>
                        {t.description && (
                          <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">
                            {t.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                        {t.recurrenceType && (
                          <span className="text-[10px] text-[#6567F1] bg-[#6567F1]/10 px-1.5 py-0.5 rounded-full">
                            ↺
                          </span>
                        )}
                        {t.alreadyExists && (
                          <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">
                            есть
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {!generateResult && (
              <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
                <button
                  onClick={() => setShowGenerate(false)}
                  className="px-4 py-2 border-2 border-[#6567F1]/20 text-[#6567F1] hover:bg-[#6567F1]/5 rounded-lg text-sm font-medium transition-colors"
                >
                  Отмена
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={generating || previewLoading || preview.every((t) => t.alreadyExists)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg shadow-lg shadow-[#6567F1]/30 text-sm font-medium transition-all disabled:opacity-40"
                >
                  <RefreshCw size={14} />
                  {generating
                    ? "Создание..."
                    : `Создать ${preview.filter((t) => !t.alreadyExists).length} задач`}
                </button>
              </div>
            )}
            {generateResult && (
              <div className="px-6 py-4 border-t border-slate-100 flex justify-end">
                <button
                  onClick={() => setShowGenerate(false)}
                  className="px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] text-white rounded-lg text-sm font-medium"
                >
                  Закрыть
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function OrgAssigneeMultiSelect({ options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function toggle(id) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  const selectedLabels = options
    .filter((u) => value.includes(u.id))
    .map((u) => `${u.lastName} ${u.firstName}`)
    .join(", ");

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-left bg-white focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1] flex items-center justify-between"
      >
        <span className={selectedLabels ? "text-slate-900" : "text-slate-400"}>
          {selectedLabels || "Не назначено"}
        </span>
        <span className="text-slate-400 text-xs">▾</span>
      </button>
      {open && (
        <div className="absolute z-50 w-full bottom-full mb-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-400">Нет сотрудников</div>
          ) : (
            options.map((u) => (
              <label
                key={u.id}
                className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm"
              >
                <input
                  type="checkbox"
                  checked={value.includes(u.id)}
                  onChange={() => toggle(u.id)}
                  className="accent-[#6567F1]"
                />
                {u.lastName} {u.firstName}
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}
