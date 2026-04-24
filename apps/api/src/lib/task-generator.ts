/**
 * Rule-based task generator.
 * Given organization parameters, returns a list of task templates
 * that should be created for that organization.
 */

export type TaskTemplate = {
  title: string;
  description?: string;
  category: "REPORTING" | "PAYMENT" | "DOCUMENTS" | "OTHER";
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  dueDate: Date | null;
  recurrenceType: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" | null;
  recurrenceInterval: number;
  visibleToClient: boolean;
};

type OrgParams = {
  form: string | null;
  taxSystems: string[];
  employeeCount: number | null;
  hasCashRegister: boolean;
  digitalSignature: string | null;
  digitalSignatureExpiry: Date | null;
  serviceType: string | null;
};

/** Next quarterly deadline: 25th of month after each quarter end */
function nextQuarterDeadline(from: Date): Date {
  const y = from.getFullYear();
  const candidates = [
    new Date(y, 3, 25), // April 25
    new Date(y, 6, 25), // July 25
    new Date(y, 9, 25), // October 25
    new Date(y + 1, 0, 25), // January 25 next year
  ];
  return candidates.find((d) => d > from) ?? new Date(y + 1, 3, 25);
}

/** N-th day of next month */
function nextMonthDay(from: Date, day: number): Date {
  return new Date(from.getFullYear(), from.getMonth() + 1, day);
}

export function generateTaskTemplates(org: OrgParams): TaskTemplate[] {
  const tasks: TaskTemplate[] = [];
  const now = new Date();
  const nextQ = nextQuarterDeadline(now);

  const hasUSN = org.taxSystems.some((t) => ["USN6", "USN15"].includes(t));
  const hasUSN_NDS = org.taxSystems.some((t) => ["USN_NDS5", "USN_NDS7", "USN_NDS22"].includes(t));
  const hasOSNO = org.taxSystems.includes("OSNO");
  const hasAUSN = org.taxSystems.some((t) => ["AUSN8", "AUSN20"].includes(t));
  const hasPSN = org.taxSystems.includes("PSN");
  const hasEmployees = (org.employeeCount ?? 0) > 0;
  const hasHR = ["FULL", "HR", "HR_REPORTING"].includes(org.serviceType ?? "");

  // ── Первичные документы (все организации) ────────────────────────────
  tasks.push({
    title: "Запросить первичные документы",
    description: "Накладные, акты, счета-фактуры за прошлый месяц.",
    category: "DOCUMENTS",
    priority: "MEDIUM",
    dueDate: nextMonthDay(now, 5),
    recurrenceType: "MONTHLY",
    recurrenceInterval: 1,
  });

  // ── УСН ──────────────────────────────────────────────────────────────
  if (hasUSN) {
    tasks.push({
      title: "Уплатить авансовый платёж по УСН",
      description: "25-е число месяца, следующего за отчётным кварталом.",
      category: "PAYMENT",
      priority: "HIGH",
      dueDate: nextQ,
      recurrenceType: "MONTHLY",
      recurrenceInterval: 3,
    });

    // Annual declaration date: March 28 (ООО/НКО), April 28 (ИП)
    const declYear = now.getMonth() >= 3 ? now.getFullYear() + 1 : now.getFullYear();
    const declDate = org.form === "IP" ? new Date(declYear, 3, 28) : new Date(declYear, 2, 28);

    tasks.push({
      title: "Сдать декларацию по УСН",
      category: "REPORTING",
      priority: "HIGH",
      dueDate: declDate,
      recurrenceType: "YEARLY",
      recurrenceInterval: 1,
    });
  }

  // ── УСН+НДС ──────────────────────────────────────────────────────────
  if (hasUSN_NDS) {
    tasks.push({
      title: "Сдать декларацию по НДС (УСН+НДС)",
      category: "REPORTING",
      priority: "URGENT",
      dueDate: nextQ,
      recurrenceType: "MONTHLY",
      recurrenceInterval: 3,
    });
  }

  // ── ОСНО ─────────────────────────────────────────────────────────────
  if (hasOSNO) {
    tasks.push({
      title: "Сдать декларацию по НДС",
      category: "REPORTING",
      priority: "URGENT",
      dueDate: nextQ,
      recurrenceType: "MONTHLY",
      recurrenceInterval: 3,
    });
    tasks.push({
      title: "Сдать декларацию по налогу на прибыль",
      category: "REPORTING",
      priority: "HIGH",
      dueDate: nextQ,
      recurrenceType: "MONTHLY",
      recurrenceInterval: 3,
    });
    tasks.push({
      title: "Уплатить налог на прибыль (авансовый платёж)",
      category: "PAYMENT",
      priority: "HIGH",
      dueDate: nextMonthDay(now, 28),
      recurrenceType: "MONTHLY",
      recurrenceInterval: 1,
    });
  }

  // ── АУСН ─────────────────────────────────────────────────────────────
  if (hasAUSN) {
    tasks.push({
      title: "Подтвердить доходы/расходы в ФНС (АУСН)",
      description: "Проверить данные в личном кабинете АУСН и подтвердить.",
      category: "REPORTING",
      priority: "MEDIUM",
      dueDate: nextMonthDay(now, 5),
      recurrenceType: "MONTHLY",
      recurrenceInterval: 1,
    });
  }

  // ── ПСН ──────────────────────────────────────────────────────────────
  if (hasPSN) {
    tasks.push({
      title: "Уплатить стоимость патента",
      category: "PAYMENT",
      priority: "HIGH",
      dueDate: nextQ,
      recurrenceType: "MONTHLY",
      recurrenceInterval: 3,
    });
  }

  // ── Сотрудники / HR ───────────────────────────────────────────────────
  if (hasEmployees || hasHR) {
    tasks.push({
      title: "Рассчитать и выплатить зарплату",
      category: "PAYMENT",
      priority: "HIGH",
      dueDate: nextMonthDay(now, 10),
      recurrenceType: "MONTHLY",
      recurrenceInterval: 1,
    });
    tasks.push({
      title: "Сдать 6-НДФЛ",
      description: "Расчёт по форме 6-НДФЛ, срок — 25-е числа месяца после квартала.",
      category: "REPORTING",
      priority: "MEDIUM",
      dueDate: nextQ,
      recurrenceType: "MONTHLY",
      recurrenceInterval: 3,
    });
    tasks.push({
      title: "Сдать РСВ",
      description: "Расчёт по страховым взносам, срок — 25-е числа месяца после квартала.",
      category: "REPORTING",
      priority: "MEDIUM",
      dueDate: nextQ,
      recurrenceType: "MONTHLY",
      recurrenceInterval: 3,
    });
    tasks.push({
      title: "Сдать ЕФС-1 (кадровые события)",
      description: "Подраздел 1.1 при приёме, увольнении, переводе.",
      category: "REPORTING",
      priority: "MEDIUM",
      dueDate: nextMonthDay(now, 25),
      recurrenceType: "MONTHLY",
      recurrenceInterval: 1,
    });
    tasks.push({
      title: "Уплатить страховые взносы",
      category: "PAYMENT",
      priority: "HIGH",
      dueDate: nextMonthDay(now, 28),
      recurrenceType: "MONTHLY",
      recurrenceInterval: 1,
    });
  }

  // ── ЭЦП (если скоро истекает) ─────────────────────────────────────────
  if (org.digitalSignatureExpiry) {
    const expiry = new Date(org.digitalSignatureExpiry);
    const daysLeft = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft < 90) {
      tasks.push({
        title: "Обновить ЭЦП",
        description: `Срок действия сертификата истекает ${expiry.toLocaleDateString("ru-RU")}.`,
        category: "OTHER",
        priority: daysLeft < 30 ? "URGENT" : "HIGH",
        dueDate: new Date(expiry.getTime() - 14 * 24 * 60 * 60 * 1000),
        recurrenceType: null,
        recurrenceInterval: 1,
      });
    }
  }

  // ── Касса ─────────────────────────────────────────────────────────────
  if (org.hasCashRegister) {
    tasks.push({
      title: "Снять Z-отчёт и сверить выручку по кассе",
      category: "DOCUMENTS",
      priority: "LOW",
      dueDate: nextMonthDay(now, 1),
      recurrenceType: "MONTHLY",
      recurrenceInterval: 1,
    });
  }

  // Default client visibility: REPORTING tasks (декларации, отчёты) видны клиенту;
  // PAYMENT/DOCUMENTS/OTHER — внутренние, бухгалтер может включить вручную.
  for (const t of tasks) {
    t.visibleToClient = t.category === "REPORTING";
  }

  return tasks;
}
