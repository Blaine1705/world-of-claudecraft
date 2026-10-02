// The Prime Draft's Blender body, measured (scripts/assets/foundry_prime_draft,
// its delivery notes): the facts the look (characters/foundry_creature_looks.ts),
// the boss effects (foundry_creature_fx.ts) and the cable tether
// (foundry_draft_tether.ts) key on, and the pure rules that turn the mirrored
// encounter state into its presentation gestures (the moorings, the hatch).
//
// Model space: yards at the authored size, glTF axes: +Y up, the colossus
// faces +Z, its LEFT is +X (so its finished BRASS arm, the right, is -X and
// its bare iron arm is +X), the origin on the floor between its feet. Clip
// times are seconds at 1x as they sit in the shipped GLB: every clip starts
// one authoring frame late (PRIME_DRAFT_CLIP_LEAD), so each beat is the
// delivery notes' time plus that frame.
//
// Three-free, DOM-free, deterministic.

/** The template's sim scale (sim/content/stormbrass_foundry.ts prime_draft). */
export const PRIME_DRAFT_SIM_SCALE = 2.6;

/** In-game yards per model yard. Authored 10.3 yd tall; drawn 1.12 times that,
 *  11.5 yd, so the dungeon's last boss is its biggest fighter (the Voltaic
 *  Warden's helm tops out at 9.1 yd, its crown spire at 10.9). */
export const PRIME_DRAFT_DRAWN_SCALE = 1.12;

/** One authoring frame (24 fps): the shipped clips' first key sits here. */
export const PRIME_DRAFT_CLIP_LEAD = 1 / 24;

export const PRIME_DRAFT_MODEL = {
  url: 'models/creatures/foundry_prime_draft.glb',
  /** The Idle pose's skinned bounds, the floor clamps' lowest vertex (-0.05)
   *  to the pauldron crest (10.30): what prepareVisual normalizes to the def
   *  height. */
  idleBoundsHeight: 10.34,
  /** The corpse (Death's last frame): kneeling on its fists, 8.6 yd tall. */
  corpseHeight: 8.6,
  /** The empty core socket's centre and the hatch's front face (rest). */
  core: { up: 7.58, forward: 0.95 },
  hatch: { up: 7.58, forward: 1.86 },
  /** In front of the one glass eye (its right eye: -x). */
  eye: { x: -0.34, up: 9.86, forward: 1.74 },
  /** Where the brass fist strikes the floor on Slam's contact frame, and the
   *  iron claw's crossing point on Piston_Sweep's. */
  fistStrike: { x: -2.04, forward: 5.0 },
  clawCross: { x: 0, up: 4.0, forward: 5.0 },
  /** The feet at rest (|x| out to each side). */
  foot: { x: 1.75 },
  /** The two gantry cables' far ends (the heads of CableL0 and CableR0), fixed
   *  in the model's frame: |x|, up, forward (behind it). The cable terminal
   *  hangs here (foundry_draft_tether.ts). */
  cableEnd: { x: 1.8, up: 7.4, forward: -7.4 },
  /** The stacks' mouths on its back (|x|, up, forward). */
  stack: { x: 0.95, up: 10.3, forward: -2.4 },
  /** The gait's reference speed (planted feet slide at this). */
  walkRef: 3.0,
} as const;

const L = PRIME_DRAFT_CLIP_LEAD;

/** The clips' contact beats (seconds at 1x in the shipped GLB). */
export const PRIME_DRAFT_CLIP = {
  /** Wake (the 3 s Awakening bar): slumped on its knuckles to 0.64, the surge,
   *  the eye ignites at 0.99, standing at 2.64, the flex peaks at 3.14. */
  wakeFlex: 3.1 + L,
  /** Slam (Piston Fist, a 2 s warning): the brass fist hits the floor. */
  slamHit: 2.0 + L,
  /** Piston_Sweep (Arm Sweep, a 1.5 s bar): the claw crosses the cone's centre. */
  sweepCross: 1.5 + L,
  /** Tremor_Step (a 1.5 s bar): the left foot stomps down. */
  tremorStomp: 1.5 + L,
  /** Hatch_Open: the leaves shudder for a second, then swing open. */
  hatchSwing: 1.0 + L,
  hatchOpen: 1.25 + L,
  /** Hatch_Close: the leaves shut. */
  hatchShut: 0.35 + L,
  /** Overload: the discharge, then it sags; the clip's whole length. */
  overloadDischarge: 0.12 + L,
  overloadLength: 3.583 + L,
  /** Unbolt (a 2.5 s bar): the left bolts shear, the right, the cables rip out
   *  of its back, and the clip (bolts flown, cables hanging) is over. */
  unboltShearL: 2.42 + L,
  unboltShearR: 2.52 + L,
  unboltCables: 2.7 + L,
  unboltLength: 3.917 + L,
  /** Death: the hatch falls open by 3.39, the eye dies at 3.74. */
  deathEyeOut: 3.7 + L,
} as const;

/** The hatch leaves' hinges: bone `HatchL` turns +105 degrees about its own
 *  local +Y to stand open, `HatchR` the same about -Y. */
export const PRIME_DRAFT_HATCH_OPEN_RAD = (105 * Math.PI) / 180;

// ---- presentation gestures (the renderer's triggerAttack seam) -------------------

/** The moorings (the gantry cables and the floor clamps): on, and gone. */
export const DRAFT_MOORINGS_ON_GESTURE = 'foundry_draft_moorings_on';
export const DRAFT_MOORINGS_GONE_GESTURE = 'foundry_draft_moorings_gone';
/** The hatch leaves' dial stops and their shudder through the warning. */
export const DRAFT_HATCH_SHUT_DIAL = 'foundry_draft_hatch_shut';
export const DRAFT_HATCH_OPEN_DIAL = 'foundry_draft_hatch_open';
export const DRAFT_HATCH_RATTLE = 'foundry_draft_hatch_rattle';
/** The body's stance: chest out round the open socket, or closed. */
export const DRAFT_STANCE_OPEN = 'foundry_draft_stance_open';
export const DRAFT_STANCE_SHUT = 'foundry_draft_stance_shut';
/** The lightning's flare while it overdrives (re-sent on a beat). */
export const DRAFT_OVERDRIVE_GLOW = 'foundry_draft_overdrive_glow';

/** The def height that draws the model at PRIME_DRAFT_DRAWN_SCALE at sim `scale`. */
export function primeDraftLookHeight(scale = PRIME_DRAFT_SIM_SCALE): number {
  return (PRIME_DRAFT_MODEL.idleBoundsHeight * PRIME_DRAFT_DRAWN_SCALE) / scale;
}

/** In-game yards per model yard for the Draft drawn at sim `scale`. */
export function primeDraftModelScale(scale: number): number {
  return (PRIME_DRAFT_DRAWN_SCALE * scale) / PRIME_DRAFT_SIM_SCALE;
}

/** The playback rate that lands a clip's `beat` on the last frame of a bar
 *  (or a warning) `seconds` long, the clip starting with it. */
export function primeDraftBeatRate(beat: number, seconds: number): number {
  return beat / seconds;
}

/**
 * Are the moorings (cables and floor clamps) on the body? Every clip but
 * Unbolt, Walk, Tremor_Step and Death keys them in place, so once it has torn
 * free the MESH must be hidden (the delivery's rule). Read off mirrored state
 * only: it is moored while it wears Bolted, and whenever it is out of a fight
 * (asleep in its gantry, or reset: the bolts come back); a body that has just
 * lost Bolted keeps them until the Unbolt clip has thrown them
 * (`sinceUnboltBar`: seconds since its Unbolt bar began, or null if none was
 * seen); a corpse never wears them.
 */
export function draftMooringsShown(s: {
  dead: boolean;
  bolted: boolean;
  inFight: boolean;
  sinceUnboltBar: number | null;
}): boolean {
  if (s.dead) return false;
  if (s.bolted || !s.inFight) return true;
  return s.sinceUnboltBar !== null && s.sinceUnboltBar < PRIME_DRAFT_CLIP.unboltLength;
}

export type DraftHatchLook = 'shut' | 'warn' | 'open';

/**
 * The hatch the body shows for the Core Hatch ring's state: the leaves stand
 * open while the ring is open and while it is Overloaded (the clip leaves the
 * chest open through the stun), shudder through the warning, shut otherwise.
 */
export function draftHatchLook(
  ring: 'closed' | 'warn' | 'open' | null,
  overloaded: boolean,
  dead: boolean,
): DraftHatchLook {
  if (dead) return 'shut';
  if (overloaded || ring === 'open') return 'open';
  return ring === 'warn' ? 'warn' : 'shut';
}

/**
 * Should the body take its open stance (whose entry is Hatch_Open: a second of
 * shudder, then the chest thrown out)? From the last `hatchSwing` seconds of
 * the warning, so the clip's swing lands as the sim opens the hatch; held
 * while it is open.
 */
export function draftStanceOpen(
  look: DraftHatchLook,
  warnElapsed: number,
  warnSeconds: number,
): boolean {
  if (look === 'open') return true;
  return look === 'warn' && warnElapsed >= warnSeconds - PRIME_DRAFT_CLIP.hatchSwing;
}

/** A point of the model (x to its left, up, forward) in the world, for a body
 *  at `pos` facing `facing`, drawn at sim `scale`. */
export function primeDraftPoint(
  pos: { x: number; y: number; z: number },
  facing: number,
  scale: number,
  p: { x?: number; up?: number; forward?: number },
  out: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  const k = primeDraftModelScale(scale);
  const s = Math.sin(facing);
  const c = Math.cos(facing);
  const side = (p.x ?? 0) * k;
  const fwd = (p.forward ?? 0) * k;
  out.x = pos.x + fwd * s + side * c;
  out.y = pos.y + (p.up ?? 0) * k;
  out.z = pos.z + fwd * c - side * s;
  return out;
}
