// Vaelgrath, the Emberwake: the ARCANE dragon world boss that wakes in the
// starting valley. A three-phase fight built on one hard rule, the ground is
// never safe for long, and the dragon keeps taking your footing away from you.
//
// His flame is not fire. It is violet arcane-flame (school 'arcane'), and the
// signature beat is the BEAM: he rears back on a readable wind-up, then lances
// a beam of it straight out of his mouth at a player. Where the beam scorches
// the ground, sigils flare as a WARNING (POOL_WARN seconds), and only then do
// the pools of arcane flame ignite, big, overlapping, and lingering for
// EMBER.duration seconds. The warning is the whole contract: you are told where
// the ground is about to die, and you get a beat to leave.
//
// The wing BUFFET is the twist that makes those pools dangerous: it knocks
// every nearby player backwards and leaves them in a downdraft that slows them
// and blunts their control for a few seconds, so the shove can throw you INTO
// a pool you were carefully standing clear of, and you cannot simply sprint out.
//
// Three more beats keep the ground busy between breaths:
//   CINDER LASH, the tail. Everything in the REAR arc is swept off its feet.
//                   The fight therefore has geometry: his jaw kills what is in
//                   front, his tail kills what is behind, and the flanks are the
//                   only place worth standing.
//   CINDERFALL, ember rain that falls ON players (warned, then ignites), so
//                   ranged players are moved too instead of parking at 30yd.
//   MOLTEN VENTS, the reward. Every breath leaves his throat and flanks
//                   glowing: for a few seconds he TAKES more damage. Bait the
//                   beam, walk out of it, and burn him while he is venting. The
//                   phase transitions open the same window, twice as wide.
//   GROUNDFALL, every half-minute or so he stops flying altogether: wings
//                   folded, feet on the flagstones, hunting whoever he hates
//                   most and biting three times as often. Breath and buffet
//                   both need the wings, so while he is down the fight is
//                   teeth and tail only, and he is finally at eye level. The
//                   launch back into the air IS a wing buffet.
//
// Phases sharpen the rhythm rather than replace it:
//   P1 (100-60%): a single beam, buffet on a long timer, tail + bites between.
//   P2 (60-30%):  the Emberwake wakes, beams come faster and sweep as a
//                 THREE-beam fan, the buffet lands about half as often, and the
//                 sky starts falling on people (Cinderfall).
//   P3 (<30%):    everything at once and barely a gap between beats: the widest
//                 fan, the fastest breath, and ember rain on a five-second loop.
//
// NOTE ON SCALE: Vaelgrath is a colossal model (tens of yards nose to tail)
// hovering low, about 1.8yd off the ground, close enough that his jaw is near
// eye level, so every range here is sized to that body. His mesh origin is
// the BODY CENTRE, the jaw is ~40yd forward of it, so all breath visuals are
// anchored to mouthOf(), never to boss.pos, or the beam leaves his ribcage.
// For the same reason his combat reach (mob_combat.ts) is sized off the mouth
// offset: he closes until his HEAD is over his target rather than burying the
// target under his ribs, which is what makes the fight legible from the ground.
//
// `src/sim`-pure: no DOM/render imports, no Math.random/Date.now; everything
// routes through the SimContext seam (same contract as encounters/sandworm.ts).

import { MOBS } from '../data';
import { emitMobYell } from '../mob/yells';
import type { SimContext } from '../sim_context';
import {
  DT,
  dist2d,
  EMBERWAKE_BOSS_ID,
  EMBERWAKE_MOUTH_FORWARD_PER_SCALE,
  type Entity,
} from '../types';

// -- tuning ----------------------------------------------------------------------

/** The live HP phases (the state also carries 'dead'). */
type Phase = 1 | 2 | 3;

/** Seconds between breaths, per phase. Tight on purpose: the beam is the beat
 *  the whole fight is read against, and long gaps between them turned a world
 *  boss into a target dummy with a timer. */
const BREATH_EVERY: Record<Phase, number> = { 1: 11, 2: 7.5, 3: 6 };
/** The rear-back wind-up: the telegraph window players get to spread out. */
const BREATH_WINDUP = 1.7;
/** How far the beam lances. Sized to a 55yd dragon. */
const BREATH_RANGE = 75;
/** Direct hit along the beam itself (the lance, not the lingering pools). */
const BREATH_IMPACT = { radius: 9, min: 90, max: 130, name: 'Arcane Breath' };
/** Beams per breath, per phase: one aimed lance, then a three-beam fan. */
const BREATH_BEAMS: Record<Phase, number> = { 1: 1, 2: 3, 3: 3 };
/** Angular spread of the fan, in radians either side of the aim. P3 throws it
 *  wider rather than adding more beams: more lanes would carpet the whole arena
 *  in pools and leave nowhere to stand, which is not difficulty, just a wipe. */
const BREATH_FAN: Record<Phase, number> = { 1: 0.42, 2: 0.42, 3: 0.6 };
/** Pools dropped ALONG each beam, and where along it they start/end. The beam
 *  scorches a lane, so the pools march outward from near his jaw. */
const BEAM_POOLS = 3;
const BEAM_NEAR = 0.32;
/** Burst emitters drawn along each beam to make the lance visible. */
const BEAM_STEPS = 14;
/** Seconds the beam front takes to race from his jaw out to full reach. The
 *  lance is drawn OVER TIME rather than all at once: the renderer pools these
 *  effects round-robin, so dumping the whole lane in a single frame recycles
 *  them instantly and nothing is seen. */
const BEAM_SWEEP = 0.55;
const BEAM_FAR = 1.0;

/** The warning: the rune sigils ARE the warning ring. They flare on the ground
 *  for this long, and only then does violet flame erupt out of them. */
const POOL_WARN = 1.0;
/** While a pool burns, spit flame particles out of the ring this often. */
const POOL_PULSE = 0.28;
/** Flame plumes thrown per pulse, scattered inside the ring so the pool reads as
 *  a FIRE FIELD rather than a single spark at its centre. Kept small per tick on
 *  purpose: the renderer pools these effects round-robin, so a big simultaneous
 *  dump recycles itself and you see less, not more. */
const POOL_PLUMES = 3;

/** The debuff every player standing in the flame receives: their weapon arm
 *  cooks and they hit softer until they get out. Refreshed while they stand in
 *  it, so leaving the fire is what ends it. */
const SCORCH = { id: 'emberwake_scorch', name: 'Arcane Scorch', value: 40, duration: 4 };
// Where his MOUTH is, per point of `scale`, measured forward from the entity
// origin along facing: EMBERWAKE_MOUTH_FORWARD_PER_SCALE in types.ts. Every
// breath visual starts there, otherwise the beam appears to leave his ribs ,
// and mob_combat.ts sizes his reach off the same number so it is his HEAD that
// meets the player. Re-derive it there if the rig's height changes.

/** The pools of arcane flame left behind. Big and long-lived on purpose. */
const EMBER = {
  radius: 9.5,
  duration: 5.0,
  interval: 0.5,
  min: 16,
  max: 24,
  name: 'Arcane Cinders',
  abilityId: 'emberwake_arcane_cinders',
  /** Standing in the flame also sludges your footing, punishing lingering. */
  slowMult: 0.6,
  slowDuration: 1.0,
};

/** The bite: a close, hard, single-target chomp on his aggro target. `reach` is
 *  measured FROM THE JAW (mouthOf), not from the body origin: he now parks with
 *  his head over the player, which puts his origin ~31yd away, and a bite
 *  measured from the ribcage would either never land or would have to reach
 *  absurdly far. `groundEvery` is the far faster cadence he chews at once he
 *  has landed and is hunting on foot. */
const BITE = {
  every: 6,
  groundEvery: 2.2,
  /** how far past the teeth the chomp lands */
  reach: 14,
  /** ...and how far from his ORIGIN he can still crane the neck around to
   *  reach. Without this, a player hugging his chest sits ~31yd from the jaw
   *  and is never bitten at all, a dead zone directly under the dragon, which
   *  is precisely where melee stands. He is one long neck: anything under the
   *  body is in his mouth's reach too. */
  bodyReach: 22,
  min: 120,
  max: 165,
  name: 'Ashen Maw',
};

/** Molten Vents: the burn window. Every breath (and, twice as wide, every phase
 *  transition) leaves him venting heat through the plates of his throat and
 *  flanks, and while he vents he TAKES more damage. This is the fight's reward
 *  loop, read the beam, walk out of it, then unload. */
const VENT = {
  id: 'emberwake_molten_vents',
  name: 'Molten Vents',
  /** fraction of extra damage taken (a 'vulnerability' aura on the boss) */
  value: 0.3,
  duration: 5,
  /** the wider window his hide splits open for at each phase change */
  phaseValue: 0.5,
  phaseDuration: 7,
};

/** Cinder Lash: the TAIL. A rear-arc sweep that shoves anyone standing behind
 *  him clear off their feet. Deliberately not telegraphed as a timer the way the
 *  breath is, the telegraph is POSITIONAL: his back is never a safe place to
 *  stand, and the fight is fought from the flanks. */
const TAIL: Record<Phase, number> = { 1: 13, 2: 10, 3: 8 };
const TAIL_SPEC = {
  radius: 52,
  /** half-width of the rear arc, in radians (a ~150deg wedge behind him) */
  arc: 1.3,
  distance: 16,
  min: 62,
  max: 88,
  name: 'Cinder Lash',
  slowMult: 0.7,
  slowDuration: 1.6,
  /** Ground bursts drawn along the swept arc so the lash is visible. Kept small
   *  on purpose: every burst is a couple of dozen particles out of a shared
   *  pool, and a dense arc dumped in ONE tick recycles itself (the same trap the
   *  beam avoids by marching its lane out over several ticks). */
  steps: 5,
};

/** Cinderfall: burning sky. Warned pools that fall ON players rather than along
 *  a lane, so the ranged half of the raid is moved too. P2 opens it; P3 doubles
 *  the volley. */
const CINDER: Record<Phase, number> = { 1: 0, 2: 7, 3: 5 };
/** Pools per volley per player, and the most players a volley will chase (a
 *  40-player world-boss zerg must not queue 120 pools in one tick). */
const CINDER_PER_TARGET: Record<Phase, number> = { 1: 0, 2: 1, 3: 2 };
const CINDER_MAX_TARGETS = 4;
/** The rain is aimed where you ARE, so it warns for longer than the beam's lane
 *  pools: you are expected to be able to walk out of your own feet. */
const CINDER_WARN = 1.5;
/** How far ahead of a moving player the second pool of a P3 volley lands, so
 *  running in a straight line is not a free answer. */
const CINDER_LEAD = 11;

/** Groundfall: seconds of flight between landings, and how long he hunts on
 *  foot once he is down. Frequent enough that every pull sees it, short enough
 *  that the grounded stretch stays a burst of pressure rather than the fight. */
const GROUND_EVERY: Record<Phase, number> = { 1: 34, 2: 28, 3: 22 };
const GROUND_FOR: Record<Phase, number> = { 1: 9, 2: 11, 3: 13 };
/** The impact of a body that size arriving. Everyone near where he comes down
 *  wears it; there is no dodging a landing, only standing somewhere else. */
const GROUND_SLAM = { radius: 34, min: 70, max: 96, name: 'Groundfall' };

/** The wing buffet: shove everyone out and take their footing for a moment. */
const BUFFET: Record<Phase, number> = { 1: 17, 2: 12, 3: 9 };
/** The wings sweep BACK before they come down. Short, but enough that the shove
 *  reads as something he did rather than something that happened. */
const BUFFET_WINDUP = 0.7;
const BUFFET_SPEC = {
  radius: 42,
  distance: 22,
  min: 40,
  max: 58,
  name: 'Thunderclap Wings',
  /** The downdraft: the "loses some control of their movement" rider. A heavy
   *  snare rather than a root, you can still move, just badly, which is what
   *  makes dodging the next beam genuinely hard. */
  slowMult: 0.45,
  slowDuration: 3.2,
};

const PHASE2_HP = 0.6;
const PHASE3_HP = 0.3;

const YELL_RANGE = 320;
/** How far out he will turn to watch a player while still out of combat. */
const FACE_WATCH_RANGE = 200;

/** Everything he does is violet arcane-flame, never fire. */
const SCHOOL = 'arcane';

// -- state -----------------------------------------------------------------------

function initState(boss: Entity): NonNullable<Entity['emberwake']> {
  boss.emberwake = {
    phase: 1,
    breathState: 'idle',
    breathStateTimer: 0,
    breathTargetId: null,
    // Staggered so the opener is never a simultaneous breath + buffet.
    breathTimer: BREATH_EVERY[1] * 0.55,
    biteTimer: BITE.every * 0.5,
    buffetTimer: BUFFET[1],
    buffetState: 'idle',
    buffetStateTimer: 0,
    // Offset from the breath and the buffet so the three never land together on
    // the opener: the fight should teach its beats one at a time.
    tailTimer: TAIL[1] * 0.45,
    cinderTimer: CINDER[2],
    groundState: 'air',
    groundTimer: GROUND_EVERY[1],
    pendingPools: [],
    burningPools: [],
    beamSweeps: [],
    introSpoken: false,
  };
  return boss.emberwake;
}

/** Drop any in-flight breath state (evade / reset / death path). Queued pools
 *  are dropped too: a reset must not ignite flame after he has disengaged. */
function breathReset(st: NonNullable<Entity['emberwake']>): void {
  st.breathState = 'idle';
  st.breathStateTimer = 0;
  st.breathTargetId = null;
  st.buffetState = 'idle';
  st.buffetStateTimer = 0;
  st.pendingPools = [];
  st.burningPools = [];
  st.beamSweeps = [];
}

/** World-space point of his jaw: forward along facing from the entity origin. */
function mouthOf(boss: Entity): { x: number; z: number } {
  const scale = MOBS[boss.templateId]?.scale ?? 1;
  const fwd = scale * EMBERWAKE_MOUTH_FORWARD_PER_SCALE;
  return {
    x: boss.pos.x + Math.sin(boss.facing) * fwd,
    z: boss.pos.z + Math.cos(boss.facing) * fwd,
  };
}

/** Keep him turned toward whoever he is aggroed on, every tick. He is a
 *  mountain with a head on the front of it: if he does not track his target the
 *  player ends up staring at his flank and can never see the jaw they are
 *  supposed to be reading breath telegraphs from. */
function faceAggro(ctx: SimContext, boss: Entity): void {
  // In combat this is his aggro target / hate table. OUT of combat both are
  // empty, so fall back to the nearest living player in sight, that is what
  // makes him turn to watch you as you approach, before the pull.
  let t = pickBreathVictim(ctx, boss);
  if (!t) {
    let bestD = FACE_WATCH_RANGE;
    for (const meta of ctx.players.values()) {
      const pe = ctx.entities.get(meta.entityId);
      if (!pe || pe.dead) continue;
      const d = dist2d(pe.pos, boss.pos);
      if (d < bestD) {
        bestD = d;
        t = pe;
      }
    }
  }
  if (!t) return;
  const dx = t.pos.x - boss.pos.x;
  const dz = t.pos.z - boss.pos.z;
  if (Math.hypot(dx, dz) < 0.05) return;
  boss.facing = Math.atan2(dx, dz);
  // Pin prevFacing too: the render layer interpolates facing between ticks, and
  // on a body this large a lagging turn reads as him staring past you.
  boss.prevFacing = boss.facing;
}

// -- helpers ---------------------------------------------------------------------

/** The player the beam is aimed at: the current aggro target, else the nearest
 *  living player on the hate table. */
function pickBreathVictim(ctx: SimContext, boss: Entity): Entity | null {
  const direct = boss.aggroTargetId !== null ? ctx.entities.get(boss.aggroTargetId) : null;
  if (direct && !direct.dead) return direct;
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const id of boss.threat.keys()) {
    const e = ctx.entities.get(id);
    if (!e || e.dead || e.kind !== 'player') continue;
    const d = dist2d(e.pos, boss.pos);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

function emitDragonFx(
  ctx: SimContext,
  boss: Entity,
  anim: 'dragon-breath' | 'dragon-bite' | 'dragon-ground-bite' | 'dragon-buffet',
): void {
  ctx.emit({
    type: 'spellfx',
    sourceId: boss.id,
    targetId: boss.id,
    school: SCHOOL,
    fx: 'nova',
    attackAnimation: anim,
  });
}

/** Telegraph line in the combat log, muted for templates that ask for quiet. */
function telegraph(ctx: SimContext, boss: Entity, text: string): void {
  if (MOBS[boss.templateId]?.quietMechanics) return;
  ctx.emit({ type: 'log', text, color: '#b06cff', entityId: boss.id, telegraph: true });
}

/** Queue a pool: flare the warning sigil NOW, ignite `warn` seconds later. */
function queuePool(
  ctx: SimContext,
  st: NonNullable<Entity['emberwake']>,
  x: number,
  z: number,
  warn = POOL_WARN,
): void {
  st.pendingPools.push({ x, z, t: warn });
  // The warning marker itself, a rune circle on the ground where it will land.
  ctx.emit({ type: 'spellfxAt', x, z, school: SCHOOL, fx: 'runeCircle' });
}

/** Ignite a queued pool: the lingering arcane flame players must stay out of. */
function ignitePool(ctx: SimContext, boss: Entity, x: number, z: number): void {
  ctx.groundAoEs.push({
    sourceId: boss.id,
    pos: { x, y: ctx.groundPos(x, z).y, z },
    radius: EMBER.radius,
    min: EMBER.min,
    max: EMBER.max,
    remaining: EMBER.duration,
    interval: EMBER.interval,
    tickTimer: EMBER.interval,
    school: SCHOOL,
    ability: EMBER.name,
    // v0.35 requires every ground AoE to name the ability that laid it (combat
    // logs and damage attribution key off this, not the display name).
    abilityId: EMBER.abilityId,
    slowMult: EMBER.slowMult,
    slowDuration: EMBER.slowDuration,
  });
  // The eruption out of the warning ring, sized to the pool.
  ctx.emit({ type: 'spellfxAt', x, z, school: SCHOOL, fx: 'burst', radius: EMBER.radius });
  ctx.emit({ type: 'spellfxAt', x, z, school: SCHOOL, fx: 'nova', radius: EMBER.radius });
}

/** Advance every in-flight beam: march its front outward, emitting a couple of
 *  bursts per tick so the lance reads as a beam leaving his mouth. */
function tickBeamSweeps(ctx: SimContext, st: NonNullable<Entity['emberwake']>): void {
  if (!st.beamSweeps || st.beamSweeps.length === 0) return;
  const alive: typeof st.beamSweeps = [];
  for (const b of st.beamSweeps) {
    const from = b.t / BEAM_SWEEP;
    b.t += DT;
    const to = Math.min(1, b.t / BEAM_SWEEP);
    // Emit the segment of the lane the front crossed THIS tick.
    const i0 = Math.floor(from * BEAM_STEPS);
    const i1 = Math.floor(to * BEAM_STEPS);
    for (let i = i0; i <= i1 && i <= BEAM_STEPS; i++) {
      const f = i / BEAM_STEPS;
      ctx.emit({
        type: 'spellfxAt',
        x: b.ox + b.ux * b.reach * f,
        z: b.oz + b.uz * b.reach * f,
        school: SCHOOL,
        fx: 'burst',
      });
    }
    if (to < 1) alive.push(b);
  }
  st.beamSweeps = alive;
}

/** Advance the warning timers and ignite whatever has finished warning. */
function tickPendingPools(
  ctx: SimContext,
  boss: Entity,
  st: NonNullable<Entity['emberwake']>,
): void {
  if (st.pendingPools.length > 0) {
    const keep: typeof st.pendingPools = [];
    for (const p of st.pendingPools) {
      p.t -= DT;
      if (p.t > 0) keep.push(p);
      else {
        ignitePool(ctx, boss, p.x, p.z);
        st.burningPools.push({ x: p.x, z: p.z, t: EMBER.duration, pulse: POOL_PULSE });
      }
    }
    st.pendingPools = keep;
  }
  // Keep violet flame spitting out of every ring for as long as it burns, so a
  // live pool reads as fire rather than a one-frame flash and a decal.
  if (st.burningPools.length === 0) return;
  const alive: typeof st.burningPools = [];
  for (const b of st.burningPools) {
    b.t -= DT;
    b.pulse -= DT;
    if (b.pulse <= 0) {
      b.pulse = POOL_PULSE;
      // A heavy plume at the centre (nova is the bigger detonation) plus a
      // scatter of lighter ones around the ring, so flame fills the whole disc.
      ctx.emit({
        type: 'spellfxAt',
        x: b.x,
        z: b.z,
        school: SCHOOL,
        fx: 'nova',
        radius: EMBER.radius,
      });
      for (let k = 0; k < POOL_PLUMES; k++) {
        // Deterministic scatter (no rng: this is cosmetic and must not perturb
        // the shared draw stream that the parity gate depends on).
        const ang = ((k + b.t * 3) / POOL_PLUMES) * Math.PI * 2;
        const rr = EMBER.radius * 0.62;
        ctx.emit({
          type: 'spellfxAt',
          x: b.x + Math.sin(ang) * rr,
          z: b.z + Math.cos(ang) * rr,
          school: SCHOOL,
          fx: 'burst',
        });
      }
      // ...and everyone standing in it gets scorched.
      for (const meta of ctx.players.values()) {
        const pe = ctx.entities.get(meta.entityId);
        if (!pe || pe.dead) continue;
        if (Math.hypot(pe.pos.x - b.x, pe.pos.z - b.z) > EMBER.radius) continue;
        ctx.applyAura(pe, {
          id: SCORCH.id,
          name: SCORCH.name,
          kind: 'debuff_ap',
          remaining: SCORCH.duration,
          duration: SCORCH.duration,
          value: SCORCH.value,
          sourceId: boss.id,
          school: SCHOOL,
        });
      }
    }
    if (b.t > 0) alive.push(b);
  }
  st.burningPools = alive;
}

/** Damage everyone standing in the lane a beam just carved. */
function beamDamage(ctx: SimContext, boss: Entity, ux: number, uz: number, reach: number): void {
  for (const meta of ctx.players.values()) {
    const pe = ctx.entities.get(meta.entityId);
    if (!pe || pe.dead) continue;
    // Project the player onto the beam axis; hit if they are within the beam's
    // width AND in front of him inside its reach.
    const origin = mouthOf(boss);
    const rx = pe.pos.x - origin.x;
    const rz = pe.pos.z - origin.z;
    const along = rx * ux + rz * uz;
    if (along < 0 || along > reach) continue;
    const perp = Math.abs(rx * -uz + rz * ux);
    if (perp > BREATH_IMPACT.radius) continue;
    // Heroic scaling multiplies AFTER the draw so the rng stream is identical
    // across difficulties (same contract as the sandworm's aoeOnPlayers).
    const dmg = Math.round(
      ctx.rng.range(BREATH_IMPACT.min, BREATH_IMPACT.max) * (boss.mechanicDamageMult ?? 1),
    );
    ctx.dealDamage(boss, pe, dmg, false, SCHOOL, BREATH_IMPACT.name, 'hit', true);
  }
}

/** Fire the breath: one beam in P1, a three-beam fan in P2. Each beam lances
 *  from his mouth and leaves a march of warned pools down its lane. */
function releaseBreath(ctx: SimContext, boss: Entity, st: NonNullable<Entity['emberwake']>): void {
  const victim = st.breathTargetId !== null ? ctx.entities.get(st.breathTargetId) : null;
  const target = victim && !victim.dead ? victim : pickBreathVictim(ctx, boss);
  if (!target) return;
  // Aim FROM THE JAW, not from the body origin. mouthOf() is already ~31yd
  // forward at this scale, so measuring the lane from boss.pos and then adding
  // another `reach` on top threw every pool 55-100yd past the player, out into
  // empty ground where nobody ever saw them.
  boss.facing = Math.atan2(target.pos.x - boss.pos.x, target.pos.z - boss.pos.z);
  const jaw = mouthOf(boss);
  const dx = target.pos.x - jaw.x;
  const dz = target.pos.z - jaw.z;
  const d = Math.hypot(dx, dz) || 1;
  const aim = Math.atan2(dx, dz);
  emitDragonFx(ctx, boss, 'dragon-breath');
  // Muzzle flash AT THE JAW so the breath visibly starts at his head.
  {
    const m0 = mouthOf(boss);
    ctx.emit({ type: 'spellfxAt', x: m0.x, z: m0.z, school: SCHOOL, fx: 'nova', radius: 6 });
  }
  // The entity-to-entity beam (the renderer draws source -> target)...
  ctx.emit({ type: 'spellfx', sourceId: boss.id, targetId: target.id, school: SCHOOL, fx: 'beam' });

  const ph: Phase = st.phase === 'dead' ? 1 : st.phase;
  const beams = BREATH_BEAMS[ph];
  const fan = BREATH_FAN[ph];
  // The lane runs from his jaw to (a little past) the player, never a fixed
  // 75yd stride bolted onto the mouth offset.
  const reach = Math.min(Math.max(d * 1.15, 12), BREATH_RANGE);
  const mouth = jaw;
  for (let b = 0; b < beams; b++) {
    const ang = beams === 1 ? aim : aim + (b / (beams - 1) - 0.5) * 2 * fan;
    const ux = Math.sin(ang);
    const uz = Math.cos(ang);
    beamDamage(ctx, boss, ux, uz, reach);
    // ...and the beam MADE VISIBLE as a lance of arcane bursts that RACES from
    // his jaw outward over BEAM_SWEEP seconds (drained by tickBeamSweeps). The
    // entity beam alone anchors at the body origin, which reads as firing from
    // his chest; this draws the actual lane the breath carves, from the mouth.
    st.beamSweeps.push({ ox: mouth.x, oz: mouth.z, ux, uz, reach, t: 0 });
    // Pools march outward along that same lane, measured FROM THE MOUTH.
    for (let i = 0; i < BEAM_POOLS; i++) {
      const f = BEAM_NEAR + ((BEAM_FAR - BEAM_NEAR) * i) / Math.max(1, BEAM_POOLS - 1);
      queuePool(ctx, st, mouth.x + ux * reach * f, mouth.z + uz * reach * f);
    }
  }
  // ...and the price of breathing: his vents are open while the throat cools.
  openVents(ctx, boss, VENT.value, VENT.duration);
}

/** The wing buffet: damage, a real knockback, and the control-robbing downdraft. */
function wingBuffet(ctx: SimContext, boss: Entity): void {
  for (const meta of ctx.players.values()) {
    const pe = ctx.entities.get(meta.entityId);
    if (!pe || pe.dead || dist2d(pe.pos, boss.pos) > BUFFET_SPEC.radius) continue;
    const dmg = Math.round(
      ctx.rng.range(BUFFET_SPEC.min, BUFFET_SPEC.max) * (boss.mechanicDamageMult ?? 1),
    );
    ctx.dealDamage(boss, pe, dmg, false, 'physical', BUFFET_SPEC.name, 'hit', true);
    if (pe.dead) continue;
    // Hurled straight away from the dragon. applyKnockback is terrain-clamped
    // and collider-swept, so the shove stops at safe footing instead of
    // stranding anyone off the world, and it respects knockbackResistance.
    ctx.applyKnockback(boss, pe, BUFFET_SPEC.distance);
    // ...and the downdraft that makes the next beam hard to walk out of.
    ctx.applyAura(pe, {
      id: 'emberwake_downdraft',
      name: 'Downdraft',
      kind: 'slow',
      remaining: BUFFET_SPEC.slowDuration,
      duration: BUFFET_SPEC.slowDuration,
      value: BUFFET_SPEC.slowMult,
      sourceId: boss.id,
      school: 'physical',
    });
  }
}

/** Open a Molten Vents window on the DRAGON: for a few seconds he takes extra
 *  damage from everyone. The one moment in the fight where the players are the
 *  ones with a timer to beat. */
function openVents(ctx: SimContext, boss: Entity, value: number, duration: number): void {
  ctx.applyAura(boss, {
    id: VENT.id,
    name: VENT.name,
    kind: 'vulnerability',
    remaining: duration,
    duration,
    value,
    sourceId: boss.id,
    school: SCHOOL,
  });
  // Read on the body itself, not on the ground: the heat is venting out of him.
  ctx.emit({ type: 'spellfx', sourceId: boss.id, targetId: boss.id, school: SCHOOL, fx: 'nova' });
  telegraph(ctx, boss, `${boss.name}'s throat vents molten light, his hide is open. BURN HIM!`);
}

/** The tail: everything in the REAR arc is swept off its feet. The counterplay
 *  is entirely positional, his flanks are safe, his back is not. */
function cinderLash(ctx: SimContext, boss: Entity): boolean {
  // Only swing when someone is actually back there: a tail lash into empty
  // ground is a wasted beat and a confusing combat-log line.
  const behind: Entity[] = [];
  for (const meta of ctx.players.values()) {
    const pe = ctx.entities.get(meta.entityId);
    if (!pe || pe.dead) continue;
    const d = dist2d(pe.pos, boss.pos);
    if (d > TAIL_SPEC.radius || d < 0.05) continue;
    // Angle between his FACING and the direction to the player: pi is directly
    // behind him, so "behind" is everything outside (pi - arc).
    const to = Math.atan2(pe.pos.x - boss.pos.x, pe.pos.z - boss.pos.z);
    const off = Math.abs(Math.atan2(Math.sin(to - boss.facing), Math.cos(to - boss.facing)));
    if (off < Math.PI - TAIL_SPEC.arc) continue;
    behind.push(pe);
  }
  if (behind.length === 0) return false;

  telegraph(ctx, boss, `${boss.name} whips his tail through everything behind him!`);
  // The lash drawn as a arc of impacts carved across the ground behind him.
  // PHYSICAL, not arcane: this is a mountain of muscle, not his flame.
  const back = boss.facing + Math.PI;
  for (let i = 0; i <= TAIL_SPEC.steps; i++) {
    const a = back + (i / TAIL_SPEC.steps - 0.5) * 2 * TAIL_SPEC.arc;
    const r = TAIL_SPEC.radius * 0.5;
    ctx.emit({
      type: 'spellfxAt',
      x: boss.pos.x + Math.sin(a) * r,
      z: boss.pos.z + Math.cos(a) * r,
      school: 'physical',
      fx: 'burst',
    });
  }
  for (const pe of behind) {
    const dmg = Math.round(
      ctx.rng.range(TAIL_SPEC.min, TAIL_SPEC.max) * (boss.mechanicDamageMult ?? 1),
    );
    ctx.dealDamage(boss, pe, dmg, false, 'physical', TAIL_SPEC.name, 'hit', true);
    if (pe.dead) continue;
    ctx.applyKnockback(boss, pe, TAIL_SPEC.distance);
    ctx.applyAura(pe, {
      id: 'emberwake_lashed',
      name: 'Lashed',
      kind: 'slow',
      remaining: TAIL_SPEC.slowDuration,
      duration: TAIL_SPEC.slowDuration,
      value: TAIL_SPEC.slowMult,
      sourceId: boss.id,
      school: 'physical',
    });
  }
  return true;
}

/** Cinderfall: warned ember rain that falls ON players. The beam moves the melee
 *  camp; this moves everyone else. */
function cinderfall(
  ctx: SimContext,
  boss: Entity,
  st: NonNullable<Entity['emberwake']>,
  ph: Phase,
): void {
  const per = CINDER_PER_TARGET[ph];
  if (per <= 0) return;
  // Nearest first, capped: a world-boss crowd must not queue a pool per player.
  const targets: { e: Entity; d: number }[] = [];
  for (const meta of ctx.players.values()) {
    const pe = ctx.entities.get(meta.entityId);
    if (!pe || pe.dead) continue;
    const d = dist2d(pe.pos, boss.pos);
    if (d > BREATH_RANGE * 1.4) continue;
    targets.push({ e: pe, d });
  }
  if (targets.length === 0) return;
  targets.sort((a, b) => a.d - b.d);
  targets.length = Math.min(targets.length, CINDER_MAX_TARGETS);

  telegraph(ctx, boss, `The sky over you cracks, ${boss.name} calls the embers down!`);
  for (const { e } of targets) {
    for (let i = 0; i < per; i++) {
      // The first falls on their feet; the rest LEAD them along their facing, so
      // sprinting in a straight line runs you under the next one.
      const lead = i * CINDER_LEAD;
      const x = e.pos.x + Math.sin(e.facing) * lead;
      const z = e.pos.z + Math.cos(e.facing) * lead;
      queuePool(ctx, st, x, z, CINDER_WARN);
      // The falling ember itself, so the warning ring has something arriving in it.
      ctx.emit({ type: 'spellfxAt', x, z, school: SCHOOL, fx: 'meteorFall', radius: EMBER.radius });
    }
  }
}

/** The bite: his aggro target, in reach OF HIS JAW, for a heavy chomp. Measured
 *  from mouthOf so the chomp lands where the teeth actually are. */
function ashenMaw(ctx: SimContext, boss: Entity): boolean {
  const target = pickBreathVictim(ctx, boss);
  if (!target) return false;
  // Turn the head onto them FIRST, then measure: the jaw travels with the
  // facing, so measuring before the turn checks a mouth that has already moved.
  boss.facing = Math.atan2(target.pos.x - boss.pos.x, target.pos.z - boss.pos.z);
  const jaw = mouthOf(boss);
  const atJaw = Math.hypot(target.pos.x - jaw.x, target.pos.z - jaw.z) <= BITE.reach;
  if (!atJaw && dist2d(target.pos, boss.pos) > BITE.bodyReach) return false;
  emitDragonFx(ctx, boss, boss.emberwakeGrounded ? 'dragon-ground-bite' : 'dragon-bite');
  const dmg = Math.round(ctx.rng.range(BITE.min, BITE.max) * (boss.mechanicDamageMult ?? 1));
  ctx.dealDamage(boss, target, dmg, false, 'physical', BITE.name, 'hit', true);
  return true;
}

/** Groundfall: he stops flying. The wings fold, he drops onto the flagstones,
 *  and for a stretch he is simply an enormous animal chasing you down and
 *  biting, no breath, no buffet (both need the wings), just teeth. It is the
 *  one window where he is at eye level and the melee camp gets a clean, close
 *  look at what they are fighting. */
function beginGroundfall(
  ctx: SimContext,
  boss: Entity,
  st: NonNullable<Entity['emberwake']>,
  ph: Phase,
): void {
  st.groundState = 'grounded';
  st.groundTimer = GROUND_FOR[ph];
  boss.emberwakeGrounded = true;
  // Any wing beat in flight is cancelled: he cannot buffet from the dirt.
  st.buffetState = 'idle';
  st.buffetStateTimer = 0;
  // He lands ON someone: the impact is a real shock through the flagstones.
  const at = pickBreathVictim(ctx, boss) ?? null;
  const x = at ? (boss.pos.x + at.pos.x) / 2 : boss.pos.x;
  const z = at ? (boss.pos.z + at.pos.z) / 2 : boss.pos.z;
  ctx.emit({ type: 'spellfxAt', x, z, school: 'physical', fx: 'nova', radius: GROUND_SLAM.radius });
  emitMobYell(ctx, boss, 'Enough of the sky. I want to hear the bones.', YELL_RANGE);
  telegraph(ctx, boss, `${boss.name} folds his wings and DROPS, he is coming for you on foot!`);
  for (const meta of ctx.players.values()) {
    const pe = ctx.entities.get(meta.entityId);
    if (!pe || pe.dead || dist2d(pe.pos, boss.pos) > GROUND_SLAM.radius) continue;
    const dmg = Math.round(
      ctx.rng.range(GROUND_SLAM.min, GROUND_SLAM.max) * (boss.mechanicDamageMult ?? 1),
    );
    ctx.dealDamage(boss, pe, dmg, false, 'physical', GROUND_SLAM.name, 'hit', true);
  }
  // The first chomp comes almost at once, the landing IS the wind-up.
  st.biteTimer = Math.min(st.biteTimer, 0.8);
}

/** Back into the air. The launch beat is a free wing buffet: the downstroke
 *  that lifts a body this size off the ground is the same one that flattens
 *  everyone standing under it. */
function endGroundfall(
  ctx: SimContext,
  boss: Entity,
  st: NonNullable<Entity['emberwake']>,
  ph: Phase,
): void {
  st.groundState = 'air';
  st.groundTimer = GROUND_EVERY[ph];
  boss.emberwakeGrounded = false;
  telegraph(ctx, boss, `${boss.name} hammers his wings down and heaves back into the air!`);
  emitDragonFx(ctx, boss, 'dragon-buffet');
  wingBuffet(ctx, boss);
  // A beat of grace before the flying rotation resumes on top of the launch.
  st.breathTimer = Math.max(st.breathTimer, 2.5);
  st.buffetTimer = BUFFET[ph];
  st.biteTimer = BITE.every;
}

// -- the per-tick driver -----------------------------------------------------------

/** True while the script owns the dragon's body (locomotion must not chase/swing).
 *  Both telegraphs plant him: the rear-back before a breath and the wing sweep
 *  before a buffet are the windows players read, and a body that keeps sliding
 *  forward through them is a body nobody can read. */
export function emberwakeScriptLocked(boss: Entity): boolean {
  const st = boss.emberwake;
  return !!st && (st.breathState === 'winding' || st.buffetState === 'winding');
}

export function updateEmberwakeEncounter(ctx: SimContext, boss: Entity): void {
  if (boss.dead) {
    if (boss.emberwake && boss.emberwake.phase !== 'dead') {
      breathReset(boss.emberwake);
      boss.emberwake.phase = 'dead';
    }
    // The corpse falls out of the air under its own weight (the render layer
    // eases him down), so the LANDED rig flag is cleared: a dead dragon plays
    // the death clip, not the wings-folded prowl.
    boss.emberwakeGrounded = false;
    return;
  }
  const st = boss.emberwake ?? initState(boss);
  if (st.phase === 'dead') boss.emberwake = initState(boss); // world-boss rescheduler reuse
  if (!st.pendingPools) st.pendingPools = []; // state authored before pools existed
  if (!st.burningPools) st.burningPools = [];
  if (!st.beamSweeps) st.beamSweeps = [];
  if (!st.buffetState) st.buffetState = 'idle'; // state authored before the wind-up
  if (st.tailTimer === undefined) st.tailTimer = TAIL[1] * 0.45;
  if (st.cinderTimer === undefined) st.cinderTimer = CINDER[2];
  if (!st.groundState) st.groundState = 'air'; // state authored before Groundfall
  if (st.groundTimer === undefined) st.groundTimer = GROUND_EVERY[1];
  if (!boss.inCombat) {
    // Out of combat he does NOT track anyone, he only turns to a player once
    // pulled. Reset to a clean opener.
    breathReset(st);
    st.breathTimer = BREATH_EVERY[1] * 0.55;
    st.biteTimer = BITE.every * 0.5;
    st.buffetTimer = BUFFET[1];
    st.tailTimer = TAIL[1] * 0.45;
    st.cinderTimer = CINDER[2];
    // He never resets mid-landing: an evading dragon takes to the air again.
    st.groundState = 'air';
    st.groundTimer = GROUND_EVERY[1];
    boss.emberwakeGrounded = false;
    return;
  }

  // He tracks his target continuously, see faceAggro. The individual beats
  // still snap his facing at the moment they fire; this keeps his head on the
  // player in between them.
  faceAggro(ctx, boss);

  // The beam lance and the warned pools both advance on their own clocks,
  // independent of whatever he does next.
  tickBeamSweeps(ctx, st);
  tickPendingPools(ctx, boss, st);

  if (!st.introSpoken) {
    st.introSpoken = true;
    emitMobYell(
      ctx,
      boss,
      'Small, warm things. I have slept under your valley since before it had a name.',
      YELL_RANGE,
    );
  }

  // HP phase ladder (one-way). Each rung tightens the rotation AND throws his
  // hide open for a long Molten Vents window: the transition is a burn phase,
  // not just a difficulty step.
  const hpFrac = boss.hp / Math.max(1, boss.maxHp);
  const phase: Phase = st.phase === 'dead' ? 1 : st.phase;
  if (phase === 1 && hpFrac <= PHASE2_HP) {
    st.phase = 2;
    emitMobYell(ctx, boss, 'ENOUGH. You have blown on the coals, now WAKE THEM.', YELL_RANGE);
    telegraph(
      ctx,
      boss,
      `${boss.name}'s hide splits with violet light as the Emberwake takes him!`,
    );
    st.breathTimer = Math.min(st.breathTimer, 2.5); // the flame comes almost at once
    st.buffetTimer = Math.min(st.buffetTimer, 4);
    st.cinderTimer = 3; // the sky opens for the first time
    openVents(ctx, boss, VENT.phaseValue, VENT.phaseDuration);
  } else if (phase === 2 && hpFrac <= PHASE3_HP) {
    st.phase = 3;
    emitMobYell(
      ctx,
      boss,
      'THEN LET IT ALL BURN, the valley, the village, and every warm little thing in it!',
      YELL_RANGE,
    );
    telegraph(ctx, boss, `${boss.name} blazes from the inside out, the Emberwake is FULLY awake!`);
    st.breathTimer = Math.min(st.breathTimer, 2);
    st.buffetTimer = Math.min(st.buffetTimer, 4);
    st.tailTimer = Math.min(st.tailTimer ?? TAIL[3], 3);
    st.cinderTimer = Math.min(st.cinderTimer ?? CINDER[3], 2.5);
    openVents(ctx, boss, VENT.phaseValue, VENT.phaseDuration);
  }
  const ph: Phase = st.phase === 'dead' ? 1 : st.phase;

  // ---- Groundfall: the stretch he spends on his feet ---------------------------
  // While he is down, the wing beats (breath and buffet both) are OFF, a folded
  // wing cannot lance flame or flatten a courtyard, and the whole kit collapses
  // to teeth and tail. He still chases, so this is the melee-friendly, readable
  // window: eye level, wings still, jaw in your face.

  st.groundTimer = (st.groundTimer ?? GROUND_EVERY[ph]) - DT;
  if (st.groundState === 'grounded') {
    if (st.groundTimer <= 0) endGroundfall(ctx, boss, st, ph);
  } else if (st.groundTimer <= 0) {
    // Never land mid-breath: the beam is a promise the players have already
    // started dodging, so let it fire and land a beat later.
    if (st.breathState === 'winding') st.groundTimer = 0.5;
    else beginGroundfall(ctx, boss, st, ph);
  }

  if (st.groundState === 'grounded') {
    // Teeth, on a much tighter clock than he can manage from the wing...
    st.biteTimer -= DT;
    if (st.biteTimer <= 0) st.biteTimer = ashenMaw(ctx, boss) ? BITE.groundEvery : 0.8;
    // ...and the tail still sweeps whatever is behind him.
    st.tailTimer = (st.tailTimer ?? TAIL[ph]) - DT;
    if (st.tailTimer <= 0) st.tailTimer = cinderLash(ctx, boss) ? TAIL[ph] : 2;
    // The pools already burning keep burning (ticked above); nothing new lights.
    return;
  }

  // ---- wing buffet (telegraphed) ---------------------------------------------
  // Ticked BEFORE the breath's early-return so the wings still come down while
  // he is rearing back for a beam: the two beats overlapping is exactly the
  // pressure that makes the fight worth dodging.

  if (st.buffetState === 'winding') {
    st.buffetStateTimer = (st.buffetStateTimer ?? 0) - DT;
    if (st.buffetStateTimer <= 0) {
      st.buffetState = 'idle';
      st.buffetStateTimer = 0;
      wingBuffet(ctx, boss);
    }
  } else {
    st.buffetTimer -= DT;
    if (st.buffetTimer <= 0) {
      st.buffetTimer = BUFFET[ph];
      st.buffetState = 'winding';
      st.buffetStateTimer = BUFFET_WINDUP;
      telegraph(ctx, boss, `${boss.name} sweeps his wings back for ${BUFFET_SPEC.name}!`);
      emitDragonFx(ctx, boss, 'dragon-buffet');
    }
  }

  // ---- tail + ember rain ------------------------------------------------------
  // Both run on their own clocks alongside the breath, so there is never a
  // stretch of the fight where the only thing to do is stand still and swing.

  st.tailTimer = (st.tailTimer ?? TAIL[ph]) - DT;
  if (st.tailTimer <= 0) {
    // Only spend the cooldown when someone was actually behind him; otherwise
    // check again shortly, so stepping behind him is punished promptly.
    st.tailTimer = cinderLash(ctx, boss) ? TAIL[ph] : 2;
  }

  if (CINDER[ph] > 0) {
    st.cinderTimer = (st.cinderTimer ?? CINDER[ph]) - DT;
    if (st.cinderTimer <= 0) {
      st.cinderTimer = CINDER[ph];
      cinderfall(ctx, boss, st, ph);
    }
  }

  // ---- breath state machine --------------------------------------------------

  if (st.breathState === 'winding') {
    st.breathStateTimer -= DT;
    // Track the victim through the wind-up so the aim stays honest, but do not
    // move: the rear-back is the window players use to spread out.
    const victim = st.breathTargetId !== null ? ctx.entities.get(st.breathTargetId) : null;
    if (victim && !victim.dead) {
      boss.facing = Math.atan2(victim.pos.x - boss.pos.x, victim.pos.z - boss.pos.z);
    }
    if (st.breathStateTimer <= 0) {
      releaseBreath(ctx, boss, st);
      st.breathState = 'idle';
      st.breathTimer = BREATH_EVERY[ph];
    }
    return;
  }

  st.breathTimer -= DT;
  if (st.breathTimer <= 0) {
    const target = pickBreathVictim(ctx, boss);
    if (!target) {
      st.breathTimer = 3; // nobody to burn: try again shortly
    } else {
      st.breathState = 'winding';
      st.breathStateTimer = BREATH_WINDUP;
      st.breathTargetId = target.id;
      telegraph(ctx, boss, `${boss.name} rears back, throat blazing violet, MOVE!`);
      return;
    }
  }

  // ---- bite ------------------------------------------------------------------

  st.biteTimer -= DT;
  if (st.biteTimer <= 0) {
    // Only consume the cooldown if the bite actually connected; otherwise retry
    // shortly, so a kited dragon still bites the moment someone steps in.
    st.biteTimer = ashenMaw(ctx, boss) ? BITE.every : 1.5;
  }
}

export { EMBERWAKE_BOSS_ID };
