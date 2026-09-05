import { sfx } from '../../../game/sfx';
import { CANNON_TACTICS } from '../../../sim/content/cannon_encounter';
import { TICK_RATE } from '../../../sim/types';
import type { IWorldVehicles } from '../../../world_api/vehicles';
import { esc } from '../../esc';
import { formatNumber, t } from '../../i18n';
import { iconDataUrl } from '../../icons';
import type { PainterHostWriters } from '../../painter_host';
import { ActionBarPainter, type ActionBarSlotElements } from '../action_bar/action_bar_painter';
import { CannonFeedbackCursor } from './cannon_feedback_core';
import { cannonTacticsHint } from './cannon_tactics_view';
import { createVehicleActionBarView } from './vehicle_action_bar_view';
import { vehicleActionTooltip } from './vehicle_action_tooltip';
import { VEHICLE_ACTION_SLOTS, VehicleAimCore } from './vehicle_aim_core';

interface VehicleBarDeps {
  world: IWorldVehicles;
  writers: PainterHostWriters;
  keyLabel(slot: number): string;
  consumePeek(): boolean;
  clearReticle?(): void;
  presentation?: { setGroundAimReticle(value: null): void; addShake(amount: number): void };
  attachTooltip(element: HTMLElement, html: () => string): void;
  cancelOnEnter: readonly { cancel(): void }[];
}

export class VehicleActionBarController {
  readonly aim: VehicleAimCore;
  private readonly root = document.createElement('section');
  private readonly title = document.createElement('div');
  private readonly status = document.createElement('div');
  private readonly gauge = document.createElement('div');
  private readonly fill = document.createElement('div');
  private readonly integrity = document.createElement('span');
  private readonly hint = document.createElement('div');
  private readonly exit = document.createElement('button');
  private readonly shake = document.createElement('input');
  private readonly shakeText = document.createElement('span');
  private readonly feedback = new CannonFeedbackCursor();
  private readonly view = createVehicleActionBarView();
  private readonly painter: ActionBarPainter;
  private mounted = false;

  constructor(private readonly deps: VehicleBarDeps) {
    this.aim = new VehicleAimCore(deps.world, () => {
      deps.clearReticle?.();
      deps.presentation?.setGroundAimReticle(null);
    });
    this.root.className = 'vehicle-bar';
    this.root.id = 'vehicle-action-bar';
    this.title.className = 'vehicle-bar-title';
    this.status.className = 'vehicle-bar-status';
    this.gauge.className = 'vehicle-integrity';
    this.fill.className = 'vehicle-integrity-fill';
    this.integrity.className = 'vehicle-integrity-text';
    this.hint.className = 'vehicle-bar-hint';
    this.exit.className = 'vehicle-exit';
    this.exit.type = 'button';
    this.shake.type = 'checkbox';
    const comfort = document.createElement('label');
    comfort.className = 'vehicle-comfort';
    comfort.append(this.shake, this.shakeText);
    deps.writers.setAttr(this.status, 'role', 'status');
    this.gauge.tabIndex = 0;
    deps.attachTooltip(this.gauge, () =>
      esc(
        t('hudChrome.vehicle.medalRules', {
          goldIntegrity: formatNumber(CANNON_TACTICS.goldIntegrity / 100, { style: 'percent' }),
          goldAccuracy: formatNumber(CANNON_TACTICS.goldAccuracy, { style: 'percent' }),
          silverIntegrity: formatNumber(CANNON_TACTICS.silverIntegrity / 100, { style: 'percent' }),
          silverAccuracy: formatNumber(CANNON_TACTICS.silverAccuracy, { style: 'percent' }),
        }),
      ),
    );
    for (const key of ['meteor', 'impact_metal', 'flamestrike']) sfx.preload(key);
    this.exit.addEventListener('click', () => deps.world.leaveVehicle());
    const bar = document.createElement('div');
    bar.className = 'vehicle-action-slots';
    const slots: ActionBarSlotElements[] = VEHICLE_ACTION_SLOTS.map((_, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'action-btn vehicle-action';
      const label = document.createElement('span');
      const countEl = document.createElement('span');
      const keybindEl = document.createElement('span');
      const cdOverlay = document.createElement('span');
      const cdText = document.createElement('span');
      const rechargeOverlay = document.createElement('span');
      label.className = 'icon-label';
      keybindEl.className = 'keybind';
      cdOverlay.className = 'cd-overlay';
      cdText.className = 'cdtext';
      rechargeOverlay.className = 'recharge-overlay';
      btn.append(label, countEl, keybindEl, cdOverlay, cdText, rechargeOverlay);
      btn.addEventListener('click', () => {
        if (!deps.consumePeek()) this.chooseSlot(index);
      });
      deps.attachTooltip(btn, () => vehicleActionTooltip(VEHICLE_ACTION_SLOTS[index]));
      bar.append(btn);
      return { btn, label, countEl, keybindEl, cdOverlay, cdText, rechargeOverlay };
    });
    this.gauge.append(this.fill, this.integrity);
    this.root.append(this.title, this.status, this.gauge, bar, this.exit, this.hint, comfort);
    this.painter = new ActionBarPainter(
      deps.writers,
      { container: bar, slots },
      (key) => `url(${iconDataUrl('ability', key, 56)})`,
    );
    deps.writers.setDisplay(this.root, 'none');
    document.getElementById('ui')?.append(this.root);
  }

  chooseSlot(slot: number): void {
    const action = VEHICLE_ACTION_SLOTS[slot];
    if (action) this.aim.begin(action, slot);
  }

  update(): void {
    const session = this.deps.world.vehicleSession;
    const writers = this.deps.writers;
    const cues = this.feedback.consume(session);
    let shot = false,
      explosion = false,
      impact = false;
    for (const cue of cues) {
      if (cue.kind === 'shot') shot = true;
      if (cue.kind === 'barrel') explosion = true;
      if (cue.kind === 'armor' || cue.kind === 'impact') impact = true;
    }
    if (shot) sfx.playUi('meteor', { gain: 0.5 });
    if (explosion) sfx.playUi('flamestrike', { gain: 0.5 });
    if (impact) sfx.playUi('impact_metal', { gain: 0.5 });
    if (this.shake.checked && (shot || explosion))
      this.deps.presentation?.addShake(explosion ? 0.12 : 0.06);
    if (!!session !== this.mounted) {
      this.mounted = !!session;
      this.aim.cancel();
      if (session) for (const controller of this.deps.cancelOnEnter) controller.cancel();
      writers.toggleClass(document.body, 'operating-vehicle', !!session);
      writers.setDisplay(this.root, session ? 'grid' : 'none');
    }
    if (!session) return;
    const encounter = session.encounter;
    writers.setText(this.shakeText, t('hudChrome.vehicle.shake'));
    writers.setText(this.title, t('hudChrome.vehicle.title'));
    writers.setText(this.exit, t('hudChrome.vehicle.exit'));
    writers.setAttr(this.gauge, 'role', 'meter');
    writers.setAttr(this.gauge, 'aria-label', t('hudChrome.vehicle.integrity'));
    writers.setAttr(this.gauge, 'aria-valuemin', '0');
    writers.setAttr(this.gauge, 'aria-valuemax', '100');
    writers.setAttr(this.gauge, 'aria-valuenow', String(encounter.integrity));
    writers.setStyleProp(this.fill, '--vehicle-integrity', String(encounter.integrity / 100));
    writers.toggleClass(this.gauge, 'low-integrity', encounter.integrity < 25);
    writers.setText(this.integrity, formatNumber(encounter.integrity / 100, { style: 'percent' }));
    writers.setText(
      this.status,
      encounter.phase === 'wave'
        ? t('hudChrome.vehicle.wave', {
            wave: formatNumber(encounter.wave + 1),
            total: formatNumber(3),
          })
        : t('hudChrome.vehicle.countdown', {
            seconds: formatNumber(
              Math.ceil((encounter.phaseUntilTick - encounter.tick) / TICK_RATE),
            ),
          }),
    );
    writers.setText(
      this.hint,
      this.aim.isActive() ? t('hudChrome.vehicle.aim') : cannonTacticsHint(encounter),
    );
    this.painter.paint(this.view.tick(session, this.aim.activeSlot(), this.deps.keyLabel));
  }
}
