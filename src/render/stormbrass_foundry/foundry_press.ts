// The Stamping Press's four hammers (one over each Main Line belt's last
// yards), each its own small merged group so it can fall: the creature effect
// painter (foundry_creature_fx.ts) writes each hammer's drop (0 raised, 1 on
// the belt; a little negative is the wind-up) from the press strips it sees,
// and every hammer mesh moves itself in its own onBeforeRender (one matrix
// write, the cranes' pattern). Shared by every built Foundry: one claim is in
// view at a time, like FOUNDRY_BELT_UNIFORMS.

import * as THREE from 'three';
import { MAIN_LINE_BELTS, STAMPING_PRESS } from '../../sim/content/stormbrass_foundry_layout';
import { PartBin } from './foundry_mesh';

type Ground = (x: number, z: number) => number;

/** The press head's height over the floor and the hammers' fall. */
export const PRESS_TOP = 13;
export const HAMMER_TRAVEL = 5.0;

/** Each belt's hammer drop, west to east (the belts' order). */
export const FOUNDRY_PRESS_HAMMERS: readonly { drop: number }[] = MAIN_LINE_BELTS.xs.map(() => ({
  drop: 0,
}));

/** The four hammers: an iron head with a hazard face and a brass collar,
 *  built raised; they fall by FOUNDRY_PRESS_HAMMERS. */
export function buildPressHammers(ground: Ground): THREE.Group {
  const group = new THREE.Group();
  group.name = 'stormbrassPressHammers';
  const top = ground(0, STAMPING_PRESS.z) + PRESS_TOP;
  const z = STAMPING_PRESS.z - 3;
  MAIN_LINE_BELTS.xs.forEach((x, i) => {
    const bin = new PartBin();
    // half extents, as the rest of the press (foundry_dressing.ts pressPieces)
    bin.box('iron', 0, -6.4, 0, 2.6, 1.3, 4);
    bin.box('hazard', 0, -7.8, 0, 2.65, 0.12, 4.05);
    bin.box('brass', 0, -5.0, 0, 1.4, 0.22, 2.2);
    const head = bin.build(`stormbrassHammer:${i}`);
    head.position.set(x, top, z);
    const state = FOUNDRY_PRESS_HAMMERS[i];
    const fall = (): void => {
      head.position.y = top - state.drop * HAMMER_TRAVEL;
      head.updateMatrix();
      if (head.parent) head.matrixWorld.multiplyMatrices(head.parent.matrixWorld, head.matrix);
    };
    for (const child of head.children) {
      const m = child as THREE.Mesh;
      m.onBeforeRender = () => {
        fall();
        m.matrixWorld.multiplyMatrices(head.matrixWorld, m.matrix);
      };
    }
    group.add(head);
  });
  return group;
}

/** A hammer's drop `t` seconds after its strip appeared (`warning` long, the
 *  strike at its end): a slow wind-up lift, the slam, a held bite, the climb. */
export function hammerDrop(t: number, warning: number): number {
  if (t < 0) return 0;
  if (t < warning - 0.12) return -0.12 * Math.min(1, t / Math.max(0.1, warning - 0.12));
  if (t < warning) return -0.12 + 1.12 * ((t - (warning - 0.12)) / 0.12) ** 2;
  if (t < warning + 0.35) return 1;
  const up = (t - warning - 0.35) / 1.3;
  return up >= 1 ? 0 : 1 - up * up * (3 - 2 * up);
}
