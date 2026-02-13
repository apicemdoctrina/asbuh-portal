import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, Link } from "react-router";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { ArrowLeft, Save, UserPlus, Trash2, Search } from "lucide-react";
import BankAccountsCard from "../components/BankAccountsCard.jsx";
import ContactsCard from "../components/ContactsCard.jsx";

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
const STATUS_LABELS = { active: "Активная", new: "Новая", archived: "Архив" };

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

const INITIAL_FORM = {
  name: "",
  inn: "",
  kpp: "",
  form: "",
  status: "active",
  sectionId: "",
  taxSystems: [],
  employeeCount: "",
  opsPerMonth: "",
  hasCashRegister: false,
  legalAddress: "",
  digitalSignature: "",
  digitalSignatureExpiry: "",
  reportingChannel: "",
  serviceType: "",
  monthlyPayment: "",
  paymentDestination: "",
  debtAmount: "",
};

export default function OrganizationDetailPage() {
  const { id } = useParams();
  const { hasPermission, hasRole } = useAuth();
  const canEdit = hasPermission("organization", "edit");

  const [organization, setOrganization] = useState(null);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [form, setForm] = useState(INITIAL_FORM);
  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // Add member state
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberResults, setMemberResults] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [memberRole, setMemberRole] = useState("client");
  const [addingMember, setAddingMember] = useState(false);
  const [memberError, setMemberError] = useState("");
  const [searchingUsers, setSearchingUsers] = useState(false);
  const searchTimeout = useRef(null);

  // Load sections for dropdown
  useEffect(() => {
    if (hasPermission("section", "view")) {
      api("/api/sections?limit=100")
        .then((res) => (res.ok ? res.json() : { sections: [] }))
        .then((data) => setSections(data.sections || []))
        .catch(() => {});
    }
  }, [hasPermission]);

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
      setForm({
        name: data.name || "",
        inn: data.inn || "",
        kpp: data.kpp || "",
        form: data.form || "",
        status: data.status || "active",
        sectionId: data.sectionId || "",
        taxSystems: data.taxSystems || [],
        employeeCount: data.employeeCount != null ? String(data.employeeCount) : "",
        opsPerMonth: data.opsPerMonth != null ? String(data.opsPerMonth) : "",
        hasCashRegister: data.hasCashRegister || false,
        legalAddress: data.legalAddress || "",
        digitalSignature: data.digitalSignature || "",
        digitalSignatureExpiry: data.digitalSignatureExpiry
          ? data.digitalSignatureExpiry.slice(0, 10)
          : "",
        reportingChannel: data.reportingChannel || "",
        serviceType: data.serviceType || "",
        monthlyPayment: data.monthlyPayment != null ? String(data.monthlyPayment) : "",
        paymentDestination: data.paymentDestination || "",
        debtAmount: data.debtAmount != null ? String(data.debtAmount) : "",
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchOrganization();
  }, [fetchOrganization]);

  // Debounced user search
  useEffect(() => {
    if (!showAddMember) return;
    if (memberSearch.length < 2) {
      setMemberResults([]);
      return;
    }
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      setSearchingUsers(true);
      try {
        const res = await api(`/api/users?search=${encodeURIComponent(memberSearch)}`);
        if (res.ok) {
          const data = await res.json();
          const existingIds = new Set(organization?.members?.map((m) => m.user.id) || []);
          setMemberResults(data.filter((u) => !existingIds.has(u.id)));
        }
      } catch {
        // ignore
      } finally {
        setSearchingUsers(false);
      }
    }, 300);
    return () => clearTimeout(searchTimeout.current);
  }, [memberSearch, showAddMember, organization]);

  function toggleTaxSystem(key) {
    setField(
      "taxSystems",
      form.taxSystems.includes(key)
        ? form.taxSystems.filter((t) => t !== key)
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
          kpp: form.kpp || null,
          form: form.form || null,
          status: form.status,
          sectionId: form.sectionId || null,
          taxSystems: form.taxSystems,
          employeeCount: toIntOrNull(form.employeeCount),
          opsPerMonth: toIntOrNull(form.opsPerMonth),
          hasCashRegister: form.hasCashRegister,
          legalAddress: form.legalAddress || null,
          digitalSignature: form.digitalSignature || null,
          digitalSignatureExpiry: form.digitalSignatureExpiry || null,
          reportingChannel: form.reportingChannel || null,
          serviceType: form.serviceType || null,
          monthlyPayment: toDecimalOrNull(form.monthlyPayment),
          paymentDestination: form.paymentDestination || null,
          debtAmount: toDecimalOrNull(form.debtAmount),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update");
      }
      await fetchOrganization();
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
        body: JSON.stringify({ email: selectedUser.email, role: memberRole }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to add member");
      }
      setMemberSearch("");
      setSelectedUser(null);
      setMemberResults([]);
      setMemberRole("client");
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
      const res = await api(`/api/organizations/${id}/members/${userId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to remove member");
      }
      fetchOrganization();
    } catch (err) {
      alert(err.message);
    }
  }

  function openAddMember() {
    setShowAddMember(true);
    setMemberSearch("");
    setSelectedUser(null);
    setMemberResults([]);
    setMemberError("");
    setMemberRole("client");
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

  return (
    <>
      <Link
        to="/organizations"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-[#6567F1] mb-4"
      >
        <ArrowLeft size={16} /> Все организации
      </Link>

      <h1 className="text-2xl font-bold text-slate-900 mb-6">{organization.name}</h1>

      {canEdit ? (
        /* ================ EDIT MODE ================ */
        <>
          <form onSubmit={handleSave} className="space-y-6">
            {/* Основная информация */}
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4">Основная информация</h2>
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
                  <label className={LABEL_CLS}>КПП</label>
                  <input
                    type="text"
                    value={form.kpp}
                    onChange={(e) => setField("kpp", e.target.value)}
                    className={INPUT_CLS}
                  />
                </div>
                <div>
                  <label className={LABEL_CLS}>Форма (НКО, ИП, ООО)</label>
                  <input
                    type="text"
                    value={form.form}
                    onChange={(e) => setField("form", e.target.value)}
                    className={INPUT_CLS}
                  />
                </div>
                <div>
                  <label className={LABEL_CLS}>Статус</label>
                  <select
                    value={form.status}
                    onChange={(e) => setField("status", e.target.value)}
                    className={SELECT_CLS}
                  >
                    <option value="active">Активная</option>
                    <option value="new">Новая</option>
                    <option value="archived">Архив</option>
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

              {/* Tax systems */}
              <div className="mt-4">
                <label className={LABEL_CLS}>Системы налогообложения</label>
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

              {/* Legal address — full width */}
              <div className="mt-4">
                <label className={LABEL_CLS}>Юридический адрес</label>
                <textarea
                  value={form.legalAddress}
                  onChange={(e) => setField("legalAddress", e.target.value)}
                  rows={2}
                  className={INPUT_CLS}
                />
              </div>
            </div>

            {/* Бухгалтерская информация */}
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4">Бухгалтерская информация</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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

            {/* Финансовая информация */}
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4">Финансовая информация</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                  <label className={LABEL_CLS}>Назначение платежа</label>
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

              <div className="flex items-center gap-3 mt-6">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg shadow-lg shadow-[#6567F1]/30 text-sm font-medium transition-all disabled:opacity-50"
                >
                  <Save size={16} />
                  {saving ? "Сохранение..." : "Сохранить"}
                </button>
                {saveMsg && (
                  <span
                    className={`text-sm ${saveMsg === "Сохранено" ? "text-green-600" : "text-red-600"}`}
                  >
                    {saveMsg}
                  </span>
                )}
              </div>
            </div>
          </form>

          {/* Bank accounts & contacts — outside <form> */}
          <div className="space-y-6 mt-6">
            <BankAccountsCard
              organizationId={id}
              bankAccounts={organization.bankAccounts || []}
              canEdit={canEdit}
              showLogin={canEdit && !hasRole("client")}
              onDataChanged={fetchOrganization}
            />
            <ContactsCard
              organizationId={id}
              contacts={organization.contacts || []}
              canEdit={canEdit}
              onDataChanged={fetchOrganization}
            />
          </div>
        </>
      ) : (
        /* ================ READ-ONLY MODE ================ */
        <>
          {/* Основная информация */}
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 mb-6">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Основная информация</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-sm text-slate-600">
              <p>
                <span className="font-medium">ИНН:</span> {organization.inn || "—"}
              </p>
              <p>
                <span className="font-medium">КПП:</span> {organization.kpp || "—"}
              </p>
              <p>
                <span className="font-medium">Форма:</span> {organization.form || "—"}
              </p>
              <p>
                <span className="font-medium">Статус:</span>{" "}
                {STATUS_LABELS[organization.status] || organization.status}
              </p>
              <p>
                <span className="font-medium">Участок:</span>{" "}
                {organization.section
                  ? `№${organization.section.number} ${organization.section.name || ""}`
                  : "—"}
              </p>
              <p>
                <span className="font-medium">Кол-во сотрудников:</span>{" "}
                {organization.employeeCount ?? "—"}
              </p>
              <p>
                <span className="font-medium">Операций / мес:</span>{" "}
                {organization.opsPerMonth ?? "—"}
              </p>
              <p>
                <span className="font-medium">Касса:</span>{" "}
                {organization.hasCashRegister ? "Да" : "Нет"}
              </p>
              <p className="md:col-span-2 lg:col-span-3">
                <span className="font-medium">Системы налогообложения:</span>{" "}
                {organization.taxSystems?.length > 0
                  ? organization.taxSystems.map((t) => TAX_SYSTEM_LABELS[t] || t).join(", ")
                  : "—"}
              </p>
              <p className="md:col-span-2 lg:col-span-3">
                <span className="font-medium">Юридический адрес:</span>{" "}
                {organization.legalAddress || "—"}
              </p>
            </div>
          </div>

          {/* Бухгалтерская информация */}
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 mb-6">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Бухгалтерская информация</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-sm text-slate-600">
              <p>
                <span className="font-medium">ЭЦП:</span>{" "}
                {DIGITAL_SIGNATURE_LABELS[organization.digitalSignature] || "—"}
              </p>
              <p>
                <span className="font-medium">Срок ЭЦП:</span>{" "}
                {formatDate(organization.digitalSignatureExpiry)}
              </p>
              <p>
                <span className="font-medium">Канал отчётности:</span>{" "}
                {REPORTING_CHANNEL_LABELS[organization.reportingChannel] || "—"}
              </p>
              <p>
                <span className="font-medium">Тип обслуживания:</span>{" "}
                {SERVICE_TYPE_LABELS[organization.serviceType] || "—"}
              </p>
            </div>
          </div>

          {/* Финансовая информация */}
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 mb-6">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Финансовая информация</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-sm text-slate-600">
              <p>
                <span className="font-medium">Ежемесячный платёж:</span>{" "}
                {formatCurrency(organization.monthlyPayment)}
              </p>
              <p>
                <span className="font-medium">Назначение платежа:</span>{" "}
                {organization.paymentDestination || "—"}
              </p>
              <p>
                <span className="font-medium">Сумма задолженности:</span>{" "}
                {formatCurrency(organization.debtAmount)}
              </p>
            </div>
          </div>

          {/* Bank accounts & contacts — read-only */}
          <div className="space-y-6 mb-6">
            <BankAccountsCard
              organizationId={id}
              bankAccounts={organization.bankAccounts || []}
              canEdit={false}
              showLogin={false}
              onDataChanged={fetchOrganization}
            />
            <ContactsCard
              organizationId={id}
              contacts={organization.contacts || []}
              canEdit={false}
              onDataChanged={fetchOrganization}
            />
          </div>
        </>
      )}

      {/* Members */}
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 mt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900">Участники</h2>
          {canEdit && (
            <button
              onClick={openAddMember}
              className="inline-flex items-center gap-1 text-sm text-[#6567F1] hover:text-[#5557E1] font-medium"
            >
              <UserPlus size={16} /> Добавить
            </button>
          )}
        </div>

        {organization.members?.length === 0 ? (
          <p className="text-sm text-slate-400">Нет участников</p>
        ) : (
          <div className="space-y-2">
            {organization.members?.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between p-3 rounded-lg bg-slate-50"
              >
                <div>
                  <span className="text-sm font-medium text-slate-900">
                    {m.user.lastName} {m.user.firstName}
                  </span>
                  <span className="text-sm text-slate-400 ml-2">{m.user.email}</span>
                  <span className="ml-2 bg-[#6567F1]/10 text-[#6567F1] px-2 py-0.5 rounded-full text-xs font-medium">
                    {m.role}
                  </span>
                </div>
                {canEdit && (
                  <button
                    onClick={() => handleRemoveMember(m.user.id)}
                    className="text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Member Modal */}
      {showAddMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Добавить участника</h2>
            <form onSubmit={handleAddMember} className="flex flex-col gap-4">
              {/* User search */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Пользователь *
                </label>
                {selectedUser ? (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[#6567F1]/5 border border-[#6567F1]/20">
                    <div>
                      <span className="text-sm font-medium text-slate-900">
                        {selectedUser.lastName} {selectedUser.firstName}
                      </span>
                      <span className="text-sm text-slate-400 ml-2">{selectedUser.email}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedUser(null);
                        setMemberSearch("");
                      }}
                      className="text-slate-400 hover:text-slate-600 text-xs"
                    >
                      Изменить
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="text"
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      placeholder="Введите имя или email (мин. 2 символа)..."
                      autoFocus
                      className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
                    />
                    {memberSearch.length >= 2 && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto z-10">
                        {searchingUsers ? (
                          <div className="p-3 text-sm text-slate-400">Поиск...</div>
                        ) : memberResults.length === 0 ? (
                          <div className="p-3 text-sm text-slate-400">
                            Пользователи не найдены. Создайте пользователя через API (POST
                            /api/auth/staff).
                          </div>
                        ) : (
                          memberResults.map((u) => (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => {
                                setSelectedUser(u);
                                setMemberSearch("");
                                setMemberResults([]);
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0"
                            >
                              <span className="text-sm font-medium text-slate-900">
                                {u.lastName} {u.firstName}
                              </span>
                              <span className="text-sm text-slate-400 ml-2">{u.email}</span>
                              {u.roles?.length > 0 && (
                                <span className="ml-2 text-xs text-slate-400">
                                  ({u.roles.join(", ")})
                                </span>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Роль</label>
                <input
                  type="text"
                  value={memberRole}
                  onChange={(e) => setMemberRole(e.target.value)}
                  placeholder="client"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#6567F1]/30 focus:border-[#6567F1]"
                />
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
