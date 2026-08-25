import { IGNIVAR_ARENA_LIGHTING } from './ignivar_arena_atmosphere';

export type IgnivarRaidFogState = 'ignivarApproach' | 'ignivar' | 'varkhul';

interface RaidEnvironmentProfile {
  fogColor: number;
  fogNear: number;
  fogFar: number;
  sunColor: number;
  sunIntensity: number;
  hemiSkyColor: number;
  hemiGroundColor: number;
  hemiIntensity: number;
  envIntensity: number;
  rimIntensity: number;
  rimColor: number;
}

// One vibe across all three rooms: SUNSET IN A FORGE. A low amber key plus a
// warm dusk ambient carry the scene bright enough to read, the fog is lifted
// smoke instead of near-black, and the IBL sits close to the dungeon floor
// (0.05) because the shared environment map is the DAYLIGHT sky: at the old
// 0.2 to 0.34 it frosted every rig blue-white, which read as a milky sheen on
// the dark automata. The rim is re-tinted ember here for the same reason; the
// rooms stay distinct by depth (the approach is golden smoke, the arena a
// deeper blaze, the crucible the reddest and hottest).
export const IGNIVAR_RAID_ENVIRONMENT: Readonly<
  Record<IgnivarRaidFogState, RaidEnvironmentProfile>
> = Object.freeze({
  ignivarApproach: Object.freeze({
    fogColor: 0x351708,
    fogNear: 26,
    fogFar: 100,
    sunColor: 0xffa851,
    sunIntensity: 1,
    hemiSkyColor: 0x8f4526,
    hemiGroundColor: 0x241009,
    hemiIntensity: 0.42,
    envIntensity: 0.1,
    rimIntensity: 1.1,
    rimColor: 0xffb066,
  }),
  ignivar: IGNIVAR_ARENA_LIGHTING,
  varkhul: Object.freeze({
    fogColor: 0x3d1206,
    fogNear: 30,
    fogFar: 118,
    sunColor: 0xff8f3c,
    sunIntensity: 1.05,
    hemiSkyColor: 0x9a3d24,
    hemiGroundColor: 0x2a0d06,
    hemiIntensity: 0.44,
    envIntensity: 0.12,
    rimIntensity: 1.1,
    rimColor: 0xff9a4e,
  }),
});

export function ignivarRaidFogStateForInterior(
  interior: string | null,
): IgnivarRaidFogState | null {
  if (interior === 'ignivar_approach') return 'ignivarApproach';
  if (interior === 'ignivar') return 'ignivar';
  if (interior === 'ignivar_depths') return 'varkhul';
  return null;
}

export function applyIgnivarRaidFog(
  state: IgnivarRaidFogState,
  fog: { color: { setHex(value: number): unknown }; near: number; far: number },
): void {
  const profile = IGNIVAR_RAID_ENVIRONMENT[state];
  fog.color.setHex(profile.fogColor);
  fog.near = profile.fogNear;
  fog.far = profile.fogFar;
}

export function applyIgnivarRaidLighting(
  state: IgnivarRaidFogState,
  target: {
    sun: { color: { setHex(value: number): unknown }; intensity: number };
    hemi: {
      color: { setHex(value: number): unknown };
      groundColor: { setHex(value: number): unknown };
      intensity: number;
    };
    scene: { environmentIntensity: number };
    rim: { value: number };
    rimColor: { value: { setHex(value: number): unknown } };
  },
): void {
  const profile = IGNIVAR_RAID_ENVIRONMENT[state];
  target.sun.color.setHex(profile.sunColor);
  target.sun.intensity = profile.sunIntensity;
  target.hemi.color.setHex(profile.hemiSkyColor);
  target.hemi.groundColor.setHex(profile.hemiGroundColor);
  target.hemi.intensity = profile.hemiIntensity;
  target.scene.environmentIntensity = profile.envIntensity;
  target.rim.value = profile.rimIntensity;
  target.rimColor.value.setHex(profile.rimColor);
}
