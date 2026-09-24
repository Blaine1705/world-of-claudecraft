// Encode half of the player identity lines every nameplate and mouseover
// tooltip reads: the guild (or a pledge to one), the guild colour tier, the
// Book of Deeds title and nameplate border, and the chosen talent spec.
// Extracted from game.ts identityFields so the wire keys live beside the one
// decode that reads them (src/net/player_identity_wire.ts, pinned together by
// tests/player_identity_wire.test.ts) and the monolith stays a consumer.
//
// Runs inside the per-entity, per-tick identity stringify (wireCacheFor), so
// it stays a handful of scalar truthiness checks with no allocation. Sparse by
// construction: an absent key on a full identity record means "unset", which
// the decode resets to its default, so an unguilded, untitled, unspecced
// player ships none of these bytes.

import type { Entity } from '../src/sim/types';

export function writePlayerIdentityWire(e: Entity, out: Record<string, unknown>): void {
  if (e.guild) out.gd = e.guild;
  if (e.pledgeGuild) out.pg = e.pledgeGuild; // guild pledge (display only; '' for members)
  if (e.guildTier) out.gt = e.guildTier; // guild colour tier (sim/guild_tier.ts)
  if (e.title) out.title = e.title; // Book of Deeds active title (a deed id; the client localizes)
  if (e.border) out.border = e.border; // Book of Deeds nameplate border (a deed id; the client resolves the slug)
  if (e.specId) out.spc = e.specId; // chosen talent spec (a spec id; the client localizes)
}
