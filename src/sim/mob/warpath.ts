// Warpath: a boss who has somewhere to be, instead of standing in your melee range.
//
// The problem this solves is a shape, not a number. A boss that chases whoever holds
// threat and stops at swing range is, from the raid's side, a stationary damage sponge:
// it shuffles after the tank and nothing else ever happens. Adding health or damage does
// not fix that, it makes it longer. So this boss walks a circuit of authored landmarks
// and cycles three phases:
//
//   FOCUS   He plants and fights whoever has threat: ordinary combat, which is why this
//           phase deliberately does NOT own the tick (see the 'fallthrough' result). It
//           is the only phase he is stationary in, so it is the melee uptime window and
//           the window his telegraphed slams fire in.
//   TRAVEL  He picks the next landmark and RUNS there, ignoring threat entirely. The raid
//           has to follow. Two things make the chase a fight rather than a walk:
//             - he backhands somebody standing near him on a timer, so escorting him is
//               a positioning problem rather than an autorun, and
//             - he REGENERATES whenever nobody has hurt him for a few seconds, so a raid
//               that breaks off to run undoes the phase it just spent. Ranged and casters
//               carry this window, which is the point: they are the ones who can hurt him
//               while moving.
//   WRECK   He arrives, raises both fists over the landmark, and brings them down: a
//           telegraphed ring on the same `runeCircle` machinery his other slams use, so
//           the counterplay is the one the fight already taught. Then back to FOCUS.
//
// The net effect is an encounter that crosses the zone under its own steam and reads as
// something happening TO the world, rather than a health bar parked in a field.
//
// Declared per template (`MobTemplate.warpath`) and inert for every mob without one, so
// nothing else in the world changes shape and the golden parity trace is untouched. The
// phase machine is a pure function (`nextWarpathPhase`) so its transitions can be tested
// without a Sim; the tick below is the thin part that moves the body and spends damage.
import { DUNGEON_X_THRESHOLD, MOBS } from '../data';
import type { SimContext } from '../sim_context';
import type { Aura, Entity, MobTemplate, Vec3 } from '../types';
import { angleTo, DT, DUNGEON_LEASH_DISTANCE, dist2d, LEASH_DISTANCE } from '../types';
import { splashNearbyMobs } from './boss_collateral';
import { launchFromSlam } from './boss_slams';
import { startEvadeHome } from './combat_profile';
import { emitMobYell } from './yells';

type WarpathDef = NonNullable<MobTemplate['warpath']>;

/** What a warpath tick left for the caller that owns the rest of the engaged tick. */
export type WarpathTickResult =
  /** The warpath owned this tick: it moved the body and spent its own mechanics. */
  | 'handled'
  /** He gave the pull up this tick and is walking home (warpathGiveUp): nothing else runs. */
  | 'evaded'
  /** Not a warpather, no live target, or FOCUS: the ordinary combat runner takes it. */
  | 'fallthrough';

/** Why a warpather drops his pull and walks home to his bed. */
export type WarpathGiveUp =
  /** He is past the hard tether: however he got there, he goes home. */
  | 'tether'
  /** No living player is anywhere near him: the raid left, died, or released. */
  | 'alone'
  /** Nobody has hurt him for the whole window: a pull nobody is fighting. */
  | 'unharried';

/**
 * A FOCUS fight this close to the hard tether marches on to his next stop instead (see
 * focusDraggedToLeash), so a raid actively fighting him at his outermost picket moves the
 * fight along the circuit rather than resetting it on the tether.
 */
export const WARPATH_TETHER_MARCH_MARGIN = 5;

/**
 * Whether the pull is over, as a pure function of where he stands and who is on him.
 *
 * The rules are the owner's: he is never kitable out of his area, and never stays engaged
 * with nobody fighting him. The tether is absolute (every phase, every cause); the other two
 * are the "nobody is fighting" pair. The unharried clock is the one his Barrowmend regen
 * already reads (any lost health resets it), so a raid that keeps hitting him while it
 * chases never trips it, and the regen's own three-second rule is untouched.
 */
export function warpathGiveUp(
  distFromBed: number,
  playerNear: boolean,
  unharriedSeconds: number,
  def: WarpathDef,
): WarpathGiveUp | null {
  if (distFromBed > def.giveUp.tetherRadius) return 'tether';
  if (!playerNear) return 'alone';
  if (unharriedSeconds >= def.giveUp.unharriedSeconds) return 'unharried';
  return null;
}

/** A living, non-ghost player within `range` of him. */
function livingPlayerWithin(ctx: SimContext, mob: Entity, range: number): boolean {
  for (const meta of ctx.players.values()) {
    const p = ctx.entities.get(meta.entityId);
    if (!p || p.dead || p.ghost) continue;
    if (dist2d(p.pos, mob.pos) <= range) return true;
  }
  return false;
}

export type WarpathPhase = 'focus' | 'travel' | 'wreck';

/** How long the arrival ring is shown before the fists land. */
export const WARPATH_WRECK_FUSE_SEC = 1.4;

/**
 * The phase machine, as a pure function of the phase timer and the distance left to run.
 *
 * Split out from the tick deliberately: a phase machine tangled into a mutation loop
 * looks correct at a glance and is wrong only on a transition nobody happened to
 * reproduce, which is the failure this is cheap insurance against.
 */
export function nextWarpathPhase(
  phase: WarpathPhase,
  timer: number,
  distToDestination: number,
  def: WarpathDef,
  /** FOCUS has been dragged to the edge of his tether (focusDraggedToLeash below): he
   *  marches on to his next stop rather than evading out of the fight. */
  draggedToLeash = false,
): WarpathPhase {
  if (phase === 'focus') return timer <= 0 || draggedToLeash ? 'travel' : 'focus';
  if (phase === 'travel') {
    if (distToDestination <= def.arriveRadius) return 'wreck';
    // The patience cap. Without it a landmark he cannot quite reach (a body wedged on
    // geometry, a destination authored inside a rock) leaves him travelling forever,
    // healing every time the raid loses him: a soft-lock wearing a mechanic's clothes.
    return timer <= 0 ? 'wreck' : 'travel';
  }
  return timer <= 0 ? 'focus' : 'wreck';
}

/** Seconds a phase runs for once entered. */
export function warpathPhaseDuration(phase: WarpathPhase, def: WarpathDef): number {
  if (phase === 'focus') return def.focusSeconds;
  if (phase === 'travel') return def.travelTimeoutSeconds;
  return def.wreckSeconds;
}

/**
 * The next stop on the circuit: the following entry, wrapping.
 *
 * A circuit rather than a random or furthest-first pick, and the choice is load-bearing.
 * Random draws a neighbouring landmark as often as a distant one, and a three-second trip
 * is not a chase. Furthest-first looks better and is worse: with four landmarks it
 * ping-pongs between the two extremes forever and the ones in the middle, the town
 * included, are never visited at all. Walking the list in order visits every authored
 * stop, lets the pacing be designed rather than emerge, is learnable by a raid on the
 * second lap, and draws no rng, so it cannot move the shared stream.
 */
export function nextWarpathDestination(current: number, count: number): number {
  if (count <= 0) return 0;
  return (current + 1) % count;
}

function destinationPos(def: WarpathDef, index: number): Vec3 {
  const d = def.destinations[index] ?? def.destinations[0];
  return { x: d.x, y: 0, z: d.z };
}

/** Enter a phase, stamping its clock and firing whatever announces it. */
function beginPhase(ctx: SimContext, mob: Entity, def: WarpathDef, phase: WarpathPhase): void {
  mob.warpathPhase = phase;
  mob.warpathTimer = warpathPhaseDuration(phase, def);
  if (phase === 'travel') {
    mob.warpathDestination = nextWarpathDestination(
      mob.warpathDestination ?? -1,
      def.destinations.length,
    );
    const stop = def.destinations[mob.warpathDestination];
    if (stop?.yell) emitMobYell(ctx, mob, stop.yell, def.yellRange);
    return;
  }
  if (phase === 'wreck') {
    // Show the ring, then land the blow: the same telegraph-then-detonate contract his
    // other two slams run on, so the counterplay the fight already taught still applies
    // at the one moment the raid is least likely to be standing still.
    mob.warpathBlastAt = ctx.time + WARPATH_WRECK_FUSE_SEC;
    ctx.emit({
      type: 'spellfxAt',
      x: mob.pos.x,
      z: mob.pos.z,
      school: (def.wreck.school ?? 'physical') as Aura['school'],
      fx: 'runeCircle',
      radius: def.wreck.radius,
      duration: WARPATH_WRECK_FUSE_SEC,
    });
    ctx.emit({
      type: 'spellfx',
      sourceId: mob.id,
      targetId: mob.id,
      school: (def.wreck.school ?? 'physical') as Aura['school'],
      fx: 'windup',
      ability: WARPATH_WRECK_ABILITY,
    });
    if (def.wreckYell) emitMobYell(ctx, mob, def.wreckYell, def.yellRange);
  }
}

/**
 * The animation cues, which are ability ids only in the sense the renderer needs.
 *
 * Neither is a castable ability: they are the same `fx: 'windup'` channel the telegraphed
 * slams already ride (mob/locomotion.ts), routed by the renderer through `triggerAttack`
 * into the visual's `attackByAbility` map. If the two sides ever disagree the mechanic
 * still resolves and the boss simply plays his ordinary swing, which is why a test pins
 * the pairing rather than leaving it to be noticed in a raid.
 */
export const WARPATH_SWIPE_ABILITY = 'mob_warpath_swipe';
export const WARPATH_WRECK_ABILITY = 'mob_warpath_wreck';

/**
 * Advance one warpath tick for an engaged mob.
 *
 * FOCUS returns 'fallthrough' on purpose: it is ordinary boss combat, and reimplementing
 * it here would duplicate the swing timer, the hit table, the threat read and every aura
 * interaction to gain nothing at all.
 */
export function tickWarpath(ctx: SimContext, mob: Entity): WarpathTickResult {
  const def = MOBS[mob.templateId]?.warpath;
  if (!def || def.destinations.length === 0) return 'fallthrough';

  // No live target means the pull is over: hand the tick back so the ordinary runner can
  // retarget or drop combat, and forget the circuit so the next pull opens on FOCUS.
  const target = mob.aggroTargetId !== null ? ctx.entities.get(mob.aggroTargetId) : null;
  if (!target || target.dead) {
    resetWarpath(mob);
    return 'fallthrough';
  }

  if (mob.warpathPhase === undefined) {
    mob.warpathLastHp = mob.hp;
    mob.warpathUnharried = 0;
    mob.warpathSwipeTimer = def.swipe.every;
    beginPhase(ctx, mob, def, 'focus');
  }

  trackHarassment(mob);

  // The give-up check runs on every engaged tick, before any phase moves him, so no phase
  // (a chase, a leg, a wreck) can carry him past it. Measured from his spawn, which is his
  // bed for the live boss and where the evade walks him home to.
  const quit = warpathGiveUp(
    dist2d(mob.pos, mob.spawnPos),
    livingPlayerWithin(ctx, mob, def.giveUp.playerRange),
    mob.warpathUnharried ?? 0,
    def,
  );
  if (quit) {
    startEvadeHome(mob);
    resetWarpath(mob);
    return 'evaded';
  }

  mob.warpathTimer = Math.max(0, (mob.warpathTimer ?? 0) - DT);

  const dest = destinationPos(def, mob.warpathDestination ?? 0);
  const phase = (mob.warpathPhase ?? 'focus') as WarpathPhase;
  const next = nextWarpathPhase(
    phase,
    mob.warpathTimer ?? 0,
    dist2d(mob.pos, dest),
    def,
    phase === 'focus' && focusDraggedToLeash(mob),
  );
  if (next !== phase) {
    beginPhase(ctx, mob, def, next);
    return next === 'focus' ? 'fallthrough' : 'handled';
  }

  if (phase === 'wreck') return tickWreck(ctx, mob, def, target);
  if (phase === 'travel') return tickTravel(ctx, mob, def, dest);
  return 'fallthrough';
}

/**
 * Whether FOCUS has been dragged to the edge of his tether: the fight he is planted in has
 * walked him (almost) as far from his landmark as the soft leash allows.
 *
 * At that point he marches on to his next stop instead of evading. An evade here was the
 * owner's "he ran to a spot and did nothing": his own slams punt the player he is fighting
 * a few yards at a time, he follows, and half a minute of that crosses the 45-yard leash,
 * so he dropped the pull, walked home immune to wherever he was raised (for a /dev spawn
 * copy, some random spot beside a camp) and stood there, and the next pull restarted the
 * circuit on a picket he had already flattened. Marching on keeps the tether's real job,
 * since a kiter still cannot drag him off across the zone: the circuit takes him back to
 * the pickets. Checked one yard inside the leash, so the combat runner's own leash test
 * (mob/combat_profile.ts, the same distance) never sees him past it in this phase.
 *
 * The same holds for the HARD tether round his bed (warpathGiveUp): a focus fight within
 * WARPATH_TETHER_MARCH_MARGIN of it marches on too, so a raid fighting him at his outermost
 * picket moves the fight along the circuit, and only a body displaced past the tether some
 * other way ever evades on it. Every stop and leg sits inside the tether, so the march
 * always carries him back in.
 */
export function focusDraggedToLeash(mob: Entity): boolean {
  const leash = mob.spawnPos.x > DUNGEON_X_THRESHOLD ? DUNGEON_LEASH_DISTANCE : LEASH_DISTANCE;
  if (dist2d(mob.pos, mob.leashAnchor ?? mob.spawnPos) > leash - 1) return true;
  const tether = MOBS[mob.templateId]?.warpath?.giveUp.tetherRadius;
  return (
    tether !== undefined && dist2d(mob.pos, mob.spawnPos) > tether - WARPATH_TETHER_MARCH_MARGIN
  );
}

/**
 * Seconds since anything reduced his health, measured off HP rather than off a damage
 * hook.
 *
 * Every source counts that way, bleeds and pets and reflected damage included, with no
 * new plumbing threaded through the damage path that a future damage source could forget
 * to call. The 0.5 floor keeps a rounding wobble from reading as a hit.
 */
function trackHarassment(mob: Entity): void {
  const lastHp = mob.warpathLastHp ?? mob.hp;
  if (mob.hp < lastHp - 0.5) mob.warpathUnharried = 0;
  else mob.warpathUnharried = (mob.warpathUnharried ?? 0) + DT;
  mob.warpathLastHp = mob.hp;
}

/** TRAVEL: he goes where he is going. Threat does not steer him. */
function tickTravel(ctx: SimContext, mob: Entity, def: WarpathDef, dest: Vec3): WarpathTickResult {
  if (!ctx.isRooted(mob)) {
    ctx.moveToward(mob, ctx.groundPos(dest.x, dest.z), mob.moveSpeed * def.travelSpeedMult);
  } else {
    mob.facing = angleTo(mob.pos, dest);
  }
  mob.aiState = 'chase';
  // Drag the leash anchor along with him, which is what lets him keep the tether at all.
  //
  // The anchor is stamped once at the pull and never moves, so a warpather measured
  // against it breaks the 45-yard soft leash on his first long leg and evades home in the
  // middle of his own mechanic. The obvious fix is to turn leashing off for him; that
  // leaves an open-world boss one kiting player can drag across the map forever, with
  // nothing in the fight that ever brings him back. Refreshing the anchor here says the
  // real thing instead: while he is TRAVELLING he is exactly where he means to be, so
  // there is nothing to leash him back to. The moment he stops, the anchor stops with him
  // and the tether re-tightens around the landmark he arrived at, which is where a raid
  // dragging him off into the fen should still be pulled up short.
  mob.leashAnchor = { x: mob.pos.x, y: mob.pos.y, z: mob.pos.z };

  // The reason the chase is mandatory rather than advisory: stop hurting him and the
  // phase you just spent starts coming back.
  //
  // One chunky heal a second rather than a 20 Hz dribble, fired on the tick the unharried
  // clock crosses a whole second (which is the same event a second timer field would have
  // counted, without the field). The raid has to SEE the bar climb to learn the rule, and
  // twenty rounding-error green numbers a second is noise rather than feedback.
  const unharried = mob.warpathUnharried ?? 0;
  if (
    unharried >= def.regen.unharriedSeconds &&
    mob.hp < mob.maxHp &&
    Math.floor(unharried) > Math.floor(unharried - DT)
  ) {
    // canCrit false: a boss regenerating must not roll, so this draws no rng at all and
    // the shared stream orders identically whether or not the raid let him breathe.
    ctx.applyHeal(mob, mob, mob.maxHp * def.regen.pctPerSecond, def.regen.name, null, false);
    // Re-baseline off the HEALED value: the harassment check compares against the last
    // observed hp, and without this the heal reads as damage on the following tick and
    // resets the very timer that authorised it.
    mob.warpathLastHp = mob.hp;
  }

  mob.warpathSwipeTimer = Math.max(0, (mob.warpathSwipeTimer ?? def.swipe.every) - DT);
  if (mob.warpathSwipeTimer <= 0) {
    mob.warpathSwipeTimer = def.swipe.every;
    fireSwipe(ctx, mob, def);
  }
  return 'handled';
}

/** WRECK: planted over the landmark, ring burning down, then the fists land. */
function tickWreck(
  ctx: SimContext,
  mob: Entity,
  def: WarpathDef,
  target: Entity,
): WarpathTickResult {
  mob.aiState = 'attack';
  mob.facing = angleTo(mob.pos, target.pos);
  const fuse = mob.warpathBlastAt;
  if (fuse !== undefined && fuse !== null && ctx.time >= fuse) {
    mob.warpathBlastAt = null;
    fireWreck(ctx, mob, def);
  }
  return 'handled';
}

/**
 * The travelling backhand: one player near him, picked at random, hit hard.
 *
 * One rather than everyone in the radius, and random rather than nearest, because both
 * make it read as a giant swatting at what is buzzing around him instead of a pulsing
 * aura. It also keeps the escort survivable for a raid that has to stay close, while
 * still making standing next to him a choice with a cost.
 */
function fireSwipe(ctx: SimContext, mob: Entity, def: WarpathDef): void {
  const school = (def.swipe.school ?? 'physical') as Aura['school'];
  let picked: Entity | null = null;
  let seen = 0;
  for (const meta of ctx.players.values()) {
    const p = ctx.entities.get(meta.entityId);
    if (!p || p.dead || dist2d(p.pos, mob.pos) > def.swipe.radius) continue;
    // Reservoir sample: one draw per candidate, so the pick is uniform without building
    // an array, and the draw count is a pure function of who is in range.
    seen++;
    if (ctx.rng.next() < 1 / seen) picked = p;
  }
  if (!picked) return;
  ctx.emit({
    type: 'spellfx',
    sourceId: mob.id,
    targetId: mob.id,
    school,
    fx: 'windup',
    ability: WARPATH_SWIPE_ABILITY,
  });
  // He does NOT turn to face the victim, and that omission is the point. A running body
  // that snaps its yaw onto whatever it is swatting spends the next frame facing one way
  // and translating another, which is the exact "runs forward, moves sideways" artifact
  // this whole pass exists to kill: a probe caught it at 2.6s intervals, one per swipe,
  // with the facing error at a clean pi. A giant backhands what is buzzing at him without
  // breaking stride.
  const dmg = Math.round(
    ctx.rng.range(def.swipe.min, def.swipe.max) * (mob.mechanicDamageMult ?? 1),
  );
  ctx.dealDamage(mob, picked, dmg, false, school, def.swipe.name, 'hit', true);
}

/** The arrival slam: everyone still inside the ring he showed them. */
function fireWreck(ctx: SimContext, mob: Entity, def: WarpathDef): void {
  const school = (def.wreck.school ?? 'physical') as Aura['school'];
  // Positioned and sized, so the renderer draws the blast at the ring rather than on the
  // body: this is the same cue the telegraphed slams emit, and it is what routes through
  // Balgath's ground-effect layer into a crater and a camera jolt.
  ctx.emit({
    type: 'spellfxAt',
    sourceId: mob.id,
    x: mob.pos.x,
    z: mob.pos.z,
    school,
    fx: 'nova',
    radius: def.wreck.radius,
  });
  for (const meta of ctx.players.values()) {
    const p = ctx.entities.get(meta.entityId);
    if (!p || p.dead || dist2d(p.pos, mob.pos) > def.wreck.radius) continue;
    const dmg = Math.round(
      ctx.rng.range(def.wreck.min, def.wreck.max) * (mob.mechanicDamageMult ?? 1),
    );
    ctx.dealDamage(mob, p, dmg, false, school, def.wreck.name, 'hit', true);
  }
  // The landmark he came to wreck is usually surrounded by whatever lives there. This is the
  // slam where that matters most: it is the one that craters the town.
  splashNearbyMobs(
    ctx,
    mob,
    mob.pos,
    def.wreck.radius,
    def.wreck.min,
    def.wreck.max,
    school,
    def.wreck.name,
    undefined,
    // The one blast that flattens a picket: its squad dies HERE, under the ring the raid
    // chased him to, never earlier to a stray focus-phase slam (mob/boss_collateral.ts).
    true,
  );
  // The arrival slam throws them, like his other two: same shared rule, same opt-in.
  launchFromSlam(ctx, mob, mob.pos, def.wreck.radius);
}

/**
 * Drop the circuit, so the next pull opens on FOCUS at wherever he now stands.
 *
 * Written as guarded assignments rather than unconditional ones: an entity that never
 * walked a warpath must come out of this with the fields still UNDEFINED, since the
 * parity golden samples entity shape and a mob that gained a row of nulls on every evade
 * would churn it for no behavior change at all.
 */
export function resetWarpath(mob: Entity): void {
  if (mob.warpathPhase === undefined) return;
  mob.warpathPhase = undefined;
  mob.warpathTimer = 0;
  mob.warpathDestination = undefined;
  mob.warpathUnharried = 0;
  mob.warpathSwipeTimer = 0;
  mob.warpathBlastAt = null;
}
