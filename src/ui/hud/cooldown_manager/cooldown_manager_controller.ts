// The Cooldown Manager's live half: it owns the floating groups' DOM, the
// per-character store, the pure view and the painter, plays the ready cues,
// feeds the action bar's additive glow channel, and projects itself into the
// Options > Cooldown Manager surface.
//
// Every RULE lives in the pure modules beside it (cooldown_manager_config for
// the stored shape, group layout and spell assignment; cooldown_manager_view for
// readiness and cue edges; both unit tested); this is the browser adapter that
// wires them to a document. The Hud builds it once and calls paint() each frame
// with the action bar's own reused world snapshot, so every button reads exactly
// what the hotbar reads.

import { AURA_CUE_NONE } from '../../../game/aura_cue_catalog';
import type { ResolvedAbility } from '../../../sim/sim';
import type { PlayerClass } from '../../../sim/types';
import { formatNumber } from '../../i18n';
import type { PainterHostWriters } from '../../painter_host';
import { actionBarIconBg } from '../action_bar/action_bar_icon_bg';
import type { ActionBarWorldInput } from '../action_bar/action_bar_view';
import {
  assignCooldownSpell,
  COOLDOWN_MAX_GROUPS,
  type CooldownGroup,
  type CooldownGroupKind,
  type CooldownGroupPatch,
  type CooldownManagerLayout,
  type CooldownManagerLayoutPatch,
  type CooldownSpellConfig,
  type CooldownSpellPatch,
  cooldownCell,
  cooldownGroupShown,
  moveCooldownSpell,
  newCooldownGroup,
  patchCooldownGroup,
} from './cooldown_manager_config';
import { type CooldownButtonElements, CooldownManagerPainter } from './cooldown_manager_painter';
import type { CooldownManagerHooks } from './cooldown_manager_settings';
import { CooldownManagerStore } from './cooldown_manager_store';
import { type CooldownManagerView, createCooldownManagerView } from './cooldown_manager_view';

/** The world slice the manager reads: a structural subset of IWorld. */
export interface CooldownManagerWorld {
  readonly cfg: { readonly playerClass: PlayerClass };
  readonly player: { readonly name: string; readonly inCombat: boolean };
  readonly known: readonly ResolvedAbility[];
  /** The entity roster (IWorld.entities). The manager takes its OWN iterator
   *  from it each frame; see paint(). */
  readonly entities: { values(): ActionBarWorldInput['entities'] };
  resolvedAbility(abilityId: string): ResolvedAbility | null;
}

export interface CooldownManagerControllerDeps {
  world: CooldownManagerWorld;
  writers: PainterHostWriters;
  /** Play one alert cue at this gain (the Hud's shared sfx engine). */
  playCue?(cueId: string, volume: number): void;
  doc?: Document;
  /** Injected for tests; defaults to localStorage. */
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  /** Whether the desktop action bar is the live bar (only it paints a glow). */
  hotbarGlowAvailable?: () => boolean;
  /** The Auras panel's hotbar glow set, unioned with this manager's. */
  auraGlowIds?: () => ReadonlySet<string>;
}

const NO_GLOW: ReadonlySet<string> = new Set();
/** Group fields that restyle a group without moving any button between cells. */
const APPEARANCE_KEYS: ReadonlySet<string> = new Set([
  'posX',
  'posY',
  'scale',
  'padding',
  'opacity',
  'visibility',
  'showTimer',
]);
const POSITION_STEP = 0.005;
const snap = (value: number): number =>
  Math.round(Math.min(1, Math.max(0, value)) / POSITION_STEP) * POSITION_STEP;

export class CooldownManagerController {
  private readonly layer: HTMLElement;
  private readonly store: CooldownManagerStore;
  private readonly view: CooldownManagerView;
  private readonly painter: CooldownManagerPainter;
  private groups: readonly CooldownGroup[];
  private layout: CooldownManagerLayout;
  private groupEls: HTMLElement[] = [];
  private readonly groupShown: boolean[] = [];
  private buttons: CooldownButtonElements[] = [];
  private placement = false;
  // The snapshot this manager's view ticks over: the Hud's action-bar snapshot,
  // field for field, except `entities`, which is a fresh iterator from the
  // roster. The Hud's snapshot carries ONE single-use Map iterator that the
  // desktop bar reads after this paint; walking it here (a tracked Dominion
  // summon does) would leave that bar blind to the player's servants.
  private world: ActionBarWorldInput | null = null;
  private readonly moveListeners = new Set<(group: CooldownGroup) => void>();
  // The action bar's additive glow channel: the spells this manager lights on
  // the hotbar this frame, unioned with the Auras panel's set without allocating.
  private readonly glowIds = new Set<string>();
  private readonly glowUnion = new Set<string>();

  constructor(private readonly deps: CooldownManagerControllerDeps) {
    const doc = deps.doc ?? document;
    const { world } = deps;
    this.store = new CooldownManagerStore(
      `${world.cfg.playerClass}:${world.player.name}`,
      deps.storage,
    );
    this.groups = this.store.getGroups();
    this.layout = this.store.getLayout();
    this.view = createCooldownManagerView({
      resolve: (id) => this.deps.world.resolvedAbility(id),
      formatCount: (n) => formatNumber(n, { maximumFractionDigits: 0 }),
    });
    this.painter = new CooldownManagerPainter(deps.writers, actionBarIconBg);
    this.layer = doc.createElement('div');
    this.layer.id = 'cooldown-manager';
    // Floating readouts, not controls: the buttons are never clickable and the
    // same information is on the action bar, so assistive tech skips the copy.
    this.layer.setAttribute('aria-hidden', 'true');
    doc.body.appendChild(this.layer);
    this.rebuild();
  }

  /** Per frame: derive, paint, sound, and refresh the hotbar glow set. */
  paint(world: ActionBarWorldInput): void {
    const { enabled, soundInCombatOnly } = this.layout;
    const inCombat = this.deps.world.player.inCombat;
    const soundsAllowed = enabled && (!soundInCombatOnly || inCombat);
    const own = this.world ?? { ...world };
    this.world = own;
    own.player = world.player;
    own.target = world.target;
    own.inventory = world.inventory;
    own.stealthed = world.stealthed;
    own.paladinSpec = world.paladinSpec;
    own.fateThreads = world.fateThreads;
    own.activeAimSlot = world.activeAimSlot;
    own.entities = this.deps.world.entities.values();
    const state = this.view.tick(own, { soundsAllowed, preview: this.placement });
    for (let g = 0; g < this.groups.length; g++) {
      this.groupShown[g] = cooldownGroupShown(this.groups[g].visibility, inCombat, this.placement);
    }
    this.painter.paint(
      this.layer,
      enabled || this.placement,
      this.groupEls,
      this.groupShown,
      this.buttons,
      state,
    );
    this.glowIds.clear();
    if (enabled) {
      for (const button of state.buttons) {
        if (!button.hotbarGlow || button.abilityId === null) continue;
        this.glowIds.add(button.abilityId);
        this.glowIds.add(button.baseId);
      }
    }
    const play = this.deps.playCue;
    if (play) for (const cue of state.cues) play(cue.soundId, cue.volume);
  }

  /**
   * The ability ids the action bar should light: this manager's ready spells
   * unioned with the Auras panel's set. Returns one input when the other is
   * empty and otherwise a reused set, so the per-frame call never allocates.
   */
  readyGlowAbilityIds(): ReadonlySet<string> {
    const other = this.deps.auraGlowIds?.() ?? NO_GLOW;
    if (this.glowIds.size === 0) return other;
    if (other.size === 0) return this.glowIds;
    this.glowUnion.clear();
    for (const id of other) this.glowUnion.add(id);
    for (const id of this.glowIds) this.glowUnion.add(id);
    return this.glowUnion;
  }

  /** The Options > Cooldown Manager surface over this controller. */
  settingsHooks(): CooldownManagerHooks {
    return {
      playerClass: () => this.deps.world.cfg.playerClass,
      spellbook: () => this.spellbook(),
      groups: () => this.groups,
      addGroup: (kind) => this.addGroup(kind),
      removeGroup: (id) => this.setGroups(this.groups.filter((group) => group.id !== id)),
      patchGroup: (id, patch) => this.patchGroup(id, patch),
      resetGroupPosition: (id) => {
        const group = this.groups.find((entry) => entry.id === id);
        if (!group) return;
        const defaults = newCooldownGroup(group.kind, []);
        this.patchGroup(id, { posX: defaults.posX, posY: defaults.posY });
      },
      assign: (spellId, groupId) => {
        const next = assignCooldownSpell(this.groups, spellId, groupId);
        if (next === this.groups) return false;
        this.setGroups(next);
        return true;
      },
      move: (spellId, delta) => this.setGroups(moveCooldownSpell(this.groups, spellId, delta)),
      getSpell: (id) => this.store.getSpell(id),
      patchSpell: (id, patch) => this.patchSpell(id, patch),
      getLayout: () => ({ ...this.layout }),
      patchLayout: (patch) => this.patchLayout(patch),
      previewCue: (cueId, volume) => this.deps.playCue?.(cueId, volume),
      hotbarGlowAvailable: () => this.deps.hotbarGlowAvailable?.() ?? true,
      setPlacement: (on) => this.setPlacement(on),
      onGroupMove: (listener) => {
        this.moveListeners.add(listener);
        return () => this.moveListeners.delete(listener);
      },
    };
  }

  /** Every castable spell the player knows, in spellbook order. Passive and
   *  hidden kit is left out: it has no button to watch. */
  private spellbook(): string[] {
    const out: string[] = [];
    for (const ability of this.deps.world.known) {
      const def = ability.def;
      if (def.passive || def.hiddenFromPlayer || out.includes(def.id)) continue;
      out.push(def.id);
    }
    return out;
  }

  private addGroup(kind: CooldownGroupKind): string | null {
    if (this.groups.length >= COOLDOWN_MAX_GROUPS) return null;
    const group = newCooldownGroup(kind, this.groups);
    this.setGroups([...this.groups, group]);
    return group.id;
  }

  private setGroups(next: readonly CooldownGroup[]): void {
    if (next === this.groups) return;
    this.groups = this.store.setGroups(next);
    this.rebuild();
  }

  /** `persist: false` restyles live state only (a drag in flight); the drag
   *  saves once when it ends instead of writing storage on every move. */
  private patchGroup(id: string, patch: CooldownGroupPatch, persist = true): void {
    const next = patchCooldownGroup(this.groups, id, patch);
    // Placement and look only (a slider drag): restyle this group in place.
    // Anything that moves a button between cells re-mints the groups.
    const inPlace = Object.keys(patch).every((key) => APPEARANCE_KEYS.has(key));
    if (!inPlace) {
      this.setGroups(next);
      return;
    }
    this.groups = persist ? this.store.setGroups(next) : next;
    const index = this.groups.findIndex((group) => group.id === id);
    if (index >= 0) this.applyGroup(this.groupEls[index], this.groups[index]);
  }

  private patchSpell(id: string, patch: CooldownSpellPatch): CooldownSpellConfig {
    const config = this.store.patchSpell(id, patch);
    this.rearm();
    return config;
  }

  private patchLayout(patch: CooldownManagerLayoutPatch): void {
    this.layout = this.store.patchLayout(patch);
    this.layer.style.setProperty('--cdm-idle-opacity', String(this.layout.idleOpacity));
  }

  /** Placement preview: the Options sub-view is open, so every group shows
   *  (hidden ones too), every known spell previews, and groups can be dragged. */
  private setPlacement(on: boolean): void {
    this.placement = on;
    this.layer.classList.toggle('placement', on);
  }

  /** Cold path: re-mint every group and button and re-arm the view. */
  private rebuild(): void {
    const doc = this.layer.ownerDocument;
    this.groupEls = [];
    this.buttons = [];
    this.groupShown.length = this.groups.length;
    for (const group of this.groups) {
      const root = doc.createElement('div');
      root.className = `cdm-group cdm-group--${group.kind}`;
      root.dataset.group = group.id;
      this.applyGroup(root, group);
      group.spells.forEach((_, index) => {
        const button = this.buildButton(doc);
        const cell = cooldownCell(group, index, group.spells.length);
        button.btn.style.gridColumn = String(cell.column);
        button.btn.style.gridRow = String(cell.row);
        root.appendChild(button.btn);
        this.buttons.push(button);
      });
      root.addEventListener('pointerdown', (event) => this.startDrag(event, group.id, root));
      this.groupEls.push(root);
    }
    this.layer.replaceChildren(...this.groupEls);
    this.layer.style.setProperty('--cdm-idle-opacity', String(this.layout.idleOpacity));
    this.painter.reset(this.buttons.length);
    this.rearm();
  }

  /** Hand the view the flattened spell list with each spell's current settings. */
  private rearm(): void {
    const spells = [];
    for (const group of this.groups) {
      for (const id of group.spells) {
        const config = this.store.getSpell(id);
        spells.push({ id, config, cue: config.soundId === AURA_CUE_NONE ? null : config.soundId });
      }
    }
    this.view.setTracked(spells);
  }

  private applyGroup(root: HTMLElement, group: CooldownGroup): void {
    root.style.setProperty('--cdm-x', `${Math.round(group.posX * 10_000) / 100}%`);
    root.style.setProperty('--cdm-y', `${Math.round(group.posY * 10_000) / 100}%`);
    root.style.setProperty('--cdm-scale', String(group.scale));
    root.style.setProperty('--cdm-gap', `${group.padding}px`);
    root.style.setProperty('--cdm-opacity', String(group.opacity));
    root.classList.toggle('hide-timer', !group.showTimer);
  }

  private buildButton(doc: Document): CooldownButtonElements {
    const btn = doc.createElement('div');
    btn.className = 'ui-socket cdm-btn';
    const art = doc.createElement('div');
    art.className = 'ui-socket-art';
    const cd = doc.createElement('div');
    cd.className = 'ui-socket-cd';
    const cdText = doc.createElement('span');
    cdText.className = 'ui-socket-cd-text';
    const count = doc.createElement('span');
    count.className = 'ui-socket-count';
    btn.append(art, cd, cdText, count);
    return { btn, art, cd, cdText, count };
  }

  private startDrag(event: PointerEvent, id: string, root: HTMLElement): void {
    if (!this.placement || event.button !== 0) return;
    const group = this.groups.find((entry) => entry.id === id);
    if (!group) return;
    event.preventDefault();
    root.setPointerCapture(event.pointerId);
    root.classList.add('dragging');
    // One viewport rect per drag (the layer is fixed to the app viewport), so a
    // pointer move converts to a normalized position with no further layout read.
    const bounds = this.layer.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    // Keep the grab point under the pointer: no jump to centre on the first move.
    const offsetX = (event.clientX - bounds.left) / bounds.width - group.posX;
    const offsetY = (event.clientY - bounds.top) / bounds.height - group.posY;
    const move = (next: PointerEvent): void => {
      this.patchGroup(
        id,
        {
          posX: snap((next.clientX - bounds.left) / bounds.width - offsetX),
          posY: snap((next.clientY - bounds.top) / bounds.height - offsetY),
        },
        false,
      );
      const moved = this.groups.find((entry) => entry.id === id);
      if (moved) for (const listener of this.moveListeners) listener(moved);
    };
    const end = (): void => {
      root.classList.remove('dragging');
      root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerup', end);
      root.removeEventListener('pointercancel', end);
      root.removeEventListener('lostpointercapture', end);
      this.groups = this.store.setGroups(this.groups);
    };
    root.addEventListener('pointermove', move);
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);
    root.addEventListener('lostpointercapture', end);
  }
}
