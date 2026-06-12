import { describe, it, expect } from "vitest";
import { parseAlfaDay } from "./alfa-parser.js";
import type { AlfaTransaction } from "./alfa-client.js";

const ACC = "40702810000000000001";
const DAY = "2026-05-10";

const creditTx: AlfaTransaction = {
  amountRub: 1500.5,
  direction: "credit",
  operationDate: "2026-05-10",
  documentDate: "2026-05-09",
  paymentPurpose: "Оплата по счету 12",
  rurTransfer: {
    documentNumber: "42",
    payerName: "ООО Плательщик",
    payerInn: "7700000001",
    payerAccount: "40702810999999999999",
    payeeName: "ООО Наша Фирма",
    payeeInn: "7800000002",
    payeeAccount: ACC,
  },
};

const debitTx: AlfaTransaction = {
  amount: "700.25",
  direction: "debit",
  operationDate: "2026-05-10",
  paymentPurpose: "Оплата поставщику",
  rurTransfer: {
    documentNumber: "43",
    payerName: "ООО Наша Фирма",
    payerInn: "7800000002",
    payerAccount: ACC,
    payeeName: "ООО Поставщик",
    payeeInn: "7700000003",
    payeeAccount: "40702810888888888888",
  },
};

describe("parseAlfaDay", () => {
  it("credit → in: контрагенты, ИНН, дата DD.MM.YYYY, сумма", () => {
    const st = parseAlfaDay(ACC, DAY, [creditTx]);
    const op = st.accounts[0].operations[0];

    expect(op.direction).toBe("in");
    expect(op.docType).toBe("Платёжное поручение");
    expect(op.number).toBe("42");
    expect(op.date).toBe("10.05.2026");
    expect(op.amount).toBe(1500.5);
    expect(op.payerName).toBe("ООО Плательщик");
    expect(op.payerInn).toBe("7700000001");
    expect(op.payerAccount).toBe("40702810999999999999");
    expect(op.payeeName).toBe("ООО Наша Фирма");
    expect(op.payeeInn).toBe("7800000002");
    expect(op.payeeAccount).toBe(ACC);
    expect(op.purpose).toBe("Оплата по счету 12");
  });

  it("debit → out: amount-строка парсится, raw содержит ДатаСписано", () => {
    const st = parseAlfaDay(ACC, DAY, [debitTx]);
    const op = st.accounts[0].operations[0];

    expect(op.direction).toBe("out");
    expect(op.amount).toBe(700.25);
    expect(op.raw["ДатаСписано"]).toBe("10.05.2026");
    expect(op.raw["ДатаПоступило"]).toBeUndefined();
  });

  it("credit: raw содержит ДатаПоступило и поля 1С-документа", () => {
    const st = parseAlfaDay(ACC, DAY, [creditTx]);
    const raw = st.accounts[0].operations[0].raw;

    expect(raw["ДатаПоступило"]).toBe("10.05.2026");
    expect(raw["ДатаСписано"]).toBeUndefined();
    expect(raw["Номер"]).toBe("42");
    // documentDate задана → raw["Дата"] берётся из неё, а не из operationDate
    expect(raw["Дата"]).toBe("09.05.2026");
    expect(raw["Сумма"]).toBe("1500.50");
    expect(raw["Плательщик"]).toBe("ООО Плательщик");
    expect(raw["ПлательщикИНН"]).toBe("7700000001");
    expect(raw["Получатель"]).toBe("ООО Наша Фирма");
    expect(raw["ПолучательИНН"]).toBe("7800000002");
    expect(raw["НазначениеПлатежа"]).toBe("Оплата по счету 12");
  });

  it("без documentDate raw['Дата'] = дата операции; без documentNumber берётся t.number", () => {
    const tx: AlfaTransaction = {
      amountRub: 100,
      direction: "credit",
      operationDate: "2026-05-10",
      number: 77,
      rurTransfer: {},
    };
    const op = parseAlfaDay(ACC, DAY, [tx]).accounts[0].operations[0];

    expect(op.number).toBe("77");
    expect(op.raw["Дата"]).toBe("10.05.2026");
  });

  it("amount как объект {amount, currencyName} (формат /transactions)", () => {
    const tx: AlfaTransaction = {
      amount: { amount: "250.75", currencyName: "RUR" } as unknown as string,
      direction: "credit",
      operationDate: "2026-05-10",
      rurTransfer: {},
    };
    expect(parseAlfaDay(ACC, DAY, [tx]).accounts[0].operations[0].amount).toBe(250.75);
  });

  it("дата уже в DD.MM.YYYY → передаётся как есть", () => {
    const tx: AlfaTransaction = {
      amountRub: 10,
      direction: "credit",
      operationDate: "10.05.2026",
      rurTransfer: {},
    };
    expect(parseAlfaDay(ACC, DAY, [tx]).accounts[0].operations[0].date).toBe("10.05.2026");
  });

  it("неизвестное направление трактуется как out", () => {
    const tx: AlfaTransaction = {
      amountRub: 10,
      direction: "weird",
      operationDate: "2026-05-10",
      rurTransfer: {},
    };
    expect(parseAlfaDay(ACC, DAY, [tx]).accounts[0].operations[0].direction).toBe("out");
  });

  it("отсутствующие поля контрагентов → null, в raw не попадают", () => {
    const tx: AlfaTransaction = {
      amountRub: 10,
      direction: "credit",
      operationDate: "2026-05-10",
    };
    const op = parseAlfaDay(ACC, DAY, [tx]).accounts[0].operations[0];

    expect(op.payerName).toBeNull();
    expect(op.payerInn).toBeNull();
    expect(op.payeeName).toBeNull();
    expect(op.purpose).toBeNull();
    expect(op.raw["Плательщик"]).toBeUndefined();
    expect(op.raw["НазначениеПлатежа"]).toBeUndefined();
  });

  it("итоги счёта: totalIn/totalOut по направлениям, балансы 0, hasClosing=false", () => {
    const st = parseAlfaDay(ACC, DAY, [creditTx, debitTx]);
    const acc = st.accounts[0];

    expect(acc.accountNumber).toBe(ACC);
    expect(acc.totalIn).toBe(1500.5);
    expect(acc.totalOut).toBe(700.25);
    expect(acc.openingBalance).toBe(0);
    expect(acc.closingBalance).toBe(0);
    expect(acc.hasClosing).toBe(false);
  });

  it("meta: отправитель Альфа-Банк, dateStart=dateEnd=день выписки", () => {
    const st = parseAlfaDay(ACC, DAY, [creditTx]);

    expect(st.meta.sender).toBe("Альфа-Банк");
    expect(st.meta.formatVersion).toBe("1.02");
    expect(st.meta.encoding).toBe("windows-1251");
    expect(st.meta.dateStart).toBe("10.05.2026");
    expect(st.meta.dateEnd).toBe("10.05.2026");
  });

  it("пустая выписка: один счёт без операций, итоги 0", () => {
    const st = parseAlfaDay(ACC, DAY, []);

    expect(st.accounts).toHaveLength(1);
    expect(st.accounts[0].operations).toHaveLength(0);
    expect(st.accounts[0].totalIn).toBe(0);
    expect(st.accounts[0].totalOut).toBe(0);
  });
});
