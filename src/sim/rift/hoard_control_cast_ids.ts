// The Buried Hoard cast ids and their interruptible schools, as a
// dependency-free LEAF. mob/healer_channel.ts reads the schools, and
// content/dungeons.ts imports healer_channel, so this table must never reach
// ../data (hoard_control_casts.ts and hoard_lightning_strike.ts both do): that edge
// closed a content -> data import cycle that left DUNGEON_MOBS undefined at
// module eval for any entry point that loaded content first.

import type { Aura } from '../types';

/** Cast ids per control family. Each has a localized cast-bar name
 *  (src/ui/cast_display_name.ts) and an interruptible school. */
export const HOARD_CAST_FEAR = 'hoard_cast_fear';
export const HOARD_CAST_STUN = 'hoard_cast_stun';
export const HOARD_CAST_SILENCE = 'hoard_cast_silence';
export const HOARD_CAST_HEX = 'hoard_cast_hex';

export const HOARD_CONTROL_CAST_SCHOOLS: Readonly<Record<string, { school: Aura['school'] }>> =
  Object.freeze({
    [HOARD_CAST_FEAR]: { school: 'shadow' },
    [HOARD_CAST_STUN]: { school: 'nature' },
    [HOARD_CAST_SILENCE]: { school: 'shadow' },
    [HOARD_CAST_HEX]: { school: 'nature' },
  });

/** Hoarfrost's Ice Age (hoard_ice_age.ts): a cast bar to read, never one to
 *  kick, so it has no interruptible school. */
export const HOARD_CAST_ICE_AGE = 'hoard_ice_age';

/** Nyxaris's pulsar phase (hoard_pulsars.ts): the bar is the deadline the orbs
 *  must die by, never a cast to kick. */
export const HOARD_CAST_PULSAR_OVERLOAD = 'hoard_pulsar_overload';

/** Grask's Rolling Boulder (hoard_boulder.ts): the wind-up of the throw, read
 *  and answered, never kicked. */
export const HOARD_CAST_ROLLING_BOULDER = 'hoard_rolling_boulder';

/** The Storm Caller's Lightning Strike (hoard_lightning_strike.ts), here for the
 *  same reason: healer_channel.ts reads its school. */
export const HOARD_CAST_LIGHTNING_STRIKE = 'hoard_lightning_strike';
export const HOARD_LIGHTNING_STRIKE_CAST_SCHOOL: Readonly<Record<string, { school: 'nature' }>> = {
  [HOARD_CAST_LIGHTNING_STRIKE]: { school: 'nature' },
};

/** The hoard adds' own casts (hoard_add_casts.ts): every one a bar a kick cancels. */
export const HOARD_CAST_DROWNING_HOOK = 'hoard_cast_drowning_hook';
export const HOARD_CAST_RIME_BEAM = 'hoard_cast_rime_beam';
export const HOARD_CAST_CINDER_BOLT = 'hoard_cast_cinder_bolt';
export const HOARD_CAST_VOID_EMPOWER = 'hoard_cast_void_empower';
export const HOARD_CAST_WEBBING = 'hoard_cast_webbing';
export const HOARD_CAST_DOOM_RITUAL = 'hoard_cast_doom_ritual';

export const HOARD_ADD_CAST_SCHOOLS: Readonly<Record<string, { school: Aura['school'] }>> =
  Object.freeze({
    [HOARD_CAST_DROWNING_HOOK]: { school: 'nature' },
    [HOARD_CAST_RIME_BEAM]: { school: 'frost' },
    [HOARD_CAST_CINDER_BOLT]: { school: 'fire' },
    [HOARD_CAST_VOID_EMPOWER]: { school: 'shadow' },
    [HOARD_CAST_WEBBING]: { school: 'nature' },
    [HOARD_CAST_DOOM_RITUAL]: { school: 'shadow' },
  });
