# src/render/trash_engine_fx: the trash engine's visuals

The render half of the generic trash engine pieces (`src/sim/mob/trash_kit/CLAUDE.md`,
"Engine pieces"). Keyed ONLY on the engine's records, swept from every template's
`trashKit` plus the dev demo kit (`engine_demo.ts`), so a dungeon that adopts a piece
by data gets its look with no render change. Hosted by `../rift_death_zone.ts` beside
the dungeons' own fx; a dungeon's own layer may add to a beat (the Sanctum's toppled
brazier, `../gravewyrm_sanctum_fx/sanctum_kit_fx.ts`).

| Module | Role |
|---|---|
| `index.ts` | Public surface: `TrashEngineFx`, `isTrashEngineObject` (`../gate_objects.ts` gives those objects an empty anchor). |
| `trash_engine_fx_core.ts` | PURE (`RENDER_PURE_CORES`): the catalog swept from the kits (hazards, walls, walkers, novas, freeze stacks, brands, uses), the hazard looks, the wall box from `COMBAT_WALL_SHAPES`, the nova's `sightReach` bisection, wave and cast look, the use hint, rime and encase timelines, the brand flicker, the quench pools' world placement, the orb smoothing. |
| `trash_engine_fx.ts` | `TrashEngineFx`, the coordinator: the root (one `attachSceneGroupGated`), the telegraph kit, the particles, the shared ice shards (`SanctumShards`), the 10 Hz scan handing entities to the layers, the event routing. |
| `trash_engine_host.ts` | `TrashEngineHost`: the type-only seam the coordinator lends its layers. |
| `engine_particles.ts` | Pooled smoke / glow / soulfire / pyre particles and shock rings. |
| `engine_hazards.ts` | Hazard pools: boiling meltwater, spilled soulfire, a school disc fallback; the shared danger ring on a players' pool only. |
| `engine_walls.ts` + `ice_slab_geometry.ts` | Combat walls: the Ice Slab built to its collider box, its crash, strain and shatter (`spellfxAt`). |
| `engine_walkers.ts` | Walker orbs (glide, trail, floor glow, heading chevrons), launch, empower (and its lingering glow), intercept, fade (`spellfxAt`). An orb draws in its school tint unless the core's `WALKER_LOOKS` gives its template its own tint and float (the Revenant's green Throatlight at the chest, the Ray's Heartpearl rolling low); every aura a walker leaves (an arming on either difficulty, an ally shield, the group's gift) glows on its body. |
| `engine_nova.ts` | The line-of-sight nova: the SIGHT FIELD (each ray's reach bisected over the sim's own `lineOfSightClear`, so cover casts a hatched safe shadow), the kick glyph or the unstoppable's harsh edge, the landing wave stopping at each block. |
| `engine_use.ts` + `engine_glyphs.ts` | Usable bodies: the floating use glyph and reach ring for the local player within `USE_HINT_RANGE`, the effort arc while anyone channels, the strike. |
| `engine_body_fx.ts` | Freeze-stack rime crystals, the ice encase and its shatter, the brand on the chest, quenched and fizzled. |
| `engine_quench.ts` | The dungeon's quench pools in the player's slot: calm cold meltwater, one merged draw on the ground band. |

Rules:
- Telegraphs and the shapes a player acts on (pool rims, the wall body, the orb, its
  lane, the sight field and its shadow, the use glyph and ring, the quench pools) draw
  on EVERY tier. Particles, curtains and shimmer thin on the low tier (`density`, from
  the static preset through `ui_effects_profile`).
- No light. Every geometry, material and canvas texture is built in the constructors
  under the root before its gated attach; no lazily created material.
- Floor marks on the floor ladder (`tests/floor_vfx_layer.test.ts` names every module
  strict): the encounter band, the quench pools on the ground band's top rung.
- A new wall template draws the ice slab until it gets a look of its own here; a new
  hazard template draws the school disc until `hazardLook` names it.
- The wall shatter and the walker fade are world-point events (`spellfxAt`): their
  entity is gone the tick they fire, so the layer keeps its last spot.

Tests: `tests/trash_engine_fx.test.ts` (the catalog, the looks, the slab over its
footprint, the sight reach against a real combat wall, a smoke run of the coordinator).
