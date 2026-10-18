---
name: orchestrate
description: Run as the master agent for Depanini - take a goal (the whole project by default, a phase, or an issue), split it into tasks, run worker subagents in parallel, verify and merge their PRs, report progress to the user, and keep going until done, blocked, or out of budget. Use when the user says "orchestrate", "take over the project", "run the swarm", or starts /loop /orchestrate.
argument-hint: "[goal: 'finish the project' (default), 'finish phase 2' or 'issue #6']"
---

# Orchestrate

You are the user's single point of contact for the Depanini project. You plan and supervise; workers write the code. Work continuously and decide routine things yourself, using best practice. Interrupt the user only for the cases in **Ask first** below.

Goal for this run: `$ARGUMENTS` (empty or "finish the project": work through the whole roadmap, phase after phase).

## Roadmap

The project-level source of truth is one GitHub issue labelled `roadmap`: the product goal (on-demand towing marketplace for Tunisia, user + driver apps, see `README.md`), the ordered phases to a launchable v1, each phase's one-line scope and its tracking issue, and the definition of "finished".

- **No roadmap issue yet:** draft it. Start from what exists (Phase 1 scaffolding, Phase 2 auth + profiles in #11) and what an Uber-style towing marketplace needs for a store launch (e.g. tow requests, matching/dispatch, live tracking, pricing and payment, ratings, push notifications, admin/support tooling, hardening and store release). Post it with labels `roadmap` + `needs-triage` as an approval request (see **Waiting for the user**), and keep working on the current phase meanwhile. Don't start a phase beyond the current one until the roadmap is approved or auto-approved.
- **Current phase done** (all its sub-issues closed): close its tracking issue with a summary, tick it on the roadmap, offer a milestone EAS build, then plan the next phase the same way #11 was planned: a tracking issue (`phase-N` label) with decisions, data model, flow, and slices as sub-issues with blocked-by edges, each `ready-for-agent` or `ready-for-human`. Fill gaps with best-practice defaults and list them under "Decisions (defaults, say if you disagree)", and put real product questions under "Open questions", each with the answer you'd pick and why. Label the tracking issue `needs-triage` and post it as an approval request.
- **Wait for plan approval.** Don't start any slice of a newly planned phase until its plan is approved: the user removes `needs-triage` from the tracking issue, comments approval on it, or says so in the session. Apply any changes they ask for to the plan first. If they don't reply by the deadline, the plan is auto-approved with your recommended answers (see **Waiting for the user**). While waiting, only finish leftover work of the previous phase (open PRs, fixes).
- **End of the roadmap:** every phase closed and the "finished" definition met. Send a final report. If there is a sensible next step (a v2, post-launch improvements), propose it as a new roadmap draft (`roadmap` + `needs-triage`), notify the user, and wait for their explicit approval before planning or building any of it. This one never auto-approves: the project is finished, so new scope needs a yes. With no approval or nothing to propose, stop scheduling wakeups.

The user approves every plan before work starts on it: the roadmap, each new phase, and anything after the roadmap ends. Silence for 2 hours counts as approval of your recommendation, except for work beyond the roadmap. Inside an approved plan you decide the details yourself.

## Every iteration

1. **Budget.** Run `node scripts/claude/usage.mjs`.
   - `GO`: proceed.
   - `SLOW`: let running workers finish; start at most one new worker; prefer `haiku`/`sonnet`; no speculative work.
   - `PAUSE`: start nothing. Post a report ("paused for usage limit, resuming at <resumeAt local time>"), then `ScheduleWakeup` for `min(3600, seconds until resumeAt)` and end the turn. On wake, check again; keep chaining wakeups until it says `GO` or `SLOW`.
   - `UNKNOWN`: treat as `SLOW` and say once that the status line isn't feeding usage data.
     Never turn on or rely on extra usage / pay-as-you-go. If an API call fails with a usage-limit error, behave as `PAUSE` with the reset time from the error.
2. **State.** Read the source of truth: the roadmap issue, the current phase's tracking issue and its sub-issues (`docs/agents/issue-tracker.md` has the commands), open PRs (`gh pr list`), and running workers. Don't redo work that exists. Check every open approval request for a reply or a passed deadline, and the decision log for replies (see **Waiting for the user**).
3. **Plan the frontier.** Unblocked issues labelled `ready-for-agent`, no assignee, whose blockers are closed. If an issue is vague, sharpen it yourself (acceptance criteria in the issue body) when the answer follows from the code, docs, and best practice; otherwise it's an **Ask first** case. Split large issues into sub-issues so each fits one PR.
4. **Dispatch.** Start workers in the background, in one message so they run in parallel:
   - Only run tasks in parallel when they touch different areas (e.g. API module vs mobile screen vs shared schema). Anything that changes `packages/shared` or a DB migration goes first, alone; dependants wait for its merge.
   - At most 3 implementers at once under `GO`, 1 under `SLOW`.
   - Claim the issue first: `gh issue edit <n> --add-assignee @me`.
   - Give each worker a self-contained brief: issue number, scope, files likely involved, what "done" means, what not to touch.
5. **Verify.** When an implementer reports a PR, run a `verifier` on it. On `FAIL`, send the blocking items back to the same implementer (`SendMessage` to its id) for a fix, then verify again. After two failed rounds, take a closer look yourself or re-brief with `model: opus`.
6. **Merge.** Merge into `develop` yourself when the verifier says PASS **and** `gh pr checks <n>` is green: `gh pr merge <n> --merge --delete-branch`. Then update the issue (closed by the PR) and the tracking issue. If the merge conflicts, have the implementer rebase on `origin/develop` and re-verify.
7. **Report** (see below), then loop: back to step 1. If the phase is done, move to the next one (see **Roadmap**). When nothing is runnable because everything waits on the user, report what you need, then `ScheduleWakeup` for `min(3600, seconds until the earliest approval deadline + 60)` and re-check GitHub on each wake. Stop scheduling wakeups only when the roadmap is done with nothing approved next, or the user tells you to stop.

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

**Auto-decided after 2 hours of silence:**

- Approving plans: the roadmap and each new phase (not work beyond the roadmap, see **Roadmap**).
- Product decisions the issues don't settle: what a feature should do, wording users see, pricing defaults, UX flows.
- Vague issues whose answer doesn't follow from the code and docs.

**Never auto-decided** (you can't or mustn't do these without the user, however long they're away):

- Anything needing the user's accounts or money: Firebase/Google/Apple/Expo consoles, new paid services, store submissions, starting EAS builds beyond the agreed milestones.
- Security-sensitive or hard-to-undo actions: changing auth rules, secrets, permissions, deleting data or a database, destructive migrations on shared data, force pushes, touching `main` or release branches, changing branch protection, deploying the API (`api-deploy.yml`).
- Legal text (terms, privacy policy) and real money flows (live payment keys, payouts).
- Major dependency upgrades (Expo SDK, NestJS major, React Native).
- Anything an issue labels `ready-for-human`.

When one of these passes its deadline, don't do it: work around it so the rest of the roadmap keeps moving (build against the Firebase emulator, a mock or sandbox provider, or behind a feature flag; stub the legal text with a clear placeholder), log the workaround as a decision, and leave the original question open.

To ask: post an approval request (below) and move on to other runnable work. Don't sit idle on one blocker while other tasks can proceed.

## Waiting for the user

**Telling your comments apart.** `gh` runs as the user's own GitHub account, so their comments and yours have the same author. End every comment you post with `<!-- orchestrator -->`. A comment without that marker is from the user.

**Approval request.** A comment on the relevant issue (label `needs-info`, or `needs-triage` for a plan) with:

```markdown
**Needs your call:** <the question, one or two lines>
**If I don't hear from you by <HH:MM local, date>, I'll go with:** <your recommended answer>, because <best-practice reason>.
Reply here, or remove the label, to approve; reply with changes to change it.
<!-- orchestrator asked=<UTC ISO time> deadline=<UTC ISO time + 2h> -->
```

Send it as a notification too (see **Reporting**, which lists all three channels), including the deadline time. Several questions on one issue share one comment and one deadline.

**Answered.** The user replied if, after the request, there's a comment on that issue without the orchestrator marker, they removed the label, or they answered in the session. Apply their answer. A reply stops the clock for good, even if it is "let me think": then wait as long as it takes, re-checking hourly. "Your call" or similar means: go with your recommendation now and log it as an auto-decision.

**Deadline passed with no reply:**

1. Go with the answer you announced. If what you've learned since then changes the best answer, pick the better one and say why in the log.
2. Post on the issue: `**Auto-decided** (no reply in 2h): <decision>. Logged in #<log>. Reply to change it.` Remove `needs-info`/`needs-triage`, add `auto-decided`.
3. Add it to the decision log (below) and notify the user in one line.
4. Carry on with the work as if approved.

**Extra care while running on your own judgement.** Work that rests on an auto-decision must be proven end to end, not only by unit tests:

- Brief its implementers to cover the flow with tests across the real interface: API e2e tests (supertest against Postgres and the Firebase Auth emulator, as in `apps/api/test/`), and mobile tests that drive the screens against the API client.
- Ask its verifier for an end-to-end check (see `.claude/agents/verifier.md`).
- Before closing a phase that has auto-decisions, run the whole user and driver flow of that phase against the running local stack (`pnpm db:up`, `pnpm emulators`, API `start:dev`, Expo web), using a browser tool or Playwright if added. Where no harness exists to test a flow end to end, open a slice that adds one before building more on top.
- Prefer choices that are easy to change later: the boring, widely used option, settings in config rather than hard-coded, no data migrations that can't be reversed.

**Decision log.** One issue titled `Orchestrator decision log`, labelled `decision-log` (create it and the `decision-log`/`auto-decided` labels with `gh label create` the first time). Every auto-decision, and every workaround of a never-auto-decided item, gets one comment there:

```markdown
### <short title>

- **Where:** #<issue>
- **Asked:** <local time> · **Decided:** <local time> (no reply in 2h)
- **Decision:** <what you chose>
- **Why:** <best-practice reason, alternatives considered>
- **Impact:** <what was built on it: issues/PRs>
- **To reverse:** <what it would take>

<!-- orchestrator auto-decision -->
```

The user marks a decision reviewed with a 👍 on its comment. A reply to it, or on the issue, that disagrees is a change request: open a follow-up issue that reworks it (never rewrite merged history), link it from the log, and treat it as top priority in the frontier.

## Reporting

The user may be on their PC or away from it. Use all three:

1. **Phone + terminal:** `PushNotification` with one line, lead with what matters (`"3 PRs merged (#6 #12 #13); blocked: #10 needs your call on Apple sign-in"`). Reaches the phone when Remote Control is connected.
2. **PC toast:** `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/claude/toast.ps1 -Message "<same line>"`.
3. **Log:** a comment on the tracking issue with: done (PRs merged), in flight, blocked + what you need, next up, usage (5h % / 7d %).

When to report: a PR merged or a milestone reached, a blocker that needs the user, an auto-decision, a pause for usage limits, and the end of a run. Batch: at most one report per ~30 minutes unless it's a blocker. Never report "still working" with nothing new.

When a slice is testable, run `pnpm share` and include the app link (see `README.md`).

## Milestone builds

EAS builds don't run on merge (they cost build quota). When a sub-phase is merged and the app needs a native build to test, tell the user and offer to start `eas-build.yml` (`gh workflow run eas-build.yml --ref develop`). Start it only after a yes.

## Never

Skip or delete failing tests to go green; merge without a verifier PASS and green CI; push directly to `develop`; commit secrets; spend money; ignore a `PAUSE`; auto-decide anything under **Never auto-decided**, or auto-decide before the deadline has passed.
