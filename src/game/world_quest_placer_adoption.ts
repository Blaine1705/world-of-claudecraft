// Once an exported draft is built into the world, reconnect that exact draft
// to the new live sources so reopening it cannot draw duplicate originals.
import {
  FARSHORE_SALVAGE_PLACEMENTS,
  FARSHORE_SHIPWRECK_PLACEMENT,
} from '../sim/content/farshore_shipwreck_layout';
import { FARSHORE_SALVAGE_ENTITY_ID_START } from '../sim/content/world_quests';

interface Placement {
  key: string;
  x: number;
  y: number;
  z: number;
  rot: number;
  scale: number;
  pitch?: number;
  roll?: number;
  sourceId?: string;
}

export function adoptShippedShipwreckDraft<T extends Placement>(
  entries: T[],
): { entries: T[]; importedSources: string[] } | null {
  const shipped = [FARSHORE_SHIPWRECK_PLACEMENT, ...FARSHORE_SALVAGE_PLACEMENTS];
  if (
    entries.length !== shipped.length ||
    !entries.every((entry, index) => {
      const expected = shipped[index];
      return (
        entry.key === expected.key &&
        (entry.pitch ?? 0) === 0 &&
        (entry.roll ?? 0) === 0 &&
        (['x', 'y', 'z', 'rot', 'scale'] as const).every(
          (field) => Math.abs(entry[field] - expected[field]) < 1e-8,
        )
      );
    })
  )
    return null;
  const importedSources = shipped.map((_, index) =>
    index === 0 ? 'shipwreck:ship' : `salvage:${FARSHORE_SALVAGE_ENTITY_ID_START + index - 1}`,
  );
  return {
    entries: entries.map((entry, index) => ({ ...entry, sourceId: importedSources[index] })),
    importedSources,
  };
}
