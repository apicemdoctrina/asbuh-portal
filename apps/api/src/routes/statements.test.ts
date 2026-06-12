import { describe, it, expect } from "vitest";
import { getStatementScopedWhere } from "./statements/helpers.js";

describe("getStatementScopedWhere", () => {
  it("returns {} for admin and supervisor", () => {
    expect(getStatementScopedWhere({ userId: "u1", roles: ["admin"] })).toEqual({});
    expect(getStatementScopedWhere({ userId: "u1", roles: ["supervisor"] })).toEqual({});
  });

  it("scopes manager/accountant to their sections", () => {
    const w = getStatementScopedWhere({ userId: "u9", roles: ["accountant"] });
    expect(w).toEqual({
      organization: { section: { members: { some: { userId: "u9" } } } },
    });
  });

  it("returns impossible filter for client (no access)", () => {
    const w = getStatementScopedWhere({ userId: "u9", roles: ["client"] });
    expect(w).toEqual({ id: "__none__" });
  });
});
