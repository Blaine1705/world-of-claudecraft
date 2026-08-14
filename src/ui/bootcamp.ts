// The Proving Shore movement bootcamp overlay: the island sibling of the
// Eastbrook new-adventurer coachmark (tutorial.ts), sharing its card CSS
// family and its whole shape. Engages once for a fresh character standing on
// the tutorial island and walks them through Warden Tam's Gauntlet in its
// running order (forward, camera, strafe left, camera, forward; the ladder
// lives in bootcamp_view.ts) with copy in the player's live input family
// (keyboard, touch, or gamepad; src/game/input_hint_mode.ts), the physical
// keycaps as on-screen chips, and the guidance arrow on the current lane's
// flag.
//
// Detection observes the world, the camera, and (keyboard mode only) the
// held-movement probe the host wires in: a lane's flag only credits once its
// button was actually seen held during that lesson, so the buttons really
// are pressed in order. Touch and pad players are gated by the ladder alone:
// their movement is one stick, and stalling them on a flag they are standing
// beside would teach nothing. It never writes sim state and runs identically
// against the offline Sim and the online ClientWorld. Completion is
// remembered per device in localStorage, the coachmark family's precedent.
// The two overlays can never fight for the corner: this one only engages
// west of the strait (x < -180), exactly where isFreshCharacter (tutorial.ts)
// refuses to.

import { currentInputHintMode, type InputHintMode } from '../game/input_hint_mode';
import type { Keybinds } from '../game/keybinds';
import type { Renderer } from '../render/renderer';
import { BOOTCAMP_COURSE_CHECKPOINTS } from '../sim/content/proving_shore';
import { groundHeight, WATER_LEVEL } from '../sim/world';
import { WORLD_SEED } from '../sim/world_seed';
import type { IWorld } from '../world_api';
import {
  advanceCheckpoints,
  BOOTCAMP_STEP_ORDER,
  type BootcampParam,
  type BootcampStep,
  bootcampArrowTarget,
  bootcampBodyPlan,
  bootcampKeycaps,
  bootcampNeedsRerender,
  bootcampTitleKey,
  computeBootcampStep,
  stepMovementAction,
} from './bootcamp_view';
import { formatNumber, t } from './i18n';

/** The held-movement flags the host may wire in (main.ts reads them off the
 *  live Input); null when unwired, which degrades to ladder-only gating. */
export interface BootcampHeldMovement {
  forward: boolean;
  strafeLeft: boolean;
}

const STORAGE_KEY = 'woc.psbootcamp.v1';
// The closing card lingers, then dismisses itself (the tutorial.ts pattern);
// shorter than Eastbrook's because there is no tip list under it.
const DONE_LINGER_MS = 10000;
// The island column: engage west of the strait, disengage (without writing
// the done flag) the moment the player ferries back east of it.
const ISLAND_MAX_X = -180;

export class BootcampOverlay {
  private completed: boolean;
  private engaged = false;
  private step: BootcampStep | null = null;
  private doneSince = 0;
  private lastMode: InputHintMode = 'keyboard';

  // Lesson progress, all observed (see the pure core for the thresholds).
  private lastYaw = 0;
  private yawSinceFlag = 0;
  private checkpointsReached = 0;
  // Keyboard-mode order proof: the current lane's button, seen held at least
  // once during this lesson. Reset whenever a flag is tagged.
  private legKeySeen = false;

  private root: HTMLElement | null = null;
  private titleEl!: HTMLElement;
  private stepEl!: HTMLElement;
  private bodyEl!: HTMLElement;
  private keysEl!: HTMLElement;
  private progressEl!: HTMLElement;
  private skipBtn!: HTMLButtonElement;
  private arrow: HTMLElement | null = null;

  constructor() {
    this.completed = readDone();
  }

  // Called every HUD frame. Cheap no-op once completed or while off-island.
  update(
    world: IWorld,
    renderer: Renderer,
    keybinds: Keybinds,
    held: BootcampHeldMovement | null,
  ): void {
    if (this.completed) return;
    const p = world.player;
    if (!p) return;
    if (world.playerId < 0 || p.id !== world.playerId) return;

    const onIsland = (p.pos?.x ?? 0) < ISLAND_MAX_X;
    if (!this.engaged) {
      // A genuinely new pair of hands: the island's own level band (a
      // graduate leaves at the same level they arrived, so level 1-2 IS the
      // island's whole population), standing on the island.
      if (!onIsland || p.level > 2) return;
      this.engaged = true;
      this.lastYaw = renderer.camYaw;
      this.yawSinceFlag = 0;
      this.checkpointsReached = 0;
      this.legKeySeen = false;
    } else if (!onIsland) {
      // Ferried back mid-lesson: fold the card away without writing the done
      // flag, so the next island visit starts the lessons fresh.
      this.engaged = false;
      this.step = null;
      this.root?.remove();
      this.arrow?.remove();
      this.root = null;
      this.arrow = null;
      return;
    }

    // Camera-yaw travel accumulates across frames (|delta| summed, wrapped to
    // the short way around), and resets at every flag so each camera lesson
    // asks for its own fresh swing.
    const yaw = renderer.camYaw;
    let dYaw = yaw - this.lastYaw;
    if (dYaw > Math.PI) dYaw -= 2 * Math.PI;
    if (dYaw < -Math.PI) dYaw += 2 * Math.PI;
    this.yawSinceFlag += Math.abs(dYaw);
    this.lastYaw = yaw;

    const mode = currentInputHintMode();
    const current = computeBootcampStep({
      checkpointsReached: this.checkpointsReached,
      yawTurnedSinceFlagRad: this.yawSinceFlag,
    });
    const action = stepMovementAction(current);
    if (action && held?.[action]) this.legKeySeen = true;
    // A lane's flag credits only during its own lesson (the camera lessons
    // in between are mandatory), and keyboard mode further requires the
    // lane's button to have actually been held.
    const creditAllowed =
      action !== null && (mode !== 'keyboard' || held === null || this.legKeySeen);
    const advanced = advanceCheckpoints(this.checkpointsReached, p.pos, creditAllowed);
    if (advanced !== this.checkpointsReached) {
      this.checkpointsReached = advanced;
      this.yawSinceFlag = 0;
      this.legKeySeen = false;
    }

    const next = computeBootcampStep({
      checkpointsReached: this.checkpointsReached,
      yawTurnedSinceFlagRad: this.yawSinceFlag,
    });

    if (bootcampNeedsRerender(this.step, next, this.lastMode, mode)) {
      this.step = next;
      if (next === 'done' && this.doneSince === 0) this.doneSince = performance.now();
      this.renderPanel(keybinds);
    }

    if (this.step === 'done') {
      if (performance.now() - this.doneSince >= DONE_LINGER_MS) this.finish();
      this.hideArrow();
      return;
    }

    this.updateArrow(renderer);
  }

  /** Re-localize after an in-game language switch (the Hud's woc:languagechange
   *  fan-out). Self-gated on a card being up, the tutorial.ts precedent. */
  relocalize(_world: IWorld, keybinds: Keybinds): void {
    if (this.completed || !this.engaged || this.step === null) return;
    this.renderPanel(keybinds);
  }

  // ---- internals --------------------------------------------------------

  private courseProgress(): string {
    return t('hudChrome.bootcamp.courseProgress', {
      current: formatNumber(
        Math.min(this.checkpointsReached + 1, BOOTCAMP_COURSE_CHECKPOINTS.length),
      ),
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

    this.skipBtn = document.createElement('button');
    this.skipBtn.className = 'tut-skip';
    this.skipBtn.type = 'button';
    this.skipBtn.addEventListener('click', () => this.finish());

    root.append(header, this.bodyEl, this.keysEl, this.progressEl, this.skipBtn);
    ui.appendChild(root);
    this.root = root;

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

    const mode = currentInputHintMode();
    this.lastMode = mode;

    const forwardKey = keybinds.primaryLabel('forward') || t('hud.options.unbound');
    const strafeKey = keybinds.primaryLabel('strafeLeft') || t('hud.options.unbound');
    const allParams: Record<BootcampParam, string> = { forwardKey, strafeKey };

    const plan = bootcampBodyPlan(this.step!, mode);
    const params: Partial<Record<BootcampParam, string>> = {};
    for (const key of plan.params) params[key] = allParams[key];

    this.titleEl.textContent = t(bootcampTitleKey(this.step!));
    this.bodyEl.textContent = t(plan.bodyKey, params);

    this.keysEl.replaceChildren();
    for (const cap of bootcampKeycaps(this.step!, mode, { forwardKey, strafeKey })) {
      const chip = document.createElement('span');
      chip.className = 'tut-keycap';
      chip.textContent = cap;
      this.keysEl.appendChild(chip);
    }
    this.keysEl.style.display = this.keysEl.childElementCount > 0 ? '' : 'none';

    const idx = BOOTCAMP_STEP_ORDER.indexOf(this.step!);
    this.stepEl.textContent =
      idx >= 0
        ? t('hud.tutorial.stepLabel', {
            current: formatNumber(idx + 1),
            total: formatNumber(BOOTCAMP_STEP_ORDER.length),
          })
        : '';

    if (this.step !== 'done') {
      this.progressEl.textContent = this.courseProgress();
      this.progressEl.style.display = '';
    } else {
      this.progressEl.style.display = 'none';
    }

    this.skipBtn.textContent =
      this.step === 'done' ? t('hud.tutorial.dismiss') : t('hud.tutorial.skip');
    this.root.classList.toggle('tut-done', this.step === 'done');
  }

  // Points the shared course arrow at the current lane's flag.
  private updateArrow(renderer: Renderer): void {
    if (!this.arrow) return;
    const target = bootcampArrowTarget(this.step!, this.checkpointsReached);
    if (!target) {
      this.hideArrow();
      return;
    }

    // Flags are authored on dry ground; the max() is defensive for edited
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

  private finish(): void {
    this.completed = true;
    this.engaged = false;
    writeDone();
    this.root?.remove();
    this.arrow?.remove();
    this.root = null;
    this.arrow = null;
  }
}

function readDone(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'done';
  } catch {
    return false;
  }
}
function writeDone(): void {
  try {
    localStorage.setItem(STORAGE_KEY, 'done');
  } catch {
    /* private mode */
  }
}
