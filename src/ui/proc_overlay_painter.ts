// Thin painter for the spell-activation proc overlay (the curved proc arcs
// beside the character). The pure state rule lives in proc_overlay_view.ts;
// this routes EVERY per-frame write through the host's elided writers, so an
// unchanged state costs zero DOM work. The overlay element and its two arc
// children are built ONCE by the Hud (creation-time markup, not per-frame).

import type { PainterHostWriters } from './painter_host';
import type { ProcOverlayState } from './proc_overlay_view';

export class ProcOverlayPainter {
  constructor(
    private readonly writers: PainterHostWriters,
    private readonly root: HTMLElement, // #proc-overlay
  ) {}

  paint(state: ProcOverlayState): void {
    // Fire path: clear any Chronomancy theme/charge classes so a spec swap never
    // leaves the violet bird behind (all writes elided when unchanged).
    this.writers.toggleClass(this.root, 'chrono', false);
    this.writers.toggleClass(this.root, 'c1', false);
    this.writers.toggleClass(this.root, 'c2', false);
    this.writers.toggleClass(this.root, 'c3', false);
    this.writers.toggleClass(this.root, 'c4', false);
    this.writers.toggleClass(this.root, 'heating', state === 'heating');
    this.writers.toggleClass(this.root, 'hot', state === 'hot');
  }

  // Chronomancy variant: light one quarter of the arcane-violet bird per held
  // Aether Surge charge (n = 0..4); n === 4 whitens the core and beats the wings
  // like the fire streak; n === 0 (Aether Darts spent them) fades it out.
  paintChronoCharges(n: number): void {
    this.writers.toggleClass(this.root, 'heating', false);
    this.writers.toggleClass(this.root, 'hot', false);
    this.writers.toggleClass(this.root, 'chrono', true);
    this.writers.toggleClass(this.root, 'c1', n >= 1);
    this.writers.toggleClass(this.root, 'c2', n >= 2);
    this.writers.toggleClass(this.root, 'c3', n >= 3);
    this.writers.toggleClass(this.root, 'c4', n >= 4);
  }
}
