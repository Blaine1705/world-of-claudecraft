// The Rangewarden (src/sim/encounters/stormbrass_foundry/rangewarden.ts): the
// G20 trail salvo (each second a circle paints UNDER every marked player and
// stays put; it lands 2.1 s later, so a mark who keeps moving is never hit and
// one who stands still is shelled), the mark ending with its aura, the bunkers
// as cover, Proof Shot (its floor line and tank alert) and Dented Plating, the
// Drill Drones, heroic Walking Barrage and Shrapnel, the reset and the Clean
// Range deed.

import { describe, expect, it } from 'vitest';
import { RANGE_BUNKERS } from '../src/sim/content/stormbrass_foundry_layout';
import {
  ARC_DRONE_ID,
  bunkerLeeAt,
  FOUNDRY_BUNKER_TEMPLATES,
  FOUNDRY_SHELL_MARK,
  FOUNDRY_SHELL_PENDING,
  FOUNDRY_SHRAPNEL,
  RANGE_DENTED,
  RANGE_PROOF_SHOT,
  RANGE_TARGET_LOCK,
  RANGEWARDEN_DEED,
  RANGEWARDEN_ID,
  RANGE_TUNING as T,
} from '../src/sim/encounters/stormbrass_foundry';
import {
  inProofReach,
  rangeState,
  startTargetLock,
} from '../src/sim/encounters/stormbrass_foundry/rangewarden';
import { DT, type Entity, type RangewardenFightState } from '../src/sim/types';
import { auraEffectDescriptor } from '../src/ui/aura_effect';
import { foundryHeroicAmount } from '../src/ui/foundry_aura_effect';
import { buildFoundryAlertView } from '../src/ui/hud/dungeon/foundry_alert_view';
import { setLanguage, t } from '../src/ui/i18n';
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

setLanguage('en');

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

/** Every shell circle on the range, pending (dim) or about to land (red). */
function circles(f: Fight): Entity[] {
  return [...objects(f, FOUNDRY_SHELL_PENDING), ...objects(f, FOUNDRY_SHELL_MARK)];
}

interface Circle {
  x: number;
  z: number;
  owner: number;
  born: number;
  red: number;
  gone: number;
}

/** Watch every circle tick by tick (called first thing in a run's keep, so
 *  it sees the world the last tick left): where each was born and under whom,
 *  that it never moves, when it turned red and when it landed. Every salvo
 *  hit of the tick before must sit inside one of the circles that landed. */
function circleWatch(f: Fight) {
  const seen = new Map<number, Circle>();
  let ticks = 0;
  let hitMark = f.hits.length;
  let salvoHits = 0;
  const watch = (): void => {
    const now = new Set<number>();
    for (const o of circles(f)) {
      now.add(o.id);
      const at = local(f, o);
      const have = seen.get(o.id);
      if (!have) {
        // Born last tick, exactly under one marked runner where they stood.
        const owner = marked(f).find((p) => {
          const lp = local(f, p);
          return Math.hypot(lp.x - at.x, lp.z - at.z) < 1e-6;
        });
        expect(owner, `circle ${o.id} under a marked player`).toBeDefined();
        expect(o.templateId).toBe(FOUNDRY_SHELL_PENDING);
        expect(o.scale).toBe(T.shellRadius);
        seen.set(o.id, { ...at, owner: owner?.id ?? -1, born: ticks, red: -1, gone: -1 });
        continue;
      }
      // It never moves.
      expect(at.x).toBeCloseTo(have.x, 9);
      expect(at.z).toBeCloseTo(have.z, 9);
      if (o.templateId === FOUNDRY_SHELL_MARK && have.red < 0) have.red = ticks;
    }
    const landed: Circle[] = [];
    for (const [id, c] of seen) {
      if (c.gone >= 0 || now.has(id)) continue;
      c.gone = ticks;
      landed.push(c);
    }
    for (let i = hitMark; i < f.hits.length; i++) {
      const h = f.hits[i];
      if (h.ability !== 'Salvo') continue;
      salvoHits++;
      const victim = f.sim.ctx.entities.get(h.targetId);
      if (!victim) throw new Error('victim');
      const v = local(f, victim);
      const inside = landed.some((c) => Math.hypot(v.x - c.x, v.z - c.z) <= T.shellRadius + 1e-6);
      expect(inside, `salvo hit on ${h.targetId} inside a landing circle`).toBe(true);
    }
    hitMark = f.hits.length;
    ticks++;
  };
  return { seen, watch, salvoHits: () => salvoHits };
}

describe('the Rangewarden: the trail salvo (G20)', () => {
  it('paints each circle under its own runner as it is sampled; it never moves and lands 2.1 s later', () => {
    const { f } = rangeFight();
    run(f, T.lockFirst - 0.1);
    const w = circleWatch(f);
    let angle = 0;
    let runners: Entity[] = [];
    run(f, 0.2 + T.lockSeconds + T.shellLag + T.shellWarning + 0.5, () => {
      w.watch();
      if (runners.length === 0) runners = marked(f);
      const [a, b] = runners;
      if (!a || !b) return;
      // Two runners on their own loops at 7 yd a second.
      angle += (7 * DT) / 12;
      put(f, a, -92 + Math.sin(angle) * 10, -4 + Math.cos(angle) * 8);
      put(f, b, -62 + Math.cos(angle) * 6, -6 + Math.sin(angle) * 6);
    });
    const [a, b] = runners;
    const all = [...w.seen.values()];
    // One circle a second for each mark's 8 s, each under its own runner.
    expect(all.filter((c) => c.owner === a.id)).toHaveLength(T.lockSeconds);
    expect(all.filter((c) => c.owner === b.id)).toHaveLength(T.lockSeconds);
    for (const c of all) {
      // Dim for the lag, red for the warning beat, then it lands.
      expect(c.red - c.born).toBe(Math.round(T.shellLag / DT));
      expect(c.gone - c.born).toBe(Math.round((T.shellLag + T.shellWarning) / DT));
    }
    // The runners never stand in their own circle as it lands.
    expect(hitsOn(f, a, 'Salvo')).toHaveLength(0);
    expect(hitsOn(f, b, 'Salvo')).toHaveLength(0);
  });

  it('every salvo hit lands inside the circle it painted', () => {
    const { f } = rangeFight();
    run(f, T.lockFirst + 0.1);
    const [still, runner] = marked(f);
    const w = circleWatch(f);
    let t = 0;
    run(f, T.lockSeconds + 3, () => {
      w.watch();
      t += DT;
      // The still one shuffles inside its own circles; the runner drags its
      // circles back and forth across the tank.
      put(f, still, -60 + Math.sin(t) * 2, -15);
      put(f, runner, -82 + Math.sin(t * 2) * 4, -2);
      put(f, f.tank, -82, -2);
    });
    expect(w.salvoHits()).toBeGreaterThan(4);
  });

  it('ends the mark when its Target Lock aura is gone: no more circles under that player', () => {
    const { f, b } = rangeFight();
    run(f, T.lockFirst + 0.1);
    const [freed, kept] = marked(f);
    put(f, freed, -60, -15);
    put(f, kept, -104, 8);
    run(f, 1.5);
    // Stripped (an immunity, a breaker, a dispel): the aura goes.
    freed.auras = freed.auras.filter((x) => x.id !== RANGE_TARGET_LOCK);
    const before = new Set(circles(f).map((o) => o.id));
    run(f, 3);
    expect(state(b).marks.some((m) => m.playerId === freed.id)).toBe(false);
    const fresh = circles(f).filter((o) => !before.has(o.id));
    expect(fresh.length).toBeGreaterThan(0);
    for (const o of fresh) {
      const at = local(f, o);
      expect(Math.hypot(at.x + 104, at.z - 8)).toBeLessThan(1e-6);
    }
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
    run(f, T.lockSeconds + 2, () => {
      put(f, still, lee.x, lee.z);
      put(f, runner, -104 + (f.sim.ctx.time % 6), 10);
    });
    const hits = hitsOn(f, still, 'Salvo', from);
    // The first circle paints on the spot the mark was locked at (out in the
    // open); of the seven that follow into the lee, the wall swallows three.
    expect(hits).toHaveLength(T.lockSeconds - 1 - T.bunkerShells);
    expect(objects(f, FOUNDRY_BUNKER_TEMPLATES.breached)).toHaveLength(1);
    // The next Target Lock: the bunker stands sound again.
    startTargetLock(f.sim.ctx, f.inst, b, state(b));
    expect(objects(f, FOUNDRY_BUNKER_TEMPLATES.breached)).toHaveLength(0);
    expect(objects(f, FOUNDRY_BUNKER_TEMPLATES.sound)).toHaveLength(RANGE_BUNKERS.length);
  });
});

describe('the Rangewarden: owner decisions (the mark holds, the gun has a reach)', () => {
  it('Target Lock is a mark no slow immunity refuses and no snare-break strips', () => {
    const { f } = rangeFight();
    // Every non-tank is immune to slows before the lock goes out.
    for (const p of f.others)
      f.sim.ctx.applyAura(p, {
        id: 'test_slow_immunity',
        name: 'Unhindered',
        kind: 'slow_immunity',
        remaining: 60,
        duration: 60,
        value: 0,
        sourceId: p.id,
        school: 'physical',
      });
    run(f, T.lockFirst + 0.1);
    const locked = marked(f);
    expect(locked).toHaveLength(T.lockCount);
    for (const p of locked) {
      const mark = aura(p, RANGE_TARGET_LOCK);
      expect(mark?.unbreakableControl).toBe(true);
      expect(mark?.undispellable).toBe(true);
      // Not a snare at all: full speed, and nothing a root or slow break finds.
      expect(mark?.kind).toBe('vulnerability');
      expect(mark?.value).toBe(0);
      // An ordinary snare-break (the shape of every one in src/sim/combat:
      // strip the root and slow auras that are not unbreakable control).
      p.auras = p.auras.filter(
        (a) => !((a.kind === 'root' || a.kind === 'slow') && a.unbreakableControl !== true),
      );
      expect(aura(p, RANGE_TARGET_LOCK)).toBeDefined();
    }
    // The mark still does its work: circles keep painting under the runners.
    const before = circles(f).length;
    run(f, T.shellEvery + 0.1);
    expect(circles(f).length).toBeGreaterThan(before);
    expect(marked(f)).toHaveLength(T.lockCount);
  });

  it('the mark adds nothing to the damage its wearer takes', () => {
    const { f } = rangeFight();
    run(f, T.lockFirst + 0.1);
    const p = marked(f)[0];
    expect(aura(p, RANGE_TARGET_LOCK)?.value).toBe(0);
    const d = auraEffectDescriptor({ id: RANGE_TARGET_LOCK, kind: 'vulnerability', value: 0 });
    expect(d?.key).toBe('hudChrome.auraEffect.foundry.targetLock');
    expect(d?.nums).toEqual({
      every: T.shellEvery,
      delay: T.shellLag + T.shellWarning,
      radius: T.shellRadius,
      min: T.shellMin,
      max: T.shellMax,
      heroicMin: foundryHeroicAmount(RANGEWARDEN_ID, T.shellMin),
      heroicMax: foundryHeroicAmount(RANGEWARDEN_ID, T.shellMax),
    });
    const text = t('hudChrome.auraEffect.foundry.targetLock', d?.nums ?? {});
    expect(text).toContain(`${T.shellMin} to ${T.shellMax} Fire damage`);
    expect(text).not.toContain('{');
  });

  it('Proof Shot never starts on a target beyond the gun reach, and fires once they are back', () => {
    const { f, b } = rangeFight();
    expect(T.proofReach).toBe(70);
    // The tank holds aggro from far outside the range (a live Rangewarden left behind).
    const far = () => {
      put(f, b, HOME.x, HOME.z);
      put(f, f.tank, HOME.x + T.proofReach + 12, HOME.z);
      b.aggroTargetId = f.tank.id;
    };
    const from = f.hits.length;
    let cast = false;
    run(f, T.proofFirst + T.proofEvery + 2, () => {
      far();
      if (b.castingAbility === RANGE_PROOF_SHOT) cast = true;
    });
    expect(cast).toBe(false);
    expect(inProofReach(b, f.tank)).toBe(false);
    expect(hitsOn(f, f.tank, 'Proof Shot', from)).toHaveLength(0);
    expect(aura(f.tank, RANGE_DENTED)).toBeUndefined();
    // Back in reach: the shot was waiting, ready.
    const near = () => {
      put(f, b, HOME.x, HOME.z);
      put(f, f.tank, HOME.x, HOME.z - 2);
      b.aggroTargetId = f.tank.id;
    };
    run(f, 0.2, near);
    expect(b.castingAbility).toBe(RANGE_PROOF_SHOT);
    run(f, T.proofCast + 0.1, near);
    expect(hitsOn(f, f.tank, 'Proof Shot', from)).toHaveLength(1);
  });

  it('a Proof Shot whose target leaves the reach during the bar falls short', () => {
    const { f, b } = rangeFight();
    run(f, T.proofFirst + 0.05);
    expect(b.castingAbility).toBe(RANGE_PROOF_SHOT);
    const from = f.hits.length;
    run(f, T.proofCast + 0.1, () => {
      put(f, b, HOME.x, HOME.z);
      put(f, f.tank, HOME.x + T.proofReach + 12, HOME.z);
    });
    expect(b.castingAbility).not.toBe(RANGE_PROOF_SHOT);
    expect(hitsOn(f, f.tank, 'Proof Shot', from)).toHaveLength(0);
    expect(aura(f.tank, RANGE_DENTED)).toBeUndefined();
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

  it('Proof Shot alerts the shot tank and whoever targets the Rangewarden, with the dents', () => {
    const { f, b } = rangeFight();
    const healer = f.others[2];
    healer.targetId = b.id;
    const bystander = f.others[1];
    bystander.targetId = null;
    const view = (p: Entity) =>
      buildFoundryAlertView({
        auras: p.auras,
        targetId: p.targetId,
        entity: (id) => f.sim.ctx.entities.get(id),
        interactKey: 'F',
        touch: false,
        selfId: p.id,
        selfPos: p.pos,
        scene: { rangewarden: b, warden: null, draft: null, drones: [], cells: [] },
      });
    // No Target Lock in this test: the mark would outrank the proof alert.
    run(f, 0.1);
    state(b).lockTimer = 1e3;
    // No bar yet: nothing to say.
    expect(view(f.tank).visible).toBe(false);
    run(f, T.proofFirst - 0.05);
    expect(b.castingAbility).toBe(RANGE_PROOF_SHOT);
    expect(b.castTargetId).toBe(f.tank.id);
    for (const p of [f.tank, healer]) {
      const v = view(p);
      if (!v.visible) throw new Error('hidden');
      expect(v.kind).toBe('proof');
      expect(v.title).toBe(t('hudChrome.foundryAlert.proofTitle'));
      expect(v.line).toBe(t('hudChrome.foundryAlert.proofLine'));
      expect(v.hint).toBe('');
      expect(v.progress ?? 0).toBeGreaterThan(0);
      expect(v.progress ?? 1).toBeLessThan(0.2);
    }
    // Not shot at and not looking at it: no alert.
    expect(view(bystander).visible).toBe(false);
    run(f, T.proofCast + 0.1);
    expect(view(f.tank).visible).toBe(false);
    // The next bar names the dents already on the tank.
    state(b).proofTimer = 0.01;
    run(f, 0.1);
    const dented = view(f.tank);
    if (!dented.visible) throw new Error('hidden');
    expect(dented.hint).toBe(t('hudChrome.foundryAlert.dentedLine', { stacks: '1', pct: '10%' }));
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
    run(f, T.shellLag + T.shellWarning + 0.1);
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
    run(f, T.lockFirst + 1.7);
    expect(objects(f, FOUNDRY_SHELL_MARK).length).toBeGreaterThan(0);
    expect(objects(f, FOUNDRY_SHELL_PENDING).length).toBeGreaterThan(0);
    wipe(f, b);
    run(f, 0.2);
    expect(b.foundryFight).toBeUndefined();
    expect(circles(f)).toHaveLength(0);
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
    run(hit.f, T.shellLag + T.shellWarning + 0.5);
    expect(rangeState(hit.f.sim.ctx, hit.f.inst, hit.b).shelled).toBe(true);
    hit.f.sim.ctx.handleDeath(hit.b, hit.f.tank);
    run(hit.f, 0.1);
    expect(earned(hit.f, hit.f.tank, RANGEWARDEN_DEED)).toBe(false);
  });
});
