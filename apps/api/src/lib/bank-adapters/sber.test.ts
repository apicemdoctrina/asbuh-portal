import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const sberFixture = readFileSync(path.join(dir, "..", "__fixtures__", "sber.txt"));

vi.mock("./sber-mtls.js", () => ({
  getSberConfig: () => ({ baseUrl: "x", clientId: "x", clientSecret: "x", dispatcher: {} }),
}));
vi.mock("./sber-client.js", () => ({
  refreshAccessToken: vi.fn(),
  fetchDailyFile: vi.fn(),
}));

import { sberAdapter } from "./sber.js";
import { refreshAccessToken, fetchDailyFile } from "./sber-client.js";

const ctxBase = {
  accountNumber: "40702810000000000001",
  accountId: null,
  credential: "ref-old",
  saveCredential: vi.fn(),
};

describe("sberAdapter.fetchStatement", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ротация refresh → saveCredential вызван; дни слиты", async () => {
    (refreshAccessToken as ReturnType<typeof vi.fn>).mockResolvedValue({
      accessToken: "acc",
      refreshToken: "ref-new",
    });
    // два дня периода → два файла (берём одну фикстуру дважды)
    (fetchDailyFile as ReturnType<typeof vi.fn>).mockResolvedValue(sberFixture);

    const st = await sberAdapter.fetchStatement({
      ...ctxBase,
      start: "2026-01-01",
      end: "2026-01-02",
    });

    expect(ctxBase.saveCredential).toHaveBeenCalledWith("ref-new");
    expect(fetchDailyFile).toHaveBeenCalledTimes(2);
    expect(st.accounts[0].operations.length).toBeGreaterThan(0);
    expect(st.meta.dateStart).toBe("01.01.2026");
    expect(st.meta.dateEnd).toBe("02.01.2026");
  });

  it("нет ротации → saveCredential НЕ вызывается; пустые дни пропускаются", async () => {
    (refreshAccessToken as ReturnType<typeof vi.fn>).mockResolvedValue({
      accessToken: "acc",
      refreshToken: "ref-old", // тот же
    });
    (fetchDailyFile as ReturnType<typeof vi.fn>).mockResolvedValue(null); // нет данных

    const st = await sberAdapter.fetchStatement({
      ...ctxBase,
      start: "2026-01-01",
      end: "2026-01-01",
    });

    expect(ctxBase.saveCredential).not.toHaveBeenCalled();
    expect(st.accounts[0].operations).toHaveLength(0);
  });
});
