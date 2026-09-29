# src/sim/encounters/sunken_bastion: the Sunken Bastion boss fights

The three boss encounters of the Sunken Bastion rework
(`docs/design/dungeon-rework/sunken_bastion.md`, sections 5 and 6), ticked once per
claim by `tickBastionEncounters` (`index.ts`), called from
`instances/dungeons.ts` `updateInstances` right after the trash kit, so a planted
charge, a pinned veil or a hauled player owns its position for the tick.

| Module | Role |
|---|---|
| `ids.ts` | Leaf: ids, cast and aura ids, object templates, tuning and the pure geometry (`oathLaneEnd`, `veilSlots`, `veilBeamYaw`, `inBeam`). The renderer and tests key on it. |
| `claim.ts` | Claim plumbing: the live Bastion claims, their players and bosses, encounter object spawn/drop, mechanic damage through the heroic stamp, manual deed grants. |
| `olen.ts` | The Oathbound Charge into the buttresses (Breached or Unbroken Oath), heroic Undertow Wake. |
| `ossick.ts` | The Gaol Hook and the lit mooring posts, the keelhaul, the cudgel, Open the Cells; heroic Double Hook and Heavy Chain. |
| `vael.ts` | Mist Surge, the Fog Veil with its shades and the Fogbeacon's beam, the Drowning Hymn, Fogburst; heroic drift. |

Rules:
- Deterministic: randomness only through `ctx.rng` (most picks use `kitHash`, zero
  draws), entity-id ordering, fixed DT countdowns.
- Every visible state rides existing entity fields (cast bars, facing, auras, object
  template ids, object scale), so the online client mirrors it with no wire or
  IWorld change.
- Reset on evade and wipe restores the buttresses, relights the posts and lifts the veil.
- Tests: `tests/sunken_bastion_bosses.test.ts`; dev triggers: `/dev bastion trigger`.
