// Overworld dungeon door arches: only the two stone JAMBS collide, because
// walking into the mouth IS the enter trigger. The Abandoned Crypt's door
// draws no arch (an invisible click box at the mine), and two dungeons can
// share one doorway, so dedupe by position. A door whose facade is a built
// set piece hands that set piece's own colliders instead of the jambs: the
// Gravewyrm Sanctum's Seal Gate (sanctum_seal_gate.ts), whose pylons ARE the
// jambs, and the Sunken Bastion's Drowned Gate Tower
// (sunken_bastion_entrance.ts), whose inner arch is the door. Extracted from
// colliders.ts under the monolith ratchet; the caller passes its camera-top
// resolver.
import type { Collider } from './colliders';
import { DUNGEON_LIST } from './data';
import {
  HOLLOW_CRYPT_ENTRANCE_DUNGEON_ID,
  hollowCryptEntranceColliders,
} from './hollow_crypt_entrance';
import {
  DOOR_ARCH_HEIGHT,
  DOOR_ARCH_JAMB_HD,
  DOOR_ARCH_JAMB_HW,
  DOOR_ARCH_JAMB_X,
} from './prop_layout';
import { SANCTUM_SEAL_GATE_DUNGEON_ID, sanctumSealGateColliders } from './sanctum_seal_gate';
import {
  SUNKEN_BASTION_ENTRANCE_DUNGEON_ID,
  sunkenBastionEntranceColliders,
} from './sunken_bastion_entrance';

export function dungeonDoorJambColliders(
  seed: number,
  topY: (seed: number, x: number, z: number, height: number) => number,
): Collider[] {
  const out: Collider[] = [];
  const doorSpots = new Set<string>();
  for (const dungeon of DUNGEON_LIST) {
    if (dungeon.overworldDoor === false) continue;
    if (dungeon.id === 'nythraxis_crypt') continue;
    const key = `${dungeon.doorPos.x},${dungeon.doorPos.z}`;
    if (doorSpots.has(key)) continue;
    doorSpots.add(key);
    if (dungeon.id === SANCTUM_SEAL_GATE_DUNGEON_ID) {
      out.push(...sanctumSealGateColliders(seed, dungeon.doorPos));
      continue;
    }
    if (dungeon.id === SUNKEN_BASTION_ENTRANCE_DUNGEON_ID) {
      out.push(...sunkenBastionEntranceColliders(seed, dungeon.doorPos));
      continue;
    }
    if (dungeon.id === HOLLOW_CRYPT_ENTRANCE_DUNGEON_ID) {
      out.push(...hollowCryptEntranceColliders(seed, dungeon.doorPos));
      continue;
    }
    for (const sx of [-DOOR_ARCH_JAMB_X, DOOR_ARCH_JAMB_X]) {
      const x = dungeon.doorPos.x + sx;
      out.push({
        type: 'obb',
        x,
        z: dungeon.doorPos.z,
        hw: DOOR_ARCH_JAMB_HW,
        hd: DOOR_ARCH_JAMB_HD,
        rot: 0,
        cameraTopY: topY(seed, x, dungeon.doorPos.z, DOOR_ARCH_HEIGHT),
      });
    }
  }
  return out;
}
