import type { SimEvent } from '../src/sim/types';

type CombatEventParty = {
  members: readonly number[];
};

/**
 * Resolve an entity's controller, or null when it has none. The broadcast path
 * supplies a lookup over the live entity map; a miss (the entity already
 * dropped) resolves to null, which degrades to the pre-pet behavior rather than
 * throwing inside the per-session fan-out.
 */
export type CombatEventOwnerLookup = (entityId: number) => number | null;

/**
 * Who an entity acts FOR. A pet is not a combat participant in its own right:
 * its damage belongs to its owner, and so does damage taken by it. Anything
 * ownerless is its own principal, so this can only ever widen delivery relative
 * to the raw-id comparison it replaces, never narrow it.
 */
function principalOf(entityId: number, ownerOf: CombatEventOwnerLookup): number {
  return ownerOf(entityId) ?? entityId;
}

function isViewerCombatParticipant(
  sourceId: number,
  targetId: number,
  viewerPid: number,
  viewerParty: CombatEventParty | null,
  ownerOf: CombatEventOwnerLookup,
): boolean {
  const source = principalOf(sourceId, ownerOf);
  const target = principalOf(targetId, ownerOf);
  if (source === viewerPid || target === viewerPid) return true;
  return (
    viewerParty?.members.includes(source) === true || viewerParty?.members.includes(target) === true
  );
}

/**
 * Whether one combat event belongs in one viewer's frame.
 *
 * The filter keeps a player out of every stranger's swing in a crowded zone. Its
 * original form compared the RAW entity ids, so a pet matched nothing: a pet is
 * neither the viewer's pid nor a member of any party, and the owner therefore
 * never received their own pet's damage. That silently removed pet output from
 * the damage meter, the combat log and floating combat text for every pet class
 * (hunter, warlock, mage). Resolving each side to its OWNER first is the fix; a
 * stranger's pet resolves to that stranger and stays filtered out.
 *
 * `ownerOf` is required rather than optional on purpose: an omitted lookup would
 * silently reinstate the bug at a call site that forgot to pass one.
 */
export function shouldDeliverCombatEventToViewer(
  ev: SimEvent,
  viewerPid: number,
  viewerParty: CombatEventParty | null,
  ownerOf: CombatEventOwnerLookup,
): boolean {
  if (ev.type === 'damage')
    return isViewerCombatParticipant(ev.sourceId, ev.targetId, viewerPid, viewerParty, ownerOf);
  if (ev.type === 'heal2')
    return isViewerCombatParticipant(ev.sourceId, ev.targetId, viewerPid, viewerParty, ownerOf);
  return true;
}
