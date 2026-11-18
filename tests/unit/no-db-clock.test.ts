import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p) : [p];
  });
}

describe("src/server", () => {
  const all = files(path.join(process.cwd(), "src/server"));
  it("does not use the database clock or Date-mode columns", () => {
    for (const f of all) {
      const text = fs.readFileSync(f, "utf8");
      const sqlish = text.replace(/Date\.now\(\)|defaultNow\(\)/g, "");
      expect(sqlish, f).not.toMatch(/\bNOW\(\)|CURDATE\(\)|CURRENT_TIMESTAMP|UTC_TIMESTAMP/i);
      expect(text, f).not.toMatch(/mode:\s*["']date["']/);
    }
  });
  it("starts every file with import \"server-only\"", () => {
    for (const f of all) {
      expect(fs.readFileSync(f, "utf8"), f).toMatch(/^import "server-only";/);
    }
  });
});
