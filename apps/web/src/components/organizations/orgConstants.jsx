import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import SectionIcon from "../SectionIcon.jsx";
import { fmtMoney } from "../../lib/format.js";

// ─── Labels ───────────────────────────────────────────────────────────────────

export const TAX_SYSTEM_LABELS = {
  USN6: "УСН 6%",
  USN15: "УСН 15%",
  AUSN8: "АУСН 8%",
  AUSN20: "АУСН 20%",
  PSN: "ПСН",
  OSNO: "ОСНО",
  USN_NDS5: "НДС 5%",
  USN_NDS7: "НДС 7%",
  USN_NDS22: "НДС 22%",
};
export const SERVICE_TYPE_LABELS = {
  ZERO: "Нулёвка",
  MINIMAL: "Минимальное",
  FULL: "Полное",
  HR: "Кадры",
  REPORTING: "Отчётность",
  HR_REPORTING: "Кадры+Отчётность",
  PARTIAL: "Частичное",
};
export const REPORTING_CHANNEL_LABELS = { KONTUR: "Контур", SBIS: "СБИС", ASTRAL: "Астрал" };
export const DIGITAL_SIGNATURE_LABELS = { NONE: "Нет", CLIENT: "У клиента", US: "У нас" };
export const ORG_FORM_LABELS = { OOO: "ООО", IP: "ИП", NKO: "НКО", AO: "АО", PAO: "ПАО" };
export const PAYMENT_DEST_LABELS = {
  BANK_TOCHKA: "Банк (Точка)",
  CARD: "Карта",
  CASH: "Наличные",
  UNKNOWN: "Неизвестно",
};

export const PAYMENT_FREQ_LABELS = {
  MONTHLY: "Ежемесячно",
  QUARTERLY: "Ежеквартально",
  SEMI_ANNUAL: "Раз в полгода",
};

// Статусы, для которых «Куда поступает платёж» = прочерк
export const INACTIVE_STATUSES = new Set([
  "not_paying",
  "ceased",
  "left",
  "own",
  "closed",
  "blacklisted",
]);

export const STATUS_LABELS = {
  active: "Активный",
  new: "Новый",
  liquidating: "В процессе ликвидации",
  left: "Ушёл",
  closed: "Закрылся",
  not_paying: "Не платит",
  ceased: "Прекратили сотрудничество",
  own: "Наша организация",
  blacklisted: "Чёрный список",
};

export function statusBadge(status) {
  const map = {
    active: "bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300",
    new: "bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300",
    liquidating: "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300",
    left: "bg-muted text-subtle",
    closed: "bg-muted text-subtle",
    not_paying: "bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300",
    blacklisted: "bg-slate-900 text-white",
  };
  return map[status] || "bg-muted text-subtle";
}

// ─── Column definitions ────────────────────────────────────────────────────────

export const COLUMN_DEFS = [
  { key: "inn", label: "ИНН", editable: true, editType: "text" },
  { key: "form", label: "Форма", editable: true, editType: "select", options: ORG_FORM_LABELS },
  { key: "section", label: "Участок", editable: true, editType: "section" },
  { key: "status", label: "Статус", editable: true, editType: "select", options: STATUS_LABELS },
  {
    key: "taxSystems",
    label: "Система Н/О",
    editable: true,
    editType: "multiselect",
    options: TAX_SYSTEM_LABELS,
  },
  { key: "employeeCount", label: "Сотрудников", editable: true, editType: "number" },
  {
    key: "serviceType",
    label: "Тип обслуживания",
    editable: true,
    editType: "select",
    options: SERVICE_TYPE_LABELS,
  },
  { key: "monthlyPayment", label: "Ежемес. платёж", editable: true, editType: "number" },
  { key: "debtAmount", label: "Задолженность", editable: true, editType: "number" },
  {
    key: "paymentDestination",
    label: "Куда поступает платёж",
    editable: true,
    editType: "select",
    options: PAYMENT_DEST_LABELS,
  },
  {
    key: "paymentFrequency",
    label: "Частота оплаты",
    editable: true,
    editType: "select",
    options: PAYMENT_FREQ_LABELS,
  },
  { key: "serviceStartDate", label: "Начало обслуживания", editable: true, editType: "date" },
  {
    key: "reportingChannel",
    label: "Отчётность",
    editable: true,
    editType: "select",
    options: REPORTING_CHANNEL_LABELS,
  },
  {
    key: "digitalSignature",
    label: "ЭЦП",
    editable: true,
    editType: "select",
    options: DIGITAL_SIGNATURE_LABELS,
  },
  { key: "digitalSignatureExpiry", label: "Срок ЭЦП", editable: true, editType: "date" },
  { key: "hasCashRegister", label: "Касса", editable: true, editType: "boolean" },
  { key: "members", label: "Ответственные" },
];

// Columns that support server-side sorting
export const SORTABLE_COLS = new Set([
  "employeeCount",
  "monthlyPayment",
  "debtAmount",
  "form",
  "serviceType",
  "reportingChannel",
  "digitalSignatureExpiry",
]);

export function SortIcon({ colKey, sortBy, sortOrder }) {
  if (sortBy !== colKey) return <ArrowUpDown size={13} className="ml-1 text-subtle inline-block" />;
  return sortOrder === "asc" ? (
    <ArrowUp size={13} className="ml-1 text-primary inline-block" />
  ) : (
    <ArrowDown size={13} className="ml-1 text-primary inline-block" />
  );
}

export const DEFAULT_COLS = ["inn", "section", "status", "members"];
export const STORAGE_KEY = "org_table_columns_v1";

export function loadCols() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_COLS;
}

export function renderCell(colKey, org) {
  switch (colKey) {
    case "inn":
      return org.inn || "—";
    case "form":
      return ORG_FORM_LABELS[org.form] || "—";
    case "section":
      return org.section ? <SectionIcon section={org.section} showNumber size={14} /> : "—";
    case "taxSystems":
      return org.taxSystems?.length
        ? org.taxSystems.map((k) => TAX_SYSTEM_LABELS[k] || k).join(", ")
        : "—";
    case "employeeCount":
      return org.employeeCount ?? "—";
    case "serviceType":
      return SERVICE_TYPE_LABELS[org.serviceType] || "—";
    case "monthlyPayment":
      return fmtMoney(org.monthlyPayment);
    case "debtAmount":
      return fmtMoney(org.debtAmount);
    case "paymentDestination":
      if (INACTIVE_STATUSES.has(org.status)) return "—";
      return PAYMENT_DEST_LABELS[org.paymentDestination] || "—";
    case "paymentFrequency":
      return PAYMENT_FREQ_LABELS[org.paymentFrequency] || "—";
    case "serviceStartDate":
      return org.serviceStartDate
        ? new Date(org.serviceStartDate).toLocaleDateString("ru-RU")
        : "—";
    case "reportingChannel":
      return REPORTING_CHANNEL_LABELS[org.reportingChannel] || "—";
    case "digitalSignature":
      return DIGITAL_SIGNATURE_LABELS[org.digitalSignature] || "—";
    case "digitalSignatureExpiry": {
      if (!org.digitalSignatureExpiry) return "—";
      const date = new Date(org.digitalSignatureExpiry);
      const daysLeft = Math.ceil((date - Date.now()) / 86400000);
      const label = date.toLocaleDateString("ru-RU");
      if (daysLeft < 0)
        return { __expiry: true, label, cls: "text-red-600 dark:text-red-300 font-medium" };
      if (daysLeft <= 30)
        return {
          __expiry: true,
          label: `${label} (${daysLeft} дн.)`,
          cls: "text-amber-600 dark:text-amber-300 font-medium",
        };
      return { __expiry: true, label, cls: "text-body" };
    }
    case "hasCashRegister":
      return org.hasCashRegister ? "Да" : "Нет";
    case "members":
      return org.members?.length
        ? org.members.map((m) => `${m.user.lastName} ${m.user.firstName[0]}.`).join(", ")
        : "—";
    default:
      return "—";
  }
}

// Цветовая палитра по статусу: акцент слева, aurora-блик, рамка
export const STATUS_ACCENT = {
  active: {
    bar: "linear-gradient(180deg, #10b981 0%, #06b6d4 100%)",
    aurora: "#10b981",
    ring: "rgba(16,185,129,0.45)",
    nameGrad: "linear-gradient(90deg, #6567F1, #06b6d4)",
  },
  new: {
    bar: "linear-gradient(180deg, #06b6d4 0%, #6567F1 100%)",
    aurora: "#06b6d4",
    ring: "rgba(6,182,212,0.45)",
    nameGrad: "linear-gradient(90deg, #6567F1, #06b6d4)",
  },
  liquidating: {
    bar: "linear-gradient(180deg, #fbbf24 0%, #f59e0b 100%)",
    aurora: "#fbbf24",
    ring: "rgba(245,158,11,0.45)",
    nameGrad: "linear-gradient(90deg, #a855f7, #f59e0b)",
  },
  not_paying: {
    bar: "linear-gradient(180deg, #fb7185 0%, #ef4444 100%)",
    aurora: "#fb7185",
    ring: "rgba(239,68,68,0.45)",
    nameGrad: "linear-gradient(90deg, #ef4444, #a855f7)",
  },
  blacklisted: {
    bar: "linear-gradient(180deg, #475569 0%, #1e293b 100%)",
    aurora: "#64748b",
    ring: "rgba(71,85,105,0.45)",
    nameGrad: "linear-gradient(90deg, #64748b, #1e293b)",
  },
  left: {
    bar: "linear-gradient(180deg, #94a3b8 0%, #64748b 100%)",
    aurora: "#94a3b8",
    ring: "rgba(148,163,184,0.35)",
    nameGrad: "linear-gradient(90deg, #94a3b8, #64748b)",
  },
};
STATUS_ACCENT.closed = STATUS_ACCENT.left;
STATUS_ACCENT.ceased = STATUS_ACCENT.left;
STATUS_ACCENT.own = {
  bar: "linear-gradient(180deg, #a855f7 0%, #6567F1 100%)",
  aurora: "#a855f7",
  ring: "rgba(168,85,247,0.45)",
  nameGrad: "linear-gradient(90deg, #a855f7, #6567F1)",
};
