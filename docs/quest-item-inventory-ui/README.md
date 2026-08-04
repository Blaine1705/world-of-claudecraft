# Quest Item Inventory UI

Players cannot tell quest items from junk in the bags without careful hover reading.
This packet lands a classic-MMO, design-language-aligned treatment so quest stacks are
obvious at a glance, and their tooltips explain which quest they serve, current progress,
and the keep/sell rules.

## Worktree

| Field | Value |
|---|---|
| Worktree | `/Users/fernando/Documents/wocc-quest-item-ui` |
| Branch | `feature/quest-item-inventory-ui` |
| Base | `release/v0.34.0` (always rebase/merge latest before coding a phase) |

## Packet files

| File | Role |
|---|---|
| `implementation-plan.md` | Architecture, decisions, phases, starter prompts |
| `state.md` | Locked decisions, paths, validation matrix, resume point |
| `progress.md` | Phase checklist and verified status |

## Phase map

| Phase | Slice | Outcome |
|---|---|---|
| 1 | Bag visual identity | Quest gold rim, wash, seal, aria at a glance |
| 2 | Story tooltip | Related quest, progress, rules, orphaned state |
| 3 | Findability chrome | Filter count, empty state, soft Quest section |
| 4 | Cross-surface language | Chat links, loot names, blocked-drag polish |
| 5 | Interactive polish | Tracker <-> bag highlight, ready-to-turn-in seal |
| 6 | Final QA | Screenshots, gate, packet close / PR |

## Explicitly out of scope

- A separate ESO/FFXIV-style Key Items inventory that does not consume bag slots
  (product decision deferred; re-evaluate only if bag pressure becomes a real problem)
- Changing sim sell/bank/market rules (already correct)
- Retrofitting non-quest soulbound tokens with the quest seal
