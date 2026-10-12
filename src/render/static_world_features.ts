// The world-spanning static dressing the renderer attaches once at boot, like
// the per-zone features (gated attach, frozen matrices, the fog cull): the
// lily-and-reed water flora on every temperate lake, the Farshore's palm
// strand, the Gravewyrm Sanctum's Seal Gate and the Sunken Bastion's Drowned
// Gate Tower. A new static set piece joins this list, never a new line in
// renderer.ts (the monolith ratchet).
import { buildFarshoreFeatures } from './farshore_features';
import { buildSanctumSealGate } from './sanctum_seal_gate';
import { buildSunkenBastionEntrance } from './sunken_bastion_entrance';
import { buildWaterFlora } from './water_flora';

export function buildStaticWorldFeatures(seed: number) {
  return [
    buildWaterFlora(seed),
    buildFarshoreFeatures(seed),
    buildSanctumSealGate(seed),
    buildSunkenBastionEntrance(seed),
  ];
}
