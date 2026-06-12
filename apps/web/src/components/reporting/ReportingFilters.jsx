import { ChevronLeft, ChevronRight, X, AlertCircle, Search } from "lucide-react";
import {
  FREQUENCY_LABELS,
  FREQUENCY_SHORT,
  FREQUENCY_OPTIONS,
  periodLabel,
} from "./reportingHelpers.js";

export default function ReportingFilters({
  frequency,
  setFrequency,
  year,
  setYear,
  period,
  onPrevPeriod,
  onNextPeriod,
  isAdmin,
  sections,
  sectionFilter,
  setSectionFilter,
  search,
  setSearch,
  onlyProblems,
  setOnlyProblems,
  stats,
  shownCount,
  totalCount,
}) {
  return (
    <div className="bg-surface rounded-2xl shadow-lg border border-line p-3 sm:p-4 mb-4 sm:mb-6">
      <div className="flex flex-wrap items-center gap-2 sm:gap-4">
        {/* Frequency tabs — короткие подписи на мобилке */}
        <div className="flex bg-muted rounded-lg p-0.5">
          {FREQUENCY_OPTIONS.map((f) => (
            <button
              key={f}
              onClick={() => setFrequency(f)}
              className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                frequency === f
                  ? "bg-surface text-primary shadow-sm"
                  : "text-subtle hover:text-body"
              }`}
            >
              <span className="sm:hidden">{FREQUENCY_SHORT[f]}</span>
              <span className="hidden sm:inline">{FREQUENCY_LABELS[f]}</span>
            </button>
          ))}
        </div>

        {/* Period navigation */}
        <div className="flex items-center gap-0.5 sm:gap-1">
          <button
            onClick={onPrevPeriod}
            className="p-2 sm:p-1.5 rounded-lg text-subtle hover:text-body hover:bg-muted transition-colors"
            aria-label="Предыдущий период"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-semibold text-heading min-w-[110px] sm:min-w-[140px] text-center">
            {periodLabel(frequency, period)} {year}
          </div>
          <button
            onClick={onNextPeriod}
            className="p-2 sm:p-1.5 rounded-lg text-subtle hover:text-body hover:bg-muted transition-colors"
            aria-label="Следующий период"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Year quick select */}
        <select
          className="border border-line rounded-lg px-2 sm:px-3 py-1.5 text-xs sm:text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          aria-label="Год"
        >
          {[2024, 2025, 2026, 2027].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>

        {/* Section filter — admin/supervisor only */}
        {isAdmin && sections.length > 1 && (
          <select
            value={sectionFilter}
            onChange={(e) => setSectionFilter(e.target.value)}
            className="border border-line rounded-lg px-2 sm:px-3 py-1.5 text-xs sm:text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30 w-full sm:w-auto"
            aria-label="Участок"
          >
            <option value="">Все участки</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                №{s.number}
                {s.name ? ` — ${s.name}` : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Search + problem filter — для длинных списков организаций */}
      <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-line">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Найти организацию по названию или ИНН..."
            className="w-full pl-9 pr-9 py-2 sm:py-1.5 border border-line rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-subtle hover:text-body"
              aria-label="Очистить поиск"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOnlyProblems((v) => !v)}
          className={`inline-flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium border transition-colors ${
            onlyProblems
              ? "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30"
              : "bg-surface text-body border-line hover:bg-muted"
          }`}
          aria-pressed={onlyProblems}
        >
          <AlertCircle size={14} />
          Только с пропусками
        </button>
      </div>

      {/* Stats badges — отдельной строкой, переносятся */}
      {stats && (
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-3 pt-3 border-t border-line">
          <span className="text-[11px] sm:text-xs px-2 py-1 rounded-full bg-muted text-body">
            Всего: {stats.total}
          </span>
          <span className="text-[11px] sm:text-xs px-2 py-1 rounded-full bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300">
            Принято: {stats.accepted}
          </span>
          <span className="text-[11px] sm:text-xs px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300">
            Сдано: {stats.submitted}
          </span>
          <span className="text-[11px] sm:text-xs px-2 py-1 rounded-full bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300">
            Отклонено: {stats.rejected}
          </span>
          {stats.notSubmitted > 0 && (
            <span className="text-[11px] sm:text-xs px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300">
              Не сдано: {stats.notSubmitted}
            </span>
          )}
          <span className="ml-auto text-[11px] sm:text-xs text-subtle">
            Показано: {shownCount}
            {totalCount > shownCount && ` из ${totalCount}`}
          </span>
        </div>
      )}
    </div>
  );
}
