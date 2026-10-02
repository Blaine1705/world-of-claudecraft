// Pure plan of the Stamping Press's gantry (foundry_press.ts builds it,
// foundry_creature_fx.ts drives it): one overhead rail along each Main Line
// belt, a carriage on it carrying that belt's hammer, and the timeline of one
// strike read off the press strip the sim paints
// (sim/encounters/stormbrass_foundry/line_master.ts paintStrip):
//
//   0 .. slide        the carriage slides from wherever it stands to the
//                     strip's rail stop (ease in, ease out); the hammer hangs
//                     raised, its shadow on the belt still faint;
//   slide .. warning  parked over the strip: the hammer lifts a little (the
//                     wind-up) while its shadow darkens and swells;
//   warning           the slam (the sim's hit), a held bite, then the climb.
//
// The carriage's position is derived from mirrored state only: the strip
// object's position is the rail stop, the strip appearing starts the clock,
// and where the carriage stood before is this rig's own memory. So offline and
// online slide alike, with no wire change.
//
// Three-free, DOM-free, deterministic.

import { MAIN_LINE_BELTS } from '../../sim/content/stormbrass_foundry_layout';
import { pressRailStops, TOCK_TUNING } from '../../sim/encounters/stormbrass_foundry/ids';

/** Heights over the Main Line floor (yards): the rail's underside, the
 *  raised hammer's striking face, and how far the hammer falls. */
export const PRESS_RAIL_Y = 17.2;
export const HAMMER_FACE_Y = 10.4;
export const HAMMER_TRAVEL = HAMMER_FACE_Y - 0.18;
/** The hammer head's footprint: the belt's width, the strip's length. */
export const HAMMER_HALF_WIDTH = MAIN_LINE_BELTS.halfWidth + 0.1;
export const HAMMER_HALF_LENGTH = TOCK_TUNING.pressLength / 2;

/** The Blender kit's press pieces as built (the kit contract, audited against
 *  the shipped GLB by tests/stormbrass_foundry_kit.test.ts): Kit_PressHammer's
 *  origin is its striking face (the head to `headTop`, its own rod to
 *  `rodTop`); Kit_PressCarriage's origin is its wheels' contact on the rail's
 *  top. */
export const KIT_PRESS_HAMMER = { halfWidth: 2.43, halfLength: 2.65, headTop: 2.8, rodTop: 7 };
/** Kit_PressRam's height as built, from its foot. */
export const KIT_PRESS_RAM_LENGTH = 5;
/** The rail's top (the carriage wheels' tread) over its underside. */
export const PRESS_RAIL_TOP = 1.07;

/** The kit hammer's stretch onto the strike's footprint: the belt's width and
 *  the press strip's length exactly (the head is what the strip telegraphs),
 *  its height as built. */
export function pressHammerKitScale(): { x: number; z: number } {
  return {
    x: HAMMER_HALF_WIDTH / KIT_PRESS_HAMMER.halfWidth,
    z: HAMMER_HALF_LENGTH / KIT_PRESS_HAMMER.halfLength,
  };
}

/** The share of the warning the carriage spends sliding to its stop. */
export const PRESS_SLIDE_SHARE = 0.52;
/** The slam's fall, the held bite and the climb back (seconds). */
export const PRESS_SLAM_SEC = 0.12;
export const PRESS_BITE_SEC = 0.35;
export const PRESS_CLIMB_SEC = 1.3;
/** How high the wind-up lifts the hammer, as a share of its travel. */
export const PRESS_WINDUP_LIFT = 0.07;

/** Every rail stop a carriage can park on (instance-local z, press end first). */
export const PRESS_RAIL_STOPS: readonly number[] = pressRailStops(MAIN_LINE_BELTS);
/** Where the carriages stand before their first strike: one stop off the
 *  press end, clear of the press frame's own rams. */
export const PRESS_HOME_Z = PRESS_RAIL_STOPS[Math.min(1, PRESS_RAIL_STOPS.length - 1)];
/** The rail's run (instance-local z): a yard past the chute end to the frame. */
export const PRESS_RAIL_Z0 = MAIN_LINE_BELTS.z0 - 1.5;

function smooth(t: number): number {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
}

/** 0 (where it stood) to 1 (on the strip's stop), `t` seconds after the strip
 *  appeared: an eased slide over the first PRESS_SLIDE_SHARE of the warning. */
export function carriageSlide(t: number, warning: number): number {
  const span = Math.max(0.05, warning * PRESS_SLIDE_SHARE);
  return smooth(t / span);
}

/** A hammer's drop `t` seconds after its strip appeared (`warning` long, the
 *  strike at its end): 0 raised, 1 on the belt, a little negative for the
 *  wind-up lift once the carriage has parked; the held bite, then the climb. */
export function hammerDrop(t: number, warning: number): number {
  if (t < 0) return 0;
  const parked = warning * PRESS_SLIDE_SHARE;
  const slam = warning - PRESS_SLAM_SEC;
  if (t < parked) return 0;
  if (t < slam) return -PRESS_WINDUP_LIFT * smooth((t - parked) / Math.max(0.05, slam - parked));
  if (t < warning) {
    const k = (t - slam) / PRESS_SLAM_SEC;
    return -PRESS_WINDUP_LIFT + (1 + PRESS_WINDUP_LIFT) * k * k;
  }
  if (t < warning + PRESS_BITE_SEC) return 1;
  const up = (t - warning - PRESS_BITE_SEC) / PRESS_CLIMB_SEC;
  return up >= 1 ? 0 : 1 - smooth(up);
}

/** The hammer's shadow on the belt, 0 (none) to 1 (the full dark footprint):
 *  faint while the carriage slides in, swelling as it parks and winds up, full
 *  at the slam, gone as the hammer climbs. */
export function pressShadow(t: number, warning: number): number {
  if (t < 0) return 0;
  const parked = warning * PRESS_SLIDE_SHARE;
  if (t < parked) return 0.3 * smooth(t / Math.max(0.05, parked));
  if (t < warning) return 0.3 + 0.7 * smooth((t - parked) / Math.max(0.05, warning - parked));
  if (t < warning + PRESS_BITE_SEC) return 1;
  const up = (t - warning - PRESS_BITE_SEC) / PRESS_CLIMB_SEC;
  return up >= 1 ? 0 : 1 - smooth(up);
}

/** How long one whole strike plays after its strip appeared. */
export function pressStrikeSpan(warning: number): number {
  return warning + PRESS_BITE_SEC + PRESS_CLIMB_SEC;
}

/** One belt's carriage: where it stands, the strike it is playing. */
export interface PressCarriage {
  /** Instance-local z of the carriage now. */
  z: number;
  /** The slide's ends (instance-local z). */
  from: number;
  to: number;
  /** The rig clock when its strip appeared, -1 while idle. */
  at: number;
  /** The strip it answers (to find the strike's spot when the strip is gone). */
  stripId: number;
  /** Whether the slam's cue has played for this strike. */
  struck: boolean;
}

export interface PressPose {
  /** Instance-local z of the carriage. */
  z: number;
  /** The hammer's drop (hammerDrop). */
  drop: number;
  /** The shadow's strength (pressShadow). */
  shadow: number;
  /** -1, 0 or 1: the way the carriage is travelling (0 parked or idle). */
  moving: number;
}

/** A parked, idle carriage for every belt. */
export function createPressRig(): PressCarriage[] {
  return MAIN_LINE_BELTS.xs.map(() => ({
    z: PRESS_HOME_Z,
    from: PRESS_HOME_Z,
    to: PRESS_HOME_Z,
    at: -1,
    stripId: -1,
    struck: false,
  }));
}

/** Which belt's rail (0 west) runs over instance-local `lx`, the nearest. */
export function pressBeltOf(lx: number): number {
  let best = 0;
  for (let i = 1; i < MAIN_LINE_BELTS.xs.length; i++)
    if (Math.abs(MAIN_LINE_BELTS.xs[i] - lx) < Math.abs(MAIN_LINE_BELTS.xs[best] - lx)) best = i;
  return best;
}

/** A strip appeared at instance-local `stripZ`: the carriage leaves from
 *  where it stands now and the strike's clock starts. */
export function beginPressStrike(
  c: PressCarriage,
  stripZ: number,
  clock: number,
  stripId: number,
): void {
  c.from = c.z;
  c.to = stripZ;
  c.at = clock;
  c.stripId = stripId;
  c.struck = false;
}

/** The sim's hit landed now: pull the strike's clock onto it, so the slam the
 *  player sees is the tick that hurt (the strip was first seen a scan late). */
export function syncPressStrike(c: PressCarriage, clock: number, warning: number): void {
  if (c.at < 0) return;
  // Never yank a hammer that already fell on its own clock.
  if (clock - c.at < warning) c.at = clock - warning;
}

/** The carriage's pose at `clock`, written into `out` (no allocation); ends
 *  the strike once it has played out. */
export function pressPoseInto(
  c: PressCarriage,
  clock: number,
  warning: number,
  out: PressPose,
): PressPose {
  if (c.at < 0) {
    out.z = c.z;
    out.drop = 0;
    out.shadow = 0;
    out.moving = 0;
    return out;
  }
  const t = clock - c.at;
  const k = carriageSlide(t, warning);
  c.z = c.from + (c.to - c.from) * k;
  out.z = c.z;
  out.drop = hammerDrop(t, warning);
  out.shadow = pressShadow(t, warning);
  out.moving = k < 1 && c.to !== c.from ? Math.sign(c.to - c.from) : 0;
  if (t >= pressStrikeSpan(warning)) {
    c.at = -1;
    c.z = c.to;
    out.z = c.z;
    out.drop = 0;
    out.shadow = 0;
    out.moving = 0;
  }
  return out;
}
