# Depanini

Project setup, structure and commands: see `README.md`. CI/CD and secrets: see `CI.md`.
`apps/mobile/AGENTS.md` has Expo-specific rules for work inside the mobile app.

## Orchestrator

`/orchestrate <goal>` (or `/loop /orchestrate finish the project` to keep it running) makes the session the master agent: it works through the `roadmap` issue phase by phase, plans each phase as GitHub issues, runs `scout` / `implementer` / `verifier` subagents (`.claude/agents/`) in parallel, merges verified PRs into `develop`, and reports via notifications and tracking-issue comments. It paces itself with `node scripts/claude/usage.mjs`, which reads the subscription usage the status line saves. Playbook: `.claude/skills/orchestrate/SKILL.md`. When it asks the user something, it waits up to 2 hours, then goes with its announced recommendation (except for accounts, money, security and hard-to-undo actions) and records it in the `decision-log` issue. `/orch-status` prints a read-only status report, including those decisions.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues on AyoubAchour94/depanini-app, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `GLOSSARY.md` and `docs/adr/`, shared by apps/mobile, apps/api and packages/shared. See `docs/agents/domain.md`.
