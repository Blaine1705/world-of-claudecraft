// The Stormbrass Foundry trash kit's cast ids, as a dependency-free leaf (the
// Hollow Crypt's live in cast_ids.ts, the Bastion's in bastion_cast_ids.ts, the
// Temple's in temple_cast_ids.ts): the content (stormbrass_foundry.ts), the kit
// driver, the interrupt table (mob/healer_channel.ts) and the renderer's
// telegraph table all key on these.

import type { Aura } from '../../types';

/** Brass Sentry: a telegraphed piston punch across its front (breathCone). */
export const FOUNDRY_PISTON_SLAM = 'foundry_piston_slam';
/** Foundry Engineer: an interruptible repair on a hurt automaton (trashKit.mend). */
export const FOUNDRY_FIELD_REPAIR = 'foundry_field_repair';
/** Gearwright Apprentice: plants a Tripod Turret beside her (trashKit.call). */
export const FOUNDRY_DEPLOY_TURRET = 'foundry_deploy_turret';
/** Shieldbearer Frame: an interruptible screen of steam over its pack (trashKit.screen). */
export const FOUNDRY_STEAM_SCREEN = 'foundry_steam_screen';
/** The absorb aura a Steam Screen puts on each ally. */
export const FOUNDRY_STEAM_SCREEN_AURA = 'foundry_steam_screen_ward';
/** Steam Bruiser: its boiler bursts where it fell (trashKit.deathBurst). */
export const FOUNDRY_BOILER_BURST = 'foundry_boiler_burst';
/** Arc Drone: it pops in a crackle of lightning as it dies (trashKit.deathBurst). */
export const FOUNDRY_ARC_POP = 'foundry_arc_pop';

/** The Foundry trash casts a player interrupt can lock out, by school. The
 *  Piston Slam and the turret are absent on purpose: step out of the one, kill
 *  the other. */
export const FOUNDRY_KIT_CAST_SCHOOLS: Readonly<Record<string, { school: Aura['school'] }>> = {
  [FOUNDRY_FIELD_REPAIR]: { school: 'nature' },
  [FOUNDRY_STEAM_SCREEN]: { school: 'fire' },
};
