/**
 * `@Transactional` on a synchronous SQLite driver, against a real better-sqlite3 database.
 *
 * Drizzle's better-sqlite3 driver runs `db.transaction(cb)` synchronously and throws
 * `Transaction function cannot return a promise` once `cb` returns a promise. `@Transactional`
 * always hands it an async callback, and by the time the driver threw, the decorated method had
 * already started: it kept running with no transaction around it, its writes committed, and its
 * own error escaped as an unhandled rejection while the caller got an unrelated TypeError.
 *
 * A transaction on a single synchronous connection cannot span an `await` without swallowing
 * whatever else runs on that connection in the meantime, so the decorator refuses before the
 * method body runs instead of offering semantics it cannot keep.
 */

import { Container, Inject, Injectable, PostConstruct } from "@theokit/di";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  bindDataSourceToInstance,
  type DataSource,
  InjectRepository,
  ORM_DATA_SOURCE_TOKEN,
  OrmConfigurationError,
  OrmModule,
  type Repository,
  Transactional,
} from "../../src/index.js";

const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  balance: integer("balance").notNull(),
});

let sqlite: Database.Database;
const unhandled: unknown[] = [];
const recordUnhandled = (reason: unknown): void => {
  unhandled.push(reason);
};

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.exec("create table accounts (id text primary key, balance integer not null)");
  OrmModule._resetForTesting();
  unhandled.length = 0;
  process.on("unhandledRejection", recordUnhandled);
});

afterEach(() => {
  process.off("unhandledRejection", recordUnhandled);
  sqlite.close();
  OrmModule._resetForTesting();
});

function countRows(): number {
  return (sqlite.prepare("select count(*) as n from accounts").get() as { n: number }).n;
}

describe("@Transactional on better-sqlite3", () => {
  it("refuses with OrmConfigurationError before the method body runs", async () => {
    let bodyRan = false;

    @Injectable()
    class TransferService {
      constructor(
        @InjectRepository(accounts) private readonly accountsRepo: Repository<typeof accounts>,
        @Inject(ORM_DATA_SOURCE_TOKEN) private readonly dataSource: DataSource,
      ) {}

      @PostConstruct
      bindTransactions(): void {
        bindDataSourceToInstance(this, this.dataSource);
      }

      @Transactional()
      async transfer(from: string, amount: number): Promise<void> {
        bodyRan = true;
        await this.accountsRepo.insert({ id: from, balance: amount });
        throw new Error("boom: should roll back");
      }
    }

    const db = drizzle(sqlite, { schema: { accounts } });
    const container = new Container({
      providers: [
        ...OrmModule.forRoot({ schema: { accounts }, dialect: "sqlite", db }),
        ...OrmModule.forFeature([accounts]),
        TransferService,
      ],
    });

    const call = container.resolve(TransferService).transfer("a", 10);
    await expect(call).rejects.toThrow(OrmConfigurationError);
    await expect(call).rejects.toThrow(/synchronous/);

    // Give a stray continuation of the method body time to surface.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(bodyRan).toBe(false);
    expect(countRows()).toBe(0);
    expect(unhandled).toEqual([]);
  });

  it("refuses a method that is not async too, since the driver cannot tell the two apart", async () => {
    class Service {
      @Transactional()
      run(): string {
        return "ran";
      }
    }

    const svc = new Service();
    bindDataSourceToInstance(svc, {
      name: "default",
      dialect: "sqlite",
      schema: { accounts },
      db: drizzle(sqlite, { schema: { accounts } }),
    });

    await expect(svc.run() as unknown as Promise<string>).rejects.toThrow(OrmConfigurationError);
  });
});
