# Far-foliage sprite impostors

The far field used to hand every tree to a deliberately illegible stand-in (a
cone for pines, a blob for oaks) that a fog-blend law had to keep buried in
murk. In the open realms that pushed the real-model radius out to roughly 500
units of full geometry and still left ghostly pyramids standing in the haze;
near-fill trees vanished outright at their density cap, rocks and bushes hard
popped at their numeric culls in clear air. This document describes the sprite
impostor system that replaced all of that, and the laws it runs on.

## What ships

At world build, `src/render/foliage_impostor.ts` bakes every foliage archetype
into one texture atlas by rendering the REAL extracted GLB parts offscreen
under a neutral hemisphere rig: each tree species variant from 12 yaw angles,
each rock colorway variant from 6, each bush kind from 8. The far field then
draws one InstancedMesh of camera-facing unit quads per (bucket, category).
Each instance:

- picks the two atlas views bracketing its camera bearing, offset by its own
  placement yaw (`instanceMatrix` carries it), and blends them, so orbiting
  the camera never snaps a silhouette;
- reconstructs its billboard offsets through the inverse of its instance
  rotation and scale, so the stock instancing chunks (projection, fog, world
  position) run unchanged;
- carries the exact placement, scale, height jitter and softened biome tint
  of its real twin, so the handoff moves nothing and recolors nothing;
- lights through the live Lambert pipeline over an up normal, the ground
  plane's response, so day-night grades, realm light levels and fog land on
  the sprite exactly as they land on the terrain under it (verified in the
  Nightbloom's dimmed violet grade);
- sways with the same travelling gust the real canopies ride, amplitude
  scaled by the real instance's scale, so a tree's motion is continuous
  across the handoff.

The atlas layout is pure math (`src/render/foliage_impostor_core.ts`,
registered in `RENDER_PURE_CORES`): a deterministic shelf packer that throws
when a grown kit cannot fit `IMPOSTOR_ATLAS_MAX`, pinned by
`tests/foliage_impostor_core.test.ts`.

## The handoff

Both sides of every swap evaluate the same per-instance hash
(`IMPOSTOR_JITTER_GLSL`, one source of truth in the pure core): the real
geometry collapses each instance at `swap - fade * jitter`
(`src/render/foliage_collapse.ts`) and the sprite begins it at the same
distance. The boundary is therefore never a front that sweeps the forest;
each tree trades representations alone, in one frame, between two pictures
sized and tinted to match. Bucket-level tests stay the coarse pre-filter
(`bucketVisible` in `src/render/foliage_lod.ts`, sprite rows keyed on their
category swap and dying at the LIVE fog wall rather than the model-quality
trimmed cull).

## Swap laws

Sprites are legible in clear air, so the sprite arm's real-model radius
follows the BUDGET again (`spriteSwapDistance` in the pure core):

- open realms: the budgeted radius itself (about 300u rested, 216u starved),
  where the old blend law forced ~506u of full geometry;
- a clear-air floor (`SPRITE_SWAP_MIN`) keeps a flat picture from standing
  closer than 150u in clear air, yielding to the 50 percent blend line in the
  murk realms, where parallax flatness is already mush;
- short-fog realms keep a guaranteed sprite band before the cull
  (`IMPOSTOR_MIN_BAND`, scaled down with a tight cull);
- a residency fog wall parks the handoff ON the wall: real trees to the
  wall, no sprites in the camera's lap while a zone streams in.

Near-fill trees need no law of their own: the swap never exceeds
`base * distanceScale`, which sits under the near-fill numeric cap at every
quality, so every near-fill instance hands off to its sprite before its
bucket cap can matter, and the sprite carries its density to the fog wall
(the old build-time vanish at `treeFillFar` was a visible density pop).

Rocks and bushes take the same treatment at their own swaps (`rockFar` and
`dressFar` times the budget scale, per instance now rather than per bucket).
Ferns and mushrooms are sub-pixel long before their cull and keep the plain
window. The lean arm (no `GFX.standardMaterials`, or `GFX.leanFoliage`)
ships NO impostors, exactly as before, and keeps the old fog-blend law
(`treeDetailDistance`), whose pins remain in `tests/foliage_lod.test.ts`.

## Cost model

A sprite is 2 triangles, and every category in a bucket is one draw call,
against the old per-species cone meshes (28 to 80 triangles per instance, up
to 8 draws per bucket, half of them registered on windows that could never
open). Above all, the budget no longer draws real geometry between the swap
and the fog wall. Measured at the fixed probe spots
(`docs/screenshots/far-foliage-impostors/`, high tier, offline seed):

- cliff vista: foliage draws 302 to 162; the old impostors cost 138 draws
  and 52k triangles, the sprites 56 draws and 7.9k;
- submitted foliage triangles fall 0.5M to 1.2M per scene (garden north:
  2.94M to 1.74M), with the vertex shader additionally collapsing every
  instance past its swap before raster;
- the atlas bakes once per world build (a few hundred cell renders during
  the loading screen) into one mip-mapped texture, 2048px on desktop tiers,
  halved cells under `GFX.constrainedMemory`.

## Known tradeoffs

- One sprite covers bark and canopy, so the whole picture takes the dominant
  tint family (`SpeciesSpec.spriteTint`: leaf, or trunk for the bare dead
  trees), the same rule the cones used.
- Rock sprites fold the placement tilt into the baked views; at the rock
  swap range a boulder is a handful of pixels and the approximation does not
  read.
- Sprites neither cast nor receive shadows; the shadow pass keeps its
  build-time radius, inside every sprite band.
