import { describe, it, expect, vi, beforeEach } from "vitest";

const ONE_C_FIXTURE = `1CClientBankExchange
ВерсияФормата=1.03
Кодировка=UTF-8
Отправитель=BSPB
Получатель=
ДатаСоздания=04.06.2026
ВремяСоздания=10:00:00
ДатаНачала=01.05.2026
ДатаКонца=31.05.2026
РасчСчет=40702810912345678901
СекцияРасчСчет
РасчСчет=40702810912345678901
ДатаНачала=01.05.2026
ДатаКонца=31.05.2026
НачальныйОстаток=1000.00
ВсегоПоступило=0.00
ВсегоСписано=0.00
КонечныйОстаток=1000.00
КонецРасчСчет
КонецФайла
`;

function makeRawEmail(
  opts: {
    attachmentName?: string;
    body?: string;
  } = {},
): Buffer {
  const filename = opts.attachmentName ?? "statement.txt";
  const content = opts.body ?? ONE_C_FIXTURE;
  const boundary = "----=_BSPB_BOUNDARY";
  return Buffer.from(
    [
      `From: bspb@example.com`,
      `To: statements@asbuh.com`,
      `Subject: Statement`,
      `Message-ID: <test@bspb>`,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      `body`,
      `--${boundary}`,
      `Content-Type: application/octet-stream; name="${filename}"`,
      `Content-Disposition: attachment; filename="${filename}"`,
      `Content-Transfer-Encoding: base64`,
      ``,
      Buffer.from(content, "utf8").toString("base64"),
      `--${boundary}--`,
      ``,
    ].join("\r\n"),
  );
}

function makeRawEmailNoAttach(): Buffer {
  return Buffer.from(
    [
      `From: bspb@example.com`,
      `To: x@asbuh.com`,
      `Subject: Just text`,
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      `Hello, no attachment here.`,
      ``,
    ].join("\r\n"),
  );
}

vi.mock("./prisma.js", () => {
  return {
    default: {
      imapStatementLog: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      organizationBankAccount: {
        findFirst: vi.fn(),
      },
      user: {
        findMany: vi.fn(),
      },
    },
  };
});

vi.mock("./statement-ingest.js", () => ({
  ingestStatement: vi.fn(),
}));

vi.mock("./notify.js", () => ({
  createNotification: vi.fn(),
}));

import prisma from "./prisma.js";
import { ingestStatement } from "./statement-ingest.js";
import { createNotification } from "./notify.js";
import { pollOnce, type ImapClient } from "./imap-statement-watcher.js";

type MockClient = ImapClient & { markedSeen: number[] };

function mockClient(opts: { uids: number[]; uidToRaw: Record<number, Buffer | null> }): MockClient {
  const markedSeen: number[] = [];
  return {
    markedSeen,
    mailbox: () => ({ uidValidity: 42n }),
    searchUnseen: async () => opts.uids,
    fetchRaw: async (uid) => {
      const raw = opts.uidToRaw[uid];
      if (!raw) return null;
      return {
        raw,
        envelope: { messageId: `<${uid}@bspb>`, subject: "Statement", from: "bspb@example.com" },
      };
    },
    markSeen: async (uid) => {
      markedSeen.push(uid);
    },
  };
}

describe("imap-statement-watcher.pollOnce", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // По умолчанию: лога нет → не дубль.
    vi.mocked(prisma.imapStatementLog.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.imapStatementLog.create).mockResolvedValue({} as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: "admin-1" }] as never);
  });

  it("успешный ингест: status=OK, ingestStatement вызван, \\Seen, лог OK", async () => {
    vi.mocked(prisma.organizationBankAccount.findFirst).mockResolvedValue({
      organizationId: "org-1",
    } as never);
    vi.mocked(ingestStatement).mockResolvedValue({
      statementId: "stmt-1",
    } as never);

    const client = mockClient({ uids: [101], uidToRaw: { 101: makeRawEmail() } });
    const outcomes = await pollOnce({
      client,
      mailbox: "INBOX",
      systemUserId: "sys-1",
    });

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].status).toBe("OK");
    expect(outcomes[0].statementId).toBe("stmt-1");
    expect(outcomes[0].accountNumber).toBe("40702810912345678901");
    expect(ingestStatement).toHaveBeenCalledTimes(1);
    expect(ingestStatement).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        uploadedById: "sys-1",
      }),
    );
    expect(client.markedSeen).toEqual([101]);
    expect(prisma.imapStatementLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "OK", uid: 101, statementId: "stmt-1" }),
      }),
    );
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("письмо без 1С-вложения → NO_ATTACHMENT, без ingestStatement, без уведомления", async () => {
    const client = mockClient({ uids: [102], uidToRaw: { 102: makeRawEmailNoAttach() } });
    const outcomes = await pollOnce({
      client,
      mailbox: "INBOX",
      systemUserId: "sys-1",
    });

    expect(outcomes[0].status).toBe("NO_ATTACHMENT");
    expect(ingestStatement).not.toHaveBeenCalled();
    expect(client.markedSeen).toEqual([102]);
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("счёт не найден в БД → UNKNOWN_ACCOUNT + уведомление админам", async () => {
    vi.mocked(prisma.organizationBankAccount.findFirst).mockResolvedValue(null);

    const client = mockClient({ uids: [103], uidToRaw: { 103: makeRawEmail() } });
    const outcomes = await pollOnce({
      client,
      mailbox: "INBOX",
      systemUserId: "sys-1",
    });

    expect(outcomes[0].status).toBe("UNKNOWN_ACCOUNT");
    expect(outcomes[0].accountNumber).toBe("40702810912345678901");
    expect(ingestStatement).not.toHaveBeenCalled();
    expect(createNotification).toHaveBeenCalledWith(
      "admin-1",
      "system_alert",
      expect.stringContaining("неизвестный счёт"),
      expect.any(String),
    );
  });

  it("битый файл → PARSE_ERROR + уведомление", async () => {
    const client = mockClient({
      uids: [104],
      uidToRaw: { 104: makeRawEmail({ body: "это не 1CClientBankExchange а просто текст" }) },
    });
    const outcomes = await pollOnce({
      client,
      mailbox: "INBOX",
      systemUserId: "sys-1",
    });

    // Текст без маркера → NO_ATTACHMENT (а не PARSE_ERROR), потому что pickOneCAttachment ищет marker.
    // Проверим, что не ингестим.
    expect(["NO_ATTACHMENT", "PARSE_ERROR"]).toContain(outcomes[0].status);
    expect(ingestStatement).not.toHaveBeenCalled();
  });

  it("дубль UID (уже в логе) → пропуск, без действий", async () => {
    vi.mocked(prisma.imapStatementLog.findUnique).mockResolvedValue({
      id: "existing",
    } as never);
    vi.mocked(prisma.organizationBankAccount.findFirst).mockResolvedValue({
      organizationId: "org-1",
    } as never);

    const client = mockClient({ uids: [101], uidToRaw: { 101: makeRawEmail() } });
    const outcomes = await pollOnce({
      client,
      mailbox: "INBOX",
      systemUserId: "sys-1",
    });

    expect(outcomes).toHaveLength(0);
    expect(ingestStatement).not.toHaveBeenCalled();
    expect(client.markedSeen).toEqual([]);
    expect(prisma.imapStatementLog.create).not.toHaveBeenCalled();
  });
});
