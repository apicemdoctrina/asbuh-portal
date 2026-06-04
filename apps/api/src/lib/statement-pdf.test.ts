import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseStatement } from "./statement-parser.js";
import { reconcile } from "./statement-reconcile.js";
import { generatePdf } from "./statement-pdf.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const load = (name: string) => readFileSync(path.join(dir, "__fixtures__", name));

describe("generatePdf", () => {
  it("returns a non-empty PDF buffer", async () => {
    const st = parseStatement(load("sber.txt"));
    const buf = await generatePdf(st, reconcile(st), { orgName: "ООО Наша Фирма" });
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});
