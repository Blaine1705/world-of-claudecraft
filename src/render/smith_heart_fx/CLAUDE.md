<!-- src/render/smith_heart_fx/: the Smith's Heart raid's encounter effects.
     Presentation only; parent dirs cover the IWorld seam, determinism and the
     GPU scheduler contract. Don't repeat root / src / render CLAUDE.md. -->

# src/render/smith_heart_fx: the Smith's Heart's encounter effects

The encounter half of the raid's look (`docs/design/raid/smith_heart.md`, sections 5.9
and 7.1), hosted by `../rift_death_zone.ts` beside the dungeons' own fx. Everything is
read from IWorld (a guardian's cast bar, its events, the mirrored gate memory), so
offline and online look the same. The interior's static dressing and air are
`../smith_heart/`.

| Module | Role |
|---|---|
| `index.ts` | Public surface: `HammerFx`. |
| `hammer_fx_core.ts` | PURE (`RENDER_PURE_CORES`): the Hammer guardian's numbers read off its sim template (never tuned here), the crack lines, Mountain's Wrath's charge and blast timelines (the dust wall rides the trash engine's `novaWave` front on the same clock), Hammerfall's heat, the Slab's break timeline and the once-per-change rule (`slabBreakDue`), the pool sizes. |
| `hammer_fx.ts` | `HammerFx`: Mountain's Wrath (molten cracks racing out over its bar, loose stones lifting, dust drawn in; on landing the dust wall, rubble, rings, flash, grit off the terraces, a shake), Hammerfall (a fan of cracks in its arc, rubble, dust), the Slab breaking (the split flaring, the burst both ways, dust, rings, grit off the lintel while the halves part) and the Pit Mouth slamming shut (a dust skirt). |

Rules:
- The readable telegraph of Mountain's Wrath is the trash engine's sight field
  (`../trash_engine_fx/engine_nova.ts`), drawn on every tier. Nothing here is
  actionable: the low tier and reduced motion thin the particles, the rubble and the
  shake. `handleEvent` never claims an event (the renderer's own draws still play).
- Every geometry and material is built in the constructor under one root attached
  through `attachSceneGroupGated` (the compile gate links it before the first cast);
  fixed pools, no per-frame allocation, no light.
- The cracks are floor marks on the floor ladder's encounter band, over the sight
  field's fill and under its wave.
- A new raid guardian's effects join here as their own module behind `index.ts`, never
  as a branch in `hammer_fx.ts`.

Tests: `tests/smith_heart_hammer_fx.test.ts` (the core and a smoke run over a fake world).
