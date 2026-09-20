import type { SimContext } from '../sim_context';
import { DT, type Entity } from '../types';
import { hoardTidePattern } from './hoard_tide_pattern';
import type { HoardBossCue, HoardBossState, RiftInstance } from './types';

/** The entire set is fixed at its first warning, including enrage and rarity. */
export function tickHoardTidePattern(
  ctx: SimContext,
  inst: RiftInstance,
  boss: Entity,
  state: HoardBossState,
  emitCue: (ctx: SimContext, inst: RiftInstance, cue: HoardBossCue) => void,
): void {
  if (state.sequenceStep === 0) {
    state.sweepTimer -= DT;
    if (state.sweepTimer > 0) return;
    state.tidePattern = hoardTidePattern(
      inst.seed ^ state.nextCueId,
      inst.vault?.rarity ?? 'common',
      boss.hp <= boss.maxHp * 0.3,
    );
  } else {
    state.sequenceTimer -= DT;
    if (state.sequenceTimer > 0) return;
  }
  const plan = state.tidePattern?.[state.sequenceStep];
  if (!plan) return;
  const cue: HoardBossCue = {
    id: state.nextCueId++,
    kind: 'sweep',
    variant: 'tide-wave',
    x: boss.spawnPos.x,
    z: boss.spawnPos.z,
    facing: plan.facing,
    halfAngle: 0,
    radius: plan.radius,
    waveGap: plan.gap,
    waveSpan: plan.span,
    waveLead: plan.lead,
    remaining: plan.total,
    total: plan.total,
    hitIds: new Set(),
  };
  state.sequenceStep++;
  state.cues.push(cue);
  emitCue(ctx, inst, cue);
  ctx.emit({
    type: 'spellfx',
    sourceId: boss.id,
    targetId: boss.id,
    school: 'frost',
    fx: 'windup',
    ability: 'Crashing Tide',
  });
}
