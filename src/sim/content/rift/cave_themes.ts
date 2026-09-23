// The cave bosses of the common and rare Buried Hoards. A common or rare map
// opens a cave room sized for a small party, and the eight themed bosses of
// RIFT_THEMES were built for the wide valleys of the epic and legendary maps
// (their mechanics reach 16 to 75 yards), so a cave draws its theme, and with it
// its boss, from this list instead (src/sim/rift/rift_gen.ts themeForFloor).
// Ordinary rifts never read it. Data-as-code: no logic here.
//
// These themes stay OUT of RIFT_THEMES on purpose: that list is every ordinary
// rift's pool, its roster index and its upgrade manifest.

import type { RiftTheme } from './themes';

export const CAVE_THEMES: readonly RiftTheme[] = [
  {
    id: 'spore',
    name: 'Spore Hollow',
    nouns: ['Spore', 'Toadstool', 'Mould', 'Mycelium'],
    kit: 'temple',
    torch: { flame: 0xd8f07a, emissive: 0x8aa82a, light: 0xc6e06a },
    fog: { color: 0x10120a, near: 14, far: 76 },
    wallTint: 0x9a8a6a,
    floorTint: 0x8a7a55,
    trash: ['rift_venom_weaver', 'rift_thornback'],
    boss: 'hoard_boss_mushroom',
  },
];
