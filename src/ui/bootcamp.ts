// The Proving Shore movement bootcamp overlay: the island sibling of the
// Eastbrook new-adventurer coachmark (tutorial.ts), sharing its card CSS
// family and its whole shape. From the moment a fresh arrival lands (Warden
// Tam's run quest AVAILABLE) through the run itself (quest ACTIVE), the card
// walks them through the Gauntlet's ordered lessons: talk to Tam (press F),
// hold forward down lane 1, turn with the turn key and walk the south lane,
// swing the view with the mouse and strafe the last lane, then hand the run
// to Overseer Pell at the finish. Copy follows the player's live input
// family (keyboard, touch, or gamepad; src/game/input_hint_mode.ts), the
// physical keycaps show as on-screen chips, and the guidance arrow leads to
// Tam, the current lane's flag, or Pell.
//
// The flag tally is the QUEST'S OWN objective count (the sim credits one
// count per flag passed in order, tutorial/gauntlet_run.ts), so the card,
// the quest tracker, and the server can never disagree about a tag, and
// progress survives reloads with the character rather than the device. The
// card folds away when the run is handed in (quest done) or the player
// leaves the island. Reads world state, writes none, and runs identically
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
  // run quest's log state changes again.
  private dismissed = false;
  private engaged = false;
  private step: BootcampStep | null = null;
  private doneSince = 0;
  private lastMode: InputHintMode = 'keyboard';
  private lastCounts = 0;

  private root: HTMLElement | null = null;
  private titleEl!: HTMLElement;
  private stepEl!: HTMLElement;
  private bodyEl!: HTMLElement;
  private keysEl!: HTMLElement;
  private progressEl!: HTMLElement;
  private skipBtn!: HTMLButtonElement;
  private arrow: HTMLElement | null = null;

  // Called every HUD frame. Cheap no-op while the run is neither offered nor
  // underway.
  update(world: IWorld, renderer: Renderer, keybinds: Keybinds): void {
    const p = world.player;
    if (!p) return;
    if (world.playerId < 0 || p.id !== world.playerId) return;

    const questState = world.questState(GAUNTLET_QUEST_ID);
    const questActive = world.questLog.get(GAUNTLET_QUEST_ID)?.state === 'active';
    const engageable = questActive || questState === 'available';
    const onIsland = (p.pos?.x ?? 0) < ISLAND_MAX_X;
    if (!this.engaged) {
      if (!engageable || !onIsland || this.dismissed) {
        // A state change after a dismissal re-arms the card (accepting the
        // quest after skipping the talk card, or abandoning and retaking).
        if (!engageable) this.dismissed = false;
        return;
      }
      this.engaged = true;
      this.lastCounts = questCounts(world);
    } else if (!onIsland || (!engageable && questState !== 'ready')) {
      // Handed in (or ferried away mid-lesson): fold the card away. A later
      // island visit with the quest offered again starts fresh.
      this.disengage();
      return;
    }

    this.lastCounts = questCounts(world);
    const mode = currentInputHintMode();
    const next = computeBootcampStep({
      questActive: questActive || questState === 'ready',
      checkpointsReached: this.lastCounts,
    });

    if (bootcampNeedsRerender(this.step, next, this.lastMode, mode)) {
      this.step = next;
      if (next === 'done' && this.doneSince === 0) this.doneSince = performance.now();
      this.renderPanel(keybinds);
    }

    if (this.step === 'done') {
      // The done card asks for the hand-in at Overseer Pell beside the red
      // flag; it lingers, then trusts the quest tracker (the turn-in itself
      // disengages above).
      if (performance.now() - this.doneSince >= DONE_LINGER_MS) this.disengage();
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

    this.keysEl.replaceChildren();
    for (const cap of bootcampKeycaps(this.step!, mode, labels)) {
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

    if (this.step !== 'done' && this.step !== 'talk') {
      this.progressEl.textContent = this.courseProgress();
      this.progressEl.style.display = '';
    } else {
      this.progressEl.style.display = 'none';
    }

    this.skipBtn.textContent =
      this.step === 'done' ? t('hud.tutorial.dismiss') : t('hud.tutorial.skip');
    this.root.classList.toggle('tut-done', this.step === 'done');
  }

  // Points the shared course arrow at the current lesson's target.
  private updateArrow(renderer: Renderer): void {
    if (!this.arrow) return;
    const target = bootcampArrowTarget(this.step!, this.lastCounts);
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
