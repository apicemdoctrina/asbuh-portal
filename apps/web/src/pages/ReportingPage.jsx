import { useState, useEffect } from "react";
import { api } from "../lib/api.js";
import { useApi, jsonFetcher } from "../hooks/useApi.js";
import { useAuth } from "../context/AuthContext.jsx";
import { Loader2, Settings, X, FileSpreadsheet } from "lucide-react";
import {
  FREQUENCY_LABELS,
  getPeriods,
  getCurrentPeriod,
} from "../components/reporting/reportingHelpers.js";
import ReportTypesModal from "../components/reporting/ReportTypesModal.jsx";
import ReportingFilters from "../components/reporting/ReportingFilters.jsx";
import ReportingMobileCards from "../components/reporting/ReportingMobileCards.jsx";
import ReportingMatrixTable from "../components/reporting/ReportingMatrixTable.jsx";

export default function ReportingPage() {
  const { hasPermission, hasRole } = useAuth();
  const canEdit = hasPermission("reporting", "edit");
  const isAdmin = hasRole("admin") || hasRole("supervisor");

  const [frequency, setFrequency] = useState("QUARTERLY");
  const [year, setYear] = useState(new Date().getFullYear());
  const [period, setPeriod] = useState(getCurrentPeriod("QUARTERLY"));

  const [showTypes, setShowTypes] = useState(false);
  const [sectionFilter, setSectionFilter] = useState("");
  const [search, setSearch] = useState("");
  const [onlyProblems, setOnlyProblems] = useState(false);

  const periods = getPeriods(frequency);

  const {
    data,
    loading,
    refetch: fetchMatrix,
    setData,
  } = useApi(
    jsonFetcher(() =>
      api(`/api/reporting/matrix?year=${year}&period=${period}&frequency=${frequency}`),
    ),
    [year, period, frequency],
  );

  // When frequency changes, reset period to current
  useEffect(() => {
    setPeriod(getCurrentPeriod(frequency));
  }, [frequency]);

  function handleEntryUpdate(orgId, rtId, updated) {
    setData((prev) => ({
      ...prev,
      entries: { ...prev.entries, [`${orgId}_${rtId}`]: updated },
    }));
  }

  function handlePrevPeriod() {
    if (frequency === "YEARLY") {
      setYear((y) => y - 1);
    } else {
      const min = periods[0];
      if (period <= min) {
        setPeriod(periods[periods.length - 1]);
        setYear((y) => y - 1);
      } else {
        setPeriod((p) => p - 1);
      }
    }
  }

  function handleNextPeriod() {
    if (frequency === "YEARLY") {
      setYear((y) => y + 1);
    } else {
      const max = periods[periods.length - 1];
      if (period >= max) {
        setPeriod(periods[0]);
        setYear((y) => y + 1);
      } else {
        setPeriod((p) => p + 1);
      }
    }
  }

  // Unique sections from orgs
  const sections = data
    ? (() => {
        const map = new Map();
        data.organizations?.forEach((o) => {
          if (o.section && !map.has(o.section.id)) map.set(o.section.id, o.section);
        });
        return [...map.values()].sort((a, b) => a.number - b.number);
      })()
    : [];

  // Filter organizations by section, search query, and "only problems"
  const searchNorm = search.trim().toLowerCase();
  const filteredOrgs = (() => {
    let list =
      data?.organizations?.filter((o) => !sectionFilter || o.section?.id === sectionFilter) ?? [];
    if (searchNorm) {
      list = list.filter((o) => {
        const name = (o.name || "").toLowerCase();
        const inn = (o.inn || "").toLowerCase();
        return name.includes(searchNorm) || inn.includes(searchNorm);
      });
    }
    if (onlyProblems && data) {
      list = list.filter((o) => {
        for (const rt of data.reportTypes || []) {
          const key = `${o.id}_${rt.id}`;
          const applicable = data.applicability?.[key] !== false;
          if (!applicable) continue;
          const status = data.entries[key]?.status || "NOT_SUBMITTED";
          if (status === "NOT_SUBMITTED" || status === "REJECTED") return true;
        }
        return false;
      });
    }
    return list;
  })();

  // Stats (based on filtered orgs)
  const stats = data
    ? (() => {
        const orgIds = new Set(filteredOrgs.map((o) => o.id));
        const entries = Object.values(data.entries).filter((e) => orgIds.has(e.organizationId));
        // Count only applicable cells
        let applicableCount = 0;
        for (const org of filteredOrgs) {
          for (const rt of data.reportTypes || []) {
            if (data.applicability?.[`${org.id}_${rt.id}`] !== false) applicableCount++;
          }
        }
        const submitted = entries.filter((e) => e.status === "SUBMITTED").length;
        const accepted = entries.filter((e) => e.status === "ACCEPTED").length;
        const rejected = entries.filter((e) => e.status === "REJECTED").length;
        const notSubmitted = applicableCount - submitted - accepted - rejected;
        return { total: applicableCount, submitted, accepted, rejected, notSubmitted };
      })()
    : null;

  return (
    <div>
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-heading">Трекер отчётности</h1>
          <p className="text-xs sm:text-sm text-subtle mt-0.5 sm:mt-1">
            Контроль сдачи отчётов по организациям
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowTypes(true)}
            className="self-start flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 border-primary/20 text-primary text-sm font-medium hover:bg-primary/5 transition-colors"
          >
            <Settings size={16} />
            Типы отчётов
          </button>
        )}
      </div>

      {/* Filters bar */}
      <ReportingFilters
        frequency={frequency}
        setFrequency={setFrequency}
        year={year}
        setYear={setYear}
        period={period}
        onPrevPeriod={handlePrevPeriod}
        onNextPeriod={handleNextPeriod}
        isAdmin={isAdmin}
        sections={sections}
        sectionFilter={sectionFilter}
        setSectionFilter={setSectionFilter}
        search={search}
        setSearch={setSearch}
        onlyProblems={onlyProblems}
        setOnlyProblems={setOnlyProblems}
        stats={stats}
        shownCount={filteredOrgs.length}
        totalCount={data?.organizations?.length}
      />

      {/* Matrix table */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-subtle">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : !data || filteredOrgs.length === 0 ? (
        <div className="bg-surface rounded-2xl shadow-lg border border-line p-8 sm:p-12 text-center">
          <FileSpreadsheet size={48} className="mx-auto text-subtle mb-4" />
          <h3 className="text-lg font-semibold text-body mb-1">
            {search || onlyProblems ? "Ничего не найдено" : "Нет организаций"}
          </h3>
          <p className="text-sm text-subtle">
            {search || onlyProblems
              ? "Попробуйте изменить запрос или снять фильтр"
              : "Для выбранного периода нет доступных организаций"}
          </p>
          {(search || onlyProblems) && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setOnlyProblems(false);
              }}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm text-primary border-2 border-primary/20 hover:bg-primary/5 transition-colors"
            >
              <X size={14} />
              Сбросить фильтры
            </button>
          )}
        </div>
      ) : data.reportTypes?.length === 0 ? (
        <div className="bg-surface rounded-2xl shadow-lg border border-line p-12 text-center">
          <FileSpreadsheet size={48} className="mx-auto text-subtle mb-4" />
          <h3 className="text-lg font-semibold text-body mb-1">Нет типов отчётов</h3>
          <p className="text-sm text-subtle">
            Добавьте типы отчётов с частотой &laquo;{FREQUENCY_LABELS[frequency]}&raquo;
          </p>
        </div>
      ) : (
        <>
          {/* Mobile: card-per-org */}
          <ReportingMobileCards
            orgs={filteredOrgs}
            data={data}
            canEdit={canEdit}
            onUpdate={handleEntryUpdate}
          />

          {/* Desktop / tablet: matrix table */}
          <ReportingMatrixTable
            orgs={filteredOrgs}
            data={data}
            canEdit={canEdit}
            onUpdate={handleEntryUpdate}
          />
        </>
      )}

      {/* Report Types Manager */}
      {showTypes && <ReportTypesModal onClose={() => setShowTypes(false)} onSaved={fetchMatrix} />}
    </div>
  );
}
