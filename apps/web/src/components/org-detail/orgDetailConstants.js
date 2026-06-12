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
export const DIGITAL_SIGNATURE_LABELS = {
  NONE: "Нет",
  CLIENT: "У клиента",
  US: "У нас",
  MCHD: "МЧД",
};
export const REPORTING_CHANNEL_LABELS = {
  KONTUR: "Контур",
  SBIS: "СБИС",
  ASTRAL: "Астрал",
  ONE_C: "1С",
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
export const ROLE_LABELS = {
  admin: "Администратор",
  supervisor: "Руководитель",
  manager: "Менеджер",
  accountant: "Бухгалтер",
  client: "Клиент",
};
export const ORG_FORM_LABELS = { OOO: "ООО", IP: "ИП", NKO: "НКО", AO: "АО", PAO: "ПАО" };
export const ARCHIVED_STATUSES = ["left", "closed", "ceased"];
export const STATUS_BADGE_COLORS = {
  active: "bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300",
  new: "bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300",
  liquidating: "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300",
  left: "bg-muted text-subtle",
  closed: "bg-muted text-subtle",
  not_paying: "bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300",
  ceased: "bg-muted text-subtle",
  own: "bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300",
  blacklisted: "bg-slate-900 text-white",
};
export const PAYMENT_DESTINATION_LABELS = {
  BANK_TOCHKA: "Банк (Точка)",
  CARD: "Карта",
  CASH: "Наличные",
  UNKNOWN: "Неизвестно",
};
export const PAYMENT_FREQUENCY_LABELS = {
  MONTHLY: "Ежемесячно",
  QUARTERLY: "Ежеквартально",
  SEMI_ANNUAL: "Раз в полгода",
};

export const INPUT_CLS =
  "w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary";
export const SELECT_CLS = `${INPUT_CLS} bg-surface`;
export const LABEL_CLS = "block text-sm font-medium text-body mb-1";

export function toIntOrNull(v) {
  const n = parseInt(v, 10);
  return isNaN(n) || n < 0 ? null : n;
}
export function toDecimalOrNull(v) {
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  return isNaN(n) ? null : s;
}
export function formatCurrency(val) {
  if (val == null) return "—";
  return Number(val).toLocaleString("ru-RU") + " ₽";
}
export function formatDate(val) {
  if (!val) return "—";
  return new Date(val).toLocaleDateString("ru-RU");
}

export const INITIAL_FORM = {
  name: "",
  inn: "",
  ogrn: "",
  kpp: "",
  form: "",
  status: "active",
  sectionId: "",
  clientGroupId: "",
  taxSystems: [],
  employeeCount: "",

  hasCashRegister: false,
  legalAddress: "",
  importantComment: "",
  digitalSignature: "",
  digitalSignatureExpiry: "",
  reportingChannel: "",
  serviceType: "",
  monthlyPayment: "",
  paymentDestination: "",
  paymentFrequency: "MONTHLY",
  serviceStartDate: "",
  debtAmount: "",
  checkingAccount: "",
  bik: "",
  correspondentAccount: "",
  requisitesBank: "",
};

/** Build edit-form state from an organization API payload. */
export function formFromOrg(data) {
  return {
    name: data.name || "",
    inn: data.inn || "",
    ogrn: data.ogrn || "",
    kpp: data.kpp || "",
    form: data.form || "",
    status: data.status || "active",
    sectionId: data.sectionId || "",
    clientGroupId: data.clientGroupId || "",
    taxSystems: data.taxSystems || [],
    employeeCount: data.employeeCount != null ? String(data.employeeCount) : "",

    hasCashRegister: data.hasCashRegister || false,
    legalAddress: data.legalAddress || "",
    importantComment: data.importantComment || "",
    digitalSignature: data.digitalSignature || "",
    digitalSignatureExpiry: data.digitalSignatureExpiry
      ? data.digitalSignatureExpiry.slice(0, 10)
      : "",
    reportingChannel: data.reportingChannel || "",
    serviceType: data.serviceType || "",
    monthlyPayment: data.monthlyPayment != null ? String(data.monthlyPayment) : "",
    paymentDestination: data.paymentDestination || "",
    paymentFrequency: data.paymentFrequency || "MONTHLY",
    serviceStartDate: data.serviceStartDate ? data.serviceStartDate.slice(0, 10) : "",
    debtAmount: data.debtAmount != null ? String(data.debtAmount) : "",
    checkingAccount: data.checkingAccount || "",
    bik: data.bik || "",
    correspondentAccount: data.correspondentAccount || "",
    requisitesBank: data.requisitesBank || "",
  };
}
