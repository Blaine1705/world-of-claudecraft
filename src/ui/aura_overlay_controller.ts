import type { ResolvedAbility } from '../sim/sim';
import type { Aura, PlayerClass } from '../sim/types';
import {
  type AuraOverlayConfig,
  AuraOverlayConfigStore,
  type AuraOverlayPatch,
} from './aura_overlay_config';
import { AuraOverlayPainter, type AuraOverlayPaintTarget } from './aura_overlay_painter';
import {
  availableWarriorProcDefs,
  type WarriorProcDef,
  type WarriorProcId,
} from './aura_overlay_view';
import type { PainterHostWriters } from './painter_host';

const clampPosition = (value: number): number =>
  Math.round(Math.min(1, Math.max(0, value)) * 10_000) / 10_000;
const POSITION_NUDGE = 0.01;
const snapPosition = (value: number): number =>
  clampPosition(Math.round(value / POSITION_NUDGE) * POSITION_NUDGE);

export type AuraOverlayPart = 'icon' | 'arcs';

export interface AuraOverlayControllerDeps {
  doc?: Document;
  writers: PainterHostWriters;
  playerClass: PlayerClass;
  playerName: string;
  known(): readonly ResolvedAbility[];
  iconUrl(abilityId: string): string;
}

export class AuraOverlayController {
  private readonly root: HTMLElement;
  private readonly store: AuraOverlayConfigStore;
  private readonly targets: AuraOverlayPaintTarget[] = [];
  private readonly targetById = new Map<WarriorProcId, AuraOverlayPaintTarget>();
  private readonly painter: AuraOverlayPainter;
  private knownIds: string[] = [];
  private currentDefs: readonly WarriorProcDef[] = [];
  private readonly positionListeners = new Set<
    (id: WarriorProcId, config: AuraOverlayConfig) => void
  >();
  private readonly placementListeners = new Set<
    (id: WarriorProcId, part: AuraOverlayPart) => void
  >();
  private placement: { id: WarriorProcId; part: AuraOverlayPart } | null = null;

  constructor(private readonly deps: AuraOverlayControllerDeps) {
    const doc = deps.doc ?? document;
    this.store = new AuraOverlayConfigStore(`${deps.playerClass}:${deps.playerName}`);
    this.root = doc.createElement('div');
    this.root.id = 'aura-overlays';
    this.root.setAttribute('aria-hidden', 'true');
    this.painter = new AuraOverlayPainter(deps.writers, this.targets);
    this.syncLoadout();
    doc.body.appendChild(this.root);
  }

  private syncLoadout(): void {
    const known = this.deps.known();
    let changed = known.length !== this.knownIds.length;
    if (!changed) {
      for (let i = 0; i < known.length; i++) {
        if (known[i].def.id !== this.knownIds[i]) {
          changed = true;
          break;
        }
      }
    }
    if (!changed) return;
    this.knownIds = known.map((ability) => ability.def.id);
    this.currentDefs = availableWarriorProcDefs(this.deps.playerClass, known);
    const activeIds = new Set(this.currentDefs.map((def) => def.id));
    for (const target of this.targets) {
      target.el.classList.toggle('loadout-hidden', !activeIds.has(target.def.id));
    }
    for (const def of this.currentDefs) {
      let target = this.targetById.get(def.id);
      if (!target) {
        const el = this.buildFrame(this.root.ownerDocument, def);
        target = { def, el };
        this.targetById.set(def.id, target);
        this.targets.push(target);
        this.root.appendChild(el);
      }
      target.el.classList.remove('loadout-hidden');
    }
  }

  private buildFrame(doc: Document, def: WarriorProcDef): HTMLElement {
    const el = doc.createElement('div');
    el.className = `aura-overlay-frame aura-overlay-${def.theme}`;
    el.dataset.proc = def.id;
    const left = doc.createElement('span');
    left.className = 'aura-overlay-arc aura-overlay-arc-left';
    const arcs = doc.createElement('div');
    arcs.className = 'aura-overlay-arcs-shell';
    arcs.appendChild(left);
    const icon = doc.createElement('img');
    icon.className = 'aura-overlay-icon';
    icon.src = this.deps.iconUrl(def.iconAbilityId);
    icon.alt = '';
    icon.draggable = false;
    const right = doc.createElement('span');
    right.className = 'aura-overlay-arc aura-overlay-arc-right';
    arcs.appendChild(right);
    const moveHandle = this.buildMoveHandle(doc, def.id);
    el.append(arcs, icon, moveHandle);
    arcs.addEventListener('pointerdown', (event) => this.startDrag(event, def.id, 'arcs', arcs));
    icon.addEventListener('pointerdown', (event) => this.startDrag(event, def.id, 'icon', icon));
    moveHandle.addEventListener('pointerdown', (event) => {
      if (this.placement?.id !== def.id) return;
      this.startDrag(event, def.id, this.placement.part, moveHandle);
    });
    this.apply(def.id, el, this.store.get(def.id));
    return el;
  }

  private buildMoveHandle(doc: Document, id: WarriorProcId): HTMLElement {
    const handle = doc.createElement('span');
    handle.className = 'aura-overlay-move-handle';
    handle.setAttribute('aria-hidden', 'true');
    handle.dataset.proc = id;
    return handle;
  }

  private startDrag(
    event: PointerEvent,
    id: WarriorProcId,
    part: AuraOverlayPart,
    el: HTMLElement,
  ): void {
    if (!this.placement || event.button !== 0) return;
    if (this.placement.id !== id || this.placement.part !== part) {
      this.placement = { id, part };
      this.refreshPlacement();
      this.emitPlacement(id, part);
    }
    event.preventDefault();
    el.setPointerCapture(event.pointerId);
    el.classList.add('dragging');
    const bounds = this.root.getBoundingClientRect();
    const move = (next: PointerEvent): void => {
      const posX = snapPosition((next.clientX - bounds.left) / bounds.width);
      const posY = snapPosition((next.clientY - bounds.top) / bounds.height);
      const patch =
        part === 'icon' ? { iconPosX: posX, iconPosY: posY } : { arcsPosX: posX, arcsPosY: posY };
      const cfg = this.store.patch(id, patch);
      const frame = this.targetById.get(id)?.el;
      if (frame) this.apply(id, frame, cfg);
      this.emitPosition(id, cfg);
    };
    const end = (): void => {
      el.classList.remove('dragging');
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', end);
      el.removeEventListener('pointercancel', end);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  private apply(id: WarriorProcId, el: HTMLElement, cfg: AuraOverlayConfig): void {
    el.classList.toggle('disabled', !cfg.enabled);
    el.classList.toggle('hide-icon', !cfg.showIcon);
    el.classList.toggle('hide-arcs', !cfg.showArcs);
    el.style.setProperty('--aura-icon-x', `${Math.round(cfg.iconPosX * 10_000) / 100}%`);
    el.style.setProperty('--aura-icon-y', `${Math.round(cfg.iconPosY * 10_000) / 100}%`);
    el.style.setProperty('--aura-arcs-x', `${Math.round(cfg.arcsPosX * 10_000) / 100}%`);
    el.style.setProperty('--aura-arcs-y', `${Math.round(cfg.arcsPosY * 10_000) / 100}%`);
    el.style.setProperty('--aura-opacity', String(cfg.opacity));
    el.style.setProperty('--aura-icon-scale', String(cfg.scale));
    el.style.setProperty('--aura-arcs-scale', String(cfg.arcsScale));
    el.style.setProperty('--aura-color', cfg.color);
    el.style.setProperty('--aura-half-width', `${150 * cfg.arcsScale + 12}px`);
    el.style.setProperty('--aura-half-height', `${110 * cfg.arcsScale + 12}px`);
    el.style.setProperty('--aura-icon-half', `${31 * cfg.scale + 4}px`);
    el.dataset.proc = id;
  }

  get(id: WarriorProcId): AuraOverlayConfig {
    return this.store.get(id);
  }

  patch(id: WarriorProcId, patch: AuraOverlayPatch): void {
    const target = this.targets.find((item) => item.def.id === id);
    if (target) {
      const cfg = this.store.patch(id, patch);
      this.apply(id, target.el, cfg);
      if (
        patch.iconPosX !== undefined ||
        patch.iconPosY !== undefined ||
        patch.arcsPosX !== undefined ||
        patch.arcsPosY !== undefined
      ) {
        this.emitPosition(id, cfg);
      }
    }
  }

  setAll(enabled: boolean): void {
    this.syncLoadout();
    for (const def of this.currentDefs) {
      const target = this.targetById.get(def.id);
      if (!target) continue;
      const cfg = this.store.patch(def.id, { enabled });
      this.apply(def.id, target.el, cfg);
    }
  }

  reset(id: WarriorProcId): void {
    const target = this.targets.find((item) => item.def.id === id);
    if (target) {
      const cfg = this.store.resetPosition(id);
      this.apply(id, target.el, cfg);
      this.emitPosition(id, cfg);
    }
  }

  nudge(id: WarriorProcId, part: AuraOverlayPart, deltaX: number, deltaY: number): void {
    const target = this.targetById.get(id);
    if (!target) return;
    const cfg = this.store.get(id);
    const next = this.store.patch(
      id,
      part === 'icon'
        ? {
            iconPosX: snapPosition(cfg.iconPosX + deltaX * POSITION_NUDGE),
            iconPosY: snapPosition(cfg.iconPosY + deltaY * POSITION_NUDGE),
          }
        : {
            arcsPosX: snapPosition(cfg.arcsPosX + deltaX * POSITION_NUDGE),
            arcsPosY: snapPosition(cfg.arcsPosY + deltaY * POSITION_NUDGE),
          },
    );
    this.apply(id, target.el, next);
    this.emitPosition(id, next);
  }

  setPlacement(on: boolean): void {
    if (!on) this.endPlacement();
  }

  beginPlacement(id: WarriorProcId, part: AuraOverlayPart): void {
    this.syncLoadout();
    if (!this.targetById.has(id)) return;
    this.placement = { id, part };
    this.refreshPlacement();
    this.emitPlacement(id, part);
  }

  endPlacement(): void {
    this.placement = null;
    this.refreshPlacement();
  }

  private refreshPlacement(): void {
    this.root.classList.toggle('placement', this.placement !== null);
    for (const target of this.targets) {
      const selected = target.def.id === this.placement?.id;
      const preview = this.placement !== null && !target.el.classList.contains('loadout-hidden');
      target.el.classList.toggle('placement-preview', preview);
      target.el.classList.toggle('placement-target', selected);
      target.el.classList.toggle('placement-icon', selected && this.placement?.part === 'icon');
      target.el.classList.toggle('placement-arcs', selected && this.placement?.part === 'arcs');
    }
  }

  paint(auras: readonly Aura[]): void {
    this.syncLoadout();
    this.painter.paint(auras);
  }

  defs(): readonly WarriorProcDef[] {
    this.syncLoadout();
    return this.currentDefs;
  }

  onPositionChange(listener: (id: WarriorProcId, config: AuraOverlayConfig) => void): () => void {
    this.positionListeners.add(listener);
    return () => this.positionListeners.delete(listener);
  }

  onPlacementChange(listener: (id: WarriorProcId, part: AuraOverlayPart) => void): () => void {
    this.placementListeners.add(listener);
    return () => this.placementListeners.delete(listener);
  }

  private emitPosition(id: WarriorProcId, cfg: AuraOverlayConfig): void {
    for (const listener of this.positionListeners) listener(id, cfg);
  }

  private emitPlacement(id: WarriorProcId, part: AuraOverlayPart): void {
    for (const listener of this.placementListeners) listener(id, part);
  }
}
