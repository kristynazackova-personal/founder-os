import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Her standing rule is hyphens, never em dashes, and a sweep only holds if
 * something keeps it swept - an em dash is one keystroke and invisible in
 * review.
 *
 * The one exception is the character used as DATA: "—" is what a tile prints
 * when a metric cannot be computed (domain/b2c.ts, notMeasurable), and the
 * copy that quotes that marker has to spell it the same way. So this allows
 * the dash only when it is wrapped in quotes or backticks, and rejects it
 * everywhere else.
 */
const ROOT = path.resolve(import.meta.dirname, "..");
const EM = "—";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|css)$/.test(entry)) out.push(full);
  }
  return out;
}

/** The marker itself, or copy quoting it: "—" · `—` · “—” · &ldquo;—&rdquo; */
const isMarker = (line: string, index: number): boolean => {
  const before = line.slice(Math.max(0, index - 8), index);
  const after = line.slice(index + 1, index + 9);
  if (/["`“]$/.test(before) && /^["`”]/.test(after)) return true;
  return before.endsWith("&ldquo;") && after.startsWith("&rdquo;");
};

describe("no em dashes in source", () => {
  it("uses hyphens in every string, comment and class name", () => {
    const offenders: string[] = [];
    for (const file of walk(path.join(ROOT, "src"))) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, n) => {
        let i = line.indexOf(EM);
        while (i !== -1) {
          if (!isMarker(line, i)) offenders.push(`${path.relative(ROOT, file)}:${n + 1} ${line.trim().slice(0, 70)}`);
          i = line.indexOf(EM, i + 1);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it("still allows the not-computable marker, which is data rather than prose", () => {
    expect(isMarker('  return "—";', 10)).toBe(true);
    expect(isMarker("the band `—` means", 10)).toBe(true);
    expect(isMarker("a sentence — with prose", 11)).toBe(false);
  });
});
