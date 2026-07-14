// "Riding Lessons" mount-training window: the thin DOM consumer for
// Stablemaster Marla's story riding-lesson minigame (paints
// #mount-training-panel). Mirrors the lockpick_window.ts split: this module
// owns paint + the cosmetic per-round countdown; hud.ts owns open/close
// orchestration, focus, and the SimEvent handlers. It composes the pure view
// model in mount_training_view.ts and renders every player-visible string
// through the hudChrome.mountTraining.* t() keys.
//
// The reaction countdown is RENDER-ONLY, exactly like lockpick's per-step
// clock: the sim is authoritative on whether an answer landed in time (it
// reports the outcome via the mountTrainRound/mountTrainEnd events), so this
// bar never decides anything, it only shows the shrinking window cosmetically.
// A generation guard (timerGen) means an in-flight interval from a superseded
// clock no-ops, so a new round or a close can never let a stale timer keep
// painting.

import type { MountTrainingView, TrainingLean } from '../world_api';
import { esc } from './esc';
import { formatNumber, type TranslationKey, t } from './i18n';
import {
  mountTrainingRenderModel,
  mountTrainingRenderSig,
  mountTrainingTimerKey,
} from './mount_training_view';
import { svgIcon } from './ui_icons';

/** Callbacks + reads the window needs from the HUD. It never imports Hud or a
 * concrete world; the HUD wires these to IWorld + its own orchestration. */
export interface MountTrainingWindowDeps {
  /** The authoritative view (world.mountTrainingView()), or null when idle. */
  getState(): MountTrainingView | null;
  /** Player answered the current cue. */
  onAnswer(lean: TrainingLean): void;
  /** Player gave up (aborts the live lesson). */
  onAbort(): void;
}

const NUM0 = { maximumFractionDigits: 0 } as const;

export class MountTrainingWindow {
  private timerGen = 0;
  private timerInterval: number | null = null;
  private lastSig = '';
  private lastTimerKey = '';

  constructor(private readonly deps: MountTrainingWindowDeps) {}

  private panel(): HTMLElement | null {
    return document.getElementById('mount-training-panel');
  }

  /** First paint of a freshly opened lesson, plus its full-length cosmetic clock. */
  open(): void {
    this.lastTimerKey = '';
    this.render();
  }

  /** A new round landed (the authoritative round/misses/cue already reflect the
   * just-graded answer): repaint and let the cosmetic clock refill. */
  onRound(): void {
    this.render();
  }

  /** Per-frame safety net, mirroring lockpick's repaintIfChanged: realign the
   * DOM to authoritative state if anything moved without a discrete event
   * (keeps offline + online in lockstep). Cheap: repaints only on a sig change. */
  repaintIfChanged(): void {
    const el = this.panel();
    if (el?.style.display !== 'block') return;
    const view = this.deps.getState();
    if (!view) return;
    if (mountTrainingRenderSig(view) !== this.lastSig) this.render();
  }

  private render(): void {
    const el = this.panel();
    if (!el) return;
    const view = this.deps.getState();
    // hud.ts is the one that hides/closes the panel on session end; if the
    // authoritative session already vanished there is nothing left to paint.
    if (!view) return;
    this.lastSig = mountTrainingRenderSig(view);
    const m = mountTrainingRenderModel(view);
    if (!m.active || !m.cueSuffix || !m.round || !m.misses) return;
    const leanButtons = m.leanOptions
      .map(
        (o) =>
          `<button type="button" class="mt-lean-btn" data-lean="${o.lean}">` +
          `${esc(t(`hudChrome.mountTraining.${o.labelSuffix}` as TranslationKey))}</button>`,
      )
      .join('');
    const timerBlock =
      m.windowMs != null
        ? `<div class="mt-timer"><div class="mt-timer-track"><div class="mt-timer-bar" id="mt-timer-bar" style="width:100%"></div></div></div>`
        : '';
    const roundText = t('hudChrome.mountTraining.round', {
      n: formatNumber(m.round.n, NUM0),
      total: formatNumber(m.round.total, NUM0),
    });
    const missesText = t('hudChrome.mountTraining.misses', {
      n: formatNumber(m.misses.n, NUM0),
      cap: formatNumber(m.misses.cap, NUM0),
    });
    el.innerHTML =
      `<div class="panel-title"><span>${esc(t('hudChrome.mountTraining.title'))}</span>` +
      `<button type="button" class="x-btn" data-close aria-label="${esc(t('hudChrome.mountTraining.close'))}">${svgIcon('close')}</button></div>` +
      `<div class="mt-prompt">${esc(t('hudChrome.mountTraining.prompt'))}</div>` +
      `<div class="mt-status"><span class="mt-round">${esc(roundText)}</span>` +
      `<span class="mt-misses">${esc(missesText)}</span></div>` +
      timerBlock +
      `<div class="mt-cue" role="status" aria-live="polite">${esc(t(`hudChrome.mountTraining.${m.cueSuffix}` as TranslationKey))}</div>` +
      `<div class="mt-lean-row">${leanButtons}</div>` +
      `<button type="button" class="btn mt-giveup" data-abort>${esc(t('hudChrome.mountTraining.abort'))}</button>`;
    el.querySelectorAll('[data-lean]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.deps.onAnswer((btn as HTMLElement).dataset.lean as TrainingLean);
      });
    });
    el.querySelector('[data-abort]')?.addEventListener('click', () => this.deps.onAbort());
    el.querySelector('[data-close]')?.addEventListener('click', () => this.deps.onAbort());
    const key = mountTrainingTimerKey(view);
    if (key !== this.lastTimerKey) {
      this.lastTimerKey = key;
      this.startTimer(m.windowMs);
    }
  }

  // --- Countdown (generation-guarded, cosmetic only) -----------------------

  /** (Re)start the DISPLAY countdown from the authoritative per-round budget
   * (view.windowMs). Render-only: it never decides the outcome. The sim grades
   * the answer and reports it via mountTrainRound/mountTrainEnd, which
   * re-anchors (next round) or ends (this window) the lesson. When the bar
   * reaches 0 we just hold it there and wait for that authoritative event.
   * performance.now() is fine here (UI interpolation only, not gameplay logic).
   * A null budget means no clock. Any prior clock is invalidated by the
   * generation bump. */
  private startTimer(windowMs: number | null): void {
    this.stopTimer();
    if (windowMs == null) return;
    const seconds = windowMs / 1000;
    const gen = ++this.timerGen;
    const end = performance.now() + windowMs;
    this.paintTimer(1);
    this.timerInterval = window.setInterval(() => {
      if (gen !== this.timerGen) return; // superseded by a newer clock
      const remaining = Math.max(0, (end - performance.now()) / 1000);
      this.paintTimer(remaining / seconds);
      if (remaining <= 0) this.stopTimer(); // hold at 0; the sim sends the round result
    }, 100);
  }

  /** Stop the clock and invalidate any in-flight callback. */
  stopTimer(): void {
    this.timerGen++;
    if (this.timerInterval !== null) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private paintTimer(fraction: number): void {
    const bar = document.getElementById('mt-timer-bar') as HTMLElement | null;
    if (bar) bar.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
  }

  /** Tear down on panel close: stop the clock and forget the last paint. */
  close(): void {
    this.stopTimer();
    this.lastSig = '';
    this.lastTimerKey = '';
  }
}
