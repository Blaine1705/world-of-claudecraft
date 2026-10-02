// The Wildheart Basin's PLACEHOLDER creature looks (docs/design/dungeon-rework/
// wildheart_basin.md section 4): shipped rigs re-tinted for the jungle so every
// new creature of the reworked basin is visible and animated from day one,
// until the art phase gives each its own body (the Great Saurian's sauropod is
// being modelled in Blender; its key here keeps the mob id and the visual key,
// so the swap is a def change). manifest.ts merges these over its VISUALS and
// maps the templates through MOB_KEYS (WILDHEART_MOB_KEYS).
//
// Sizes ride the templates' sim scales (sim/content/wildheart.ts): `grow`
// stands every creature well past a player (2.6 yd) without touching the sim's
// reach (the owner's rule: imposing, never toy-like). Heights below are the
// drawn height at the template's scale.

import type { ClipMap, VisualDef } from './manifest';

/** A carved prop that never moves: every clip lookup misses harmlessly. */
const STATIC_TOTEM_CLIPS: ClipMap = {
  idle: 'Idle',
  walk: 'Idle',
  run: 'Idle',
  attack: ['Idle'],
  death: 'Idle',
};

/** [base visual key, tint, tint strength, height factor over the base, extra]. */
type PlaceholderRow = [string, number, number, number, Partial<VisualDef>?];

const ROWS: Record<string, PlaceholderRow> = {
  // Basin Raptor: the velociraptor in jungle olive; about 3.8 yd at its 1.7.
  wildheart_basin_raptor: ['mob_spearjaw', 0x6f7a3a, 0.6, 1.25],
  // Spore Toad: the frog rig, warty olive and as big as a boar (4.5 yd at 2.4).
  wildheart_spore_toad: ['mob_murloc', 0x7f8a34, 0.7, 1.1, { selfIllumination: 0.08 }],
  // Snarlvine Lasher: the treant body in dark bark and vine (5.7 yd at 2.2).
  wildheart_vine_lasher: ['mob_treant', 0x445624, 0.8, 1],
  // Sunbone Totem-Binder: the Hexcaller under a bone-ochre wash.
  wildheart_totem_binder: ['mob_wildheart_hexcaller', 0xd9b26a, 0.3, 1.05],
  // The Howdah Hexcaller: the Hexcaller in the howdah's war red.
  wildheart_howdah_hexcaller: ['mob_wildheart_hexcaller', 0xa3322a, 0.22, 1],
  // The Fanglord's Great Jaguar: the great cat in gold (its rosettes stay the
  // texture's dark marks); about 4.6 yd at its 2.4, a head over a horse.
  wildheart_fanglord_jaguar: ['form_cat', 0xd8a548, 0.45, 1, { clickRadius: 1.8 }],
  // The Gorgebloom: the great cap rig washed blood red, rooted (it only turns
  // to face its target); about 10 yd at its 2.8.
  wildheart_gorgebloom: [
    'mob_hoard_boss_mushroom',
    0xb3202c,
    0.7,
    1.64,
    { selfIllumination: 0.35, clickRadius: 3.2 },
  ],
  // The Great Saurian (TEMPORARY until its Blender sauropod lands): the
  // colossal tower-backed crawler in moss green, the tower on its back reading
  // as the howdah; about 13.4 yd at its 3.2, as big as a house
  // (render/wildheart_basin/basin_fx_core.ts SAURIAN_DRAW matches it).
  wildheart_great_saurian: [
    'mob_turretback',
    0x5f7a3a,
    0.6,
    0.28,
    { selfIllumination: 0.1, clickRadius: 4.5 },
  ],
};

/** The placeholder defs, derived from the base rigs already in `visuals`. */
export function wildheartPlaceholderLooks(
  visuals: Readonly<Record<string, VisualDef>>,
): Record<string, VisualDef> {
  const out: Record<string, VisualDef> = {};
  for (const [key, [base, tint, tintStrength, grow, extra]] of Object.entries(ROWS)) {
    const def = visuals[base];
    if (!def) continue;
    out[key] = { ...def, height: def.height * grow, tint, tintStrength, ...extra };
  }
  // The Sunbone Totem: the shipped carved mask totem as a stationary prop
  // (about 6.4 yd at its 1.6), its bone and ochre kept, a faint inner glow.
  out.wildheart_sunbone_totem = {
    url: 'models/props/wildheart_mask_totem.glb',
    height: 4,
    clips: STATIC_TOTEM_CLIPS,
    authoredAtlas: true,
    selfIllumination: 0.18,
    clickRadius: 1.4,
  };
  return out;
}

/** Each new Wildheart template's visual key (merged into manifest MOB_KEYS). */
export const WILDHEART_MOB_KEYS: Readonly<Record<string, string>> = {
  basin_raptor: 'wildheart_basin_raptor',
  spore_toad: 'wildheart_spore_toad',
  vine_lasher: 'wildheart_vine_lasher',
  sunbone_totem_binder: 'wildheart_totem_binder',
  sunbone_totem: 'wildheart_sunbone_totem',
  howdah_hexcaller: 'wildheart_howdah_hexcaller',
  fanglord_jaguar: 'wildheart_fanglord_jaguar',
  the_gorgebloom: 'wildheart_gorgebloom',
  great_saurian: 'wildheart_great_saurian',
};
