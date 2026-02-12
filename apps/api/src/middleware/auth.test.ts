import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { authenticate, requireRole } from "./auth.js";
import { signAccessToken } from "../lib/tokens.js";

function mockRes(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

describe("authenticate", () => {
  it("sets req.user for valid token", () => {
    const token = signAccessToken({ userId: "u1", roles: ["admin"] });
    const req = { headers: { authorization: `Bearer ${token}` } } as Request;
    const res = mockRes();
    const next = vi.fn();

    authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user?.userId).toBe("u1");
    expect(req.user?.roles).toEqual(["admin"]);
  });

  it("returns 401 without token", () => {
    const req = { headers: {} } as Request;
    const res = mockRes();
    const next = vi.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 for invalid token", () => {
    const req = { headers: { authorization: "Bearer invalid" } } as Request;
    const res = mockRes();
    const next = vi.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("requireRole", () => {
  it("passes for matching role", () => {
    const req = { user: { userId: "u1", roles: ["admin"] } } as Request;
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    requireRole("admin")(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("returns 403 for non-matching role", () => {
    const req = { user: { userId: "u1", roles: ["client"] } } as Request;
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    requireRole("admin")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
