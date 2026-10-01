// The Rangewarden (src/sim/encounters/stormbrass_foundry/rangewarden.ts): the
// G20 trail salvo (a marked player who keeps moving is never hit, one who
// stands still is shelled, the shells land where the mark stood 1.5 s ago),
// the bunkers as cover, Proof Shot and Dented Plating, the Drill Drones,
// heroic Walking Barrage and Shrapnel, the reset and the Clean Range deed.

import { describe, expect, it } from 'vitest';
import { RANGE_BUNKERS } from '../src/sim/content/stormbrass_foundry_layout';
import {
  ARC_DRONE_ID,
  bunkerLeeAt,
  FOUNDRY_BUNKER_TEMPLATES,
  FOUNDRY_SHELL_MARK,
  FOUNDRY_SHRAPNEL,
  RANGE_DENTED,
  RANGE_PROOF_SHOT,
  RANGE_TARGET_LOCK,
  RANGEWARDEN_DEED,
  RANGEWARDEN_ID,
  RANGE_TUNING as T,
  trailSpot,
} from '../src/sim/encounters/stormbrass_foundry';
import { rangeState, startTargetLock } from '../src/sim/encounters/stormbrass_foundry/rangewarden';
import { DT, type Entity, type RangewardenFightState } from '../src/sim/types';
import {
  aura,
  boss,
  earned,
  engage,
  type Fight,
  fight,
  hitsOn,
  live,
  local,
  objects,
  put,
  run,
  wipe,
} from './helpers/foundry_fight';

const HOME = { x: -82, z: 0 };

function rangeFight(difficulty: 'normal' | 'heroic' = 'normal'): { f: Fight; b: Entity } {
  const f = fight(difficulty);
  const b = boss(f, RANGEWARDEN_ID);
  put(f, b, HOME.x, HOME.z);
  put(f, f.tank, HOME.x, HOME.z - 2);
  put(f, f.others[0], -60, -15);
  put(f, f.others[1], -104, 8);
  put(f, f.others[2], -60, 8);
  engage(f, b);
  return { f, b };
}

function state(b: Entity): RangewardenFightState {
  const st = b.foundryFight;
  if (st?.kind !== 'rangewarden') throw new Error('no rangewarden state');
  return st;
}

function marked(f: Fight): Entity[] {
  return [f.tank, ...f.others].filter((p) => aura(p, RANGE_TARGET_LOCK));
}

describe('the Rangewarden: the trail salvo (G20)', () => {
  it('reads the shell spot 1.5 s back down the trail', () => {
    const trail = Array.from({ length: 40 }, (_, i) => ({ x: i, z: 0 }));
    expect(trailSpot(trail).x).toBe(39 - Math.round(T.shellLag / DT));
    // A fresh mark has only its start: the shells open on it.
    expect(trailSpot([{ x: 5, z: 6 }])).toEqual({ x: 5, z: 6 });
  });

  it('marks two non-tank players at 8 s for 8 s', () => {
    const { f } = rangeFight();
    run(f, T.lockFirst + 0.1);
    const m = marked(f);
    expect(m).toHaveLength(T.lockCount);
    expect(m.some((p) => p.id === f.tank.id)).toBe(false);
    run(f, T.lockSeconds);
    expect(marked(f)).toHaveLength(0);
  });

  it('shells a mark who stands still, never one who keeps moving, and fires once a second', () => {
    const { f } = rangeFight();
    run(f, T.lockFirst + 0.1);
    const [still, runner] = marked(f);
    put(f, still, -60, -15);
    let angle = 0;
    const from = f.hits.length;
    let shellsSeen = 0;
    const seen = new Set<number>();
    run(f, T.lockSeconds + 1, () => {
      // The runner circles the range at 7 yd a second.
      angle += (7 * DT) / 14;
      put(f, runner, -82 + Math.sin(angle) * 14, -2 + Math.cos(angle) * 10);
      for (const o of objects(f, FOUNDRY_SHELL_MARK)) {
        if (seen.has(o.id)) continue;
        seen.add(o.id);
        shellsSeen++;
      }
    });
    const stillHits = hitsOn(f, still, 'Salvo', from);
    expect(stillHits.length).toBeGreaterThanOrEqual(T.lockSeconds - 1);
    for (const h of stillHits) {
      expect(h.amount).toBeGreaterThanOrEqual(T.shellMin);
      expect(h.amount).toBeLessThanOrEqual(T.shellMax);
    }
    expect(hitsOn(f, runner, 'Salvo', from)).toHaveLength(0);
    // Eight shells per mark, two marks.
    expect(shellsSeen).toBe(T.lockSeconds * T.lockCount);
  });

  it('drags the shells into a friend the runner leads them through', () => {
    const { f } = rangeFight();
    run(f, T.lockFirst + 0.1);
    const [mark, other] = marked(f);
    put(f, other, -70, 12);
    const friend = [f.tank, ...f.others].find((p) => p !== mark && p !== other && p !== f.tank);
    if (!friend) throw new Error('friend');
    put(f, friend, -80, -12);
    let t = 0;
    const from = f.hits.length;
    run(f, T.lockSeconds, () => {
      t += DT;
      // Back and forth across the friend's spot, every shell trailing in.
      const x = -80 + Math.sin(t * 2) * 3;
      put(f, mark, x, -12);
      put(f, other, -70 + t * 3, 12 - t);
    });
    expect(hitsOn(f, friend, 'Salvo', from).length).toBeGreaterThan(0);
  });

  it('a bunker takes three shells for its lee, then is blown open until the next lock', () => {
    expect(bunkerLeeAt(RANGE_BUNKERS, RANGE_BUNKERS[0].x + 2, RANGE_BUNKERS[0].z)).toBe(0);
    expect(bunkerLeeAt(RANGE_BUNKERS, RANGE_BUNKERS[0].x - 4, RANGE_BUNKERS[0].z)).toBe(-1);
    const { f, b } = rangeFight();
    run(f, T.lockFirst + 0.1);
    const [still, runner] = marked(f);
    const lee = { x: RANGE_BUNKERS[0].x + 2, z: RANGE_BUNKERS[0].z };
    const from = f.hits.length;
    run(f, T.lockSeconds + 1, () => {
      put(f, still, lee.x, lee.z);
      put(f, runner, -104 + (f.sim.ctx.time % 6), 10);
    });
    const hits = hitsOn(f, still, 'Salvo', from);
    // The first shell opens on the spot the mark was locked at (out in the
    // open); of the seven that follow into the lee, the wall swallows three.
    expect(hits).toHaveLength(T.lockSeconds - 1 - T.bunkerShells);
    expect(objects(f, FOUNDRY_BUNKER_TEMPLATES.breached)).toHaveLength(1);
    // The next Target Lock: the bunker stands sound again.
    startTargetLock(f.sim.ctx, f.inst, b, state(b));
    expect(objects(f, FOUNDRY_BUNKER_TEMPLATES.breached)).toHaveLength(0);
    expect(objects(f, FOUNDRY_BUNKER_TEMPLATES.sound)).toHaveLength(RANGE_BUNKERS.length);
  });
});

describe('the Rangewarden: Proof Shot and Drill Drones', () => {
  it('Proof Shot: a bar on the tank, a heavy hit, Dented Plating stacking to 3', () => {
    const { f, b } = rangeFight();
    run(f, T.proofFirst + 0.05);
    expect(b.castingAbility).toBe(RANGE_PROOF_SHOT);
    const from = f.hits.length;
    run(f, T.proofCast + 0.1);
    expect(hitsOn(f, f.tank, 'Proof Shot', from)).toHaveLength(1);
    expect(aura(f.tank, RANGE_DENTED)?.stacks).toBe(1);
    expect(aura(f.tank, RANGE_DENTED)?.value).toBeCloseTo(T.dentedPct, 6);
    expect(aura(f.tank, RANGE_DENTED)?.kind).toBe('expose');
    for (let i = 0; i < 3; i++) {
      state(b).proofTimer = 0.01;
      run(f, T.proofCast + 0.2);
    }
    expect(aura(f.tank, RANGE_DENTED)?.stacks).toBe(T.dentedMax);
    expect(aura(f.tank, RANGE_DENTED)?.value).toBeCloseTo(T.dentedPct * T.dentedMax, 6);
  });

  it('launches three Arc Drones at 66 and again at 33 percent', () => {
    const { f, b } = rangeFight();
    run(f, 0.2);
    b.hp = Math.floor(b.maxHp * 0.65);
    run(f, 0.1);
    expect(live(f, ARC_DRONE_ID)).toHaveLength(T.drillCount);
    run(f, 1);
    expect(live(f, ARC_DRONE_ID)).toHaveLength(T.drillCount);
    b.hp = Math.floor(b.maxHp * 0.32);
    run(f, 0.1);
    expect(live(f, ARC_DRONE_ID)).toHaveLength(T.drillCount * 2);
  });
});

describe('the Rangewarden: heroic', () => {
  it('Walking Barrage marks three, and every impact leaves shrapnel burning 40 a second', () => {
    const { f } = rangeFight('heroic');
    run(f, T.lockFirst + 0.1);
    expect(marked(f)).toHaveLength(T.heroicLockCount);
    const [still] = marked(f);
    put(f, still, -60, -15);
    run(f, 1 + T.shellWarning + 0.1);
    expect(objects(f, FOUNDRY_SHRAPNEL).length).toBeGreaterThan(0);
    const field = objects(f, FOUNDRY_SHRAPNEL)[0];
    expect(field.scale).toBe(T.shrapnelRadius);
    // A bystander walking into the shrapnel takes its sting.
    const walker = [f.tank, ...f.others].find((p) => !aura(p, RANGE_TARGET_LOCK));
    if (!walker) throw new Error('walker');
    const at = local(f, field);
    const from = f.hits.length;
    run(f, 2.1, () => put(f, walker, at.x + 1, at.z));
    const stings = hitsOn(f, walker, 'Shrapnel', from);
    expect(stings.length).toBeGreaterThanOrEqual(1);
    expect(stings[0].amount).toBe(Math.round(T.shrapnelPerSecond * 2.5));
  });

  it('never leaves shrapnel on normal', () => {
    const { f } = rangeFight();
    run(f, T.lockFirst + 0.1);
    const [still] = marked(f);
    put(f, still, -60, -15);
    run(f, 3);
    expect(objects(f, FOUNDRY_SHRAPNEL)).toHaveLength(0);
  });
});

describe('the Rangewarden: reset and the deed', () => {
  it('a wipe drops the marks, the shells and the fight state', () => {
    const { f, b } = rangeFight();
    run(f, T.lockFirst + 1.1);
    expect(objects(f, FOUNDRY_SHELL_MARK).length).toBeGreaterThan(0);
    wipe(f, b);
    run(f, 0.2);
    expect(b.foundryFight).toBeUndefined();
    expect(objects(f, FOUNDRY_SHELL_MARK)).toHaveLength(0);
    expect(marked(f)).toHaveLength(0);
  });

  it('Clean Range: a kill with nobody shelled earns it; a shelled one does not', () => {
    const clean = rangeFight();
    run(clean.f, 2);
    clean.f.sim.ctx.handleDeath(clean.b, clean.f.tank);
    run(clean.f, 0.1);
    expect(earned(clean.f, clean.f.tank, RANGEWARDEN_DEED)).toBe(true);

    const hit = rangeFight();
    run(hit.f, T.lockFirst + 0.1);
    const [still] = marked(hit.f);
    put(hit.f, still, -60, -15);
    run(hit.f, 2);
    expect(rangeState(hit.f.sim.ctx, hit.f.inst, hit.b).shelled).toBe(true);
    hit.f.sim.ctx.handleDeath(hit.b, hit.f.tank);
    run(hit.f, 0.1);
    expect(earned(hit.f, hit.f.tank, RANGEWARDEN_DEED)).toBe(false);
  });
});
