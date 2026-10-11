import type { Entity } from '../sim/types';

type PickEntity = Pick<Entity, 'id' | 'kind' | 'dead' | 'lootable'>;

function lootableCorpse(e: PickEntity): boolean {
  return e.kind === 'mob' && e.dead && e.lootable;
}

// A live, selectable creature: a mob or player still standing. Excludes
// 'npc' and 'object' (a lootable corpse must never lose priority to a
// non-combat NPC or a world prop standing behind it) and anything dead.
// Issue #2787: this is the pick priority a click resolves to before it is
// allowed to fall into the dead-corpse loot branch below.
function isLiveTargetable(e: PickEntity): boolean {
  return (e.kind === 'mob' || e.kind === 'player') && !e.dead;
}

// The order a click walks the live hits in: ray order (nearest first), except
// that a USE-ONLY body (a live mob the caller says the local player can use
// and cannot attack: the Hollow Crypt's Remembrance Candle during Morthen's
// Rite, see world_direct_pick.ts) moves ahead of every other live hit. A boss
// whose wide click capsule stands between the camera and the candle used to
// take every click on it; now the candle is the first pick and the overlap
// cycling below reaches the boss on the next click. One exception keeps a
// click where it landed: when the NEAREST live hit is a player (a healer
// clicking the party member who is lighting the candle), ray order stands.
function liveClickOrder<E extends PickEntity>(
  live: E[],
  isUseOnlyBody: ((e: E) => boolean) | null,
): E[] {
  if (!isUseOnlyBody || live.length < 2 || live[0].kind === 'player') return live;
  const bodies: E[] = [];
  const rest: E[] = [];
  for (const e of live) {
    if (e.kind === 'mob' && isUseOnlyBody(e)) bodies.push(e);
    else rest.push(e);
  }
  return bodies.length === 0 ? live : bodies.concat(rest);
}

export function resolveDirectPickEntityId<E extends PickEntity>(
  hitEntityIds: readonly number[],
  entities: Pick<Map<number, E>, 'get'>,
  currentTargetId: number | null = null,
  isUseOnlyBody: ((e: E) => boolean) | null = null,
): number | null {
  const ordered: E[] = [];
  const seen = new Set<number>();
  for (const id of hitEntityIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const e = entities.get(id);
    if (!e) continue;
    if (e.kind === 'object' && !e.lootable) return null;
    if (e.kind === 'mob' && e.dead && !e.lootable) continue;
    ordered.push(e);
  }
  if (ordered.length === 0) return null;

  // Issue #2787: in a cluster with some mobs already dead, the raycast often
  // hits a corpse's capsule first (whichever body is visually in front) even
  // when a live mob or player is ALSO in the hit set, just farther along the
  // ray. Opening the loot popup for that corpse instead of selecting the
  // still-fighting mob is the "hard to target the last living mob" bug: the
  // nearest live hit wins over a leading corpse before the loot/cycle logic
  // below ever runs.
  // Large raid-boss click proxies can overlap smaller adds. Once the nearest
  // live hit is already selected, another click on the same stack advances to
  // the next live target instead of selecting the boss again forever.
  const liveTargets = liveClickOrder(ordered.filter(isLiveTargetable), isUseOnlyBody);
  const liveLeads = isLiveTargetable(ordered[0]) || lootableCorpse(ordered[0]);
  if (liveLeads && liveTargets.length > 1 && currentTargetId !== null) {
    const idx = liveTargets.findIndex((e) => e.id === currentTargetId);
    if (idx >= 0) return liveTargets[(idx + 1) % liveTargets.length].id;
  }
  // The first live hit in click order: the nearest one, unless a use-only body
  // moved ahead of it (liveClickOrder).
  if (liveLeads && liveTargets.length > 0) return liveTargets[0].id;

  const corpses = ordered.filter(lootableCorpse);
  if (lootableCorpse(ordered[0]) && corpses.length > 1 && currentTargetId !== null) {
    const idx = corpses.findIndex((e) => e.id === currentTargetId);
    if (idx >= 0) return corpses[(idx + 1) % corpses.length].id;
  }
  return ordered[0].id;
}
