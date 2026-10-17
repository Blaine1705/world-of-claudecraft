// Old Thatchgrin's fight: three telegraphed reads, each dodged a different way.
//
//   KINDLED GOURD   He rips a glowing gourd off his own shoulders and hurls it at a
//                   player (one per two living players in reach, up to three). A
//                   ground ring marks where each will land; after the windup it bursts
//                   in fire. Dodged by MOVING out of the ring.
//   SMOLDERING CHAFF Every burst leaves the stubble burning where it landed: a smaller
//                   patch that scorches anyone standing in it once a second until it
//                   gutters out. Dodged by NOT STANDING in it, so a fight that runs long
//                   slowly fills his field and the group has to keep relocating him.
//   THE CALLS       At falling health he throws his arms wide: first his crows burst
//                   off him (Crowcall), then strawlings climb out of the stubble (Chaff
//                   Rising), twice each, once per pull. Answered by the group turning to
//                   the adds, the classic switch.
//
// Telegraphs never overlap: a call or a throw claims the ground for its windup plus
// `spacing`, and a due throw waits for it. Numbers are content (THATCHGRIN_KIT, sourced in
// content/gourdlight_eve_scarecrow.ts).
//
// Only players in his fight (his hate table, or who hurt him this pull) are aimed at or
// struck, so a passer-by on the road is never caught.
//
// Determinism: every draw is ctx.rng, in a fixed order: the gourd victims (fighters sorted
// by entity id, a partial Fisher-Yates over them), then one damage roll per player struck,
// per gourd in throw order, then per chaff patch in list order. Nothing here runs outside
// his pull, and he only exists while Gourdlight Eve runs, so no shipped trace moves.
import {
  THATCHGRIN_CHAFF_ABILITY,
  THATCHGRIN_GOURD_ABILITY,
  THATCHGRIN_KIT,
  THATCHGRIN_SUMMON_ABILITY,
} from '../content/gourdlight_eve_scarecrow';
import { MOBS } from '../data';
import { levelScaledMechanicDamage } from '../mob/mechanic_level_scale';
import { emitMobYell } from '../mob/yells';
import type { SimContext } from '../sim_context';
import type { Entity } from '../types';
import { DT, dist2d } from '../types';
import { CHAFF_STRIDE, freshScarecrowKit, type ScarecrowState } from './scarecrow_state';

/** Recorded SFX already in the manifest (sfx_manifest.generated.ts). */
export const GOURD_BURST_SFX = 'impact_fire';
export const GOURD_THROW_SFX = 'proj_fire';
export const CALL_SFX = 'spell_nova';

const EPS = 1e-6;

/** Whether the boss is in a live pull (chasing or swinging, never walking home). */
export function scarecrowEngaged(boss: Entity): boolean {
  return !boss.dead && boss.inCombat && (boss.aiState === 'chase' || boss.aiState === 'attack');
}

/** The players in HIS fight, alive, in id order: anyone on his hate table (a pet's threat
 *  counts for its owner) or who has hurt him this pull. A passer-by who never joined is
 *  never his target and never caught in his fire. */
function fightersSorted(ctx: SimContext, boss: Entity): Entity[] {
  const ids = new Set<number>(boss.bossDamagers);
  for (const id of boss.threat.keys()) {
    const e = ctx.entities.get(id);
    ids.add(e && e.ownerId !== null ? e.ownerId : id);
  }
  const out: Entity[] = [];
  for (const id of ids) {
    const p = ctx.entities.get(id);
    if (p && p.kind === 'player' && !p.dead) out.push(p);
  }
  return out.sort((a, b) => a.id - b.id);
}

function strike(
  ctx: SimContext,
  boss: Entity,
  p: Entity,
  min: number,
  max: number,
  school: string,
  name: string,
): void {
  const dmg = Math.round(ctx.rng.range(min, max) * (boss.mechanicDamageMult ?? 1));
  ctx.dealDamage(
    boss,
    p,
    levelScaledMechanicDamage(boss, p, dmg),
    false,
    school,
    name,
    'hit',
    true,
  );
}

/** The gourds' victims: everyone alive within reach, in id order, one gourd per
 *  `playersPerGourd` of them (at least one, at most `maxCount`), picked by partial shuffle. */
export function pickGourdVictims(ctx: SimContext, boss: Entity): Entity[] {
  const g = THATCHGRIN_KIT.gourd;
  const pool = fightersSorted(ctx, boss).filter((p) => dist2d(p.pos, boss.pos) <= g.maxRange);
  if (pool.length === 0) return [];
  const count = Math.min(g.maxCount, Math.max(1, Math.ceil(pool.length / g.playersPerGourd)));
  const picks = Math.min(count, pool.length);
  for (let k = 0; k < picks; k++) {
    const j = ctx.rng.int(k, pool.length - 1);
    const tmp = pool[k];
    pool[k] = pool[j];
    pool[j] = tmp;
  }
  return pool.slice(0, picks);
}

/** Throw now: the rings go down on the victims' current spots. Draws the victim picks. */
export function startKindledGourd(ctx: SimContext, boss: Entity, st: ScarecrowState): boolean {
  const kit = st.kit;
  if (!kit) return false;
  const g = THATCHGRIN_KIT.gourd;
  const victims = pickGourdVictims(ctx, boss);
  if (victims.length === 0) return false;
  kit.gourdWindup = g.windup;
  kit.gourdAims = [];
  for (const v of victims) {
    kit.gourdAims.push(v.pos.x, v.pos.z);
    ctx.emit({
      type: 'spellfxAt',
      sourceId: boss.id,
      targetId: v.id,
      x: v.pos.x,
      z: v.pos.z,
      school: g.school,
      fx: 'runeCircle',
      radius: g.radius,
      duration: g.windup,
      ability: THATCHGRIN_GOURD_ABILITY,
    });
  }
  // The throw clip and its whoosh (the renderer flies a lit gourd from his hand to
  // each ring, timed to land on the ring's last frame).
  ctx.emit({
    type: 'spellfx',
    sourceId: boss.id,
    targetId: boss.id,
    school: g.school,
    fx: 'windup',
    ability: THATCHGRIN_GOURD_ABILITY,
  });
  kit.gourdTimer = g.every;
  kit.spacing = g.windup + THATCHGRIN_KIT.spacing;
  return true;
}

function landGourds(ctx: SimContext, boss: Entity, st: ScarecrowState): void {
  const kit = st.kit;
  if (!kit) return;
  const g = THATCHGRIN_KIT.gourd;
  const c = THATCHGRIN_KIT.chaff;
  const players = fightersSorted(ctx, boss);
  for (let i = 0; i + 1 < kit.gourdAims.length; i += 2) {
    const x = kit.gourdAims[i];
    const z = kit.gourdAims[i + 1];
    ctx.emit({
      type: 'spellfxAt',
      sourceId: boss.id,
      x,
      z,
      school: g.school,
      fx: 'nova',
      radius: g.radius,
      ability: THATCHGRIN_GOURD_ABILITY,
      ...(i === 0 ? { sfxKey: GOURD_BURST_SFX } : {}),
    });
    for (const p of players) {
      if (p.dead || dist2d(p.pos, { x, y: 0, z }) > g.radius) continue;
      strike(ctx, boss, p, g.min, g.max, g.school, g.name);
    }
    // The stubble catches where it burst; the renderer burns it for exactly as long.
    kit.chaff.push(x, z, c.seconds, c.interval);
    ctx.emit({
      type: 'spellfxAt',
      sourceId: boss.id,
      x,
      z,
      school: c.school,
      fx: 'tick',
      radius: c.radius,
      duration: c.seconds,
      ability: THATCHGRIN_CHAFF_ABILITY,
    });
  }
  kit.gourdAims = [];
}

/** Burn whoever stands in a patch once per interval; drop the patches that guttered out. */
function tickChaff(ctx: SimContext, boss: Entity, st: ScarecrowState): void {
  const kit = st.kit;
  if (!kit || kit.chaff.length === 0) return;
  const c = THATCHGRIN_KIT.chaff;
  const kept: number[] = [];
  let players: Entity[] | null = null;
  for (let i = 0; i + CHAFF_STRIDE - 1 < kit.chaff.length; i += CHAFF_STRIDE) {
    const x = kit.chaff[i];
    const z = kit.chaff[i + 1];
    const remaining = kit.chaff[i + 2] - DT;
    let burn = kit.chaff[i + 3] - DT;
    if (burn <= EPS) {
      burn += c.interval;
      players ??= fightersSorted(ctx, boss);
      for (const p of players) {
        if (p.dead || dist2d(p.pos, { x, y: 0, z }) > c.radius) continue;
        strike(ctx, boss, p, c.min, c.max, c.school, c.name);
      }
    }
    if (remaining > EPS) kept.push(x, z, remaining, burn);
  }
  kit.chaff = kept;
}

/** Arms wide: the call's windup starts (its bark and its clip), the adds land after it. */
export function startCall(ctx: SimContext, boss: Entity, st: ScarecrowState): boolean {
  const kit = st.kit;
  if (!kit) return false;
  const call = THATCHGRIN_KIT.calls[kit.callsFired];
  if (!call) return false;
  kit.callWindup = THATCHGRIN_KIT.callWindup;
  kit.spacing = THATCHGRIN_KIT.callWindup + THATCHGRIN_KIT.spacing;
  const tmpl = MOBS[boss.templateId];
  if (tmpl?.yells?.summon) emitMobYell(ctx, boss, tmpl.yells.summon);
  ctx.emit({
    type: 'spellfx',
    sourceId: boss.id,
    targetId: boss.id,
    school: 'nature',
    fx: 'windup',
    ability: THATCHGRIN_SUMMON_ABILITY,
  });
  return true;
}

function landCall(ctx: SimContext, boss: Entity, st: ScarecrowState): void {
  const kit = st.kit;
  if (!kit) return;
  const call = THATCHGRIN_KIT.calls[kit.callsFired];
  kit.callsFired++;
  if (!call) return;
  ctx.emit({
    type: 'spellfxAt',
    sourceId: boss.id,
    x: boss.pos.x,
    z: boss.pos.z,
    school: 'nature',
    fx: 'burst',
    radius: 4,
    ability: THATCHGRIN_SUMMON_ABILITY,
    sfxKey: CALL_SFX,
  });
  ctx.spawnBossAdds(boss, call.mobId, call.count);
}

/** Drop a pull's kit: its telegraphs, its burning ground. Adds go with the pull. */
export function resetScarecrowKit(ctx: SimContext, boss: Entity | null, st: ScarecrowState): void {
  if (!st.kit) return;
  st.kit = null;
  if (boss && !boss.dead) ctx.despawnSummonedAdds(boss);
}

/** One tick of his fight (called by scarecrow.ts while he lives). */
export function tickScarecrowKit(ctx: SimContext, boss: Entity, st: ScarecrowState): void {
  if (!scarecrowEngaged(boss)) {
    resetScarecrowKit(ctx, boss, st);
    return;
  }
  if (!st.kit || st.kit.bossId !== boss.id)
    st.kit = freshScarecrowKit(boss.id, THATCHGRIN_KIT.gourd.first);
  const kit = st.kit;
  // Aftermath first: what is already on the ground resolves wherever he has walked.
  tickChaff(ctx, boss, st);
  if (kit.gourdWindup > 0) {
    kit.gourdWindup -= DT;
    if (kit.gourdWindup <= EPS) {
      kit.gourdWindup = 0;
      landGourds(ctx, boss, st);
    }
  }
  if (kit.callWindup > 0) {
    kit.callWindup -= DT;
    if (kit.callWindup <= EPS) {
      kit.callWindup = 0;
      landCall(ctx, boss, st);
    }
  }
  if (kit.spacing > 0) kit.spacing = Math.max(0, kit.spacing - DT);
  if (kit.gourdTimer > 0) kit.gourdTimer = Math.max(0, kit.gourdTimer - DT);
  if (kit.gourdWindup > 0 || kit.callWindup > 0 || kit.spacing > 0) return;
  // A due call outranks a due throw: the health thresholds are the fight's beats.
  const call = THATCHGRIN_KIT.calls[kit.callsFired];
  const hpFrac = boss.hp / Math.max(1, boss.maxHp);
  if (call && hpFrac <= call.atHpPct) {
    startCall(ctx, boss, st);
    return;
  }
  if (kit.gourdTimer <= 0) startKindledGourd(ctx, boss, st);
}
