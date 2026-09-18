// Treasure vault seeds (src/sim/treasure_vault.ts). A vault is a Rift run whose
// SEED says so: the top two bits are set (every natural and dev portal seed is
// drawn below 2^30, src/sim/rift/portals.ts, so the spaces never meet) and the
// next two carry the vault's size tier (0 to 3, the treasure map's rarity).
// Because the marker rides the descriptor seed, every host that regenerates a
// floor (the sim, the renderer, the rift map) reads the same vault shape with
// no extra wire field. Pure, no imports.

const VAULT_FLAG = 0xc0000000;
const RANDOM_MASK = 0x0fffffff;

export type VaultSizeTier = 0 | 1 | 2 | 3;

/** The vault size tier a seed encodes, or null for an ordinary rift seed. */
export function vaultSeedTier(seed: number): VaultSizeTier | null {
  const s = seed >>> 0;
  if ((s & VAULT_FLAG) >>> 0 !== VAULT_FLAG) return null;
  return ((s >>> 28) & 3) as VaultSizeTier;
}

/** A vault seed of `tier` from 28 random bits. */
export function makeVaultSeed(tier: VaultSizeTier, random: number): number {
  return (VAULT_FLAG | (tier << 28) | (random & RANDOM_MASK)) >>> 0;
}

/** The Buried Hoard's entrance object: a Rift entrance under its own template,
 *  so it renders and reads as a dug-open way down, never as a rift tear. */
export const HOARD_ENTRANCE_TEMPLATE_ID = 'hoard_entrance';

/** Whether an object template is a walk-in Rift entrance (a rift portal or a
 *  Buried Hoard entrance). The portal registry, the interact paths and the
 *  walk-in trigger all ask this one question. */
export function isRiftEntranceTemplate(templateId: string | undefined): boolean {
  return templateId === 'rift_portal' || templateId === HOARD_ENTRANCE_TEMPLATE_ID;
}
