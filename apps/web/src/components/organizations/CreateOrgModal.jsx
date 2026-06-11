import { useState } from "react";
import { api } from "../../lib/api.js";
import Modal from "../ui/Modal.jsx";

export default function CreateOrgModal({ sections, clientGroups, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [inn, setInn] = useState("");
  const [form, setForm] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [clientGroupId, setClientGroupId] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    if (inn && !/^\d{10,12}$/.test(inn.trim())) {
      setError("ИНН должен содержать 10 или 12 цифр");
      return;
    }
    setCreating(true);
    try {
      const res = await api("/api/organizations", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          inn: inn.trim() || undefined,
          form: form || undefined,
          sectionId: sectionId || undefined,
          clientGroupId: clientGroupId || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create organization");
      }
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Modal onClose={onClose} title="Новая организация">
      <form onSubmit={handleCreate} className="flex flex-col gap-4">
        <div>
          <label className="block text-sm font-medium text-body mb-1">Название *</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-body mb-1">ИНН</label>
          <input
            type="text"
            value={inn}
            onChange={(e) => setInn(e.target.value)}
            className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-body mb-1">Форма собственности</label>
          <select
            value={form}
            onChange={(e) => setForm(e.target.value)}
            className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-surface"
          >
            <option value="">Не указано</option>
            <option value="OOO">ООО</option>
            <option value="IP">ИП</option>
            <option value="NKO">НКО</option>
            <option value="AO">АО</option>
            <option value="PAO">ПАО</option>
          </select>
        </div>
        {sections.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-body mb-1">Участок</label>
            <select
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
              className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-surface"
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
        {clientGroups.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-body mb-1">Группа клиента</label>
            <select
              value={clientGroupId}
              onChange={(e) => setClientGroupId(e.target.value)}
              className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-surface"
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
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 rounded-lg text-sm">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border-2 border-primary/20 text-primary hover:bg-primary/5 rounded-lg text-sm font-medium transition-colors"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={creating}
            className="px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg shadow-lg shadow-[#6567F1]/30 text-sm font-medium transition-all disabled:opacity-50"
          >
            {creating ? "Создание..." : "Создать"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
