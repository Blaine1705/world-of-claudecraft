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
    this.writers.toggleClass(this.root, 'heating', state === 'heating');
    this.writers.toggleClass(this.root, 'hot', state === 'hot');
  }
}
