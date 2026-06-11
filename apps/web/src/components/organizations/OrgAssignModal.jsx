import { useState } from "react";
import { Search, Loader2, LinkIcon, Unlink } from "lucide-react";
import { api } from "../../lib/api.js";
import { useApi, jsonFetcher } from "../../hooks/useApi.js";
import Modal from "../ui/Modal.jsx";

export default function OrgAssignModal({ group, onClose, onChanged }) {
  const [search, setSearch] = useState("");
  const [working, setWorking] = useState(false); // id орги, над которой идёт запрос
  const [error, setError] = useState("");

  const {
    data,
    loading: loadingOrgs,
    setData,
  } = useApi(
    jsonFetcher(() => api("/api/organizations?limit=500")),
    [],
  );
  const allOrgs = data?.organizations || [];

  const inGroup = allOrgs.filter((o) => o.clientGroup?.id === group.id);
  const q = search.toLowerCase();
  const available = allOrgs.filter(
    (o) =>
      o.clientGroup?.id !== group.id &&
      (o.name.toLowerCase().includes(q) || (o.inn || "").includes(q)),
  );

  function patchOrg(orgId, clientGroup) {
    setData((prev) => ({
      ...prev,
      organizations: (prev?.organizations || []).map((o) =>
        o.id === orgId ? { ...o, clientGroup } : o,
      ),
    }));
  }

  async function assign(orgId) {
    setWorking(orgId);
    setError("");
    try {
      const res = await api(`/api/organizations/${orgId}`, {
        method: "PUT",
        body: JSON.stringify({ clientGroupId: group.id }),
      });
      if (!res.ok) throw new Error("Ошибка");
      patchOrg(orgId, { id: group.id, name: group.name });
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  }

  async function unassign(orgId) {
    setWorking(orgId);
    setError("");
    try {
      const res = await api(`/api/organizations/${orgId}`, {
        method: "PUT",
        body: JSON.stringify({ clientGroupId: null }),
      });
      if (!res.ok) throw new Error("Ошибка");
      patchOrg(orgId, null);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  }

  return (
    <Modal
      onClose={onClose}
      size="lg"
      title={
        <div>
          <h2 className="text-base font-bold text-heading">{group.name}</h2>
          <p className="text-xs text-subtle mt-0.5">Управление организациями группы</p>
        </div>
      }
      bodyClassName="px-6 py-4 space-y-5"
    >
      {error && (
        <div className="p-2 bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 rounded-lg text-xs">
          {error}
        </div>
      )}

      {/* В группе */}
      <div>
        <p className="text-xs font-semibold text-subtle uppercase tracking-wide mb-2">
          В группе ({inGroup.length})
        </p>
        {inGroup.length === 0 ? (
          <p className="text-sm text-subtle">Организаций нет</p>
        ) : (
          <div className="space-y-1">
            {inGroup.map((org) => (
              <div
                key={org.id}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/10"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-heading truncate">{org.name}</div>
                  {org.inn && <div className="text-xs text-subtle">{org.inn}</div>}
                </div>
                <button
                  disabled={working === org.id}
                  onClick={() => unassign(org.id)}
                  className="shrink-0 p-1.5 rounded-lg text-subtle hover:text-red-600 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/15 transition-colors disabled:opacity-40"
                  title="Открепить"
                >
                  {working === org.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Unlink size={14} />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Добавить */}
      <div>
        <p className="text-xs font-semibold text-subtle uppercase tracking-wide mb-2">
          Добавить организацию
        </p>
        <div className="relative mb-2">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию или ИНН..."
            className="w-full pl-8 pr-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
        {loadingOrgs ? (
          <div className="flex justify-center py-6 text-subtle">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : available.length === 0 ? (
          <p className="text-sm text-subtle">
            {search ? "Ничего не найдено" : "Все организации уже в группах"}
          </p>
        ) : (
          <div className="space-y-1 max-h-52 overflow-y-auto">
            {available.map((org) => (
              <div
                key={org.id}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-line hover:border-line hover:bg-canvas transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-heading truncate">{org.name}</div>
                  <div className="text-xs text-subtle">
                    {org.inn || ""}
                    {org.clientGroup && (
                      <span className="ml-2 text-amber-600 dark:text-amber-300">
                        ← {org.clientGroup.name}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  disabled={working === org.id}
                  onClick={() => assign(org.id)}
                  className="shrink-0 p-1.5 rounded-lg text-subtle hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-40"
                  title="Добавить в группу"
                >
                  {working === org.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <LinkIcon size={14} />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
