import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { ArrowLeft, Save, Pencil, X, UserPlus, Trash2, Link2, Copy, Check } from "lucide-react";
import BankAccountsCard from "../components/BankAccountsCard.jsx";
import ContactsCard from "../components/ContactsCard.jsx";
import DocumentsCard from "../components/DocumentsCard.jsx";

const TAX_SYSTEM_LABELS = {
  USN6: "УСН 6%",
  USN15: "УСН 15%",
  AUSN8: "АУСН 8%",
  AUSN20: "АУСН 20%",
  PSN: "ПСН",
  OSNO: "ОСНО",
  USN_NDS5: "УСН+НДС 5%",
  USN_NDS7: "УСН+НДС 7%",
  USN_NDS22: "УСН+НДС 22%",
};
const DIGITAL_SIGNATURE_LABELS = { NONE: "Нет", CLIENT: "У клиента", US: "У нас" };
const REPORTING_CHANNEL_LABELS = { KONTUR: "Контур", SBIS: "СБИС", ASTRAL: "Астрал" };
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
};
const ROLE_LABELS = {
  admin: "Администратор",
  manager: "Менеджер",
  accountant: "Бухгалтер",
  client: "Клиент",
};
const ORG_FORM_LABELS = { OOO: "ООО", IP: "ИП", NKO: "НКО", AO: "АО", PAO: "ПАО" };
const STATUS_BADGE_COLORS = {
  active: "bg-green-100 text-green-700",
  new: "bg-blue-100 text-blue-700",
  liquidating: "bg-amber-100 text-amber-700",
  left: "bg-slate-100 text-slate-500",
  closed: "bg-slate-100 text-slate-500",
  not_paying: "bg-red-100 text-red-700",
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

const INITIAL_FORM = {
  name: "",
  inn: "",
  ogrn: "",
  kpp: "",
  form: "",
  status: "active",
  sectionId: "",
  taxSystems: [],
  employeeCount: "",
  opsPerMonth: "",
  hasCashRegister: false,
  legalAddress: "",
  importantComment: "",
  digitalSignature: "",
  digitalSignatureExpiry: "",
  reportingChannel: "",
  serviceType: "",
  monthlyPayment: "",
  paymentDestination: "",
  debtAmount: "",
  checkingAccount: "",
  bik: "",
  correspondentAccount: "",
  requisitesBank: "",
};

export default function OrganizationDetailPage() {
  const { id } = useParams();
  const { hasPermission, hasRole } = useAuth();
  const canEdit = hasPermission("organization", "edit");

  const [organization, setOrganization] = useState(null);
  const [sections, setSections] = useState([]);
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

  useEffect(() => {
    if (hasPermission("section", "view")) {
      api("/api/sections?limit=100")
        .then((res) => (res.ok ? res.json() : { sections: [] }))
        .then((data) => setSections(data.sections || []))
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
      taxSystems: data.taxSystems || [],
      employeeCount: data.employeeCount != null ? String(data.employeeCount) : "",
      opsPerMonth: data.opsPerMonth != null ? String(data.opsPerMonth) : "",
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

  function selectTaxSystem(key) {
    setField("taxSystems", [key]);
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
          taxSystems: form.taxSystems,
          employeeCount: toIntOrNull(form.employeeCount),
          opsPerMonth: toIntOrNull(form.opsPerMonth),
          hasCashRegister: form.hasCashRegister,
          legalAddress: form.legalAddress || null,
          importantComment: form.importantComment || null,
          digitalSignature: form.digitalSignature || null,
          digitalSignatureExpiry: form.digitalSignatureExpiry || null,
          reportingChannel: form.reportingChannel || null,
          serviceType: form.serviceType || null,
          monthlyPayment: toDecimalOrNull(form.monthlyPayment),
          paymentDestination: form.paymentDestination || null,
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

  function openAddMember() {
    setShowAddMember(true);
    setSelectedUser(null);
    setAllUsers([]);
    setMemberError("");
  }

  if (loading) return <div className="text-slate-400 text-sm">Загрузка...</div>;
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
        </div>
      </div>

      {/* ── Important comment ── */}
      {org.importantComment && (
        <div className="mb-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900">
          <span className="font-semibold">⚠ Важно:</span> {org.importantComment}
        </div>
      )}

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
              <div>
                <label className={LABEL_CLS}>КПП</label>
                <input
                  type="text"
                  value={form.kpp}
                  onChange={(e) => setField("kpp", e.target.value)}
                  className={INPUT_CLS}
                />
              </div>
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
              {sections.length > 0 && (
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
              <div>
                <label className={LABEL_CLS}>Операций / мес</label>
                <input
                  type="number"
                  min="0"
                  value={form.opsPerMonth}
                  onChange={(e) => setField("opsPerMonth", e.target.value)}
                  className={INPUT_CLS}
                />
              </div>
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
            </div>

            <div className="mt-4">
              <label className={LABEL_CLS}>Система налогообложения</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {Object.entries(TAX_SYSTEM_LABELS).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="taxSystem"
                      checked={form.taxSystems.includes(key)}
                      onChange={() => selectTaxSystem(key)}
                      className="w-4 h-4 border-slate-300 text-[#6567F1] focus:ring-[#6567F1]/30"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <label className={LABEL_CLS}>Юридический адрес</label>
              <textarea
                value={form.legalAddress}
                onChange={(e) => setField("legalAddress", e.target.value)}
                rows={2}
                className={INPUT_CLS}
              />
            </div>

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

          {/* Реквизиты + Бухгалтерия + Финансы в одной строке */}
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
                  <input
                    type="text"
                    value={form.paymentDestination}
                    onChange={(e) => setField("paymentDestination", e.target.value)}
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
      ) : (
        /* ══════════════════ READ MODE ══════════════════ */
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
                <Field label="КПП" value={org.kpp} />
                <Field
                  label="Участок"
                  value={
                    org.section
                      ? `№${org.section.number}${org.section.name ? ` ${org.section.name}` : ""}`
                      : null
                  }
                />
                <Field
                  label="Сотрудники"
                  value={org.employeeCount != null ? org.employeeCount : null}
                />
                <Field
                  label="Операций / мес"
                  value={org.opsPerMonth != null ? org.opsPerMonth : null}
                />
                <Field label="Касса" value={org.hasCashRegister ? "Да" : "Нет"} />
                <Field
                  label="Налогообложение"
                  value={
                    org.taxSystems?.[0]
                      ? TAX_SYSTEM_LABELS[org.taxSystems[0]] || org.taxSystems[0]
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
                <Field label="Ежемес. платёж" value={formatCurrency(org.monthlyPayment)} />
                <Field label="Куда поступает" value={org.paymentDestination} />
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

          {/* ── Right: Members + Contacts ── */}
          <div className="flex flex-col gap-4">
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

      {/* ── Always visible: Bank accounts + Documents (full width) ── */}
      <div className="space-y-4">
        <BankAccountsCard
          organizationId={id}
          bankAccounts={org.bankAccounts || []}
          canEdit={canEdit}
          showLogin={canEdit && !hasRole("client")}
          canViewSecrets={hasPermission("organization_secret", "view")}
          onDataChanged={fetchOrganization}
        />
        <DocumentsCard
          organizationId={id}
          documents={org.documents || []}
          canCreate={hasPermission("document", "create")}
          canDelete={hasPermission("document", "delete")}
          onDataChanged={fetchOrganization}
        />
      </div>

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
    </>
  );
}
