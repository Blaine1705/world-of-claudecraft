# Phase 10 QA: verify Discord Rich Presence

### QA Starter Prompt
```
This is Phase 10 QA of the Desktop Client Update: verify the in-house Discord presence.

Model: Fable 5, xhigh effort. Harness: Claude Code.
ultracode. Orchestrate this audit as a deterministic Workflow: parallel audit
agents per focus area, findings adversarially verified by independent skeptics
before they count.

PROJECT RULES: work ONLY in /home/fernandoramirez/Documents/woc-desktop-client-update
(git -C always); LOCAL-ONLY, never push; first pull+merge origin/release/v0.36.0;
git status clean or stop and ask.

Goal: audit phase 10. Risk centers: hand-rolled protocol code, the boot path, and the
privacy floor.

STEP 1 - LOAD CONTEXT: Explore agent (~30 calls, report-first): state.md, progress.md
phase 10 checklist + probe status, phase-10-discord-presence.md, the diff.

STEP 2 - AUDIT (parallel, COVERAGE not filtering, ~30-call budgets):
- Protocol agent: check the codec against the documented wire format (opcodes, LE
  header, handshake shape, PING/PONG) by re-reading the spec cited in brainstorm.md
  section 6; hunt buffer-handling bugs adversarially: partial header, frame split
  across chunks, oversized length field (memory bomb: is length clamped?), non-JSON
  payload, interleaved frames. Every hole becomes a fuzz case.
- Boot/lifecycle agent: prove no code path touches the socket before the window
  exists; kill/absence/reconnect transitions match the spec (fake-socket tests
  exercise EACH); the off-switch clears activity before disconnecting; no timer leaks
  after off/quit (the zero-length-wait hang trap from memory: verify the backoff
  timer cannot self-arm at zero).
- Privacy agent: the activity key-set pin is exact (not arrayContaining); grep the
  whole diff for character/account/party/wallet identifiers anywhere near the
  activity path; the options body copy discloses public visibility; default state
  matches the recorded user decision.
- Test-quality agent (test-coverage-auditor): fuzz cases actually execute the decoder
  (embedded-probe-strings rule: pin THROUGH the operator, not substring pins on
  source); rate-limit negative tests on both sides; scratch-mutation AFTER committing.
- Dispatch per the implementation-plan.md matrix + qa-checklist agent.

STEP 3 - FIX all BLOCKING and SHOULD-FIX; rerun the phase 10 validation set +
`node scripts/gate_select.mjs`. Separate fix commits.

STEP 4 - DOCS + MEMORY: progress.md, state.md (probe status final), memory (protocol
gotchas learned).

FINAL RESPONSE: verdict, counts, deferrals (Application ID provisioning stays OPEN for
the maintainer), handoff for phase 11.

STOPPING RULES: stop and surface any unclamped-length or pre-window-socket finding
immediately; those are the two disqualifying defects for this feature.
```
