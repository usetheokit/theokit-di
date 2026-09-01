# Changelog

Changes to the repository itself — licensing, tooling, workflow and
repository-wide sweeps. Changes to a published package are recorded in that
package's own changelog:
[`@theokit/di`](packages/di/CHANGELOG.md),
[`@theokit/di-agent`](packages/di-agent/CHANGELOG.md),
[`@theokit/orm`](packages/orm/CHANGELOG.md).

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **ci:** `packages/di` meets its own coverage thresholds, so `pnpm test:coverage` exits 0 across
  the workspace. Branch coverage went 81.81% → 88.65% against a declared floor of 85%. The floor had
  never been evaluated — CI ran `pnpm test`, never the coverage variant — so the number in
  `vitest.config.ts` was read in review as an enforced floor and was neither (#57).

- **ci:** SonarQube Cloud now runs from CI instead of Automatic Analysis, and it finally imports
  coverage. Automatic Analysis does not import coverage at all, so the quality gate here reported
  bugs and smells while staying blind to what the suite reaches (#52).

- **ci:** the three packages emit `lcov` coverage. `sonar-project.properties` has named
  `packages/*/coverage/lcov.info` since it was written, and no `vitest.config.ts` produced one —
  vitest's default reporters are text/html/clover/json. The scan would have reported 0% over a
  green suite, which is indistinguishable from a measured 0% (#52).

- **ci:** per-commit package previews via pkg.pr.new. A fix here is unverifiable from a sibling
  repository until it is on a registry, and this ecosystem has nine interdependent publishable
  repositories — measured 2026-08-31, `@theokit/http` reached 2.0.0 in one while three packages in
  another declared a range excluding it, and nothing found out until a release gate ran. Previews
  cost nothing and burn no npm version, so they are the first thing to reach for; the snapshot path
  is for when the answer has to come from registry.npmjs.org specifically.

- **release:** the release channel this repository declares is now guarded. `"releaseChannel"` in
  the root manifest and `.changeset/pre.json` must agree, checked on every pull request and again
  immediately before a release. `changeset pre exit`, a bad merge, or a conflict resolved the wrong
  way removes `pre.json`; nothing errors; the next release publishes a stable version and moves the
  `latest` dist-tag for every consumer, reporting success. Cutting a stable release stays available
  and becomes deliberate — it takes both edits, in the same pull request.
- **ci:** `Promotion gate` refuses a pull request into `develop` that does not come from this repository's own `workspace`. `git-safety.md` has always said so and `validate-command.sh:245` has always blocked it — for a `git merge` typed locally, which is not how any of this repository's 17 promotions landed (usetheokit/theokit#606)

- `Workflow Lint`, a CI gate running actionlint and zizmor over `.github/workflows/`, so the
  pipeline's own conventions — pinned actions, bounded jobs, least-privilege tokens — are checked
  by a machine rather than by whoever reads the diff (#38)

### Changed

- Node pinned to 22.12.0 and pnpm to 10.34.1 across the repository, resolved from `.nvmrc` and
  `packageManager` so each has a single place to change. CI previously tested the newest 22.x and
  never the 22.12.0 floor that `engines` declares (#38)
- `Release` declares a read-only permission floor at the workflow level instead of inheriting the
  repository default (#38)

- Three documentation gates, run together with `pnpm quality:docs`.
  `check-doc-coverage.mjs` asks the TypeScript compiler how much of the PUBLISHED surface
  carries documentation an editor can show, reading the emitted declarations rather than the
  source — a docblock is not documentation until it survives the build. `check-doc-api-drift.mjs`
  compiles every `import { … }` in the tracked Markdown and asks the compiler whether those names
  exist. `check-orphan-docblocks.mjs` finds docblocks stranded above another docblock, which
  attach to nothing and ship invisible.
  The entry list comes from each package's `exports` map, never from a walk of `dist/`: a first
  measurement that read the disk reported 46.0% while never having seen
  `@theokit/orm/schema-export`, a declared subpath sitting at 0%. Both module formats are
  measured, and the gate fails when the ESM and CJS surfaces classify any symbol differently —
  comparing the files byte-for-byte would go red on a per-format banner and earn the exception
  that silences a gate.
  The coverage floor is a ratchet at 100%, which is what was measured here after the pass below. (#24)
- A CI workflow. Until now nothing ran `check`, `typecheck`, `build`, `test` or the documentation
  gates on a pull request — the only workflow that ran at all was the secret scan, which says
  nothing about whether the code compiles. It runs on both promotion legs, and builds before it
  typechecks, because the packages resolve each other through their `exports` map into `dist/`.
  (#20)

- Secret scanning, in two layers: a `pre-commit` hook that scans the staged content
  with TruffleHog and refuses the commit, and a workflow that re-scans the pushed
  range in CI. The hook is what keeps a credential out of the history at all; the
  workflow is what `git commit --no-verify` cannot skip. Confirmed fixtures are
  silenced one line at a time with a `trufflehog:ignore` comment, never by excluding
  a path — an excluded path would also hide a real secret added to that fixture later.
- `LICENSE` at the repository root, Apache-2.0, the same text the three packages
  ship. Without it, default copyright applied to everything outside `packages/`.
- `SECURITY.md` — how to report a vulnerability privately, what is in scope, and
  what to expect back.
- `CONTRIBUTING.md` — the `workspace → develop → main` promotion flow, the four
  commands that gate a change, and the test-first requirement.
- npm provenance on all three packages, so a published tarball can be traced back
  to the commit and workflow that produced it. This needs a public source
  repository, which is why it is on now and was not before.

### Changed

- **Test runs no longer claim every core on the host.** `vitest.config.ts` capped nothing, so the default applied — `os.availableParallelism()`, one fork per core, each booting a full test environment. On a 12-thread machine a single `vitest run` therefore took the whole box, and anything else running alongside it (a second suite, a typecheck, the desktop) competed for what was left. The cap now leaves 4 cores free (`Math.max(2, cpus().length - 4)`), scaling with the runner instead of hard-coding one machine's core count. It costs no wall-clock — measured in `theokit-ui`, the full suite ran 73.96s at 4 workers against 74.36s at 12. (usetheokit/theokit-ui#51)

- The release workflow unsets `core.hooksPath` before changesets commits. `pnpm install` runs the
  root `prepare` script, which arms the local pre-commit secret scan on the runner; changesets then
  commits the version bump, the hook fires, finds no `trufflehog` binary and fails closed as
  designed — blocking the release after the bumps were already computed correctly. The hook exists
  for a commit a person makes, where CI can only catch a credential once it is already in history.
  This one is a bot committing generated content onto `changeset-release/main`, which reaches
  `main` only through a pull request that `secret-scan.yml` is configured to scan base-to-head.
  That scan does not start on its own: changesets opens the pull request with `GITHUB_TOKEN`, and
  GitHub does not start workflow runs from `GITHUB_TOKEN`-authored events. What forces it is the
  required `Verify` check — with no runs the pull request cannot merge, so a person has to release
  them first. A real guarantee, and one that needs a human in the path rather than holding by
  construction. (#34)
- The release workflow installs npm `11.9.0` instead of `12.0.2`. changesets detects pnpm and
  appends `--no-git-checks` to the publish command; that flag reaches npm, and npm 12 rejects
  unknown configuration with `EUNKNOWNCONFIG` where every earlier npm ignored it, so all three
  packages failed to publish. Measured on each version against the same package: 11.5.1 accepts,
  11.9.0 accepts, 12.0.2 rejects. Trusted publishing still requires 11.5.1 or newer, which makes
  11.9.0 the newest npm satisfying both.
  The same npm release breaks the path a second time, silently: `npm info --json` returns an array
  where earlier versions returned an object, so the list of already-published versions that
  changesets reads comes back empty and every package looks unpublished. The rejected flag stopped
  that run before it reached the registry; nothing guarantees that ordering next time. (#32)
- Publishing authenticates through npm Trusted Publishing instead of a long-lived token. Each of
  the three packages carries a trusted-publisher connection naming this repository and
  `.github/workflows/release.yml`; npm mints a short-lived credential for the individual job,
  scoped to that package, which cannot be exported or replayed. The `NPM_TOKEN` it replaced did
  not exist in this repository or in the organization, and the workflow reported success anyway
  because `changesets/action` exits clean when it finds no changeset — the first real changeset
  would have reached the registry with no credential at all. Two things follow that are worth
  knowing before touching that file: renaming it breaks the trust for all three packages and the
  publish is rejected, and the job no longer carries an npm credential, so what persists into
  `.git/config` is GitHub's own token alone. (#20)
- `CONTRIBUTING.md` lists the gating commands in an order that works. It named four — check,
  typecheck, build, test — which reads as a sequence and is not one: the packages resolve each
  other through their `exports` map into `dist/`, with no `paths` mapping and no `src` fallback,
  so on a fresh clone `typecheck` before `build` fails. A stale `dist/` on a developer machine
  hid it. The documentation gates are listed too, for the same reason. (#24)
- The four actions in the release workflow are pinned by commit SHA instead of by tag.
  `changesets/action@v1` was the sharpest edge: `v1` is not a tag in that repository, it is a
  **branch**, so any push to it changed the code running in the job that publishes — a job with
  `id-token: write`, able to publish signed packages as this organization, with no release and no
  version bump to notice. Each pin carries the version it resolved to, verified against the
  action's own tags.
  (#20)
- **The repository moved to the official `usetheokit` organization.** Existing clones keep
  working: GitHub redirects the old `usetheodev/theokit-di` remote permanently. The
  `repository`, `bugs` and `homepage` fields of all three packages, plus the links in
  `SECURITY.md`, now point at `usetheokit`. (usetheokit/theokit#316)

- **The Apache-2.0 license text was replaced with the official one.** The text shipped
  until now had paragraph 4(d) truncated, dropping "reasonable and customary use" from
  the NOTICE clause. A modified body under the `Apache-2.0` SPDX identifier is
  effectively a custom license. The root LICENSE and the three package LICENSEs are now
  byte-identical to the canonical text. (usetheokit/theokit#316)
