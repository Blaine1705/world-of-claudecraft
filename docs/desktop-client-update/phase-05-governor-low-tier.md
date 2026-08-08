# Phase 5: governor recovery ladder and LOW-tier monotonicity

### Starter Prompt
```
This is Phase 5 of the Desktop Client Update: governor recovery ladder and LOW-tier
monotonicity.

Model: Opus 4.8, xhigh effort. Harness: Claude Code. ULTRACODE: not needed, but this is
the subtlest phase; prefer depth over speed.

PROJECT RULES (from docs/desktop-client-update/state.md): work ONLY in
/home/fernandoramirez/Documents/woc-desktop-client-update (git -C always); LOCAL-ONLY,
never push; first action pull+merge origin/release/v0.36.0 AND re-verify the two
verdicts below against merged code (upstream pacing work continues; commit dd6ce4b74b
was recent); git status clean or stop.

Goal: laptops on LOW stop rendering more than MEDIUM, and a degraded render scale can
always climb back when headroom exists.

CONTEXT (verified at base 6ed4d7e12c, brainstorm.md section 4 has the full verdicts):
- The frame-cap trap itself is FIXED (6ad39476f2); do not re-fix it, do not weaken its
  pins in tests/render_budget.test.ts.
- Residual: recover() in src/render/render_budget.ts restores resolution LAST, and its
  gate needs draw calls AND triangles AND grass tufts each <=90% of tier targets;
  ratcheting quality buckets toward band maxima raises those counters, so dense scenes
  stall the ladder before the resolution rung: render scale stays degraded forever.
- LOW > MEDIUM load, five mechanisms: grass radius 80 vs 76; band baselines 0.9/0.9/
  1.0/1.0 vs 0.78/0.74/0.72/0.8 (about 40% more grass at baseline); caps 560 calls /
  2.2M tris / 5600 tufts vs 420 / 1.8M / 3800; floors strictly above MEDIUM; and
  lowPlusGrassScale 1.08 fill. lowPlus is deliberate art direction for weak
  fragment-bound iGPUs, wrongly applied to every low-tier user.

STEP 0 - memory scan (topics: windows-30fps-pin-investigation, mobile-thermal-issue-2025
pacer-governor landmines, vacuous bound pins, mutation checks commit first).

STEP 1 - LOAD CONTEXT: Explore agent (budget ~40 calls, report-first) summarizes:
state.md, progress.md, this file; src/render/render_budget.ts WHOLE (it is the unit
under change: modes, reasons, caps, recover(), canRecover, the ladder order);
src/render/gfx.ts GFX_BUCKET_BANDS + CAPS_BY_TIER + the low/medium preset blocks + any
weak-iGPU classification that exists (search weakIntegratedGpu / classifyGpuRenderer /
lowPlus definition); tests/render_budget.test.ts and tests/gfx.test.ts current pins;
how foliage consumes grass levels (setGrassQuality path). Return: the ladder order and
gate as merged TODAY, the full low/medium numeric tables, whether a weak-iGPU
classifier exists, and every existing pin that constrains these numbers.

STEP 2 - EXECUTE (two agents in parallel: governor agent on render_budget.ts, tier
agent on gfx.ts; they touch disjoint files but share the Explore summary).
Governor agent, the ladder fix. Design intent (latitude on mechanism, not on outcome):
restore-to-baseline (including resolution) must complete BEFORE any above-baseline
ratchet, and the resolution rung must not be blocked by counter pressure that the
governor's own ratcheting created. The straightforward shape: reorder recovery so all
levels return to BASELINE first, resolution included, and only then allow band-maxima
climbing, with the counter gate applying to the above-baseline climb but not to the
return-to-baseline. Whatever shape you choose:
- Write the reproducing test FIRST: a state with degraded resolution, quality at band
  maxima, counters above 90% of targets, full frame headroom; assert resolution
  recovers. It must FAIL on the current code before your change (this is the
  early-exit-pin discipline: prove the trap exists, then spring it).
- Preserve every existing render_budget pin; the frame-cap tests stay untouched.
- Keep the mobile pacer landmine in mind (never infer work from wall cadence).
Tier agent, LOW monotonicity:
- Retune so plain LOW is monotonically lighter than or equal to MEDIUM on EVERY load
  axis: baseline effective grass radius (radius x baseline), band maxima, governor
  caps (calls, triangles, tufts), floors (effective floor load), and fill multipliers.
- lowPlus art direction survives ONLY for the weak-iGPU cohort: gate it on the
  existing classification if one exists, else add the narrowest classifier from the
  GPU-name buckets gfx.ts already computes. Document the chosen gate in state.md.
- Add a MONOTONICITY PIN test: for each axis above, assert low <= medium numerically
  (reading the real exported tables, comparing across tiers; no self-comparison, no
  vacuous bounds: use the actual table values).
- Respect existing gfx.test.ts pins; where a pin encodes the OLD inversion (e.g.
  shadow-map size relations), update it deliberately and say so in the commit body.

INVARIANTS IN PLAY: graphics fairness (this changes LOAD, never information); tier
knobs stay static-preset-driven; no renderer.ts coordinator growth (this phase should
live almost entirely in render_budget.ts + gfx.ts + tests); do not invent balance
numbers wholesale: derive LOW targets from MEDIUM's by monotone scaling and record the
derivation in the commit body.

Out of scope: shader-compile gates, WS recovery tail, the cap-detection window widening
(residual 2) unless it falls out for free; mobile thermal work; any preset UI change.

STEP 3 - VALIDATION + REVIEW:
- `npx tsc --noEmit`; `npx vitest run tests/render_budget.test.ts tests/gfx.test.ts`;
  `npm run ci:changed`.
- Perf evidence: `npm run perf:baseline` on LOW and MEDIUM presets; record that LOW's
  measured load (draw calls, frame ms on this machine's iGPU if selectable, else the
  counter summary) no longer exceeds MEDIUM's. Persist the numbers in the phase notes.
- Review dispatch per the implementation-plan.md matrix: frontend-seam-reviewer
  (render surface, fairness focus). COVERAGE prompt, ~30-call budget.
- `node scripts/gate_select.mjs`.

STEP 4 - COMMITS:
- fix(render): let recovery return to baseline before ratcheting and unblock the
  resolution rung
- fix(render): make the low preset monotonically lighter than medium and gate lowPlus
  on weak integrated gpus

STEP 5 - ACCEPTANCE:
- [ ] Reproducing ladder test failed pre-change, passes post-change; all prior
      render_budget pins green untouched.
- [ ] Monotonicity pins cover every named axis with real table values.
- [ ] lowPlus visuals preserved for the weak-iGPU cohort, gated and documented.
- [ ] perf:baseline evidence recorded; suites + gate_select green.

STEP 6 - DOCS + MEMORY: progress.md; state.md (the gate chosen for lowPlus, the
derivation rule for LOW numbers, evidence location); memory note if the ladder design
diverged from the suggested shape.

STEP 7 - FINAL RESPONSE: status, files, validation + perf numbers, reviewer verdict,
handoff line.

STOPPING RULES: stop and ask if preserving lowPlus for weak iGPUs requires a NEW
GPU-classification signal that does not exist and cannot be derived from current
buckets (that is a design decision, not an implementation detail); stop if any
existing frame-cap pin must be weakened to make the ladder fix pass.
```
