const FIELDS = [
  { key: "inn", label: "ИНН", check: (o) => !!o.inn },
  { key: "form", label: "Форма собственности", check: (o) => !!o.form },
  { key: "ogrn", label: "ОГРН", check: (o) => !!o.ogrn },
  { key: "sectionId", label: "Участок", check: (o) => !!o.sectionId },
  {
    key: "taxSystems",
    label: "Система налогообложения",
    check: (o) => (o.taxSystems?.length ?? 0) > 0,
  },
  { key: "legalAddress", label: "Юридический адрес", check: (o) => !!o.legalAddress },
  { key: "digitalSignature", label: "ЭЦП", check: (o) => !!o.digitalSignature },
  { key: "reportingChannel", label: "Канал отчётности", check: (o) => !!o.reportingChannel },
  { key: "serviceType", label: "Тип обслуживания", check: (o) => !!o.serviceType },
  {
    key: "monthlyPayment",
    label: "Ежемесячный платёж",
    check: (o) => o.monthlyPayment != null && o.monthlyPayment !== "",
  },
  {
    key: "paymentDestination",
    label: "Куда поступает платёж",
    check: (o) => !!o.paymentDestination,
  },
  { key: "checkingAccount", label: "Расчётный счёт (Р/С)", check: (o) => !!o.checkingAccount },
  { key: "bik", label: "БИК", check: (o) => !!o.bik },
  {
    key: "correspondentAccount",
    label: "Корр. счёт (К/С)",
    check: (o) => !!o.correspondentAccount,
  },
  { key: "requisitesBank", label: "Банк (реквизиты)", check: (o) => !!o.requisitesBank },
  {
    key: "contacts",
    label: "Контакты (хотя бы один)",
    check: (o) => (o.contacts?.length ?? 0) > 0,
  },
  { key: "members", label: "Участники (клиент)", check: (o) => (o.members?.length ?? 0) > 0 },
];

/**
 * @param {object} org — объект организации из API
 * @returns {{ percent: number, missing: {key: string, label: string}[], filledCount: number, totalCount: number }}
 */
export function calcOrgCompleteness(org) {
  const total = FIELDS.length;
  const missing = FIELDS.filter((f) => !f.check(org));
  const filledCount = total - missing.length;
  const percent = Math.round((filledCount / total) * 100);
  return { percent, missing, filledCount, totalCount: total };
}
