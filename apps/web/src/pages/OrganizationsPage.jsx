import { useState, useEffect, useCallback } from "react";
import { useDebouncedEffect } from "../hooks/useDebouncedEffect.js";
import { Link } from "react-router";
import { api } from "../lib/api.js";
import { fmtMoney } from "../lib/format.js";
import { useAuth } from "../context/AuthContext.jsx";
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
  UserCheck,
  UserMinus,
  Loader2,
  Layers,
  Settings2,
  Banknote,
} from "lucide-react";
import {
  TAX_SYSTEM_LABELS,
  PAYMENT_DEST_LABELS,
  INACTIVE_STATUSES,
  STATUS_LABELS,
  COLUMN_DEFS,
  SORTABLE_COLS,
  SortIcon,
  STORAGE_KEY,
  loadCols,
  renderCell,
  statusBadge,
} from "../components/organizations/orgConstants.jsx";
import InlineEditor from "../components/organizations/InlineEditor.jsx";
import ColumnPicker from "../components/organizations/ColumnPicker.jsx";
import BulkModal from "../components/organizations/BulkModal.jsx";
import ManageGroupsModal from "../components/organizations/ManageGroupsModal.jsx";
import CreateOrgModal from "../components/organizations/CreateOrgModal.jsx";
import GroupedView from "../components/organizations/GroupedView.jsx";
import FiltersPanel from "../components/organizations/FiltersPanel.jsx";
import MobileOrgCard from "../components/organizations/MobileOrgCard.jsx";

export default function OrganizationsPage() {
  const { hasPermission, hasRole } = useAuth();
  const [organizations, setOrganizations] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [archiveMode, setArchiveMode] = useState(false);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [visibleCols, setVisibleCols] = useState(loadCols);
  const [taxSystem, setTaxSystem] = useState("");
  const [sortBy, setSortBy] = useState("");
  const [sortOrder, setSortOrder] = useState("asc");

  const [paymentDestFilter, setPaymentDestFilter] = useState("");

  const [clientGroups, setClientGroups] = useState([]);
  const [clientGroupFilter, setClientGroupFilter] = useState("");
  const [groupByClient, setGroupByClient] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [showManageGroups, setShowManageGroups] = useState(false);

  function handleColsChange(next) {
    setVisibleCols(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  // Inline editing state: { orgId, colKey } or null
  const [editingCell, setEditingCell] = useState(null);

  const handleInlineSave = useCallback(
    async (orgId, fieldKey, value) => {
      try {
        const res = await api(`/api/organizations/${orgId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [fieldKey]: value }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          alert(err.error || "Ошибка сохранения");
          return;
        }
        // Update local state
        setOrganizations((prev) =>
          prev.map((o) => {
            if (o.id !== orgId) return o;
            if (fieldKey === "sectionId") {
              const sec = sections.find((s) => s.id === value);
              return { ...o, section: sec || null, sectionId: value };
            }
            return { ...o, [fieldKey]: value };
          }),
        );
      } catch {
        alert("Ошибка сохранения");
      } finally {
        setEditingCell(null);
      }
    },
    [sections],
  );

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkModal, setBulkModal] = useState(null); // "assign" | "remove" | null

  const [showCreate, setShowCreate] = useState(false);

  const limit = 50;

  useEffect(() => {
    if (hasPermission("section", "view")) {
      api("/api/sections?limit=100")
        .then((res) => (res.ok ? res.json() : { sections: [] }))
        .then((data) => setSections(data.sections || []))
        .catch(() => {});
    }
  }, [hasPermission]);

  const fetchClientGroups = useCallback(() => {
    if (!hasPermission("organization", "view")) return;
    api("/api/client-groups")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setClientGroups(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [hasPermission]);

  useEffect(() => {
    fetchClientGroups();
  }, [fetchClientGroups]);

  function handleSort(field) {
    if (sortBy === field) {
      if (sortOrder === "asc") {
        setSortOrder("desc");
      } else {
        setSortBy("");
        setSortOrder("asc");
      }
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
    setPage(1);
  }

  const fetchOrganizations = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      if (taxSystem) params.set("taxSystem", taxSystem);
      if (sortBy) {
        params.set("sortBy", sortBy);
        params.set("sortOrder", sortOrder);
      }
      if (archiveMode) {
        params.set("archived", "true");
      } else {
        if (statusFilter) params.set("status", statusFilter);
        if (sectionId) params.set("sectionId", sectionId);
        if (clientGroupFilter) params.set("clientGroupId", clientGroupFilter);
        if (paymentDestFilter) params.set("paymentDestination", paymentDestFilter);
      }
      const res = await api(`/api/organizations?${params}`);
      if (!res.ok) throw new Error("Failed to load organizations");
      const data = await res.json();
      setOrganizations(data.organizations);
      setTotal(data.total);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [
    page,
    search,
    taxSystem,
    sortBy,
    sortOrder,
    statusFilter,
    sectionId,
    archiveMode,
    clientGroupFilter,
    paymentDestFilter,
  ]);

  useDebouncedEffect(fetchOrganizations, [fetchOrganizations]);

  const totalPages = Math.ceil(total / limit);

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-heading">Организации</h1>
        <div className="flex items-center gap-2">
          {(hasRole("manager") || hasRole("accountant")) && (
            <Link
              to="/my-payments"
              className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 border-2 border-primary/20 text-primary rounded-lg text-sm font-medium hover:bg-primary/5 transition-colors whitespace-nowrap"
            >
              <Banknote size={16} />
              <span className="hidden sm:inline">Оплаты</span>
            </Link>
          )}
          {hasPermission("organization", "create") && !archiveMode && (
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg shadow-lg shadow-[#6567F1]/30 text-sm font-medium transition-all whitespace-nowrap"
            >
              <Plus size={16} />
              <span className="hidden sm:inline">Создать организацию</span>
              <span className="sm:hidden">Создать</span>
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <FiltersPanel>
        <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
            <input
              type="text"
              placeholder="Поиск по названию или ИНН..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full sm:w-72 pl-9 pr-4 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          {!archiveMode && (
            <div className="relative">
              <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="pl-9 pr-4 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-surface"
              >
                <option value="">Все статусы</option>
                {Object.entries(STATUS_LABELS)
                  .filter(([k]) => k !== "left" && k !== "closed" && k !== "ceased")
                  .map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
              </select>
            </div>
          )}
          {!archiveMode && (
            <select
              value={taxSystem}
              onChange={(e) => {
                setTaxSystem(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-surface"
            >
              <option value="">Все системы Н/О</option>
              {Object.entries(TAX_SYSTEM_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          )}
          <select
            value={archiveMode ? "__archive__" : sectionId}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "__archive__") {
                setArchiveMode(true);
                setSectionId("");
                setStatusFilter("");
              } else {
                setArchiveMode(false);
                setSectionId(v);
              }
              setPage(1);
            }}
            className="px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-surface"
          >
            <option value="">Все участки</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                №{s.number} {s.name || ""}
              </option>
            ))}
            <option value="__archive__">Архив</option>
          </select>

          {!archiveMode && clientGroups.length > 0 && (
            <select
              value={clientGroupFilter}
              onChange={(e) => {
                setClientGroupFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-surface"
            >
              <option value="">Все клиенты</option>
              {clientGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
          {!archiveMode && (
            <select
              value={paymentDestFilter}
              onChange={(e) => {
                setPaymentDestFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-surface"
            >
              <option value="">Все платежи</option>
              {Object.entries(PAYMENT_DEST_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          )}
          {!archiveMode && hasPermission("organization", "create") && (
            <button
              onClick={() => setShowManageGroups(true)}
              className="inline-flex items-center gap-2 px-3 py-2 border border-line text-body hover:bg-canvas rounded-lg text-sm font-medium transition-colors"
              title="Управление группами клиентов"
            >
              <Settings2 size={15} />
              Группы
            </button>
          )}

          <div className="sm:ml-auto flex items-center gap-2">
            {!archiveMode && clientGroups.length > 0 && (
              <button
                onClick={() => setGroupByClient((v) => !v)}
                className={`inline-flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium transition-colors ${
                  groupByClient
                    ? "border-primary text-primary bg-primary/5"
                    : "border-line text-body hover:bg-canvas"
                }`}
              >
                <Layers size={15} />
                По клиентам
              </button>
            )}
            <ColumnPicker visibleCols={visibleCols} onChange={handleColsChange} />
          </div>
        </div>
      </FiltersPanel>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 rounded-lg text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-subtle">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : organizations.length === 0 ? (
        <div className="text-subtle text-sm">Организации не найдены</div>
      ) : groupByClient ? (
        <GroupedView
          organizations={organizations}
          clientGroups={clientGroups}
          visibleCols={visibleCols}
          expandedGroups={expandedGroups}
          setExpandedGroups={setExpandedGroups}
          page={page}
          limit={limit}
          total={total}
          totalPages={Math.ceil(total / limit)}
          setPage={setPage}
        />
      ) : (
        <>
          {/* Mobile: card list */}
          <div className="lg:hidden space-y-2">
            {organizations.map((org, i) => (
              <MobileOrgCard
                key={org.id}
                org={org}
                index={(page - 1) * limit + i + 1}
                isSelected={selectedIds.has(org.id)}
                canSelect={hasRole("admin")}
                onToggleSelect={() =>
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(org.id)) next.delete(org.id);
                    else next.add(org.id);
                    return next;
                  })
                }
              />
            ))}
          </div>

          {/* Desktop: full table */}
          <div className="hidden lg:block bg-surface rounded-2xl shadow-lg border border-line overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas/50">
                  {hasRole("admin") && (
                    <th className="pl-4 pr-2 py-3 w-8">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded border-line text-primary focus:ring-primary/30"
                        checked={
                          organizations.length > 0 &&
                          organizations.every((o) => selectedIds.has(o.id))
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              organizations.forEach((o) => next.add(o.id));
                              return next;
                            });
                          } else {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              organizations.forEach((o) => next.delete(o.id));
                              return next;
                            });
                          }
                        }}
                      />
                    </th>
                  )}
                  <th className="px-4 py-3 font-medium text-subtle whitespace-nowrap text-right w-10">
                    №
                  </th>
                  <th
                    className="text-left px-4 py-3 font-medium text-subtle whitespace-nowrap cursor-pointer select-none hover:text-body"
                    onClick={() => handleSort("name")}
                  >
                    Название
                    <SortIcon colKey="name" sortBy={sortBy} sortOrder={sortOrder} />
                  </th>
                  {COLUMN_DEFS.filter((c) => visibleCols.includes(c.key)).map((col) => (
                    <th
                      key={col.key}
                      className={`text-left px-4 py-3 font-medium text-subtle whitespace-nowrap ${SORTABLE_COLS.has(col.key) ? "cursor-pointer select-none hover:text-body" : ""}`}
                      onClick={SORTABLE_COLS.has(col.key) ? () => handleSort(col.key) : undefined}
                    >
                      {col.label}
                      {SORTABLE_COLS.has(col.key) && (
                        <SortIcon colKey={col.key} sortBy={sortBy} sortOrder={sortOrder} />
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {organizations.map((org, i) => (
                  <tr
                    key={org.id}
                    className={`border-b border-line hover:bg-canvas/50 ${selectedIds.has(org.id) ? "bg-primary/5" : ""}`}
                  >
                    {hasRole("admin") && (
                      <td className="pl-4 pr-2 py-3">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-line text-primary focus:ring-primary/30"
                          checked={selectedIds.has(org.id)}
                          onChange={(e) => {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(org.id);
                              else next.delete(org.id);
                              return next;
                            });
                          }}
                        />
                      </td>
                    )}
                    <td className="px-4 py-3 text-subtle text-sm text-right tabular-nums whitespace-nowrap">
                      {(page - 1) * limit + i + 1}
                    </td>
                    <td className="px-4 py-3 font-medium text-heading whitespace-nowrap">
                      <Link
                        to={`/organizations/${org.id}`}
                        className="text-primary hover:underline"
                      >
                        {org.name}
                      </Link>
                      {org.clientGroup && (
                        <Link
                          to={`/client-groups/${org.clientGroup.id}`}
                          className="ml-2 text-xs text-subtle hover:text-primary"
                        >
                          {org.clientGroup.name}
                        </Link>
                      )}
                    </td>
                    {COLUMN_DEFS.filter((c) => visibleCols.includes(c.key)).map((col) => {
                      const isEditing =
                        editingCell?.orgId === org.id && editingCell?.colKey === col.key;
                      const canEdit =
                        col.editable &&
                        hasPermission("organization", "edit") &&
                        !(col.key === "paymentDestination" && INACTIVE_STATUSES.has(org.status));
                      return (
                        <td
                          key={col.key}
                          className={`px-4 py-3 text-body whitespace-nowrap ${canEdit && !isEditing ? "cursor-pointer hover:bg-primary/5 transition-colors" : ""}`}
                          onDoubleClick={
                            canEdit && !isEditing
                              ? () => setEditingCell({ orgId: org.id, colKey: col.key })
                              : undefined
                          }
                        >
                          {isEditing ? (
                            <InlineEditor
                              col={col}
                              org={org}
                              sections={sections}
                              onSave={(fieldKey, value) =>
                                handleInlineSave(org.id, fieldKey, value)
                              }
                              onCancel={() => setEditingCell(null)}
                            />
                          ) : col.key === "status" ? (
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(org.status)}`}
                            >
                              {STATUS_LABELS[org.status] || org.status}
                            </span>
                          ) : col.key === "debtAmount" && org.debtAmount > 0 ? (
                            <span className="text-red-600 dark:text-red-300 font-medium">
                              {fmtMoney(org.debtAmount)}
                            </span>
                          ) : col.key === "debtAmount" &&
                            org.debtAmount === 0 &&
                            org.clientGroup ? (
                            <Link
                              to={`/client-groups/${org.clientGroup.id}`}
                              className="text-xs text-primary hover:underline"
                            >
                              → группа
                            </Link>
                          ) : (
                            (() => {
                              const val = renderCell(col.key, org);
                              if (val?.__expiry)
                                return <span className={val.cls}>{val.label}</span>;
                              return val;
                            })()
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-subtle">
                Показано {(page - 1) * limit + 1}–{Math.min(page * limit, total)} из {total}
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="p-2 rounded-lg border border-line text-body hover:bg-canvas disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm text-body">
                  {page} / {totalPages}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                  className="p-2 rounded-lg border border-line text-body hover:bg-canvas disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-4 sm:bottom-6 left-2 right-2 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-40 flex items-center justify-between sm:justify-start gap-2 sm:gap-3 px-3 sm:px-5 py-2.5 sm:py-3 bg-surface rounded-2xl shadow-xl border border-line">
          <span className="text-sm font-medium text-body whitespace-nowrap">
            <span className="hidden sm:inline">Выбрано: </span>
            <span className="text-primary font-bold">{selectedIds.size}</span>
          </span>
          <div className="hidden sm:block w-px h-5 bg-line" />
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setBulkModal("assign")}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg text-sm font-medium transition-all shadow-md shadow-[#6567F1]/30"
              aria-label="Назначить"
            >
              <UserCheck size={15} />
              <span className="hidden sm:inline">Назначить</span>
            </button>
            <button
              onClick={() => setBulkModal("remove")}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/15 rounded-lg text-sm font-medium transition-colors"
              aria-label="Снять"
            >
              <UserMinus size={15} />
              <span className="hidden sm:inline">Снять</span>
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 border-2 border-primary/20 text-primary hover:bg-primary/5 rounded-lg text-sm font-medium transition-colors"
              aria-label="Снять выделение"
            >
              <X size={14} />
              <span className="hidden sm:inline">Снять выделение</span>
            </button>
          </div>
        </div>
      )}

      {/* Bulk modal */}
      {bulkModal && (
        <BulkModal
          mode={bulkModal}
          selectedIds={selectedIds}
          onClose={() => setBulkModal(null)}
          onSuccess={() => {
            setBulkModal(null);
            setSelectedIds(new Set());
            fetchOrganizations();
          }}
        />
      )}

      {/* Manage groups modal */}
      {showManageGroups && (
        <ManageGroupsModal
          groups={clientGroups}
          onClose={() => setShowManageGroups(false)}
          onChanged={() => {
            fetchClientGroups();
            fetchOrganizations();
          }}
        />
      )}

      {/* Create Modal */}
      {showCreate && (
        <CreateOrgModal
          sections={sections}
          clientGroups={clientGroups}
          onClose={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false);
            setPage(1);
            await fetchOrganizations();
          }}
        />
      )}
    </>
  );
}
