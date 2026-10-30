/**
 * The README's Transactions example, executed as written.
 *
 * The example once showed a container-managed `@Transactional` service with nothing binding a
 * DataSource to the instance, so a reader who copied it got `OrmConfigurationError` on the first
 * call. Nothing caught it because nothing ran it.
 *
 * This suite takes the first `typescript` block under `## Transactions` out of README.md, writes it
 * to a module next to this file, and drives the class it defines through a real container and a
 * real Postgres engine (PGlite, in process). Editing the README into something that does not run
 * fails here. The only rewrite applied is the `@theokit/orm` specifier, pointed at `src/` so the
 * example is checked against the code in this checkout rather than the last published build.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { Container } from "@theokit/di";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { OrmModule } from "../../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const readmePath = join(here, "../../README.md");
const generatedDir = join(here, ".readme-generated");
const generatedFile = join(generatedDir, "transactions-example.ts");

function extractTransactionsBlock(readme: string): string {
  const section = readme.split(/^## Transactions\s*$/m)[1];
  if (section === undefined) {
    throw new Error(`README.md has no "## Transactions" section (${readmePath}).`);
  }
  const block = /```typescript\n([\s\S]*?)\n```/.exec(section.split(/^## /m)[0] ?? "");
  if (!block?.[1]) {
    throw new Error(`README.md "## Transactions" has no \`\`\`typescript block (${readmePath}).`);
  }
  return block[1];
}

// biome-ignore lint/suspicious/noExplicitAny: the example module is generated at test time, so its exports have no static type
let example: any;
let client: PGlite;

beforeAll(async () => {
  const srcIndex = pathToFileURL(join(here, "../../src/index.ts")).href;
  const code = extractTransactionsBlock(readFileSync(readmePath, "utf8")).replaceAll(
    'from "@theokit/orm"',
    `from ${JSON.stringify(srcIndex)}`,
  );
  mkdirSync(generatedDir, { recursive: true });
  writeFileSync(generatedFile, `${code}\n\nexport { accounts, TransferService };\n`);
  example = await import(pathToFileURL(generatedFile).href);
});

afterAll(() => {
  rmSync(generatedDir, { recursive: true, force: true });
});

beforeEach(async () => {
  OrmModule._resetForTesting();
  client = new PGlite();
  await client.exec(
    "create table accounts (id text primary key, balance integer not null);" +
      "insert into accounts values ('alice', 100), ('bob', 0);",
  );
});

function resolveService(): {
  transfer: (from: string, to: string, amount: number) => Promise<void>;
} {
  const { accounts, TransferService } = example;
  const db = drizzle(client, { schema: { accounts } });
  const container = new Container({
    providers: [
      ...OrmModule.forRoot({ schema: { accounts }, dialect: "pg", db }),
      ...OrmModule.forFeature([accounts]),
      TransferService,
    ],
  });
  return container.resolve(TransferService);
}

async function balances(): Promise<Record<string, number>> {
  const { rows } = await client.query<{ id: string; balance: number }>(
    "select id, balance from accounts order by id",
  );
  return Object.fromEntries(rows.map((r) => [r.id, r.balance]));
}

describe("README Transactions example", () => {
  it("commits a transfer that succeeds", async () => {
    await resolveService().transfer("alice", "bob", 30);
    expect(await balances()).toEqual({ alice: 70, bob: 30 });
  });

  it("rolls back every write of a transfer that throws", async () => {
    await expect(resolveService().transfer("alice", "bob", 500)).rejects.toThrow(
      /insufficient funds/,
    );
    expect(await balances()).toEqual({ alice: 100, bob: 0 });
  });
});
