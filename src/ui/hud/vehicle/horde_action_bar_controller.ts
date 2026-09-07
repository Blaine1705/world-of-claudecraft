import { hordeControlsActive, requestHordeExit } from '../../../game/horde_controls';
import { sfx } from '../../../game/sfx';
import { HORDE_QUEST_ID, HORDE_SITE } from '../../../sim/content/world_quest_horde';
import { groundHeight } from '../../../sim/world';
import type { IWorld } from '../../../world_api';
import { formatNumber, t } from '../../i18n';
import type { PainterHostWriters } from '../../painter_host';
import { hordeUpgradeText } from '../../world_quest_horde_view';

export type HordeHudWorld = Pick<IWorld, 'worldQuestLog' | 'cfg' | 'player'>;
export interface HordeProjection {
  worldToScreen(x: number, y: number, z: number): { x: number; y: number; behind: boolean };
}

/** Alternate action chrome shares the existing vehicle HUD update and writers. */
export class HordeActionBarController {
  private readonly root = document.createElement('div');
  private readonly exit = document.createElement('button');
  private readonly feedback = document.createElement('div');
  private readonly kills = document.createElement('div');
  private readonly labels = [document.createElement('div'), document.createElement('div')];
  private active = false;
  private feedbackKey = '';
  private lastKills = 0;
  private killTick = 0;
  private lastSoundShot = 0;
  private lastSoundTick = -100;

  constructor(
    private readonly world: HordeHudWorld,
    private readonly writers: PainterHostWriters,
    private readonly projection: HordeProjection | undefined,
    private readonly cancelOnEnter: readonly { cancel(): void }[],
  ) {
    this.root.className = 'horde-controls';
    this.exit.className = 'horde-exit';
    this.exit.type = 'button';
    this.feedback.className = 'horde-upgrade-feedback';
    this.kills.className = 'horde-kill-feedback';
    writers.setAttr(this.feedback, 'role', 'status');
    this.exit.addEventListener('click', () => requestHordeExit(world));
    for (const label of this.labels) {
      label.className = 'horde-crate-label';
      this.root.append(label);
    }
    this.root.append(this.exit, this.feedback, this.kills);
    writers.setDisplay(this.root, 'none');
    document.getElementById('ui')?.append(this.root);
    for (const key of ['ui_coin', 'melee_bow', 'impact_bone']) sfx.preload(key);
  }

  update(): void {
    const active = hordeControlsActive(this.world);
    const w = this.writers;
    if (active !== this.active) {
      this.active = active;
      w.toggleClass(document.body, 'playing-horde', active);
      w.setDisplay(this.root, active ? 'block' : 'none');
      this.feedbackKey = '';
      this.lastKills = 0;
      this.killTick = 0;
      this.lastSoundShot = 0;
      this.lastSoundTick = -100;
      if (active) for (const controller of this.cancelOnEnter) controller.cancel();
    }
    if (!active) return;
    const state = this.world.worldQuestLog.get(HORDE_QUEST_ID)?.horde;
    if (!state) return;
    const newestShot = state.shots[state.shots.length - 1]?.id ?? 0;
    if (newestShot > this.lastSoundShot && state.tick - this.lastSoundTick >= 3) {
      sfx.playUi('melee_bow', { gain: 0.16 });
      this.lastSoundTick = state.tick;
    }
    this.lastSoundShot = Math.max(newestShot, this.lastSoundShot);
    if (state.kills > this.lastKills && state.tick - this.killTick >= 16) {
      w.setText(
        this.kills,
        t('questUi.worldQuest.horde.killBurst', {
          count: formatNumber(state.kills - this.lastKills),
        }),
      );
      this.lastKills = state.kills;
      this.killTick = state.tick;
      sfx.playUi('impact_bone', { gain: 0.2 });
    }
    w.setStyleProp(
      this.kills,
      'display',
      this.lastKills > 0 && state.tick - this.killTick < 16 ? 'block' : 'none',
    );
    const player = this.world.player.pos;
    const killPoint = this.projection?.worldToScreen(player.x, player.y + 1, player.z + 9);
    if (killPoint)
      w.setStyleProp(
        this.kills,
        'transform',
        `translate(${Math.round(killPoint.x)}px, ${Math.round(killPoint.y)}px) translate(-50%, -100%)`,
      );
    w.setText(this.exit, t('questUi.worldQuest.horde.exit'));
    let index = 0;
    for (const unit of state.units) {
      if (unit.kind !== 'crate' || !unit.reward || index >= this.labels.length) continue;
      const label = this.labels[index++];
      const x = HORDE_SITE.x + unit.x;
      const z = HORDE_SITE.z + unit.z;
      const point = this.projection?.worldToScreen(
        x,
        groundHeight(x, z, this.world.cfg.seed) + 2.4,
        z,
      );
      w.setStyleProp(label, 'display', point && !point.behind ? 'block' : 'none');
      w.setText(label, hordeUpgradeText(unit.reward));
      if (point)
        w.setStyleProp(
          label,
          'transform',
          `translate(${Math.round(point.x)}px, ${Math.round(point.y)}px) translate(${unit.x > 0 ? '-100%' : '0'}, -100%)`,
        );
    }
    for (; index < this.labels.length; index++)
      w.setStyleProp(this.labels[index], 'display', 'none');
    const upgrade = state.lastUpgrade;
    const visible = !!upgrade && state.tick - upgrade.tick < 45;
    w.setStyleProp(this.feedback, 'display', visible ? 'block' : 'none');
    if (!upgrade || !visible) return;
    const key = `${state.seed}:${upgrade.tick}:${upgrade.kind}`;
    if (key !== this.feedbackKey) {
      this.feedbackKey = key;
      w.setText(
        this.feedback,
        t('questUi.worldQuest.horde.gained', { upgrade: hordeUpgradeText(upgrade.kind) }),
      );
      sfx.playUi('ui_coin', { gain: 0.55 });
    }
    const p = this.world.player.pos;
    const point = this.projection?.worldToScreen(p.x, p.y + 4, p.z + 2);
    if (point)
      w.setStyleProp(
        this.feedback,
        'transform',
        `translate(${Math.round(point.x)}px, ${Math.round(point.y)}px) translate(-50%, -100%)`,
      );
  }
}
