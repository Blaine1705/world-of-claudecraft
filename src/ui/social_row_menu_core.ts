// Social window row right-click: which player menu a row opens. A right-click on a
// Friends / Who / Guild / Raid / Pledges / Ignored / Blocked row opens the SAME menu
// a right-click on that player's unit frame would. DOM-free (social_window.ts reads
// the row's data attributes and the event point; hud.ts opens the chosen menu), so
// the routing is unit-tested in Node against plain Sim- and ClientWorld-shaped stubs.
//
// The routing, in order:
// - yourself: your own player-frame menu (party, loot, dungeon difficulty);
// - a player with a live pid (a raid row carries its member pid, so an out-of-range
//   raid member still gets the frame menu with promote/kick; anyone else resolves
//   through the interest-scoped entity roster): the unit-frame menu, keyed by pid;
// - a player with no entity near you (an offline friend, a far-off /who row): the
//   by-name player menu, the same one a chat name opens, since there is no frame
//   to mirror and every pid-keyed row (trade, duel) would be a no-op.

import type { Entity } from '../sim/types';

/** The player a Social row names, read off its `data-player` / `data-pid` attributes. */
export interface SocialRowPlayer {
  name: string;
  /** the member pid a raid row carries; null on every other tab */
  pid: number | null;
}

export type SocialRowMenuTarget =
  | { kind: 'self' }
  | { kind: 'unit'; pid: number; name: string }
  | { kind: 'name'; name: string };

/** The slice of IWorld the routing reads (both Sim and ClientWorld satisfy it). */
export interface SocialRowMenuWorld {
  playerId: number;
  player: Pick<Entity, 'name'>;
  entities: Map<number, Pick<Entity, 'id' | 'kind' | 'name'>>;
}

/** The pid of a player entity in view with this name (case-insensitive), else null. */
export function livePlayerPid(
  entities: Iterable<Pick<Entity, 'id' | 'kind' | 'name'>>,
  name: string,
): number | null {
  const wanted = name.toLowerCase();
  for (const e of entities) {
    if (e.kind === 'player' && e.name.toLowerCase() === wanted) return e.id;
  }
  return null;
}

/** Parse a row's data attributes; null when the row names no player. */
export function socialRowPlayer(data: { player?: string; pid?: string }): SocialRowPlayer | null {
  const name = (data.player ?? '').trim();
  if (!name) return null;
  const pid = data.pid !== undefined && data.pid !== '' ? Number(data.pid) : Number.NaN;
  return { name, pid: Number.isInteger(pid) && pid >= 0 ? pid : null };
}

export function socialRowMenuTarget(
  row: SocialRowPlayer,
  world: SocialRowMenuWorld,
): SocialRowMenuTarget {
  if (row.pid === world.playerId || row.name.toLowerCase() === world.player.name.toLowerCase())
    return { kind: 'self' };
  const pid = row.pid ?? livePlayerPid(world.entities.values(), row.name);
  return pid !== null ? { kind: 'unit', pid, name: row.name } : { kind: 'name', name: row.name };
}

/**
 * Where the menu opens. A pointer right-click carries real client coords; the
 * keyboard Menu key (Shift+F10) fires contextmenu at 0,0, so fall back to the
 * row's own box so the menu does not open in the corner of the screen.
 */
export function socialRowMenuPoint(
  ev: { clientX: number; clientY: number },
  rowRect: { left: number; bottom: number } | null,
): { x: number; y: number } {
  if (ev.clientX > 0 || ev.clientY > 0 || !rowRect) return { x: ev.clientX, y: ev.clientY };
  return { x: rowRect.left, y: rowRect.bottom };
}
