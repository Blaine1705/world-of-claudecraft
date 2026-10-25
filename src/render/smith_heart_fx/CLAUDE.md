<!-- src/render/smith_heart_fx/: the Smith's Heart raid's encounter effects.
     Presentation only; parent dirs cover the IWorld seam, determinism and the
     GPU scheduler contract. Don't repeat root / src / render CLAUDE.md. -->

# src/render/smith_heart_fx: the Smith's Heart's encounter effects

The encounter half of the raid's look (`docs/design/raid/smith_heart.md`, sections 5.9,
5.14, 7.1 and 7.2), hosted by `../rift_death_zone.ts` beside the dungeons' own fx. Everything is
read from IWorld (a guardian's cast bar, its events, the mirrored gate memory), so
offline and online look the same. The interior's static dressing and air are
`../smith_heart/`.

| Module | Role |
|---|---|
| `index.ts` | Public surface: `HammerFx`, `BreathFx`, `QuenchFx`, `HeatFx`, `SealShake`. |
| `hammer_fx_core.ts` | PURE (`RENDER_PURE_CORES`): the Hammer guardian's numbers read off its sim template (never tuned here), the crack lines, Mountain's Wrath's charge and blast timelines (the dust wall rides the trash engine's `novaWave` front on the same clock), Hammerfall's heat, the Slab's break timeline and the once-per-change rule (`slabBreakDue`), the pool sizes. |
| `seal_shake.ts` | `SealShake` (phase 2F): the seal's moments felt in the camera (the arrival's thud, the opening's tremor, jolt and aftershock), read from the slot's seal memory, scaled by distance, through the shake sink (reduced motion honoured). |
| `breath_fx_core.ts` | PURE (`RENDER_PURE_CORES`, phase 2G): the Breath guardian's numbers read off its sim template (the gust's radius and shove, the lance's length and width, both bars), the gust's charge and wall timelines, the lance's bolt, scorch and charge looks, the bolt's path (always inside the lane's half width), the pool sizes. |
| `breath_fx.ts` | `BreathFx` (phase 2G): Bellows Gust's and Storm Lance's footprints through the shared floor telegraph (`../floor_telegraph`, every tier: the ring at the gust's exact radius, the lane at the lance's exact length and width, filling with the bar), the gust's breath drawn in, its whirl of stones and funnel, its wall of wind riding out to the shove's end with grit and rings; the lance's crackle and sparks, its bolt from the cloud onto the guardian and down the lane, the scorch smouldering. |
| `quench_fx_core.ts` | PURE (`RENDER_PURE_CORES`, phase 2H): the Quench guardian's numbers read off its sim template (Tempering Strike's arc and reach, Quenching Breath's cone, range and bar), the breath's charge, sweep and frost timelines, the strike's rise, hold and shatter, the strike's spikes (always inside its arc and reach), the pool sizes. |
| `quench_fx.ts` | `QuenchFx` (phase 2H): Quenching Breath's cone through the shared floor telegraph (every tier, the exact angle and range, filling with the bar), the cold drawn in and the frost creeping under it; when it lands the freezing gust, the ice ripping up behind its front and shattering, the floor frosted; Tempering Strike's spikes of ice in its arc (from the swing's windup event, no bar). |
| `heat_fx_core.ts` | PURE (`RENDER_PURE_CORES`, phase 2I): the Heat guardian's numbers read off its sim template (Molten Pour's lane, length, width and bar; Searing Knell's radius and bar, its id still `heart_anvil_clang`), the pour's gather, seams and flow timelines, the knell's gather, cracks and wave, the seam and crack paths (always inside the lane and the radius), the pool sizes. |
| `heat_fx.ts` | `HeatFx` (phase 2I): Molten Pour's lane and Searing Knell's ring through the shared floor telegraph (every tier, filling with the bar); the pour's gathering fire and its seams lighting down the lane, then the white-gold fire pouring down it behind a wave of flame, molten, crusting, smoking; the knell's sphere of fire and its cracks, then its wall of fire ringing out to the stun's edge, the rings of the toll, the sparks and ash. |
| `hammer_fx.ts` | `HammerFx`: Mountain's Wrath (molten cracks racing out over its bar, loose stones lifting, dust drawn in; on landing the dust wall, rubble, rings, flash, grit off the terraces, a shake), Hammerfall (a fan of cracks in its arc, rubble, dust), the Slab breaking (the split flaring, the burst both ways, dust, rings, grit off the lintel while the halves part) and the Pit Mouth slamming shut (a dust skirt). |

Rules:
- The Heat guardian's lane and ring are actionable and drawn by `HeatFx` through the shared
  floor telegraph on EVERY tier (threat colour `danger`, the vein's white-gold as the
  accent); its fire, sparks and smoke are cosmetic and thin. The Heat is the Hearth: its
  fire is white-gold, never volcanic red.
- The Quench guardian's cone is actionable and drawn by `QuenchFx` through the shared floor
  telegraph on EVERY tier (threat colour `danger`, the vein's pale ice as the accent); its
  frost, mist and ice are cosmetic and thin.
- The Breath guardian's footprints are actionable and drawn by `BreathFx` itself through
  the shared floor telegraph on EVERY tier (threat colour `danger`, the vein's teal as
  the accent); the wind, the lightning and the debris over them are cosmetic and thin.
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

Tests: `tests/smith_heart_hammer_fx.test.ts`, `tests/smith_heart_breath_fx.test.ts` and
`tests/smith_heart_quench_fx.test.ts` and `tests/smith_heart_heat_fx.test.ts` (each
core and a smoke run over a fake world).
