import { describe, it, expect } from "vitest";
import { worse, daysBetween, computeOrgStatus, type OrgStatus } from "./client-dashboard.js";

describe("worse()", () => {
  it("returns the higher-priority status", () => {
    expect(worse("ok", "action_required")).toBe("action_required");
    expect(worse("action_required", "overdue")).toBe("overdue");
    expect(worse("overdue", "ok")).toBe("overdue");
    expect(worse("ok", "ok")).toBe("ok");
  });
});

describe("daysBetween()", () => {
  it("computes whole days between two UTC dates ignoring time-of-day", () => {
    const a = new Date("2026-04-24T23:00:00Z");
    const b = new Date("2026-04-25T01:00:00Z");
    expect(daysBetween(a, b)).toBe(1);
  });
  it("returns negative for past dates", () => {
    const a = new Date("2026-04-24T00:00:00Z");
    const b = new Date("2026-04-22T00:00:00Z");
    expect(daysBetween(a, b)).toBe(-2);
  });
});

describe("computeOrgStatus()", () => {
  it("ok when no actions and no overdue tasks", () => {
    const r = computeOrgStatus({ actions: [], hasOverdueTask: false });
    expect(r.status).toBe<OrgStatus>("ok");
  });
  it("action_required when actions present and nothing overdue", () => {
    const r = computeOrgStatus({
      actions: [{ type: "ticket_waiting", title: "x", dueAt: null, link: "/" }],
      hasOverdueTask: false,
    });
    expect(r.status).toBe<OrgStatus>("action_required");
  });
  it("overdue when payment_overdue action present", () => {
    const r = computeOrgStatus({
      actions: [{ type: "payment_overdue", title: "x", dueAt: null, link: "/" }],
      hasOverdueTask: false,
    });
    expect(r.status).toBe<OrgStatus>("overdue");
  });
  it("overdue when hasOverdueTask=true even without actions", () => {
    const r = computeOrgStatus({ actions: [], hasOverdueTask: true });
    expect(r.status).toBe<OrgStatus>("overdue");
  });
});
