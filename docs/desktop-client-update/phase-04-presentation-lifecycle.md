# Phase 4: presentation lifecycle (hidden-window skip + display change)

### Starter Prompt
```
This is Phase 4 of the Desktop Client Update: presentation lifecycle.

Model: Fable 5, xhigh effort. Harness: Claude Code. Workflow orchestration: none in this phase (standard agent fan-out only).

PROJECT RULES (from docs/desktop-client-update/state.md): work ONLY in
/home/fernandoramirez/Documents/woc-desktop-client-update (git -C always); LOCAL-ONLY,
never push; first action pull+merge origin/release/v0.36.0; git status clean or stop.

Goal: a minimized desktop client stops burning GPU (today backgroundThrottling:false
plus an ungated rAF loop renders full-tilt while hidden), and a monitor/DPI change
mid-session re-resolves the pixel ratio.

STEP 0 - memory scan (topics: desktop-client-update program locked decisions, the
windows-30fps investigation's WS-backlog freeze finding).

STEP 1 - LOAD CONTEXT: Explore agent (budget ~35 calls, report-first) summarizes:
state.md locked decisions (hidden-skip design shape), progress.md, this file; the
frame loop in src/main.ts (the rAF self-reschedule, the 250ms delta clamp, where sim
tick / net drain / hud paint / renderer.render are invoked, the graphicsRebuildPaused
guard); src/net/online.ts netPipeline noteVisibilityChange semantics (what it already
does for hidden tabs); src/render/renderer.ts applyResolution + the pixelRatioCap
clamp + resize listener registration; electron/main.cjs window events available;
tests/electron_ipc_channels.test.ts pins. Return: the exact frame-loop call order, what
noteVisibilityChange does, and the resolution re-apply entry point.

STEP 2 - EXECUTE. Deliverables (renderer agent + electron agent in parallel):
Renderer agent (the hidden skip):
- A pure decision core (src/game/presentation_gate.ts or similar, DOM-free, Node
  tested): given { hidden, desktopApp, graphicsRebuildPaused }, decide
  { render: boolean, paint: boolean, tick: boolean }. LOCKED DESIGN: while hidden on
  desktop, render=false and paint=false but tick=true; sim tick and net drain KEEP
  RUNNING every frame (skipping the drain rebuilds the WS-backlog refocus freeze
  documented in July). Web behavior unchanged (rAF already pauses there).
- Thin consumption in the src/main.ts frame loop (main.ts is a firewall: the loop calls
  the core, no new top-level logic). Ensure the existing visibilitychange forwarding to
  netPipeline still fires; on refocus, render resumes next frame with no special-case
  catch-up (the 250ms clamp already bounds sim catch-up).
- Tests: the decision core (all input combinations); an integration-style test if the
  loop structure allows one cheaply.
Electron agent (display change):
- Forward display changes: listen to screen 'display-metrics-changed' AND the window
  'moved' event debounced with a display-id check (moving to another monitor may not
  fire metrics-changed), push 'desktop-display-changed' (payload: scaleFactor,
  displayId; whitelisted + capped via a pure reducer module with test). Preload
  onDisplayChanged subscription; ipc pins updated (EXACT push-channel array + method
  list).
- Renderer: optional bridge member; a small module composed in
  initDesktopShellIntegration that calls the renderer's resolution re-apply path
  (applyResolution via its public seam; if none exists, add the narrowest method).
  Web fallback: also handle window.matchMedia resolution-change where cheap, but the
  bridge path is the deliverable.

INVARIANTS IN PLAY: graphics fairness (rendering nothing while hidden is neutral by
construction; the tick MUST keep running so the world state stays honest); module-first
(no new top-level functions in main.ts); bridge members optional + feature-checked.

Out of scope: battery/power modes; frame caps; window bounds (phase 7); any governor
change (phase 5).

STEP 3 - VALIDATION + REVIEW:
- `npx tsc --noEmit`; `npx vitest run tests/electron_*.test.ts tests/desktop_*.test.ts`
  plus the new core tests; `npm run ci:changed`.
- Evidence: with the dev client running, minimize/hide and capture GPU utilization or
  the frame-loop's own render-skip counter (add a cheap counter to the perf snapshot if
  none exists) proving render calls stop while hidden and resume on focus; verify via
  the perf overlay or logs that net snapshots kept arriving while hidden.
- Review dispatch per the implementation-plan.md matrix: frontend-seam-reviewer (game/
  render surface) + privacy-security-review (new IPC channel). COVERAGE prompts.
- `node scripts/gate_select.mjs`.

STEP 4 - COMMITS:
- perf(game): skip rendering while the desktop window is hidden
- feat(desktop): forward display changes and re-resolve the pixel ratio

STEP 5 - ACCEPTANCE:
- [ ] Hidden desktop client: zero renderer.render calls, sim/net still ticking
      (evidence captured); refocus resumes cleanly with no backlog replay.
- [ ] Display-change push re-applies resolution; pins updated; older-shell/web no-op.
- [ ] Decision core fully covered; suites + gate_select green.

STEP 6 - DOCS + MEMORY: progress.md; state.md inventory (channels, bridge members,
new modules, the render-skip evidence location).

STEP 7 - FINAL RESPONSE: status, files, validation + evidence, reviewer verdicts,
handoff line.

STOPPING RULES: stop and ask if keeping tick=true while hidden measurably distorts any
existing perf telemetry consumers (perf_reporter visibilityState interactions), rather
than silently reshaping the beacon.
```
