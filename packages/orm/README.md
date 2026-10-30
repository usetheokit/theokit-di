# @theokit/orm

Repository pattern + `@InjectRepository` decorator + agent-aware columns + `@Transactional` + schema export polyglot over `drizzle-orm`, consuming `@theokit/di` for inversion of control.

NestJS TypeORM-equivalent DX for the theokit ecosystem, but built on Drizzle (Apache-2.0, edge-runtime ready, zero codegen).

## Install

```bash
pnpm add @theokit/orm @theokit/di reflect-metadata drizzle-orm
pnpm add -D drizzle-kit
```

Your `tsconfig.json` MUST enable:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

## Quickstart

```typescript
import "reflect-metadata";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { Container, Injectable } from "@theokit/di";
import { OrmModule, Repository, InjectRepository } from "@theokit/orm";

const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  agentId: text("agent_id"),
});

const sqlite = new Database(":memory:");
const db = drizzle(sqlite, { schema: { users } });

const container = new Container({
  providers: [
    ...OrmModule.forRoot({ schema: { users }, dialect: "sqlite", db }),
    ...OrmModule.forFeature([users]),
  ],
});

@Injectable()
class UserService {
  constructor(@InjectRepository(users) private readonly repo: Repository<typeof users>) {}

  async create(id: string, name: string) {
    return this.repo.insert({ id, name });
  }

  async list() {
    return this.repo.findMany();
  }
}
```

## Agent-aware columns

Wrap a flow with `withAgentContext({...})` and any column matching `agentId`, `runId`, or `conversationId` will be auto-filled on `insert`/`update`:

```typescript
import { withAgentContext } from "@theokit/orm";

await withAgentContext({ agentId: "agent-123", runId: "run-456" }, async () => {
  await repo.insert({ id: "u1", name: "Ada" });
  // → row.agent_id = "agent-123", row.run_id = "run-456"
});
```

## Transactions

`@Transactional()` runs a method inside `db.transaction(...)`. Repository calls made during that
method, at any depth of `await`, go through the transaction, and a throw rolls all of them back.

The decorator has no container to ask for a DataSource, so the class injects one and puts it on the
instance with `bindDataSourceToInstance` in a `@PostConstruct` hook. Without that call, the first
transactional method rejects with `OrmConfigurationError`.

```typescript
import { Inject, Injectable, PostConstruct } from "@theokit/di";
import { integer, pgTable, text } from "drizzle-orm/pg-core";
import {
  bindDataSourceToInstance,
  type DataSource,
  InjectRepository,
  ORM_DATA_SOURCE_TOKEN,
  type Repository,
  Transactional,
} from "@theokit/orm";

const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  balance: integer("balance").notNull(),
});

@Injectable()
class TransferService {
  constructor(
    @InjectRepository(accounts) private readonly accountsRepo: Repository<typeof accounts>,
    @Inject(ORM_DATA_SOURCE_TOKEN) private readonly dataSource: DataSource,
  ) {}

  @PostConstruct
  bindTransactions() {
    bindDataSourceToInstance(this, this.dataSource);
  }

  @Transactional()
  async transfer(from: string, to: string, amount: number) {
    const source = await this.accountsRepo.findById(from);
    const target = await this.accountsRepo.findById(to);
    if (!source || !target) throw new Error("unknown account");

    await this.accountsRepo.update(from, { balance: source.balance - amount });
    // Throwing here rolls back the debit above.
    if (source.balance < amount) throw new Error("insufficient funds");
    await this.accountsRepo.update(to, { balance: target.balance + amount });
  }
}
```

Register it with a driver whose transactions are asynchronous, such as `node-postgres`:

```typescript
import { Container } from "@theokit/di";
import { OrmModule } from "@theokit/orm";
import { drizzle } from "drizzle-orm/node-postgres";

const db = drizzle(process.env.DATABASE_URL!, { schema: { accounts } });

const container = new Container({
  providers: [
    ...OrmModule.forRoot({ schema: { accounts }, dialect: "pg", db }),
    ...OrmModule.forFeature([accounts]),
    TransferService,
  ],
});

await container.resolve(TransferService).transfer("alice", "bob", 30);
```

The first block is executed by the test suite against a real Postgres engine, so it stays runnable.

### Synchronous SQLite drivers

`better-sqlite3`, `bun:sqlite`, `sql.js` and `expo-sqlite` run transactions synchronously, and a
transaction on one synchronous connection cannot stay open across an `await`. `@Transactional`
refuses these drivers with `OrmConfigurationError` before the method body runs, so nothing is
written outside a transaction. Asynchronous SQLite drivers (libSQL, D1) are supported. On a
synchronous driver, call `db.transaction((tx) => { ... })` yourself with synchronous statements
inside.

## Schema export (polyglot)

```typescript
import { exportSchemas } from "@theokit/orm/schema-export";

const schemas = exportSchemas({ users });
// schemas.users is JSON Schema 7 — consumable by SQLAlchemy, Tortoise, Pydantic, etc.
```

## License

Apache-2.0
