---
name: orch-status
description: Print a short, read-only status report of the Depanini orchestrator - usage budget, roadmap and current phase, what's done, in flight, blocked on the user, and next up. Only runs when the user types /orch-status.
disable-model-invocation: true
---

# Orchestrator status

Report where the project stands. **Read-only:** don't start, stop or message workers, don't change issues, PRs or labels, and don't touch the loop's wakeup schedule.

## Gather

Run these in parallel (`docs/agents/issue-tracker.md` has the `gh` details):

1. `node scripts/claude/usage.mjs`: verdict, 5h %, 7d %, reset times.
2. The `roadmap` issue (`gh issue list --label roadmap --state open`): which phases are ticked, and whether it still has `needs-triage`.
3. The current phase's tracking issue (lowest open `phase-N`) and its sub-issues: state, labels, assignees, `issue_dependencies_summary.blocked_by`.
4. `gh pr list` with each PR's `gh pr checks` result.
5. Running workers in this session, if any (from your own context or `ListAgents`).
6. Issues with `needs-info` or `needs-triage`, and any new comments on them since the last orchestrator report. For each open approval request, its deadline from the `<!-- orchestrator asked=... deadline=... -->` marker.
7. The decision log: the issue labelled `decision-log`, with its comments and their reactions: `gh api --paginate repos/{owner}/{repo}/issues/<n>/comments --jq '.[] | {id, html_url, body, created_at, thumbsUp: .reactions["+1"]}'`. Keep comments containing `<!-- orchestrator auto-decision -->`. A decision is **reviewed** when it has a 👍, and **disputed** when a later comment without the `<!-- orchestrator -->` marker replies to it.

## Report

Keep it short enough to read on a phone. No preamble:

```text
Usage: GO · 5h 56% · 7d 7%
Phase 2: Auth + profiles (#11) · 5/8 slices done
In flight: #6 (implementer), PR #21 (verifying)
Blocked on you:
- #3 Firebase console setup (never auto-decided; worked around with the emulator)
- #19 roadmap needs approval (auto-approves 18:40)
Next up: #6 once #2 and #3 close
Loop: next check ~18:18

Decided while you were away (3 to review, 5 reviewed) · log #31
- 14:05 #24 Pricing: flat 40 TND base + 2 TND/km, set in config · reversible: change config
  Built on it: PR #27 (merged)
- 15:10 #11 Phase 3 plan auto-approved with recommended answers to 4 open questions
- 16:20 #3 Workaround: phone sign-in runs on the Auth emulator until you set up Firebase
Disputed: #24 you replied "too cheap"; follow-up #33 queued
👍 a decision on #31 to mark it reviewed; reply to change it.
```

Leave out any line with nothing in it, except **Blocked on you**: say "nothing" there when the user owes nothing. For each pending approval, give the time it auto-decides, or "waits for you" for never-auto-decided items. Link issue and PR numbers as `#n`. If you're running inside `/loop`, give the next wakeup time.

**Decided while you were away** lists every unreviewed decision, oldest first: local time, issue, decision in one line, how to reverse it if not obvious, and the PRs built on it. Reviewed ones are only counted. Disputed ones get their own line with the follow-up issue, if any. With no decisions at all, write "Decided while you were away: nothing".
