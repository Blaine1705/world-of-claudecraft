// Daily variation for the Windrider Slalom (world quests round 2). The three
// authored courses (content/world_quest_glider_levels.ts) are templates: each
// day the rotation cycle picks one of GLIDER_VARIANT_CYCLE variants of a
// template, where the free rings are nudged sideways, and on descending legs up
// or down, by a seeded Rng, so a returning pilot flies a different line through
// the same landmarks. Variant 0 is the template itself (the authored pins keep
// their meaning), the ring ids, radii, count, landing pad, wind tunnels and
// medal times never change, and the nudges are bounded, guarded and then
// FLOWN: every candidate line is certified by the bounded autopilot
// (world_quest_glider_autopilot.ts) on the shipped world before it is offered,
// and the nudges around any ring the autopilot cannot reach are dropped until
// the line wins (the template itself is the last fallback).
// tests/world_quest_glider_generation.test.ts flies every variant of every
// template again and checks its terrain clearance.
//
// Fixed rings: the launch approach, the last two onto the pad, and every ring
// touching a wind-tunnel leg (the tunnels are authored to the template line and
// the wind visual is built per template, so the legs they sit on do not move).
// A ring only moves up or down where the template descends through it, so no
// authored climb is ever made steeper. Guards on a nudged ring: it keeps at
// least CLEARANCE yards of air under its rim and the turn it asks for stays
// within TURN_SLACK of the template's turn.
//
// Both hosts derive the variant from (cycle, courseId) alone, the same way the
// puzzle boards do (world_quest_daily_generation.ts): the sim ticks the flight
// against it and the course visual draws it, with nothing new on the wire.
import type { GliderCourseDef, GliderRingDef } from './minigames/glider_flight';
import { Rng } from './rng';
import { groundHeight } from './world';
import { autopilotFlight } from './world_quest_glider_autopilot';
import { gliderCourseById } from './world_quest_glider_levels';
import { worldQuestCycleNumber } from './world_quest_rotation';
import { WORLD_SEED } from './world_seed';

/** Variants per template; the daily cycle walks them in order and repeats. */
export const GLIDER_VARIANT_CYCLE = 32;
/** The largest sideways nudge of any ring, in yards. */
export const GLIDER_VARIANT_MAX_LATERAL = 12;
/** The largest up or down nudge of any ring, in yards. */
export const GLIDER_VARIANT_MAX_VERTICAL = 2.5;
/** Air under a nudged ring's rim on the shipped world, in yards. */
const CLEARANCE = 4;
/** The turn at a nudged ring stays within this of the template's turn (radians). */
const TURN_SLACK = 0.35;
/** Lateral nudges stay under this fraction of the shorter neighbouring leg. */
const LATERAL_LEG_FRACTION = 0.2;
/** Certification rounds before the template itself is offered. */
const MAX_CERTIFY_ROUNDS = 8;
const VARIANT_SALT = 0x611d_0000;

function courseSeed(courseId: string, variant: number): number {
  // FNV-1a over the id, folded with the variant: distinct streams per template.
  let hash = 0x811c9dc5;
  for (let i = 0; i < courseId.length; i++) {
    hash ^= courseId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (VARIANT_SALT + variant * 131 + (hash >>> 0)) >>> 0;
}

/** Day index into the variant cycle for a rotation cycle id (0 for an unknown one). */
export function gliderVariantForCycle(cycle: unknown): number {
  const number = worldQuestCycleNumber(cycle) ?? 0;
  return ((number % GLIDER_VARIANT_CYCLE) + GLIDER_VARIANT_CYCLE) % GLIDER_VARIANT_CYCLE;
}

type Point = { x: number; z: number };

function turnAt(prev: Point, ring: Point, next: Point): number {
  const a = Math.atan2(ring.x - prev.x, ring.z - prev.z);
  const b = Math.atan2(next.x - ring.x, next.z - ring.z);
  let turn = b - a;
  while (turn > Math.PI) turn -= 2 * Math.PI;
  while (turn < -Math.PI) turn += 2 * Math.PI;
  return Math.abs(turn);
}

/** Indices of the rings a wind tunnel's leg touches (the tunnel projects onto
 *  the segment between them), so those legs stay as authored. */
export function tunnelBoundRings(template: GliderCourseDef): ReadonlySet<number> {
  const bound = new Set<number>();
  const points: Point[] = [...template.rings, template.landingPad];
  for (const tunnel of template.windTunnels ?? []) {
    let best = -1;
    let bestDistance = Infinity;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const lengthSq = dx * dx + dz * dz || 1;
      const t = Math.max(
        0,
        Math.min(1, ((tunnel.x - a.x) * dx + (tunnel.z - a.z) * dz) / lengthSq),
      );
      const distance = Math.hypot(tunnel.x - a.x - dx * t, tunnel.z - a.z - dz * t);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    }
    if (best >= 0) {
      bound.add(best);
      bound.add(best + 1);
    }
  }
  return bound;
}

/** The seeded, guarded nudge of every free ring (before certification). */
function nudgeRings(template: GliderCourseDef, variant: number): GliderRingDef[] {
  const rng = new Rng(courseSeed(template.id, variant));
  const rings: GliderRingDef[] = template.rings.map((ring) => ({ ...ring }));
  const last = rings.length - 1;
  const fixed = tunnelBoundRings(template);
  for (let i = 1; i <= last - 2; i++) {
    const prev = template.rings[i - 1];
    const ring = template.rings[i];
    const next = template.rings[i + 1];
    // Every ring draws its numbers so the stream stays stable when a guard
    // drops a nudge (the same variant always yields the same line).
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const length = Math.hypot(dx, dz) || 1;
    const legIn = Math.hypot(ring.x - prev.x, ring.z - prev.z);
    const legOut = Math.hypot(next.x - ring.x, next.z - ring.z);
    const lateral = Math.min(
      GLIDER_VARIANT_MAX_LATERAL,
      LATERAL_LEG_FRACTION * Math.min(legIn, legOut),
    );
    const side = rng.range(-lateral, lateral);
    const lift = rng.range(-GLIDER_VARIANT_MAX_VERTICAL, GLIDER_VARIANT_MAX_VERTICAL);
    if (fixed.has(i)) continue;
    // Up or down only where the template descends through the ring: an
    // authored climb never gets steeper on either side.
    const descending = prev.y >= ring.y && ring.y >= next.y;
    const candidate: GliderRingDef = {
      ...ring,
      x: Math.round((ring.x + (-dz / length) * side) * 10) / 10,
      z: Math.round((ring.z + (dx / length) * side) * 10) / 10,
      y: descending ? Math.round((ring.y + lift) * 10) / 10 : ring.y,
    };
    if (candidate.y > rings[i - 1].y) {
      candidate.y = Math.max(rings[i - 1].y, ring.y - GLIDER_VARIANT_MAX_VERTICAL);
    }
    const clearance =
      candidate.y - candidate.radius - groundHeight(candidate.x, candidate.z, WORLD_SEED);
    const templateTurn = turnAt(prev, ring, next);
    const turnIn = turnAt(rings[i - 1], candidate, next);
    if (clearance < CLEARANCE || turnIn > templateTurn + TURN_SLACK) continue;
    rings[i] = candidate;
  }
  return rings;
}

/** The template with every free ring nudged by the variant's seeded offsets,
 *  certified flyable by the bounded autopilot on the shipped world. */
export function generateGliderCourseVariant(
  template: GliderCourseDef,
  variant: number,
): GliderCourseDef {
  if (variant === 0 || template.rings.length < 4) return template;
  const rings = nudgeRings(template, variant);
  for (let round = 0; round < MAX_CERTIFY_ROUNDS; round++) {
    const course: GliderCourseDef = { ...template, rings: rings.map((ring) => ({ ...ring })) };
    const flight = autopilotFlight(course, WORLD_SEED);
    if (flight.phase === 'won') return course;
    // Drop the nudges around the ring the autopilot could not reach (the
    // first unpassed ring and its neighbours), then fly again.
    const failedAt = Math.min(flight.passedRings, rings.length - 1);
    let restored = false;
    for (const i of [failedAt - 1, failedAt, failedAt + 1]) {
      if (i < 0 || i >= rings.length) continue;
      const authored = template.rings[i];
      if (rings[i].x !== authored.x || rings[i].z !== authored.z || rings[i].y !== authored.y) {
        rings[i] = { ...authored };
        restored = true;
      }
    }
    if (!restored) break;
  }
  return template;
}

const VARIANT_CACHE = new Map<string, GliderCourseDef>();

/** The course a session flies this cycle: stable identity per (cycle, course),
 *  so the course visual can compare by reference the way it always has. */
export function gliderCourseForCycle(cycle: unknown, courseId?: string): GliderCourseDef {
  const template = gliderCourseById(courseId);
  const variant = gliderVariantForCycle(cycle);
  if (variant === 0) return template;
  const key = `${template.id}:${variant}`;
  let course = VARIANT_CACHE.get(key);
  if (!course) {
    course = generateGliderCourseVariant(template, variant);
    VARIANT_CACHE.set(key, course);
  }
  return course;
}
