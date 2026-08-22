// Interactable town noticeboards. The active WorldContent supplies this list,
// keeping entity spawn, static collision, and interaction under one authority.

import { EASTBROOK_LAYOUT } from '../eastbrook_layout';
import { FENBRIDGE_LAYOUT } from '../fenbridge_layout';
import {
  assertCanonicalEastbrookNoticeboardDef,
  type MusterBoardDef,
  type NoticeboardDef,
} from '../types';

export type { NoticeboardDef } from '../types';

const eastbrook = EASTBROOK_LAYOUT.services.noticeboard;

const EASTBROOK_NOTICEBOARD = {
  id: eastbrook.id,
  entityId: eastbrook.entityId,
  templateId: eastbrook.templateId,
  assetId: eastbrook.assetId,
  name: eastbrook.name,
  x: eastbrook.position.x,
  z: eastbrook.position.z,
  rotation: eastbrook.rotation,
  width: eastbrook.nativeDimensions.width,
  depth: eastbrook.nativeDimensions.depth,
  height: eastbrook.nativeDimensions.height,
  interactionRadius: eastbrook.interactionRadius,
  frontStandingPoint: { ...eastbrook.frontStandingPoint },
} satisfies NoticeboardDef;

assertCanonicalEastbrookNoticeboardDef(EASTBROOK_NOTICEBOARD);

// Dawnrest Camp's board on the tutorial island (the Proving Shore): the same
// canonical board prop and interaction as Eastbrook's, so guild notices posted
// to the board surface reach the newest players too, where they are deciding
// who to travel with. Everything except id, entityId, placement and facing is
// the canonical shape the Sim's constructor asserts on every board.
const PROVING_SHORE_NOTICEBOARD = {
  id: 'proving_shore_noticeboard',
  // The reserved high-range static-service id one past Eastbrook's, so adding
  // a board never shifts the sequential entity allocator (see eastbrook_layout).
  entityId: 2_000_000_002,
  templateId: eastbrook.templateId,
  assetId: eastbrook.assetId,
  name: eastbrook.name,
  // Just south of the camp's south fence run, facing north at its gate, so
  // every recruit walking between the camp and the yard passes its face.
  // z 41 rather than 40 ON PURPOSE: the Wick-path streetlamp plan drops a
  // post at about (-311.8, 41.6), squarely on the board's old reading spot,
  // and the board's own collider clearance (colliders.ts
  // buildStreetlampPlacements' blocked probe, LAMP_CLEARANCE) is what
  // suppresses that post; the
  // authored gate lantern at (-320, 40) carries the light instead
  // (proving_shore.ts decorProps).
  x: -312,
  z: 41,
  rotation: 0,
  width: eastbrook.nativeDimensions.width,
  depth: eastbrook.nativeDimensions.depth,
  height: eastbrook.nativeDimensions.height,
  interactionRadius: eastbrook.interactionRadius,
  // The board is a solid collider, so walkers aim for the reading spot in
  // front of it rather than the board's own point (the Eastbrook pattern).
  frontStandingPoint: { x: -312, z: 42.5 },
} satisfies NoticeboardDef;

assertCanonicalEastbrookNoticeboardDef(PROVING_SHORE_NOTICEBOARD);

export const NOTICEBOARDS: readonly NoticeboardDef[] = Object.freeze([
  EASTBROOK_NOTICEBOARD,
  PROVING_SHORE_NOTICEBOARD,
]);

const fenbridgeMusterBoard = FENBRIDGE_LAYOUT.civic.musterBoard;

/** Non-interactive boards still live in active-world services so rendering,
 * capture evidence, and static collision all read the same optional record. */
export const MUSTER_BOARDS: readonly MusterBoardDef[] = Object.freeze([
  {
    id: fenbridgeMusterBoard.id,
    assetId: fenbridgeMusterBoard.assetId,
    x: fenbridgeMusterBoard.position.x,
    z: fenbridgeMusterBoard.position.z,
    rotation: fenbridgeMusterBoard.rotation,
    width: fenbridgeMusterBoard.nativeDimensions.width,
    depth: fenbridgeMusterBoard.nativeDimensions.depth,
    height: fenbridgeMusterBoard.nativeDimensions.height,
    frontStandingPoint: { ...fenbridgeMusterBoard.frontStandingPoint },
  } satisfies MusterBoardDef,
]);

/** Resolve only an authored active-world board and validate any untyped boundary. */
export function noticeboardDefByEntityId(
  definitions: readonly NoticeboardDef[] | undefined,
  entityId: number,
): NoticeboardDef | null {
  const definition = definitions?.find((candidate) => candidate.entityId === entityId);
  if (!definition) return null;
  assertCanonicalEastbrookNoticeboardDef(definition);
  return definition;
}
