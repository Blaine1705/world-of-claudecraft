// DOM adapter for the cross-hotbar overlay: mints the two halves, their four
// diamonds and sixteen cells inside the static #cross-hotbar root, holds the
// current overlay state, and drives the painter each frame. Cold by contract: no
// layout reads, no driver of its own (the HUD's frame loop calls paint).
//
// The cells are focusable and therefore NOT inside an aria-hidden root: focusable
// content hidden from assistive tech is a violation, and the pad has to be able to
// select a cell. Each cell carries the shared action-bar painter's own aria-label,
// so what is announced is the ability on it.

import { CROSS_HOTBAR_ATTACK_ID } from '../../../game/cross_hotbar';
import { resolveActionReplacement } from '../../../sim/combat/action_replacement';
import { resolveColdsightAbilityForSpec } from '../../../sim/combat/hunter_coldsight';
import { resolveHunterSharedAbilityForTalents } from '../../../sim/combat/hunter_shared';
import type { TalentAllocation } from '../../../sim/content/talents';
import type { ResolvedAbility } from '../../../sim/sim';
import type { AbilityDef, Entity, ItemDef, PlayerClass } from '../../../sim/types';
import { formatNumber, t } from '../../i18n';
import type { PainterHostWriters } from '../../painter_host';
import type { ActionBarSlotElements } from '../action_bar/action_bar_painter';
import type {
  ActionBarAbility,
  ActionBarView,
  ActionBarWorldInput,
} from '../action_bar/action_bar_view';
import { createActionBarView } from '../action_bar/action_bar_view';
import { CrossHotbarPainter } from './cross_hotbar_painter';
import {
  CROSS_HOTBAR_CELLS,
  type CrossHotbarCell,
  type CrossHotbarHold,
  type CrossHotbarOverlayState,
  crossHotbarOverlayState,
  HIDDEN_CROSS_HOTBAR,
} from './cross_hotbar_view';

const ROOT_ID = 'cross-hotbar';
const HALF_CLASS = 'xhb-half';
const CLUSTER_CLASS = 'xhb-diamond';
const CELL_CLASS = 'xhb-slot';
const CELL_POSITION_ATTR = 'data-xhb-point';
const CELL_INDEX_ATTR = 'data-xhb-index';
const HALF_LAYER_ATTR = 'data-xhb-half';
const GLYPH_CLASS = 'xhb-glyph';
const EDIT_CLASS = 'xhb-editing';
const CARRIED_CLASS = 'xhb-carried';
// Marks the spellbook row whose action is in hand. The bar shows a gap for an
// action lifted off a CELL; one picked out of the book leaves no gap, so without
// this a pick-up from the spellbook had no visible effect at all.
const SPELL_CARRIED_CLASS = 'spell-carried';

function markCarriedSpellbookRow(abilityId: string | null): void {
  for (const el of document.querySelectorAll<HTMLElement>(`.${SPELL_CARRIED_CLASS}`)) {
    el.classList.remove(SPELL_CARRIED_CLASS);
  }
  if (!abilityId) return;
  const row = document.querySelector<HTMLElement>(`.spell-row[data-ability-id="${abilityId}"]`);
  row?.classList.add(SPELL_CARRIED_CLASS);
}
// Painted at nothing while hidden: the painter returns after its display write.
const EMPTY_BAR_STATE = { slots: [], manySpells: false };
const TRIGGER_CLASS = 'xhb-trigger';
const HINT_CLASS = 'xhb-hint';

/** Mint one cell's inner spans, matching the action bar's element contract so the
 *  shared ActionBarPainter can write it unchanged. */
function buildCell(cell: CrossHotbarCell): ActionBarSlotElements {
  const btn = document.createElement('div');
  btn.className = `action-btn ${CELL_CLASS}`;
  btn.setAttribute(CELL_POSITION_ATTR, cell.point);
  btn.setAttribute(CELL_INDEX_ATTR, String(cell.index));
  // Focusable so the d-pad's UI navigation can actually reach the bar: without a
  // tabindex the cells are invisible to the focus query and a player could look
  // at the cross hotbar but never select a cell on it.
  btn.setAttribute('tabindex', '0');
  const label = document.createElement('span');
  label.className = 'icon-label';
  const countEl = document.createElement('span');
  countEl.className = 'item-count';
  const keybindEl = document.createElement('span');
  keybindEl.className = 'keybind';
  const cdOverlay = document.createElement('div');
  cdOverlay.className = 'cd-overlay';
  const cdText = document.createElement('div');
  cdText.className = 'cdtext';
  const rechargeOverlay = document.createElement('div');
  rechargeOverlay.className = 'recharge-overlay';
  btn.append(label, countEl, keybindEl, cdOverlay, rechargeOverlay, cdText);
  return { btn, label, countEl, keybindEl, cdOverlay, cdText, rechargeOverlay };
}

/** How the overlay turns a cell's action id into something paintable. The bar owns
 *  its actions now, so it cannot read cells out of the desktop bar's state array
 *  and has to resolve them itself. */
export interface CrossHotbarResolvers {
  abilityById(id: string): ActionBarAbility | null;
  itemById(id: string): ItemDef | null;
  abilityName(def: AbilityDef): string;
  itemName(item: ItemDef): string;
}

/** The resolver bag, built from the world the HUD already holds. Lives here rather
 *  than inline at the call site so src/ui/hud.ts carries a call, not a shape. */
export function crossHotbarResolvers(
  sim: {
    known: readonly ResolvedAbility[];
    player: Entity;
    talents: TalentAllocation;
    cfg: { playerClass: PlayerClass };
  },
  items: Record<string, ItemDef>,
  abilityName: (def: AbilityDef) => string,
  itemName: (item: ItemDef) => string,
): CrossHotbarResolvers {
  return {
    // Same resolution the action bar performs on its own slots: a saved binding
    // keeps the BASE ability id while the painted cell follows aura and talent
    // state, so a transformed ability shows what would actually be cast.
    abilityById: (id) => {
      const known = sim.known.find((k) => k.def.id === id) ?? null;
      if (!known) return null;
      const resolved = resolveActionReplacement(known, sim.player);
      if (sim.cfg.playerClass !== 'hunter') return resolved;
      const coldsight = resolveColdsightAbilityForSpec(resolved, sim.player, sim.talents.spec);
      return resolveHunterSharedAbilityForTalents(coldsight, sim.player, sim.talents);
    },
    itemById: (id) => items[id] ?? null,
    abilityName,
    itemName,
  };
}

export class CrossHotbarController {
  private readonly painter: CrossHotbarPainter;
  private readonly view: ActionBarView;
  private readonly glyphs: HTMLElement[] = [];
  private readonly cellEls: HTMLElement[] = [];
  private readonly root: HTMLElement;
  private readonly triggerLabels = new Map<string, HTMLElement>();
  private readonly hint: HTMLElement;
  private state: CrossHotbarOverlayState = HIDDEN_CROSS_HOTBAR;
  // The hint the bar shows when it is not being arranged, kept so leaving edit
  // mode puts it back without waiting for the next hold to repaint it.
  private restingHint = '';
  private editing = false;

  private constructor(
    root: HTMLElement,
    writers: PainterHostWriters,
    iconBg: (k: string) => string,
    private readonly resolve: CrossHotbarResolvers,
  ) {
    this.root = root;
    const cells: ActionBarSlotElements[] = [];
    const halfEls = new Map<string, HTMLElement>();
    for (const cell of CROSS_HOTBAR_CELLS) {
      let half = halfEls.get(cell.layer);
      if (!half) {
        half = document.createElement('div');
        half.className = `${HALF_CLASS} ${HALF_CLASS}-${cell.layer}`;
        half.setAttribute(HALF_LAYER_ATTR, cell.layer);
        const trigger = document.createElement('span');
        trigger.className = `${TRIGGER_CLASS} ${TRIGGER_CLASS}-${cell.layer}`;
        half.appendChild(trigger);
        this.triggerLabels.set(cell.layer, trigger);
        halfEls.set(cell.layer, half);
        root.appendChild(half);
      }
      const clusterKey = `${cell.layer}:${cell.cluster}`;
      let cluster = halfEls.get(clusterKey);
      if (!cluster) {
        cluster = document.createElement('div');
        cluster.className = `${CLUSTER_CLASS} ${CLUSTER_CLASS}-${cell.cluster}`;
        halfEls.set(clusterKey, cluster);
        half.appendChild(cluster);
      }
      const els = buildCell(cell);
      const glyph = document.createElement('span');
      glyph.className = GLYPH_CLASS;
      els.btn.appendChild(glyph);
      // The d-pad four share ONE glyph and differ only by rotation, which is the
      // only way all four come out the same size (no font draws its four arrows
      // alike). The face four keep their letters, which need no turning.
      if (cell.cluster === 'dpad') glyph.classList.add(`${GLYPH_CLASS}-${cell.point}`);
      this.glyphs[cell.index] = glyph;
      this.cellEls[cell.index] = els.btn;
      cluster.appendChild(els.btn);
      cells[cell.index] = els;
    }
    this.hint = document.createElement('div');
    this.hint.className = HINT_CLASS;
    root.appendChild(this.hint);
    // The overlay's OWN view: sixteen slots resolved from this bar's actions, not
    // from the desktop bar. That is what lets a pad layout hold something the
    // action bar does not (a warrior's stance) and be arranged independently.
    this.view = createActionBarView(
      {
        slots: CROSS_HOTBAR_CELLS.map((cell) => ({
          slotIndex: cell.index,
          // Reuses the shared bar's whole attack branch (its icon, the auto-attack
          // queued glow, the melee range check) rather than a second render path.
          isAttack: () => this.state.cellActions[cell.index]?.id === CROSS_HOTBAR_ATTACK_ID,
          hasAction: () => this.state.cellActions[cell.index] !== null,
          ability: () => {
            const a = this.state.cellActions[cell.index];
            return a?.type === 'ability' ? resolve.abilityById(a.id) : null;
          },
          item: () => {
            const a = this.state.cellActions[cell.index];
            return a?.type === 'item' ? resolve.itemById(a.id) : null;
          },
          keybindLabel: () => '',
        })),
      },
      {
        t,
        abilityName: (def) => resolve.abilityName(def),
        itemName: (item) => resolve.itemName(item),
        slotLabel: (i) => formatNumber(i + 1, { maximumFractionDigits: 0 }),
        formatCount: (n) => formatNumber(n, { maximumFractionDigits: 0 }),
      },
    );
    this.painter = new CrossHotbarPainter(
      writers,
      {
        root,
        leftHalf: halfEls.get('left') ?? root,
        rightHalf: halfEls.get('right') ?? root,
        bar: { container: root, slots: cells },
      },
      iconBg,
    );
  }

  /** Build the overlay, or answer undefined on a document without the root (the
   *  same defensive shape the mobile action ring uses for an older template). */
  static create(
    writers: PainterHostWriters,
    iconBg: (iconKey: string) => string,
    resolve: CrossHotbarResolvers,
  ): CrossHotbarController | undefined {
    const root = document.getElementById(ROOT_ID);
    return root ? new CrossHotbarController(root, writers, iconBg, resolve) : undefined;
  }

  /** Show the bar (arming at most one half), or hide it with null. The glyphs are
   *  written here rather than per frame (they only move when the pad's brand does)
   *  and into their OWN element, because the shared ActionBarPainter owns
   *  `.keybind` and would overwrite a glyph parked there with the keyboard keycap. */
  setHold(hold: CrossHotbarHold | null): void {
    this.state = crossHotbarOverlayState(hold);
    if (!hold) return;
    const labels = hold.buttons;
    for (let i = 0; i < this.glyphs.length; i++) {
      const next = labels[i] ?? '';
      if (this.glyphs[i].textContent !== next) this.glyphs[i].textContent = next;
    }
    const bothTriggers = `${hold.triggers.left} + ${hold.triggers.right}`;
    for (const [layer, el] of this.triggerLabels) {
      // In the expanded bank the reachable half is opened by BOTH triggers, so it
      // says so: labelling it with one trigger made the bank read as that
      // trigger's ordinary page rather than the extra one.
      const next =
        hold.expanded && layer === hold.layer
          ? bothTriggers
          : layer === 'left'
            ? hold.triggers.left
            : hold.triggers.right;
      if (el.textContent !== next) el.textContent = next;
    }
    // Advertises the route to the expanded bank: hold one trigger, tap the other.
    // The resting bar carries the way INTO arrange mode; a chord nothing names is
    // a chord nobody finds. Once a trigger is held the expanded route matters more,
    // so the arrange line gives way to it.
    this.restingHint =
      hold.layer === null
        ? t('hudChrome.controller.crossHotbarArrangeChord', {
            bumper: hold.arrange.bumper,
            button: hold.arrange.button,
          })
        : bothTriggers;
    if (!this.editing && this.hint.textContent !== this.restingHint) {
      this.hint.textContent = this.restingHint;
    }
  }

  /** The player-facing name of a carried action, for the carrying line. */
  private actionName(id: string): string {
    const ability = this.resolve.abilityById(id);
    return ability ? this.resolve.abilityName(ability.def) : id;
  }

  /** Which cell the pad has focused, or null when focus is elsewhere. Read off the
   *  cell's own index attribute so the DOM stays the single source of truth for
   *  what is selected. */
  focusedCell(): number | null {
    const active = document.activeElement as HTMLElement | null;
    const raw = active?.getAttribute?.(CELL_INDEX_ATTR);
    if (raw === null || raw === undefined) return null;
    const index = Number(raw);
    return Number.isInteger(index) ? index : null;
  }

  /** Pin the bar open for arranging and mark the cell being carried, so the player
   *  can see what they picked up and that the bar is now editable. */
  setEditing(active: boolean, carriedFrom: number | null, carried: string | null = null): void {
    this.editing = active;
    this.root.classList.toggle(EDIT_CLASS, active);
    // Carrying is the state with no other tell when the action came from the
    // spellbook: it left no gap on the bar, so the line has to say what is in hand.
    const hint = !active
      ? this.restingHint
      : carried
        ? t('hudChrome.controller.crossHotbarCarrying', { action: this.actionName(carried) })
        : t('hudChrome.controller.crossHotbarEditHint');
    if (this.hint.textContent !== hint) this.hint.textContent = hint;
    markCarriedSpellbookRow(carried);
    for (let i = 0; i < this.cellEls.length; i++) {
      this.cellEls[i].classList.toggle(CARRIED_CLASS, active && i === carriedFrom);
    }
  }

  /** Tick this bar's own slot states from the frame's world snapshot, then paint.
   *  Skipped entirely while hidden, so a player with no pad pays nothing for it. */
  paint(world: ActionBarWorldInput): void {
    if (!this.state.visible) {
      this.painter.paint(this.state, EMPTY_BAR_STATE);
      return;
    }
    this.painter.paint(this.state, this.view.tick(world));
  }
}
