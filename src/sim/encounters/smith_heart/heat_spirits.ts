// Heroic's phase 4 (docs/design/raid/smith_heart.md section 7.4): the
// guardian has torn free of the wellspring, and the mountain's heart sends
// the spirits of the other three veins to defend the Hearth. They ALWAYS
// come, whatever order the guardians fell in: friendly, untargetable
// (objects at their posts), each with its line, gone with the encounter.
//
//   The Quench's spirit  every 15 s lays two patches of Quench Ice on the
//                        shore (they last 40 s, at most six). A Rolling
//                        Cinder that rolls onto one is Rimelocked (frozen,
//                        taking three times the damage: kill it) and the
//                        patch is spent.
//   The Breath's spirit  every 20 s blesses three players (never the tank
//                        while others stand) with Storm-Rain for 20 s. Every
//                        6 s a Creeping Blaze breaks out on the shore and
//                        spreads (2 yd growing to 7); it burns everyone but
//                        the blessed, and a blessed player walking into it
//                        puts it out.
//   The Hammer's spirit  raises four Stone Roots on the tank's ground. Every
//                        50 s (first 12 s after the guardian tears free) the
//                        guardian empowers its fist for 5 s (Crushing Fist,
//                        a blow that kills its tank): the tank drags it
//                        across a root, which holds it (Rooted in Stone, 4 s)
//                        and the blow misses; the root is spent and regrows
//                        in 10 s.
//
// Deterministic: every pick is hashed; the only rng draws are the damage
// rolls, in player order.

import { HEARTH_WELL } from '../../content/smith_heart_layout';
import { DT, type Entity } from '../../types';
import { rimelock } from './heat_cinders';
import { facingTo, ROOT_SPOTS, SHORE_POINTS, SPIRIT_POSTS } from './heat_geometry';
import {
  HEAT_AURAS,
  HEAT_CUES,
  HEAT_NAMES,
  HEAT_OBJECTS,
  HEAT_SPIRITS,
  type HeatSpirit,
  heatHash,
  heatTimed,
  rootTemplate,
  spiritTemplate,
  HEAT_TUNING as T,
} from './heat_ids';
import {
  at,
  auraOf,
  beamCue,
  cueAt,
  cueOn,
  cueOnBoss,
  dropAura,
  dropFightObject,
  fireHit,
  type HeatScope,
  liveEntity,
  livePlayers,
  local,
  pickPlayers,
  putMarker,
  raidWarn,
  roll,
  spawnFightObject,
} from './heat_scope';
import type { HeatBlaze, HeatIce, HeatRoot, HeatSpirits } from './heat_state';
import { heatSay } from './heat_voice';

const SPIRIT_NAMES: Readonly<Record<HeatSpirit, string>> = {
  quench: HEAT_NAMES.spiritQuench,
  breath: HEAT_NAMES.spiritBreath,
  hammer: HEAT_NAMES.spiritHammer,
};

/** The Stone Roots of a fresh arrival: `rootCount` hashed ROOT_SPOTS. */
export function rootSpots(salt: number): number[] {
  const out: number[] = [];
  let k = 0;
  while (out.length < Math.min(T.rootCount, ROOT_SPOTS.length) && k < 64) {
    const i = heatHash(salt * 19 + 3, k) % ROOT_SPOTS.length;
    if (!out.includes(i)) out.push(i);
    k++;
  }
  return out.sort((a, b) => a - b);
}

/** A shore point for pick `n` of kind `salt` (hashed). */
function shorePoint(n: number, salt: number): { x: number; z: number } {
  return SHORE_POINTS[heatHash(n * 13 + salt, salt) % SHORE_POINTS.length];
}

/** The three spirits arrive (once; again after a wipe's reset). Returns
 *  false when they are already here. Exported for the dev trigger. */
export function summonSpirits(s: HeatScope): boolean {
  const st = s.st;
  if (st.spirits) return false;
  const ids = {} as Record<HeatSpirit, number>;
  for (const spirit of HEAT_SPIRITS) {
    const post = SPIRIT_POSTS[spirit];
    const obj = spawnFightObject(
      s.ctx,
      s.inst,
      spiritTemplate(spirit),
      SPIRIT_NAMES[spirit],
      post.x,
      post.z,
      1,
    );
    obj.facing = facingTo(post, HEARTH_WELL);
    ids[spirit] = obj.id;
  }
  const roots: HeatRoot[] = rootSpots(st.casts).map((spot) => {
    const p = ROOT_SPOTS[spot];
    const obj = spawnFightObject(
      s.ctx,
      s.inst,
      rootTemplate('ready'),
      HEAT_NAMES.root,
      p.x,
      p.z,
      T.rootR,
    );
    cueAt(s, HEAT_CUES.root, p.x, p.z, T.rootR, 'nature');
    return { objectId: obj.id, spot, ready: true, regrow: 0 };
  });
  st.spirits = {
    ids,
    iceIn: T.iceFirst,
    rainIn: T.rainFirst,
    blazeIn: T.blazeFirst,
    crushIn: T.crushFirst,
    ices: 0,
    rains: 0,
    blazes: 0,
    crushes: 0,
    ice: [],
    blaze: [],
    roots,
    crush: null,
    rooted: 0,
  };
  cueOnBoss(s, HEAT_CUES.spirits);
  raidWarn(
    s,
    s.boss,
    'spirits',
    'The spirits of the Quench, the Breath and the Hammer come to the Hearth!',
  );
  for (const spirit of HEAT_SPIRITS) {
    const e = s.ctx.entities.get(ids[spirit]);
    if (e) heatSay(s, e, spirit);
  }
  return true;
}

// ---- the Quench: its ice ----------------------------------------------------------------

/** The Quench's spirit lays its ice. Exported for the dev trigger. */
export function layIce(s: HeatScope, sp: HeatSpirits): HeatIce[] {
  const laid: HeatIce[] = [];
  for (let k = 0; k < T.iceCount; k++) {
    while (sp.ice.length >= T.iceCap) {
      const old = sp.ice.shift();
      if (old) dropFightObject(s.ctx, s.inst, old.objectId);
    }
    const p = shorePoint(sp.ices++, 7);
    const obj = spawnFightObject(
      s.ctx,
      s.inst,
      heatTimed(HEAT_OBJECTS.icePrefix, T.iceLife),
      HEAT_NAMES.ice,
      p.x,
      p.z,
      T.iceR,
    );
    const ice = { objectId: obj.id, x: p.x, z: p.z, life: T.iceLife };
    sp.ice.push(ice);
    laid.push(ice);
    cueAt(s, HEAT_CUES.ice, p.x, p.z, T.iceR, 'frost');
  }
  return laid;
}

function stepIce(s: HeatScope, sp: HeatSpirits): void {
  sp.iceIn -= DT;
  if (sp.iceIn <= 1e-9) {
    sp.iceIn += T.iceEvery;
    layIce(s, sp);
  }
  if (sp.ice.length === 0) return;
  const spent = new Set<HeatIce>();
  for (const ice of sp.ice) {
    ice.life -= DT;
    if (ice.life <= 1e-9) {
      spent.add(ice);
      continue;
    }
    for (const c of s.st.cinders) {
      const e = liveEntity(s, c.id);
      if (!e || auraOf(e, HEAT_AURAS.rimelocked)) continue;
      const here = local(s.ctx, s.inst, e);
      if (Math.hypot(here.x - ice.x, here.z - ice.z) > T.iceR) continue;
      rimelock(s, e);
      spent.add(ice);
      break;
    }
  }
  if (spent.size === 0) return;
  for (const ice of spent) dropFightObject(s.ctx, s.inst, ice.objectId);
  sp.ice = sp.ice.filter((i) => !spent.has(i));
}

// ---- the Breath: storm-rain and the blazes ---------------------------------------------

/** The Breath's spirit blesses its players. Returns who. */
export function blessRain(s: HeatScope, sp: HeatSpirits): Entity[] {
  const blessed = pickPlayers(s, T.rainCount, 1500 + sp.rains++);
  for (const p of blessed) {
    putMarker(p, HEAT_AURAS.stormRain, HEAT_NAMES.stormRain, T.rainSeconds, sp.ids.breath, {
      school: 'nature',
    });
    beamCue(s, sp.ids.breath, p.id, HEAT_CUES.rain, 'nature');
  }
  return blessed;
}

/** A Creeping Blaze breaks out on the shore. Exported for the tests. */
export function breakOutBlaze(s: HeatScope, sp: HeatSpirits, at0?: { x: number; z: number }) {
  if (sp.blaze.length >= T.blazeCap) return null;
  const p = at0 ?? shorePoint(sp.blazes, 23);
  sp.blazes++;
  const obj = spawnFightObject(
    s.ctx,
    s.inst,
    HEAT_OBJECTS.blaze,
    HEAT_NAMES.blaze,
    p.x,
    p.z,
    T.blazeStartR,
  );
  const b: HeatBlaze = { objectId: obj.id, x: p.x, z: p.z, r: T.blazeStartR, tick: T.blazeTick };
  sp.blaze.push(b);
  return b;
}

function stepBlazes(s: HeatScope, sp: HeatSpirits): void {
  sp.rainIn -= DT;
  if (sp.rainIn <= 1e-9) {
    sp.rainIn += T.rainEvery;
    blessRain(s, sp);
  }
  sp.blazeIn -= DT;
  if (sp.blazeIn <= 1e-9) {
    sp.blazeIn += T.blazeEvery;
    breakOutBlaze(s, sp);
  }
  if (sp.blaze.length === 0) return;
  const out = new Set<HeatBlaze>();
  for (const b of sp.blaze) {
    b.r = Math.min(T.blazeMaxR, b.r + T.blazeGrow * DT);
    for (const p of livePlayers(s)) {
      if (!auraOf(p, HEAT_AURAS.stormRain)) continue;
      const here = at(s, p);
      if (Math.hypot(here.x - b.x, here.z - b.z) > b.r) continue;
      out.add(b);
      cueAt(s, HEAT_CUES.douse, b.x, b.z, b.r, 'nature');
      break;
    }
    if (out.has(b)) continue;
    b.tick -= DT;
    if (b.tick > 1e-9) continue;
    b.tick += T.blazeTick;
    const obj = s.ctx.entities.get(b.objectId);
    if (obj) obj.scale = Math.round(b.r * 10) / 10;
    for (const p of livePlayers(s)) {
      if (auraOf(p, HEAT_AURAS.stormRain)) continue;
      const here = at(s, p);
      if (Math.hypot(here.x - b.x, here.z - b.z) > b.r) continue;
      fireHit(s, p, roll(s, T.blazeMin, T.blazeMax), HEAT_NAMES.blaze);
    }
  }
  if (out.size === 0) return;
  for (const b of out) dropFightObject(s.ctx, s.inst, b.objectId);
  sp.blaze = sp.blaze.filter((b) => !out.has(b));
}

// ---- the Hammer: the roots and the Crushing Fist ----------------------------------------

/** The guardian empowers its fist on its tank. Exported for the dev trigger. */
export function startCrush(s: HeatScope, sp: HeatSpirits): void {
  sp.crushIn = T.crushEvery;
  sp.crushes++;
  const tank = liveEntity(s, s.boss.aggroTargetId);
  sp.crush = { remaining: T.crushSeconds, tankId: tank?.id ?? null };
  putMarker(s.boss, HEAT_AURAS.crushing, HEAT_NAMES.crushing, T.crushSeconds, s.boss.id, {
    school: 'fire',
  });
  if (tank)
    putMarker(tank, HEAT_AURAS.crushMark, HEAT_NAMES.crushing, T.crushSeconds, s.boss.id, {
      school: 'fire',
    });
  cueOnBoss(s, HEAT_CUES.crush);
  raidWarn(s, s.boss, 'crush', 'Crushing Fist! Drag the guardian across a Stone Root!');
  heatSay(s, s.boss, 'crush');
}

function endCrush(s: HeatScope, sp: HeatSpirits): void {
  dropAura(s.boss, HEAT_AURAS.crushing);
  const tank = sp.crush?.tankId != null ? s.ctx.entities.get(sp.crush.tankId) : undefined;
  if (tank) dropAura(tank, HEAT_AURAS.crushMark);
  sp.crush = null;
}

/** Is the guardian over a ready root? Returns the root, or null. */
export function rootUnder(s: HeatScope, sp: HeatSpirits): HeatRoot | null {
  const here = local(s.ctx, s.inst, s.boss);
  for (const r of sp.roots) {
    if (!r.ready) continue;
    const p = ROOT_SPOTS[r.spot];
    if (Math.hypot(here.x - p.x, here.z - p.z) <= T.rootR) return r;
  }
  return null;
}

function stepRoots(s: HeatScope, sp: HeatSpirits): Entity | null {
  for (const r of sp.roots) {
    if (r.ready) continue;
    r.regrow -= DT;
    if (r.regrow > 1e-9) continue;
    r.ready = true;
    const obj = s.ctx.entities.get(r.objectId);
    if (obj) obj.templateId = rootTemplate('ready');
    const p = ROOT_SPOTS[r.spot];
    cueAt(s, HEAT_CUES.root, p.x, p.z, T.rootR, 'nature');
  }
  if (sp.rooted > 0) {
    sp.rooted -= DT;
    if (sp.rooted <= 1e-9) {
      sp.rooted = 0;
      dropAura(s.boss, HEAT_AURAS.rooted);
    }
  }
  if (!sp.crush) {
    sp.crushIn -= DT;
    if (sp.crushIn <= 1e-9) startCrush(s, sp);
    return null;
  }
  const root = rootUnder(s, sp);
  if (root) {
    root.ready = false;
    root.regrow = T.rootRegrow;
    const obj = s.ctx.entities.get(root.objectId);
    if (obj) obj.templateId = rootTemplate('spent');
    sp.rooted = T.rootedSeconds;
    dropAura(s.boss, HEAT_AURAS.rooted);
    s.boss.auras.push({
      id: HEAT_AURAS.rooted,
      name: HEAT_NAMES.rooted,
      kind: 'root',
      remaining: T.rootedSeconds,
      duration: T.rootedSeconds,
      value: 0,
      sourceId: sp.ids.hammer,
      school: 'nature',
      undispellable: true,
      unbreakableControl: true,
    });
    cueOnBoss(s, HEAT_CUES.rooted);
    endCrush(s, sp);
    return null;
  }
  const crush = sp.crush;
  crush.remaining -= DT;
  if (crush.remaining > 1e-9) return null;
  const tank = liveEntity(s, crush.tankId) ?? liveEntity(s, s.boss.aggroTargetId);
  endCrush(s, sp);
  if (!tank) return null;
  cueOn(s, tank, HEAT_CUES.crushLand);
  fireHit(s, tank, roll(s, T.crushMin, T.crushMax), HEAT_NAMES.crushing);
  return tank;
}

// ---- the pass ---------------------------------------------------------------------------

/** One tick of the spirits' work (nothing until they have come). */
export function stepSpirits(s: HeatScope): void {
  const sp = s.st.spirits;
  if (!sp) return;
  stepIce(s, sp);
  stepBlazes(s, sp);
  stepRoots(s, sp);
}

/** The spirits, their ice, blazes and roots gone; every blessing and mark
 *  lifted (a wipe, the kill). */
export function clearSpirits(s: Pick<HeatScope, 'ctx' | 'inst' | 'st' | 'boss'>): void {
  const sp = s.st.spirits;
  dropAura(s.boss, HEAT_AURAS.crushing);
  dropAura(s.boss, HEAT_AURAS.rooted);
  if (!sp) return;
  for (const id of Object.values(sp.ids)) dropFightObject(s.ctx, s.inst, id);
  for (const i of sp.ice) dropFightObject(s.ctx, s.inst, i.objectId);
  for (const b of sp.blaze) dropFightObject(s.ctx, s.inst, b.objectId);
  for (const r of sp.roots) dropFightObject(s.ctx, s.inst, r.objectId);
  if (sp.crush?.tankId != null) {
    const tank = s.ctx.entities.get(sp.crush.tankId);
    if (tank) dropAura(tank, HEAT_AURAS.crushMark);
  }
  s.st.spirits = null;
}
