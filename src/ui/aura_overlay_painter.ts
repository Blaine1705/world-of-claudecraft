import type { Aura } from '../sim/types';
import type { WarriorProcDef } from './aura_overlay_view';
import type { PainterHostWriters } from './painter_host';

export interface AuraOverlayPaintTarget {
  def: WarriorProcDef;
  el: HTMLElement;
}

export class AuraOverlayPainter {
  constructor(
    private readonly writers: PainterHostWriters,
    private readonly targets: readonly AuraOverlayPaintTarget[],
  ) {}

  paint(auras: readonly Pick<Aura, 'id' | 'kind'>[]): void {
    for (const target of this.targets) {
      let active = false;
      for (const aura of auras) {
        if (
          aura.kind === target.def.auraKind &&
          (target.def.auraId === undefined || aura.id === target.def.auraId)
        ) {
          active = true;
          break;
        }
      }
      this.writers.toggleClass(target.el, 'active', active);
    }
  }
}
