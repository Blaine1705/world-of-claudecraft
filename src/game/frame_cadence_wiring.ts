// The thin consumer of the frame rate ceiling: it owns the frame loop's re-arm
// and answers "skip this callback?". main.ts calls it as the first statement of
// frame(), in place of its bare requestAnimationFrame, so a skipped callback
// returns before the frame clock is read and the next rendered frame
// integrates the real elapsed time, exactly as on a slower display.
//
// One chain, by construction: frame() runs only from the callback armed here,
// and each run arms exactly once (a rAF, or a timer that then requests the
// rAF). Changing the intent never arms anything.

import { arrivalCoverActive } from '../render/arrival_cover';
import { governorIsShedding, setChosenCadence } from '../render/chosen_cadence';
import {
  createRefreshEstimator,
  noteRefreshDelta,
  type RefreshVerdict,
  resetRefreshEstimatorWindow,
} from './display_refresh_estimator_core';
import {
  createFrameCadenceAuto,
  type FrameCadenceAutoFrame,
  resetFrameCadenceAutoWindow,
  restoreFrameCadenceAuto,
  stepFrameCadenceAuto,
} from './frame_cadence_auto_core';
import {
  type FrameCadenceAutoMemory,
  localFrameCadenceAutoMemory,
} from './frame_cadence_auto_memory';
import {
  configureFrameCadence,
  createFrameCadence,
  type FrameCeilingIntent,
  frameCadenceActive,
  frameCadenceNoteExemptRender,
  frameCadenceShouldRender,
  frameCadenceSleepMs,
} from './frame_cadence_core';
import {
  explicitCeilingIntent,
  type FrameRateCapReading,
  frameRateCapChoiceFromValue,
  frameRateCapReading,
} from './frame_rate_cap_setting';
import type { FrameHealthCadence } from './perf_frame_health_core';
import { SETTINGS_CHANGE_EVENT, Settings } from './settings';

/** The slice of the presentation gate input the ceiling yields to. */
export interface FrameCadenceGateView {
  hidden: boolean;
  desktopApp: boolean;
  graphicsRebuildPaused: boolean;
  worldDrawHeld: boolean;
}

export interface FrameCadenceDeps {
  requestFrame: (cb: FrameRequestCallback) => void;
  setTimer: (cb: () => void, ms: number) => void;
  /** A loading curtain covers the world: frames are cheap there and the
   *  preparation lanes advance per frame, so skipping would lengthen loading. */
  coverActive: () => boolean;
  /** Tell the renderer the chosen interval (0 for none), its miss share, and
   *  whether the governor must hold its quality levels. */
  publish: (targetIntervalMs: number, missShare: number, holdQuality: boolean) => void;
  /** The quality governor is still shedding (the automatic mode waits for it). */
  governorShedding: () => boolean;
  /** The automatic mode's remembered ceiling, keyed by what would invalidate it. */
  autoMemory: FrameCadenceAutoMemory;
}

export interface FrameCadenceSnapshot {
  /** Whether the automatic mode resolves the intent. */
  auto: boolean;
  /** The automatic mode is on a return trial. */
  autoTrial: boolean;
  /** The late share of the automatic mode's last closed window. */
  autoLateShare: number;
  intent: FrameCeilingIntent;
  verdict: RefreshVerdict;
  refreshHz: number;
  divisor: number;
  targetIntervalMs: number;
  missShare: number;
  rendered: number;
  skipped: number;
}

/** Every this many rendered frames, one interval is finished on bare rAF skips
 *  even in timer mode, so an `unpaced` verdict can be taken back. */
const UNPACED_REPROBE_FRAMES = 300;
/** With a ceiling asked for and no display reading (jittery uncapped rAF fits no
 *  lattice, and a busy callback hides an uncapped loop behind its own cost), a
 *  short burst of do-nothing callbacks asks the question directly. Rare: on a
 *  paced display the burst is a visible hitch of this many slots. */
const UNKNOWN_PROBE_CALLBACKS = 7;
const UNKNOWN_PROBE_EVERY_CALLBACKS = 1800;

export function parseFrameCeilingIntent(search: string): FrameCeilingIntent | null {
  const raw = new URLSearchParams(search).get('fpscap');
  if (raw === null) return null;
  if (raw === '30') return 30;
  if (raw === '60') return 60;
  return 0;
}

export class FrameCadenceWiring {
  private readonly estimator = createRefreshEstimator();
  private readonly cadence = createFrameCadence();
  private readonly autoState = createFrameCadenceAuto();
  private readonly snapshotOut: FrameCadenceSnapshot = {
    auto: false,
    autoTrial: false,
    autoLateShare: 0,
    intent: 0,
    verdict: 'unknown',
    refreshHz: 0,
    divisor: 1,
    targetIntervalMs: 0,
    missShare: 0,
    rendered: 0,
    skipped: 0,
  };
  private intent: FrameCeilingIntent = 0;
  private auto = false;
  private autoRestored = false;
  private lastRenderAt = 0;
  private frameCb: FrameRequestCallback | null = null;
  private lastCallbackAt = 0;
  private lastWasIdle = false;
  private armedByTimer = false;
  private wasExempt = false;
  private rendered = 0;
  private skipped = 0;
  private reprobing = false;
  private probeLeft = 0;
  private sinceProbe = UNKNOWN_PROBE_EVERY_CALLBACKS - 120;
  private readonly autoFrame: FrameCadenceAutoFrame = {
    dtSeconds: 0,
    late: false,
    refreshHz: 0,
    governorShedding: false,
  };
  private readonly onTimer = (): void => {
    if (this.frameCb) this.deps.requestFrame(this.frameCb);
  };

  constructor(private readonly deps: FrameCadenceDeps) {}

  /** An explicit ceiling. It always wins: the automatic mode is switched off. */
  setIntent(intent: FrameCeilingIntent): void {
    this.auto = false;
    this.intent = intent;
  }

  /** Let the automatic mode resolve the ceiling from what the machine holds. */
  setAuto(): void {
    if (this.auto) return;
    this.auto = true;
    this.intent = this.autoState.ceiling;
  }

  /** Re-arm the loop and report whether this callback must do nothing. */
  armAndSkip(frame: FrameRequestCallback, now: number, gate: FrameCadenceGateView): boolean {
    this.frameCb = frame;
    const delta = now - this.lastCallbackAt;
    const crossedTimer = this.armedByTimer;
    this.armedByTimer = false;
    const exempt =
      (gate.hidden && gate.desktopApp) ||
      gate.graphicsRebuildPaused ||
      gate.worldDrawHeld ||
      this.deps.coverActive();
    if (gate.hidden || exempt !== this.wasExempt) {
      resetRefreshEstimatorWindow(this.estimator);
      resetFrameCadenceAutoWindow(this.autoState);
      this.lastRenderAt = 0;
    } else if (this.lastCallbackAt > 0 && !crossedTimer) {
      noteRefreshDelta(this.estimator, delta, this.lastWasIdle);
    }
    this.wasExempt = exempt;
    this.lastCallbackAt = now;
    configureFrameCadence(
      this.cadence,
      this.intent,
      this.estimator.verdict,
      this.estimator.refreshMs,
    );
    const holdQuality = this.auto && (this.autoState.ceiling !== 0 || this.autoState.trial);
    this.deps.publish(this.cadence.targetIntervalMs, this.cadence.missShare, holdQuality);
    if (!exempt && this.probing()) {
      this.skipped++;
      this.lastWasIdle = true;
      this.deps.requestFrame(frame);
      return true;
    }
    if (exempt || !frameCadenceActive(this.cadence)) {
      if (exempt) frameCadenceNoteExemptRender(this.cadence, now);
      else {
        frameCadenceShouldRender(this.cadence, now);
        this.stepAuto(now, false);
      }
      this.lastWasIdle = false;
      this.rendered++;
      this.deps.requestFrame(frame);
      return false;
    }
    const render = frameCadenceShouldRender(this.cadence, now);
    if (render) {
      this.rendered++;
      this.stepAuto(now, true);
    } else this.skipped++;
    this.lastWasIdle = !render;
    this.arm(frame, now, render);
    return !render;
  }

  /** Feed the automatic mode one rendered frame. Only a paced display is a
   *  reading: without slots "late" has no meaning, so Auto stays where it is. */
  private stepAuto(now: number, underCeiling: boolean): void {
    const last = this.lastRenderAt;
    this.lastRenderAt = now;
    if (!this.auto || this.estimator.verdict !== 'paced' || last === 0) return;
    const refreshMs = this.estimator.refreshMs;
    const refreshHz = 1000 / refreshMs;
    if (!this.autoRestored) {
      this.autoRestored = true;
      const remembered = this.deps.autoMemory.load(refreshHz);
      if (remembered !== null && remembered !== this.autoState.ceiling) {
        restoreFrameCadenceAuto(this.autoState, remembered);
        this.intent = remembered;
        return;
      }
    }
    this.autoFrame.dtSeconds = (now - last) / 1000;
    this.autoFrame.late = underCeiling ? this.cadence.lastLate : now - last > refreshMs * 1.5;
    this.autoFrame.refreshHz = refreshHz;
    this.autoFrame.governorShedding = this.deps.governorShedding();
    if (!stepFrameCadenceAuto(this.autoState, this.autoFrame)) return;
    this.intent = this.autoState.ceiling;
    // A trial is a question, not an answer: only a settled ceiling is remembered.
    if (!this.autoState.trial) this.deps.autoMemory.save(refreshHz, this.autoState.ceiling);
  }

  private probing(): boolean {
    if (this.intent === 0 || this.estimator.verdict !== 'unknown') {
      this.probeLeft = 0;
      return false;
    }
    if (this.probeLeft === 0 && ++this.sinceProbe >= UNKNOWN_PROBE_EVERY_CALLBACKS) {
      this.sinceProbe = 0;
      this.probeLeft = UNKNOWN_PROBE_CALLBACKS;
    }
    if (this.probeLeft === 0) return false;
    this.probeLeft--;
    return true;
  }

  snapshot(): FrameCadenceSnapshot {
    const out = this.snapshotOut;
    out.auto = this.auto;
    out.autoTrial = this.auto && this.autoState.trial;
    out.autoLateShare = this.autoState.lastShare;
    out.intent = this.intent;
    out.verdict = this.estimator.verdict;
    out.refreshHz = this.estimator.refreshMs > 0 ? 1000 / this.estimator.refreshMs : 0;
    out.divisor = this.cadence.divisor;
    out.targetIntervalMs = this.cadence.targetIntervalMs;
    out.missShare = this.cadence.missShare;
    out.rendered = this.rendered;
    out.skipped = this.skipped;
    return out;
  }

  private arm(frame: FrameRequestCallback, now: number, rendered: boolean): void {
    // Paced: the skipped callback is the display's own slot, nothing to sleep.
    // Unpaced: a bare rAF re-fires at once, so sleeping is what stops a skipped
    // interval from spinning a core; the re-probe interval spins on purpose.
    const reprobe = rendered ? this.rendered % UNPACED_REPROBE_FRAMES === 0 : this.reprobing;
    this.reprobing = reprobe;
    if (this.cadence.paced || reprobe) {
      this.deps.requestFrame(frame);
      return;
    }
    const sleep = frameCadenceSleepMs(this.cadence, now);
    if (sleep < 1) {
      this.deps.requestFrame(frame);
      return;
    }
    this.armedByTimer = true;
    this.deps.setTimer(this.onTimer, sleep);
  }
}

let shared: FrameCadenceWiring | null = null;

function applyStoredChoice(wiring: FrameCadenceWiring): void {
  let intent: FrameCeilingIntent | null = 0;
  try {
    intent = explicitCeilingIntent(frameRateCapChoiceFromValue(new Settings().get('frameRateCap')));
  } catch {
    intent = 0;
  }
  if (intent === null) wiring.setAuto();
  else wiring.setIntent(intent);
}

/**
 * The game client's one instance. The intent is the player's stored setting,
 * re-read on every settings broadcast (the row is live, and no rebuild key).
 * `?fpscap=30|60|display` overrides it for the session: the bench arm, and the
 * support kill switch. It also exposes a dev handle to toggle without a reload.
 */
export function sharedFrameCadence(): FrameCadenceWiring {
  if (shared) return shared;
  const wiring = new FrameCadenceWiring({
    requestFrame: (cb) => requestAnimationFrame(cb),
    setTimer: (cb, ms) => setTimeout(cb, ms),
    coverActive: arrivalCoverActive,
    publish: setChosenCadence,
    governorShedding: governorIsShedding,
    autoMemory: localFrameCadenceAutoMemory,
  });
  shared = wiring;
  const fromUrl = typeof location === 'undefined' ? null : parseFrameCeilingIntent(location.search);
  if (fromUrl !== null) {
    wiring.setIntent(fromUrl);
    (globalThis as { __wocFrameCadence?: FrameCadenceWiring }).__wocFrameCadence = wiring;
    return wiring;
  }
  applyStoredChoice(wiring);
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener(SETTINGS_CHANGE_EVENT, () => applyStoredChoice(wiring));
  }
  return wiring;
}

/** frame()'s first statement in main.ts, in place of its bare re-arm. */
export function armFrameAndSkip(
  frame: FrameRequestCallback,
  now: number,
  gate: FrameCadenceGateView,
): boolean {
  return sharedFrameCadence().armAndSkip(frame, now, gate);
}

/** The perf beacon's `cadence` block (rawSummary): what tells a chosen ceiling
 *  from a struggling machine. A fresh small object per beacon, never per frame. */
export function frameCadenceBeaconBlock(): Record<string, number | string> {
  const s = sharedFrameCadence().snapshot();
  return {
    mode: s.auto ? 'auto' : 'manual',
    autoLateShare: Math.round(s.autoLateShare * 1000) / 1000,
    intent: s.intent,
    verdict: s.verdict,
    refreshHz: Math.round(s.refreshHz * 10) / 10,
    divisor: s.divisor,
    targetIntervalMs: Math.round(s.targetIntervalMs * 10) / 10,
    missShare: Math.round(s.missShare * 1000) / 1000,
    rendered: s.rendered,
    skipped: s.skipped,
  };
}

export interface FrameCadenceBeaconFields {
  frameCapIntent: FrameCeilingIntent;
  cadenceDivisor: number;
  refreshHz: number;
  targetFps: number;
}

/** The beacon's typed cadence fields, which the server stores as columns: the
 *  `cadence` block above is shed under a size squeeze, these are not. The
 *  target is the effective one, the ceiling's own rate while it is active. */
export function frameCadenceBeaconFieldsFrom(
  s: FrameCadenceSnapshot,
  budgetTargetFps: number,
): FrameCadenceBeaconFields {
  return {
    frameCapIntent: s.intent,
    cadenceDivisor: s.divisor,
    refreshHz: Math.round(s.refreshHz * 10) / 10,
    targetFps: s.targetIntervalMs > 0 ? Math.round(1000 / s.targetIntervalMs) : budgetTargetFps,
  };
}

export function frameCadenceBeaconFields(budgetTargetFps: number): FrameCadenceBeaconFields {
  return frameCadenceBeaconFieldsFrom(sharedFrameCadence().snapshot(), budgetTargetFps);
}

/** One `?perf` overlay line (dev diagnostics, English like the rest of it). */
export function frameCadenceOverlayLine(): string {
  const s = sharedFrameCadence().snapshot();
  const cap = `${s.auto ? (s.autoTrial ? 'auto-trial ' : 'auto ') : ''}${s.intent === 0 ? 'display' : s.intent}`;
  const target =
    s.targetIntervalMs > 0 ? `${s.targetIntervalMs.toFixed(1)}ms /${s.divisor}` : 'inert';
  return `cap ${cap}  ${s.verdict} ${s.refreshHz.toFixed(1)}Hz  ${target}  miss ${(s.missShare * 100).toFixed(1)}%  skip ${s.skipped}`;
}

/** The options row's reading for a stored value, on the display as read now. */
export function frameRateCapRowReading(storedValue: number): FrameRateCapReading {
  const s = sharedFrameCadence().snapshot();
  const explicit = explicitCeilingIntent(frameRateCapChoiceFromValue(storedValue));
  // Auto reads what it is doing right now, which is only known while it runs.
  const intent = explicit ?? (s.auto ? s.intent : 0);
  return frameRateCapReading(intent, s.verdict, s.refreshHz);
}

/** The chosen cadence for the frame-health readers, or null when there is none.
 *  A fresh small object per perf snapshot (1 Hz), never per frame. */
export function frameCadenceHealth(): FrameHealthCadence | null {
  const s = sharedFrameCadence().snapshot();
  if (!(s.targetIntervalMs > 0)) return null;
  return { targetIntervalMs: s.targetIntervalMs, missShare: s.missShare };
}
