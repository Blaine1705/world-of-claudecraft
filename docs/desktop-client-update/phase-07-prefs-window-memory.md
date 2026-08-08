# Phase 7: desktop preferences store and window memory

### Starter Prompt
```
This is Phase 7 of the Desktop Client Update: the desktop preferences store and window
memory.

Model: Fable 5, xhigh effort. Harness: Claude Code. Workflow orchestration: none in this phase (standard agent fan-out only).

PROJECT RULES (from docs/desktop-client-update/state.md): work ONLY in
/home/fernandoramirez/Documents/woc-desktop-client-update (git -C always); LOCAL-ONLY,
never push; first action pull+merge origin/release/v0.36.0; git status clean or stop.

Goal: the window remembers its size, position, and monitor; the shell gets its first
disk-persistence module; and Windows users get an opt-out from the forced
high-performance GPU preference (the MUXless-panel escape hatch).

CONTEXT: electron/ persistence is GREENFIELD (verified: nothing in electron/ writes to
disk today; state.md "Key repo recipes"). The store you build here is the pattern
later features (display mode, phase 8) will ride.

STEP 0 - memory scan (topics: desktop-client-update program, windows-30fps H6
cross-adapter note, options doctrine).

STEP 1 - LOAD CONTEXT: Explore agent (budget ~35 calls, report-first) summarizes:
state.md recipes (options doctrine, bridge recipe, pure-module pattern), progress.md,
this file; electron/main.cjs createMainWindow + app lifecycle; electron/
gpu_preference.cjs applyWindowsGpuPreference call site and the re-exec ordering
constraint (the GPU steering runs as the FIRST executable statement of main.cjs,
BEFORE app ready: the store must be readable synchronously that early);
electron/desktop_config.cjs + shell_strings.cjs as pure-module templates; the settings
files for the options row. Return: window creation flow, the exact point the GPU
preference is applied, and lifecycle events available for saving bounds.

STEP 2 - EXECUTE (electron agent + options agent in parallel):
Electron agent:
- electron/desktop_prefs.cjs (+ .d.cts + Node test): a pure, dependency-injected
  key-value store module: load(path) tolerant of missing/corrupt/oversized files
  (corrupt input yields defaults, never a throw), save(path, obj) atomic
  (write temp + rename), a strict schema validator that clamps every field it reads
  (numbers to sane ranges, strings to enums), and versioning for forward evolution.
  The file lives under app.getPath('userData') (main.cjs passes the path in; the
  module never imports electron). SECURITY: the store is UNTRUSTED input at read time;
  nothing from it may widen origins, feeds, or channels; it holds ONLY: window bounds
  {x,y,width,height}, displayId, maximized flag, gpuForceOptOut boolean (and later
  displayMode). Validate accordingly.
- Window memory: save bounds/display/maximized on 'resize'/'move' (debounced) and
  before quit; restore at createMainWindow with an on-screen validation (if the saved
  display is gone or bounds are off-screen, fall back to defaults centered on the
  nearest display). Respect minWidth/minHeight.
- GPU opt-out: when gpuForceOptOut is true, skip the Windows registry merge AND the
  force switches (and on Linux skip the PRIME re-exec env injection), logging the skip.
  The store read for this happens in the pre-ready path; keep it synchronous and
  failure-tolerant (any read problem means default behavior, force ON).
- Bridge: setGpuForceOptOut(boolean) invoke channel (trustedSender-gated, validated),
  persisted via the store; effect applies on NEXT launch (say so in the UI copy).
  ipc pins updated (invoke list + method list).
Options agent (the toggle, options doctrine end to end):
- BOOL_SETTINGS key forceHighPerfGpu (default true), options row (desktop-only
  visibility: feature-check the bridge; never show a dead control on web/mobile),
  applySetting arm calling the bridge, English catalog key + five non-Latin fills
  (M16; the label plus a "takes effect after restart" body are wordy), the three test
  pins (ordered GENERAL_KEYS, settings default+persistence, consumer test).
- The renderer setting and the shell store must not fight: the shell store is the
  source of truth; on boot the renderer reads the current value via a bridge getter
  (add getGpuForceOptOut or fold into an existing capability read) and reflects it,
  rather than pushing its localStorage value down.

INVARIANTS IN PLAY: prefs-store trust boundary (validate+clamp everything); bridge
members optional + feature-checked; i18n contract with M16; module-first (the store
logic is pure and Node-tested; main.cjs only wires paths and events).

Out of scope: display modes (phase 8); syncing bounds across machines; any cloud
anything; changing the DEFAULT GPU-force behavior (stays ON).

STEP 3 - VALIDATION + REVIEW:
- `npx tsc --noEmit`; `npx vitest run tests/electron_*.test.ts tests/desktop_*.test.ts
  tests/settings.test.ts tests/options_view.test.ts tests/localization_fixes.test.ts`;
  `npm run ci:changed`.
- Manual smoke if possible: pack, launch, resize/move, relaunch, verify restore; unplug
  scenario simulated by editing the store file to an absent displayId and verifying
  fallback. Record results.
- Review dispatch per the implementation-plan.md matrix: privacy-security-review
  (electron writes OS state + new IPC + the untrusted store) AND frontend-seam-reviewer
  (options surface). COVERAGE prompts, ~30-call budgets.
- `node scripts/gate_select.mjs`.

STEP 4 - COMMITS:
- feat(desktop): add a validated desktop preferences store
- feat(desktop): remember window bounds and display across launches
- feat(desktop): windows gpu preference opt-out setting

STEP 5 - ACCEPTANCE:
- [ ] Store survives corrupt/missing/oversized files and clamps every field (tests
      prove each case).
- [ ] Bounds restore validates on-screen presence; fallback tested.
- [ ] Opt-out skips registry/switches/PRIME on next launch, logged; default unchanged.
- [ ] Options row desktop-only, doctrine complete (all three pins), M16 fills present.
- [ ] Suites + gate_select green; smoke recorded.

STEP 6 - DOCS + MEMORY: progress.md; state.md inventory (store path + schema, new
channels/methods/settings/i18n keys; note the store as the pattern for phase 8).

STEP 7 - FINAL RESPONSE: status, files, validation, reviewer verdicts, handoff line.

STOPPING RULES: stop and ask if the pre-ready synchronous store read measurably delays
startup (it should be one tiny file; if it is not, the design needs another look);
stop if restoring bounds fights the phase 2 ready-to-show flow (show must still wait
for ready-to-show at the RESTORED size, no flash at default size first).
```
