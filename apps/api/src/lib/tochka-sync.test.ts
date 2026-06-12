import { describe, it, expect, vi, beforeEach } from "vitest";

// tochka-sync.ts тянет prisma на верхнем уровне — мокаем до импорта модуля
const prismaMock = vi.hoisted(() => ({
  bankTransaction: {
    findUnique: vi.fn(),
    create: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  bankAccount: {
    update: vi.fn(),
    findFirst: vi.fn(),
  },
  organization: {
    findMany: vi.fn(),
  },
}));

vi.mock("./prisma.js", () => ({ default: prismaMock }));

// recalcOrgDebt дергается после авто-матчинга — мокаем, чтобы не тащить prisma-логику долга
const recalcOrgDebtMock = vi.hoisted(() => vi.fn());
vi.mock("./debt.js", () => ({ recalcOrgDebt: recalcOrgDebtMock }));

import {
  importTochkaIncoming,
  autoMatchTransactions,
  DEPOSIT_KEYWORDS,
  type TochkaTransaction,
} from "./tochka-sync.js";

const ACCOUNT_ID = "acc-db-1";

function makeTx(overrides: Partial<TochkaTransaction> = {}): TochkaTransaction {
  return {
    transactionId: "ext-1",
    creditDebitIndicator: "Credit",
    status: "Booked",
    documentProcessDate: "2026-01-15",
    description: "Оплата по договору 7",
    Amount: { amount: 1500.5, currency: "RUB" },
    DebtorParty: { inn: "7700000001", name: "ООО Плательщик" },
    DebtorAccount: { identification: "40702810999999999999" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.bankTransaction.findUnique.mockResolvedValue(null);
  prismaMock.bankTransaction.create.mockResolvedValue({});
  prismaMock.bankTransaction.update.mockResolvedValue({});
  prismaMock.bankAccount.update.mockResolvedValue({});
});

describe("DEPOSIT_KEYWORDS", () => {
  it("ловит возвраты депозитов и проценты", () => {
    expect(DEPOSIT_KEYWORDS.test("Возврат депозита по договору Д-1")).toBe(true);
    expect(DEPOSIT_KEYWORDS.test("Выплата процентов по депозиту")).toBe(true);
    expect(DEPOSIT_KEYWORDS.test("Пополнение депозитного счёта")).toBe(true);
  });

  it("не ловит обычную выручку", () => {
    expect(DEPOSIT_KEYWORDS.test("Оплата за бухгалтерские услуги за январь")).toBe(false);
  });
});

describe("importTochkaIncoming", () => {
  it("импортирует только Credit; Debit не попадает в БД", async () => {
    const res = await importTochkaIncoming(ACCOUNT_ID, [
      makeTx({ transactionId: "ext-credit" }),
      makeTx({ transactionId: "ext-debit", creditDebitIndicator: "Debit" }),
    ]);

    expect(res).toEqual({ imported: 1, skipped: 0, incoming: 1, depositReturns: 0 });
    expect(prismaMock.bankTransaction.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.bankTransaction.create.mock.calls[0][0].data.externalId).toBe("ext-credit");
  });

  it("депозитные возвраты отфильтровываются и считаются отдельно", async () => {
    const res = await importTochkaIncoming(ACCOUNT_ID, [
      makeTx({ transactionId: "ext-1" }),
      makeTx({ transactionId: "ext-2", description: "Возврат депозита по договору" }),
      makeTx({ transactionId: "ext-3", description: "Проценты по депозиту за май" }),
    ]);

    expect(res).toEqual({ imported: 1, skipped: 0, incoming: 1, depositReturns: 2 });
    expect(prismaMock.bankTransaction.create).toHaveBeenCalledTimes(1);
  });

  it("дедуп по externalId: существующая транзакция → skipped, create не вызывается", async () => {
    prismaMock.bankTransaction.findUnique.mockImplementation(
      async ({ where }: { where: { externalId: string } }) =>
        where.externalId === "ext-old" ? { id: "tx-old" } : null,
    );

    const res = await importTochkaIncoming(ACCOUNT_ID, [
      makeTx({ transactionId: "ext-old" }),
      makeTx({ transactionId: "ext-new" }),
    ]);

    expect(res.imported).toBe(1);
    expect(res.skipped).toBe(1);
    expect(prismaMock.bankTransaction.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.bankTransaction.create.mock.calls[0][0].data.externalId).toBe("ext-new");
  });

  it("создаёт BankTransaction с корректными полями и статусом UNMATCHED", async () => {
    await importTochkaIncoming(ACCOUNT_ID, [makeTx()]);

    expect(prismaMock.bankTransaction.create).toHaveBeenCalledWith({
      data: {
        bankAccountId: ACCOUNT_ID,
        externalId: "ext-1",
        date: new Date("2026-01-15"),
        amount: 1500.5,
        payerName: "ООО Плательщик",
        payerInn: "7700000001",
        payerAccount: "40702810999999999999",
        purpose: "Оплата по договору 7",
        matchStatus: "UNMATCHED",
      },
    });
  });

  it("отсутствующие поля плательщика/назначения → null, сумма без Amount → 0", async () => {
    await importTochkaIncoming(ACCOUNT_ID, [
      makeTx({
        DebtorParty: undefined,
        DebtorAccount: undefined,
        description: undefined,
        Amount: undefined as unknown as TochkaTransaction["Amount"],
      }),
    ]);

    const data = prismaMock.bankTransaction.create.mock.calls[0][0].data;
    expect(data.payerName).toBeNull();
    expect(data.payerInn).toBeNull();
    expect(data.payerAccount).toBeNull();
    expect(data.purpose).toBeNull();
    expect(data.amount).toBe(0);
  });

  it("обновляет lastSyncAt у счёта даже при пустом списке", async () => {
    const res = await importTochkaIncoming(ACCOUNT_ID, []);

    expect(res).toEqual({ imported: 0, skipped: 0, incoming: 0, depositReturns: 0 });
    expect(prismaMock.bankAccount.update).toHaveBeenCalledWith({
      where: { id: ACCOUNT_ID },
      data: { lastSyncAt: expect.any(Date) },
    });
  });
});

describe("autoMatchTransactions", () => {
  const orgRomashka = { id: "org-1", name: "ООО «Ромашка»", inn: "7700000001" };
  const orgVasilek = { id: "org-2", name: "ИП Василёк", inn: "7800000002" };

  it("запрашивает только UNMATCHED банковские (не ручные) транзакции и только активные BANK_TOCHKA организации", async () => {
    prismaMock.bankTransaction.findMany.mockResolvedValue([]);
    prismaMock.organization.findMany.mockResolvedValue([]);

    await autoMatchTransactions();

    expect(prismaMock.bankTransaction.findMany).toHaveBeenCalledWith({
      where: { matchStatus: "UNMATCHED", isManual: false },
    });
    expect(prismaMock.organization.findMany).toHaveBeenCalledWith({
      where: {
        status: { notIn: ["left", "closed", "ceased", "archived"] },
        paymentDestination: "BANK_TOCHKA",
      },
      select: { id: true, name: true, inn: true },
    });
  });

  it("матчит по ИНН плательщика: статус AUTO, matchedBy=auto, matchedAt", async () => {
    prismaMock.bankTransaction.findMany.mockResolvedValue([
      { id: "tx-1", payerInn: "7700000001", payerName: "Кто-то", purpose: "Оплата" },
    ]);
    prismaMock.organization.findMany.mockResolvedValue([orgRomashka, orgVasilek]);

    const matched = await autoMatchTransactions();

    expect(matched).toBe(1);
    expect(prismaMock.bankTransaction.update).toHaveBeenCalledWith({
      where: { id: "tx-1" },
      data: {
        organizationId: "org-1",
        matchStatus: "AUTO",
        matchedAt: expect.any(Date),
        matchedBy: "auto",
      },
    });
  });

  it("fallback по имени: чистит кавычки и правовую форму, ищет в payerName+purpose", async () => {
    prismaMock.bankTransaction.findMany.mockResolvedValue([
      // ИНН не совпадает ни с кем — сработает поиск "ромашка" в назначении
      { id: "tx-2", payerInn: "9999999999", payerName: null, purpose: "Оплата от РОМАШКА за май" },
    ]);
    prismaMock.organization.findMany.mockResolvedValue([orgRomashka]);

    const matched = await autoMatchTransactions();

    expect(matched).toBe(1);
    expect(prismaMock.bankTransaction.update.mock.calls[0][0].data.organizationId).toBe("org-1");
  });

  it("слишком короткое имя организации (<3 символов после чистки) не матчится", async () => {
    prismaMock.bankTransaction.findMany.mockResolvedValue([
      { id: "tx-3", payerInn: null, payerName: "ИП Ив", purpose: "Оплата" },
    ]);
    prismaMock.organization.findMany.mockResolvedValue([{ id: "org-3", name: "ИП Ив", inn: null }]);

    const matched = await autoMatchTransactions();

    expect(matched).toBe(0);
    expect(prismaMock.bankTransaction.update).not.toHaveBeenCalled();
  });

  it("нет совпадений → 0, транзакция остаётся нетронутой", async () => {
    prismaMock.bankTransaction.findMany.mockResolvedValue([
      { id: "tx-4", payerInn: "5555555555", payerName: "ООО Чужой", purpose: "Оплата аренды" },
    ]);
    prismaMock.organization.findMany.mockResolvedValue([orgRomashka, orgVasilek]);

    const matched = await autoMatchTransactions();

    expect(matched).toBe(0);
    expect(prismaMock.bankTransaction.update).not.toHaveBeenCalled();
  });

  it("приоритет ИНН над именем: при совпадении ИНН имя не проверяется", async () => {
    prismaMock.bankTransaction.findMany.mockResolvedValue([
      // ИНН указывает на Василёк, а в purpose упомянута Ромашка
      { id: "tx-5", payerInn: "7800000002", payerName: null, purpose: "За ромашка услуги" },
    ]);
    prismaMock.organization.findMany.mockResolvedValue([orgRomashka, orgVasilek]);

    const matched = await autoMatchTransactions();

    expect(matched).toBe(1);
    expect(prismaMock.bankTransaction.update.mock.calls[0][0].data.organizationId).toBe("org-2");
  });

  it("несколько транзакций: матчится каждая подходящая, счётчик суммируется", async () => {
    prismaMock.bankTransaction.findMany.mockResolvedValue([
      { id: "tx-6", payerInn: "7700000001", payerName: null, purpose: null },
      { id: "tx-7", payerInn: null, payerName: "ИП ВАСИЛЁК", purpose: null },
      { id: "tx-8", payerInn: null, payerName: "Неизвестный", purpose: null },
    ]);
    prismaMock.organization.findMany.mockResolvedValue([orgRomashka, orgVasilek]);

    const matched = await autoMatchTransactions();

    expect(matched).toBe(2);
    expect(prismaMock.bankTransaction.update).toHaveBeenCalledTimes(2);
  });

  it("имя матчится только по границам слова: «Мир» не цепляет «Мираж-строй»", async () => {
    prismaMock.bankTransaction.findMany.mockResolvedValue([
      { id: "tx-9", payerInn: null, payerName: "ООО Мираж-строй", purpose: "Оплата аренды" },
      { id: "tx-10", payerInn: null, payerName: null, purpose: "Оплата от ООО Мир за услуги" },
    ]);
    prismaMock.organization.findMany.mockResolvedValue([
      { id: "org-mir", name: "ООО «Мир»", inn: null },
    ]);

    const matched = await autoMatchTransactions();

    expect(matched).toBe(1);
    expect(prismaMock.bankTransaction.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.bankTransaction.update.mock.calls[0][0].where.id).toBe("tx-10");
  });

  it("после матчинга пересчитывает долг — один раз на каждую затронутую организацию", async () => {
    prismaMock.bankTransaction.findMany.mockResolvedValue([
      { id: "tx-11", payerInn: "7700000001", payerName: null, purpose: null },
      { id: "tx-12", payerInn: "7700000001", payerName: null, purpose: null },
      { id: "tx-13", payerInn: "7800000002", payerName: null, purpose: null },
    ]);
    prismaMock.organization.findMany.mockResolvedValue([orgRomashka, orgVasilek]);

    await autoMatchTransactions();

    expect(recalcOrgDebtMock).toHaveBeenCalledTimes(2);
    expect(recalcOrgDebtMock).toHaveBeenCalledWith("org-1");
    expect(recalcOrgDebtMock).toHaveBeenCalledWith("org-2");
  });

  it("без совпадений пересчёт долга не вызывается", async () => {
    prismaMock.bankTransaction.findMany.mockResolvedValue([
      { id: "tx-14", payerInn: "5555555555", payerName: "ООО Чужой", purpose: null },
    ]);
    prismaMock.organization.findMany.mockResolvedValue([orgRomashka]);

    await autoMatchTransactions();

    expect(recalcOrgDebtMock).not.toHaveBeenCalled();
  });
});
