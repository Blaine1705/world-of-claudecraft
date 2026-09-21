import * as THREE from 'three';
import { FARSHORE_SHIPWRECK_PLACEMENT } from '../sim/content/farshore_shipwreck_layout';
import { registerDeferredPreload } from './assets/preload';
import {
  createWorldQuestPlacerModel,
  isWorldQuestPlacerAssetReady,
  prepareWorldQuestPlacerAssets,
} from './world_quest_placer_assets';

// Boot and the placer share one asset cache and one normalization convention.
export const prepareFarshoreShipwreck = prepareWorldQuestPlacerAssets;
registerDeferredPreload(prepareFarshoreShipwreck);

export function buildFarshoreShipwreck(): THREE.Group | null {
  const placement = FARSHORE_SHIPWRECK_PLACEMENT;
  if (!isWorldQuestPlacerAssetReady(placement.key)) return null;
  const root = new THREE.Group();
  root.name = 'farshore-shipwreck';
  const ship = createWorldQuestPlacerModel(placement.key);
  ship.name = 'farshore-broken-ship';
  ship.position.set(placement.x, placement.y, placement.z);
  ship.rotation.y = THREE.MathUtils.degToRad(placement.rot);
  ship.scale.setScalar(placement.scale);
  root.add(ship);
  return root;
}
