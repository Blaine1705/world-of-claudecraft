// The Dunefather sand-worm world-boss encounter: a burrow/emerge state machine
// layered under three HP phases. The signature beat is the dive, the worm
// vanishes under the sand (a huge absorb rides the state, so it cannot be
// burned while untargetable-in-effect), tunnels straight at its victim with a
// dust-plume telegraph, then ERUPTS underneath the raid: heavy AoE damage, a
// short stun, and the bespoke Emerge clip on the render side.
//
// Phases sharpen the cycle rather than replace it (the worm has no arena or
// script events to hang a Nythraxis-style transition on):
//   P1 (100-70%): surface rotation, Scything Sweep + Dunebreaker Slam, with a
//                 dive roughly every half minute.
//   P2 (<70%):    the sand boils, faster dives, and the template's summonAdds
//                 thresholds erupt spawnlings from beneath him.
//   P3 (<35%):    frenzy, dives come fast, sweeps harder; the template enrage
//                 (updateBossMechanics) stacks on top.
//
// `src/sim`-pure: no DOM/render imports, no Math.random/Date.now; everything
// routes through the SimContext seam (same contract as encounters/nythraxis.ts).

import { MOBS } from '../data';
import { emitMobYell } from '../mob/yells';
import type { SimContext } from '../sim_context';
import { DT, dist2d, type Entity, SANDWORM_BOSS_ID } from '../types';

// -- tuning ----------------------------------------------------------------------

/** Seconds between dives, per phase: the signature move leads the fight's
 *  rhythm, so even a short skirmish sees at least one eruption. */
const BURROW_EVERY: Record<1 | 2 | 3, number> = { 1: 17, 2: 12, 3: 8 };
/** The worm stays under at most this long before erupting wherever it is. */
const BURROW_MAX = 5.0;
/** ...and at least this long, so the dive always reads. */
const BURROW_MIN = 1.8;
/** The SLOW dig: on the initial dive he stays VISIBLE and sinks head-first in
 *  place for this long (matched to the Burrow clip length in the rig script)
 *  before he actually vanishes underground and starts tunnelling. Reads as
 *  "digs under, THEN disappears" instead of blinking out. */
const DIVE_TIME = 2.1;
/** Underground tunneling speed: outruns every sprint cooldown. */
const TUNNEL_SPEED = 16;
/** Erupt when the tunnel gets this close to its victim. */
const EMERGE_RANGE = 2.5;
/** Post-eruption lock: the body is airborne/settling, no melee. */
const EMERGE_LOCK = 1.3;

const ERUPTION = { radius: 9, min: 55, max: 75, stun: 1.5, name: 'Sunderquake Eruption' };
/** The breach: the worm hurls its ENTIRE body out of the ground, arcs through
 *  the air onto ANOTHER player on the hate table, and the damage lands where
 *  the arch-dive comes DOWN (the Leap clip's re-entry), not at the launch. */
const BREACH = { radius: 10, min: 45, max: 62, stun: 1.2, name: 'Skybreaker Breach' };
/** Matches the Leap clip length (rig script). */
const LEAP_DURATION = 2.3;
/** Seconds into the leap when the head re-enters the ground (re-entry rocks
 *  AND the breach damage, the dive lands ON the leap target). */
const LEAP_DIVE_AT = 1.55;
/** After the leap's dive-back-in: a short re-tunnel before the real emerge. */
const LEAP_RETUNNEL = 1.4;
const SWEEP = { every: 14, radius: 11, min: 26, max: 38, name: 'Scything Sweep' };
const SLAM = { every: 23, radius: 13, min: 40, max: 56, stun: 1.2, name: 'Dunebreaker Slam' };
/** Brood spew (surface rotation): the worm rears, gullet skyward, and vomits a
 *  wave of mini clones of itself out of its mouth into a cone ahead of it. */
const BROOD = { every: 32, count: 10, mobId: 'dune_broodling', name: 'Spawn of the Dunefather' };
/** The mouth cone the brood is hurled into (yards / radians off facing). */
const BROOD_NEAR = 4;
const BROOD_FAR = 11;
const BROOD_SPREAD = 0.55;
/** The choking sand-cloud the worm churns up: any player caught in the plume is
 *  BLINDED and misses a fraction of their own weapon swings, which reads as the
 *  Dunefather "evading" their hits. `miss` rides the blind aura's value, summed
 *  into swing miss chance by cc.ts blindMissBonus; refreshed on a throttle while
 *  they stand in the dust, expiring once they clear it. */
const SAND_BLIND = { radius: 12, miss: 0.2, duration: 3.5, every: 1.5 };

const PHASE2_HP = 0.7;
const PHASE3_HP = 0.35;

const BURROW_AURA_ID = 'sandworm_burrowed';
const YELL_RANGE_WORM = 300;

// -- state -----------------------------------------------------------------------

function initState(boss: Entity): NonNullable<Entity['sandworm']> {
  boss.sandworm = {
    phase: 1,
    state: 'surface',
    stateTimer: 0,
    // The first dive waits a full cycle so the pull opens readable; sweeps and
    // slams are staggered so the opener is never a triple overlap.
    burrowTimer: BURROW_EVERY[1],
    burrowTargetId: null,
    sweepTimer: SWEEP.every * 0.6,
    slamTimer: SLAM.every,
    broodTimer: BROOD.every * 0.8,
    introSpoken: false,
  };
  return boss.sandworm;
}

/** Surface the worm and drop every burrow-state effect (evade/reset path). */
function surfaceReset(boss: Entity, st: NonNullable<Entity['sandworm']>): void {
  st.state = 'surface';
  st.stateTimer = 0;
  st.burrowTargetId = null;
  st.leapDone = false;
  st.leapDiveFx = false;
  st.leapTargetId = null;
  boss.burrowed = false;
  boss.auras = boss.auras.filter((a) => a.id !== BURROW_AURA_ID);
}

// -- helpers ---------------------------------------------------------------------

/** The living player the worm tunnels at: its current aggro target, falling
 *  back to the nearest living player on the hate table. */
function pickBurrowVictim(ctx: SimContext, boss: Entity): Entity | null {
  const direct = boss.aggroTargetId !== null ? ctx.entities.get(boss.aggroTargetId) : null;
  if (direct && !direct.dead) return direct;
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const id of boss.threat.keys()) {
    const e = ctx.entities.get(id);
    if (!e || e.dead) continue;
    const d = dist2d(e.pos, boss.pos);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/** The player the breach arch-dives onto: a DIFFERENT living player on the
 *  hate table than the tunnel victim (rng-picked so a raid can't call the
 *  dive), falling back to the tunnel victim when he's the only one left. */
function pickLeapVictim(ctx: SimContext, boss: Entity, excludeId: number | null): Entity | null {
  const others: Entity[] = [];
  for (const id of boss.threat.keys()) {
    if (id === excludeId) continue;
    const e = ctx.entities.get(id);
    if (!e || e.dead || e.kind !== 'player') continue;
    others.push(e);
  }
  if (others.length > 0) return others[ctx.rng.int(0, others.length - 1)];
  const fallback = excludeId !== null ? ctx.entities.get(excludeId) : null;
  return fallback && !fallback.dead ? fallback : pickBurrowVictim(ctx, boss);
}

function aoeOnPlayers(
  ctx: SimContext,
  boss: Entity,
  spec: { radius: number; min: number; max: number; stun?: number; name: string },
): void {
  for (const meta of ctx.players.values()) {
    const pe = ctx.entities.get(meta.entityId);
    if (!pe || pe.dead || dist2d(pe.pos, boss.pos) > spec.radius) continue;
    // Heroic scaling multiplies AFTER the draw so the rng stream is identical
    // across difficulties (same contract as aoePulse, mob/locomotion.ts).
    const dmg = Math.round(ctx.rng.range(spec.min, spec.max) * (boss.mechanicDamageMult ?? 1));
    ctx.dealDamage(boss, pe, dmg, false, 'physical', spec.name, 'hit', true);
    if (pe.dead || !spec.stun) continue;
    ctx.applyAura(pe, {
      id: 'stomp_stun',
      name: spec.name,
      kind: 'stun',
      remaining: spec.stun,
      duration: spec.stun,
      value: 0,
      sourceId: boss.id,
      school: 'physical',
    });
  }
}

/** Refresh the choking-sand blind on every player standing in the worm's dust
 *  cloud (throttled by st.blindTimer). Target-agnostic like a real blind, the
 *  sand in their eyes makes them whiff, and the boss "evades" SAND_BLIND.miss of
 *  their swings (cc.ts blindMissBonus). Draws no rng, so it never perturbs the
 *  shared draw stream. */
function pulseSandBlind(ctx: SimContext, boss: Entity, st: NonNullable<Entity['sandworm']>): void {
  st.blindTimer = (st.blindTimer ?? 0) - DT;
  if (st.blindTimer > 0) return;
  st.blindTimer = SAND_BLIND.every;
  for (const meta of ctx.players.values()) {
    const pe = ctx.entities.get(meta.entityId);
    if (!pe || pe.dead || dist2d(pe.pos, boss.pos) > SAND_BLIND.radius) continue;
    ctx.applyAura(pe, {
      id: 'sand_blind',
      name: 'Choking Sand',
      kind: 'blind',
      remaining: SAND_BLIND.duration,
      duration: SAND_BLIND.duration,
      value: SAND_BLIND.miss,
      sourceId: boss.id,
      school: 'nature',
    });
  }
}

function emitWormFx(
  ctx: SimContext,
  boss: Entity,
  anim:
    | 'worm-burrow'
    | 'worm-emerge'
    | 'worm-slam'
    | 'worm-sweep'
    | 'worm-leap'
    | 'worm-dive'
    | 'worm-spew',
): void {
  ctx.emit({
    type: 'spellfx',
    sourceId: boss.id,
    targetId: boss.id,
    school: 'nature',
    fx: 'nova',
    attackAnimation: anim,
  });
}

// -- the per-tick driver -----------------------------------------------------------

/** True while the script owns the worm's body (locomotion must not chase/swing). */
export function sandwormScriptLocked(boss: Entity): boolean {
  const st = boss.sandworm;
  return !!st && st.state !== 'surface';
}

export function updateSandwormEncounter(ctx: SimContext, boss: Entity): void {
  if (boss.dead) {
    // The carcass must lie on the sand, never linger half-buried.
    if (boss.sandworm && boss.sandworm.phase !== 'dead') {
      surfaceReset(boss, boss.sandworm);
      boss.sandworm.phase = 'dead';
    }
    return;
  }
  const st = boss.sandworm ?? initState(boss);
  if (st.phase === 'dead') boss.sandworm = initState(boss); // world-boss rescheduler reuse
  if (!boss.inCombat) {
    // Out of combat (fresh spawn or evade): idle on the surface with fresh timers.
    if (st.state !== 'surface') surfaceReset(boss, st);
    st.burrowTimer = BURROW_EVERY[st.phase === 'dead' ? 1 : st.phase];
    st.sweepTimer = SWEEP.every * 0.6;
    st.slamTimer = SLAM.every;
    st.broodTimer = BROOD.every * 0.8;
    return;
  }

  if (!st.introSpoken) {
    st.introSpoken = true;
    emitMobYell(ctx, boss, 'The dunes hunger, little morsels. I AM the dunes.', YELL_RANGE_WORM);
  }

  // HP phase ladder (one-way).
  const hpFrac = boss.hp / Math.max(1, boss.maxHp);
  if (st.phase === 1 && hpFrac <= PHASE2_HP) {
    st.phase = 2;
    emitMobYell(ctx, boss, 'You stand on MY sand. Sink and be swallowed!', YELL_RANGE_WORM);
    st.burrowTimer = Math.min(st.burrowTimer, 2.5); // the sand boils: dive almost at once
  } else if (st.phase === 2 && hpFrac <= PHASE3_HP) {
    st.phase = 3;
    emitMobYell(ctx, boss, 'THE DESERT TAKES WHAT IT IS OWED!', YELL_RANGE_WORM);
    st.burrowTimer = Math.min(st.burrowTimer, 2);
  }

  // The sandstorm around the worm blinds anyone standing in it, in every active
  // state (grinding on the surface, tunnelling underfoot, or breaching), the
  // churned sand fills their eyes and they miss a fifth of their swings.
  pulseSandBlind(ctx, boss, st);

  if (st.state === 'leaping') {
    // Airborne: the whole body is out of the map on the Leap arc. The absorb
    // stays (you do not stab a mountain mid-flight); the model is VISIBLE
    // (burrowed=false) and the clip carries the vertical motion while the sim
    // carries the horizontal ARC, homing onto the leap victim so the
    // arch-dive comes down right on top of them.
    st.stateTimer -= DT;
    const elapsed = LEAP_DURATION - st.stateTimer;
    const victim = st.leapTargetId != null ? ctx.entities.get(st.leapTargetId) : null;
    if (victim && !victim.dead && elapsed < LEAP_DIVE_AT) {
      // Cover the remaining distance by the moment the head knifes back in.
      const remaining = Math.max(DT, LEAP_DIVE_AT - elapsed);
      const d = dist2d(boss.pos, victim.pos);
      if (d > 0.1) {
        ctx.moveToward(boss, victim.pos, d / remaining, true);
        boss.facing = Math.atan2(victim.pos.x - boss.pos.x, victim.pos.z - boss.pos.z);
      }
    }
    if (!st.leapDiveFx && elapsed >= LEAP_DIVE_AT) {
      // The head knifes back into the ground ON the victim: re-entry rock
      // spray AND the breach damage, the dive is the hit, not the launch.
      st.leapDiveFx = true;
      emitWormFx(ctx, boss, 'worm-dive');
      aoeOnPlayers(ctx, boss, BREACH);
    }
    if (st.stateTimer <= 0) {
      // Buried again: a short tunnel, then the true emerge (second contact).
      st.state = 'burrowed';
      st.stateTimer = LEAP_RETUNNEL;
      st.leapTargetId = null;
      boss.burrowed = true;
    }
    return;
  }

  if (st.state === 'burrowed') {
    st.stateTimer -= DT;
    const elapsed = BURROW_MAX - st.stateTimer;
    // The slow dig (initial dive only): still on the surface and VISIBLE,
    // sinking head-first IN PLACE. He neither tunnels nor becomes untargetable
    // until he is fully under, so a fast raid can still punish the dive. The
    // leap re-entry starts with a short stateTimer, so its elapsed already
    // clears DIVE_TIME and it skips the dig (a fast re-burrow, not a dig).
    if (elapsed < DIVE_TIME && !boss.burrowed) return;
    if (!boss.burrowed) {
      // Fully submerged now: vanish and raise the untargetable absorb, a huge
      // shield rather than a bespoke damage gate, so every absorb/aura pipeline
      // (bars, dispels-can't, combat log) treats it uniformly.
      boss.burrowed = true;
      ctx.applyAura(boss, {
        id: BURROW_AURA_ID,
        name: 'Burrowed',
        kind: 'absorb',
        remaining: BURROW_MAX + 1,
        duration: BURROW_MAX + 1,
        value: 10_000_000,
        sourceId: boss.id,
        school: 'nature',
      });
    }
    const victim = st.burrowTargetId !== null ? ctx.entities.get(st.burrowTargetId) : null;
    const target = victim && !victim.dead ? victim : pickBurrowVictim(ctx, boss);
    st.burrowTargetId = target ? target.id : null;
    if (target) {
      // Tunnel the straight line, sand does not path around fences.
      ctx.moveToward(boss, target.pos, TUNNEL_SPEED, true);
      boss.facing = Math.atan2(target.pos.x - boss.pos.x, target.pos.z - boss.pos.z);
    }
    // Dust-plume telegraph crawling with the tunnel (ground-point fx).
    ctx.emit({
      type: 'spellfxAt',
      x: boss.pos.x,
      z: boss.pos.z,
      school: 'nature',
      fx: 'burst',
    });
    // The slow dig (elapsed >= DIVE_TIME already) satisfies "the dive reads for a
    // beat", so the early emerge keys off total elapsed as before, the visible
    // dig just prepends ~2s; the underground tunnel resolves at its old pace.
    const closeEnough = target !== null && dist2d(boss.pos, target.pos) <= EMERGE_RANGE;
    if (st.stateTimer <= 0 || (elapsed >= BURROW_MIN && closeEnough)) {
      if (!st.leapDone) {
        // FIRST contact: the showpiece, breach clear of the ground and
        // arch-dive onto ANOTHER player in the fight. The launch is harmless;
        // the damage rides the dive down (LEAP_DIVE_AT, above).
        st.leapDone = true;
        st.leapDiveFx = false;
        st.state = 'leaping';
        st.stateTimer = LEAP_DURATION;
        const prey = pickLeapVictim(ctx, boss, st.burrowTargetId);
        st.leapTargetId = prey ? prey.id : null;
        if (prey) {
          boss.facing = Math.atan2(prey.pos.x - boss.pos.x, prey.pos.z - boss.pos.z);
        }
        boss.burrowed = false; // visible: the Leap clip carries the arc
        emitWormFx(ctx, boss, 'worm-leap');
        return;
      }
      // SECOND contact: the ground detonates under whoever it reached and the
      // worm stays up, back to the surface rotation.
      st.state = 'emerging';
      st.stateTimer = EMERGE_LOCK;
      st.leapDone = false;
      boss.burrowed = false;
      boss.auras = boss.auras.filter((a) => a.id !== BURROW_AURA_ID);
      emitWormFx(ctx, boss, 'worm-emerge');
      aoeOnPlayers(ctx, boss, {
        ...ERUPTION,
        // The eruption hits harder the deeper the frenzy.
        min: ERUPTION.min * (st.phase === 3 ? 1.25 : 1),
        max: ERUPTION.max * (st.phase === 3 ? 1.25 : 1),
      });
    }
    return;
  }

  if (st.state === 'emerging') {
    st.stateTimer -= DT;
    if (st.stateTimer <= 0) {
      st.state = 'surface';
      st.burrowTimer = BURROW_EVERY[st.phase === 'dead' ? 1 : st.phase];
    }
    return;
  }

  // ---- surface rotation ----------------------------------------------------------

  st.sweepTimer -= DT;
  if (st.sweepTimer <= 0) {
    st.sweepTimer = SWEEP.every;
    emitWormFx(ctx, boss, 'worm-sweep');
    aoeOnPlayers(ctx, boss, SWEEP);
  }

  st.broodTimer = (st.broodTimer ?? BROOD.every * 0.8) - DT;
  if (st.broodTimer <= 0) {
    st.broodTimer = BROOD.every;
    emitMobYell(ctx, boss, 'My children ripen in my gullet. TASTE THEM.', YELL_RANGE_WORM);
    if (!MOBS[boss.templateId]?.quietMechanics) {
      ctx.emit({
        type: 'log',
        text: `${boss.name} rears back and disgorges his brood!`,
        color: '#ff9933',
        entityId: boss.id,
        telegraph: true,
      });
    }
    // The Spew clip (head thrown back, convulsive pumps) plays on this cue;
    // the clones land in a cone hurled out of the mouth ahead of him.
    emitWormFx(ctx, boss, 'worm-spew');
    const points: { x: number; z: number }[] = [];
    for (let k = 0; k < BROOD.count; k++) {
      const ang = boss.facing + (k / (BROOD.count - 1) - 0.5) * 2 * BROOD_SPREAD;
      const d = ctx.rng.range(BROOD_NEAR, BROOD_FAR);
      points.push({ x: boss.pos.x + Math.sin(ang) * d, z: boss.pos.z + Math.cos(ang) * d });
    }
    // v0.35's shared helper takes no placement options, so the brood spawns on
    // its default ring rather than the fanned arc computed above. The arc math
    // is kept because the intent (a spread in front of the boss) is what a
    // future placement-aware spawn should restore.
    void points;
    ctx.spawnBossAdds(boss, BROOD.mobId, BROOD.count);
  }

  st.slamTimer -= DT;
  if (st.slamTimer <= 0) {
    st.slamTimer = SLAM.every;
    if (!MOBS[boss.templateId]?.quietMechanics) {
      ctx.emit({
        type: 'log',
        text: `${boss.name} rears up for ${SLAM.name}!`,
        color: '#ff9933',
        entityId: boss.id,
        telegraph: true,
      });
    }
    emitWormFx(ctx, boss, 'worm-slam');
    aoeOnPlayers(ctx, boss, SLAM);
  }

  st.burrowTimer -= DT;
  if (st.burrowTimer <= 0) {
    const target = pickBurrowVictim(ctx, boss);
    if (!target) {
      st.burrowTimer = 4; // nobody to hunt: try again shortly
      return;
    }
    st.state = 'burrowed';
    st.stateTimer = BURROW_MAX;
    st.burrowTargetId = target.id;
    // The SLOW dig starts VISIBLE: he stays on the surface and sinks head-first
    // (the Burrow clip) for DIVE_TIME before he vanishes and tunnels. The
    // untargetable absorb + the hide are raised in the burrowed branch once he
    // is fully under, so he is damageable while he is still digging in.
    boss.burrowed = false;
    emitWormFx(ctx, boss, 'worm-burrow');
    if (!MOBS[boss.templateId]?.quietMechanics) {
      ctx.emit({
        type: 'log',
        text: `${boss.name} digs down into the sand!`,
        color: '#ff9933',
        entityId: boss.id,
        telegraph: true,
      });
    }
  }
}

export { SANDWORM_BOSS_ID };
