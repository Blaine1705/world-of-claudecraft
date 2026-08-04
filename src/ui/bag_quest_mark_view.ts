// Pure, host-agnostic core for the bag grid's quest-purpose mark.
// Quest items are a PURPOSE class (kind === 'quest'), not a quality tier. The
// bag painter needs a single on/off (and later ready/orphaned) decision so every
// quest stack can wear a quest-gold rim, soft wash, and corner seal without the
// painter re-deriving kind logic.
//
// Phase 1 only needs on/off. The return type leaves room for Phase 5 ready and
// Phase 2 orphaned variants without renaming the seam:
//   'quest'           - active quest purpose (default rim + seal)
//   'questReady'      - ready to turn in (Phase 5)
//   'questOrphaned'   - no longer needed for an active quest (Phase 2/5)
//
// The mark is information-ADD and pairs with an aria-hidden seal: the cell's
// accessible name carries the quest fact, and the treatment renders identically
// on every graphics preset (no --fx gate), so it never becomes a fairness lever.
//
// Glyph priority (composed by the painter with bag_instance_glyph_view):
//   masterwork > quest seal > enchanted / signed / bound > generic wedge.
// Rim and wash always apply for any non-null mark kind.
//
// DOM/Three-free (registered in tests/architecture.test.ts UI_PURE_CORES).

export type BagQuestMarkKind = 'quest' | 'questReady' | 'questOrphaned' | null;

/** The quest-purpose mark for one bag stack, or null when the item is not a
 *  quest kind. Phase 1 always returns 'quest' or null; later phases may refine
 *  ready/orphaned from progress inputs without changing this entry shape. */
export function bagQuestMarkKind(item: { kind: string }): BagQuestMarkKind {
  if (item.kind === 'quest') return 'quest';
  return null;
}
