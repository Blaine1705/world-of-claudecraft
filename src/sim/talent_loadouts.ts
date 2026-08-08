import {
  MAX_LOADOUTS,
  repairAllocation,
  SAVED_LOADOUT_BAR_SLOTS,
  type SavedLoadout,
} from './content/talents';
import type { SavedGearSet } from './loadout_gear';
import { isEquipSlot, type PlayerClass } from './types';

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Repair a persisted gear set. Loadouts live in untrusted JSONB, so every field is
 * re-derived rather than trusted: a slot key must be a real equip slot, the item id
 * a non-empty string, and the pin a string (its VALUE needs no validation, since a
 * pin that matches nothing simply reports the copy unavailable at apply time, which
 * is already a handled outcome).
 *
 * Returns undefined for anything unusable so the caller can OMIT the field rather
 * than store an empty object, keeping the persisted shape byte-identical for the
 * loadouts that never captured gear.
 */
function repairGearSet(value: unknown): SavedGearSet | undefined {
  const raw = recordValue(value);
  if (!raw) return undefined;
  const out: SavedGearSet = {};
  let kept = 0;
  for (const key of Object.keys(raw)) {
    if (!isEquipSlot(key)) continue;
    const piece = recordValue(raw[key]);
    if (!piece) continue;
    const itemId = piece.itemId;
    if (typeof itemId !== 'string' || itemId === '') continue;
    out[key] = { itemId, pin: typeof piece.pin === 'string' ? piece.pin : '' };
    kept++;
  }
  return kept > 0 ? out : undefined;
}

function repairBar(value: unknown): (string | null)[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, SAVED_LOADOUT_BAR_SLOTS)
    .map((slot) => (typeof slot === 'string' ? slot : null));
}

/**
 * Repair every persisted loadout and remap the active index after malformed
 * entries are dropped. The helper is pure and bounded for untrusted JSONB.
 */
export function repairTalentLoadouts(
  cls: PlayerClass,
  playerLevel: number,
  value: unknown,
  activeValue: unknown,
): { loadouts: SavedLoadout[]; activeLoadout: number } {
  if (!Array.isArray(value)) return { loadouts: [], activeLoadout: -1 };

  const rawActive =
    typeof activeValue === 'number' && Number.isSafeInteger(activeValue) ? activeValue : -1;
  const loadouts: SavedLoadout[] = [];
  let activeLoadout = -1;
  const source = value.slice(0, MAX_LOADOUTS);

  for (let rawIndex = 0; rawIndex < source.length; rawIndex++) {
    const raw = recordValue(source[rawIndex]);
    if (!raw) continue;
    const name = (typeof raw.name === 'string' && raw.name ? raw.name : 'Build').slice(0, 24);
    const repaired: SavedLoadout = {
      name,
      alloc: repairAllocation(cls, raw.alloc, playerLevel),
      bar: repairBar(raw.bar),
    };
    // Assigned conditionally so a loadout with no gear carries no `gear` KEY at
    // all, rather than an explicit undefined. Snapshot and persistence shapes are
    // compared structurally elsewhere, so an always-present key would change the
    // wire payload for every existing loadout.
    const gear = repairGearSet(raw.gear);
    if (gear) repaired.gear = gear;
    if (rawIndex === rawActive) activeLoadout = loadouts.length;
    loadouts.push(repaired);
  }

  return { loadouts, activeLoadout };
}
