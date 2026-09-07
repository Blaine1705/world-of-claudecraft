import type { ZonePropsDef } from '../types';
import { VEHICLE_STATIONS } from './vehicle_stations';

// Existing prop-kit instances, prepared through the owning zone's scenery lane.
// The reference arrangement is translated as a unit to each station.
// Dimensions measured from shipped GLBs; heights include the 0.05yd prop sink.
const DRESSING: NonNullable<ZonePropsDef['decorProps']> = [
  {
    key: 'hexCrateBig',
    terrainCalm: false,
    x: 437,
    z: 1033,
    rot: 0.15,
    scale: 6,
    r: 0.9,
    hw: 0.63,
    hd: 0.63,
    h: 1.21,
    standableTop: 1.21,
  },
  {
    key: 'hexCrateBig',
    terrainCalm: false,
    x: 435.5,
    z: 1034.5,
    rot: -0.2,
    scale: 5,
    r: 0.75,
    hw: 0.525,
    hd: 0.525,
    h: 1,
    standableTop: 1,
  },
  {
    key: 'hexCrateOpen',
    terrainCalm: false,
    x: 437,
    z: 1036,
    rot: -0.3,
    scale: 5,
    r: 1.2,
    h: 0.98,
  },
  {
    key: 'hexCannonballs',
    terrainCalm: false,
    x: 446,
    z: 1033,
    scale: 3.5,
    r: 0.6,
    h: 1.1,
    standableTop: 1.1,
  },
  {
    key: 'hexCannonballs',
    terrainCalm: false,
    x: 447.5,
    z: 1034.5,
    rot: 0.3,
    scale: 3,
    r: 0.52,
    h: 0.94,
    standableTop: 0.94,
  },
  { key: 'hexSack', terrainCalm: false, x: 446.5, z: 1036, rot: 0.5, scale: 6 },
  {
    key: 'kcasCratesStacked',
    terrainCalm: false,
    x: 438,
    z: 1039,
    rot: 0.15,
    scale: 0.85,
    r: 1.4,
    hw: 0.98,
    hd: 1,
    h: 1.77,
  },
];

// Keep the accepted arrangement relative to the station when trying another site.
export const CANNON_EMPLACEMENT_PROPS: NonNullable<ZonePropsDef['decorProps']> =
  VEHICLE_STATIONS.flatMap((station) =>
    DRESSING.map((prop) => ({
      ...prop,
      x: prop.x - 442 + station.x,
      z: prop.z - 1034 + station.z,
    })),
  );
