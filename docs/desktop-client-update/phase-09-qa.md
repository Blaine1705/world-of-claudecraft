# Phase 9 QA: verify notifications and what's new

### QA Starter Prompt
```
This is Phase 9 QA of the Desktop Client Update: verify OS notifications and the
what's-new link.

Model: Fable 5, xhigh effort. Harness: Claude Code.
ultracode. Orchestrate this audit as a deterministic Workflow: parallel audit
agents per focus area, findings adversarially verified by independent skeptics
before they count.

PROJECT RULES: work ONLY in /home/fernandoramirez/Documents/woc-desktop-client-update
(git -C always); LOCAL-ONLY, never push; first pull+merge origin/release/v0.36.0;
git status clean or stop and ask.

Goal: audit phase 9. Risk centers: free-form strings crossing to an OS surface, and
notification spam paths.

STEP 1 - LOAD CONTEXT: Explore agent (~30 calls, report-first): state.md, progress.md
phase 9 checklist, phase-09-notifications-whatsnew.md, the diff.

STEP 2 - AUDIT (parallel, COVERAGE not filtering, ~30-call budgets):
- Trust-boundary agent: the notification channel accepts only {title, body} strings,
  control-stripped and capped on BOTH sides; player-controlled content (the inviter
  name in partyInvite) cannot inject markup/newline tricks into the OS surface; the
  rate limiter cannot be bypassed by alternating kinds; focus is re-checked main-side.
- Behavior agent: exactly-once per version for update-ready (relaunch + same version
  = no re-notify? trace the once-per mechanism); the pid gate on party invites holds
  in the offline world (write the offline-bot-invite case if the phase missed it);
  focused sessions never notify; clicking focuses the window; web/mobile and
  older-shell no-ops hold.
- i18n agent: keys in the right catalog home (shell.ts desktop block, NOT
  DEFAULT_SHELL_STRINGS; that contract must be untouched: run
  tests/desktop_shell_strings.test.ts and confirm no drift); M16 fills present; S3
  guard green; the what's-new label localized; the link opens through the established
  wiki pattern, not a hardcoded URL.
- Test-quality agent (test-coverage-auditor): rate-limit and focus gates each have a
  negative test; the notify decision core covers all input combinations;
  scratch-mutation AFTER committing.
- Dispatch per the implementation-plan.md matrix + qa-checklist agent.

STEP 3 - FIX all BLOCKING and SHOULD-FIX; rerun the phase 9 validation set +
`node scripts/gate_select.mjs`. Separate fix commits.

STEP 4 - DOCS + MEMORY: progress.md, state.md, memory.

FINAL RESPONSE: verdict, counts, deferrals, handoff for phase 10.

STOPPING RULES: stop and surface any injection-shaped finding you cannot conclusively
kill; OS notification surfaces differ per platform and a maybe is a no.
```
