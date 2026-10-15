// The AIR of a walk-in placed town building (a painted Tidehold model stood by a town
// layout, sim/placed_town_kit.ts), for the indoor chase camera (interior_camera.ts): the
// rooms a camera may stand in and the doorways that open them onto the world, read off each
// model's baked collision (data/asset_collision_overrides.json) at AUTHORED size, then
// carried to the building's placement: its scale, its quarter turn and its ground.
//
// Each piece is a box in the model's own axes, in yards over its ground line (y 0), against
// the inner wall faces (a quarter yard in from them, clear of the beams, sills and trims the
// collision lines do not carry), the floor deck and the ceiling over it:
//  - tavern_b (an inn): the taproom under the upper floor's slab, the front door, the stair
//    well at the east end, and the upper floor under the roof's tie beams;
//  - hall (a chapel): the nave to the wall plates (the roof is open above them), the portal;
//  - shop_a (a counting house): the counting room under its ceiling, the front door;
//  - smithy: the forge room under its ceiling, the front door, and the side arch onto the
//    forge shelter (an opening too: the shelter is open to the weather).
// A model with no entry here (a sealed one) has no air: the camera stays the open-world one.
//
// Interiors are world axis-aligned, so a building turned by anything but a quarter turn
// gets none. Three-, DOM- and i18n-free; built once per town view, never per frame.

import { localToWorld } from '../sim/placed_town_kit';
import {
  type CameraInterior,
  cameraInterior,
  type InteriorBox,
  type InteriorOpening,
} from './interior_camera_core';

/** One piece of air in the model's own axes at authored size: [x0, x1, y0, y1, z0, z1]. */
type LocalBox = readonly [number, number, number, number, number, number];

interface ModelAir {
  readonly boxes: readonly LocalBox[];
  /** The pieces that open onto the world: their index, the model axis (0 x, 2 z) and the
   *  side (-1 the min face, +1 the max face). */
  readonly openings: readonly { box: number; axis: 0 | 2; side: 1 | -1 }[];
}

/** The authored air per painted model (the geometry name, shared by every look). */
const MODEL_AIR: Readonly<Record<string, ModelAir>> = {
  tavern_b: {
    boxes: [
      // the taproom: inner walls x +-12.4, z +-6.9, the deck at 0.45, the slab at 5.36
      [-12.15, 12.15, 0.45, 5.36, -6.65, 6.65],
      // the front door through the south wall (z -7.5 to -6.9), its head at 4.85
      [-3.5, -0.5, 0.45, 4.85, -7.6, -6.4],
      // the stair well at the east end, open from the taproom to the upper floor
      [10.28, 12.15, 0.45, 9.65, -5.9, 3.5],
      // the upper floor: over the slab (5.68) to the tie beams (9.65)
      [-12.3, 12.3, 5.68, 9.65, -7.5, 7.5],
    ],
    openings: [{ box: 1, axis: 2, side: -1 }],
  },
  hall: {
    boxes: [
      // the nave: inner walls x +-5.2, z +-10.2, the floor at 0.9, the wall plates at 9.3
      [-4.95, 4.95, 0.9, 9.3, -9.95, 9.95],
      // the portal through the north gable (z -11 to -10.2), its head at 5.9
      [-1.6, 1.6, 0.9, 5.9, -11.1, -9.7],
    ],
    openings: [{ box: 1, axis: 2, side: -1 }],
  },
  shop_a: {
    boxes: [
      // the counting room: inner walls x +-5.05, z +-3.75, the deck at 0.45, the ceiling 4.65
      [-4.8, 4.8, 0.45, 4.65, -3.5, 3.5],
      // the front door through the shop front (z -4.2 to -3.75), its head at 3.7
      [-2.5, -0.7, 0.45, 3.7, -4.3, -3.2],
    ],
    openings: [{ box: 1, axis: 2, side: -1 }],
  },
  smithy: {
    boxes: [
      // the forge room: inner walls x +-4.9, z +-3.9, the deck at 0.45, the ceiling 5.25
      [-4.65, 4.65, 0.45, 5.25, -3.65, 3.65],
      // the front door through the south wall (z -4.5 to -3.9), its head at 4.45
      [-2.6, 0.2, 0.45, 4.45, -4.6, -3.4],
      // the side arch onto the forge shelter through the west wall (x 4.9 to 5.5)
      [4.4, 5.6, 0.45, 4.05, -1.2, 1.2],
    ],
    openings: [
      { box: 1, axis: 2, side: -1 },
      { box: 2, axis: 0, side: 1 },
    ],
  },
};

/** The fields of a placed building record the air needs (sim/placed_town_kit.ts). */
export interface PlacedTownInteriorBuilding {
  readonly id: string;
  readonly assetId: string;
  readonly walkIn?: boolean;
  readonly placement: {
    readonly x: number;
    readonly z: number;
    readonly rotation: number;
    readonly scale: number;
    readonly lift: number;
  };
}

/** The painted model a record draws: `/models/tidehold/<look>/<name>.glb` -> `<name>`. */
export function placedTownModelName(assetId: string): string {
  return assetId.replace(/^.*\//, '').replace(/\.glb$/, '');
}

/** The models that carry authored air. */
export function placedTownInteriorModels(): readonly string[] {
  return Object.keys(MODEL_AIR);
}

const QUARTER = Math.PI / 2;

/**
 * The camera interior of one walk-in placed building whose anchor stands on ground at
 * `groundY` (the terrain under the anchor, the height the town view stands the model on),
 * or null for a sealed record, a model with no authored air, or a turn that is not a quarter.
 * The model's ground line stands at groundY + scale (the footing) + lift.
 */
export function placedTownCameraInterior(
  building: PlacedTownInteriorBuilding,
  groundY: number,
): CameraInterior | null {
  if (building.walkIn !== true) return null;
  const air = MODEL_AIR[placedTownModelName(building.assetId)];
  if (!air) return null;
  const p = building.placement;
  const quarters = Math.round(p.rotation / QUARTER);
  if (Math.abs(p.rotation - quarters * QUARTER) > 1e-6) return null;
  const s = p.scale;
  const lineY = groundY + s + p.lift;
  const boxes: InteriorBox[] = air.boxes.map(([x0, x1, y0, y1, z0, z1]) => {
    const a = localToWorld(p, p.rotation, x0 * s, z0 * s);
    const b = localToWorld(p, p.rotation, x1 * s, z1 * s);
    return [
      Math.min(a.x, b.x),
      Math.max(a.x, b.x),
      lineY + y0 * s,
      lineY + y1 * s,
      Math.min(a.z, b.z),
      Math.max(a.z, b.z),
    ];
  });
  const openings: InteriorOpening[] = air.openings.map((o) => {
    // the opening's outward normal in the model's axes, turned into the world's
    const local = localToWorld(
      { x: 0, z: 0 },
      p.rotation,
      o.axis === 0 ? o.side : 0,
      o.axis === 2 ? o.side : 0,
    );
    const alongX = Math.abs(local.x) > Math.abs(local.z);
    const value = alongX ? local.x : local.z;
    return { box: o.box, axis: alongX ? 0 : 2, side: value > 0 ? 1 : -1 };
  });
  return cameraInterior(`placed_town:${building.id}`, boxes, openings, new Map(), 'preserve-angle');
}
