// "Riding Lessons" mount-training window: the thin DOM consumer for Stablemaster
// Marla's story riding-lesson minigame (paints #mount-training-panel). Mirrors the
// vendor_window.ts split: this module owns paint; hud.ts owns open/close
// orchestration, focus, and the SimEvent handlers. It composes the pure view model
// in mount_training_view.ts and renders every player-visible string through the
// hudChrome.mountTraining.* t() keys.
//
// The lesson is a ridden course, not a reaction game: phase 'mount' instructs the
// player to summon the training steed with their Mount/Dismount keybind (a tutorial
// for the Z key), phase 'ride' shows the flagged-course progress. There is no
// countdown; the sim is authoritative on gate clears and reports them via the
// mountTrainGate/mountTrainEnd events.

import type { MountTrainingView } from '../world_api';
import { esc } from './esc';
import { formatNumber, t } from './i18n';
import { mountTrainingRenderModel, mountTrainingRenderSig } from './mount_training_view';
import { svgIcon } from './ui_icons';

/** Callbacks + reads the window needs from the HUD. It never imports Hud or a
 *  concrete world; the HUD wires these to IWorld + its own orchestration. */
export interface MountTrainingWindowDeps {
  /** The authoritative view (world.mountTrainingView()), or null when idle. */
  getState(): MountTrainingView | null;
  /** Player gave up (aborts the live lesson). */
  onAbort(): void;
  /** The player's CURRENT Mount/Dismount binding label (e.g. "Z"), for the phase
   *  'mount' instruction. Empty string when no binding is set. */
  mountKeyLabel(): string;
}

const NUM0 = { maximumFractionDigits: 0 } as const;

export class MountTrainingWindow {
  private lastSig = '';

  constructor(private readonly deps: MountTrainingWindowDeps) {}

  private panel(): HTMLElement | null {
    return document.getElementById('mount-training-panel');
  }

  /** First paint of a freshly opened lesson. */
  open(): void {
    this.lastSig = '';
    this.render();
  }

  /** A gate was cleared or the phase flipped: repaint from authoritative state. */
  onGate(): void {
    this.render();
  }

  /** Per-frame safety net, mirroring lockpick's repaintIfChanged: realign the DOM to
   *  authoritative state if anything moved without a discrete event (keeps offline +
   *  online in lockstep). Cheap: repaints only on a sig change. */
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
    // hud.ts hides/closes the panel on session end; if the authoritative session
    // already vanished there is nothing left to paint.
    if (!view) return;
    this.lastSig = mountTrainingRenderSig(view);
    const m = mountTrainingRenderModel(view);
    if (!m.active || !m.phase) return;

    let instruction: string;
    let statusBlock = '';
    if (m.phase === 'mount') {
      // The live Mount/Dismount binding label (a physical keycap name, shown verbatim
      // like the action-bar keycaps, never localized); 'Z' is the default binding.
      const key = this.deps.mountKeyLabel() || 'Z';
      instruction = t('hudChrome.mountTraining.mountPrompt', { key });
    } else {
      instruction = t('hudChrome.mountTraining.ridePrompt');
      if (m.progress) {
        const progressText = t('hudChrome.mountTraining.progress', {
          n: formatNumber(m.progress.n, NUM0),
          total: formatNumber(m.progress.total, NUM0),
        });
        statusBlock = `<div class="mt-status"><span class="mt-progress">${esc(progressText)}</span></div>`;
      }
    }

    el.innerHTML =
      `<div class="panel-title"><span>${esc(t('hudChrome.mountTraining.title'))}</span>` +
      `<button type="button" class="x-btn" data-close aria-label="${esc(t('hudChrome.mountTraining.close'))}">${svgIcon('close')}</button></div>` +
      `<div class="mt-prompt" role="status" aria-live="polite">${esc(instruction)}</div>` +
      statusBlock +
      `<button type="button" class="btn mt-giveup" data-abort>${esc(t('hudChrome.mountTraining.abort'))}</button>`;
    el.querySelector('[data-abort]')?.addEventListener('click', () => this.deps.onAbort());
    el.querySelector('[data-close]')?.addEventListener('click', () => this.deps.onAbort());
  }

  /** Tear down on panel close: forget the last paint. */
  close(): void {
    this.lastSig = '';
  }
}
