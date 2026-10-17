# src/render/ocean/: the FFT ocean every overworld water sheet draws

`water.ts` owns the water GEOMETRY (which sheets exist, the baked shore depth,
slope and displacement gate, culling, streaming, editor refits, draw order).
This directory owns what the surface IS: the simulation, the sky it reflects,
each realm's water character, and the surface shader. `index.ts` is the barrel;
import from it.

## Pieces
- `ocean_spectrum_core.ts` (pure, tested): the cascade plan per tier
  (`oceanPlanForTier`, also the screen-space reflection step count), the
  JONSWAP plus Donelan-Banner wind sea (with a broad short-crested share) and a
  narrow swell, the seeded initial amplitudes, the slope variance a pixel
  cannot resolve (`unresolvedSlopeVariance`, the shader's roughness), and the
  Stockham FFT index arithmetic the GPU mirrors (`stockhamStage`, held to a DFT
  in `tests/ocean_spectrum_core.test.ts`). World units are about 0.7 m, and
  gravity is scaled to match.
- `ocean_fft_glsl.ts` + `ocean_simulation.ts`: the GPU simulation. One evolve
  pass, 2 log2(N) Stockham passes over an atlas holding every cascade, and one
  assemble pass per cascade into mipmapped displacement and shading textures
  (the shading targets ping-pong so whitecap foam persists and fades). All
  programs link at construction against their own target kind, like
  `water_simulation.ts`. Without a renderer, or without float render targets,
  surfaces get `calmOceanUniforms`.
- `sky_probe.ts`: a 128 px cube capture of the LIVE dome (`sky.ts`
  `liveSkyDome`), one face per frame, mips on the sixth. It draws the dome's
  own material, so it links nothing new, and the reflection carries the
  biome blend, the day/night grade, the dusk glow and the horizon fog band.
- `water_character_core.ts` (pure, tested) + `water_character_field.ts`: each
  realm's water (colour, clarity per channel, chop, foam) baked into a small
  three-layer world-space field (the `biome_haze_field` idea), so a pixel
  reads the water of the place it lies in. The palette lab's water row
  overrides the colours (`OCEAN_PALETTE_OVERRIDE`, set by `setWaterPalette`).
- `ocean_foam_core.ts` (pure, tested): the tileable procedural foam texture.
- `ocean_surface_glsl.ts` + `ocean_material.ts`: the surface. FFT normals and
  displacement (gated by the baked `aSwellGate`, scaled by fetch so ponds only
  ripple), roughness from unresolved variance, Gaussian micro-facet sun
  glitter with Smith shadowing, fresnel reflection of the probe, the water
  body, crest subsurface glow, whitecaps, surf and contact foam.

## The two arms (read before touching the shader)
- **Captured** (high tier and up): `scene_sampling.ts` copies the opaque
  colour and depth before the first transparent draw while a water sheet is
  bound as a consumer. The surface then refracts the real seabed, absorbs it
  red first over the true path, lights it with caustics, draws contact foam
  where the scene meets the surface, traces screen-space reflections
  (`ssrSteps`), and composites itself at alpha 1.
- **Blended** (medium, the default preset): no capture. The surface blends
  over the seabed. A blend can only dim the background grey, so it keeps the
  least-absorbed channel's share and puts the stolen colour back against an
  estimated sandy bottom. Fragments that would show nothing are discarded,
  because the surface writes depth.
- Low keeps `water.ts`'s Phong plane; nothing here runs.

## Rules
- **The surface writes depth, and the zone sheets draw before the apron**
  (`water.ts` render orders), so the apron fails the depth test under a sheet
  and the expensive surface is shaded once per pixel.
- **Liveness gates every per-frame cost.** `water.ts` marks a frame when any
  water draws; the simulation steps, the probe face and the capture binding run
  only while water drew in the last `WATER_LIVE_HOLD_SECONDS`.
- **One clock.** Every wave runs whole cycles per `OCEAN_LOOP_SECONDS` and
  every texture scroll whole tiles, so the wrapped water clock is seamless.
- **Every pow and smoothstep is domain-safe** (`tests/shader_pow_domain.test.ts`,
  `tests/ocean_surface_glsl.test.ts`); a NaN here poisons bloom.
- **Sampler budget:** at most 16 per stage at the richest arm (pinned in
  `tests/ocean_surface_glsl.test.ts`). A new texture has to fit.
- `?oceandebug=1` (dev builds) compiles a term switch; write
  `OCEAN_DEBUG_TERM.value` (1 to 8: fresnel, reflection, under, body, sun,
  foam, subsurface, normal) to see one shading term alone.
- Dungeon and interior water stays bespoke on purpose: floods, tides, glowing
  pools and fight floors are gameplay reads with their own skies.
