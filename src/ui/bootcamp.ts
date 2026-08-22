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

import { currentInputHintMode } from '../game/input_hint_mode';
import type { Keybinds } from '../game/keybinds';
import { voice } from '../game/voice';
import { coachTrailPlan, distanceToTrail } from '../render/coach_trail_core';
import type { Renderer } from '../render/renderer';
import { BOOTCAMP_COURSE_CHECKPOINTS, isOnProvingShore } from '../sim/content/proving_shore';
import { GAUNTLET_QUEST_ID } from '../sim/tutorial/gauntlet_run';
import { startingAttackFor } from '../sim/tutorial/starting_attack';
import { groundHeight, WATER_LEVEL } from '../sim/world';
import { WORLD_SEED } from '../sim/world_seed';
import type { IWorld } from '../world_api';
import {
  type BootcampParam,
  type BootcampStep,
  bellCardPlan,
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
  RING_LESSON_ITEM_ID,
  RING_LESSON_QUEST_ID,
  type RingLessonPhase,
  ringCardPlan,
  ringLessonPhase,
} from './bootcamp_view';
import {
  CASTER_CLASSES,
  type CoachPromptPlan,
  coachGlowBagItemId,
  coachGlowQuestId,
  coachGlowVendorItemId,
  coachPromptChip,
  coachPromptInRange,
  coachPromptPlan,
  GUIDE_VOICE_LINES,
  type GuideVoiceLineName,
  parkourPromptPlan,
  VEER_GRACE_MS,
  VEER_NUDGE_COOLDOWN_MS,
  VEER_NUDGES_PER_STATION,
  VEER_OFF_YD,
} from './coach_prompt_view';
import { tEntity } from './entity_i18n';
import { formatNumber, t } from './i18n';
import { iconDataUrl } from './icons';

/** The Attack toggle's icon id (hud.ts resolves ATTACK_ICON_KEY to it). */
const AUTO_ATTACK_ICON_ID = 'attack';

// The island rectangle: the card never shows off the Proving Shore. Both
// axes matter; the x column alone also covers four mainland zones
// (isOnProvingShore's contract).

export class BootcampOverlay {
  private engaged = false;
  private step: BootcampStep | null = null;
  private renderKey: string | null = null;
  private lastCounts = 0;
  // The camera lesson's client-side tally: accumulated view-yaw travel.
  private cameraTravel = 0;
  private cameraLastYaw: number | null = null;
  // Latched when the rail's last quest is seen moving this session, so the
  // closing bell card only follows a graduation, never a casual revisit.
  private sawSail = false;
  private bellPhase = false;
  // The ring equip lesson (bootcamp_view.ts ringLessonPhase): armed only
  // when the pearl quest is seen moving THIS session (a reload with the
  // ring already worn must not resurrect the card), ended when the
  // character sheet is opened or the admire nudge times out.
  private sawPearl = false;
  private ringPhase: RingLessonPhase | null = null;
  private ringCharSeen = false;
  private ringAdmireUntil = 0;
  private ringDone = false;
  // Casters learn their slot-2 spell, not the melee Attack (Guy's note).
  private casterClass = false;

  private root: HTMLElement | null = null;
  private titleEl!: HTMLElement;
  private stepEl!: HTMLElement;
  private bodyEl!: HTMLElement;
  private keysEl!: HTMLElement;
  private progressEl!: HTMLElement;
  private lastFocus: CoachFocus | null = null;
  // The floating interact bubble (coach_prompt_view.ts): shown only while
  // standing in interact reach of the coach's current target, so the one
  // button that matters appears where the player is already looking.
  private prompt: HTMLElement | null = null;
  private promptChipEl: HTMLElement | null = null;
  private promptVerbEl: HTMLElement | null = null;
  private promptContentKey = '';
  private promptPainted = { visible: false, sx: Number.NaN, sy: Number.NaN };
  private promptGroundKey = '';
  private promptGroundY = 0;

  // Called every HUD frame. Cheap no-op while no rail quest is moving.
  update(world: IWorld, renderer: Renderer, keybinds: Keybinds): void {
    const p = world.player;
    if (!p) return;
    if (world.playerId < 0 || p.id !== world.playerId) return;

    const onIsland = isOnProvingShore(p.pos?.x ?? 0, p.pos?.z ?? 0);
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
    this.casterClass = CASTER_CLASSES.has(world.cfg.playerClass);
    if (focus?.questId === RING_LESSON_QUEST_ID) this.sawPearl = true;
    this.ringPhase = this.computeRingPhase(world, onIsland);
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
    } else if (this.ringPhase !== null) {
      this.step = null;
      nextRenderKey = `ring:${this.ringPhase}:${mode}`;
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
      this.renderPanel(keybinds);
    }

    this.updatePrompt(world, renderer, keybinds);
    this.applyUiGlow();
    this.updateGuideVoice(world, focus);
  }

  // ---- Ferryman Odo's guiding voice --------------------------------------
  // One-shot reactions to the player's FIRST actions (first flag, the run
  // hand-in, each station handed back), a veer-off-the-trail nudge, and the
  // graduation send-off. The clip is optional garnish (voice.play on an
  // unrendered key is a silent no-op); the caption under the coach card is
  // the always-on half. Session-scoped one-shot latches: a reload re-greets,
  // which reads as warmth, not a bug.
  private guidePrevStation: string | null = null;
  private guidePrevCounts = -1;
  private guideSpoken = new Set<GuideVoiceLineName>();
  private guideStationParity = false;
  private guideVeerCheckedAt = 0;
  private guideOffPathSince: number | null = null;
  private guideLastNudgeAt = 0;
  private guideNudges = 0;
  private captionEl: HTMLElement | null = null;
  private captionTimer: ReturnType<typeof setTimeout> | null = null;

  private updateGuideVoice(world: IWorld, focus: CoachFocus | null): void {
    if (!this.engaged) return;
    const stationKey = this.bellPhase ? 'bell' : focus ? `${focus.questId}:${focus.state}` : 'none';
    if (stationKey !== this.guidePrevStation) {
      const prev = this.guidePrevStation;
      if (stationKey === 'bell') {
        this.speak('graduate');
      } else if (prev === null && focus?.state === 'available') {
        this.speak('arrival');
      } else if (prev?.endsWith(':ready') && focus && !prev.startsWith(`${focus.questId}:`)) {
        // A hand-in just landed: alternate the two encouragement lines.
        this.speak(this.guideStationParity ? 'stationDoneB' : 'stationDoneA', true);
        this.guideStationParity = !this.guideStationParity;
      }
      this.guidePrevStation = stationKey;
      this.guideNudges = 0;
      this.guideOffPathSince = null;
    }
    if (focus?.questId === GAUNTLET_QUEST_ID) {
      if (this.guidePrevCounts === 0 && this.lastCounts === 1) this.speak('firstFlag');
      if (this.guidePrevCounts >= 0 && this.guidePrevCounts < BOOTCAMP_COURSE_CHECKPOINTS.length) {
        if (this.lastCounts >= BOOTCAMP_COURSE_CHECKPOINTS.length) this.speak('runDone');
      }
      this.guidePrevCounts = this.lastCounts;
    } else {
      this.guidePrevCounts = -1;
    }
    this.updateVeerNudge(world);
  }

  private updateVeerNudge(world: IWorld): void {
    const now = performance.now();
    if (now - this.guideVeerCheckedAt < 1000) return;
    this.guideVeerCheckedAt = now;
    const p = world.player;
    if (!p) return;
    const plan = coachTrailPlan(world, this.lastCounts);
    if (!plan) {
      this.guideOffPathSince = null;
      return;
    }
    const d = distanceToTrail(plan.points, p.pos.x, p.pos.z);
    if (d <= VEER_OFF_YD) {
      this.guideOffPathSince = null;
      return;
    }
    if (this.guideOffPathSince === null) {
      this.guideOffPathSince = now;
      return;
    }
    if (now - this.guideOffPathSince < VEER_GRACE_MS) return;
    if (this.guideNudges >= VEER_NUDGES_PER_STATION) return;
    if (now - this.guideLastNudgeAt < VEER_NUDGE_COOLDOWN_MS) return;
    this.guideLastNudgeAt = now;
    this.guideNudges += 1;
    this.guideOffPathSince = null;
    this.speak('veerOff', true);
  }

  private speak(name: GuideVoiceLineName, repeatable = false): void {
    if (!repeatable) {
      if (this.guideSpoken.has(name)) return;
      this.guideSpoken.add(name);
    }
    const line = GUIDE_VOICE_LINES[name];
    // Never talk over a dialog greeting or another guide line mid-play; the
    // caption still lands, so the guidance is never lost with the audio.
    if (!voice.isPlaying()) voice.play(line.clip);
    this.showCaption(t(line.caption));
  }

  private showCaption(text: string): void {
    this.ensureDom();
    if (!this.root) return;
    if (!this.captionEl) {
      const el = document.createElement('div');
      el.className = 'tut-voice';
      this.root.appendChild(el);
      this.captionEl = el;
    }
    const odo = tEntity({ kind: 'npc', id: 'ferryman_odo', field: 'name' });
    this.captionEl.textContent = `${odo}: "${text}"`;
    this.captionEl.style.display = '';
    if (this.captionTimer) clearTimeout(this.captionTimer);
    this.captionTimer = setTimeout(() => {
      if (this.captionEl) this.captionEl.style.display = 'none';
    }, 8000);
  }

  // Toggle the press-this-next glow (.qd-coach) on whichever window controls
  // match the current station: the tracker title, the quest-log row, the
  // vendor's pouch row, the bagged pouch stack. Windows rebuild their DOM
  // freely, so the class is re-synced on a short cadence rather than hooked
  // into every painter; the toggles are same-state no-ops between changes.
  private glowTick = 0;

  /** How long the "press C" nudge stays up after the ring is worn before
   *  the lesson lets go on its own. */
  private static readonly RING_ADMIRE_MS = 45000;

  /** The ring lesson's live phase: pure decision (bootcamp_view.ts) driven
   *  by the world's bags and fingers, plus this driver's session latches
   *  (armed by seeing the pearl quest move, ended by the character sheet
   *  opening or the admire nudge timing out). */
  private computeRingPhase(world: IWorld, onIsland: boolean): RingLessonPhase | null {
    if (!onIsland || !this.sawPearl || this.ringDone) return null;
    const questDone = world.questState(RING_LESSON_QUEST_ID) === 'done';
    const equipped =
      world.equipment.ring1 === RING_LESSON_ITEM_ID ||
      world.equipment.ring2 === RING_LESSON_ITEM_ID;
    const inBags = world.inventory.some((slot) => slot.itemId === RING_LESSON_ITEM_ID);
    const phase = ringLessonPhase({ questDone, inBags, equipped, charSeen: this.ringCharSeen });
    if (phase !== 'admire') {
      this.ringAdmireUntil = 0;
      return phase;
    }
    const charWindow = document.getElementById('char-window');
    if (charWindow && charWindow.style.display === 'block') {
      this.ringCharSeen = true;
      this.ringDone = true;
      return null;
    }
    const now = performance.now();
    if (this.ringAdmireUntil === 0) this.ringAdmireUntil = now + BootcampOverlay.RING_ADMIRE_MS;
    else if (now > this.ringAdmireUntil) {
      this.ringDone = true;
      return null;
    }
    return phase;
  }

  private applyUiGlow(): void {
    this.glowTick = (this.glowTick + 1) % 10;
    if (this.glowTick !== 0) return;
    const focus = this.lastFocus;
    const questId = coachGlowQuestId(focus);
    const vendorItem = coachGlowVendorItemId(focus);
    const bagItem = coachGlowBagItemId(focus);
    syncGlow('#quest-tracker .qt-title', (el) => el.dataset.quest === questId);
    syncGlow('#quest-log .ql-item', (el) => el.dataset.quest === questId);
    syncGlow(
      '#vendor-window .vendor-item',
      (el) => vendorItem !== null && el.dataset.coachItem === vendorItem,
    );
    // The buckle-on step is a sell trap while the stall is open (a bag click
    // SELLS with a vendor up): with the shop open the glow moves to the
    // shop's close button, and only once it is closed does the bagged pouch
    // itself pulse.
    const vendorEl = document.querySelector<HTMLElement>('#vendor-window');
    const vendorOpen = vendorEl !== null && vendorEl.style.display === 'block';
    syncGlow('#vendor-window [data-close]', () => bagItem !== null && vendorOpen);
    const ringEquip = this.ringPhase === 'equip';
    syncGlow(
      '#bags .bag-item',
      (el) =>
        (bagItem !== null && !vendorOpen && el.dataset.coachItem === bagItem) ||
        (ringEquip && el.dataset.coachItem === RING_LESSON_ITEM_ID),
    );
    // The ring lesson's two menu asks: B while the ring waits in a bag, C
    // once it is on the finger.
    syncGlow('#mm-bag', () => ringEquip);
    syncGlow('#mm-char', () => this.ringPhase === 'admire');
  }

  /** Re-localize after an in-game language switch (the Hud's woc:languagechange
   *  fan-out). Self-gated on a card being up, the tutorial.ts precedent. */
  relocalize(_world: IWorld, keybinds: Keybinds): void {
    if (!this.engaged || this.renderKey === null) return;
    this.renderPanel(keybinds);
    // The interact bubble's content memo digests no locale, so a language
    // switch would leave the verb in the old tongue until the target moved;
    // clearing it makes the next frame repaint the localized verb.
    this.promptContentKey = '';
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

    // No guidance arrow here (the Eastbrook coachmark keeps its own): the
    // island guides with the golden ground trail, the target NPC's aura, and
    // the objective beam (render/island_guidance.ts), which playtests read
    // far better than a screen-space pointer.

    // The prompt bubble: keycap chip(s) plus a one-word verb. World-anchored
    // over interact targets; screen-anchored low-center for the movement
    // lessons (the W ask). aria-hidden: the coach card body already carries
    // the same instruction for screen readers.
    const prompt = document.createElement('div');
    prompt.className = 'tut-prompt';
    prompt.setAttribute('aria-hidden', 'true');
    const chips = document.createElement('span');
    chips.className = 'tut-prompt-chips';
    const verb = document.createElement('span');
    verb.className = 'tut-prompt-verb';
    prompt.append(chips, verb);
    ui.appendChild(prompt);
    this.prompt = prompt;
    this.promptChipEl = chips;
    this.promptVerbEl = verb;
  }

  private renderPanel(keybinds: Keybinds): void {
    this.ensureDom();
    if (!this.root) return;
    if (this.bellPhase) this.renderBellPanel(keybinds);
    else if (this.ringPhase !== null) this.renderRingPanel(keybinds);
    else if (this.step !== null) this.renderLadderPanel(keybinds);
    else this.renderCoachPanel(keybinds);
  }

  /** The ring equip lesson's card (wear it, then see it on the sheet). */
  private renderRingPanel(keybinds: Keybinds): void {
    if (this.ringPhase === null) return;
    const mode = currentInputHintMode();
    const labels = this.coachLabels(keybinds);
    const plan = ringCardPlan(this.ringPhase, mode);
    const params: Record<string, string> = {};
    for (const key of plan.params) params[key] = labels[key];
    this.titleEl.textContent = t(plan.titleKey);
    this.bodyEl.textContent = t(plan.bodyKey, params);
    this.paintKeycaps(coachKeycaps(plan, mode, labels));
    this.stepEl.textContent = '';
    this.progressEl.style.display = 'none';
    this.root!.classList.remove('tut-done');
  }

  private coachLabels(keybinds: Keybinds): Readonly<Record<CoachParam, string>> {
    const unbound = t('hud.options.unbound');
    return {
      interactKey: keybinds.primaryLabel('interact') || unbound,
      mapKey: keybinds.primaryLabel('map') || unbound,
      targetKey: keybinds.primaryLabel('target') || unbound,
      // Melee classes learn slot 0 (Attack, default Digit1); casters learn
      // slot 1, where their level-1 spell sits (default Digit2).
      attackKey: keybinds.primaryLabel(this.casterClass ? 'slot1' : 'slot0') || unbound,
      bagsKey: keybinds.primaryLabel('bags') || unbound,
      charKey: keybinds.primaryLabel('char') || unbound,
    };
  }

  /** The Gauntlet's own lesson-ladder card (the rail's head quest). */
  private renderLadderPanel(keybinds: Keybinds): void {
    const mode = currentInputHintMode();

    const unbound = t('hud.options.unbound');
    const labels = {
      forwardKey: keybinds.primaryLabel('forward') || unbound,
      turnKey: keybinds.primaryLabel('turnRight') || unbound,
      turnLeftKey: keybinds.primaryLabel('turnLeft') || unbound,
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

    const labels = this.coachLabels(keybinds);
    const plan = coachCardPlan(focus, mode, this.casterClass);
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
    paintChipSequence(this.keysEl, caps);
    this.keysEl.style.display = this.keysEl.childElementCount > 0 ? '' : 'none';
  }

  // The interact bubble's per-frame drive: the per-frame painter contracts
  // by hand (memoized ground sample, elided writes; this is a bare-named
  // overlay, not a *_painter on the PainterHost seam). Hidden out of
  // interact reach, so appearing IS the signal to press.
  private updatePrompt(world: IWorld, renderer: Renderer, keybinds: Keybinds): void {
    if (!this.prompt || !this.promptChipEl || !this.promptVerbEl) return;
    if (this.ringPhase !== null) {
      this.hidePrompt();
      return;
    }
    const p = world.player;
    const mode = currentInputHintMode();

    // Lane 2's parkour asks own the bubble while one is on screen: a jump
    // plan in range beats the centered movement chips, or the Space ask
    // would never surface on keyboard (the movement variant returns early).
    const jumpPlan = this.step === 'turnwalk' && p ? parkourPromptPlan(p.pos) : null;
    const jumpAskVisible = jumpPlan !== null && p !== null && coachPromptInRange(jumpPlan, p.pos);

    // The movement lessons carry a screen-anchored bubble (there is no world
    // point to stand it on: the lesson is the player's own hands), so the W
    // ask is as loud as the interact F. Keyboard only, the keycap rule.
    if (
      mode === 'keyboard' &&
      !jumpAskVisible &&
      (this.step === 'forward' || this.step === 'turnwalk' || this.step === 'strafe')
    ) {
      const unbound = t('hud.options.unbound');
      const caps = bootcampKeycaps(this.step, mode, {
        forwardKey: keybinds.primaryLabel('forward') || unbound,
        turnKey: keybinds.primaryLabel('turnRight') || unbound,
        turnLeftKey: keybinds.primaryLabel('turnLeft') || unbound,
        strafeKey: keybinds.primaryLabel('strafeLeft') || unbound,
        interactKey: keybinds.primaryLabel('interact') || unbound,
      });
      const contentKey = `move:${this.step}:${caps.join(',')}`;
      if (this.promptContentKey !== contentKey) {
        this.promptContentKey = contentKey;
        this.paintPromptChips(caps.map((cap) => ({ cap })));
        this.promptVerbEl.textContent = t('hudChrome.bootcamp.promptHold');
      }
      this.prompt.classList.add('tut-prompt-center');
      if (!this.promptPainted.visible) {
        this.prompt.style.display = 'flex';
        this.promptPainted.visible = true;
      }
      // The centered variant is CSS-positioned; clear any stale inline offsets.
      if (!Number.isNaN(this.promptPainted.sx)) {
        this.prompt.style.left = '';
        this.prompt.style.top = '';
        this.promptPainted.sx = Number.NaN;
        this.promptPainted.sy = Number.NaN;
      }
      return;
    }
    this.prompt.classList.remove('tut-prompt-center');

    const plan: CoachPromptPlan | null = p
      ? coachPromptPlan({
          bellPhase: this.bellPhase,
          step: this.step,
          focus: this.lastFocus,
          entities: world.entities.values(),
          playerPos: p.pos,
          questLog: world.questLog,
          targetId: p.targetId,
        })
      : null;
    if (!plan || !p || !coachPromptInRange(plan, p.pos)) {
      this.hidePrompt();
      return;
    }

    // The kill lessons' first half asks for a CLICK, which needs no chip on
    // any input family: the bubble sits on the quarry and the verb reads
    // Select. Its second half names the button that hits: the keycap on a
    // keyboard, and on touch the action-bar ICON itself, because a phone
    // player has no key to be told about and is looking for the picture.
    // The parkour asks chip the jump bind (Space, or the pad's literal
    // bottom face button); everything else chips interact per input family.
    let chips: readonly PromptChip[];
    if (plan.kind === 'select') {
      chips = [];
    } else if (plan.kind === 'kill') {
      if (mode === 'keyboard') {
        const cap = keybinds.primaryLabel(this.casterClass ? 'slot1' : 'slot0');
        chips = cap ? [{ cap }] : [];
      } else if (mode === 'touch') {
        chips = [{ abilityIcon: this.promptAttackIconId(world) }];
      } else {
        chips = [];
      }
    } else if (plan.kind === 'jump') {
      chips =
        mode === 'keyboard'
          ? [keybinds.primaryLabel('jump')].filter(Boolean).map((cap) => ({ cap }))
          : mode === 'pad'
            ? [{ cap: 'A' }]
            : [];
    } else if (plan.kind === 'use') {
      chips =
        mode === 'keyboard'
          ? [keybinds.primaryLabel('bags')].filter(Boolean).map((cap) => ({ cap }))
          : [];
    } else {
      const { chip } = coachPromptChip(mode, keybinds.primaryLabel('interact'));
      chips = chip ? [{ cap: chip }] : [];
    }
    const contentKey = `${plan.verbKey}:${chips.map(chipKey).join(',')}:${mode}`;
    if (this.promptContentKey !== contentKey) {
      this.promptContentKey = contentKey;
      this.paintPromptChips(chips);
      this.promptVerbEl.textContent = t(plan.verbKey);
    }

    const groundKey = `${plan.x},${plan.z}`;
    if (this.promptGroundKey !== groundKey) {
      this.promptGroundKey = groundKey;
      this.promptGroundY =
        Math.max(groundHeight(plan.x, plan.z, WORLD_SEED), WATER_LEVEL) + plan.lift;
    }
    const v = renderer.worldToScreen(plan.x, this.promptGroundY, plan.z);
    if (v.behind) {
      this.hidePrompt();
      return;
    }
    const sx = Math.round(v.x * 2) / 2;
    const sy = Math.round(v.y * 2) / 2;
    const last = this.promptPainted;
    if (!last.visible) {
      this.prompt.style.display = 'flex';
      last.visible = true;
    }
    if (last.sx !== sx) {
      this.prompt.style.left = `${sx}px`;
      last.sx = sx;
    }
    if (last.sy !== sy) {
      this.prompt.style.top = `${sy}px`;
      last.sy = sy;
    }
  }

  private paintPromptChips(chips: readonly PromptChip[]): void {
    if (!this.promptChipEl) return;
    this.promptChipEl.replaceChildren();
    paintPromptChipSequence(this.promptChipEl, chips);
    this.promptChipEl.style.display = chips.length > 0 ? '' : 'none';
  }

  /** Which action-bar icon the touch combat bubble shows: the Attack toggle
   *  for a class that swings, and the taught spell for one that casts (a
   *  caster has no melee autoattack worth pointing a new player at). */
  private promptAttackIconId(world: IWorld): string {
    if (!this.casterClass) return AUTO_ATTACK_ICON_ID;
    return startingAttackFor(world.cfg.playerClass).abilityId ?? AUTO_ATTACK_ICON_ID;
  }

  private hidePrompt(): void {
    if (!this.prompt || !this.promptPainted.visible) return;
    this.prompt.style.display = 'none';
    this.promptPainted.visible = false;
  }

  /** Fold the card away for now; the quest log decides any re-engage. */
  private disengage(): void {
    this.engaged = false;
    this.step = null;
    this.renderKey = null;
    this.bellPhase = false;
    this.root?.remove();
    this.prompt?.remove();
    this.root = null;
    this.prompt = null;
    this.promptChipEl = null;
    this.promptVerbEl = null;
    this.promptContentKey = '';
    this.promptPainted = { visible: false, sx: Number.NaN, sy: Number.NaN };
    this.promptGroundKey = '';
    // Leaving the island: no control is the next press any more.
    for (const scope of ['#quest-tracker', '#quest-log', '#vendor-window', '#bags']) {
      for (const el of document.querySelectorAll<HTMLElement>(`${scope} .qd-coach`)) {
        el.classList.remove('qd-coach');
      }
    }
    if (this.captionTimer) clearTimeout(this.captionTimer);
    this.captionTimer = null;
    this.captionEl = null;
    this.guidePrevStation = null;
    this.guidePrevCounts = -1;
    this.guideOffPathSince = null;
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

/** Keycap chips with a localized "then" between them: every multi-key row
 *  on the island is a press SEQUENCE (D then W, B then F), and the playtest
 *  showed the order must be explicit. */
function paintChipSequence(host: HTMLElement, caps: readonly string[]): void {
  paintPromptChipSequence(
    host,
    caps.map((cap) => ({ cap })),
  );
}

/** One bubble chip: a keycap the player presses, or the action-bar icon they
 *  tap. Touch has no keys to name, so its combat bubble shows the button's
 *  own picture rather than a word for a key that does not exist there. */
type PromptChip = { readonly cap: string } | { readonly abilityIcon: string };

/** Repaint identity for a chip row (the memo key). */
function chipKey(chip: PromptChip): string {
  return 'cap' in chip ? chip.cap : `icon:${chip.abilityIcon}`;
}

function paintPromptChipSequence(host: HTMLElement, chips: readonly PromptChip[]): void {
  chips.forEach((chip, i) => {
    if (i > 0) {
      const sep = document.createElement('span');
      sep.className = 'tut-keycap-then';
      sep.textContent = t('hudChrome.bootcamp.keycapThen');
      host.appendChild(sep);
    }
    if ('cap' in chip) {
      const el = document.createElement('span');
      el.className = 'tut-keycap';
      el.textContent = chip.cap;
      host.appendChild(el);
      return;
    }
    const el = document.createElement('span');
    el.className = 'tut-keycap tut-keycap-icon';
    el.style.backgroundImage = `url(${iconDataUrl('ability', chip.abilityIcon)})`;
    // Decorative: the verb beside it already says what the press does, and
    // the icon repeats the action bar the player is looking at.
    el.setAttribute('aria-hidden', 'true');
    host.appendChild(el);
  });
}

/** Class-toggle sweep for the press-this-next glow (same-state no-ops). */
/** The qd-coach-pulse duration (styles/components.css); the phase seed below
 *  wraps on it, so the two must agree. Pinned by tests/bootcamp_glow.test.ts. */
const GLOW_PULSE_MS = 900;

/** Class-toggle sweep for the press-this-next glow, plus the phase seed that
 *  keeps a recreated row's pulse continuous. */
function syncGlow(selector: string, want: (el: HTMLElement) => boolean): void {
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    const on = want(el);
    el.classList.toggle('qd-coach', on);
    // Windows that repaint per frame (the quest tracker) recreate their rows,
    // and a recreated node restarts the pulse animation from zero: a strobe,
    // not a pulse. A negative delay seeded from the shared wall clock resumes
    // every node mid-cycle, so the glow breathes continuously no matter how
    // often its element is rebuilt.
    if (on) {
      el.style.animationDelay = `-${(performance.now() % GLOW_PULSE_MS).toFixed(0)}ms`;
    } else if (el.style.animationDelay) {
      el.style.animationDelay = '';
    }
  }
}

/** Shortest signed angular distance, for the camera lesson's travel tally. */
function wrapAngle(a: number): number {
  let r = a % (Math.PI * 2);
  if (r > Math.PI) r -= Math.PI * 2;
  if (r < -Math.PI) r += Math.PI * 2;
  return r;
}
