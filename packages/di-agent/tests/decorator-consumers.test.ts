import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * usetheokit/theokit-di#70 — the decorators record metadata and the export list reads like a promise
 * that something runs it. The README now says which readers have a consumer and which do not. This
 * keeps that table true.
 *
 * It fails when a reader gains a consumer, which is the RIGHT direction to fail in: wiring one is
 * good news the README must be told about. A test that asserted "nothing reads these" and had to be
 * deleted on the first wiring would be a test that punishes progress.
 *
 * Scope is deliberately this package. Whether something OUTSIDE it reads a decorator is not
 * knowable from here — that measurement lives in the issue, with its date, and no test in one
 * repository can hold it.
 */
const SRC = join(__dirname, "..", "src");
const README = readFileSync(join(__dirname, "..", "README.md"), "utf8");

/** Every file under `src/`, recursively. */
function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sources(full));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

/** Every `read*Metadata` this package defines. */
function declaredReaders(files: readonly string[]): ReadonlySet<string> {
  const readers = new Set<string>();
  for (const f of files) {
    for (const m of readFileSync(f, "utf8").matchAll(
      /\bexport function (read[A-Za-z]*Metadata)\b/g,
    )) {
      if (m[1] !== undefined) readers.add(m[1]);
    }
  }
  return readers;
}

/**
 * Files that could consume a reader: everything under `src/` except the decorator that defines one
 * and the barrel that re-exports it. Both mention every reader by construction, so counting them
 * would make every reader look consumed.
 */
function consumerCandidates(files: readonly string[]): readonly string[] {
  return files.filter((f) => !f.includes("decorators/") && !f.endsWith("index.ts"));
}

/** The readers some file under `src/` actually references. */
function readersWithAConsumer(): ReadonlySet<string> {
  const files = sources(SRC);
  const readers = declaredReaders(files);
  expect(readers.size, "no readers found — the scan is reading nothing").toBeGreaterThan(0);

  const texts = consumerCandidates(files).map((f) => readFileSync(f, "utf8"));
  return new Set([...readers].filter((r) => texts.some((t) => t.includes(r))));
}

/**
 * The ROW, not the document.
 *
 * The first version of the assertion below searched the whole README for `` `@Tool` `` and passed
 * after a reader for it was wired, because the section's opening paragraph names every decorator.
 * Green for a reason unrelated to its claim — the second time in one sitting, which is why it is
 * written down here rather than merely fixed.
 */
function decoratorsTheReadmeCallsRead(): ReadonlySet<string> {
  const row = README.match(/^\| (`@[^|]*`) \| `workflow-builder\.ts`[^|]*\|/m)?.[1];
  expect(row, "the README row this reads is gone — update this test with it").toBeDefined();
  return new Set(
    [...(row ?? "").matchAll(/`@([A-Za-z]+)`/g)]
      .map((m) => m[1])
      .filter((n): n is string => n !== undefined),
  );
}

describe("the README's claim about decorator consumers", () => {
  it("names every reader this package actually consumes", () => {
    const consumed = readersWithAConsumer();
    const listed = decoratorsTheReadmeCallsRead();
    expect(
      listed.size,
      "the README row lists nothing — the row regex is reading nothing",
    ).toBeGreaterThan(0);

    for (const reader of consumed) {
      const decorator = reader.replace(/^read/, "").replace(/Metadata$/, "");
      expect(
        [...listed],
        `read${decorator}Metadata has a consumer under src/ and the README row omits @${decorator}`,
      ).toContain(decorator);
    }
  });

  it("does not claim a consumer that does not exist", () => {
    const consumed = readersWithAConsumer();
    for (const decorator of decoratorsTheReadmeCallsRead()) {
      expect(
        [...consumed],
        `the README says @${decorator} is read, and no file under src/ reads read${decorator}Metadata`,
      ).toContain(`read${decorator}Metadata`);
    }
  });
});
