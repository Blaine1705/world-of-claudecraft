// The Sunken Bastion bosses' ids, tuning and pure geometry, as a dependency-
// light leaf: the encounter modules, the dev helpers, the renderer's boss
// visuals and the tests all key on these. No SimContext, no rng.

import {
  BASTION_BUTTRESSES,
  BEACON_CROWN,
  BREACH_BASTION,
  BUTTRESS_HALF,
  DROWNING_WINCH,
  DROWNING_YARD,
  FOGBEACON,
  MOORING_POSTS,
} from '../../content/sunken_bastion_layout';
import { inLane } from '../../mob/trash_kit/lane';

export const OLEN_ID = 'knight_commander_olen';
export const OSSICK_ID = 'gaoler_ossick';
export const VAEL_ID = 'vael_the_mistcaller';
export const TURRETBACK_ID = 'turretback_hermit';
export const FOG_SHADE_ID = 'vael_fog_shade';
export const DROWNED_THRALL_ID = 'drowned_thrall';
export const SHACKLED_PRISONER_ID = 'shackled_prisoner';

// ---- cast ids (real cast bars on the bosses) -------------------------------------
export const OLEN_OATHBOUND_CHARGE = 'bastion_oathbound_charge';
export const OSSICK_GAOL_HOOK = 'bastion_gaol_hook';
export const OSSICK_CUDGEL = 'bastion_gaolers_cudgel';
export const VAEL_MIST_SURGE = 'bastion_mist_surge';
export const VAEL_DROWNING_HYMN = 'bastion_drowning_hymn';

// ---- aura ids ---------------------------------------------------------------------
export const OLEN_BREACHED = 'bastion_breached';
export const OLEN_BREACHED_VULN = 'bastion_breached_vuln';
export const OLEN_UNBROKEN_OATH = 'bastion_unbroken_oath';
export const OLEN_UNDERTOW = 'bastion_undertow_wake';
export const OSSICK_HOOKED = 'bastion_hooked';
export const OSSICK_KEELHAULED = 'bastion_keelhauled';
export const OSSICK_CUDGEL_SLOW = 'bastion_cudgel_slow';
export const VAEL_FOG_VEIL = 'bastion_fog_veil';
export const VAEL_STAGGER = 'bastion_vael_stagger';
export const VAEL_EXPOSED = 'bastion_vael_exposed';
export const VAEL_FOGBURST = 'bastion_fogburst';

// ---- encounter object templates (the state rides the template id) ----------------
export const BUTTRESS_TEMPLATES = {
  intact: 'bastion_buttress_intact',
  cracked: 'bastion_buttress_cracked',
  broken: 'bastion_buttress_broken',
} as const;
export type ButtressState = keyof typeof BUTTRESS_TEMPLATES;
export const POST_TEMPLATES = { lit: 'bastion_post_lit', dark: 'bastion_post_dark' } as const;
export const BEACON_LAMP_TEMPLATE = 'bastion_beacon_lamp';
export const UNDERTOW_TEMPLATE = 'bastion_undertow_wake';

/** Every Bastion encounter object template (the renderer draws them itself). */
export const BASTION_OBJECT_TEMPLATES: ReadonlySet<string> = new Set([
  ...Object.values(BUTTRESS_TEMPLATES),
  ...Object.values(POST_TEMPLATES),
  BEACON_LAMP_TEMPLATE,
  UNDERTOW_TEMPLATE,
]);

export function buttressStateOf(templateId: string): ButtressState | null {
  if (templateId === BUTTRESS_TEMPLATES.intact) return 'intact';
  if (templateId === BUTTRESS_TEMPLATES.cracked) return 'cracked';
  if (templateId === BUTTRESS_TEMPLATES.broken) return 'broken';
  return null;
}

// ---- Olen: the Oathbound Charge ---------------------------------------------------

export const OLEN_TUNING = {
  chargeFirst: 10,
  chargeEvery: 18,
  chargeCast: 2.5,
  /** The lane's half width (a 4 yd lane). */
  laneHalf: 2,
  /** Seconds the charge takes to cross the lane. */
  dashSeconds: 0.5,
  min: 150,
  max: 180,
  knockback: 6,
  breachedStun: 5,
  breachedVulnSeconds: 8,
  breachedVuln: 0.3,
  /** Unbroken Oath: damage done per stack. */
  oathPerStack: 0.1,
  // Heroic: Undertow Wake floods the lane after the charge.
  wakeSeconds: 8,
  wakePerSecond: 25,
  wakeSlow: 0.5,
} as const;

/** Where a charge from (x, z) along `yaw` stops on the Breach Bastion: at the
 *  first standing buttress in its lane (the crash), else at the rim. Pure; the
 *  renderer paints the same lane the sim resolves. `standing` lists the
 *  buttress ids that still block (intact or cracked). */
export function oathLaneEnd(
  x: number,
  z: number,
  yaw: number,
  standing: ReadonlySet<string>,
): { length: number; buttress: string | null } {
  const ax = Math.sin(yaw);
  const az = Math.cos(yaw);
  // The rim: solve |p + t*a - c| = r - 1 for the forward root.
  const r = BREACH_BASTION.r - 1;
  const ox = x - BREACH_BASTION.x;
  const oz = z - BREACH_BASTION.z;
  const b = ox * ax + oz * az;
  const c = ox * ox + oz * oz - r * r;
  const disc = b * b - c;
  let rim = disc > 0 ? -b + Math.sqrt(disc) : 0;
  rim = Math.max(0, rim);
  let best = rim;
  let hit: string | null = null;
  for (const bt of BASTION_BUTTRESSES) {
    if (!standing.has(bt.id)) continue;
    const dx = bt.x - x;
    const dz = bt.z - z;
    const along = dx * ax + dz * az;
    if (along <= 0) continue;
    const side = Math.abs(dx * az - dz * ax);
    // The lane meets the buttress when their widths overlap.
    if (side > OLEN_TUNING.laneHalf + BUTTRESS_HALF) continue;
    const stop = Math.max(0, along - BUTTRESS_HALF - 1.2);
    if (stop < best) {
      best = stop;
      hit = bt.id;
    }
  }
  return { length: best, buttress: hit };
}

/** Is (px, pz) inside the charge lane that starts at (x, z)? */
export function inOathLane(
  x: number,
  z: number,
  yaw: number,
  length: number,
  px: number,
  pz: number,
): boolean {
  return inLane(x, z, yaw, length, OLEN_TUNING.laneHalf, px, pz);
}

// ---- Ossick: the Gaol Hook and the mooring posts ------------------------------------

export const OSSICK_TUNING = {
  hookFirst: 8,
  hookEvery: 20,
  hookCast: 1.2,
  /** Seconds from the hook landing to the keelhaul. */
  keelhaulAfter: 8,
  /** How near a lit post the hooked player must stand. */
  postReach: 3,
  postDarkSeconds: 30,
  keelhaulStun: 3,
  min: 160,
  max: 190,
  cudgelFirst: 6,
  cudgelEvery: 12,
  cudgelCast: 1,
  cudgelMult: 1.5,
  cudgelSlow: 0.7,
  cudgelSlowSeconds: 6,
  /** Open the Cells: prisoners break out at these health shares. */
  cells: [0.6, 0.3],
  prisonersPerCell: 3,
  // Heroic: Heavy Chain slows the hooked player.
  heavyChainSlow: 0.7,
} as const;

export const WINCH = DROWNING_WINCH;
export const YARD = DROWNING_YARD;
export const POSTS = MOORING_POSTS;

/** The cells the prisoners break out of: round the yard's west and east rims. */
export const CELL_DOORS: readonly { x: number; z: number }[] = [
  { x: DROWNING_YARD.x - 19, z: DROWNING_YARD.z + 6 },
  { x: DROWNING_YARD.x - 19, z: DROWNING_YARD.z - 6 },
  { x: DROWNING_YARD.x + 19, z: DROWNING_YARD.z },
];

// ---- Vael: the Fog Veil and the beacon's beam -----------------------------------------

export const VAEL_TUNING = {
  surgeFirst: 6,
  surgeEvery: 12,
  lastHymnEvery: 8,
  lastHymnBelow: 0.25,
  surgeCast: 1.5,
  surgeRadius: 12,
  surgeMin: 30,
  surgeMax: 40,
  veilAt: [0.7, 0.4],
  hymnSeconds: 18,
  hymnBase: 8,
  hymnStep: 3,
  hymnStepEvery: 3,
  /** Share of his health a hit on the real Vael must take to break the veil. */
  breakShare: 0.05,
  staggerSeconds: 4,
  exposedSeconds: 10,
  exposed: 0.2,
  fogburstRadius: 6,
  fogburstMin: 50,
  fogburstMax: 60,
  fogburstStun: 2,
  /** One full sweep of the beam during the veil. */
  beamPeriod: 4,
  /** Half the beam's angle (radians): a figure inside it is lit. */
  beamHalf: 0.22,
  /** Heroic: Drifting Shades swap places this often. */
  driftEvery: 5,
} as const;

export const CROWN = BEACON_CROWN;
export const BEACON = FOGBEACON;

/** The four rim spots the veiled figures stand on (clockwise from `phase`). */
export function veilSlots(phase: number): { x: number; z: number }[] {
  const r = BEACON_CROWN.r - 5;
  return [0, 1, 2, 3].map((k) => {
    const a = phase + (k * Math.PI) / 2;
    return { x: BEACON_CROWN.x + Math.sin(a) * r, z: BEACON_CROWN.z + Math.cos(a) * r };
  });
}

/** The beam's yaw (sim convention) `elapsed` seconds into a veil. */
export function veilBeamYaw(start: number, elapsed: number): number {
  return (start + (elapsed / VAEL_TUNING.beamPeriod) * Math.PI * 2) % (Math.PI * 2);
}

/** Is a figure at (x, z) inside the beam turning at `yaw` from the Fogbeacon? */
export function inBeam(yaw: number, x: number, z: number): boolean {
  const a = Math.atan2(x - FOGBEACON.x, z - FOGBEACON.z);
  let d = a - yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d) <= VAEL_TUNING.beamHalf;
}
