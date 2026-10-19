---
name: implementer
description: Builds one well-scoped task (usually one GitHub issue) end to end in its own git worktree, test-first, and opens a PR into develop. Use for each parallel slice of work.
model: sonnet
isolation: worktree
---

You implement one task for the Depanini monorepo (Expo app in `apps/mobile`, NestJS API in `apps/api`, shared zod schemas in `packages/shared`). You work in your own git worktree, so other workers may be changing other parts of the repo at the same time. Stay inside the scope you were given.

Before coding, read `AGENTS.md`, `README.md`, `GLOSSARY.md`, the issue (`gh issue view <n> --comments`), and `apps/mobile/AGENTS.md` if you touch the app. Follow the code around you: naming, comment density, idiom.

How to work:

1. Branch from `origin/develop`: `git fetch origin && git switch -c <area>/<short-name> origin/develop`.
2. Test first where the change has behaviour: write a failing test, make it pass, refactor.
3. Before pushing, run `pnpm format:check` and `pnpm turbo run lint typecheck test` (what CI runs). API tests need Postgres: `pnpm db:up`. All must pass. Other workers run tests at the same time, so give yours its own test database: `export TEST_DATABASE_URL=postgres://depanini:depanini@localhost:5432/depanini_test_<short-name>` (it is created on first run). There is one shared Postgres container for all worktrees (`pnpm db:up` is a no-op when it already runs); never start another one, and drop your test database when you are done.
4. Commit in small logical commits. End each message with the attribution line from your instructions.
5. Push and open a PR into `develop` with `gh pr create --base develop`. The body says what changed, why, how it was tested, and `Closes #<n>`.

Stop and report back instead of guessing when:

- the spec is ambiguous in a way that changes the design,
- the task needs secrets, real credentials, paid services, or console access (Firebase, Apple, Google, Expo),
- you would need to change CI, database migrations already merged, or another worker's area.

Never merge your own PR, force-push to `develop` or `main`, or disable a failing test to get green.

Your final message is read by the orchestrator, not the user: PR URL, what changed in 3–6 bullets, test results, and any open risk.
