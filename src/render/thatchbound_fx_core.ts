// Thatchbound's visual plan, the pure half (no Three, no DOM): where a puppet's marionette
// strings run, how its control bar sways above it, where its eyes burn, and how the cast's
// reaching strings and the curse's shockwave grow and fade. thatchbound_fx.ts owns the
// objects and reads these. Sim: src/sim/seasonal/scarecrow_puppet.ts.
//
// Fairness: who is a puppet is actionable information (allies must find and free them),
// so the strings, the eyes and the ground sigil draw at every graphics tier; only the
// swirl of straw and feathers thins under reduced motion.

export const PUPPET_ABILITY = 'mob_thatchgrin_puppet';
export const STRAWLING_PUPPET_AURA = 'thatchbound_strawling';
export const CROW_PUPPET_AURA = 'thatchbound_crow';
export const PUPPET_AURA_IDS: ReadonlySet<string> = new Set([
  STRAWLING_PUPPET_AURA,
  CROW_PUPPET_AURA,
]);

/** Puppets drawn at once (a cast takes two; two casts can overlap at the edges). */
export const PUPPET_CAP = 4;
/** Strings per puppet (head, both hands, the back) plus the control bar's two sticks. */
export const STRINGS_PER_PUPPET = 4;
export const BARS_PER_PUPPET = 2;
/** The cast's reaching strings at once (one per marked victim). */
export const CAST_STRING_CAP = 4;

/** How high above the puppet's feet its control bar hangs (yards). */
export const BAR_HEIGHT = 7.5;
/** Where the boss's hand is when he pulls (his raised hand, above his feet). */
export const BOSS_HAND_UP = 6.2;

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** The body's attach points in its own frame: up, and left/right of its facing. */
export interface PuppetBody {
  head: number;
  hands: number;
  handSpread: number;
  back: number;
}

/** Each look's body: the little scarecrow stands, the crow hovers low. */
export function puppetBody(auraId: string): PuppetBody {
  return auraId === CROW_PUPPET_AURA
    ? { head: 1.9, hands: 1.5, handSpread: 0.9, back: 1.7 }
    : { head: 1.75, hands: 1.15, handSpread: 0.55, back: 1.35 };
}

/** The control bar's sway: a slow lazy circle plus a jerk on each swing, so the strings
 *  read as pulled by a hand rather than rigid. */
export function barSway(time: number, phase: number): { x: number; z: number; tilt: number } {
  return {
    x: Math.sin(time * 1.3 + phase) * 0.35,
    z: Math.cos(time * 1.1 + phase * 1.7) * 0.3,
    tilt: Math.sin(time * 2.1 + phase) * 0.25,
  };
}

/** The four string segments for a puppet at `pos` facing `facing`, from the bar down to
 *  head, left hand, right hand and back. Each is [top, bottom]. */
export function puppetStrings(
  pos: Vec3Like,
  facing: number,
  body: PuppetBody,
  time: number,
  phase: number,
): [Vec3Like, Vec3Like][] {
  const sway = barSway(time, phase);
  const top = { x: pos.x + sway.x, y: pos.y + BAR_HEIGHT, z: pos.z + sway.z };
  // the body's left is (cos f, -sin f) for a facing f (the rig convention)
  const lx = Math.cos(facing);
  const lz = -Math.sin(facing);
  const fx = Math.sin(facing);
  const fz = Math.cos(facing);
  const bar = 0.9;
  const tl = { x: top.x + lx * bar, y: top.y + sway.tilt, z: top.z + lz * bar };
  const tr = { x: top.x - lx * bar, y: top.y - sway.tilt, z: top.z - lz * bar };
  const tb = { x: top.x - fx * bar, y: top.y, z: top.z - fz * bar };
  const jig = Math.sin(time * 6 + phase) * 0.12;
  return [
    [top, { x: pos.x, y: pos.y + body.head, z: pos.z }],
    [
      tl,
      {
        x: pos.x + lx * body.handSpread,
        y: pos.y + body.hands + jig,
        z: pos.z + lz * body.handSpread,
      },
    ],
    [
      tr,
      {
        x: pos.x - lx * body.handSpread,
        y: pos.y + body.hands - jig,
        z: pos.z - lz * body.handSpread,
      },
    ],
    [tb, { x: pos.x - fx * 0.25, y: pos.y + body.back, z: pos.z - fz * 0.25 }],
  ];
}

/** The control bar's two crossed sticks, as segments (drawn with the strings). */
export function puppetBars(pos: Vec3Like, facing: number, time: number, phase: number) {
  const sway = barSway(time, phase);
  const top = { x: pos.x + sway.x, y: pos.y + BAR_HEIGHT, z: pos.z + sway.z };
  const lx = Math.cos(facing);
  const lz = -Math.sin(facing);
  const fx = Math.sin(facing);
  const fz = Math.cos(facing);
  const bar = 1.0;
  return [
    [
      { x: top.x + lx * bar, y: top.y + sway.tilt, z: top.z + lz * bar },
      { x: top.x - lx * bar, y: top.y - sway.tilt, z: top.z - lz * bar },
    ],
    [
      { x: top.x + fx * bar * 0.6, y: top.y, z: top.z + fz * bar * 0.6 },
      { x: top.x - fx * bar, y: top.y, z: top.z - fz * bar },
    ],
  ] as [Vec3Like, Vec3Like][];
}

/** The two burning eyes: just in front of the head, a hand apart. */
export function puppetEyes(pos: Vec3Like, facing: number, body: PuppetBody): [Vec3Like, Vec3Like] {
  const lx = Math.cos(facing);
  const lz = -Math.sin(facing);
  const fx = Math.sin(facing);
  const fz = Math.cos(facing);
  const y = pos.y + body.head - 0.05;
  const fwd = 0.32;
  const apart = 0.13;
  return [
    { x: pos.x + fx * fwd + lx * apart, y, z: pos.z + fz * fwd + lz * apart },
    { x: pos.x + fx * fwd - lx * apart, y, z: pos.z + fz * fwd - lz * apart },
  ];
}

/** The strings' brightness over a puppet's life: they snap taut as it lands, hold with a
 *  heartbeat flicker, and stay bright to the last frame (no fade hides who is taken). */
export function stringGlow(age: number, time: number, phase: number): number {
  const land = Math.min(1, age / 0.25);
  const flicker = 0.85 + 0.15 * Math.sin(time * 9 + phase);
  return Math.max(0.6, land) * flicker;
}

/** The eyes' size pulse (world yards). */
export function eyeSize(time: number, phase: number): number {
  return 0.38 + 0.08 * Math.sin(time * 5 + phase);
}

/** The ground sigil's spin (radians) and its glow. */
export function sigilState(time: number, phase: number): { spin: number; glow: number } {
  return { spin: time * 0.9 + phase, glow: 0.75 + 0.25 * Math.sin(time * 3 + phase) };
}

/** A cast string's reach toward its victim, 0..1 over the cast, eased in. */
export function castReach(elapsed: number, duration: number): number {
  const t = Math.max(0, Math.min(1, elapsed / Math.max(0.05, duration)));
  return 1 - (1 - t) * (1 - t);
}

/** The curse's shockwave: its radius and its brightness `age` seconds after the landing. */
export const SHOCK_SEC = 0.9;
export function shockwave(age: number): { radius: number; glow: number } {
  const t = Math.max(0, Math.min(1, age / SHOCK_SEC));
  return { radius: 0.6 + 6.4 * (1 - (1 - t) ** 3), glow: (1 - t) ** 1.6 };
}

/** Straw and feathers the swirl throws per second, by motion preference. */
export function swirlRate(reducedMotion: boolean): number {
  return reducedMotion ? 6 : 26;
}

/** A point on the swirl round the puppet: a tightening helix climbing its body. */
export function swirlPoint(pos: Vec3Like, t: number, k: number): Vec3Like {
  const a = t * 5.5 + k * 2.39996;
  const h = ((t * 0.8 + k * 0.37) % 1) * 2.6;
  const r = 1.25 - h * 0.25;
  return { x: pos.x + Math.cos(a) * r, y: pos.y + 0.2 + h, z: pos.z + Math.sin(a) * r };
}
