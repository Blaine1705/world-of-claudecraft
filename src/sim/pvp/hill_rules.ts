// King of the Hill: the pure rules. Once an hour a hill rises somewhere in one
// of the free-for-all zones, a HILL_RADIUS circle on dry, open ground; the
// group with the most members standing inside it contests it, holds it after
// HILL_CAPTURE_SECONDS of unbroken majority, and every holder standing inside
// earns a slow trickle of Honor for as long as they hold it. No SimContext, no
// rng, no clock: every function here is a plain function of its arguments so
// the sim (hill.ts), the HUD bar and the tests read the same verdicts. The
// ctx-bound system that owns the schedule, the presence pass, the contest
// clock and the payouts is hill.ts.

/** The circle's radius in yards (owner spec). */
export const HILL_RADIUS = 50;
/** A new hill rises this often, and the old one closes as it does. */
export const HILL_CYCLE_SECONDS = 60 * 60;
/** The first hill of a realm's life rises this long after boot (the natural
 *  rift portal precedent: never at tick zero, so a fresh realm has players
 *  before the first announcement). Sim time, so offline the first hill of a
 *  session rises two minutes in. */
export const HILL_FIRST_AT_SECONDS = 120;
/** Unbroken majority for this long takes the hill (owner spec). */
export const HILL_CAPTURE_SECONDS = 60;
/** Each holder standing inside accrues this many seconds of presence before a
 *  payout, and each payout is HILL_HONOR_PER_PAYOUT. One Honor a minute: a full
 *  party holding an uncontested hill for the whole hour earns 60 each, about
 *  one Thornhollow Fields win for an hour of standing still, so Honor stays
 *  scarce and the instanced faucets stay ahead (docs/design/warfare.md). */
export const HILL_ACCRUAL_SECONDS = 60;
export const HILL_HONOR_PER_PAYOUT = 1;
/** At most this many holders are paid at once, so a raid cannot multiply the
 *  trickle past a party's worth. Chosen by ascending pid inside the circle. */
export const HILL_MAX_PAYEES = 5;
/** The circle keeps this much clear of the zone's edges beyond its own radius,
 *  and this much clear of the hub settlement's radius. */
export const HILL_EDGE_MARGIN = 25;
export const HILL_HUB_MARGIN = 30;
/** Random spots tried before the spawn gives up for this attempt. */
export const HILL_SPAWN_ATTEMPTS = 96;
/** The samples the spot probe takes around the rim and around an inner ring
 *  at half the radius: a lake or a building can sit between two rim samples
 *  or wholly inside the circle, and the probe must see both. */
export const HILL_RIM_SAMPLES = 16;
export const HILL_INNER_SAMPLES = 8;
/** Clearance the centre must have from any collider: a hill never rises on
 *  a building, a wall or a fence. The rings are not collider-checked: the
 *  free-for-all zones are forests, a trunk on a sample point is not a
 *  structure, and the hub exclusion keeps the circle off every settlement. */
export const HILL_CENTER_CLEARANCE = 6;

/** The group a player counts for: their party or raid as one group, an
 *  ungrouped player as a group of one. */
export function hillGroupKey(pid: number, party: { id: number } | null): string {
  return party ? `party:${party.id}` : `solo:${pid}`;
}

/** The group with the most members inside, or null on a tie for first place
 *  (or an empty hill): a tie never moves the hill. Iteration order does not
 *  matter: the answer is the strict maximum or nothing. */
export function hillLeader(
  counts: ReadonlyMap<string, number>,
): { key: string; count: number } | null {
  let best: { key: string; count: number } | null = null;
  let tied = false;
  for (const [key, count] of counts) {
    if (count <= 0) continue;
    if (best === null || count > best.count) {
      best = { key, count };
      tied = false;
    } else if (count === best.count) {
      tied = true;
    }
  }
  return tied ? null : best;
}

/** Does a challenger with this many inside beat the holder with that many? A
 *  strict majority over the holder's PRESENT count (owner spec: "a majority
 *  will win the zone over"); an absent holder is beaten by anyone. */
export function hillChallengeStands(challengerCount: number, holderCount: number): boolean {
  return challengerCount > 0 && challengerCount > holderCount;
}

/** The contest clock after one pass. A lapsed challenge resets it (a group
 *  that thins out below the holder starts over), a new challenger starts it
 *  over from this pass, the same challenger keeps counting. */
export function hillContestStep(
  prev: number,
  contested: boolean,
  sameChallenger: boolean,
  dt: number,
): number {
  if (!contested) return 0;
  return sameChallenger ? prev + dt : dt;
}

/** Which of the holder's members inside are paid this pass: ascending pid,
 *  at most `max`. Deterministic on every host. */
export function hillPayees(inside: readonly number[], max = HILL_MAX_PAYEES): number[] {
  return [...inside].sort((a, b) => a - b).slice(0, max);
}

/** The world reads a spawn probe needs; the sim binds them to the terrain,
 *  the water bodies and the collider grid, the tests to fakes. */
export interface HillSpotProbe {
  /** Water surface or open sea at this point, or ground below the water line. */
  wet(x: number, z: number): boolean;
  /** Too steep to stand on at this point. */
  steep(x: number, z: number): boolean;
  /** A collider (a building, a wall, a prop) within `r` of this point. */
  blocked(x: number, z: number, r: number): boolean;
  /** The zone id the point falls in, or null outside every zone. */
  zoneIdAt(x: number, z: number): string | null;
}

/** Is a circle of `radius` at (x, z) a legal hill in `zoneId`: dry, flat and
 *  clear of colliders at the centre; dry and inside the zone at
 *  HILL_RIM_SAMPLES points around the rim and HILL_INNER_SAMPLES points
 *  around the half-radius ring (no circle straddles a zone line or a lake). */
export function hillSpotIsOpen(
  probe: HillSpotProbe,
  zoneId: string,
  x: number,
  z: number,
  radius: number,
): boolean {
  if (probe.zoneIdAt(x, z) !== zoneId) return false;
  if (probe.wet(x, z) || probe.steep(x, z)) return false;
  if (probe.blocked(x, z, HILL_CENTER_CLEARANCE)) return false;
  const ring = (samples: number, r: number): boolean => {
    for (let i = 0; i < samples; i++) {
      const a = (i / samples) * Math.PI * 2;
      const rx = x + Math.cos(a) * r;
      const rz = z + Math.sin(a) * r;
      if (probe.zoneIdAt(rx, rz) !== zoneId) return false;
      if (probe.wet(rx, rz)) return false;
    }
    return true;
  };
  return ring(HILL_RIM_SAMPLES, radius) && ring(HILL_INNER_SAMPLES, radius / 2);
}

/** The ordinal of the hill that should be standing at sim time `now`: -1
 *  before the first, then 0, 1, 2... one per cycle. */
export function hillOrdinalAt(now: number): number {
  if (now < HILL_FIRST_AT_SECONDS) return -1;
  return Math.floor((now - HILL_FIRST_AT_SECONDS) / HILL_CYCLE_SECONDS);
}

/** Sim time hill `ordinal` rises. */
export function hillRiseTime(ordinal: number): number {
  return HILL_FIRST_AT_SECONDS + ordinal * HILL_CYCLE_SECONDS;
}

/** Is (px, pz) inside the circle? Squared distance, no sqrt on the presence pass. */
export function hillContains(
  hill: { x: number; z: number; radius: number },
  px: number,
  pz: number,
): boolean {
  const dx = px - hill.x;
  const dz = pz - hill.z;
  return dx * dx + dz * dz <= hill.radius * hill.radius;
}
