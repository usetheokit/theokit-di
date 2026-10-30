---
"@theokit/orm": patch
---

`@Transactional` refuses a synchronous SQLite driver with `OrmConfigurationError` before the method
body runs (usetheokit/theokit-di#76).

On better-sqlite3 an async `@Transactional` method used to run outside any transaction. The driver
rejects an async callback with `TypeError: Transaction function cannot return a promise`, but only
after the callback returned, so the method had already started. Measured on better-sqlite3 with a
method that inserts a row and then throws: the caller got the `TypeError`, the method's own error
escaped as an unhandled rejection, and the row stayed in the table.

The decorator now reads drizzle's `resultKind` on the db handle and refuses `"sync"` drivers
(better-sqlite3, bun:sqlite, sql.js, expo-sqlite) before calling the method. Nothing is written and
nothing escapes. A transaction on one synchronous connection cannot stay open across an `await`
without taking in whatever else runs on that connection meanwhile, so emulating it with a manual
`BEGIN`/`COMMIT` was rejected. libSQL, D1, Postgres and MySQL drivers are unaffected.

The README's Transactions example now binds the DataSource, which it never did, so copying it no
longer ends in `OrmConfigurationError` (usetheokit/theokit-di#75). The suite runs that example
against a real Postgres engine, so it cannot drift again.
