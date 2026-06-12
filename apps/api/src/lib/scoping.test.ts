import { describe, it, expect } from "vitest";
import {
  orgStrictScope,
  orgViewScope,
  clientGroupScope,
  sectionScope,
  ticketScope,
  taskScope,
} from "./scoping.js";

const USER = "user-1";

// Ожидаемые «строительные блоки» фильтров
const sectionMemberFilter = { section: { members: { some: { userId: USER } } } };
const orgMemberFilter = { members: { some: { userId: USER } } };

describe("orgStrictScope", () => {
  it("admin → {} (видит всё)", () => {
    expect(orgStrictScope(USER, ["admin"])).toEqual({});
  });

  it("РЕГРЕССИЯ tickets.ts: supervisor → {} (не падает в client-скоуп)", () => {
    expect(orgStrictScope(USER, ["supervisor"])).toEqual({});
  });

  it("manager → фильтр по своим участкам (SectionMember)", () => {
    expect(orgStrictScope(USER, ["manager"])).toEqual(sectionMemberFilter);
  });

  it("accountant → фильтр по своим участкам (SectionMember)", () => {
    expect(orgStrictScope(USER, ["accountant"])).toEqual(sectionMemberFilter);
  });

  it("client → только свои организации (OrganizationMember)", () => {
    expect(orgStrictScope(USER, ["client"])).toEqual(orgMemberFilter);
  });
});

describe("orgViewScope", () => {
  it("admin → {} (видит всё)", () => {
    expect(orgViewScope(USER, ["admin"])).toEqual({});
  });

  it("РЕГРЕССИЯ tickets.ts: supervisor → {} (не падает в client-скоуп)", () => {
    expect(orgViewScope(USER, ["supervisor"])).toEqual({});
  });

  it("manager → свои участки ПЛЮС организации клиентских групп с оргой участка", () => {
    expect(orgViewScope(USER, ["manager"])).toEqual({
      OR: [
        sectionMemberFilter,
        {
          clientGroupId: { not: null },
          clientGroup: {
            organizations: { some: sectionMemberFilter },
          },
        },
      ],
    });
  });

  it("accountant → тот же секционный OR-скоуп, что и manager", () => {
    expect(orgViewScope(USER, ["accountant"])).toEqual(orgViewScope(USER, ["manager"]));
  });

  it("client → только свои организации (OrganizationMember), без расширения на группу", () => {
    expect(orgViewScope(USER, ["client"])).toEqual(orgMemberFilter);
  });
});

describe("clientGroupScope", () => {
  it("admin → {} (видит всё)", () => {
    expect(clientGroupScope(USER, ["admin"])).toEqual({});
  });

  it("РЕГРЕССИЯ tickets.ts: supervisor → {} (не падает в client-скоуп)", () => {
    expect(clientGroupScope(USER, ["supervisor"])).toEqual({});
  });

  it("manager/accountant → группа с хотя бы одной оргой своего участка", () => {
    const expected = { organizations: { some: sectionMemberFilter } };
    expect(clientGroupScope(USER, ["manager"])).toEqual(expected);
    expect(clientGroupScope(USER, ["accountant"])).toEqual(expected);
  });

  it("client → группа с хотя бы одной своей организацией (membership)", () => {
    expect(clientGroupScope(USER, ["client"])).toEqual({
      organizations: { some: orgMemberFilter },
    });
  });
});

describe("sectionScope", () => {
  it("admin → {} (видит всё)", () => {
    expect(sectionScope(USER, ["admin"])).toEqual({});
  });

  it("РЕГРЕССИЯ tickets.ts: supervisor → {} (не падает в членский скоуп)", () => {
    expect(sectionScope(USER, ["supervisor"])).toEqual({});
  });

  it("manager/accountant → только участки, где он member", () => {
    const expected = { members: { some: { userId: USER } } };
    expect(sectionScope(USER, ["manager"])).toEqual(expected);
    expect(sectionScope(USER, ["accountant"])).toEqual(expected);
  });

  it("client → членский фильтр (фактически пустой результат: клиент не SectionMember)", () => {
    expect(sectionScope(USER, ["client"])).toEqual({ members: { some: { userId: USER } } });
  });
});

describe("ticketScope", () => {
  it("admin → {} (видит всё)", () => {
    expect(ticketScope(USER, ["admin"])).toEqual({});
  });

  it("РЕГРЕССИЯ tickets.ts: supervisor → {} — исторический баг ронял его в client-скоуп", () => {
    expect(ticketScope(USER, ["supervisor"])).toEqual({});
  });

  it("manager/accountant → тикеты организаций своих участков", () => {
    const expected = { organization: sectionMemberFilter };
    expect(ticketScope(USER, ["manager"])).toEqual(expected);
    expect(ticketScope(USER, ["accountant"])).toEqual(expected);
  });

  it("client → тикеты организаций, где он member с ролью client", () => {
    expect(ticketScope(USER, ["client"])).toEqual({
      organization: { members: { some: { userId: USER, role: "client" } } },
    });
  });
});

describe("taskScope", () => {
  it("admin → {} (видит всё)", () => {
    expect(taskScope(USER, ["admin"])).toEqual({});
  });

  it("РЕГРЕССИЯ tickets.ts: supervisor → {} (не падает в client-скоуп)", () => {
    expect(taskScope(USER, ["supervisor"])).toEqual({});
  });

  it("manager → секционный скоуп + личные задачи без организации (creator/assignee fallback)", () => {
    expect(taskScope(USER, ["manager"])).toEqual({
      OR: [
        { organization: sectionMemberFilter },
        {
          AND: [
            { organizationId: null },
            { OR: [{ createdById: USER }, { assignees: { some: { userId: USER } } }] },
          ],
        },
      ],
    });
  });

  it("accountant → тот же скоуп, что и manager", () => {
    expect(taskScope(USER, ["accountant"])).toEqual(taskScope(USER, ["manager"]));
  });

  it("client → только созданные им или назначенные на него задачи", () => {
    expect(taskScope(USER, ["client"])).toEqual({
      OR: [{ createdById: USER }, { assignees: { some: { userId: USER } } }],
    });
  });

  it("пользователь с ролями manager+client скоупится как staff (manager-ветка важнее)", () => {
    expect(taskScope(USER, ["manager", "client"])).toEqual(taskScope(USER, ["manager"]));
  });
});
