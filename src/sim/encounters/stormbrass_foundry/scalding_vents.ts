// Line-Master Tock's Scalding Vents (line_master.ts runs it each fight tick):
// the steam grilles in every Main Line floor that is not a belt (the walkways,
// the apron past the press and the lip before the chute: ids.ts ventFloors)
// blow on a rhythm, so the belts are the ONLY floor to fight on (the owner's
// call: no apron to tank the Line-Master on and skip the presses) and the
// rest is only for crossing.
//
//   off    ventEvery - ventWarning - ventScald seconds of quiet (the first
//          warning comes ventFirst seconds into the fight).
//   warn   ventWarning seconds: every walkway is painted (one strip object a
//          walkway, template warn) and the grilles hiss.
//   scald  ventScald seconds (template scald): a tick of fire damage every
//          ventTickEvery to everyone standing on Main Line floor that is not
//          a belt (onWalkway), the first the moment the steam bursts.
//
// A player on a walkway wears the TOCK_SCALDING_VENTS aura while the vents
// warn (value2 0) or scald (value2 1), its clock the phase's seconds left: the
// HUD alert and the debuff read it. Every visible state rides the strip
// objects and that aura, so the online client mirrors it with no wire change.
// Deterministic: fixed DT countdowns; the only rng draws are damage rolls,
// in entity-id order.

import { MAIN_LINE, MAIN_LINE_BELTS } from '../../content/stormbrass_foundry_layout';
import { emitMobYell } from '../../mob/yells';
import type { InstanceSlot } from '../../sim';
import type { SimContext } from '../../sim_context';
import { DT, type Entity, type TockFightState } from '../../types';
import {
  claimPlayers,
  dropAuraById,
  dropEncounterObject,
  localOf,
  mechanicDamage,
  spawnFoundryObject,
} from './claim';
import {
  FOUNDRY_VENT_TEMPLATES,
  onWalkway,
  TOCK_TUNING as T,
  TOCK_SCALDING_VENTS,
  walkwayStrips,
} from './ids';

/** His yell as the first vents of the fight hiss (re-localized by
 *  src/ui/sim_i18n.ts; TOCK_LINES.vents). */
export const VENTS_YELL = "Steam's up! Off my walkways and onto the line!";

const BELTS = MAIN_LINE_BELTS;
const EPS = 1e-9;
/** The quiet stretch between one burst's end and the next warning. */
const VENT_REST = T.ventEvery - T.ventWarning - T.ventScald;

/** A fresh cycle: quiet until the first warning. */
export function freshVents(): TockFightState['vent'] {
  return { phase: 'off', timer: T.ventFirst, tick: 0, objectIds: [], cycles: 0 };
}

function dropStrips(ctx: SimContext, inst: InstanceSlot, st: TockFightState): void {
  for (const id of st.vent.objectIds) dropEncounterObject(ctx, inst, id);
  st.vent.objectIds = [];
}

function emitVents(ctx: SimContext, boss: Entity, st: TockFightState): void {
  // The hiss (and the client's cue to restart its look), anchored on the
  // middle walkway's strip so it sounds from the heart of the line.
  const mid = st.vent.objectIds[Math.floor(st.vent.objectIds.length / 2)];
  ctx.emit({
    type: 'spellfx',
    sourceId: boss.id,
    targetId: mid ?? boss.id,
    school: 'fire',
    fx: 'windup',
    ability: TOCK_SCALDING_VENTS,
  });
}

/** Paint every walkway: the steam bursts ventWarning seconds later. */
export function startVents(
  ctx: SimContext,
  inst: InstanceSlot,
  boss: Entity,
  st: TockFightState,
): void {
  dropStrips(ctx, inst, st);
  const o = ctx.instanceOriginOf(inst);
  const len = BELTS.z1 - BELTS.z0;
  const zc = (BELTS.z0 + BELTS.z1) / 2;
  for (const w of walkwayStrips(MAIN_LINE, BELTS)) {
    const strip = spawnFoundryObject(
      ctx,
      inst,
      FOUNDRY_VENT_TEMPLATES.warn,
      'Scalding Vents',
      o.x + (w.x0 + w.x1) / 2,
      o.z + zc,
      len,
    );
    st.vent.objectIds.push(strip.id);
  }
  st.vent.phase = 'warn';
  st.vent.timer = T.ventWarning;
  st.vent.tick = 0;
  st.vent.cycles++;
  emitVents(ctx, boss, st);
  if (st.vent.cycles === 1) emitMobYell(ctx, boss, VENTS_YELL);
}

function burst(ctx: SimContext, boss: Entity, st: TockFightState): void {
  st.vent.phase = 'scald';
  st.vent.timer = T.ventScald;
  for (const id of st.vent.objectIds) {
    const strip = ctx.entities.get(id);
    if (strip) strip.templateId = FOUNDRY_VENT_TEMPLATES.scald;
  }
  emitVents(ctx, boss, st);
}

function scald(ctx: SimContext, inst: InstanceSlot, boss: Entity): void {
  for (const p of claimPlayers(ctx, inst)) {
    const at = localOf(ctx, inst, p);
    if (!onWalkway(MAIN_LINE, BELTS, at.x, at.z)) continue;
    ctx.dealDamage(
      boss,
      p,
      mechanicDamage(ctx, boss, T.ventMin, T.ventMax),
      false,
      'fire',
      'Scalding Vents',
      'hit',
      true,
    );
  }
}

/** Keep the walkway aura on exactly the players standing on a walkway while
 *  the vents warn or scald (updated in place: no re-application each tick). */
function markWalkers(ctx: SimContext, inst: InstanceSlot, boss: Entity, st: TockFightState) {
  const live = st.vent.phase !== 'off';
  const scalding = st.vent.phase === 'scald' ? 1 : 0;
  const total = scalding ? T.ventScald : T.ventWarning;
  const left = Math.max(0.05, st.vent.timer);
  for (const p of claimPlayers(ctx, inst)) {
    const at = localOf(ctx, inst, p);
    const has = p.auras.find((a) => a.id === TOCK_SCALDING_VENTS);
    if (!live || !onWalkway(MAIN_LINE, BELTS, at.x, at.z)) {
      if (has) dropAuraById(p, TOCK_SCALDING_VENTS);
      continue;
    }
    if (has) {
      has.remaining = left;
      has.duration = total;
      has.value2 = scalding;
      continue;
    }
    ctx.applyAura(p, {
      id: TOCK_SCALDING_VENTS,
      name: 'Scalding Vents',
      // A mark, not a vulnerability: 0 adds nothing to the damage taken.
      kind: 'vulnerability',
      remaining: left,
      duration: total,
      value: 0,
      value2: scalding,
      sourceId: boss.id,
      school: 'fire',
      undispellable: true,
    });
  }
}

/** One fight tick of the vents (`active`: someone is on the Main Line, so a
 *  new cycle may start; a running one always plays out). */
export function tickVents(
  ctx: SimContext,
  inst: InstanceSlot,
  boss: Entity,
  st: TockFightState,
  active: boolean,
): void {
  const v = st.vent;
  if (v.phase === 'off') {
    v.timer -= DT;
    if (v.timer <= EPS && active) startVents(ctx, inst, boss, st);
  } else if (v.phase === 'warn') {
    v.timer -= DT;
    if (v.timer <= EPS) {
      burst(ctx, boss, st);
      // The steam bites the moment it bursts: the warning was the dodge.
      scald(ctx, inst, boss);
      v.tick = T.ventTickEvery;
    }
  } else {
    v.timer -= DT;
    if (v.timer <= EPS) {
      dropStrips(ctx, inst, st);
      v.phase = 'off';
      v.timer = VENT_REST;
    } else {
      v.tick -= DT;
      if (v.tick <= EPS) {
        scald(ctx, inst, boss);
        v.tick += T.ventTickEvery;
      }
    }
  }
  markWalkers(ctx, inst, boss, st);
}

/** The fight ended: the strips lift and nobody keeps the walkway mark. */
export function endVents(ctx: SimContext, inst: InstanceSlot, st: TockFightState | null): void {
  if (st) {
    dropStrips(ctx, inst, st);
    st.vent.phase = 'off';
  }
  // Every player's body, the dead and the ghosts too (claimPlayers keeps only
  // the living): someone who fell on a walkway must not keep the mark.
  const o = ctx.instanceOriginOf(inst);
  for (const meta of ctx.players.values()) {
    const p = ctx.entities.get(meta.entityId);
    if (!p || Math.abs(p.pos.x - o.x) >= 120 || Math.abs(p.pos.z - o.z) >= 250) continue;
    dropAuraById(p, TOCK_SCALDING_VENTS);
  }
}
