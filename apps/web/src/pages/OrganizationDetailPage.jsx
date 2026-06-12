import { useState, useEffect, useCallback } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router";
import { api } from "../lib/api.js";
import { useApi, jsonFetcher } from "../hooks/useApi.js";
import OrgFinanceSection from "../components/OrgFinanceSection.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { ArrowLeft, Pencil, X, Trash2, Link2, Loader2 } from "lucide-react";
import TaskCommentsModal from "../components/TaskCommentsModal.jsx";
import BankAccountsCard from "../components/BankAccountsCard.jsx";
import SystemAccessesCard from "../components/SystemAccessesCard.jsx";
import DocumentsCard from "../components/DocumentsCard.jsx";
import OrgTransactionsCard from "../components/OrgTransactionsCard.jsx";
import OrgEditForm from "../components/org-detail/OrgEditForm.jsx";
import OrgReadView, { Field } from "../components/org-detail/OrgReadView.jsx";
import InviteClientModal from "../components/org-detail/InviteClientModal.jsx";
import AddMemberModal from "../components/org-detail/AddMemberModal.jsx";
import DeleteOrgModal from "../components/org-detail/DeleteOrgModal.jsx";
import OrgOpenTasksBanner from "../components/org-detail/OrgOpenTasksBanner.jsx";
import {
  STATUS_LABELS,
  ORG_FORM_LABELS,
  ARCHIVED_STATUSES,
  STATUS_BADGE_COLORS,
} from "../components/org-detail/orgDetailConstants.js";

export default function OrganizationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission, hasRole } = useAuth();
  const isAdmin = hasRole("admin") || hasRole("supervisor");

  const [organization, setOrganization] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editing, setEditing] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  const [showAddMember, setShowAddMember] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [commentTask, setCommentTask] = useState(null);

  const canEdit = hasPermission("organization", "edit") && organization?._editable !== false;

  const { data: sectionsData } = useApi(
    jsonFetcher(() => api("/api/sections?limit=100")),
    [],
    { enabled: hasPermission("section", "view") },
  );
  const sections = sectionsData?.sections ?? [];

  const { data: clientGroupsData } = useApi(
    jsonFetcher(() => api("/api/client-groups")),
    [],
    { enabled: hasPermission("organization", "view") },
  );
  const clientGroups = Array.isArray(clientGroupsData) ? clientGroupsData : [];

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

  // Tasks for this org (shown in OrgOpenTasksBanner)
  const { data: orgTasksData, refetch: fetchOrgTasks } = useApi(
    jsonFetcher(() => api(`/api/tasks?organizationId=${id}`)),
    [id],
    { enabled: hasPermission("task", "view") },
  );
  const orgTasks = orgTasksData ?? [];

  async function handleSaved() {
    await fetchOrganization();
    setEditing(false);
    setSaveMsg("Сохранено");
    setTimeout(() => setSaveMsg(""), 2000);
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
            <span className="text-sm font-medium mt-0.5 text-green-600 dark:text-green-300">
              {saveMsg}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 -mx-1 sm:mx-0 overflow-x-auto sm:overflow-visible">
          {canEdit && !editing && (
            <button
              onClick={() => setShowInvite(true)}
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
                setEditing(true);
                setSaveMsg("");
              }}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-gradient-to-r from-[#6567F1] to-[#5557E1] hover:from-[#5557E1] hover:to-[#4547D1] text-white rounded-lg text-sm font-medium shadow-md shadow-[#6567F1]/20 transition-all whitespace-nowrap"
              aria-label="Изменить"
            >
              <Pencil size={14} />
              Изменить
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
        <OrgEditForm
          org={org}
          sections={sections}
          clientGroups={clientGroups}
          onSaved={handleSaved}
          onCancel={() => setEditing(false)}
        />
      ) : ARCHIVED_STATUSES.includes(org.status) ? (
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
        <OrgReadView
          org={org}
          canEdit={canEdit}
          onDataChanged={fetchOrganization}
          onAddMemberClick={() => setShowAddMember(true)}
        />
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
        {/* <OrgTicketsCard organizationId={id} /> — компонент в components/org-detail/OrgTicketsCard.jsx, скрыт до релиза тикет-системы */}
      </div>

      {showInvite && (
        <InviteClientModal orgId={id} orgName={org.name} onClose={() => setShowInvite(false)} />
      )}

      {showAddMember && hasRole("admin") && (
        <AddMemberModal
          orgId={id}
          existingMemberIds={new Set(org.members?.map((m) => m.user.id) || [])}
          onClose={() => setShowAddMember(false)}
          onAdded={() => {
            setShowAddMember(false);
            fetchOrganization();
          }}
        />
      )}

      {commentTask && (
        <TaskCommentsModal
          task={commentTask}
          onClose={() => setCommentTask(null)}
          onUpdated={fetchOrgTasks}
        />
      )}

      {showDeleteConfirm && (
        <DeleteOrgModal
          orgId={id}
          orgName={org.name}
          onClose={() => setShowDeleteConfirm(false)}
          onDeleted={() => navigate("/organizations")}
        />
      )}
    </>
  );
}
