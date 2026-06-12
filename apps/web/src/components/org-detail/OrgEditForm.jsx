import { useState } from "react";
import { Save, X } from "lucide-react";
import { api } from "../../lib/api.js";
import {
  TAX_SYSTEM_LABELS,
  DIGITAL_SIGNATURE_LABELS,
  REPORTING_CHANNEL_LABELS,
  SERVICE_TYPE_LABELS,
  STATUS_LABELS,
  ARCHIVED_STATUSES,
  INPUT_CLS,
  SELECT_CLS,
  LABEL_CLS,
  toIntOrNull,
  toDecimalOrNull,
  formFromOrg,
} from "./orgDetailConstants.js";

/** Full-page edit mode for the organization card. Owns its form state. */
export default function OrgEditForm({ org, sections, clientGroups, onSaved, onCancel }) {
  const [form, setForm] = useState(() => formFromOrg(org));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

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
    setError("");
    try {
      const res = await api(`/api/organizations/${org.id}`, {
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
      await onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
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

      {error && <div className="text-sm text-red-600 dark:text-red-300 font-medium">{error}</div>}

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
          onClick={onCancel}
          className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 border-2 border-line text-body hover:bg-canvas rounded-lg text-sm font-medium transition-colors"
        >
          <X size={16} />
          Отмена
        </button>
      </div>
    </form>
  );
}
