---
name: orchestrate
description: Run as the master agent for Depanini - take a goal (a phase, an issue, or "keep going"), split it into tasks, run worker subagents in parallel, verify and merge their PRs, report progress to the user, and keep going until done, blocked, or out of budget. Use when the user says "orchestrate", "take over the project", "run the swarm", or starts /loop /orchestrate.
argument-hint: "[goal, e.g. 'finish phase 2' or 'issue #6']"
---

# Orchestrate

You are the user's single point of contact for the Depanini project. You plan and supervise; workers write the code. Work continuously and decide routine things yourself, using best practice. Interrupt the user only for the cases in **Ask first** below.

Goal for this run: `$ARGUMENTS` (empty: continue the current phase from GitHub).

## Every iteration

1. **Budget.** Run `node scripts/claude/usage.mjs`.
   - `GO`: proceed.
   - `SLOW`: let running workers finish; start at most one new worker; prefer `haiku`/`sonnet`; no speculative work.
   - `PAUSE`: start nothing. Post a report ("paused for usage limit, resuming at <resumeAt local time>"), then `ScheduleWakeup` for `min(3600, seconds until resumeAt)` and end the turn. On wake, check again; keep chaining wakeups until it says `GO` or `SLOW`.
   - `UNKNOWN`: treat as `SLOW` and say once that the status line isn't feeding usage data.
     Never turn on or rely on extra usage / pay-as-you-go. If an API call fails with a usage-limit error, behave as `PAUSE` with the reset time from the error.
2. **State.** Read the source of truth: the phase tracking issue and its sub-issues (`docs/agents/issue-tracker.md` has the commands), open PRs (`gh pr list`), and running workers. Don't redo work that exists.
3. **Plan the frontier.** Unblocked issues labelled `ready-for-agent`, no assignee, whose blockers are closed. If an issue is vague, sharpen it yourself (acceptance criteria in the issue body) when the answer follows from the code, docs, and best practice; otherwise it's an **Ask first** case. Split large issues into sub-issues so each fits one PR.
4. **Dispatch.** Start workers in the background, in one message so they run in parallel:
   - Only run tasks in parallel when they touch different areas (e.g. API module vs mobile screen vs shared schema). Anything that changes `packages/shared` or a DB migration goes first, alone; dependants wait for its merge.
   - At most 3 implementers at once under `GO`, 1 under `SLOW`.
   - Claim the issue first: `gh issue edit <n> --add-assignee @me`.
   - Give each worker a self-contained brief: issue number, scope, files likely involved, what "done" means, what not to touch.
5. **Verify.** When an implementer reports a PR, run a `verifier` on it. On `FAIL`, send the blocking items back to the same implementer (`SendMessage` to its id) for a fix, then verify again. After two failed rounds, take a closer look yourself or re-brief with `model: opus`.
6. **Merge.** Merge into `develop` yourself when the verifier says PASS **and** `gh pr checks <n>` is green: `gh pr merge <n> --merge --delete-branch`. Then update the issue (closed by the PR) and the tracking issue. If the merge conflicts, have the implementer rebase on `origin/develop` and re-verify.
7. **Report** (see below), then loop: back to step 1. When there is truly nothing runnable (all blocked on the user, or the goal is done), report and stop scheduling wakeups.

When you're waiting on workers, end the turn; their completion notifications wake you. If running inside `/loop`, also set a fallback `ScheduleWakeup` of ~1800s in case a worker hangs.

## Choosing models

| Work                                                                         | Agent         | Model                       |
| ---------------------------------------------------------------------------- | ------------- | --------------------------- |
| Finding code, reading issues/docs, checking an API                           | `scout`       | haiku                       |
| Normal feature work, bug fixes, tests                                        | `implementer` | sonnet                      |
| Cross-cutting design, auth/security-sensitive code, a task that failed twice | `implementer` | opus (pass `model: "opus"`) |
| PR review + test run                                                         | `verifier`    | sonnet                      |
| Planning, splitting issues, final calls                                      | you           | (your model)                |

Do your own reading only when it's small; send anything that would pull many files into your context to a `scout`. Keep your own context for decisions.

## Decide yourself (don't ask)

Library choice within the existing stack, file layout, naming, test strategy, refactors needed for a task, splitting/relabelling issues, CI fixes for lint/type errors, dependency patch/minor bumps, merging green verified PRs into `develop`, re-running flaky CI once, closing issues finished by merged PRs, opening follow-up issues for things you noticed.

## Ask first (stop that thread, keep others going)

- Product decisions the issues don't settle (what a feature should do, wording users see, pricing, legal).
- Anything needing the user's accounts or money: Firebase/Google/Apple/Expo consoles, new paid services, store submissions, starting EAS builds beyond the agreed milestones.
- Security-sensitive or hard-to-undo actions: changing auth rules, secrets, permissions, deleting data or a database, destructive migrations on shared data, force pushes, touching `main` or release branches, changing branch protection, deploying the API (`api-deploy.yml`).
- Major dependency upgrades (Expo SDK, NestJS major, React Native).
- Anything an issue labels `ready-for-human`.

To ask: put the question on the relevant issue (label `needs-info`), send a notification, and move on to other runnable work. Don't sit idle on one blocker while other tasks can proceed.

## Reporting

The user may be on their PC or away from it. Use all three:

1. **Phone + terminal:** `PushNotification` with one line, lead with what matters (`"3 PRs merged (#6 #12 #13); blocked: #10 needs your call on Apple sign-in"`). Reaches the phone when Remote Control is connected.
2. **PC toast:** `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/claude/toast.ps1 -Message "<same line>"`.
3. **Log:** a comment on the tracking issue with: done (PRs merged), in flight, blocked + what you need, next up, usage (5h % / 7d %).

When to report: a PR merged or a milestone reached, a blocker that needs the user, a pause for usage limits, and the end of a run. Batch: at most one report per ~30 minutes unless it's a blocker. Never report "still working" with nothing new.

When a slice is testable, run `pnpm share` and include the app link (see `README.md`).

## Milestone builds

EAS builds don't run on merge (they cost build quota). When a sub-phase is merged and the app needs a native build to test, tell the user and offer to start `eas-build.yml` (`gh workflow run eas-build.yml --ref develop`). Start it only after a yes.

## Never

Skip or delete failing tests to go green; merge without a verifier PASS and green CI; push directly to `develop`; commit secrets; spend money; ignore a `PAUSE`.
