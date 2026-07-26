// THE STANDING per-frame perf-budget floor (v0.16.0).
//
// Every per-frame painter proved its write-elision + allocation budget ONCE
// at its own perf gate; those gates were one-shot. This file makes them permanent, so
// a future change that collapses the write-elision cache, reallocates a per-frame core,
// or unbounds a pool fails here instead of silently regressing. It is grounded in the
// COMMITTED baseline (hud_perf_budget.baseline.md): the
// durable anchor hudHotDomSkipRate >= 0.962 is READ from that file (never defaulted to
// 0), so a missing baseline fails the budget rather than passing a hollow gate.
//
// THE ASSERTIONS ARE SPLIT BY HOST so each runs where it can actually be measured:
//
//   ARM 1 - STATIC SOURCE-SCAN (Node, runs in every `npm test`): the raw-write and
//     layout-read rejection, over every src/ui painter under BOTH names src/ui/CLAUDE.md
//     sanctions (`*_painter.ts` and `*_window.ts`). Every FACET-ROUTED HUD painter must
//     route ALL per-frame writes through the PainterHost elided writers
//     (setText/setDisplay/setTransform/setWidth + setStyleProp/toggleClass/setAttr); no raw
//     .style/.textContent/.classList/.className/.setAttribute/.setProperty/.innerHTML
//     beyond a DOCUMENTED build-time exception. This is the same per-painter check the
//     per-frame painters used, consolidated. The canvas painters (cadence + cached tokens)
//     are not facet-routed and take the scan with their own counted exceptions plus an
//     identity proof; the cold window painters are not per-frame at all and take the two
//     halves of the contract that do not depend on cadence (no forced-reflow layout read,
//     no per-frame driver). Completeness checks pair the buckets with what is on disk so a
//     NEW src/ui painter cannot silently escape, whichever name it carries. (Render-resident
//     painters under src/render, e.g. the cadence-throttled nameplate painter, are
//     intentionally outside this HUD-painter file.)
//
//   ARM 2 - FAKE-DOM RUNTIME (Node, runs in every `npm test`): the skip-rate budget and
//     the allocation budget. The repo has NO jsdom (the tiny-dependency invariant), so
//     DOM-touching wiring is exercised with a hand-rolled fake DOM in the node env, the
//     same idiom tests/focus_manager.test.ts uses. The skip-rate loop drives the
//     non-pooled per-frame painters through a steady-state update loop over a REAL
//     makeWriterFacet and asserts (a) per painter: a cold-cache establishing frame writes
//     real DOM (non-vacuous) and a repeated identical frame writes NOTHING (perfect elision,
//     the Top-risk-1 collapse detector), and (b) aggregate: a derived skip-rate sanity bound.
//     It runs for BOTH a Sim-shaped and a ClientWorld-mirror-shaped input; in
//     the skip-rate loop the only MATERIAL divergence is unit_frame's offline-only absorb
//     shield (the other four painters get byte-identical input in both shapes). The
//     allocation proxy is the reference-stability probe (tests/util/alloc_probe): the
//     action-bar and auras view cores must return a REUSED container AND a REUSED .slots
//     array every tick; that arm feeds auras_view both the Sim aura value and the online-
//     zeroed value (the other axis).
//
//   ARM 3 - PERF_TOUR-DELEGATED (env HUD_PERF_BUDGET_TOUR=1, runs in the perf row, NOT
//     bare `npm test`): the wall-clock + elision + macro-pool budget. It reads a perf_tour
//     artifact (a real-browser run of scripts/perf_tour.mjs) and the same committed baseline,
//     and asserts (a) the tour rendered at least `tourMinFrames` real frames AND kept the
//     long-frame count `frameLong50` at or under the committed anchor (both captured under
//     PERF_GPU=1 on the owner's machine, so same-machine; on other hardware override the
//     long-frame anchor with a fresh same-machine capture via
//     HUD_PERF_BUDGET_TOUR_LONG50_BASELINE. The retired frameP95 gate was mathematically
//     unfailable: its 250 ms threshold EQUALED the sample clamp, so a saturated
//     catastrophically-slow run still passed; the frames floor kills that inverted-saturation
//     hole and the long-frame count actually moves when the frame path regresses),
//     (b) the elision-bypass write COUNT
//     `hudHotDomWrites` <= the baseline anchor, EVERY viewport (the run-length-independent
//     collapse signal; the skip RATIO is frame-count-dependent so it stays in the console for
//     context, not a hard gate), and (c) the FCT pool stays at/under FCT_POOL_CAP under
//     the scripted AoE burst (fctBurstBoundedNodes). SKIPPED when the env flag is unset so
//     bare `npm test` stays fast and portable (the baseline rows are still READ at
//     collection time, so a deleted row fails loudly even in bare `npm test`).
//
// COVERAGE NOTE (not a silent cap): the ARM 2 skip-rate loop drives the five non-pooled
// per-frame painters (xp_bar, swing_timer, cast_bar, unit_frame, action_bar), which
// together exercise all seven elided writers. The keyed-pool painters (auras, party,
// fct) build + reconcile real DOM nodes; their steady-state *_painter.test.ts
// tests prove no per-frame node CHURN plus targeted expensive-write gates (icon-url, crest
// class), while facet-level DOM write-elision is guaranteed by makeWriterFacet and proven
// with write/skip counters in tests/painter_host.test.ts; their bypass count rides ARM 3.
// ARM 1 still scans all eight painters (incl. the pooled ones) for raw writes + forced reflow.

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CastBarState } from '../src/render/cast_bar';
import type { AbilityDef, Aura } from '../src/sim/types';
import { type AuraInput, type AurasDeps, createAurasView } from '../src/ui/auras_view';
import {
  type CastBarElements,
  type CastBarOptions,
  CastBarPainter,
  type CastBarPaintInput,
} from '../src/ui/cast_bar_painter';
import { FCT_POOL_CAP } from '../src/ui/fct_painter';
import {
  type ActionBarPaintDescriptor,
  ActionBarPainter,
  type ActionBarSlotElements,
} from '../src/ui/hud/action_bar/action_bar_painter';
import {
  type ActionBarDeps,
  type ActionBarState,
  type ActionBarWorldInput,
  createActionBarView,
} from '../src/ui/hud/action_bar/action_bar_view';
import { makeWriterFacet, type PainterHostWriters } from '../src/ui/painter_host';
import type { SwingTimerState } from '../src/ui/swing_timer';
import { SwingTimerPainter } from '../src/ui/swing_timer_painter';
import { type UnitFrameDescriptor, unitFrameView } from '../src/ui/unit_frame';
import { type UnitFrameElements, UnitFramePainter } from '../src/ui/unit_frame_painter';
import type { XpBarView } from '../src/ui/xp_bar';
import { XpBarPainter } from '../src/ui/xp_bar_painter';
import { assertAllocationStable } from './util/alloc_probe';

// --------------------------------------------------------------------------
// The committed baseline (read, never defaulted).
// --------------------------------------------------------------------------

const BASELINE_FILE = './hud_perf_budget.baseline.md';
const baselineMd = readFileSync(new URL(BASELINE_FILE, import.meta.url), 'utf8');

// The skip-rate floor for ARM 2's DETERMINISTIC fake-DOM loop (a fixed write/skip count, so
// the ratio is stable there). The baseline records it as a markdown table row
// (`| **hudHotDomSkipRate** | **0.962** ... |`) for desktop and again as 0.961 for mobile.
// Take the STRICTEST (max) committed ratio rather than the first match, so a future doc
// reorder that floats the lower mobile row up cannot silently weaken the floor. Throw if no
// row exists so a deleted / unregenerated baseline fails the budget instead of defaulting.
function readBaselineSkipRateFloor(): number {
  const values = baselineMd
    .split('\n')
    .filter((l) => l.includes('hudHotDomSkipRate') && /\b0\.\d+/.test(l))
    .map((l) => Number(l.match(/\b(0\.\d+)/)?.[1]))
    .filter((n) => Number.isFinite(n));
  if (!values.length) {
    throw new Error(
      'hud_perf_budget.baseline.md: the hudHotDomSkipRate floor is missing. The committed baseline is absent or the key was removed; the skip-rate budget cannot be grounded. Regenerate + commit the perf baseline before relying on this gate.',
    );
  }
  return Math.max(...values);
}

// The DURABLE, RUN-LENGTH-INDEPENDENT anchor: the elision-bypass write COUNT
// (`hudHotDomWrites`). Unlike the skip RATIO (skipped / total), this does not move with the
// frame count. The establishing-write floor differs by viewport (the touch HUD builds more
// per-frame elements) and jitters by a write or two run to run, so the committed anchor is a
// single canonical row covering the WORST viewport plus that jitter as headroom. A collapse
// of write-elision makes it BALLOON toward the frame count; a healthy run holds it. This is the
// signal ARM 3 gates on instead of the frame-count-dependent ratio. The baseline records it as
// the canonical table row `| hudHotDomWrites | <count> | ...`; this parses THAT row specifically
// (not the first prose mention) so doc prose order or a historical figure in the narrative can
// never silently move the anchor. Throw if absent. A DELIBERATE future hot-write change (a new
// per-frame element) updates the table row in the baseline, like any golden value.
function readBaselineBypassCount(): number {
  const line = baselineMd
    .split('\n')
    .find((l) => /\|\s*hudHotDomWrites\s*\|\s*\d{2,}\s*\|/.test(l));
  const match = line?.match(/\|\s*hudHotDomWrites\s*\|\s*(\d{2,})\s*\|/);
  if (!match) {
    throw new Error(
      'hud_perf_budget.baseline.md: the canonical hudHotDomWrites anchor row (`| hudHotDomWrites | <count> |`) is missing. The committed baseline is absent or the key was removed; the bypass-count budget cannot be grounded.',
    );
  }
  return Number(match[1]);
}

// ARM 3's long-frame anchor: the COUNT of frames at or over 50 ms in the tour's sample
// window (`frameMs.long50`). Unlike the RETIRED frameP95 gate, whose 250 ms threshold
// EQUALED the PerfMonitor sample clamp and so could never fail (every catastrophic frame
// saturated INTO the passing value), the long-frame count grows with every hitch and
// cannot saturate into a pass. Same-machine-relative (captured under PERF_GPU=1, real
// GPU, on the owner's machine; see the baseline file): an operator on other hardware
// overrides it with a fresh same-machine capture via HUD_PERF_BUDGET_TOUR_LONG50_BASELINE.
// Parses ONLY the canonical table row `| frameLong50 | <count> | ...` (never a loose
// prose mention), throws if absent.
function readBaselineLongFrames(): number {
  const line = baselineMd.split('\n').find((l) => /\|\s*frameLong50\s*\|\s*\d+\s*\|/.test(l));
  const match = line?.match(/\|\s*frameLong50\s*\|\s*(\d+)\s*\|/);
  if (!match) {
    throw new Error(
      'hud_perf_budget.baseline.md: the canonical frameLong50 anchor row (`| frameLong50 | <count> |`) is missing. The committed baseline is absent or the key was removed; the long-frame budget cannot be grounded.',
    );
  }
  return Number(match[1]);
}

// ARM 3's saturation floor: the tour must have rendered at least this many real frames
// (`summary.frames`, the PerfMonitor frame counter). This is the other half of killing
// the inverted-saturation hole: a run so slow that every sample clamps also renders
// almost NO frames, so a frames floor fails it where the old p95 ceiling passed it.
// Parses ONLY the canonical table row `| tourMinFrames | <count> | ...`, throws if absent.
function readBaselineTourMinFrames(): number {
  const line = baselineMd.split('\n').find((l) => /\|\s*tourMinFrames\s*\|\s*\d+\s*\|/.test(l));
  const match = line?.match(/\|\s*tourMinFrames\s*\|\s*(\d+)\s*\|/);
  if (!match) {
    throw new Error(
      'hud_perf_budget.baseline.md: the canonical tourMinFrames floor row (`| tourMinFrames | <count> |`) is missing. The committed baseline is absent or the key was removed; the tour frame floor cannot be grounded.',
    );
  }
  return Number(match[1]);
}

const SKIP_RATE_FLOOR = readBaselineSkipRateFloor();
const BYPASS_ANCHOR = readBaselineBypassCount();
// Read at collection time (not inside the env-gated describe) so a deleted or
// unregenerated baseline row fails bare `npm test` loudly instead of silently
// skipping with the ARM 3 gate.
const LONG50_ANCHOR = readBaselineLongFrames();
const TOUR_MIN_FRAMES = readBaselineTourMinFrames();

// --------------------------------------------------------------------------
// ARM 1 - static write + layout-read rejection over every src/ui painter.
// --------------------------------------------------------------------------

// WHAT COUNTS AS A PAINTER HERE. src/ui/CLAUDE.md sanctions TWO painter filenames and
// this gate sweeps both: `<name>_painter.ts` and `<name>_window.ts`. Matching only the
// first is what left 35 window painters holding no raw-write contract and no
// forced-reflow contract at all.
const PAINTER_FILE_RE = /_(?:painter|window)\.ts$/;

// Every matcher below is a LABEL plus its own regex rather than a bare token string. The
// label is what an allowance map is keyed by and what a failure names; the regex is what
// actually counts. The pairing is not cosmetic: the token list this replaced built
// `new RegExp('\\' + token + '\\b')`, which only escapes cleanly for a LEADING-DOT member
// token (a dotless `removeAttribute` would have become a `\r` carriage return and matched
// nothing), and that constraint is exactly what made the getComputedStyle arm dead below.

// The raw-DOM-write vocabulary the per-frame painters reject. Every per-frame write must
// go through a facet writer, so any of these on a painter's hot path is a facet-routing
// break. Each painter pins its DOCUMENTED build-time exceptions by COUNT (the same
// allowances the per-painter tests pin): a pooled node's class is set once in its
// builder, not per frame.
const RAW_WRITES: ReadonlyArray<readonly [string, RegExp]> = [
  ['.style', /\.style\b/g],
  ['.textContent', /\.textContent\b/g],
  ['.classList', /\.classList\b/g],
  ['.className', /\.className\b/g],
  ['.setAttribute', /\.setAttribute\b/g],
  ['.removeAttribute', /\.removeAttribute\b/g],
  ['.setProperty', /\.setProperty\b/g],
  ['.innerHTML', /\.innerHTML\b/g],
  ['.dataset', /\.dataset\b/g],
];

// Forced-reflow READ matchers: a layout read (offsetWidth, getBoundingClientRect,
// getComputedStyle, ...) flushes pending style/layout and is the classic browser-perf
// killer (layout thrash). Unlike write-elision this contract does NOT depend on cadence,
// which is why it is the half of the painter contract every bucket below holds: a window
// that measures a rect per row while building two hundred rows thrashes layout exactly
// like a per-frame painter does. Only a DOCUMENTED, counted read is allowed.
//
// THE getComputedStyle ARM IS THE POINT OF THE PAIR FORM. It used to be spelled
// `.getComputedStyle`, a member access, and `grep -rn '\.getComputedStyle' src/` returns
// ZERO hits repo-wide: this tree always calls the global BARE
// (`getComputedStyle(document.documentElement)` in minimap_painter, map_window_painter,
// delve_map_painter, talents_window, market_window, ui_scale, hud). So the single most
// expensive read in the vocabulary was counted on no painter at all, hot ones included.
// The matcher below sees the bare call AND the `window.getComputedStyle(...)` member form,
// and refuses an unrelated identifier that merely ENDS in the same word.
const FORCED_REFLOW_READS: ReadonlyArray<readonly [string, RegExp]> = [
  ['.offsetWidth', /\.offsetWidth\b/g],
  ['.offsetHeight', /\.offsetHeight\b/g],
  ['.offsetTop', /\.offsetTop\b/g],
  ['.offsetLeft', /\.offsetLeft\b/g],
  ['.clientWidth', /\.clientWidth\b/g],
  ['.clientHeight', /\.clientHeight\b/g],
  ['.scrollWidth', /\.scrollWidth\b/g],
  ['.scrollHeight', /\.scrollHeight\b/g],
  ['.getBoundingClientRect', /\.getBoundingClientRect\b/g],
  ['.getClientRects', /\.getClientRects\b/g],
  ['getComputedStyle', /(?<![\w$])getComputedStyle\s*\(/g],
];

// The per-frame DRIVERS a COLD painter must not own. This is the cold bucket's answer to
// "what makes a write per-frame?": a cold window renders on open / refresh because nothing
// repeatedly calls it. Give the module its own repeating callback and every write inside
// it becomes periodic, whatever the module is named. `requestAnimationFrame` is the
// per-frame driver literally (zero window painters own one today, so the allowance is a
// hard zero); `setInterval` is the same shape at a chosen cadence, so it is counted rather
// than banned and each documented allowance records the interval it was granted for.
// Reached bare or off `window`, both forms count; `clearInterval` / `cancelAnimationFrame`
// deliberately do not.
const FRAME_DRIVERS: ReadonlyArray<readonly [string, RegExp]> = [
  ['requestAnimationFrame', /(?<![\w$])requestAnimationFrame\s*\(/g],
  ['setInterval', /(?<![\w$])setInterval\s*\(/g],
];

// The CANVAS_PAINTERS identity proof, which is what stops that list from being a
// no-contract parking space for a module that would otherwise answer to the src/ui module
// sweep in tests/architecture.test.ts. A registered canvas painter must BOTH name a 2D
// context type and actually issue a 2D drawing call.
//
// Both halves are load-bearing. The type reference alone is trivially gameable, since
// `CanvasRenderingContext2D` is a lib.dom global with no import line to grep and any module
// can annotate an unused parameter with it. The drawing vocabulary is behavioral and
// survives type erasure; it is a CLOSED list of methods that exist only on a 2D context, so
// an ordinary `rows.fill(0)` or `list.stroke` cannot match (`.fill(` and `.stroke(` are
// deliberately absent for exactly that reason). The binding case is unit_portrait_painter,
// the least canvas-heavy of the five, with one clearRect and two drawImage calls.
const CANVAS_CONTEXT_RE = /\b(?:Offscreen)?CanvasRenderingContext2D\b/;
const CANVAS_DRAW_RE =
  /\.(?:beginPath|closePath|moveTo|lineTo|arcTo|ellipse|quadraticCurveTo|bezierCurveTo|fillRect|strokeRect|clearRect|fillText|strokeText|drawImage|createLinearGradient|createRadialGradient|createPattern|putImageData|getImageData|createImageData|measureText|setLineDash|roundRect)\s*\(/;

// Both arms drive ONE assertion site, from this table, so the proof cannot be halved by
// pointing the second assertion at the first regex. Two canvas matchers both read right at
// a glance, so the teeth test below discriminates them by fixture rather than by name.
const CANVAS_IDENTITY: ReadonlyArray<readonly [string, RegExp, string]> = [
  [
    'names a 2D context type',
    CANVAS_CONTEXT_RE,
    'a CANVAS_PAINTERS entry must name a 2D context type (CanvasRenderingContext2D), whether it mints the context or takes one injected',
  ],
  [
    'draws on a 2D context',
    CANVAS_DRAW_RE,
    "a CANVAS_PAINTERS entry must actually draw on a 2D context (fillText / drawImage / beginPath / ...). A module that only ANNOTATES a context is a DOM module wearing a painter's name: move it to UI_DOM_MODULES in tests/architecture.test.ts and rename it off *_painter.ts",
  ],
];

// The two fixtures that tell the arms apart: source that names the type and draws nothing,
// and source that draws and names no type. Each arm accepts exactly one of them.
const CANVAS_TYPE_ONLY = 'export function paint(ctx: CanvasRenderingContext2D): void { return; }';
const CANVAS_DRAW_ONLY = 'c.clearRect(0, 0, w, h); c.drawImage(sprite, x, y);';

// One allowance map per matcher list, keyed by the labels above. Anything not listed must
// be ZERO, and the count is EXACT in both directions, which is what keeps an allowance from
// rotting: a granted read that is later deleted fails until the number comes back down.
type TokenAllowance = Readonly<Partial<Record<string, number>>>;

interface ScannedPainter {
  file: string;
  allow: TokenAllowance;
  reflowAllow: TokenAllowance;
}

// BUCKET 1 of 3, the strictest: facet-routed per-frame painters. Allowed counts: anything
// not listed must be ZERO. auras builds its pooled node + the .dur / .stacks children once
// in createNode (3 className writes); fct sets the base class once and aria-hidden once per
// pooled node, both at build; fct also forces ONE documented offsetWidth reflow to restart
// the float animation on a recycled node.
const HOT_PAINTERS: ReadonlyArray<ScannedPainter> = [
  { file: 'xp_bar_painter.ts', allow: {}, reflowAllow: {} },
  { file: 'swing_timer_painter.ts', allow: {}, reflowAllow: {} },
  { file: 'proc_overlay_painter.ts', allow: {}, reflowAllow: {} },
  { file: 'cast_bar_painter.ts', allow: {}, reflowAllow: {} },
  { file: 'unit_frame_painter.ts', allow: {}, reflowAllow: {} },
  { file: 'hud/action_bar/action_bar_painter.ts', allow: {}, reflowAllow: {} },
  { file: 'hud/action_bar/mobile_action_ring_painter.ts', allow: {}, reflowAllow: {} },
  { file: 'party_frames_painter.ts', allow: {}, reflowAllow: {} },
  // party_below_target measures the target frame, its #tf-debuffs strip, the
  // party container, and (on mobile) the rows wrapper + move zone (five rect
  // reads) ONLY when its cheap invalidation key changes (target/buff-count/
  // layout change), never steady-state per frame; every property write routes
  // through the elided setStyleProp facet. The same gated measure also pays
  // getComputedStyle via the shared getUiScale helper (ui_scale.ts), which
  // this per-file scan cannot see; it is behind the same key, so steady state
  // stays layout-read-free.
  {
    file: 'party_below_target_painter.ts',
    allow: {},
    reflowAllow: { '.getBoundingClientRect': 5 },
  },
  // cold-path chrome wiring (click/roving-keyboard listeners), fired once per full
  // window render like the hand-rolled listeners it replaces, not a per-frame painter.
  // It makes no raw DOM writes; the 3 `.dataset` hits are reads of `tab.dataset.tab`
  // (one in the click handler, one in the roving-key branch, one in the Enter/Space
  // branch), never a per-frame write.
  { file: 'tab_strip_painter.ts', allow: { '.dataset': 3 }, reflowAllow: {} },
  // yumi builds its whole strip + respawn overlay once in ensureEls (14 class
  // assignments + the two role attributes + the toggle's type); every
  // per-frame write is facet-routed.
  {
    file: 'yumi_match_painter.ts',
    allow: { '.className': 14, '.setAttribute': 3 },
    reflowAllow: {},
  },
  { file: 'auras_painter.ts', allow: { '.className': 3 }, reflowAllow: {} },
  {
    file: 'fct_painter.ts',
    allow: { '.className': 1, '.setAttribute': 1 },
    reflowAllow: { '.offsetWidth': 1 },
  },
  // deed_tracker builds its whole static skeleton (header + pooled lines) in
  // ONE constructor innerHTML write; every refresh write is facet-routed. The
  // three setAttribute/removeAttribute pairs run ONLY on a chip-mode
  // transition (compact-touch tier flip, guarded by lastChip): the elided
  // setAttr facet caches per (element, attr) and would go stale across a raw
  // removeAttribute, so the transition swap must be direct. Never per-frame.
  {
    file: 'deed_tracker_painter.ts',
    allow: { '.innerHTML': 1, '.setAttribute': 3, '.removeAttribute': 3 },
    reflowAllow: {},
  },
];

// BUCKET 2 of 3: the src/ui painters that are NOT facet-routed because they draw to a 2D
// canvas under the cadence + cached-token regime (resolve --color-* tokens once, never
// per-marker), where canvas drawing and one-time element sizing are not "raw per-frame DOM
// writes". They are still SCANNED, with their own counted exceptions.
//
// This list used to be a bare five-line exemption with no scan behind it, which made
// "name your DOM-touching module <thing>_painter.ts and add one line here" the cheapest way
// for a src/ui module to hold no contract at all: the module sweep in
// tests/architecture.test.ts carves every *_painter.ts out of its own domain and hands it
// here. Three things now stand behind the list instead: the same raw-write scan, the same
// forced-reflow scan, and the CANVAS_* identity proof above, which a parked DOM module
// fails. (Render-resident painters under src/render, e.g. the cadence-throttled
// nameplate_painter, are intentionally outside this HUD-painter file.)
//
// The counted reads are the token resolves this file's prose used to merely assert: each of
// the three map-family painters holds ONE getComputedStyle pass over the document element,
// reading its whole --color-* group in one go (minimap caches the result for the session;
// map and delve re-resolve per redraw). unit_portrait keys its decode-race guard off
// canvas.dataset.portrait, 4 accesses around one async image decode; perf_graph is handed
// both its context and its color and reaches for neither.
const CANVAS_PAINTERS: ReadonlyArray<ScannedPainter> = [
  { file: 'hud/delve/delve_map_painter.ts', allow: {}, reflowAllow: { getComputedStyle: 1 } },
  { file: 'map_window_painter.ts', allow: {}, reflowAllow: { getComputedStyle: 1 } },
  { file: 'minimap_painter.ts', allow: {}, reflowAllow: { getComputedStyle: 1 } },
  { file: 'perf_graph_painter.ts', allow: {}, reflowAllow: {} },
  { file: 'unit_portrait_painter.ts', allow: { '.dataset': 4 }, reflowAllow: {} },
];

// BUCKET 3 of 3: cold painters, the DEFAULT for a `*_window.ts`. A window renders on open
// and on refresh, not per frame, so it is deliberately NOT held to write-elision, and this
// is a decision rather than an oversight. Write-elision is a PER-FRAME contract: it pays
// for itself when the same value is rewritten sixty times a second and buys nothing on a
// once-per-open rebuild. A raw-write COUNT over that rebuild would be a number with no
// signal in either direction: it fails on the ordinary window edits that make up a large
// share of src/ui commits, while the hazard it is supposed to catch, an EXISTING write
// becoming periodic, moves no count at all. (The measurement that settled it, taken when
// this bucket was added rather than pinned anywhere: the heaviest window carried well over
// two hundred build-time writes and was the single most-edited module in the family, so the
// gate would have reddened on a large fraction of the commits that touch a window and on
// none of the ones that would matter.)
//
// So the cold bucket holds the two contracts that do not depend on cadence, and holds them
// with the same exact counts every other bucket uses:
//   - no forced-reflow layout read (layout thrash is expensive per REDRAW, not per frame),
//   - no per-frame DRIVER of its own (the thing that would actually make a cold write
//     periodic; see FRAME_DRIVERS above).
// A window that genuinely goes per-frame is moved into HOT_PAINTERS, and the raw-write scan
// applies to it there.
//
// Cold needs NO registration, which is what makes it safe as a default: every window painter
// not listed below is held to zero on every matcher, so a new window is covered the day it
// lands rather than the day someone remembers it. The asymmetry with `*_painter.ts`, which must be consciously placed
// in HOT_PAINTERS or CANVAS_PAINTERS or fail the completeness check, is on purpose: that
// name asserts "per-frame or canvas", so a forgotten one is a real mistake, while cold is
// simply what a window is.
interface ColdPainter {
  file: string;
  reflowAllow: TokenAllowance;
  driverAllow: TokenAllowance;
}

const COLD_PAINTER_ALLOWANCES: ReadonlyArray<ColdPainter> = [
  // One rect off `ev.currentTarget` inside a pointer handler, to anchor the item action
  // menu at the tapped slot. Per interaction, never per redraw.
  { file: 'bags_window.ts', reflowAllow: { '.getBoundingClientRect': 1 }, driverAllow: {} },
  // Two polls that repaint an OPEN window only: a 15s refresh of the reward state and a
  // 30s countdown tick. Both are page-cadence, not frame-cadence, and both no-op while the
  // window is closed.
  { file: 'daily_rewards_window.ts', reflowAllow: {}, driverAllow: { setInterval: 2 } },
  // The lockpick clock: a 100ms tick that repaints the remaining-time bar for the duration
  // of one attempt, generation-guarded and cleared on stop. The one repeating repaint in
  // the cold bucket, and the reason setInterval is counted here rather than banned.
  {
    file: 'hud/delve/lockpick_window.ts',
    reflowAllow: {},
    driverAllow: { setInterval: 1 },
  },
  // A body/wrap rect pair, read once when the mail body is laid out to fit.
  { file: 'mailbox_window.ts', reflowAllow: { '.getBoundingClientRect': 2 }, driverAllow: {} },
  // The trigger + popover rect pair that positions a filter popover, plus the two border
  // widths its height clamp needs. Per open, not per row.
  {
    file: 'market_window.ts',
    reflowAllow: { '.getBoundingClientRect': 2, getComputedStyle: 2 },
    driverAllow: {},
  },
  // The tree height-cap fit: the root's max-height, then the body and root tops and the
  // footer height, then one scrollHeight to decide whether the body needs to scroll. One
  // pass per layout, not per talent node.
  {
    file: 'talents_window.ts',
    reflowAllow: { '.getBoundingClientRect': 3, '.scrollHeight': 1, getComputedStyle: 1 },
    driverAllow: {},
  },
];

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

// `String.prototype.match` with a /g regex is stateless (it resets lastIndex itself), so
// the shared matcher objects above can be counted against many files without leaking a
// cursor between them. Never call .test() on one of those; the identity regexes that ARE
// tested carry no /g flag.
function countMatches(code: string, re: RegExp): number {
  return (code.match(re) ?? []).length;
}

function painterSource(file: string): string {
  return stripComments(readFileSync(new URL(`../src/ui/${file}`, import.meta.url), 'utf8'));
}

// The painter half of the src/ui classification: these two suffixes are what make a module
// a painter. The OTHER half is the module-classification sweep in
// tests/architecture.test.ts, whose literal SWEPT_BY_NAME_RE carves *_painter.ts out of its
// own domain and hands it here, and keeps *_window.ts. The two are coupled by shared
// suffixes, not by a shared symbol, so the dangerous edit is widening THAT one: adding
// _window to SWEPT_BY_NAME_RE would drop every window painter out of its module sweep, and
// it must not, because the two gates cover different things. A window painter is
// DOUBLE-COVERED on purpose: the module sweep pins that it owns browser state (UI_DOM_MODULES
// for the 29 that reach a host), and this gate pins its layout-read and frame-driver
// contract. Change them together.
function findUiPainters(dir: string, prefix = ''): string[] {
  const painters: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      painters.push(...findUiPainters(`${dir}/${entry.name}`, relative));
    } else if (entry.isFile() && PAINTER_FILE_RE.test(entry.name)) {
      painters.push(relative);
    }
  }
  return painters.sort();
}

const UI_DIR = fileURLToPath(new URL('../src/ui', import.meta.url));
const ON_DISK_PAINTERS = findUiPainters(UI_DIR);
const SCANNED_PAINTERS: ReadonlyArray<ScannedPainter> = [...HOT_PAINTERS, ...CANVAS_PAINTERS];
const SCANNED_FILES = new Set(SCANNED_PAINTERS.map((p) => p.file));
// Cold is scoped to the window name so an UNCLASSIFIED *_painter.ts does not quietly fall
// into the loosest bucket: it fails the completeness check below with the message that
// tells you to classify it, which is the property this gate already had.
const COLD_PAINTERS = ON_DISK_PAINTERS.filter(
  (f) => f.endsWith('_window.ts') && !SCANNED_FILES.has(f),
);

describe('hud_perf_budget ARM 1: hot painters make no raw DOM write (Node, npm test)', () => {
  for (const { file, allow, reflowAllow } of SCANNED_PAINTERS) {
    it(`${file} routes every per-frame write through the elided writers`, () => {
      const code = painterSource(file);
      for (const [token, re] of RAW_WRITES) {
        const expected = allow[token] ?? 0;
        const actual = countMatches(code, re);
        expect(
          actual,
          `${file}: ${token} appears ${actual}x, expected ${expected} (per-frame writes must go through the PainterHost facet; only a DOCUMENTED build-time exception is allowed)`,
        ).toBe(expected);
      }
    });

    it(`${file} makes no per-frame forced-reflow layout read`, () => {
      const code = painterSource(file);
      for (const [token, re] of FORCED_REFLOW_READS) {
        const expected = reflowAllow[token] ?? 0;
        const actual = countMatches(code, re);
        expect(
          actual,
          `${file}: ${token} appears ${actual}x, expected ${expected} (a per-frame layout read flushes pending layout = thrash; only a DOCUMENTED reflow flush is allowed)`,
        ).toBe(expected);
      }
    });
  }

  // The identity proof behind CANVAS_PAINTERS. Without it the list is a place to park a
  // DOM module: the src/ui module sweep in tests/architecture.test.ts hands every
  // *_painter.ts here, so a one-line addition would otherwise buy a total exemption from
  // both gates.
  for (const { file } of CANVAS_PAINTERS) {
    it(`${file} really is a canvas painter (the CANVAS_PAINTERS entry is earned)`, () => {
      const code = painterSource(file);
      for (const [what, re, why] of CANVAS_IDENTITY) {
        expect(re.test(code), `${file}: ${what}: ${why}`).toBe(true);
      }
    });
  }

  // Completeness, half 1: every on-disk src/ui/**/*_painter.ts is either facet-routed or a
  // documented canvas painter, so a NEW painter cannot silently escape the raw-write scan
  // by being forgotten from HOT_PAINTERS.
  it('classifies every src/ui *_painter.ts as facet-routed or a documented canvas painter', () => {
    const unclassified = ON_DISK_PAINTERS.filter(
      (name) => name.endsWith('_painter.ts') && !SCANNED_FILES.has(name),
    );
    expect(
      unclassified,
      `unclassified src/ui painter(s): add a facet-routed painter to HOT_PAINTERS (it must make no raw per-frame write) or a canvas painter to CANVAS_PAINTERS (it must pass the canvas identity proof):\n${unclassified.join('\n')}`,
    ).toEqual([]);
  });

  // Completeness, half 2, and the anti-vacuity pin for the widened matcher: the OTHER
  // sanctioned painter name is swept too. If PAINTER_FILE_RE were narrowed back to
  // *_painter.ts the cold sweep below would silently run over an empty set and every one of
  // its assertions would pass while covering nothing.
  it('sweeps every src/ui *_window.ts painter too (the second sanctioned painter name)', () => {
    const windows = ON_DISK_PAINTERS.filter((f) => f.endsWith('_window.ts'));
    expect(windows.length, 'the window painters vanished from the sweep').toBeGreaterThan(30);
    expect(windows).toContain('hud/vendor/vendor_window.ts');
    expect(windows).toContain('options_window.ts');
    expect(COLD_PAINTERS.length).toBeGreaterThan(30);
    // WHERE representative painters land, pinned by name. "every window is cold or scanned"
    // would be true by construction (COLD_PAINTERS is defined as the windows the scanned
    // buckets do not claim), so it could never fail and would prove nothing; these can.
    // map_window_painter is the one to watch: it carries `window` in its name but ends in
    // _painter, so it is the CANVAS branch and must not be mistaken for a window.
    expect(COLD_PAINTERS).toContain('hud/vendor/vendor_window.ts');
    expect(COLD_PAINTERS).toContain('options_window.ts');
    expect(windows).not.toContain('map_window_painter.ts');
    expect(SCANNED_FILES.has('map_window_painter.ts')).toBe(true);
  });

  // The cold contract. Swept as ONE test per matcher family over the whole bucket rather
  // than 70 near-identical cases, collecting every violation so a failure names all of them
  // at once (the idiom tests/architecture.test.ts uses for its own sweeps).
  it('cold window painters make no forced-reflow layout read beyond a documented allowance', () => {
    const allowances = new Map(COLD_PAINTER_ALLOWANCES.map((c) => [c.file, c.reflowAllow]));
    const violations: string[] = [];
    const scanned: string[] = [];
    let observed = 0;
    for (const file of COLD_PAINTERS) {
      const code = painterSource(file);
      const allow = allowances.get(file) ?? {};
      scanned.push(file);
      for (const [token, re] of FORCED_REFLOW_READS) {
        const expected = allow[token] ?? 0;
        const actual = countMatches(code, re);
        observed += actual;
        if (actual !== expected) {
          violations.push(`${file}: ${token} appears ${actual}x, expected ${expected}`);
        }
      }
    }
    // Non-vacuity for the sweep itself, not just for its bucket: a loop narrowed to an empty
    // slice, or a painterSource() that silently returned nothing, would report zero
    // violations over zero files and read as a clean bill of health.
    expect(scanned, 'the cold reflow sweep visited a different set than the cold bucket').toEqual(
      COLD_PAINTERS,
    );
    expect(scanned).toContain('talents_window.ts');
    expect(
      observed,
      'the cold reflow sweep matched nothing at all: it read no real source',
    ).toBeGreaterThan(0);
    expect(
      violations,
      `a layout read flushes pending style + layout every time it runs, so it is thrash on a window REDRAW just as much as on a frame. Hoist the read out of the loop, cache it behind the same invalidation key the redraw uses, or add a documented, counted entry to COLD_PAINTER_ALLOWANCES saying when it runs:\n${violations.join('\n')}`,
    ).toEqual([]);
  });

  it('cold window painters drive no frame loop of their own', () => {
    const allowances = new Map(COLD_PAINTER_ALLOWANCES.map((c) => [c.file, c.driverAllow]));
    const violations: string[] = [];
    const scanned: string[] = [];
    let observed = 0;
    for (const file of COLD_PAINTERS) {
      const code = painterSource(file);
      const allow = allowances.get(file) ?? {};
      scanned.push(file);
      for (const [token, re] of FRAME_DRIVERS) {
        const expected = allow[token] ?? 0;
        const actual = countMatches(code, re);
        observed += actual;
        if (actual !== expected) {
          violations.push(`${file}: ${token} appears ${actual}x, expected ${expected}`);
        }
      }
    }
    // Same non-vacuity guard as the reflow sweep: zero violations over zero files is not a
    // pass. The positive control is the lockpick clock, the one repeating repaint the bucket
    // grants, so a matcher that stopped seeing `window.setInterval(` fails here too.
    expect(scanned, 'the cold driver sweep visited a different set than the cold bucket').toEqual(
      COLD_PAINTERS,
    );
    expect(scanned).toContain('hud/delve/lockpick_window.ts');
    expect(
      observed,
      'the cold driver sweep matched nothing at all: it read no real source, or the driver matchers went blind',
    ).toBeGreaterThan(0);
    expect(
      violations,
      `a cold painter renders on open and on refresh because nothing calls it repeatedly; give it its own repeating callback and every raw write inside that callback becomes periodic. Either document the cadence with a counted COLD_PAINTER_ALLOWANCES entry, or, if the component really is per-frame now, move it to HOT_PAINTERS and route its writes through the PainterHost facet:\n${violations.join('\n')}`,
    ).toEqual([]);
  });

  // Both-direction pins on the three lists, so none of them can rot into a blanket opt-out.
  // (The counted allowances need no separate staleness pin: they are matched EXACTLY, so a
  // granted read that is later deleted fails until the number comes back down.)
  it('registers each classified painter once, on disk, in exactly one bucket', () => {
    const problems: string[] = [];
    const seen = new Set<string>();
    const onDisk = new Set(ON_DISK_PAINTERS);
    for (const [name, files] of [
      ['HOT_PAINTERS', HOT_PAINTERS.map((p) => p.file)],
      ['CANVAS_PAINTERS', CANVAS_PAINTERS.map((p) => p.file)],
      ['COLD_PAINTER_ALLOWANCES', COLD_PAINTER_ALLOWANCES.map((c) => c.file)],
    ] as const) {
      for (const file of files) {
        if (!onDisk.has(file)) problems.push(`${file} (${name}: not an on-disk src/ui painter)`);
        if (seen.has(file)) problems.push(`${file} (${name}: classified twice)`);
        seen.add(file);
      }
    }
    // A cold allowance for a file that is not cold would be an allowance for nothing: the
    // scanned buckets never consult driverAllow, so the entry would silently do nothing.
    const cold = new Set(COLD_PAINTERS);
    for (const { file } of COLD_PAINTER_ALLOWANCES) {
      if (onDisk.has(file) && !cold.has(file)) {
        problems.push(`${file} (COLD_PAINTER_ALLOWANCES: not a cold painter, so nothing reads it)`);
      }
    }
    expect(
      problems,
      `each classified src/ui painter must exist and belong to exactly one bucket:\n${problems.join('\n')}`,
    ).toEqual([]);
  });

  // Teeth for the matchers this gate is built on. Every list is pinned BY IDENTITY as well
  // as by behavior, because a label-only pin lets an arm be swapped for a dead regex with
  // the whole suite green, and this gate shipped exactly that bug: `.getComputedStyle`
  // matched nothing in src/ for as long as the arm existed.
  it('the painter-gate matchers keep their teeth', () => {
    expect(PAINTER_FILE_RE.test('vendor_window.ts')).toBe(true);
    expect(PAINTER_FILE_RE.test('xp_bar_painter.ts')).toBe(true);
    expect(PAINTER_FILE_RE.test('unit_frame.ts')).toBe(false);
    expect(PAINTER_FILE_RE.test('options_view.ts')).toBe(false);
    expect(PAINTER_FILE_RE.test('map_window_painter.ts')).toBe(true);

    const reflow = new Map(FORCED_REFLOW_READS);
    const gcs = reflow.get('getComputedStyle');
    expect(gcs, 'the getComputedStyle arm must exist').toBeDefined();
    if (!gcs) return;
    // The BARE form is the one this tree actually writes and the one the retired
    // `.getComputedStyle` token could not see; the member form must still count.
    expect(countMatches('const cs = getComputedStyle(document.documentElement);', gcs)).toBe(1);
    expect(countMatches('window.getComputedStyle(el).display', gcs)).toBe(1);
    expect(countMatches('getComputedStyle (el)', gcs)).toBe(1);
    // ...but an unrelated identifier that merely ends in the same word must not.
    expect(countMatches('cachedGetComputedStyle(el)', gcs)).toBe(0);
    expect(countMatches('const getComputedStyleCache = new Map();', gcs)).toBe(0);
    // NON-VACUITY against the live tree, which is what a source-shape pin alone would miss:
    // minimap_painter's token resolve is a real bare call, so a re-narrowed arm counts 0
    // here and fails instead of passing quietly.
    expect(countMatches(painterSource('minimap_painter.ts'), gcs)).toBe(1);
    const rect = reflow.get('.getBoundingClientRect');
    expect(rect && countMatches('el.getBoundingClientRect().top', rect)).toBe(1);
    expect(rect && countMatches('const getBoundingClientRect = 1;', rect)).toBe(0);

    const drivers = new Map(FRAME_DRIVERS);
    const raf = drivers.get('requestAnimationFrame');
    const interval = drivers.get('setInterval');
    expect(raf && countMatches('requestAnimationFrame(step);', raf)).toBe(1);
    expect(raf && countMatches('window.requestAnimationFrame(step);', raf)).toBe(1);
    expect(raf && countMatches('cancelAnimationFrame(handle);', raf)).toBe(0);
    expect(interval && countMatches('this.poll = window.setInterval(fn, 15_000);', interval)).toBe(
      1,
    );
    expect(interval && countMatches('clearInterval(this.poll);', interval)).toBe(0);

    // The canvas identity proof: true of a real canvas painter, false of a real DOM module.
    // Each arm is fetched BY LABEL from the table the assertion loop reads, and checked
    // against the fixture only THAT arm may accept. Both arms are canvas matchers and both
    // read right at a glance, so pointing the draw assertion at the type regex would halve
    // the proof with everything green; here it flips two cases.
    const identity = new Map(CANVAS_IDENTITY.map(([what, re]) => [what, re]));
    const names = identity.get('names a 2D context type');
    const draws = identity.get('draws on a 2D context');
    expect(names && names.test(CANVAS_TYPE_ONLY)).toBe(true);
    expect(draws && draws.test(CANVAS_TYPE_ONLY)).toBe(false);
    expect(names && names.test(CANVAS_DRAW_ONLY)).toBe(false);
    expect(draws && draws.test(CANVAS_DRAW_ONLY)).toBe(true);
    expect(CANVAS_CONTEXT_RE.test('const ctx = new AudioContext();')).toBe(false);
    expect(CANVAS_DRAW_RE.test('ctx.fillText(label, 0, 0);')).toBe(true);
    // `.fill(` and `.stroke(` are deliberately OUT of the vocabulary: they collide with
    // Array.prototype.fill and with ordinary field names.
    expect(CANVAS_DRAW_RE.test('rows.fill(0);')).toBe(false);
    expect(CANVAS_DRAW_RE.test('this.bar.stroke();')).toBe(false);
    // bags_window is the control on purpose, since it is exactly the shape of module that
    // would be parked in CANVAS_PAINTERS to escape both gates.
    const control = painterSource('bags_window.ts');
    expect(CANVAS_CONTEXT_RE.test(control)).toBe(false);
    expect(CANVAS_DRAW_RE.test(control)).toBe(false);

    // Identity pins. Each arm is wired in by the regex OBJECT, not by its label, so a
    // weakened or dead arm cannot be swapped in behind a label that still reads right.
    expect(RAW_WRITES.map(([label]) => label)).toEqual([
      '.style',
      '.textContent',
      '.classList',
      '.className',
      '.setAttribute',
      '.removeAttribute',
      '.setProperty',
      '.innerHTML',
      '.dataset',
    ]);
    expect(FORCED_REFLOW_READS).toEqual([
      ['.offsetWidth', /\.offsetWidth\b/g],
      ['.offsetHeight', /\.offsetHeight\b/g],
      ['.offsetTop', /\.offsetTop\b/g],
      ['.offsetLeft', /\.offsetLeft\b/g],
      ['.clientWidth', /\.clientWidth\b/g],
      ['.clientHeight', /\.clientHeight\b/g],
      ['.scrollWidth', /\.scrollWidth\b/g],
      ['.scrollHeight', /\.scrollHeight\b/g],
      ['.getBoundingClientRect', /\.getBoundingClientRect\b/g],
      ['.getClientRects', /\.getClientRects\b/g],
      ['getComputedStyle', /(?<![\w$])getComputedStyle\s*\(/g],
    ]);
    expect(FRAME_DRIVERS).toEqual([
      ['requestAnimationFrame', /(?<![\w$])requestAnimationFrame\s*\(/g],
      ['setInterval', /(?<![\w$])setInterval\s*\(/g],
    ]);
  });
});

// --------------------------------------------------------------------------
// ARM 2 - fake-DOM runtime: skip-rate budget + allocation budget.
// --------------------------------------------------------------------------

// A fake element supporting exactly the write surface makeWriterFacet.apply() touches.
// It is only a Map key for the elision cache + a no-throw write sink; the facet never
// READS it back (the cache stores the value it last wrote), so nothing is recorded.
function fakeEl(): HTMLElement {
  return {
    textContent: '',
    style: {
      display: '',
      width: '',
      transform: '',
      setProperty(): void {},
    },
    classList: {
      toggle(): void {},
    },
    setAttribute(): void {},
  } as unknown as HTMLElement;
}

// One real write-elision facet over fresh caches + a single write/skip counter pair, so
// every painter driven through it shares ONE aggregate skip-rate (exactly how the Hud
// builds its facet over its own caches/counters).
function countingFacet(): { facet: PainterHostWriters; counts: { writes: number; skips: number } } {
  const counts = { writes: 0, skips: 0 };
  const facet = makeWriterFacet(
    new Map(),
    new Map(),
    new Map(),
    new Map(),
    () => {
      counts.writes++;
    },
    () => {
      counts.skips++;
    },
  );
  return { facet, counts };
}

type WorldShape = 'sim' | 'clientworld';

interface PainterHarness {
  name: string;
  drive: () => void;
}

// Build each non-pooled per-frame painter once, with fresh fake elements, plus a drive()
// closure that paints a STEADY view. `shape` selects the offline-only / online-zeroed
// fields: the values are byte-identical across drives within a shape, so a
// correctly-eliding painter writes only on the first drive.
function buildHarnesses(shape: WorldShape, facet: PainterHostWriters): PainterHarness[] {
  const harnesses: PainterHarness[] = [];

  // xp_bar: setWidth + setStyleProp (--xp-fill on bar + frame, rested geometry) + setText + toggleClass.
  {
    const bar = fakeEl();
    const fill = fakeEl();
    const rested = fakeEl();
    const label = fakeEl();
    const playerFrame = fakeEl();
    const painter = new XpBarPainter(facet, bar, fill, rested, label, playerFrame);
    const view: XpBarView = { fillFrac: 0.5, restedFrac: 0.1, label: 'XP 1 / 2', postCap: false };
    harnesses.push({ name: 'xp_bar', drive: () => painter.paint(view) });
  }

  // swing_timer: setDisplay + setWidth + toggleClass + setText.
  {
    const painter = new SwingTimerPainter(facet, fakeEl(), fakeEl(), fakeEl());
    const state: SwingTimerState = {
      visible: true,
      frac: 0.5,
      ready: false,
      labelKind: 'seconds',
      seconds: 1.4,
      nextPeriod: 2,
      nextTimer: 1,
    };
    harnesses.push({ name: 'swing_timer', drive: () => painter.paint(state) });
  }

  // cast_bar: setDisplay + toggleClass + setWidth + setText x2 + setAttr (aria-valuenow).
  {
    const els: CastBarElements = {
      bar: fakeEl(),
      fill: fakeEl(),
      label: fakeEl(),
      timer: fakeEl(),
    };
    const opts: CastBarOptions = { resolveCastLabel: (s) => s.label };
    const painter = new CastBarPainter(facet, els, opts);
    const cast: CastBarState = {
      visible: true,
      channel: false,
      fill: 0.8,
      label: 'fireball',
      fishing: false,
    };
    const input: CastBarPaintInput = { cast, castRemaining: 0.5 };
    harnesses.push({ name: 'cast_bar', drive: () => painter.paint(input) });
  }

  // unit_frame: setText + setTransform (hp, absorb, resource) + toggleClass (overshield,
  // resource type). The absorb shield is offline-only - present in the Sim
  // shape, zeroed in the ClientWorld mirror - so the painter sees both shapes.
  {
    const els: UnitFrameElements = {
      frame: fakeEl(),
      level: fakeEl(),
      hpFill: fakeEl(),
      hpText: fakeEl(),
      absorb: fakeEl(),
      resource: { container: fakeEl(), fill: fakeEl(), text: fakeEl() },
    };
    const painter = new UnitFramePainter(facet, els);
    const absorb =
      shape === 'sim'
        ? { hp: 300, maxHp: 600, auras: [{ kind: 'absorb', value: 100 } as unknown as Aura] }
        : { hp: 300, maxHp: 600, auras: [] as Aura[] };
    const desc: UnitFrameDescriptor = {
      present: true,
      hpFrac: 0.5,
      hpText: '300 / 600',
      resourceKind: 'mana',
      resFrac: 0.8,
      resText: '80 / 100',
      levelText: '60',
      name: 'Aerwynn',
      portraitKey: 'player',
      absorb,
      dead: false,
      outOfRange: false,
    };
    harnesses.push({ name: 'unit_frame', drive: () => painter.paint(unitFrameView(desc)) });
  }

  // action_bar: container many-spells toggle + per-slot writers + setAttr (aria-label).
  {
    const slot: ActionBarSlotElements = {
      btn: fakeEl(),
      label: fakeEl(),
      countEl: fakeEl(),
      keybindEl: fakeEl(),
      cdOverlay: fakeEl(),
      cdText: fakeEl(),
      rechargeOverlay: fakeEl(),
    };
    const descriptor: ActionBarPaintDescriptor = { container: fakeEl(), slots: [slot] };
    const painter = new ActionBarPainter(facet, descriptor, (key) => `URL(${key})`);
    const state: ActionBarState = {
      manySpells: false,
      slots: [
        {
          kind: 'ability',
          abilityId: 'x',
          itemId: null,
          iconKey: 'ability:x',
          cooldownRemaining: 0,
          cooldownTotal: 0,
          cooldownPercent: 0,
          cdText: '',
          count: '',
          isCharges: false,
          rechargePercent: 0,
          usable: true,
          outOfRange: false,
          queued: false,
          procGlow: false,
          empowered: false,
          ariaLabel: 'A',
          keybindLabel: 'K',
        },
      ],
    };
    harnesses.push({ name: 'action_bar', drive: () => painter.paint(state) });
  }

  return harnesses;
}

// Drive every painter once to establish, then REPEATS identical frames. A correctly
// eliding painter writes nothing on the repeats; a non-byte-identical cache key (risk 1)
// writes every frame and fails the per-painter `extra === 0` assertion immediately - that
// per-painter check is the REAL collapse detector. The aggregate skip-rate returned here is
// a derived structural sanity bound (with all painters eliding, it is deterministically
// ~64/65, comfortably above the floor); the production real-browser ratio is ARM 3's domain.
const REPEATS = 64;

function runSkipRateLoop(shape: WorldShape): number {
  const { facet, counts } = countingFacet();
  for (const harness of buildHarnesses(shape, facet)) {
    const beforeEstablish = counts.writes;
    harness.drive();
    // PER-PAINTER establishing-write proof (not just the aggregate): a cold cache must
    // produce real writes, so an inert harness that drives nothing can never pass vacuously.
    const established = counts.writes - beforeEstablish;
    expect(
      established,
      `${harness.name} (${shape}): the establishing (cold-cache) frame must perform real writes; got ${established}.`,
    ).toBeGreaterThan(0);
    const writesBefore = counts.writes;
    for (let frame = 0; frame < REPEATS; frame++) harness.drive();
    const extra = counts.writes - writesBefore;
    expect(
      extra,
      `${harness.name} (${shape}): a repeated identical frame must elide every write (got ${extra} new writes across ${REPEATS} steady frames). A non-byte-identical cache key collapses the skip-rate (Top risk 1).`,
    ).toBe(0);
  }
  const total = counts.writes + counts.skips;
  return counts.skips / total;
}

describe('hud_perf_budget ARM 2: write-elision skip-rate budget (Node fake-DOM, npm test)', () => {
  for (const shape of ['sim', 'clientworld'] as const) {
    it(`steady-state per-frame painting stays >= the skip-rate floor (${shape} shape)`, () => {
      const skipRate = runSkipRateLoop(shape);
      expect(
        skipRate,
        `${shape}: aggregate hot-DOM skip-rate ${skipRate.toFixed(4)} dropped below the committed floor ${SKIP_RATE_FLOOR}; the write-elision cache collapsed.`,
      ).toBeGreaterThanOrEqual(SKIP_RATE_FLOOR);
    });
  }
});

// --------------------------------------------------------------------------
// ARM 2 (cont.) - allocation budget: the per-frame view cores reuse their container.
// --------------------------------------------------------------------------

function actionBarDeps(): ActionBarDeps {
  return {
    t: (key, values) => (values ? `${key}|${JSON.stringify(values)}` : key),
    abilityName: (def) => def.id,
    itemName: (item) => item.id,
    slotLabel: (slotIndex) => `${slotIndex + 1}`,
    formatCount: (n) => String(n),
  };
}

function idleWorld(): ActionBarWorldInput {
  return {
    player: {
      autoAttack: false,
      dead: false,
      resource: 100,
      cooldowns: new Map(),
      gcdRemaining: 0,
      potionCdRemaining: 0,
      queuedOnSwing: null,
      stealthed: false,
      auras: [],
      pos: { x: 0, y: 0, z: 0 },
    },
    target: null,
    inventory: [],
  };
}

function aurasDeps(): AurasDeps {
  return {
    iconId: (a) => a.id,
    auraName: (a) => a.name,
    formatStacks: (n) => String(n),
    isOwn: () => false,
    durationUnits: () => ({ s: 's', m: 'm', h: 'h', d: 'd' }),
    auraEffectHtml: () => '',
  };
}

describe('hud_perf_budget ARM 2: per-frame allocation budget (Node, npm test)', () => {
  it('action_bar_view reuses its state container every tick (no per-frame garbage)', () => {
    const view = createActionBarView(
      {
        slots: [
          {
            slotIndex: 0,
            isAttack: () => false,
            hasAction: () => true,
            ability: () => ({
              def: {
                id: 'fireball',
                offGcd: false,
                cooldown: 6,
                requiresTarget: false,
                range: 0,
              } as unknown as AbilityDef,
              cost: 0,
            }),
            item: () => null,
            keybindLabel: () => '1',
          },
        ],
      },
      actionBarDeps(),
    );
    const world = idleWorld();
    expect(() => {
      // Both the wrapper AND the .slots array must be the SAME reference every tick (the
      // per-slot reference-stability property, not just "the wrapper is reused").
      assertAllocationStable(() => view.tick(world), 64, 'action_bar_view container');
      assertAllocationStable(() => view.tick(world).slots, 64, 'action_bar_view slots');
    }).not.toThrow();
  });

  // Drive auras_view with both the Sim aura (a positive value) and the
  // ClientWorld mirror (value zeroed online); both must tick into a reused container.
  for (const shape of ['sim', 'clientworld'] as const) {
    it(`auras_view reuses its state container every tick (${shape} shape)`, () => {
      const view = createAurasView('all', aurasDeps());
      const auras: AuraInput[] = [
        {
          id: 'a',
          name: 'A',
          kind: 'buff_ap',
          remaining: 600,
          value: shape === 'sim' ? 50 : 0,
        },
      ];
      expect(() => {
        assertAllocationStable(() => view.tick({ auras }), 64, `auras_view (${shape}) container`);
        assertAllocationStable(() => view.tick({ auras }).slots, 64, `auras_view (${shape}) slots`);
      }).not.toThrow();
    });
  }
});

// --------------------------------------------------------------------------
// ARM 3 - perf_tour-delegated (env-gated, perf row).
// --------------------------------------------------------------------------

const TOUR_ENABLED = process.env.HUD_PERF_BUDGET_TOUR === '1';
const tourDescribe = TOUR_ENABLED ? describe : describe.skip;

tourDescribe(
  'hud_perf_budget ARM 3: perf_tour-delegated frame + pool budget (HUD_PERF_BUDGET_TOUR=1)',
  () => {
    // The operator runs `PERF_VIEWPORT=<vp> PERF_OUT=<path> node scripts/perf_tour.mjs`
    // (a real browser over `npm run dev`), then points this arm at the artifact. It reuses
    // the perf_tour measurement path, never a new one.
    const viewport = process.env.HUD_PERF_BUDGET_TOUR_VIEWPORT ?? 'desktop';
    const resultPath = process.env.HUD_PERF_BUDGET_TOUR_RESULT ?? 'tmp/perf-tour-desktop.json';
    const long50Ref = process.env.HUD_PERF_BUDGET_TOUR_LONG50_BASELINE
      ? Number(process.env.HUD_PERF_BUDGET_TOUR_LONG50_BASELINE)
      : LONG50_ANCHOR;

    function loadArtifact(): {
      summary: Record<
        string,
        {
          frames: number;
          frameLong50: number;
          hudHotDomSkipRate: number;
          hudHotDomWrites: number;
        }
      >;
      results: Array<{
        viewport: string;
        fctBurst?: { spawnPerWave: number; max: number; min: number; drove: boolean };
      }>;
    } {
      const abs = resultPath.startsWith('/')
        ? resultPath
        : fileURLToPath(new URL(`../${resultPath}`, import.meta.url));
      return JSON.parse(readFileSync(abs, 'utf8'));
    }

    // The frames floor is what makes the frame gate FAILABLE: the retired frameP95
    // ceiling equaled the 250 ms sample clamp, so a catastrophically slow run
    // saturated every sample into a pass. A run that slow renders almost no frames,
    // so it dies here instead.
    it(`the tour renders at least tourMinFrames real frames on ${viewport}`, () => {
      const summary = loadArtifact().summary[viewport];
      expect(summary, `perf_tour artifact has no ${viewport} summary`).toBeDefined();
      expect(
        summary.frames,
        `${viewport} rendered ${summary.frames} frames, below the committed tourMinFrames floor ${TOUR_MIN_FRAMES}; the tour did not actually exercise the frame path (or the frame counter regressed). The floor is a PERF_GPU=1 same-machine value; see hud_perf_budget.baseline.md.`,
      ).toBeGreaterThanOrEqual(TOUR_MIN_FRAMES);
    });

    it(`long frames stay at or under the frameLong50 anchor on ${viewport}`, () => {
      const summary = loadArtifact().summary[viewport];
      expect(summary, `perf_tour artifact has no ${viewport} summary`).toBeDefined();
      expect(
        summary.frameLong50,
        `${viewport} produced ${summary.frameLong50} frames at or over 50 ms, above the anchor ${long50Ref} (same-machine PERF_GPU=1 value; on other hardware set HUD_PERF_BUDGET_TOUR_LONG50_BASELINE to a fresh same-machine capture).`,
      ).toBeLessThanOrEqual(long50Ref);
    });

    // ELISION-COLLAPSE GATE (every viewport). The regression signal is the elision-BYPASS
    // COUNT (`hudHotDomWrites`): the writes that bypassed the cache. It is run-length-
    // INDEPENDENT - a longer tour adds only SKIPS, never new bypass writes once state is
    // steady - so the committed anchor is a single canonical row covering the WORST viewport
    // (the touch HUD establishes more elements than desktop) plus a write or two of run
    // jitter; a collapse balloons the count toward the frame count, far past that headroom.
    // The skip RATIO (skipped / total) is a DERIVED quantity whose denominator is
    // the total frame count, which jitters with fps + machine load run to run, so the
    // ratio is NOT a safe cross-run hard gate.
    // We gate the COUNT (closes the mobile gap the old desktop-only ratio gate left open);
    // the ratio stays in the perf_tour console for human context. ARM 2's ratio floor is
    // safe because its fake-DOM loop has a FIXED denominator.
    it(`keeps the elision-bypass write count at or below the anchor (${viewport})`, () => {
      const summary = loadArtifact().summary[viewport];
      expect(summary, `perf_tour artifact has no ${viewport} summary`).toBeDefined();
      expect(
        summary.hudHotDomWrites,
        `${viewport} elision-bypass writes ${summary.hudHotDomWrites} exceed the anchor ${BYPASS_ANCHOR}; the write-elision cache collapsed (a real, run-length-independent per-frame regression). If this is a DELIBERATE new per-frame element, update the anchor in hud_perf_budget.baseline.md.`,
      ).toBeLessThanOrEqual(BYPASS_ANCHOR);
    });

    it(`the FCT pool stays cap-bounded under the scripted AoE burst (${viewport})`, () => {
      const burst = loadArtifact().results.find((r) => r.viewport === viewport)?.fctBurst;
      expect(burst, `perf_tour artifact has no fctBurst for ${viewport}`).toBeDefined();
      if (!burst) return;
      expect(burst.drove).toBe(true);
      expect(burst.min, 'the burst must actually spawn floaters').toBeGreaterThan(0);
      // Gate on the ACTUAL max-concurrent (FCT_POOL_CAP), imported from the painter, so a
      // silently-RAISED cap fails here; keep `< spawnPerWave` as the secondary unbounded-pool
      // tripwire (a per-event createElement regression climbs toward the spawn count).
      expect(
        burst.max,
        `FCT live nodes ${burst.max} exceed the pool cap ${FCT_POOL_CAP}; the bound was raised or removed.`,
      ).toBeLessThanOrEqual(FCT_POOL_CAP);
      expect(
        burst.max,
        `FCT live nodes ${burst.max} reached the spawn count ${burst.spawnPerWave}; the pool is not bounded.`,
      ).toBeLessThan(burst.spawnPerWave);
      expect(burst.max, 'the bounded pool must re-saturate to the same count each wave').toBe(
        burst.min,
      );
    });
  },
);
