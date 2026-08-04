import type { BiomeId } from '../sim/types';

export const STREETLAMP_STYLE_BY_ZONE = {
  eastbrook_vale: 'eastbrook_civic',
  mirefen_marsh: 'mirefen_witchflame',
  thornpeak_heights: 'thornpeak_beacon',
  veiled_hollow: 'veiled_crystal',
  drakelands: 'drakelands_brazier',
  frostveil: 'frostveil_icicle',
  amberfall: 'amberfall_crystal',
  willowfen: 'willowfen_reed',
  nightbloom: 'nightbloom_moonflower',
  wraithwood: 'wraithwood_ghost',
  palmreach: 'palmreach_totem',
  evergarden: 'evergarden_flower',
  galecrest: 'galecrest_mast',
  farshore_isle: 'farshore_coral',
} as const;

export type StreetlampStyleId =
  (typeof STREETLAMP_STYLE_BY_ZONE)[keyof typeof STREETLAMP_STYLE_BY_ZONE];

const STYLE_BY_BIOME: Readonly<Record<BiomeId, StreetlampStyleId>> = {
  vale: 'eastbrook_civic',
  marsh: 'mirefen_witchflame',
  peaks: 'thornpeak_beacon',
  beach: 'farshore_coral',
  desert: 'amberfall_crystal',
  volcano: 'drakelands_brazier',
  cave: 'veiled_crystal',
  dusk: 'veiled_crystal',
  ember: 'drakelands_brazier',
  frost: 'frostveil_icicle',
  amber: 'amberfall_crystal',
  fen: 'willowfen_reed',
  night: 'nightbloom_moonflower',
  haunt: 'wraithwood_ghost',
  jungle: 'palmreach_totem',
  garden: 'evergarden_flower',
  gale: 'galecrest_mast',
};

export const STREETLAMP_DEFAULT_STYLE: StreetlampStyleId = 'eastbrook_civic';

export function resolveStreetlampStyle(
  areaId: string | null,
  biome: BiomeId | null,
): StreetlampStyleId {
  if (areaId && areaId in STREETLAMP_STYLE_BY_ZONE) {
    return STREETLAMP_STYLE_BY_ZONE[areaId as keyof typeof STREETLAMP_STYLE_BY_ZONE];
  }
  return biome ? STYLE_BY_BIOME[biome] : STREETLAMP_DEFAULT_STYLE;
}
