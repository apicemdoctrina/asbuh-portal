import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("../../lib/api.js", () => ({
  api: vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })),
}));

import ThreadList from "./ThreadList.jsx";
import NewThreadForm from "./NewThreadForm.jsx";
import ThreadView from "./ThreadView.jsx";
import PendingAttachments from "./PendingAttachments.jsx";
import MessageAttachments from "./MessageAttachments.jsx";
import Avatar from "./Avatar.jsx";
import { STATUS_LABEL, formatBytes, fullName, isImage } from "./supportHelpers.js";

const THREAD = {
  id: "t1",
  subject: "Не открывается отчёт",
  status: "OPEN",
  createdAt: "2026-01-10T10:00:00Z",
  lastMessageAt: "2026-01-10T12:00:00Z",
  user: { firstName: "Иван", lastName: "Петров", email: "ivan@example.com" },
  messages: [
    {
      id: "m1",
      body: "Здравствуйте, у меня проблема",
      authorId: "u1",
      author: { firstName: "Иван", lastName: "Петров" },
      isStaff: false,
      createdAt: "2026-01-10T12:00:00Z",
      readAt: null,
      attachments: [],
    },
  ],
};

describe("supportHelpers", () => {
  it("STATUS_LABEL covers all statuses", () => {
    expect(STATUS_LABEL.OPEN.text).toBe("Открыто");
    expect(STATUS_LABEL.RESOLVED.text).toBe("Решено");
    expect(STATUS_LABEL.CLOSED.text).toBe("Закрыто");
  });

  it("formatBytes formats sizes", () => {
    expect(formatBytes(0)).toBe("");
    expect(formatBytes(500)).toBe("500 Б");
    expect(formatBytes(2048)).toBe("2.0 КБ");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 МБ");
  });

  it("fullName falls back to email and dash", () => {
    expect(fullName(null)).toBe("—");
    expect(fullName({ email: "a@b.c" })).toBe("a@b.c");
    expect(fullName({ firstName: "Иван", lastName: "Петров" })).toBe("Иван Петров");
  });

  it("isImage detects by mime and extension", () => {
    expect(isImage({ mimeType: "image/png" })).toBe(true);
    expect(isImage({ originalName: "scan.JPG" })).toBe(true);
    expect(isImage({ originalName: "doc.pdf" })).toBe(false);
  });
});

describe("ThreadList", () => {
  it("renders threads with subject, status and author for staff", () => {
    render(
      <MemoryRouter>
        <ThreadList threads={[THREAD]} activeThreadId="t1" isStaff visibleOnMobile />
      </MemoryRouter>,
    );
    expect(screen.getByText("Все обращения")).toBeInTheDocument();
    expect(screen.getByText("Не открывается отчёт")).toBeInTheDocument();
    expect(screen.getByText("Открыто")).toBeInTheDocument();
    expect(screen.getByText("от Иван Петров")).toBeInTheDocument();
  });

  it("shows empty state and direct contacts for non-staff", () => {
    render(
      <MemoryRouter>
        <ThreadList threads={[]} activeThreadId={null} isStaff={false} visibleOnMobile />
      </MemoryRouter>,
    );
    expect(screen.getByText("Мои обращения")).toBeInTheDocument();
    expect(
      screen.getByText("У вас пока нет обращений. Нажмите «Новое обращение»."),
    ).toBeInTheDocument();
    expect(screen.getByText("support@asbuh.com")).toBeInTheDocument();
    expect(screen.getByText("Telegram: @apicem_doctrina")).toBeInTheDocument();
  });
});

describe("NewThreadForm", () => {
  it("renders subject, message fields and submit button", () => {
    render(
      <NewThreadForm
        subject=""
        onSubjectChange={() => {}}
        body=""
        onBodyChange={() => {}}
        attachments={[]}
        onRemoveAttachment={() => {}}
        uploadingCount={0}
        creating={false}
        onSubmit={(e) => e.preventDefault()}
        onClose={() => {}}
        onFiles={() => {}}
        onPaste={() => {}}
      />,
    );
    expect(screen.getByText("Новое обращение")).toBeInTheDocument();
    expect(screen.getByText("Тема")).toBeInTheDocument();
    expect(screen.getByText("Сообщение")).toBeInTheDocument();
    expect(screen.getByText("Прикрепить файл")).toBeInTheDocument();
    expect(screen.getByText("Отправить")).toBeInTheDocument();
  });
});

describe("ThreadView", () => {
  it("renders header, messages and reply composer for open thread", () => {
    render(
      <MemoryRouter>
        <ThreadView
          thread={THREAD}
          loadingThread={false}
          isStaff
          userId="u2"
          onChangeStatus={() => {}}
          body=""
          onBodyChange={() => {}}
          sending={false}
          uploadingCount={0}
          replyAttachments={[]}
          onRemoveReplyAttachment={() => {}}
          onSubmitReply={(e) => e.preventDefault()}
          onFiles={() => {}}
          onPaste={() => {}}
          messagesEndRef={{ current: null }}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("Не открывается отчёт")).toBeInTheDocument();
    expect(screen.getByText("Здравствуйте, у меня проблема")).toBeInTheDocument();
    expect(screen.getByText("Решено")).toBeInTheDocument();
    expect(screen.getByText("Закрыть")).toBeInTheDocument();
  });

  it("shows closed banner instead of composer for closed thread", () => {
    render(
      <MemoryRouter>
        <ThreadView
          thread={{ ...THREAD, status: "CLOSED" }}
          loadingThread={false}
          isStaff={false}
          userId="u1"
          onChangeStatus={() => {}}
          body=""
          onBodyChange={() => {}}
          sending={false}
          uploadingCount={0}
          replyAttachments={[]}
          onRemoveReplyAttachment={() => {}}
          onSubmitReply={() => {}}
          onFiles={() => {}}
          onPaste={() => {}}
          messagesEndRef={{ current: null }}
        />
      </MemoryRouter>,
    );
    expect(
      screen.getByText("Тред закрыт. Если есть новые вопросы — создайте новое обращение."),
    ).toBeInTheDocument();
  });
});

describe("PendingAttachments", () => {
  it("renders nothing when empty and items with remove button", () => {
    const { container } = render(<PendingAttachments items={[]} onRemove={() => {}} />);
    expect(container.firstChild).toBeNull();
    render(
      <PendingAttachments
        items={[{ originalName: "doc.pdf", fileName: "abc.pdf", fileSize: 2048 }]}
        onRemove={() => {}}
      />,
    );
    expect(screen.getByText("doc.pdf")).toBeInTheDocument();
    expect(screen.getByText("2.0 КБ")).toBeInTheDocument();
    expect(screen.getByTitle("Убрать")).toBeInTheDocument();
  });
});

describe("MessageAttachments", () => {
  it("renders file attachment as download button", () => {
    render(
      <MessageAttachments
        items={[{ originalName: "акт.pdf", fileName: "x.pdf", fileSize: 1024 }]}
        mine={false}
      />,
    );
    expect(screen.getByText("акт.pdf")).toBeInTheDocument();
  });
});

describe("Avatar", () => {
  it("renders initials when no avatarUrl", () => {
    render(<Avatar user={{ firstName: "Иван", lastName: "Петров" }} />);
    expect(screen.getByText("ИП")).toBeInTheDocument();
  });
});
