// "Riding Lessons" mount-training bottom strip: the thin DOM consumer for
// Stablemaster Marla's timed show-jumping minigame (paints #mount-training-strip).
// Mirrors the vendor_window.ts split: this module owns paint; hud.ts owns the session
// routing, the transient toasts, and the strip's show/hide. It composes the pure view
// model in mount_training_view.ts and renders every player-visible string through the
// hudChrome.mountTraining.* t() keys.
//
// The strip is a slim, NON-INTERACTIVE readout anchored at the bottom of the screen
// (pointer-events none, no buttons): phase 'mount' reminds the player to summon the
// steed, 'staging' tells them to ride into the course to arm the timer, 'course'
// shows the jump progress and the countdown. Giving up is dismounting or leaving,
// which the sim ends on its own, so there is no button here.

import type { MountTrainingView } from '../world_api';
import { esc } from './esc';
import { formatNumber, t } from './i18n';
import { mountTrainingRenderModel, mountTrainingRenderSig } from './mount_training_view';

/** Reads the strip needs from the HUD. It never imports Hud or a concrete world; the
 *  HUD wires these to IWorld + its own keybind lookup. */
export interface MountTrainingStripDeps {
  /** The authoritative view (world.mountTrainingView()), or null when idle. */
  getState(): MountTrainingView | null;
  /** The player's CURRENT Mount/Dismount binding label (e.g. "Z"), for the phase
   *  'mount' reminder. Empty string when no binding is set. */
  mountKeyLabel(): string;
}

const NUM0 = { maximumFractionDigits: 0 } as const;

export class MountTrainingStrip {
  private lastSig = '';

  constructor(private readonly deps: MountTrainingStripDeps) {}

  private strip(): HTMLElement | null {
    return document.getElementById('mount-training-strip');
  }

  /** First paint of a freshly opened lesson. */
  show(): void {
    this.lastSig = '';
    this.render();
  }

  /** Per-frame safety net, mirroring lockpick's repaintIfChanged: realign the DOM to
   *  authoritative state if anything moved without a discrete event. Cheap: repaints
   *  only on a sig change (bucketed to whole seconds during the countdown). */
  repaintIfChanged(): void {
    const el = this.strip();
    if (!el || el.style.display === 'none') return;
    const view = this.deps.getState();
    if (!view) return;
    if (mountTrainingRenderSig(view) !== this.lastSig) this.render();
  }

  private render(): void {
    const el = this.strip();
    if (!el) return;
    const view = this.deps.getState();
    // hud.ts hides the strip on session end; if the authoritative session already
    // vanished there is nothing left to paint.
    if (!view) return;
    this.lastSig = mountTrainingRenderSig(view);
    const m = mountTrainingRenderModel(view);
    if (!m.active || !m.phase) return;

    let html: string;
    if (m.phase === 'mount') {
      // The live Mount/Dismount binding label (a physical keycap name, shown verbatim
      // like the action-bar keycaps, never localized); 'Z' is the default binding.
      const key = this.deps.mountKeyLabel() || 'Z';
      html = `<span class="mt-line">${esc(t('hudChrome.mountTraining.mountPrompt', { key }))}</span>`;
    } else if (m.phase === 'staging') {
      html = `<span class="mt-line">${esc(t('hudChrome.mountTraining.stagingPrompt'))}</span>`;
    } else {
      const parts: string[] = [];
      if (m.progress) {
        const progressText = t('hudChrome.mountTraining.progress', {
          n: formatNumber(m.progress.n, NUM0),
          total: formatNumber(m.progress.total, NUM0),
        });
        parts.push(`<span class="mt-progress">${esc(progressText)}</span>`);
      }
      if (m.secondsLeft != null) {
        const pct = Math.round((m.timeFraction ?? 0) * 100);
        const secText = t('hudChrome.mountTraining.timeLeft', {
          seconds: formatNumber(m.secondsLeft, NUM0),
        });
        parts.push(
          `<span class="mt-timer"><span class="mt-timer-bar" style="width:${pct}%"></span></span>` +
            `<span class="mt-secs">${esc(secText)}</span>`,
        );
      }
      html = parts.join('');
    }
    el.innerHTML = html;
  }

  /** Tear down on strip hide: forget the last paint. */
  hide(): void {
    this.lastSig = '';
  }
}
