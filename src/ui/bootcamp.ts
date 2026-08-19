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
} from './bootcamp_view';
import {
  type CoachPromptPlan,
  coachGlowBagItemId,
  coachGlowQuestId,
  coachGlowVendorItemId,
  coachPromptChip,
  coachPromptInRange,
  coachPromptPlan,
  GUIDE_VOICE_LINES,
  type GuideVoiceLineName,
  VEER_GRACE_MS,
  VEER_NUDGE_COOLDOWN_MS,
  VEER_NUDGES_PER_STATION,
  VEER_OFF_YD,
} from './coach_prompt_view';
import { tEntity } from './entity_i18n';
import { formatNumber, t } from './i18n';

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
    syncGlow('#bags .bag-item', (el) => bagItem !== null && el.dataset.coachItem === bagItem);
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

  // The interact bubble's per-frame drive: the per-frame painter contracts
  // by hand (memoized ground sample, elided writes; this is a bare-named
  // overlay, not a *_painter on the PainterHost seam). Hidden out of
  // interact reach, so appearing IS the signal to press.
  private updatePrompt(world: IWorld, renderer: Renderer, keybinds: Keybinds): void {
    if (!this.prompt || !this.promptChipEl || !this.promptVerbEl) return;
    const p = world.player;
    const mode = currentInputHintMode();

    // The movement lessons carry a screen-anchored bubble (there is no world
    // point to stand it on: the lesson is the player's own hands), so the W
    // ask is as loud as the interact F. Keyboard only, the keycap rule.
    if (
      mode === 'keyboard' &&
      (this.step === 'forward' || this.step === 'turnwalk' || this.step === 'strafe')
    ) {
      const unbound = t('hud.options.unbound');
      const caps = bootcampKeycaps(this.step, mode, {
        forwardKey: keybinds.primaryLabel('forward') || unbound,
        turnKey: keybinds.primaryLabel('turnRight') || unbound,
        strafeKey: keybinds.primaryLabel('strafeLeft') || unbound,
        interactKey: keybinds.primaryLabel('interact') || unbound,
      });
      const contentKey = `move:${this.step}:${caps.join(',')}`;
      if (this.promptContentKey !== contentKey) {
        this.promptContentKey = contentKey;
        this.paintPromptChips(caps);
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
        })
      : null;
    if (!plan || !p || !coachPromptInRange(plan, p.pos)) {
      this.hidePrompt();
      return;
    }

    const { chip } = coachPromptChip(mode, keybinds.primaryLabel('interact'));
    const contentKey = `${plan.verbKey}:${chip ?? ''}:${mode}`;
    if (this.promptContentKey !== contentKey) {
      this.promptContentKey = contentKey;
      this.paintPromptChips(chip ? [chip] : []);
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

  private paintPromptChips(caps: readonly string[]): void {
    if (!this.promptChipEl) return;
    this.promptChipEl.replaceChildren();
    for (const cap of caps) {
      const chip = document.createElement('span');
      chip.className = 'tut-keycap';
      chip.textContent = cap;
      this.promptChipEl.appendChild(chip);
    }
    this.promptChipEl.style.display = caps.length > 0 ? '' : 'none';
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

/** Class-toggle sweep for the press-this-next glow (same-state no-ops). */
function syncGlow(selector: string, want: (el: HTMLElement) => boolean): void {
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    el.classList.toggle('qd-coach', want(el));
  }
}

/** Shortest signed angular distance, for the camera lesson's travel tally. */
function wrapAngle(a: number): number {
  let r = a % (Math.PI * 2);
  if (r > Math.PI) r -= Math.PI * 2;
  if (r < -Math.PI) r += Math.PI * 2;
  return r;
}
