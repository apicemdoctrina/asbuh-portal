import { X, Save, ChevronDown } from "lucide-react";
import OrgMultiSelect from "./OrgMultiSelect.jsx";
import AssigneeMultiSelect from "./AssigneeMultiSelect.jsx";
import {
  TASK_PRIORITY_LABELS,
  TASK_CATEGORY_LABELS,
  RECURRENCE_OPTIONS,
  INPUT_CLS,
  LABEL_CLS,
} from "./taskConstants.js";

// Модал создания/редактирования задачи.
// Особая разметка (bottom-sheet на мобилке, <form> как контейнер) —
// сознательно НЕ на общем <Modal>.
export default function TaskFormModal({
  editingTask,
  form,
  setForm,
  setField,
  showAdvanced,
  setShowAdvanced,
  users,
  orgs,
  saving,
  formError,
  onSubmit,
  onClose,
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:bg-black/30 sm:p-4">
      <form
        onSubmit={onSubmit}
        className="bg-surface w-full sm:max-w-lg max-h-[92vh] sm:max-h-[90vh] rounded-t-3xl sm:rounded-2xl shadow-2xl border-x border-t sm:border border-line flex flex-col animate-slide-up sm:animate-none"
      >
        {/* Drag handle (mobile only) */}
        <div className="sm:hidden pt-2 pb-1 flex justify-center shrink-0">
          <div className="w-10 h-1 rounded-full bg-line" />
        </div>

        {/* Sticky header */}
        <div className="flex items-center justify-between px-5 pt-2 sm:pt-4 pb-3 border-b border-line shrink-0">
          <h2 className="text-base sm:text-base font-bold text-heading">
            {editingTask ? "Редактировать задачу" : "Новая задача"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-1 rounded-lg text-subtle hover:text-body hover:bg-muted transition-colors"
            aria-label="Закрыть"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div>
            <label className={LABEL_CLS}>Заголовок *</label>
            <input
              type="text"
              autoFocus
              value={form.title}
              onChange={(e) => setField("title", e.target.value)}
              className="w-full px-3 py-3 sm:py-2 border border-line rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-surface"
              placeholder="Например: Сдать отчёт по НДС"
              enterKeyHint="next"
            />
          </div>
          <div>
            <label className={LABEL_CLS}>Описание</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
              className="w-full px-3 py-3 sm:py-2 border border-line rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-surface"
              placeholder="Можно надиктовать голосом"
            />
          </div>

          {/* Mobile: Дедлайн всегда на виду; Подробнее раскрывает остальное */}
          <div className="sm:hidden">
            <label className={LABEL_CLS}>Дедлайн</label>
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => setField("dueDate", e.target.value)}
              className="w-full px-3 py-3 border border-line rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-surface"
            />
          </div>

          {/* Toggle for advanced fields — mobile only */}
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="sm:hidden w-full flex items-center justify-between gap-2 px-3 py-2.5 -mx-1 rounded-lg text-sm font-medium text-primary hover:bg-primary/5 transition-colors"
            aria-expanded={showAdvanced}
          >
            <span>{showAdvanced ? "Свернуть" : "Подробнее"}</span>
            <ChevronDown
              size={16}
              className={`transition-transform ${showAdvanced ? "rotate-180" : ""}`}
            />
          </button>

          {/* Advanced fields — always visible on sm+, behind toggle on mobile */}
          <div className={`${showAdvanced ? "block" : "hidden"} sm:block space-y-3`}>
            <div className="flex items-start gap-2.5 py-0.5">
              <input
                id="visibleToClient"
                type="checkbox"
                checked={form.visibleToClient}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    visibleToClient: e.target.checked,
                    userTouchedVisible: true,
                  }))
                }
                className="mt-0.5 h-5 w-5 sm:h-4 sm:w-4 rounded accent-[#6567F1] cursor-pointer shrink-0"
              />
              <div>
                <label
                  htmlFor="visibleToClient"
                  className="block text-sm font-medium text-body cursor-pointer"
                >
                  Показывать клиенту в ленте
                </label>
                <p className="text-xs text-subtle mt-0.5">
                  После закрытия задача появится у клиента в разделе «Что мы для вас делаем».
                  Заголовок задачи будет показан клиенту дословно — например, «Сдана декларация УСН
                  за Q1».
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL_CLS}>Приоритет</label>
                <select
                  value={form.priority}
                  onChange={(e) => setField("priority", e.target.value)}
                  className="w-full px-3 py-3 sm:py-2 border border-line rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-surface"
                >
                  {Object.entries(TASK_PRIORITY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL_CLS}>Категория</label>
                <select
                  value={form.category}
                  onChange={(e) => {
                    const newCat = e.target.value;
                    setForm((f) => ({
                      ...f,
                      category: newCat,
                      visibleToClient:
                        !editingTask && !f.userTouchedVisible
                          ? newCat === "REPORTING"
                          : f.visibleToClient,
                    }));
                  }}
                  className="w-full px-3 py-3 sm:py-2 border border-line rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-surface"
                >
                  {Object.entries(TASK_CATEGORY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {/* Дедлайн дублируется только для desktop (на мобилке выше) */}
              <div className="hidden sm:block">
                <label className={LABEL_CLS}>Дедлайн</label>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setField("dueDate", e.target.value)}
                  className={INPUT_CLS}
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className={LABEL_CLS}>Повторение</label>
                <select
                  value={form.recurrence}
                  onChange={(e) => setField("recurrence", e.target.value)}
                  className="w-full px-3 py-3 sm:py-2 border border-line rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-surface"
                >
                  {RECURRENCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className={LABEL_CLS}>{editingTask ? "Организация" : "Организации"}</label>
              {editingTask ? (
                <>
                  <select
                    value={form.organizationId}
                    onChange={(e) => {
                      setField("organizationId", e.target.value);
                      setField("assignedToIds", []);
                    }}
                    className="w-full px-3 py-3 sm:py-2 border border-line rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-surface"
                  >
                    <option value="">Без организации</option>
                    {orgs.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                  <div className="mt-2">
                    <label className="block text-xs font-medium text-subtle mb-1">
                      Добавить ещё организации (создаст копии задачи)
                    </label>
                    <OrgMultiSelect
                      options={orgs.filter((o) => o.id !== form.organizationId)}
                      value={form.addOrganizationIds || []}
                      onChange={(ids) => setField("addOrganizationIds", ids)}
                    />
                  </div>
                </>
              ) : (
                <OrgMultiSelect
                  options={orgs}
                  value={form.organizationIds}
                  onChange={(ids) => {
                    setField("organizationIds", ids);
                    setField("assignedToIds", []);
                  }}
                />
              )}
            </div>
            <div>
              <label className={LABEL_CLS}>Исполнители</label>
              <AssigneeMultiSelect
                options={users}
                value={form.assignedToIds}
                onChange={(ids) => setField("assignedToIds", ids)}
              />
            </div>
          </div>

          {formError && (
            <div className="p-3 bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 rounded-lg text-sm">
              {formError}
            </div>
          )}
        </div>

        {/* Sticky footer */}
        <div className="flex gap-2 sm:gap-3 px-5 py-3 border-t border-line bg-surface shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-3 sm:py-2 border-2 border-primary/20 text-primary hover:bg-primary/5 rounded-lg text-sm font-medium transition-colors"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-3 sm:py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg shadow-lg shadow-[#6567F1]/30 text-sm font-medium transition-all disabled:opacity-50"
          >
            <Save size={16} />
            {saving ? "Сохранение..." : "Сохранить"}
          </button>
        </div>
      </form>
    </div>
  );
}
