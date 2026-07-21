<!-- src/render/ability_vfx/: the per-ability spell VFX subsystem. Root +
     src/render CLAUDE.md apply; this file is directory-local only. -->

# src/render/ability_vfx/: per-ability spell VFX

Gives every ability its authored visual identity (color, scale, archetype)
from the spec table, ported from the Ability VFX Gallery's primitives. Two
halves behind the `index.ts` barrel:

- `painter.ts` (`AbilityVfx`): the decision half. Resolves event ability ids
  against `../ability_vfx_specs.ts`, plans via the pure core
  `../ability_vfx_core.ts` (registered in `RENDER_PURE_CORES`; spam budget +
  quality/tier math lives THERE, never here), then drives the pooled `Vfx`
  particles and the primitive engine. `handleSpellfx` returning false means
  the renderer's generic school-colored arm runs unchanged.
- `fx.ts` (`AbilityVfxFx`): the Three-side engine composing the pooled
  primitive families, each with a hard cap and zero steady-state allocation:
  `ribbons.ts` (one dynamic mesh: jagged flicker bolts, comet trails, slash
  arcs), `rings.ts` (shockwave ring slots, ground + billboard), `decals.ts`
  (dissolve-fade ground marks: ember/rime/rune), `overlay_sprites.ts` (one
  point cloud for windup orbs + buff-orbit bands). `fx_textures.ts` builds
  the shared canvas textures once, deterministically (module-local rnd).

Renderer contract: construct `AbilityVfxFx` with (scene, camera, anchor,
groundY), hand it to `AbilityVfx` via deps, call `handleSpellfx`/`onDamage`
from `handleEvent`, `syncEntity(e)` per synced entity, and `update(dt)` once
per frame. Budget tiers degrade in order: tier 1 sheds lingers and impact
accents, tier 2 keeps color-only minimal particles (no engine work).

All materials are additive with depth-write off; slots clone materials at
construction only, never per spawn. No new post-processing: HDR-multiplied
colors ride the existing composer bloom exactly like `../vfx.ts`.
