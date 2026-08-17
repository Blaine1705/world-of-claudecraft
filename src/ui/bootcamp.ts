// The Proving Shore coach overlay: the island sibling of the Eastbrook
// new-adventurer coachmark (tutorial.ts), sharing its card CSS family, and
// the ONE top-of-screen helper for the whole island tutorial. Every card is
// a numbered step of a single sequence (islandStepInfo): the Gauntlet's
// lesson ladder (talk to Tam, forward, turn-and-walk, strafe, the camera
// swing, hand in), then three coach cards per later rail quest (walk to the
// giver, do the task, return to the turn-in; quests with their own mechanics
// carry bespoke lesson bodies: targeting and the swing for Strike True, the
// pickup press for the Wreck Line, the buckle-on for the pouch), and the
// closing card that points at the ferry bell once Ferryman Odo has taken the
// last hand-in. There is deliberately NO skip button: the card is compact,
// stays out of the way at the top, and folds itself when the island is done
// or left.
//
// The flag tally is the QUEST'S OWN objective count (the sim credits one
// count per flag passed in order, tutorial/gauntlet_run.ts), so the card,
// the quest tracker, and the server can never disagree about a tag, and
// progress survives reloads with the character rather than the device. The
// end-of-course camera lesson is the one client-side tally (accumulated
// view-yaw travel): it teaches a camera the sim never sees. While a card is
// up the body carries the bc-coach-up class, and the quest dialog shifts
// down below the card (styles/hud.css) so an NPC's dialogue never covers
// the lesson. Reads world state, writes none, and runs identically against
// the offline Sim and the online ClientWorld.

import { currentInputHintMode, type InputHintMode } from '../game/input_hint_mode';
import type { Keybinds } from '../game/keybinds';
import type { Renderer } from '../render/renderer';
import { BOOTCAMP_COURSE_CHECKPOINTS } from '../sim/content/proving_shore';
import { GAUNTLET_QUEST_ID } from '../sim/tutorial/gauntlet_run';
import { groundHeight, WATER_LEVEL } from '../sim/world';
import { WORLD_SEED } from '../sim/world_seed';
import type { IWorld } from '../world_api';
import {
  type BootcampParam,
  type BootcampStep,
  bellCardPlan,
  bootcampArrowTarget,
  bootcampBodyPlan,
  bootcampKeycaps,
  bootcampTitleKey,
  CAMERA_LESSON_TRAVEL_RAD,
  type CoachFocus,
  type CoachParam,
  type CoachState,
  coachCardPlan,
  coachFocus,
  coachKeycaps,
  computeBootcampStep,
} from './bootcamp_view';
import { tEntity } from './entity_i18n';
import { formatNumber, t } from './i18n';

// The island column: the card never shows east of the strait.
const ISLAND_MAX_X = -180;

export class BootcampOverlay {
  private engaged = false;
  private step: BootcampStep | null = null;
  private renderKey: string | null = null;
  private lastMode: InputHintMode = 'keyboard';
  private lastCounts = 0;
  // The camera lesson's client-side tally: accumulated view-yaw travel.
  private cameraTravel = 0;
  private cameraLastYaw: number | null = null;
  // Latched when the rail's last quest is seen moving this session, so the
  // closing bell card only follows a graduation, never a casual revisit.
  private sawSail = false;
  private bellPhase = false;

  private root: HTMLElement | null = null;
  private titleEl!: HTMLElement;
  private stepEl!: HTMLElement;
  private bodyEl!: HTMLElement;
  private keysEl!: HTMLElement;
  private progressEl!: HTMLElement;
  private arrow: HTMLElement | null = null;
  private lastFocus: CoachFocus | null = null;
  private lastKeybinds: Keybinds | null = null;

  // Called every HUD frame. Cheap no-op while no rail quest is moving.
  update(world: IWorld, renderer: Renderer, keybinds: Keybinds): void {
    const p = world.player;
    if (!p) return;
    if (world.playerId < 0 || p.id !== world.playerId) return;

    const onIsland = (p.pos?.x ?? 0) < ISLAND_MAX_X;
    const focus = onIsland ? coachFocus((questId) => railQuestState(world, questId)) : null;
    if (focus?.questId === 'q_ps_set_sail') this.sawSail = true;

    if (!focus) {
      // Rail finished or not offered. A graduate still standing on the
      // island gets the closing bell card; leaving the island (the bell
      // ride itself) folds everything and clears the graduation latch.
      this.bellPhase = onIsland && this.sawSail;
      if (!onIsland) this.sawSail = false;
      if (!this.bellPhase) {
        if (this.engaged) this.disengage();
        return;
      }
    } else {
      this.bellPhase = false;
    }

    this.lastFocus = focus;
    this.lastKeybinds = keybinds;
    const isGauntlet = focus?.questId === GAUNTLET_QUEST_ID;
    this.lastCounts = isGauntlet ? questCounts(world) : 0;

    // The camera lesson's yaw tally runs off the live renderer view. It only
    // accumulates once the run's flags are all tagged; a fresh run (abandon
    // and retake) starts the tally over.
    if (isGauntlet && this.lastCounts >= BOOTCAMP_COURSE_CHECKPOINTS.length) {
      const yaw = renderer.camYaw;
      if (this.cameraLastYaw !== null) {
        this.cameraTravel += Math.abs(wrapAngle(yaw - this.cameraLastYaw));
      }
      this.cameraLastYaw = yaw;
    } else {
      this.cameraTravel = 0;
      this.cameraLastYaw = null;
    }
    const cameraTurned = this.cameraTravel >= CAMERA_LESSON_TRAVEL_RAD;

    this.engaged = true;
    const mode = currentInputHintMode();
    let nextRenderKey: string;
    if (this.bellPhase) {
      this.step = null;
      nextRenderKey = `bell:${mode}`;
    } else if (isGauntlet) {
      const next = computeBootcampStep({
        questActive: focus!.state !== 'available',
        checkpointsReached: this.lastCounts,
        cameraTurned,
      });
      this.step = next;
      nextRenderKey = `gauntlet:${next}:${mode}`;
    } else {
      this.step = null;
      nextRenderKey = `${focus!.questId}:${focus!.state}:${mode}`;
    }

    if (this.renderKey !== nextRenderKey) {
      this.renderKey = nextRenderKey;
      this.lastMode = mode;
      this.renderPanel(keybinds);
    }

    this.updateArrow(renderer);
  }

  /** Re-localize after an in-game language switch (the Hud's woc:languagechange
   *  fan-out). Self-gated on a card being up, the tutorial.ts precedent. */
  relocalize(_world: IWorld, keybinds: Keybinds): void {
    if (!this.engaged || this.renderKey === null) return;
    this.renderPanel(keybinds);
  }

  // ---- internals --------------------------------------------------------

  private courseProgress(): string {
    return t('hudChrome.bootcamp.courseProgress', {
      current: formatNumber(Math.min(this.lastCounts + 1, BOOTCAMP_COURSE_CHECKPOINTS.length)),
      total: formatNumber(BOOTCAMP_COURSE_CHECKPOINTS.length),
    });
  }

  private ensureDom(): void {
    if (this.root) return;
    const ui = document.getElementById('ui');
    if (!ui) return;

    const root = document.createElement('div');
    // The tutorial card family's chrome, plus its own hook for the keycap row.
    root.className = 'tut-card bc-card';
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    root.setAttribute('aria-labelledby', 'bc-title');

    const header = document.createElement('div');
    header.className = 'tut-head';
    this.titleEl = document.createElement('div');
    this.titleEl.className = 'tut-title';
    this.titleEl.id = 'bc-title';
    this.stepEl = document.createElement('div');
    this.stepEl.className = 'tut-step';
    header.append(this.titleEl, this.stepEl);

    this.bodyEl = document.createElement('div');
    this.bodyEl.className = 'tut-body';

    this.keysEl = document.createElement('div');
    this.keysEl.className = 'tut-keys';
    this.keysEl.setAttribute('aria-hidden', 'true'); // chips repeat the body copy

    this.progressEl = document.createElement('div');
    this.progressEl.className = 'tut-progress';

    root.append(header, this.bodyEl, this.keysEl, this.progressEl);
    ui.appendChild(root);
    this.root = root;
    // The quest dialog shifts down below the card while this class is up.
    document.body.classList.add('bc-coach-up');

    const arrow = document.createElement('div');
    arrow.className = 'tut-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '➤'; // the tut-arrow family's marker glyph
    ui.appendChild(arrow);
    this.arrow = arrow;
  }

  private renderPanel(keybinds: Keybinds): void {
    this.ensureDom();
    if (!this.root) return;
    if (this.bellPhase) this.renderBellPanel(keybinds);
    else if (this.step !== null) this.renderLadderPanel(keybinds);
    else this.renderCoachPanel(keybinds);
  }

  private coachLabels(keybinds: Keybinds): Readonly<Record<CoachParam, string>> {
    const unbound = t('hud.options.unbound');
    return {
      interactKey: keybinds.primaryLabel('interact') || unbound,
      mapKey: keybinds.primaryLabel('map') || unbound,
      targetKey: keybinds.primaryLabel('target') || unbound,
      // Slot 0 is the first action bar button (Attack, default Digit1).
      attackKey: keybinds.primaryLabel('slot0') || unbound,
      bagsKey: keybinds.primaryLabel('bags') || unbound,
    };
  }

  /** The Gauntlet's own lesson-ladder card (the rail's head quest). */
  private renderLadderPanel(keybinds: Keybinds): void {
    const mode = currentInputHintMode();
    this.lastMode = mode;

    const unbound = t('hud.options.unbound');
    const labels = {
      forwardKey: keybinds.primaryLabel('forward') || unbound,
      turnKey: keybinds.primaryLabel('turnRight') || unbound,
      strafeKey: keybinds.primaryLabel('strafeLeft') || unbound,
      interactKey: keybinds.primaryLabel('interact') || unbound,
    };

    const plan = bootcampBodyPlan(this.step!, mode);
    const params: Partial<Record<BootcampParam, string>> = {};
    for (const key of plan.params) params[key] = labels[key];

    this.titleEl.textContent = t(bootcampTitleKey(this.step!));
    this.bodyEl.textContent = t(plan.bodyKey, params);

    this.paintKeycaps(bootcampKeycaps(this.step!, mode, labels));
    this.stepEl.textContent = '';

    if (this.step !== 'done' && this.step !== 'talk' && this.step !== 'camera') {
      this.progressEl.textContent = this.courseProgress();
      this.progressEl.style.display = '';
    } else {
      this.progressEl.style.display = 'none';
    }
    this.root!.classList.toggle('tut-done', this.step === 'done');
  }

  /** The generic three-state coach card for every later rail quest. */
  private renderCoachPanel(keybinds: Keybinds): void {
    const focus = this.lastFocus;
    if (!focus) return;
    const mode = currentInputHintMode();
    this.lastMode = mode;

    const labels = this.coachLabels(keybinds);
    const plan = coachCardPlan(focus, mode);
    const npc = tEntity({ kind: 'npc', id: plan.npcId, field: 'name' });
    const params: Record<string, string> = {};
    if (plan.bodyHasNpc) params.npc = npc;
    for (const key of plan.params) params[key] = labels[key];

    this.titleEl.textContent = plan.titleKey
      ? t(plan.titleKey, plan.titleHasNpc ? { npc } : undefined)
      : tEntity({ kind: 'quest', id: focus.questId, field: 'title' });
    this.bodyEl.textContent = t(plan.bodyKey, params);

    this.paintKeycaps(coachKeycaps(plan, mode, labels));
    this.stepEl.textContent = '';
    this.progressEl.style.display = 'none';
    this.root!.classList.remove('tut-done');
  }

  /** The closing card: the rail is done, ring the bell home. */
  private renderBellPanel(keybinds: Keybinds): void {
    const mode = currentInputHintMode();
    this.lastMode = mode;
    const labels = this.coachLabels(keybinds);
    const plan = bellCardPlan(mode);
    const params: Record<string, string> = {};
    for (const key of plan.params) params[key] = labels[key];

    this.titleEl.textContent = t(plan.titleKey);
    this.bodyEl.textContent = t(plan.bodyKey, params);
    this.paintKeycaps(coachKeycaps(plan, mode, labels));
    this.stepEl.textContent = '';
    this.progressEl.style.display = 'none';
    this.root!.classList.add('tut-done');
  }

  private paintKeycaps(caps: readonly string[]): void {
    this.keysEl.replaceChildren();
    for (const cap of caps) {
      const chip = document.createElement('span');
      chip.className = 'tut-keycap';
      chip.textContent = cap;
      this.keysEl.appendChild(chip);
    }
    this.keysEl.style.display = this.keysEl.childElementCount > 0 ? '' : 'none';
  }

  // Points the shared course arrow at the current lesson's target.
  private updateArrow(renderer: Renderer): void {
    if (!this.arrow) return;
    const target = this.bellPhase
      ? bellCardPlan(this.lastMode).arrow
      : this.step !== null
        ? bootcampArrowTarget(this.step, this.lastCounts)
        : this.lastFocus
          ? coachCardPlan(this.lastFocus, this.lastMode).arrow
          : null;
    if (!target) {
      this.hideArrow();
      return;
    }

    // Targets are authored on dry ground; the max() is defensive for edited
    // worlds so the marker never aims under the sea.
    const y = Math.max(groundHeight(target.x, target.z, WORLD_SEED), WATER_LEVEL) + 2.2;
    const v = renderer.worldToScreen(target.x, y, target.z);
    const margin = 56;
    const w = window.innerWidth;
    const h = window.innerHeight;
    let sx = v.x;
    let sy = v.y;
    if (v.behind) {
      sx = w - v.x;
      sy = h - v.y;
    }
    const cx = w / 2;
    const cy = h / 2;
    const angle = Math.atan2(sy - cy, sx - cx);
    sx = Math.max(margin, Math.min(w - margin, sx));
    sy = Math.max(margin, Math.min(h - margin, sy));

    this.arrow.style.display = 'block';
    this.arrow.style.left = `${sx}px`;
    this.arrow.style.top = `${sy}px`;
    this.arrow.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;
  }

  private hideArrow(): void {
    if (this.arrow) this.arrow.style.display = 'none';
  }

  /** Fold the card away for now; the quest log decides any re-engage. */
  private disengage(): void {
    this.engaged = false;
    this.step = null;
    this.renderKey = null;
    this.bellPhase = false;
    this.root?.remove();
    this.arrow?.remove();
    this.root = null;
    this.arrow = null;
    document.body.classList.remove('bc-coach-up');
  }
}

/** The quest objective's own flag tally (0 when the quest is not active). */
function questCounts(world: IWorld): number {
  return world.questLog.get(GAUNTLET_QUEST_ID)?.counts?.[0] ?? 0;
}

/** One rail quest's coach state, or null when it is not moving (locked
 *  behind its prerequisite, or already handed in). */
function railQuestState(world: IWorld, questId: string): CoachState | null {
  if (world.questLog.get(questId)?.state === 'active') return 'active';
  const state = world.questState(questId);
  if (state === 'available') return 'available';
  if (state === 'ready') return 'ready';
  return null;
}

/** Shortest signed angular distance, for the camera lesson's travel tally. */
function wrapAngle(a: number): number {
  let r = a % (Math.PI * 2);
  if (r > Math.PI) r -= Math.PI * 2;
  if (r < -Math.PI) r += Math.PI * 2;
  return r;
}
