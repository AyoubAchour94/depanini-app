# Depanini

Project setup, structure and commands: see `README.md`. CI/CD and secrets: see `CI.md`.
`apps/mobile/AGENTS.md` has Expo-specific rules for work inside the mobile app.

## Orchestrator

`/orchestrate <goal>` (or `/loop /orchestrate <goal>` to keep it running) makes the session the master agent: it plans from the GitHub issues, runs `scout` / `implementer` / `verifier` subagents (`.claude/agents/`) in parallel, merges verified PRs into `develop`, and reports via notifications and tracking-issue comments. It paces itself with `node scripts/claude/usage.mjs`, which reads the subscription usage the status line saves. Playbook: `.claude/skills/orchestrate/SKILL.md`.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues on AyoubAchour94/depanini-app, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `GLOSSARY.md` and `docs/adr/`, shared by apps/mobile, apps/api and packages/shared. See `docs/agents/domain.md`.
