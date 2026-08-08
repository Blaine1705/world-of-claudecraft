# Phase 6: three.js 0.185 train

### Starter Prompt
```
This is Phase 6 of the Desktop Client Update: the three.js 0.185 train.

Model: Fable 5, xhigh effort, 1m context variant if the renderer file load demands it.
Harness: Claude Code. Workflow orchestration: standard agent fan-out; the migration walk may be pipelined
with adversarial verification if this session is opted into Workflow orchestration
at runtime.

PROJECT RULES (from docs/desktop-client-update/state.md): work ONLY in
/home/fernandoramirez/Documents/woc-desktop-client-update (git -C always); LOCAL-ONLY,
never push; first action pull+merge origin/release/v0.36.0; git status clean or stop.

Goal: three 0.165.0 -> 0.185.1, postprocessing 6.36.0 -> 6.39.4, n8ao 1.10.1 -> 2.0.0,
on WebGL2, visually and behaviorally equivalent except reviewed-and-accepted lighting
differences, with perf evidence.

STEP 0 - memory scan (topics: desktop-client-update program, i18n semantic regressions
gate trap does NOT apply here, mutation checks commit first does).

STEP 0.5 - FREEZE THE BASELINE (before any dependency moves, on the merged base):
- `npm run perf:baseline` with its freeze/persist mechanism; record the run id/path in
  state.md.
- Capture reference screenshots across representative scenes (use the existing
  screenshot scripts; the perf:prewarm tour hits every biome + dungeon interior; the
  BROWSER_PATH for puppeteer is in memory: ~/.cache/ms-playwright/chromium-1228/
  chrome-linux64/chrome). Store under the scratchpad or a gitignored path, record where.
Commit nothing yet; the baseline is data, not source.

STEP 1 - LOAD CONTEXT: Explore agent (budget ~40 calls, report-first) summarizes:
state.md, progress.md, this file, brainstorm.md SECTION 3 ONLY (the migration action
list); then locate in src/render/: every onBeforeCompile / shader-chunk string patch
site and its anchor strings; every direct gl.* call on the caller-supplied context
(especially pixelStorei); PCFSoftShadowMap usage; Clock usage; background/environment
rotation usage; DRACOLoader/KTX2Loader decoder path config; MultiplyBlending/
SubtractiveBlending materials; anything reading renderer.info beyond the shim; the
matrixAutoUpdate=false manual-transform sites and how matrixWorldNeedsUpdate is
managed; Material.type assignments on custom materials. Also src/editor/ for
TransformControls. Return: a checklist of concrete hit sites per migration item.

STEP 2 - EXECUTE:
- `pnpm -C <worktree> add three@0.185.1 postprocessing@6.39.4 n8ao@2.0.0` and
  `pnpm -C <worktree> add -D @types/three@0.185.0` (or the closest published types
  version; record it).
- Walk the migration action list from brainstorm.md section 3 item by item against the
  Explore hit-list. For EACH item either patch the hit sites or record "no hit" in the
  phase notes; no item may be silently skipped. Highest-risk items to treat with extra
  care: r180 GLSL define renames vs our patch anchors; r184 pixelStorei-through-
  renderer.state on the caller-supplied context; r185 updateWorldMatrix honoring
  matrixWorldNeedsUpdate under scene.matrixAutoUpdate=false (audit every manual
  transform site for flag hygiene); r182 PCFSoft -> PCF shadows; postprocessing 6.39.0
  removed EffectComposer alpha param and createBuffer; 6.37.6 bloom default changes.
- n8ao 2.0.0: keep denoise settings equivalent to today; do NOT enable neuralDenoise
  (evaluate later, out of scope).
- Re-validate the two r165-era workarounds: the createLogicalFrameDrawStats shim
  (expected unaffected with autoReset=false; verify totals still make sense) and
  checkShaderErrors=false (keep it false for prod, but see the smoke below).
- Shader-error smoke: one dev run with checkShaderErrors temporarily ON, walking the
  prewarm tour; zero shader errors is the bar (the n8ao/three coupling has precedent
  for silent shader breaks).
- Chunk-anchor audit: grep every onBeforeCompile anchor string against the r185 chunk
  sources in node_modules/three/src/renderers/shaders/ and confirm each still matches
  exactly once (the migration guide does not enumerate chunk CONTENT edits; this is
  the OPEN item from research, close it empirically).

INVARIANTS IN PLAY: WebGL2 only, no WebGPU imports; dependency scope exactly these
four packages; no generated-file hand-edits; renderer.ts must not GROW (new logic goes
in sibling modules); do not delete or weaken existing render tests to get green.

Out of scope: visual redesigns; enabling new three/n8ao features; perf tuning beyond
what equivalence requires (phase 6 QA judges the numbers); WebGPU.

STEP 3 - VALIDATION + REVIEW:
- `npx tsc --noEmit` (expect @types/three churn; fix properly, no ts-ignore).
- `npm test` (FULL suite; this is a foundational dependency change, not a scoped one),
  bounded workers per repo doctrine (use the gate's runner, not an ad-hoc pipe).
- The shader smoke + chunk-anchor results recorded in the phase notes.
- `npm run perf:baseline` AFTER, same scenarios; compare to the frozen baseline. The
  comparison is INFORMATIONAL here; phase 6 QA holds the 5% gate.
- Visual: re-run the same screenshot set; eyeball for gross breaks (missing textures,
  black materials, broken skinning); the expected r181 lighting shift gets before/after
  pairs saved for the user decision in QA.
- Review dispatch per the implementation-plan.md matrix: frontend-seam-reviewer.
  A diff touching anything OUTSIDE src/render//src/game//src/ui//package.json/lockfile
  is a scope alarm; surface it.
- `node scripts/gate_select.mjs`.

STEP 4 - COMMITS (keep the story reviewable):
- chore(render): freeze the pre-upgrade perf baseline notes (docs only)
- chore(deps): three 0.185.1, postprocessing 6.39.4, n8ao 2.0.0
- fix(render): <one commit per migration cluster: shadows, blending, manual matrices,
  loader paths, shader anchors, postprocessing api>

STEP 5 - ACCEPTANCE:
- [ ] Every migration item has a patch or a recorded "no hit"; chunk anchors verified
      to match exactly once each.
- [ ] Full test suite green; tsc green; shader smoke clean on the tour.
- [ ] Draw-stats shim verified; checkShaderErrors back to false.
- [ ] Before/after perf numbers and screenshots captured and referenced in the notes.
- [ ] gate_select green.

STEP 6 - DOCS + MEMORY: progress.md; state.md (dependency moves, baseline paths, every
migration decision that future phases could trip over); memory note for the r181
lighting decision pending in QA.

STEP 7 - FINAL RESPONSE: status, migration walk summary (hits vs no-hits), validation
results, perf delta headline, reviewer verdict, handoff line for phase 6 QA.

STOPPING RULES: stop and ask if a migration item requires a behavioral choice with
player-visible consequences beyond lighting (e.g. a blending change that alters VFX
readability); stop if the full suite surfaces failures in sim/server tests (this diff
cannot legitimately cause those; a hit means the base merge or the environment, not
your change; diagnose before proceeding); stop if @types/three 0.185 does not exist
and the closest is a different minor (record and ask).
```
