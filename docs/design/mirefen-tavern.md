# The Mirefen tavern

A walk-in, two-storey inn on the Fenbridge road in Mirefen Marsh: the first interior in the
open world built to classic-inn scale for the 2.6 yd player (it reads big when you walk in,
and the furniture reads right next to you). Original work for this game: the plan, the model
and its texture-free palette were authored here from a written brief; reference captures of
classic inns were studied for mood and proportion only and never entered the build.

## Where and what

- **Site.** `TAVERN_ORIGIN` in `src/sim/content/mirefen_tavern.ts`, the door facing the road
  (world +x). Clear of the road, the camps, the gather nodes and the quest objects
  (`tests/mirefen_tavern.test.ts` "the site").
- **Plan.** An L: the common room (the hall) with a round hearth one step down in the middle of
  the floor, table nooks under low beams down both sides, the bar on a raised platform wrapped
  round a stone pillar, a railed gallery over the barrel wall; a round stair tower in the
  inner corner, open to the hall through an arch, with a stone spiral to the upper floor; the
  wing behind the hall with a landing and two guest rooms. Outside: a front gable with a porch
  canopy, a giant wooden tankard hung from an iron arm as the sign, a river-stone chimney on the
  side the road from Fenbridge sees, a dark green slate roof, the tower's slate hat over it.
- **Scale.** Every number lives in the content module (`TAVERN_HALL`, `TAVERN_DOOR`,
  `TAVERN_TOWER`, `TAVERN_PROPS`) and is pinned against the player's height by
  `tests/mirefen_tavern.test.ts` "scaled for the player".

## How it works

- **Floor.** `src/sim/mirefen_tavern_floor.ts` answers ONE absolute walk height per point over
  the footprint, folded into `groundHeight` by `src/sim/walk_lifts.ts` as a max (the Forgefather
  stair idiom). Every upper floor stands over solid ground (the gallery over the barrel wall,
  the landing over the stair's head, the wing over its closed cellar), so nothing walks under
  anything: no `passUnderY`, no change to the movement solver or to line of sight for any other
  collider. The terrain the renderer draws (`terrainHeight`) is untouched; the building stands
  on a stone base over it. Only the `groundHeight` samples on the tavern's floor were re-pinned
  in `tests/fixtures/terrain_height_parity.v1.f64le.gz`.
- **Colliders.** `src/sim/mirefen_tavern.ts` `mirefenTavernColliders`, joined to the static grid
  through `src/sim/built_structure_colliders.ts` (built-in world only): full-height walls minus
  the openings, a ring of boxes for the tower, rails at the gallery edge and the landing's drop,
  the barrel wall as a standable box topped at the upper floor (so a spell from below stops at
  it), and the furniture (standable) and structure (full height).
- **Rest area.** The inn rule (`src/sim/progression/xp.ts` `isResting`) through
  `tavernRestsAt`: anywhere inside, both floors, out of combat.
- **Innkeeper.** `MIREFEN_TAVERN_NPCS`, a gossip NPC spawned under the reserved
  `TAVERN_KEEPER_ENTITY_ID` by `src/sim/built_world_keepers.ts` (no sequential id moves), her
  calm pad skipped (`src/sim/terrain_calm_anchors.ts`) because she stands on the tavern's floor.
- **Scatter and grass** keep off the footprint (`src/sim/decoration_exclusions.ts`,
  `src/render/foliage_core.ts` `mirefenTavernGrassExclusions`); rain stops falling on a player
  inside (`src/render/precip_shelter.ts`).

## On screen

- **Model.** One Blender-built GLB, `public/models/props/mirefen_tavern.glb`, from the sim's own
  layout (`scripts/assets/mirefen_tavern/layout.ts` writes `layout.json`; `build_tavern.py` with
  `tavern_frame.py`, `tavern_shell.py` and `tavern_furnish.py` builds it; `build.mjs` validates,
  fingerprints and compresses it). Vertex-coloured, texture-free, five materials. The warm light
  of the fires and lanterns is baked into the inside's vertex colours (`bake_warm_light`),
  because the runtime shares its few point lights with the whole world.
- **Painter.** `src/render/mirefen_tavern.ts` over the pure core
  `src/render/mirefen_tavern_core.ts`: the walls, roofs, gallery and partitions are separate
  shell parts. Indoors every part between the camera and the player is cut away (the Harbormaster's
  House idiom, the chase camera never pulls in); outdoors a part that hides the player ghosts.
- **Tiers.** Everything walkable or solid, the whole shell and every light on every preset; the
  trim from medium, the clutter from high (`mirefenTavernParts`).
- **Fires.** The round hearth and the wall fireplace burn with the campfires' live flame
  (`MIREFEN_TAVERN_FLAMES`, built in `src/render/props.ts`), lit by the fire-light budget.

## Rebuilding the model

```
npx tsx scripts/assets/mirefen_tavern/layout.ts
blender --background --python scripts/assets/mirefen_tavern/build_tavern.py
node scripts/assets/mirefen_tavern/build.mjs
node scripts/build_media_manifest.mjs generate
```

Then re-pin the size, hash and per-part triangles in `tests/mirefen_tavern_asset.test.ts`. The
owner's review scene (terrain, player figures, a roof-off copy, warm lights, cameras) comes from
the same build with `-- --save FILE.blend --context TERRAIN.json` (`tavern_scene.py`), and
`open_tavern.py` frames it; `scripts/mirefen_tavern_shot.mjs` captures the in-game views.
