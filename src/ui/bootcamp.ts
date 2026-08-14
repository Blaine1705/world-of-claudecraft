// The Proving Shore movement bootcamp overlay: the island sibling of the
// Eastbrook new-adventurer coachmark (tutorial.ts), sharing its card CSS
// family and its whole shape. Shows while Warden Tam's q_ps_the_gauntlet is
// ACTIVE in the quest log and walks the runner through the lanes in their
// running order (forward, camera, strafe left, camera, forward; the ladder
// lives in bootcamp_view.ts) with copy in the player's live input family
// (keyboard, touch, or gamepad; src/game/input_hint_mode.ts), the physical
// keycaps as on-screen chips, and the guidance arrow on the current lane's
// flag.
//
// The flag tally is the QUEST'S OWN objective count (the sim credits one
// count per flag passed in order, tutorial/gauntlet_run.ts), so the card,
// the quest tracker, and the server can never disagree about a tag, and
// progress survives reloads with the character rather than the device. The
// card folds away when the run is handed in (quest done) or the player
// leaves the island; only the camera lessons live client-side, since the
// sim has no camera. Reads world state, writes none, and runs identically
// against the offline Sim and the online ClientWorld.

import { currentInputHintMode, type InputHintMode } from '../game/input_hint_mode';
import type { Keybinds } from '../game/keybinds';
import type { Renderer } from '../render/renderer';
import { BOOTCAMP_COURSE_CHECKPOINTS } from '../sim/content/proving_shore';
import { GAUNTLET_QUEST_ID } from '../sim/tutorial/gauntlet_run';
import { groundHeight, WATER_LEVEL } from '../sim/world';
import { WORLD_SEED } from '../sim/world_seed';
import type { IWorld } from '../world_api';
import {
  BOOTCAMP_STEP_ORDER,
  type BootcampParam,
  type BootcampStep,
  bootcampArrowTarget,
  bootcampBodyPlan,
  bootcampKeycaps,
  bootcampNeedsRerender,
  bootcampTitleKey,
  computeBootcampStep,
} from './bootcamp_view';
import { formatNumber, t } from './i18n';

// The closing card lingers, then dismisses itself (the tutorial.ts pattern);
// shorter than Eastbrook's because there is no tip list under it.
const DONE_LINGER_MS = 10000;
// The island column: the card never shows east of the strait.
const ISLAND_MAX_X = -180;

export class BootcampOverlay {
  // Session-only dismissal: the skip button folds the card away until the
  // quest is abandoned and re-accepted (a fresh log entry re-engages).
  private dismissed = false;
  private engaged = false;
  private step: BootcampStep | null = null;
  private doneSince = 0;
  private lastMode: InputHintMode = 'keyboard';

  // The camera lessons' progress (client-side; the sim has no camera).
  private lastYaw = 0;
  private yawSinceFlag = 0;
  private lastCounts = 0;

  private root: HTMLElement | null = null;
  private titleEl!: HTMLElement;
  private stepEl!: HTMLElement;
  private bodyEl!: HTMLElement;
  private keysEl!: HTMLElement;
  private progressEl!: HTMLElement;
  private skipBtn!: HTMLButtonElement;
  private arrow: HTMLElement | null = null;

  // Called every HUD frame. Cheap no-op while the run's quest is not active.
  update(world: IWorld, renderer: Renderer, keybinds: Keybinds): void {
    const p = world.player;
    if (!p) return;
    if (world.playerId < 0 || p.id !== world.playerId) return;

    const questActive = world.questLog.get(GAUNTLET_QUEST_ID)?.state === 'active';
    const onIsland = (p.pos?.x ?? 0) < ISLAND_MAX_X;
    if (!this.engaged) {
      if (!questActive || !onIsland || this.dismissed) {
        // A fresh log entry after an abandon clears a session dismissal.
        if (!questActive) this.dismissed = false;
        return;
      }
      this.engaged = true;
      this.lastYaw = renderer.camYaw;
      this.yawSinceFlag = 0;
      this.lastCounts = questCounts(world);
    } else if (!onIsland || !questActive) {
      // Handed in (or abandoned, or ferried away): fold the card away. A
      // later re-accept starts the lessons fresh.
      this.disengage();
      return;
    }

    // The flag tally is the quest objective's own count, credited sim-side
    // in running order; the yaw accumulator resets at each new tag so every
    // camera lesson asks for its own fresh swing.
    const counts = questCounts(world);
    if (counts !== this.lastCounts) {
      this.lastCounts = counts;
      this.yawSinceFlag = 0;
    }

    const yaw = renderer.camYaw;
    let dYaw = yaw - this.lastYaw;
    if (dYaw > Math.PI) dYaw -= 2 * Math.PI;
    if (dYaw < -Math.PI) dYaw += 2 * Math.PI;
    this.yawSinceFlag += Math.abs(dYaw);
    this.lastYaw = yaw;

    const mode = currentInputHintMode();
    const next = computeBootcampStep({
      checkpointsReached: counts,
      yawTurnedSinceFlagRad: this.yawSinceFlag,
    });

    if (bootcampNeedsRerender(this.step, next, this.lastMode, mode)) {
      this.step = next;
      if (next === 'done' && this.doneSince === 0) this.doneSince = performance.now();
      this.renderPanel(keybinds);
    }

    if (this.step === 'done') {
      // The done card asks for the walk back to Warden Tam; it lingers, then
      // trusts the quest tracker (the turn-in itself disengages above).
      if (performance.now() - this.doneSince >= DONE_LINGER_MS) this.disengage();
      this.hideArrow();
      return;
    }

    this.updateArrow(renderer);
  }

  /** Re-localize after an in-game language switch (the Hud's woc:languagechange
   *  fan-out). Self-gated on a card being up, the tutorial.ts precedent. */
  relocalize(_world: IWorld, keybinds: Keybinds): void {
    if (!this.engaged || this.step === null) return;
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
    const target = bootcampArrowTarget(this.step!, this.lastCounts);
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

  /** Fold the card away for now; the quest log decides any re-engage. */
  private disengage(): void {
    this.engaged = false;
    this.step = null;
    this.doneSince = 0;
    this.root?.remove();
    this.arrow?.remove();
    this.root = null;
    this.arrow = null;
  }

  private finish(): void {
    this.dismissed = true;
    this.disengage();
  }
}

/** The quest objective's own flag tally (0 when the quest is not active). */
function questCounts(world: IWorld): number {
  return world.questLog.get(GAUNTLET_QUEST_ID)?.counts?.[0] ?? 0;
}
