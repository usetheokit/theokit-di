# Changelog

## 0.4.0

### Minor Changes

- 33670b7: Realign the `@theokit/sdk` peer with the SDK this package actually imports.

  **Install-contract break.** `@theokit/sdk` moves from `^1.3.0` to `>=4.0.1 <5`. An app pinned below
  4 stops satisfying the peer. Minor bump because the version is still 0.x, where minor is the
  breaking slot.

  The old range described nothing that existed. `src/workflow-builder.ts` imports
  `@theokit/sdk/workflow` at runtime, the package is developed and tested against the modern SDK, and
  the published SDK has been on 4.x for months — so `npm i @theokit/di-agent @theokit/sdk@^4` ended in
  `ERESOLVE`, and pnpm users got a peer warning for a combination that was never supported.
  (usetheokit/theokit-di#40)

  Verified at both ends of the new range: the suite passes against 4.0.1 and against 4.57.0. The
  `@theokit/sdk` devDependency moves to `^4.57.0` for the same reason the range went stale unnoticed —
  CI was resolving 1.x, compiling against it, and going green on a combination no consumer installs.

### Patch Changes

- 5bb0600: O peer range do `@theokit/di` deixa de prometer uma versão em que o pacote não funciona.

  Declarava `^0.1.0-next.0 || ^0.2.0`, e o piso resolvível disso é `0.1.0` — que **não exporta
  `METADATA_KEYS`**, um símbolo que `src/` importa. Um consumidor que resolvesse para 0.1.0 instalava
  sem erro e partia nos decorators.

  Medido antes de escrever o novo range, versão a versão: `0.1.0` não tem o símbolo, `0.1.1` tem,
  `0.2.0` tem. O range passa a ser `>=0.1.1 <0.3`, que é o que a suíte prova.

  Encontrado pelo leg `suite at the bottom of every declared range` do dep-check, que instala o piso
  de cada range declarado e corre os testes contra ele — 31 falharam. É a única forma de um piso
  mentiroso aparecer: nada mais no CI instala a versão mínima.

All notable changes to `@theokit/di-agent` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Installing this package next to the `@theokit/sdk` it actually needs no longer fails. The declared
  peer range was `^1.3.0` while the package imports `@theokit/sdk/workflow` at runtime and the SDK
  has been on 4.x for months, so `npm i @theokit/di-agent @theokit/sdk@^4` ended in `ERESOLVE` and
  pnpm users got a peer warning for a combination that was never supported. The range is now
  `>=4.0.1 <5`, verified at both ends: the suite passes against 4.0.1 and against 4.57.0. (#40)

## [0.3.0] - 2026-08-21

### Added

- Every published export now carries documentation an editor can show. Measured on the emitted
  declarations, 16/56 to 56/56. Each decorator now states the thing a reader cannot infer from its
  signature: this package records metadata and nothing here acts on it — the runtime that
  does lives in `@theokit/sdk`. (#24)

- npm provenance is enabled again. It was switched off because npm refuses attestation for packages built from a private source repository; this one is public now, so published tarballs carry a sigstore attestation linking them to the commit and workflow that produced them.
- `DecoratedClass` — the constructor type the decorator reader helpers accept, exported so consumers can name it.

### Changed

- The peer range on `@theokit/di` accepts `^0.2.0` alongside `^0.1.0-next.0`. `@theokit/di`
  ships breaking disposal fixes as `0.2.0`, which falls outside the old range; without this,
  installing both current versions would report an unmet peer dependency, and the release
  tooling would force this package to `1.0.0` to express the incompatibility. Nothing here
  uses the behaviour that changed — the decorators record metadata and the container never
  disposed anything this package registers. (#20)
- `repository`, `homepage` and `bugs` now point at `usetheokit/theokit-di`. They pointed at `usetheo/theokit-sdk`, so every "Repository" and "Report issues" link on npm led to a project that does not host this package.
- `readAuthMetadata`, `readEvalDecoratorMetadata` and `readWorkflowMetadata` now declare their parameter as `DecoratedClass` rather than `Function`. `Function` is the widest callable type there is, so it documented nothing and admitted values that are not classes. Any class you already passed still type-checks.
- JSDoc and comments no longer cite plan tasks or edge-case identifiers that exist in no repository a reader can reach.
- **Breaking:** `readCronMetadata` and `readHitlMetadata` return a `ReadonlyMap` keyed by method name instead of a single object or `undefined`. `@Cron` and `@Hitl` kept one object per class, so decorating a second method silently discarded the first — a class with two scheduled routines quietly lost one. Both now accumulate per method, like the other fourteen decorators. Migration: `readCronMetadata(C)?.schedule` becomes `readCronMetadata(C).get("methodName")?.schedule`, and an undecorated class yields an empty map rather than `undefined` (#6).

## 0.2.0

### Minor Changes

- Decorator-driven agent-team + workflow authoring (own identity — composition over a new engine).

  - **`@Squad(metadata)`** property decorator + `readSquadMetadata` — declarative sequential agent team backed by `@theokit/di` `METADATA_KEYS.SQUAD`.
  - **`@Step(metadata?)`** method decorator + `readStepMetadata` (`{ after?, name? }`) backed by `METADATA_KEYS.STEP`.
  - **`buildWorkflow(instance)`** — compiles a class decorated with `@Step` into a `@theokit/sdk` `Workflow` (topological order by `after`; validates no-steps / unknown-after / cycle). No new runtime engine — composes `@theokit/sdk/workflow`.

  First npm publish of these decorators (`0.1.0` on npm is the scaffold).

## [0.1.0] - 2026-05-31

> First GA release. Promotes `0.1.0-next.0` to stable. API contract preserved — no breaking changes from `0.1.0-next.0`.

### Changed

- Removed obsolete `// biome-ignore lint/correctness/noUnusedVariables` directives from `tests/{analyze-graph,async-resolution,container-core,inject-agent,integration/real-agent}.test.ts`. They were flagged as `suppressions/unused` after the workspace enabled `javascript.parser.unsafeParameterDecoratorsEnabled` in `biome.json`.
- Dropped the unused `@vitest/coverage-v8` devDependency.

## [0.1.0-next.0] - 2026-05-29

### Added

- Initial release of `@theokit/di-agent` — agent-first DI integration for `@theokit/di`.
- `@InjectAgent()` parameter decorator (sugar over `@Inject(AGENT_TOKEN)`).
- `createAgentProvider({ factory, scope? })` helper producing a `FactoryProvider` with default `Scope.REQUEST`.
- `AGENT_TOKEN` exported constant for advanced wiring (custom providers under the same token).

### Validation

- 5 unit tests with mock Agent + 2 real-LLM integration tests (env-gated by `OPENROUTER_API_KEY`). Real-LLM run validated against OpenRouter (`openai/gpt-4o-mini`) — 800ms end-to-end.

### Peer dependencies

- `@theokit/di` `workspace:^` (kept in lockstep — Changesets `linked` config).
- `@theokit/sdk` `workspace:^` (the actual Agent runtime).
- `reflect-metadata` `^0.2.0` (transitive via `@theokit/di`).
