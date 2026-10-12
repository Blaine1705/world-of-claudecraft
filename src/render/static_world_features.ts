// The world-spanning static dressing the renderer attaches once at boot, like
// the per-zone features (gated attach, frozen matrices, the fog cull): the
// lily-and-reed water flora on every temperate lake, the Farshore's palm
// strand, the Gravewyrm Sanctum's Seal Gate and the Sunken Bastion's Drowned
// Gate Tower. A new static set piece joins this list, never a new line in
// renderer.ts (the monolith ratchet).
import { buildFarshoreFeatures } from './farshore_features';
import { buildHollowCryptEntrance } from './hollow_crypt_entrance';
import { buildSanctumSealGate } from './sanctum_seal_gate';
import { clearSetPieceOccluders } from './set_piece_occluders';
import { buildSunkenBastionEntrance } from './sunken_bastion_entrance';
import { buildWaterFlora } from './water_flora';
import { buildWildheartBasinEntrance } from './wildheart_basin_entrance';

// The set pieces register what they put between the camera and the character
// (set_piece_occluders.ts); the renderer drives the pass through this module.
export { updateSetPieceOccluders } from './set_piece_occluders';

export function buildStaticWorldFeatures(seed: number) {
  // a rebuilt renderer builds its set pieces afresh: forget the old meshes
  clearSetPieceOccluders();
  return [
    buildWaterFlora(seed),
    buildFarshoreFeatures(seed),
    buildSanctumSealGate(seed),
    buildSunkenBastionEntrance(seed),
    buildHollowCryptEntrance(seed),
    buildDrownedTempleEntrance(seed),
    buildWildheartBasinEntrance(seed),
  ];
}
