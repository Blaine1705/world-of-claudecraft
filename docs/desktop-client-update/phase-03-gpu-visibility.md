# Phase 3: hybrid-GPU visibility

### Starter Prompt
```
This is Phase 3 of the Desktop Client Update: hybrid-GPU visibility.

Model: Opus 4.8, xhigh effort. Harness: Claude Code. ULTRACODE: not needed.

PROJECT RULES (from docs/desktop-client-update/state.md): work ONLY in
/home/fernandoramirez/Documents/woc-desktop-client-update (git -C always); LOCAL-ONLY,
never push; first action pull+merge origin/release/v0.36.0; git status clean or stop.

Goal: the main process's GPU verdict (software rendering, discrete GPU inactive,
post-crash WARP flip) reaches the player through the existing gpu notice instead of
dying in main.log. Hybrid-GPU laptops are this packet's priority cohort; this phase is
why.

STEP 0 - memory scan (topics: desktop-client-update program, windows-30fps
investigation H6 note about forced GpuPreference on MUXless panels).

STEP 1 - LOAD CONTEXT: Explore agent (budget ~30 calls, report-first) summarizes:
state.md (bridge recipe + shell-strings recipe), progress.md, this file;
electron/main.cjs logGpuStatus + the did-finish-load binding; electron/gpu_preference.cjs
summarizeGpuDevices + isSoftwareRenderer + aux.softwareRendering surface;
electron/preload.cjs subscription shape (onUpdateEvent is the template);
tests/electron_ipc_channels.test.ts pinned arrays; src/game/software_render_notice.ts,
src/ui/gpu_notice_toast.ts, src/ui/gpu_notice_view.ts (current trigger logic +
desktop-specific body selection + once-per-install dismissal), and where gpuNotice.*
keys live in the i18n catalog. Return: the exact verdict fields main can compute, the
notice's current trigger inputs, and the dismissal persistence mechanism.

STEP 2 - EXECUTE. Deliverables (electron agent + renderer agent in parallel):
Electron agent:
- A pure module electron/gpu_status_events.cjs (+ .d.cts + Node test) that reduces the
  existing GPU diagnostics into a whitelisted payload
  { softwareRendering: boolean, discreteInactive: boolean, adapter: string } with
  length caps (mirror update_events.cjs style).
- Push it on a new channel 'desktop-gpu-status' via webContents.send from the existing
  logGpuStatus flow (it already re-fires after GPU-process crashes; keep .on
  semantics). Preload: onGpuStatus subscription with the house guards.
- Update tests/electron_ipc_channels.test.ts: the EXACT pinned push-channel array gains
  'desktop-gpu-status'; the preload method-name list gains onGpuStatus.
Renderer agent:
- Optional DesktopBridge.onGpuStatus member in src/runtime.ts (older shells lack it;
  consumers feature-check).
- A small module (src/game/desktop_gpu_status.ts, pure mapper + thin init) composed in
  initDesktopShellIntegration that merges the shell verdict into the gpu notice
  trigger: softwareRendering behaves like the existing software-render path;
  discreteInactive shows a NEW body ("your dedicated GPU is not being used" guidance)
  via a new gpuNotice key. English catalog only, and the value will be wordy, so add
  the five non-Latin fills (M16) in the same change.
- Respect the notice's once-per-install dismissal; a shell verdict must not resurrect
  a dismissed notice every launch, but a VERDICT CHANGE (e.g. newly software-rendering)
  should re-arm it. Extend the pure view/dismissal core and test both directions.

INVARIANTS IN PLAY: bridge members optional + feature-checked (web/mobile and older
shells unaffected); main stays language-agnostic (the notice renders in the renderer;
nothing user-visible originates in main); i18n every new string; S3 guard stays green.

Out of scope: the GPU-force opt-out setting (phase 7, needs the prefs store); any
gpu_preference.cjs behavior change; diagnostics-row UI beyond the notice.

STEP 3 - VALIDATION + REVIEW:
- `npx tsc --noEmit`; `npx vitest run tests/electron_*.test.ts tests/desktop_*.test.ts
  tests/gpu_notice_view.test.ts tests/localization_fixes.test.ts`; `npm run ci:changed`.
- Review dispatch per the implementation-plan.md matrix: electron IPC surface ->
  privacy-security-review; renderer notice surface -> frontend-seam-reviewer. COVERAGE
  prompts, ~30-call budgets.
- `node scripts/gate_select.mjs`.

STEP 4 - COMMITS:
- feat(desktop): push the shell gpu verdict to the renderer
- feat(ui): surface software and discrete-inactive gpu verdicts in the gpu notice

STEP 5 - ACCEPTANCE:
- [ ] Payload whitelisted + capped, channel pinned, handler/subscription guards match
      house style.
- [ ] Notice fires off a shell verdict in a desktop run; dismissal semantics tested
      both directions; web build unaffected (bridge absent -> no-op).
- [ ] New keys English + five fills; S3 guard green; suites + gate_select green.

STEP 6 - DOCS + MEMORY: progress.md; state.md inventory (channel, bridge member,
settings/i18n keys).

STEP 7 - FINAL RESPONSE: status, files, validation, reviewer verdicts, handoff line.

STOPPING RULES: stop and ask if discreteInactive proves too noisy to be trustworthy as
a notice trigger on real hardware (false positives on single-GPU machines would train
players to ignore the notice; prefer shipping software-rendering only and deferring
discreteInactive with a note).
```
