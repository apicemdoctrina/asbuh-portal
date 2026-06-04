export interface ParsedOperation {
  docType: string; // значение после "СекцияДокумент="
  number: string; // Номер
  date: string; // Дата, формат DD.MM.YYYY как в файле
  amount: number; // Сумма
  direction: "in" | "out";
  payerName: string | null;
  payerInn: string | null;
  payerAccount: string | null;
  payeeName: string | null;
  payeeInn: string | null;
  payeeAccount: string | null;
  purpose: string | null;
  raw: Record<string, string>; // все исходные поля документа
}

export interface ParsedAccount {
  accountNumber: string; // РасчСчет
  openingBalance: number; // НачальныйОстаток
  totalIn: number; // ВсегоПоступило (из файла, может быть 0/отсутствовать)
  totalOut: number; // ВсегоСписано
  closingBalance: number; // КонечныйОстаток
  hasClosing: boolean; // был ли КонечныйОстаток в файле
  raw: Record<string, string>; // исходные поля секции счёта
  operations: ParsedOperation[];
}

export interface ParsedStatement {
  meta: {
    formatVersion: string; // ВерсияФормата
    encoding: string; // фактически использованная кодировка
    sender: string | null; // Отправитель
    dateStart: string | null; // ДатаНачала (DD.MM.YYYY)
    dateEnd: string | null; // ДатаКонца
    raw: Record<string, string>; // исходные ключи заголовка
  };
  accounts: ParsedAccount[];
}

export interface AccountReconcile {
  accountNumber: string;
  openingBalance: number;
  computedClosing: number; // opening + sumIn - sumOut
  declaredClosing: number; // КонечныйОстаток из файла
  sumIn: number;
  sumOut: number;
  diff: number; // declaredClosing - computedClosing
  ok: boolean;
  note: string | null; // напр. "нет данных для сверки"
}

export interface ReconcileResult {
  status: "OK" | "MISMATCH";
  totalDiff: number; // сумма |diff| по счетам
  perAccount: AccountReconcile[];
}
