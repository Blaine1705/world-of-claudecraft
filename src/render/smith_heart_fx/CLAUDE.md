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
| `index.ts` | Public surface: `HammerFx`, `BreathFx`, `QuenchFx`, `HeatFx`, `FinalFx`, `CouncilFx`, `CouncilBodies`, `SealShake`. |
| `council_fx_core.ts` | PURE (`RENDER_PURE_CORES`): the Hammer Council's look (design doc 5.18): a pillar's integrity on the model (`pillarLook`: seams, lean, heat, grit; `pillarPips`), its rise and fall timelines, the marks' footprints read off the sim's tuning (`COUNCIL_MARK_SPECS`, `RISE_SPOT_SPEC`) and their threat colours, the rock's fall, Resonance's ring, the heroic pulse's reach, the inheritance's arc, the energy's look, the cues it claims (`councilClaims`). |
| `council_pillars_fx.ts` | `CouncilPillarsFx`, a part of `CouncilFx` (on its host: the root, the particles, the debris, the floor telegraph): the pillars (the Hammer kit's column, the rock kit's needle for a risen one) with their crack shells (the piece's own stone pushed out along its normals, a seam net that opens and burns per integrity), lean and pips, the rise, a lost piece, the fall into rubble (a danger footprint) and the sinking. |
| `council_soul_fx.ts` | `CouncilSoulFx`, a part of `CouncilFx` (mythic, Soul in the Stone): what each soul does: the Echo of Wrath's lethal ring and the shelter wedges behind every other pillar (`echoShelter`, never wider than the sim's cover), its blast; the Walking Slab's crush and grind footprints riding with it, a crush's impact; the Endless Song's floor ring growing with its pulses, its clock ring and the sound rings over the Quarry. The soul pillar's own look (lit cracks in the soul's colour, the sheath, the soul pips, the slab followed every frame) is `council_pillars_fx.ts`; the plan (`SOUL_COLORS`, `soulPillarLook`, `songLook`, `slabReach`) is `council_fx_core.ts`. |
| `council_fx.ts` | `CouncilFx`: the host of the pillars' part, and the Wake and soak footprints round their players (the ghost pillar, the boulder dropping), the heir's locked rise spots, Resonance's ring, shimmer and thread to the pillar it cracks, Hammer's Weight's slam and mark, the Seam Bolt's shard, the inheritance's river of beads, the energy's gauge and glow, the heroic pulse. Every footprint, ring, gauge, pip, crack and lean on every tier; claims the council's own cues. |
| `council_bodies_core.ts` | PURE (`RENDER_PURE_CORES`): the council's two provisional bodies (the Slabwright broad and blocky with slab shoulders, the Seam Singer tall and slender with amber seam crystals): joints, reach, pieces (kit node, joint, fitted box, light), the cast-to-motion mapping, the poses, the glow and the fall. Joints apart from pieces, so the final models replace the pieces only. |
| `council_bodies.ts` | `CouncilBodies`: the Slabwright's and the Seam Singer's bodies over their bodyless targets: Hammer kit stone and Heart kit rock and crystal stitched by ochre threads, breath, swings, cast poses and the fall into rubble. |
| `final_fx_core.ts` | PURE (`RENDER_PURE_CORES`, phase 2J): the Masterless Strength's numbers read off its sim template (Forge Fist's arc and reach, Forge Wrath's radius and bar, Forge Pour's cone), its body's joints (`COLOSSUS_SLOTS`, the two-bone reach `colossusArmIk`, the pieces' rest spots on the walk and in the chasm), the arrival's timeline (`ARRIVAL`: the heart rising, each piece tearing, flying and locking, the shockwave, `ARRIVAL_END`), the poses of its swing, Forge Fist, Forge Wrath and Forge Pour, the fall (`colossusFallPlan`, `heartDeathLevel`), the pools. |
| `final_fx.ts` | `FinalFx` (phase 2J): the body (the Heart kit's rock pieces round the crystal heart, threads of the veins' light, the heart's own shader) following the bodyless boss; the arrival scene from the seal memory's `awakeSince` (whole for a late arrival, run on to its end by a pull); Forge Pour's cone through the shared floor telegraph on every tier and its fire on the floor, Forge Wrath's gather and wall of light, Forge Fist's strike; the fall and the room going dark (`../smith_heart/heart_final_core.ts`). |
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
- The Masterless Strength's Forge Pour cone is actionable and drawn by `FinalFx` through the
  shared floor telegraph on EVERY tier (threat colour `danger`); Forge Wrath's sight field is
  the trash engine's. The body, the arrival and the fall are presentation only (no sim state
  but the seal markers' arrival bit); the dust, sparks and trails thin on the low tier, the
  shakes go under reduced motion. The body's joints and timeline are kept apart from the
  kit's pieces so the final model replaces the pieces only.
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
- The Hammer Council's pillars, marks and footprints are actionable and drawn by `CouncilFx`
  on EVERY tier (the threat colours: `control` for Wake the Stone's throw, `danger` for the
  rubble, the heir's rising stone and the heroic pulse, `lethal` for Hammer's Weight, the
  soak's gold to gather in, the vein's ochre on the accents only); dust, grit and debris
  thin on the low tier. Mountain's Wrath stays `HammerFx`'s for whichever member holds it.
- Mythic's soul pillars are told apart on EVERY tier (the soul's colour in the cracks, the
  sheath, the three soul pips), and the Echo's ring and shelter wedges, the slab's
  footprints and the song's rings are actionable (every tier); motes, embers and dust thin.
- A new raid guardian's effects join here as their own module behind `index.ts`, never
  as a branch in `hammer_fx.ts`.

Tests: `tests/smith_heart_council_fx.test.ts`, `tests/smith_heart_council_soul_fx.test.ts`, `tests/smith_heart_council_bodies.test.ts`,
`tests/smith_heart_hammer_fx.test.ts`, `tests/smith_heart_breath_fx.test.ts` and
`tests/smith_heart_quench_fx.test.ts`, `tests/smith_heart_heat_fx.test.ts` and
`tests/smith_heart_final_fx.test.ts` (each core and a smoke run over a fake world).
