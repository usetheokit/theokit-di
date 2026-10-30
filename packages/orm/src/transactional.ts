import { OrmConfigurationError } from "./errors.js";
import { withTxContext } from "./internal/tx-context.js";
import type { DataSource } from "./types.js";

const DATA_SOURCE_KEY = Symbol.for("Theo:orm:dataSource");

/**
 * Attach a {@link DataSource} to an instance so its `@Transactional` methods can find one.
 *
 * `@Transactional` is a method decorator: it runs at class-definition time and has no
 * container to ask, so the DataSource has to be put on the instance before the method is
 * called. Nothing does that for you — not `OrmModule`, not the container.
 *
 * With the container, inject the DataSource and bind it in a `@PostConstruct` hook, which
 * runs after construction with every dependency already in place:
 *
 * @example
 * ```ts
 * @Injectable()
 * class TransferService {
 *   constructor(@Inject(ORM_DATA_SOURCE_TOKEN) private readonly ds: DataSource) {}
 *
 *   @PostConstruct
 *   bindTransactions() {
 *     bindDataSourceToInstance(this, this.ds);
 *   }
 *
 *   @Transactional()
 *   async transfer() { ... }
 * }
 * ```
 *
 * Without the container, call it directly on the instance before invoking the method.
 */
export function bindDataSourceToInstance(instance: object, ds: DataSource): void {
  (instance as Record<symbol, unknown>)[DATA_SOURCE_KEY] = ds;
}

function readDataSourceFromInstance(instance: object): DataSource | undefined {
  const v = (instance as Record<symbol, unknown>)[DATA_SOURCE_KEY];
  return (v as DataSource | undefined) ?? undefined;
}

/** Options for {@link Transactional}. */
export interface TransactionalOptions {
  /**
   * Isolation level for the transaction, passed straight to the driver.
   *
   * Rejected on `sqlite`, which has no per-transaction isolation level to set — see
   * the note in {@link Transactional}.
   */
  isolationLevel?: "read uncommitted" | "read committed" | "repeatable read" | "serializable";
}

/**
 * Dialects that accept an isolation level on `db.transaction(cb, config)`.
 *
 * SQLite is deliberately absent. Its transactions take a `behavior` (deferred, immediate,
 * exclusive), not an isolation level, so a level passed there would be dropped on the
 * floor — and a silently ignored isolation level is the kind of thing that looks fine in
 * review and corrupts data under load.
 */
const DIALECTS_WITH_ISOLATION_LEVEL: ReadonlySet<DataSource["dialect"]> = new Set(["pg", "mysql"]);

/**
 * `@Transactional(options?)` — run a method inside a database transaction.
 *
 * The wrapped method executes within `db.transaction(...)`, and the transaction handle is
 * published on the async context, so every `Repository` call made during the method, at
 * any depth of `await`, runs on the transaction. The method's resolved value is returned;
 * anything it throws rolls the transaction back.
 *
 * The instance must carry a DataSource before the method runs — see
 * {@link bindDataSourceToInstance}, which is the only thing that puts one there.
 *
 * The driver must run transactions asynchronously. Drizzle's synchronous SQLite drivers
 * (better-sqlite3, bun:sqlite, sql.js, expo-sqlite) are refused with
 * {@link OrmConfigurationError} before the method body runs: a transaction on one synchronous
 * connection cannot stay open across an `await`, and the method would otherwise run, and
 * write, outside any transaction. libSQL and D1 are asynchronous and supported.
 */
export function Transactional(opts: TransactionalOptions = {}): MethodDecorator {
  return function transactionalDecorator(
    _target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const original = descriptor.value;
    if (typeof original !== "function") {
      throw new OrmConfigurationError(
        `@Transactional on ${String(propertyKey)}: target is not a method.`,
      );
    }

    descriptor.value = async function transactionalWrapper(
      this: object,
      ...args: unknown[]
    ): Promise<unknown> {
      const transaction = resolveTransactionFn(this, propertyKey, opts);

      const run = (tx: unknown): Promise<unknown> =>
        withTxContext(tx, () => original.apply(this, args));

      // Only pass a config when one was asked for: drivers differ on what an empty
      // config object means, and the no-options case must stay byte-identical to before.
      return opts.isolationLevel === undefined
        ? transaction(run)
        : transaction(run, { isolationLevel: opts.isolationLevel });
    };

    return descriptor;
  };
}

type TransactionFn = (cb: (tx: unknown) => Promise<unknown>, config?: unknown) => Promise<unknown>;

/**
 * Everything that has to be true before a transaction can start, checked in one place so
 * the wrapper above stays readable: an instance carries a DataSource, the dialect can
 * honour the requested isolation level, and the driver exposes `transaction()`.
 */
function resolveTransactionFn(
  instance: object,
  propertyKey: string | symbol,
  opts: TransactionalOptions,
): TransactionFn {
  const where = `@Transactional ${String(propertyKey)}`;

  const ds = readDataSourceFromInstance(instance);
  if (!ds) {
    throw new OrmConfigurationError(
      `${where}: no DataSource bound to instance. ` +
        `Call bindDataSourceToInstance(this, dataSource) before invoking the method — ` +
        `from a @PostConstruct hook when the class is container-managed, or directly ` +
        `after construction when it is not.`,
    );
  }

  if (opts.isolationLevel !== undefined && !DIALECTS_WITH_ISOLATION_LEVEL.has(ds.dialect)) {
    throw new OrmConfigurationError(
      `${where}: isolationLevel "${opts.isolationLevel}" is not supported on ${ds.dialect}. ` +
        `Remove the option, or use a dialect that has isolation levels (pg, mysql).`,
    );
  }

  const db = ds.db as { transaction?: TransactionFn; resultKind?: unknown };
  if (typeof db.transaction !== "function") {
    throw new OrmConfigurationError(
      `${where}: DataSource.db does not expose .transaction(). ` +
        `Ensure you passed a Drizzle db instance.`,
    );
  }

  // Checked before the method runs, because afterwards is too late: a synchronous driver throws
  // "Transaction function cannot return a promise" only once the callback has returned, by which
  // point the method has started and keeps running, and writing, with no transaction around it.
  if (db.resultKind === "sync") {
    throw new OrmConfigurationError(
      `${where}: the ${ds.dialect} driver behind DataSource "${ds.name}" runs transactions ` +
        `synchronously (better-sqlite3, bun:sqlite, sql.js, expo-sqlite), and a synchronous ` +
        `transaction cannot stay open across an await. Use an asynchronous driver, or call ` +
        `db.transaction((tx) => { ... }) directly with synchronous statements inside.`,
    );
  }

  return db.transaction.bind(db);
}
