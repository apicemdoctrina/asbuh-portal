import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import request from "supertest";
import app from "../app.js";
import prisma from "../lib/prisma.js";
import { signAccessToken, hashToken } from "../lib/tokens.js";
import { hashPassword, comparePassword } from "../lib/password.js";
import { sendPasswordResetEmail } from "../lib/mailer.js";
import { sendInviteEmail } from "../lib/invite-email.js";
import { sendMessage } from "../lib/telegram.js";

vi.mock("../lib/prisma.js", () => {
  const fn = () => vi.fn();
  const mockPrisma = {
    user: { findUnique: fn(), create: fn(), update: fn(), delete: fn() },
    userRole: { create: fn(), createMany: fn(), deleteMany: fn() },
    role: { findUnique: fn(), findMany: fn() },
    refreshToken: { create: fn(), findFirst: fn(), deleteMany: fn() },
    inviteToken: { create: fn(), findUnique: fn(), update: fn() },
    organization: { findFirst: fn() },
    organizationMember: { findFirst: fn(), create: fn() },
    passwordResetToken: { create: fn(), findUnique: fn(), update: fn(), updateMany: fn() },
    telegramBinding: { findUnique: fn() },
    rolePermission: { count: fn() },
    auditLog: { create: fn() },
    $transaction: vi.fn(),
  };
  mockPrisma.$transaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg === "function") {
      return (arg as (tx: typeof mockPrisma) => unknown)(mockPrisma);
    }
    return Promise.all(arg as Promise<unknown>[]);
  });
  return { default: mockPrisma };
});

// authLimiter: 10 req / 15 min on login/register/forgot/reset/invite-info —
// замокан, иначе сьют упирается в 429 после десятка запросов
vi.mock("../middleware/rate-limit.js", () => ({
  authLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../lib/mailer.js", () => ({
  sendEmail: vi.fn(async () => {}),
  sendEmailRaw: vi.fn(async () => true),
  sendPasswordResetEmail: vi.fn(async () => {}),
  setSmtpHealthReporters: vi.fn(),
}));

vi.mock("../lib/invite-email.js", () => ({
  sendInviteEmail: vi.fn(async () => {}),
}));

vi.mock("../lib/telegram.js", () => ({
  sendMessage: vi.fn(async () => {}),
  sendMessageRaw: vi.fn(async () => true),
  getBotName: vi.fn(async () => "test_bot"),
  startLongPolling: vi.fn(),
  setTelegramHealthReporters: vi.fn(),
}));

const asMock = (f: unknown) => f as ReturnType<typeof vi.fn>;

const FUTURE = new Date(Date.now() + 60 * 60 * 1000); // +1h
const PAST = new Date(Date.now() - 60 * 1000); // -1min

const PASSWORD = "correct-password";
let passwordHash: string;

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

function dbUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "u1",
    email: "user@example.com",
    firstName: "Ivan",
    lastName: "Petrov",
    isActive: true,
    passwordHash,
    userRoles: [{ role: { name: "manager" } }],
    ...overrides,
  };
}

function getSetCookies(res: request.Response): string[] {
  const raw = res.headers["set-cookie"];
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function findRefreshCookie(res: request.Response): string | undefined {
  return getSetCookies(res).find((c) => c.startsWith("refresh_token="));
}

function refreshCookieValue(res: request.Response): string {
  const cookie = findRefreshCookie(res);
  return cookie ? cookie.split(";")[0].split("=")[1] : "";
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── POST /api/auth/login ─────────────────────────────────────

describe("POST /api/auth/login", () => {
  it("400 when email or password missing", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "a@b.c" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Email and password are required");
  });

  it("200 returns access token in body and refresh token in httpOnly cookie", async () => {
    asMock(prisma.user.findUnique).mockResolvedValue(dbUser());

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toEqual({
      id: "u1",
      email: "user@example.com",
      firstName: "Ivan",
      lastName: "Petrov",
      roles: ["manager"],
    });

    const cookie = findRefreshCookie(res);
    expect(cookie).toBeDefined();
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Path=/api/auth");

    // refresh token persisted as hash, not plaintext
    const rawRefresh = refreshCookieValue(res);
    expect(rawRefresh.length).toBeGreaterThan(0);
    const createArg = asMock(prisma.refreshToken.create).mock.calls[0][0];
    expect(createArg.data.userId).toBe("u1");
    expect(createArg.data.tokenHash).toBe(hashToken(rawRefresh));
    expect(createArg.data.tokenHash).not.toBe(rawRefresh);
  });

  it("РЕГРЕССИЯ: email нормализуется (trim + lowercase) — как в forgot-password", async () => {
    asMock(prisma.user.findUnique).mockResolvedValue(dbUser());

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "  User@EXAMPLE.com ", password: PASSWORD });

    expect(res.status).toBe(200);
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "user@example.com" } }),
    );
  });

  it("401 with wrong password, audit login_failed", async () => {
    asMock(prisma.user.findUnique).mockResolvedValue(dbUser());

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: "wrong-password" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid credentials");
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "login_failed" }),
      }),
    );
  });

  it("401 for unknown email with the same error message (no user enumeration)", async () => {
    asMock(prisma.user.findUnique).mockResolvedValue(null);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: PASSWORD });

    expect(res.status).toBe(401);
    // тот же текст, что и при неверном пароле — не палим существование email
    expect(res.body.error).toBe("Invalid credentials");
  });

  it("401 for deactivated user even with correct password", async () => {
    asMock(prisma.user.findUnique).mockResolvedValue(dbUser({ isActive: false }));

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid credentials");
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it("admin login fires telegram alert when binding exists", async () => {
    asMock(prisma.user.findUnique).mockResolvedValue(
      dbUser({ id: "admin-1", userRoles: [{ role: { name: "admin" } }] }),
    );
    asMock(prisma.telegramBinding.findUnique).mockResolvedValue({
      userId: "admin-1",
      chatId: "12345",
    });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: PASSWORD });

    expect(res.status).toBe(200);
    // алерт идёт fire-and-forget — ждём, пока промис доедет
    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith("12345", expect.stringContaining("админ"));
    });
  });
});

// ── POST /api/auth/refresh ───────────────────────────────────

describe("POST /api/auth/refresh", () => {
  const RAW_REFRESH = "raw-refresh-token-value";

  function storedToken(overrides: Record<string, unknown> = {}) {
    return {
      id: "rt1",
      jti: "jti-1",
      tokenHash: hashToken(RAW_REFRESH),
      userId: "u1",
      expiresAt: FUTURE,
      user: { id: "u1", userRoles: [{ role: { name: "manager" } }] },
      ...overrides,
    };
  }

  it("401 without refresh cookie", async () => {
    const res = await request(app).post("/api/auth/refresh");

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("No refresh token");
  });

  it("401 for unknown token and clears cookie", async () => {
    asMock(prisma.refreshToken.findFirst).mockResolvedValue(null);

    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", [`refresh_token=${RAW_REFRESH}`]);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid or expired refresh token");
    // cookie очищена (Expires в прошлом)
    const cookie = findRefreshCookie(res);
    expect(cookie).toContain("refresh_token=;");
    // неизвестный токен — нечего удалять
    expect(prisma.refreshToken.deleteMany).not.toHaveBeenCalled();
  });

  it("401 for expired token and deletes it from DB", async () => {
    asMock(prisma.refreshToken.findFirst).mockResolvedValue(storedToken({ expiresAt: PAST }));

    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", [`refresh_token=${RAW_REFRESH}`]);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid or expired refresh token");
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { id: "rt1" } });
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it("200 rotates refresh token: old deleted, new stored, new cookie set", async () => {
    asMock(prisma.refreshToken.findFirst).mockResolvedValue(storedToken());

    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", [`refresh_token=${RAW_REFRESH}`]);

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));

    // lookup по хэшу присланного токена
    expect(prisma.refreshToken.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: hashToken(RAW_REFRESH) } }),
    );
    // старый инвалидирован
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { id: "rt1" } });

    // новый токен записан и отличается от старого
    const createArg = asMock(prisma.refreshToken.create).mock.calls[0][0];
    expect(createArg.data.userId).toBe("u1");
    expect(createArg.data.tokenHash).not.toBe(hashToken(RAW_REFRESH));

    // cookie содержит именно новый токен
    const newRaw = refreshCookieValue(res);
    expect(newRaw).not.toBe(RAW_REFRESH);
    expect(hashToken(newRaw)).toBe(createArg.data.tokenHash);
  });
});

// ── POST /api/auth/logout ────────────────────────────────────

describe("POST /api/auth/logout", () => {
  const userToken = signAccessToken({ userId: "u1", roles: ["manager"] });

  it("401 without access token", async () => {
    const res = await request(app).post("/api/auth/logout");

    expect(res.status).toBe(401);
  });

  it("200 deletes refresh token by hash and clears cookie", async () => {
    const res = await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${userToken}`)
      .set("Cookie", ["refresh_token=some-refresh"]);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("ok");
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { tokenHash: hashToken("some-refresh") },
    });
    const cookie = findRefreshCookie(res);
    expect(cookie).toContain("refresh_token=;");
    expect(cookie).toContain("Expires=Thu, 01 Jan 1970");
  });

  it("200 without refresh cookie — nothing deleted, cookie still cleared", async () => {
    const res = await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(prisma.refreshToken.deleteMany).not.toHaveBeenCalled();
    expect(findRefreshCookie(res)).toContain("refresh_token=;");
  });
});

// ── POST /api/auth/forgot-password ───────────────────────────

describe("POST /api/auth/forgot-password", () => {
  it("400 without email", async () => {
    const res = await request(app).post("/api/auth/forgot-password").send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("email required");
  });

  it("200 for existing user: invalidates old tokens, creates new one, sends email", async () => {
    asMock(prisma.user.findUnique).mockResolvedValue(dbUser());

    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "  User@Example.COM  " });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    // email нормализуется (lowercase + trim)
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "user@example.com" },
    });

    // старые неиспользованные токены инвалидируются
    expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", usedAt: null },
      data: { usedAt: expect.any(Date) },
    });

    // новый токен: в БД хэш, в письме — raw
    const createArg = asMock(prisma.passwordResetToken.create).mock.calls[0][0];
    expect(createArg.data.userId).toBe("u1");
    expect(createArg.data.expiresAt).toEqual(expect.any(Date));

    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    const [to, url] = asMock(sendPasswordResetEmail).mock.calls[0];
    expect(to).toBe("user@example.com");
    expect(url).toContain("/reset-password?token=");
    const rawToken = (url as string).split("token=")[1];
    expect(hashToken(rawToken)).toBe(createArg.data.tokenHash);
  });

  it("200 for unknown email without sending anything (no user enumeration)", async () => {
    asMock(prisma.user.findUnique).mockResolvedValue(null);

    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "nobody@example.com" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("200 for deactivated user without sending anything", async () => {
    asMock(prisma.user.findUnique).mockResolvedValue(dbUser({ isActive: false }));

    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "user@example.com" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});

// ── POST /api/auth/reset-password ────────────────────────────

describe("POST /api/auth/reset-password", () => {
  const RAW_RESET = "raw-reset-token";

  function resetToken(overrides: Record<string, unknown> = {}) {
    return {
      id: "prt1",
      tokenHash: hashToken(RAW_RESET),
      userId: "u1",
      expiresAt: FUTURE,
      usedAt: null,
      ...overrides,
    };
  }

  it("400 without token or password", async () => {
    const res = await request(app).post("/api/auth/reset-password").send({ token: RAW_RESET });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("token and password are required");
  });

  it("400 for password shorter than 8 chars", async () => {
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: RAW_RESET, password: "short" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Пароль должен быть не менее 8 символов");
  });

  it("400 for unknown token", async () => {
    asMock(prisma.passwordResetToken.findUnique).mockResolvedValue(null);

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "bogus", password: "newpassword123" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Недействительная ссылка");
  });

  it("400 for already used token", async () => {
    asMock(prisma.passwordResetToken.findUnique).mockResolvedValue(
      resetToken({ usedAt: new Date(Date.now() - 1000) }),
    );

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: RAW_RESET, password: "newpassword123" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Ссылка уже была использована");
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("400 for expired token", async () => {
    asMock(prisma.passwordResetToken.findUnique).mockResolvedValue(resetToken({ expiresAt: PAST }));

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: RAW_RESET, password: "newpassword123" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Срок действия ссылки истёк");
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("200 updates password, marks token used and revokes all sessions", async () => {
    asMock(prisma.passwordResetToken.findUnique).mockResolvedValue(resetToken());

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: RAW_RESET, password: "newpassword123" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    // lookup по хэшу
    expect(prisma.passwordResetToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashToken(RAW_RESET) },
    });
    // токен помечен использованным
    expect(prisma.passwordResetToken.update).toHaveBeenCalledWith({
      where: { id: "prt1" },
      data: { usedAt: expect.any(Date) },
    });
    // пароль реально захэширован bcrypt'ом
    const updateArg = asMock(prisma.user.update).mock.calls.find(
      (c) => c[0]?.data?.passwordHash,
    )?.[0];
    expect(updateArg.where).toEqual({ id: "u1" });
    expect(await comparePassword("newpassword123", updateArg.data.passwordHash)).toBe(true);
    // все refresh-сессии отозваны
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
  });
});

// ── GET /api/auth/invite-info/:token ─────────────────────────

describe("GET /api/auth/invite-info/:token", () => {
  function invite(overrides: Record<string, unknown> = {}) {
    return {
      id: "inv1",
      token: "invite-token-1",
      organizationId: "org1",
      usedAt: null,
      expiresAt: FUTURE,
      organization: { id: "org1", name: "ООО Ромашка" },
      ...overrides,
    };
  }

  it("valid:false for unknown token", async () => {
    asMock(prisma.inviteToken.findUnique).mockResolvedValue(null);

    const res = await request(app).get("/api/auth/invite-info/bogus");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ valid: false, reason: "Недействительная ссылка" });
  });

  it("valid:false for used token", async () => {
    asMock(prisma.inviteToken.findUnique).mockResolvedValue(invite({ usedAt: new Date() }));

    const res = await request(app).get("/api/auth/invite-info/invite-token-1");

    expect(res.body).toEqual({ valid: false, reason: "Приглашение уже использовано" });
  });

  it("valid:false for expired token", async () => {
    asMock(prisma.inviteToken.findUnique).mockResolvedValue(invite({ expiresAt: PAST }));

    const res = await request(app).get("/api/auth/invite-info/invite-token-1");

    expect(res.body).toEqual({ valid: false, reason: "Срок приглашения истёк" });
  });

  it("valid:true with organization info for live token", async () => {
    asMock(prisma.inviteToken.findUnique).mockResolvedValue(invite());

    const res = await request(app).get("/api/auth/invite-info/invite-token-1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      valid: true,
      organizationId: "org1",
      organizationName: "ООО Ромашка",
    });
  });
});

// ── POST /api/auth/invite ────────────────────────────────────

describe("POST /api/auth/invite", () => {
  const adminToken = signAccessToken({ userId: "admin-1", roles: ["admin"] });

  beforeEach(() => {
    asMock(prisma.rolePermission.count).mockResolvedValue(1);
  });

  it("400 for malformed email", async () => {
    const res = await request(app)
      .post("/api/auth/invite")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ organizationId: "org1", email: "not-an-email" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Некорректный email");
  });

  it("404 when organization is out of scope / not found", async () => {
    asMock(prisma.organization.findFirst).mockResolvedValue(null);

    const res = await request(app)
      .post("/api/auth/invite")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ organizationId: "org-foreign" });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Organization not found");
  });

  it("201 creates invite token, expiresInHours is clamped to 30 days max", async () => {
    asMock(prisma.organization.findFirst).mockResolvedValue({ id: "org1", name: "ООО Ромашка" });
    asMock(prisma.inviteToken.create).mockResolvedValue({
      id: "inv1",
      token: "generated-token",
      expiresAt: FUTURE,
    });

    const res = await request(app)
      .post("/api/auth/invite")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ organizationId: "org1", expiresInHours: 999999 });

    expect(res.status).toBe(201);
    expect(res.body.token).toBe("generated-token");
    expect(res.body.emailSent).toBe(false);
    expect(sendInviteEmail).not.toHaveBeenCalled();

    const createArg = asMock(prisma.inviteToken.create).mock.calls[0][0];
    const maxExpiry = Date.now() + 30 * 24 * 60 * 60 * 1000 + 5000;
    expect(createArg.data.expiresAt.getTime()).toBeLessThanOrEqual(maxExpiry);
  });

  it("201 with email: sends invite email and reports emailSent:true", async () => {
    asMock(prisma.organization.findFirst).mockResolvedValue({ id: "org1", name: "ООО Ромашка" });
    asMock(prisma.inviteToken.create).mockResolvedValue({
      id: "inv1",
      token: "generated-token",
      expiresAt: FUTURE,
    });
    asMock(prisma.user.findUnique).mockResolvedValue({ firstName: "Admin", lastName: "Adminov" });

    const res = await request(app)
      .post("/api/auth/invite")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ organizationId: "org1", email: "client@example.com" });

    expect(res.status).toBe(201);
    expect(res.body.emailSent).toBe(true);
    expect(res.body.emailError).toBeNull();
    expect(sendInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "client@example.com",
        organizationName: "ООО Ромашка",
        inviteToken: "generated-token",
      }),
    );
  });
});

// ── POST /api/auth/accept-invite ─────────────────────────────

describe("POST /api/auth/accept-invite", () => {
  const clientToken = signAccessToken({ userId: "client-1", roles: ["client"] });

  function invite(overrides: Record<string, unknown> = {}) {
    return {
      id: "inv1",
      token: "invite-token-1",
      organizationId: "org1",
      usedAt: null,
      expiresAt: FUTURE,
      organization: { id: "org1", name: "ООО Ромашка" },
      ...overrides,
    };
  }

  it("400 for expired token", async () => {
    asMock(prisma.inviteToken.findUnique).mockResolvedValue(invite({ expiresAt: PAST }));

    const res = await request(app)
      .post("/api/auth/accept-invite")
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ inviteToken: "invite-token-1" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invite token expired");
  });

  it("409 when already a member of the organization", async () => {
    asMock(prisma.inviteToken.findUnique).mockResolvedValue(invite());
    asMock(prisma.organizationMember.findFirst).mockResolvedValue({ id: "om1" });

    const res = await request(app)
      .post("/api/auth/accept-invite")
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ inviteToken: "invite-token-1" });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Вы уже состоите в этой организации");
    expect(prisma.inviteToken.update).not.toHaveBeenCalled();
  });

  it("200 joins organization and marks token used", async () => {
    asMock(prisma.inviteToken.findUnique).mockResolvedValue(invite());
    asMock(prisma.organizationMember.findFirst).mockResolvedValue(null);

    const res = await request(app)
      .post("/api/auth/accept-invite")
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ inviteToken: "invite-token-1" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ organizationId: "org1", organizationName: "ООО Ромашка" });
    expect(prisma.organizationMember.create).toHaveBeenCalledWith({
      data: { userId: "client-1", organizationId: "org1", role: "client" },
    });
    expect(prisma.inviteToken.update).toHaveBeenCalledWith({
      where: { id: "inv1" },
      data: { usedAt: expect.any(Date) },
    });
  });
});

// ── POST /api/auth/register ──────────────────────────────────

describe("POST /api/auth/register", () => {
  const validBody = {
    email: "new@example.com",
    password: "newpassword123",
    firstName: "New",
    lastName: "Client",
    inviteToken: "invite-token-1",
  };

  function invite(overrides: Record<string, unknown> = {}) {
    return {
      id: "inv1",
      token: "invite-token-1",
      organizationId: "org1",
      usedAt: null,
      expiresAt: FUTURE,
      ...overrides,
    };
  }

  it("400 for password shorter than 8 chars", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...validBody, password: "short" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Password must be at least 8 characters");
  });

  it("400 for already used invite token", async () => {
    asMock(prisma.inviteToken.findUnique).mockResolvedValue(invite({ usedAt: new Date() }));

    const res = await request(app).post("/api/auth/register").send(validBody);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invite token already used");
  });

  it("409 when user with this email already exists", async () => {
    asMock(prisma.inviteToken.findUnique).mockResolvedValue(invite());
    asMock(prisma.user.findUnique).mockResolvedValue(dbUser());

    const res = await request(app).post("/api/auth/register").send(validBody);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("User with this email already exists");
  });

  it("201 registers client, joins org, burns invite and auto-logs in", async () => {
    asMock(prisma.inviteToken.findUnique).mockResolvedValue(invite());
    asMock(prisma.user.findUnique).mockResolvedValue(null);
    asMock(prisma.role.findUnique).mockResolvedValue({ id: "role-client", name: "client" });
    asMock(prisma.user.create).mockResolvedValue({
      id: "new-u1",
      email: "new@example.com",
      firstName: "New",
      lastName: "Client",
    });

    const res = await request(app).post("/api/auth/register").send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toEqual({
      id: "new-u1",
      email: "new@example.com",
      firstName: "New",
      lastName: "Client",
    });

    // роль client и membership созданы внутри транзакции
    expect(prisma.userRole.create).toHaveBeenCalledWith({
      data: { userId: "new-u1", roleId: "role-client" },
    });
    expect(prisma.organizationMember.create).toHaveBeenCalledWith({
      data: { userId: "new-u1", organizationId: "org1", role: "client" },
    });
    expect(prisma.inviteToken.update).toHaveBeenCalledWith({
      where: { id: "inv1" },
      data: { usedAt: expect.any(Date) },
    });

    // auto-login: refresh token в БД + httpOnly cookie
    const createArg = asMock(prisma.refreshToken.create).mock.calls[0][0];
    expect(createArg.data.userId).toBe("new-u1");
    const cookie = findRefreshCookie(res);
    expect(cookie).toBeDefined();
    expect(cookie).toContain("HttpOnly");
  });

  it("нормализует email при регистрации (trim + lowercase)", async () => {
    asMock(prisma.inviteToken.findUnique).mockResolvedValue(invite());
    asMock(prisma.user.findUnique).mockResolvedValue(null);
    asMock(prisma.role.findUnique).mockResolvedValue({ id: "role-client", name: "client" });
    asMock(prisma.user.create).mockResolvedValue({
      id: "new-u1",
      email: "new@example.com",
      firstName: "New",
      lastName: "Client",
    });

    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...validBody, email: "  New@EXAMPLE.com " });

    expect(res.status).toBe(201);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "new@example.com" },
    });
    expect(asMock(prisma.user.create).mock.calls[0][0].data.email).toBe("new@example.com");
  });
});

// ── POST /api/auth/staff ─────────────────────────────────────

describe("POST /api/auth/staff", () => {
  const adminToken = signAccessToken({ userId: "admin-1", roles: ["admin"] });
  const managerToken = signAccessToken({ userId: "manager-1", roles: ["manager"] });

  it("403 for non-admin", async () => {
    const res = await request(app)
      .post("/api/auth/staff")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        email: "staff@example.com",
        password: "password123",
        firstName: "A",
        lastName: "B",
        roleNames: ["accountant"],
      });

    expect(res.status).toBe(403);
  });

  it("201 creates staff user with exactly one role", async () => {
    asMock(prisma.user.findUnique).mockResolvedValue(null);
    asMock(prisma.user.create).mockResolvedValue({
      id: "staff-1",
      email: "staff@example.com",
      firstName: "Anna",
      lastName: "Buh",
    });
    asMock(prisma.role.findMany).mockResolvedValue([{ id: "role-acc", name: "accountant" }]);

    const res = await request(app)
      .post("/api/auth/staff")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        email: "staff@example.com",
        password: "password123",
        firstName: "Anna",
        lastName: "Buh",
        roleNames: ["accountant"],
      });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: "staff-1",
      email: "staff@example.com",
      firstName: "Anna",
      lastName: "Buh",
    });
    expect(prisma.userRole.createMany).toHaveBeenCalledWith({
      data: [{ userId: "staff-1", roleId: "role-acc" }],
    });
  });

  it("400 when roleNames has not exactly one role — user is not created at all", async () => {
    asMock(prisma.user.findUnique).mockResolvedValue(null);

    const res = await request(app)
      .post("/api/auth/staff")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        email: "staff@example.com",
        password: "password123",
        firstName: "Anna",
        lastName: "Buh",
        roleNames: ["accountant", "manager"],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Необходимо выбрать ровно одну роль");
    // роль валидируется ДО создания — ни create, ни rollback-delete
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it("user create + role assignment выполняются атомарно в $transaction", async () => {
    asMock(prisma.user.findUnique).mockResolvedValue(null);
    asMock(prisma.user.create).mockResolvedValue({
      id: "staff-1",
      email: "staff@example.com",
      firstName: "Anna",
      lastName: "Buh",
    });
    asMock(prisma.role.findMany).mockResolvedValue([{ id: "role-acc", name: "accountant" }]);

    await request(app)
      .post("/api/auth/staff")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        email: "staff@example.com",
        password: "password123",
        firstName: "Anna",
        lastName: "Buh",
        roleNames: ["accountant"],
      });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(typeof asMock(prisma.$transaction).mock.calls[0][0]).toBe("function");
  });

  it("нормализует email при создании сотрудника (trim + lowercase)", async () => {
    asMock(prisma.user.findUnique).mockResolvedValue(null);
    asMock(prisma.user.create).mockResolvedValue({
      id: "staff-1",
      email: "anna@example.com",
      firstName: "Anna",
      lastName: "Buh",
    });
    asMock(prisma.role.findMany).mockResolvedValue([{ id: "role-acc", name: "accountant" }]);

    const res = await request(app)
      .post("/api/auth/staff")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        email: "  Anna@Example.COM ",
        password: "password123",
        firstName: "Anna",
        lastName: "Buh",
        roleNames: ["accountant"],
      });

    expect(res.status).toBe(201);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "anna@example.com" },
    });
    expect(asMock(prisma.user.create).mock.calls[0][0].data.email).toBe("anna@example.com");
  });
});
