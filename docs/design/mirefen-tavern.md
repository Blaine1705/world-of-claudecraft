# The Mirefen tavern

A walk-in inn on the Fenbridge road in Mirefen Marsh: the first interior in the open world
built to classic-inn scale for the 2.6 yd player (it reads big when you walk in, and the
furniture reads right next to you). One storey for players, the common room open to a high
hammerbeam roof. Original work for this game: the plan, the model and its texture-free palette
were authored here from a written brief; reference captures of classic inns were studied for
mood and proportion only and never entered the build.

## Where and what

- **Site.** `TAVERN_ORIGIN` in `src/sim/content/mirefen_tavern.ts`, the door facing the road
  (world +x). Clear of the road, the camps, the gather nodes and the quest objects
  (`tests/mirefen_tavern.test.ts` "the site").
- **Plan.** An L: the common room (the hall) with a round hearth one step down in the middle of
  the floor under a copper hood hung high from the ridge; a window booth either side of the
  door; the dice table, the long table and a wall booth down the left side; the bard's raised
  stage in the back left corner with its curtain, footlights and a banner over it; the wall
  fireplace and its settle on the right; the bar on a raised platform in the back right corner
  wrapped round a limestone pillar that carries a beam to the right wall, the barrel racks
  against the back wall either side of the kitchen's serving hatch. A round tower in the inner
  corner opens onto the hall through an arch: a flagged nook with a stone rose, a bench round
  its wall, two small tables, a tapestry and a crown of candles high in its cone. The wing
  behind the hall's right half is the kitchen and cellar, closed; the hatch looks into its
  kitchen (a range, a cook's table, pots and herbs). The rooms the innkeeper lets upstairs
  are never walked. Outside: a front gable with a porch canopy, a giant wooden tankard hung from an iron
  arm as the sign, a river-stone chimney on the side the road from Fenbridge sees, a dark green
  slate roof, the tower's slate hat over it.
- **Scale.** Every number lives in the content module (`TAVERN_HALL`, `TAVERN_DOOR`,
  `TAVERN_TOWER`, `TAVERN_STAGE`, `TAVERN_HATCH`, `TAVERN_PROPS`) and is pinned against the
  player's height by `tests/mirefen_tavern.test.ts` "scaled for the player".
- **Open to the roof.** No timber crosses the common room under `TAVERN_HALL.truss` (the hammer
  beams' undersides; only the short braces under them dip lower, hugging the side walls): the old gallery, its joists, the aisle posts and the low nook beams are
  gone, and every hung thing (the hood, the chandelier, the lanterns, the tankards on the bar's
  beam) hangs over the camera's air. `tests/mirefen_tavern_asset.test.ts` "keeps the common room
  clear" scans the shipped model for any triangle there.

## How it works

- **Floor.** `src/sim/mirefen_tavern_floor.ts` answers ONE absolute walk height per point over
  the footprint, folded into `groundHeight` by `src/sim/walk_lifts.ts` as a max (the Forgefather
  stair idiom): level, one ramped step down into the hearth pit, half a yard up onto the bar
  platform and the stage (each ramped at its open edges), level in the nook and the closed wing.
  There is no upper floor anywhere (`tests/mirefen_tavern.test.ts` "has no upper floor"). The
  terrain the renderer draws (`terrainHeight`) is untouched; the building stands on a stone base
  over it. Only the `groundHeight` samples on the tavern's floor are pinned in
  `tests/fixtures/terrain_height_parity.v1.f64le.gz`.
- **Colliders.** `src/sim/mirefen_tavern.ts` `mirefenTavernColliders`, joined to the static grid
  through `src/sim/built_structure_colliders.ts` (built-in world only): full-height walls minus
  the front doorway and the nook's arch (the back wall runs on over the kitchen hatch, so it is
  no way through), a ring of boxes for the tower, the porch parapets, and the furniture
  (standable) and what stands at full height (the hearth, the wall fireplace, the barrel racks,
  the bar's pillar).
- **Rest area.** The inn rule (`src/sim/progression/xp.ts` `isResting`) through
  `tavernRestsAt`: anywhere inside (the hall and the nook), out of combat.
- **Innkeeper.** `MIREFEN_TAVERN_NPCS`, a gossip NPC spawned under the reserved
  `TAVERN_KEEPER_ENTITY_ID` by `src/sim/built_world_keepers.ts` (no sequential id moves), her
  calm pad skipped (`src/sim/terrain_calm_anchors.ts`) because she stands on the tavern's floor.
  She stands behind the long counter, before the kitchen hatch.
- **Scatter and grass** keep off the footprint (`src/sim/decoration_exclusions.ts`,
  `src/render/foliage_core.ts` `mirefenTavernGrassExclusions`); rain stops falling on a player
  inside (`src/render/precip_shelter.ts`).

## On screen

- **Model.** One Blender-built GLB, `public/models/props/mirefen_tavern.glb`, from the sim's own
  layout (`scripts/assets/mirefen_tavern/layout.ts` writes `layout.json`; `build_tavern.py` with
  `tavern_frame.py`, `tavern_shell.py` and `tavern_furnish.py` builds it; `build.mjs` validates,
  fingerprints and compresses it). Vertex-coloured, texture-free, five materials. The warm light
  of the fires, lanterns, sconces and table candles is baked into the inside's vertex colours
  (`bake_warm_light`), because the runtime shares its few point lights with the whole world. The
  floor is whole: every spot a player may stand carries a drawn floor at the walk height
  (`tests/mirefen_tavern_floor_coverage.test.ts`).
- **Painter.** `src/render/mirefen_tavern.ts` over the pure core
  `src/render/mirefen_tavern_core.ts`: the walls, roofs, porch and the bar's pillar are separate
  shell parts. The front wall is three parts (the gable over the door with its posts, and
  either side of it) and the porch canopy with the tankard sign a fourth, so a camera behind any
  one ghosts it alone, never the whole front; a sight line through the open doorway crosses no
  part at all. Outdoors a part that hides the player ghosts and the chase camera never pulls in.
- **Indoor camera.** Indoors the camera stays in the tavern's air: the common room (up to
  `TAVERN_HALL_AIR_TOP`, a yard and more under the hammer beams, stepping round the barrel racks
  and the fireplace's breast), the doorway, the arch and the nook's round shaft are registered
  as boxes (`src/render/mirefen_tavern_interior_core.ts`) with the generic indoor camera clamp
  (`src/render/interior_camera.ts` over `src/render/interior_camera_core.ts`). It pulls the drawn
  camera in along its ray to just inside a wall (a near-plane pad clear), or, under the air's top
  or a lintel, flattens it by the least that clears it and keeps its distance, gliding both ways.
  Walking in, the camera follows through the door: past the doorway's threshold the lens comes
  down, keeping its distance behind the player, until it is no higher over the eye than the
  door's head allows (`interiorEntryCap`), so its sight line threads the doorway while it is
  still outside; a ray out through the door runs on past it, so the lens keeps its whole
  distance and nothing between it and the player is cut; once the requested lens has come in
  through the door the cap lets go. If the player stops just inside, the lens comes in to the
  room a moment later. The lens only ever comes down on the way in (never the old high
  dollhouse view, never a dive into the head: `tests/mirefen_tavern_interior_core.test.ts`
  "walking in and out through the front door", at the default, a steep far and a low close
  camera). It is the one authored-interior exception to the pinned no-pull-in rule
  (`tests/graphics_overhaul_integration.test.ts`: a player on the porch or in the doorway's
  thickness keeps the camera to the bit); the requested distance is never written. The bar's
  pillar stands in the air, so it cuts away when it stands between the lens and the player or
  hard by the lens. Where the boom is cramped the camera glides to the nearest comfortable
  framing, a lift or a swing along the wall; only in a dead-end corner does it cut to the eyes.
  While the player is inside, the plates of bodies outside draw only when seen through the front
  door (the nameplate painter's `interiorHidesNameplate` gate: the camera's sight line, or the
  player's eye while the lens still follows through the door); a selected target keeps its unit
  frame.
- **Tiers.** Everything walkable or solid, the whole shell and every light on every preset; the
  trim from medium, the clutter from high (`mirefenTavernParts`).
- **Fires and lights.** The round hearth and the wall fireplace burn with the campfires' live
  flame (`MIREFEN_TAVERN_FLAMES`, built in `src/render/props.ts`), lit by the fire-light budget
  with the chandelier, the lit lanterns under the hammer beams, the stage's footlights, the
  bar's candles and the nook's crown (`mirefenTavernLights`).

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
`open_tavern.py` frames it; `scripts/mirefen_tavern_shot.mjs` captures the in-game views (and,
with `WALKS=1`, the walks in and out through the front door).
