// Which dungeon interiors prewarm encounter character programs at first
// attach: the catalog Soul Rend clones plus the live player visuals already in
// the room. Boot never pays this; the outdoor zone prewarm stops at the dungeon
// door.
//
// Deliberately NOT the encounter's own NPC. Brother Aldric was the first
// suspect and the A/B says he is innocent: entering the arena from a start zone
// that had never compiled npc_aldric, his 70% spawn still linked ZERO programs
// and cost 29ms, because his rig shares its programs with the player bodies
// already on screen. Warming a model that costs nothing is work, not a fix.
import { WEAPON_SKINS } from '../sim/content/weapon_skins';
import type { PlayerClass } from '../sim/types';

export interface InteriorEncounterPrewarmSpec {
  soulRendPlayerClasses: boolean;
  soulRendVfxWeaponSkins: boolean;
  soulRendLivePlayerVisuals: boolean;
}

export const INTERIOR_ENCOUNTER_PREWARM: Record<string, InteriorEncounterPrewarmSpec> = {
  nythraxis: {
    soulRendPlayerClasses: true,
    soulRendVfxWeaponSkins: true,
    soulRendLivePlayerVisuals: true,
  },
};

export function encounterPrewarmForInterior(interior: string): InteriorEncounterPrewarmSpec | null {
  return INTERIOR_ENCOUNTER_PREWARM[interior] ?? null;
}

export function encounterPrewarmDisabled(search: string): boolean {
  const value = new URLSearchParams(search).get('encounterPrewarm');
  return value === '0' || value === 'off';
}

export function vfxWeaponSkinIds(
  skins: Record<string, { id: string; model: string }> = WEAPON_SKINS,
  vfxModels: Record<string, unknown> = {},
): string[] {
  const ids: string[] = [];
  for (const skin of Object.values(skins)) {
    if (vfxModels[skin.model]) ids.push(skin.id);
  }
  return ids;
}

export interface InteriorEncounterPrewarmPlan {
  playerClasses: PlayerClass[];
  weaponSkinIds: string[];
}

export function planInteriorEncounterPrewarm(
  spec: InteriorEncounterPrewarmSpec,
  opts: {
    playerClasses: readonly PlayerClass[];
    weaponSkinIds: readonly string[];
  },
): InteriorEncounterPrewarmPlan {
  return {
    playerClasses: spec.soulRendPlayerClasses ? [...opts.playerClasses] : [],
    weaponSkinIds: spec.soulRendVfxWeaponSkins ? [...opts.weaponSkinIds] : [],
  };
}

// Keyed on the worn skin alone: the caller holds one warmed set PER VISUAL, and
// a visual belongs to one body, so an entity id in the key would say nothing the
// map does not already say (and forced a reverse scan to recover it).
export function liveSoulRendPrewarmIdentity(weaponSkinId: string | null): string {
  return weaponSkinId ?? '';
}

export function shouldQueueLiveSoulRendPrewarm(opts: {
  disabled: boolean;
  spec: InteriorEncounterPrewarmSpec | null;
  kind: string;
  shutdown: boolean;
  already: boolean;
}): boolean {
  // No materialCount arm: the slots are built AFTER this decision, on an idle
  // slot, so no caller here can know the count. An empty rig is caught there.
  if (opts.disabled || !opts.spec?.soulRendLivePlayerVisuals) return false;
  return opts.kind === 'player' && !opts.shutdown && !opts.already;
}
