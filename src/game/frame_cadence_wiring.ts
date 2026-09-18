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
import { setChosenCadence } from '../render/chosen_cadence';
import {
  createRefreshEstimator,
  noteRefreshDelta,
  type RefreshVerdict,
  resetRefreshEstimatorWindow,
} from './display_refresh_estimator_core';
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
  /** Tell the renderer the chosen interval (0 for none) and its miss share. */
  publish: (targetIntervalMs: number, missShare: number) => void;
}

export interface FrameCadenceSnapshot {
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
  private readonly snapshotOut: FrameCadenceSnapshot = {
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
  private readonly onTimer = (): void => {
    if (this.frameCb) this.deps.requestFrame(this.frameCb);
  };

  constructor(private readonly deps: FrameCadenceDeps) {}

  setIntent(intent: FrameCeilingIntent): void {
    this.intent = intent;
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
    if (gate.hidden || exempt !== this.wasExempt) resetRefreshEstimatorWindow(this.estimator);
    else if (this.lastCallbackAt > 0 && !crossedTimer) {
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
    this.deps.publish(this.cadence.targetIntervalMs, this.cadence.missShare);
    if (!exempt && this.probing()) {
      this.skipped++;
      this.lastWasIdle = true;
      this.deps.requestFrame(frame);
      return true;
    }
    if (exempt || !frameCadenceActive(this.cadence)) {
      if (exempt) frameCadenceNoteExemptRender(this.cadence, now);
      else frameCadenceShouldRender(this.cadence, now);
      this.lastWasIdle = false;
      this.rendered++;
      this.deps.requestFrame(frame);
      return false;
    }
    const render = frameCadenceShouldRender(this.cadence, now);
    if (render) this.rendered++;
    else this.skipped++;
    this.lastWasIdle = !render;
    this.arm(frame, now, render);
    return !render;
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

function storedIntent(): FrameCeilingIntent {
  try {
    const choice = frameRateCapChoiceFromValue(new Settings().get('frameRateCap'));
    return explicitCeilingIntent(choice) ?? 0;
  } catch {
    return 0;
  }
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
  });
  shared = wiring;
  const fromUrl = typeof location === 'undefined' ? null : parseFrameCeilingIntent(location.search);
  if (fromUrl !== null) {
    wiring.setIntent(fromUrl);
    (globalThis as { __wocFrameCadence?: FrameCadenceWiring }).__wocFrameCadence = wiring;
    return wiring;
  }
  wiring.setIntent(storedIntent());
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener(SETTINGS_CHANGE_EVENT, () => wiring.setIntent(storedIntent()));
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

/** One `?perf` overlay line (dev diagnostics, English like the rest of it). */
export function frameCadenceOverlayLine(): string {
  const s = sharedFrameCadence().snapshot();
  const cap = s.intent === 0 ? 'display' : String(s.intent);
  const target =
    s.targetIntervalMs > 0 ? `${s.targetIntervalMs.toFixed(1)}ms /${s.divisor}` : 'inert';
  return `cap ${cap}  ${s.verdict} ${s.refreshHz.toFixed(1)}Hz  ${target}  miss ${(s.missShare * 100).toFixed(1)}%  skip ${s.skipped}`;
}

/** The options row's reading for a stored value, on the display as read now. */
export function frameRateCapRowReading(storedValue: number): FrameRateCapReading {
  const intent = explicitCeilingIntent(frameRateCapChoiceFromValue(storedValue));
  if (intent === null) return { kind: 'none' };
  const s = sharedFrameCadence().snapshot();
  return frameRateCapReading(intent, s.verdict, s.refreshHz);
}
