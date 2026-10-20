# The Smith's Heart: raid design

Status: phase 1 (playable blockout) implemented on `feature/smith-heart-raid`, dev
builds only. Phase 2 (art, real kits, set pieces, quest, loot) is specified here and
not built. The name is provisional and has not been IP-checked yet.

At a glance: a ten-player level 20 raid (2 tanks, 2 healers, 6 damage), one
instanced open-air map inside Stormcrag. Five bosses: the Hammer guardian always
first, then the Breath, Quench and Heat guardians in any order, then the final boss
in the Heart. Twenty mandatory trash packs. Target clear: 90 to 120 minutes on
normal.

Sources of truth, in order:

1. The owner-approved design pages (Spanish, outside the repo): the map design
   ("El Corazon del Herrero") and the lore and final-boss page ("Tres raids
   elementales", option A "La Confluencia" chosen), plus the phase 1 brief.
2. The phase 1 code, which this doc MATCHES. Where the code deviates from the pages,
   section 3.6 says so and why.

| Piece | Where |
|---|---|
| Field: coordinates, heights, surfaces, props, anchors, light rivers, vein colours | `src/sim/content/smith_heart_layout.ts` (`SMITH_HEART_FIELD`, `SMITH_HEART_HEIGHTS`, `SMITH_HEART_ANCHORS`, `LIGHT_RIVERS`, `SMITH_HEART_VEIN_COLORS`) |
| Mobs (sketch kits), spawns, packs, gates, seal markers, `DungeonDef`, door | `src/sim/content/smith_heart.ts` (`SMITH_HEART_MOBS`, `SMITH_HEART_SPAWNS`, `SMITH_HEART_PACKS`, `SMITH_HEART_GATES`, `SMITH_HEART_SEAL_MARKERS`, `SMITH_HEART_DUNGEON_DEFS`, `SMITH_HEART_DOOR_POS`) |
| Gating readout and the heart seal | `src/sim/encounters/smith_heart/seal.ts` (`smithHeartProgress`, `tickSmithHeart`) |
| Dev-only entry | `src/sim/encounters/smith_heart/entry.ts` (`SMITH_HEART_PLAYABLE`, `smithHeartEntryOpen`) |
| Gate collision and state engine (shared) | `src/sim/instances/dungeon_gates.ts` |
| Authored open-air field engine (shared) | `src/sim/instances/authored_field/` (see its `CLAUDE.md`) |
| Placeholder looks (the one list phase 2 replaces) | `src/render/characters/smith_heart_placeholder_looks.ts` |
| Dev commands | `src/sim/dev/smith_heart_dev.ts` (`/dev heart`) |

## 1. Summary and lore

Built on what the world already says (`docs/design/world-lore.md`, "Thornpeak
Heights: the Jailer's Body"): the Smith bound his eldest dragon Korzul beneath a
range raised for the purpose, then lay down and became Thornpeak. The storms and
elementals of Stormcrag are his unquiet strength; Thunzharr is his splintered wrath.

The new piece: before he lay down, the Smith split his strength in four so the
seal would hold for centuries. They are the four acts of his craft, the same four
as the Sanctum's rune creed:

| Strength | Element | Vein | Colour (`SMITH_HEART_VEIN_COLORS`) |
|---|---|---|---|
| The Heat of the forge | fire (smith fire: white-gold, never volcanic) | west, the Smith's forge, level | `0xffe6a0` white-gold |
| The Breath of the bellows | storm | north, climbs to a cornice | `0x5ab8e8` storm blue |
| The Hammer that shapes stone | earth | south, the entrance, descends | `0xc8903c` ochre |
| The Quench of the cold water | frost | east, descends to a frozen lake | `0x9ad8ff` ice pale |

Each strength sleeps in a vein of the mountain that runs down to its heart, and
each vein has a guardian. Players have just fought Korzul in the Gravewyrm
Sanctum; the mountain stirred and the four strengths woke. Without their master,
each guardian carries out its last order with blind force: seal, crush, freeze,
burn whatever enters. In the Heart the pieces are gathering into a mindless forge
body, the strength without its master, which wants to finish the Smith's last job:
seal the mountain forever, with everything that breathes inside.

The four altars in the Heart are the mouths of the four veins: drag the final boss
onto one and it drinks that strength. That is why the final boss works.

Quest giver: the Vigil of Highwatch. Captain Thessaly's order has watched a wall
for forty generations without knowing why; here she learns her order was posted to
watch the mountain, not what comes from outside.

Duskwick, the dusk flame, is the Smith's last ember, the one he left burning when he
lay down, like a candle left lit on going to sleep. The final boss drops it, so the
staff needs no dusk altar of its own.

Fire is one strength of four and never the lead: Ignivar is already the fire raid.
The Heat vein is a smithy (crucibles, chains, coal, white-gold fire), not lava.

## 2. Instance facts

| Fact | Value | Source |
|---|---|---|
| Dungeon id | `smith_heart` | `SMITH_HEART_DUNGEON` |
| Instance band | overflow `index` 15; the field stays inside one slot (abs x under 300, abs z under 250) | `SMITH_HEART_DUNGEON_DEFS` |
| Field bounds | x -232 to 230, z -246 to 240 (about 460 by 490 yd) | `SMITH_HEART_FIELD.bounds` |
| Void | height -70, map void `mist`, `cliffStep` 1.1 | `SMITH_HEART_VOID_HEIGHT` |
| Group | `suggestedPlayers` 10; raid-only claim | `RAID_ALLOWED_DUNGEON_IDS` (`src/sim/instances/dungeons.ts`), `RAID_REQUIRED_DUNGEON_IDS` (`src/sim/instances/reset_cooldown_policy.ts`) |
| Interior key | `smith_heart` (authored field) | `src/sim/instances/authored_field/registry.ts` |
| Flags | `bossChainPull`, `areaCastsPlant` on; `guideVisible` false | `SMITH_HEART_DUNGEON_DEFS` |
| Entry, exit | entry (-100, -224) on the Cleft; exit offset (-104, -232) | `SMITH_HEART_ANCHORS` |
| Boss exit portal | (-20, -24) on the Heart's rim, opens when the final boss dies | `bossExitPortal` |
| Entry gate | dev builds only while `SMITH_HEART_PLAYABLE` is false | `entry.ts` |

Axes: instance-local yards, north +z, east +x, heights in yards with the Ring at 0.
Compass angles are degrees clockwise from north (`ringPoint`).

## 3. Layout

Open air throughout: every vein is a fissure open to the storm sky, never a roofed
tunnel, so the camera never meets a vault (the reworked dungeons' authored-field
precedent: Hollow Crypt, Wildheart Basin). Floors end in cliffs that drop into the
misted void; cliffs are walls, nobody falls.

```
                         CORNICE (+60)  Breath guardian
                              |  cornice_mouth
                   b3 (+40) - WIND BRIDGE - b2 (+16)
                              |
                           b1 (0)
                              |
 ANVIL (0) - CASTING FLOOR - FORGE HALL -( RING 0 )- q1 (-8) - q2 (-16)
 Heat        (pour channel)   f1        |  HEART |          SINGING ICE (-24)
 guardian    f2 f3        anvil_mouth   |  (-8)  |          q3
                                        |  seal  |       lake_mouth
                           causeways N, E, W     FROZEN LAKE (-30)
                                                 Quench guardian
                           BALCONY (+20) + two curved stairs (south arc)
                              |  the_slab
                           HAMMER PIT (+14)  Hammer guardian (always first)
                              |  hammer_pit_mouth
 CLEFT (+40) - h1 (+36) - h2 (+31) - h3 (+26)   the Hammer Gallery
 world entrance
```

### 3.1 Sections and coordinates

| Section | Centre | Radius or extents | Floor | Constant |
|---|---|---|---|---|
| The Cleft (entrance landing) | (-100, -226) | r 12 | +40 | `CLEFT` |
| Gallery landing h1 | (-50, -232) | r 12 | +36 | `GALLERY_LANDINGS.h1` |
| Gallery landing h2 | (10, -234) | r 12 | +31 | `GALLERY_LANDINGS.h2` |
| Gallery landing h3 | (62, -200) | r 12 | +26 | `GALLERY_LANDINGS.h3` |
| The Hammer Pit | (0, -150) | r 30 (60 yd across) | +14 | `HAMMER_PIT` |
| The Slab (gate) | (0, -121) | gate across the Slab Stair | +14 to +20 | `SLAB` |
| The Balcony | x -12 to 12, z -114 to -58 | 24 by 56 yd | +20 | `BALCONY` |
| Balcony Stairs (east, west) | on the Ring circle, R 70 | east 172 to 142 deg, west 188 to 218 deg, 14 yd wide | +20 to 0 | `balconyStair` |
| The Ring | (0, 0) | inner r 62, outer r 78 (16 yd wide), arc 222 to 498 deg through north | 0 | `RING`, `RING_ARC` |
| Void annulus | (0, 0) | r 38 to 62, open air | void | (gap between `HEART` and `RING`) |
| The Heart | (0, 0) | r 38 (76 yd across) | -8 | `HEART` |
| Heart seal | (0, 0) | r 9 | -8 | `HEART_SEAL` |
| Causeways N, E, W | 0, 90, 270 deg | r 66 to 34, 14 yd wide | 0 to -8 | `causeway` |
| Altars | r 31 at 0 (Breath), 90 (Quench), 180 (Hammer), 270 (Heat) deg | prop r 1.8 | -8 | `HEART_ALTARS` |
| Breath b1 | (0, 104) | r 13 | 0 | `BREATH.b1` |
| Breath b2 | (44, 134) | r 11 | +16 | `BREATH.b2` |
| Wind Bridge | (16, 150) to (-20, 158) | 13 yd wide | +24 to +36 | `WIND_BRIDGE` |
| Breath b3 | (-44, 160) | r 11 | +40 | `BREATH.b3` |
| The Cornice | (0, 206) | r 30 (60 yd) | +60 | `BREATH.cornice` |
| Quench q1 | (110, 0) | r 12 | -8 | `QUENCH.q1` |
| Quench q2 | (130, -40) | r 12 | -16 | `QUENCH.q2` |
| Singing Ice | x 150 to 182, z -62 to -36 | 32 by 26 yd | -24 | `QUENCH.ice` |
| Lake shelf / Frozen Lake | (186, 10) | shelf r 40, ice r 32 (64 yd) | -30 | `QUENCH.shelf`, `QUENCH.lake` |
| Forge hall | x -122 to -74, z -14 to 14 | 48 by 28 yd | 0 | `HEAT.hall` |
| Casting floor | x -160 to -120, z -34 to 34 | 40 by 68 yd | 0 | `HEAT.floor` |
| Pour Channel | x -132, z -34 to 34 | 5 yd wide strip | 0 | `POUR_CHANNEL` |
| The Anvil | x -172 to -228, z -22 to 22, horn west | about 56 by 44 yd | 0 | `ANVIL_POINTS`, `HEAT.anvil` |

Boss spots (`SMITH_HEART_BOSS_SPOTS`): Hammer (0, -150), Breath (0, 210), Quench
(186, 10), Heat (-196, 0), final (0, 0).

### 3.2 The route, in order

1. **The Cleft** (+40): a crack in the Stormcrag cliffs; spawn landing.
2. **The Hammer Gallery**, descending east along the south edge: `gallery_upper`,
   `gallery_middle`, `gallery_lower` paths join landings h1, h2, h3 (one pack each).
3. **Pit Mouth** gate, then `pit_descent` stairs down into **the Hammer Pit** (+14):
   the Hammer guardian, always first. Five columns on a 22 yd circle (`PIT_COLUMNS`).
4. **The Slab** (gate `the_slab`) breaks when the Hammer guardian dies; the
   `slab_stair` climbs north to **the Balcony** (+20), the first view.
5. **The two Balcony Stairs** curve down along the Ring's own circle, east and west,
   to **the Ring** (0): eight packs, two between each pair of vein mouths.
6. In ANY order:
   - **north, the Breath**: `breath_mouth`, b1 (0), `breath_chimney` stairs, b2
     (+16), the **Wind Bridge**, b3 (+40), `cornice_climb` stairs, Cornice Mouth,
     **the Cornice** (+60), the Breath guardian;
   - **east, the Quench**: `quench_mouth` stairs, q1 (-8), `quench_stair`, q2 (-16),
     `quench_shelf_stair`, the **Singing Ice** (-24, pack q3), `lake_descent`, Lake
     Mouth, **the Frozen Lake** (-30), the Quench guardian;
   - **west, the Heat**: the forge hall (pack f1), the casting floor across the
     **Pour Channel** (packs f2, f3), `anvil_bridge`, Anvil Mouth, **the Anvil**
     (0), the Heat guardian.
7. Each guardian's death lights its vein on the heart seal. With all four lit and
   the Ring clear, the three **causeways** open and the raid crosses the void into
   **the Heart** (-8): the four altars and the final boss.

Each vein follows its **light river** (`LIGHT_RIVERS`): a floor polyline from the
guardian's arena down the vein's walking line to the seal. Following the light
always leads to the guardian; a river lights when its guardian dies.

### 3.3 Heights profile

| Vein | Profile (yards) | Feel |
|---|---|---|
| Hammer | Cleft 40, h1 36, h2 31, h3 26, Pit 14, Balcony 20, Ring 0 | the descent from the entrance |
| Breath | Ring 0, b1 0, b2 16, bridge 24 to 36, b3 40, Cornice 60 | climbs into the wind |
| Quench | Ring 0, q1 -8, q2 -16, ice -24, lake -30 | sinks into the cold |
| Heat | 0 throughout | stays at the forge's level |
| Heart | -8 | below the Ring, so it is seen from everywhere |

The player knows where they are by their body alone: down for the Hammer, up for
the Breath, deeper for the Quench, level for the Heat. Every path's slope stays
under the authored field's limit (about 0.75 yd of rise per yard,
`src/sim/instances/authored_field/CLAUDE.md`); `tests/smith_heart_route.test.ts`
proves no walked step exceeds `MAX_STEP_HEIGHT` or `cliffStep`.

### 3.4 Sightlines and the balcony reveal

- **The reveal.** The Slab splits and opens onto the Balcony, jutting out over the
  void with its tip at z -58 (58 yd from the seal, 28 yd above the Heart floor).
  From it the raid sees the whole heart: the caldera open to the storm sky, the
  full Ring, the three vein mouths (north, east, west), the three causeways and the
  seal. The ochre Hammer river is already lit (the guardian just died). This is
  the raid's key shot and the trailer frame.
- **The seal from the Ring.** The Heart sits 8 yd below the Ring across an open
  void annulus (r 38 to 62), so nothing stands between any Ring point and the seal.
  Ring pillars (`sh_ring_pillar`) stand only on the outer rim; altars are 3 yd
  props. Rule: nothing taller than an altar may ever be placed inside r 62.
- **Lighting.** One light zone per section (`SMITH_HEART_FIELD.lightZones`); each
  vein zone's accent is its vein colour, so a player reads the vein from its light.

### 3.5 World entrance

`SMITH_HEART_DOOR_POS` (138, 756) in Thornpeak Heights (`src/sim/content/zone3.ts`), at
the foot of the Stormcrag cliffs past the end of the Stormcrag road, north-east of
Highwatch (0, 660); leaving sets the raid down to the west, away from the rock face.
The world door is a crack in the cliffs from which four threads of coloured light
escape (phase 2 art). While `SMITH_HEART_PLAYABLE` (`src/sim/content/smith_heart.ts`)
is false the door is NOT built (`overworldDoor` follows the flag: no door entity,
jambs, terrain pad or cleared ring, so the shipped world and its parity traces are
untouched), the raid is entered only through `/dev heart`, and any other entry is
refused with `SMITH_HEART_CLOSED_TEXT`.

### 3.6 Deviations from the approved pages

| Pages | Code | Why |
|---|---|---|
| Balcony +25, Pit +20 | Balcony +20, Pit +14 | The curved Balcony Stairs drop to the Ring over about 32 yd of arc; from +25 they exceed the authored field's slope limit. The Pit drops with it so the Slab Stair still climbs from Pit to Balcony. |
| One wide stair from the balcony to the Ring | Two curved stairs, east and west, along the Ring's circle | The engine allows ONE floor height per point, so the Ring cannot pass under the Balcony. The Balcony replaces the Ring's south arc and the stairs close the loop. |
| Ring 14 yd wide | 16 yd (r 62 to 78) | Room for packs of three plus a raid of ten passing; see open questions. |
| The Ring ramps down into the final room | Three causeways (north, east, west) across an open void annulus | Keeps the seal visible from all of the Ring and lets the raid enter from whichever vein it finished last. |
| One altar before each vein mouth | The south (Hammer) altar sits under the Balcony's sightline with no causeway behind it | The south is the Balcony; see open questions. |
| Heart 70 yd across | 76 yd (r 38) | Altars at r 31 leave a walkable band behind them for drags and add spawns. |
| Lake 70 yd, Anvil 55 yd | Lake ice 64 yd on an 80 yd shelf; Anvil about 56 by 44 yd | Shelf carries the braziers outside the ice; the Anvil is shaped, not round. |
| Map about 420 by 420 yd | about 460 by 490 yd | The three veins at 150 yd each plus the Hammer Gallery; still one instance slot. |
| About 22 packs | 20 (3 + 8 + 3 x 3) | The pages' figure was an estimate. |

## 4. Packs

Every pack is three elites held in formation until pulled (`idleStationary`), level
20, sketch numbers. Trash composition per vein: Hammer and Ring are three warders;
the other veins are warder, caller, warder.

| Pack | Location | Floor | Composition | Gate that waits on it |
|---|---|---|---|---|
| h1 | Gallery landing (-50, -232) | +36 | 3 Hammer Vein Warder | `hammer_pit_mouth` |
| h2 | Gallery landing (10, -234) | +31 | 3 Hammer Vein Warder | `hammer_pit_mouth` |
| h3 | Gallery landing (62, -200) | +26 | 3 Hammer Vein Warder | `hammer_pit_mouth` |
| r1 to r8 | Ring at 30, 60, 105, 125, 235, 255, 300, 330 deg (`RING_PACK_DEGREES`) | 0 | 3 Ring Forge Warder | all three causeways |
| b1 | Breath b1 (0, 104) | 0 | 2 Breath Vein Warder, 1 Breath Vein Caller | `cornice_mouth` |
| b2 | Breath b2 (44, 134) | +16 | same | `cornice_mouth` |
| b3 | Breath b3 (-44, 160) | +40 | same | `cornice_mouth` |
| q1 | Quench q1 (110, 0) | -8 | 2 Quench Vein Warder, 1 Quench Vein Caller | `lake_mouth` |
| q2 | Quench q2 (130, -40) | -16 | same | `lake_mouth` |
| q3 | Singing Ice (172, -49) | -24 | same | `lake_mouth` |
| f1 | Forge hall (-110, 0) | 0 | 2 Heat Vein Warder, 1 Heat Vein Caller | `anvil_mouth` |
| f2 | Casting floor (-142, 20) | 0 | same | `anvil_mouth` |
| f3 | Casting floor (-142, -20) | 0 | same | `anvil_mouth` |

Trash sketch kits: warders swing a frontal arc cleave every third swing (Stone,
Forge, Gale, Rime, Ember Sweep); callers cast a two-second school bolt (Gale Bolt
nature, Rime Bolt frost, Ember Bolt fire). Phase 2 rule (dungeon rework README,
"Binding principles"): trash TEACHES its vein's guardian in a friendlier form.

## 5. Gating

### 5.1 Gate states

Every gate is a `DungeonGateDef` driven by the shared engine
(`src/sim/instances/dungeon_gates.ts`): closed until every listed pack and boss is
dead; sealed once the listed boss has fought for `BOSS_ROOM_SEAL_DELAY_SECONDS`
and while it stays engaged; open otherwise. Every gate is at least 12 yd wide.

| Gate id | Kind | Where | Waits on | Seals for |
|---|---|---|---|---|
| `hammer_pit_mouth` | `stone_slab` | top of the Pit descent (30.5, -175.25) | packs h1, h2, h3 | Hammer guardian |
| `the_slab` | `stone_slab` | Slab Stair (0, -121) | boss: Hammer guardian | nothing |
| `cornice_mouth` | `forge_seal` | top of the Cornice climb (-26, 191.2) | packs b1, b2, b3 | Breath guardian |
| `lake_mouth` | `forge_seal` | foot of the Lake descent (180.5, -31) | packs q1, q2, q3 | Quench guardian |
| `anvil_mouth` | `forge_seal` | Anvil bridge (-165, 0) | packs f1, f2, f3 | Heat guardian |
| `causeway_north` | `forge_seal` | (0, 60) | packs r1 to r8; bosses: all four guardians | final boss |
| `causeway_east` | `forge_seal` | (60, 0) | same | final boss |
| `causeway_west` | `forge_seal` | (-60, 0) | same | final boss |

`the_slab` and `causeway_north` carry the `openText` lines the raid reads when they
open. Gate entities are spawned by `SMITH_HEART_GATE_OBJECTS`.

### 5.2 The heart seal

The seal is a lit-vein mask, one bit per dead guardian
(`SMITH_HEART_VEIN_BITS`): Hammer 1, Breath 2, Quench 4, Heat 8;
`SMITH_HEART_SEAL_FULL` is 15. It is derived every tick from the claim's roster
(`smithHeartEarnedMask`), never a timer and never stored. `tickSmithHeartSeal`
writes the mask into the template id of every seal marker
(`smithHeartSealTemplate`, prefix `smith_heart_seal_`), so every client mirrors the
seal with no wire change; the renderer reads it back with `smithHeartSealMaskOf`.
The markers (`SMITH_HEART_SEAL_MARKERS`) are spread so every walkable point stands
within the client's interest radius of at least one. Each newly lit vein sends its
line from `SMITH_HEART_VEIN_LIT_LOG` to the raid (re-localized by
`src/ui/sim_i18n.ts`).

### 5.3 The derived readout

`smithHeartProgress(ctx, inst)` returns `SmithHeartProgress`:

| Field | Meaning |
|---|---|
| `mask` | lit-vein mask |
| `slabOpen` | Hammer bit lit: the Slab is split, the Ring and the three veins are open |
| `sealLit` | mask is full: all four colours burn |
| `ringClear` | packs r1 to r8 are dead |
| `heartOpen` | `sealLit` and `ringClear`: the causeways are open |

Used by the dev tools and tests; it mirrors the gate engine, it never drives it.

### 5.4 Free order, proved

- Only `the_slab` and the three causeways list a guardian. The Slab lists only the
  Hammer; the causeways list all four. No gate lists the Breath, Quench or Heat
  guardian before another vein's arena.
- Each arena mouth waits only on its own vein's three packs, and those packs stand
  on floor reachable from the Ring once the Slab is open.
- Pinned by `tests/smith_heart_route.test.ts`, "the Slab open: the Ring and all
  three veins in any order, never the Heart": with only `hammer_pit_mouth` and
  `the_slab` open the flood reaches the Ring and every vein up to its mouth, and
  opening any ONE arena mouth reaches that arena but neither of the others nor the
  Heart.

### 5.5 Reset

Dead instance mobs stay dead for the claim's life, so a lit vein stays lit and an
opened gate stays open (a corpse run always has a path). A fresh claim respawns
everything: every gate closes and the markers start at `smith_heart_seal_0`. The
dungeon is in `RAID_REQUIRED_DUNGEON_IDS`, so a replacement claim skips the
five-minute reset cooldown; the raid lockout is the rate limit (wired in phase 2,
see the Shipping checklist).

## 6. Set pieces (phase 2 specs)

None of these is built in phase 1; their floors, props and anchors are. Every
hazard telegraphs through the shared ground-cue vocabulary (warning phase, then
hazard phase) and is deterministic (`Rng` only).

**Readability at every tier (binding).** The hazard decal, its warning phase and
any cast bar render identically at every graphics preset; presets may shed only
cosmetic richness (dust, sparks, snow, smoke, bloom). Tier knobs read the static
preset (`src/game/ui_effects_profile.ts`), never the FPS governor
(`docs/design/graphics-settings-fairness.md`). Vein dressing never out-glows a
telegraph, and a hazard colour is never the vein's ambient colour (the Buried Hoard
room rule, `docs/design/boss-rooms/README.md`).

### 6.1 Hammer: the collapsing gallery

- Where: the Gallery from h2 to h3 (`gallery_middle`, `gallery_lower`).
- Trigger: once per claim, when the raid passes h2 after pack h2 dies.
- Behaviour: rock overhangs (the fissure is open to the sky, the rims are not)
  shed falls in marching bands BEHIND the raid, pushing it forward like a short
  flight. A band telegraphs as a ground strip before it lands; a hit hurts and
  briefly slows, never kills from full health.
- Rule: rubble never blocks the path for good (the gate engine's corpse-run
  promise); it settles to the rims or clears after the chase.
- Low tier: dust and debris particles shed; the strip and its warning stay.

### 6.2 Breath: the wind bridge

- Where: `wind_bridge` (13 yd wide, +24 to +36), shelters `sh_wind_shelter` on the
  windward edge.
- Behaviour: gusts arrive in a steady rhythm across the arch. A gust pushes players
  toward the windward shelters, never off the arch; a player behind a shelter is
  not pushed. Cross between gusts. Balustrade edges plus field cliffs mean nobody
  falls.
- Telegraph: a visible wind band sweeping in plus an audible bellows intake before
  each gust.
- Low tier: cloud and spray shed; the band and audio cue stay.

### 6.3 Quench: the singing ice

- Where: `singing_ice` (-24), where pack q3 is fought.
- Behaviour: the ice creaks under the raid and cracks spread visibly toward
  players standing close together. If too many stand bunched for too long, a crack
  telegraph resolves into a hole of freezing water that roots and chills for a few
  seconds. It is a hazard zone, never a drop into the void. Teaches spreading.
- Low tier: frost particles shed; the crack decal and its warning stay.

### 6.4 Heat: the pour

- Where: `POUR_CHANNEL` across the casting floor, fed by `sh_pour_crucible` at
  (-132, 30); the Heat light river crosses it at z 0.
- Behaviour: the great crucible tilts and pours molten metal down the channel on a
  fixed cycle. Cross between pours, and fight f2 and f3 without standing in the
  channel.
- Telegraph: the crucible tilts and the channel glows before the flow arrives.
- Low tier: sparks and heat haze shed; the channel's warning glow and the flow stay.

## 7. Boss kits

All bosses are level 20 elite raid bosses at sketch numbers. Phase 1 ships one or
two readable mechanics each on the shared trash-kit engine (`MobTemplate.trashKit`,
`arcCleave`), enough to walk and pull every fight; none of its casts is in a kick
table. Phase 2 replaces every kit. Tuning follows classic-era raid practice: boss
health from a target fight length times measured raid DPS, damage anchored to the
tanks' mitigated intake and the healers' throughput, every number calibrated with
the meters harness, never shipped unmeasured.

### 7.1 Guardian of the Hammer (always first)

- Look: a stone titan with a huge hammer, half-fused with the Pit floor; the living
  lock on the way to the heart.
- Phase 1 (`heart_hammer_guardian`): Hammerfall (frontal arc cleave); Mountain's
  Wrath (cast-bar line-of-sight nova covering the Pit: hide behind a column).
- Target: the five columns rise and fall on a cycle, so the safe spots for Mountain's
  Wrath move; ground slams raise new columns; a tank-swap mechanic on the hammer.
  Role jobs: tanks swap and position against the columns, healers recover after
  each Wrath, damage dealers manage column timing.

### 7.2 Guardian of the Breath

- Look: a winged bellows colossus of wind, brass chains hanging; fights on the
  Cornice behind low walls.
- Phase 1 (`heart_breath_guardian`): Bellows Gust (cast-bar knockback around it,
  cliffs are walls); Storm Lance (cast-bar line, step out).
- Target: chained lightning between players standing close (spread), rhythmic gusts
  that push toward the balustrade (wind always ends at a wall), a phase where the
  bellows inhales and pulls everyone in.

### 7.3 Guardian of the Quench

- Look: ice and black iron, the tempering armour: blue ice body with black iron
  plates; fights in the middle of the Frozen Lake, braziers on the shelf.
- Phase 1 (`heart_quench_guardian`): Tempering Strike (frontal arc cleave);
  Quenching Breath (cast-bar frontal cone the tank turns away).
- Target: stacking cold on every player removed only at the shelf braziers
  (`LAKE_BRAZIERS`), slick ice under the boss, cracks that punish bunching.

### 7.4 Guardian of the Heat

- Look: a faceless ember smith with a red-hot anvil chained to its arm; fights on
  the anvil-shaped platform between molten channels.
- Phase 1 (`heart_heat_guardian`): Molten Pour (cast-bar line, step out); Anvil
  Clang (cast-bar stun on everyone close).
- Target: growing pools that spread unless someone soaks them, a shared strike that
  must be split among several players standing together, a heavy healing check.

### 7.5 The Masterless Strength (final)

- Look: the pieces of an unassembled forge body floating over the seal, under a
  storm sky with lightning every few seconds.
- Phase 1 (`heart_masterless_strength`): Forge Fist (frontal arc cleave); Forge
  Wrath (line-of-sight nova: hide behind an altar); Forge Pour (cast-bar frontal
  cone). One form only.
- Target design:
  1. **Form choice before the pull.** The raid touches one of the four altars. That
     strength is the first the body drinks; the boss assembles in that form,
     changing its shape, colour and core abilities:
     - Breath: light and fast, floats; chained lightning and pushing gusts; demands
       spreading and constant movement.
     - Quench: ice and steel plates; stacking cold cleansed only at braziers,
       slippery floor; demands brazier coordination.
     - Heat: living embers; growing pools and split strikes; demands heavy healing.
     - Hammer: heavy and slow, hits very hard; columns that block line of sight to
       healers and boulders the raid must soak together; demands strong tanks.
  2. **Altar drags.** Tanks drag the boss onto another altar; it drinks that
     strength for 45 seconds and adds its abilities on top of its form. A drunk altar
     goes cold until every altar has been used, then all relight. The raid picks the
     order for its composition (few healers: clear the hardest strength first).
  3. **Adds at every 25 percent.** At 75, 50 and 25 percent health all four altars
     release adds at once; the raid must pick them up before they reach the healers.
  4. **Heroic.** The boss drinks two strengths at once on each drag, and chooses the
     second itself (for example Breath plus Quench: spread for the lightning, gather
     at braziers for the cold).
  5. **Why the choice matters.** The form reshapes the whole fight, so each raid
     picks for its group and can try another form each week; the form also decides
     one extra loot item (section 8).
- Altar drags are inspired conceptually by a known raid encounter; mechanics,
  names and look are our own.

## 8. Loot hook (not wired in phase 1)

Every template in `SMITH_HEART_MOBS` ships `loot: []` on purpose. Phase 2 wires:

| Boss | Drops |
|---|---|
| Guardian of the Breath | Squallcrest (storm sword) |
| Guardian of the Quench | Rimelight (frost staff) |
| Guardian of the Heat | Hearthbrand (fire sword) |
| Guardian of the Hammer | a new earth hammer (to be designed, modelled and named) |
| The Masterless Strength | Duskwick (dusk flame staff) plus one form-dependent extra |

Squallcrest, Rimelight, Hearthbrand and Duskwick live on
`feature/highwatch-adventurers-guild` (PR #4530), reserved with
`earnedFrom 'future_raid'` and listed in `RESERVED_WEAPON_SKIN_IDS`. Wiring them
here lifts that reservation in the same change. Each guardian has its own table
on both difficulties (dungeon rework README, goal 4).

## 9. Build rules

1. Every path is at least 12 yd wide (a raid of ten). Pinned: "every walkway is at
   least 12 yd wide" in `tests/smith_heart_route.test.ts`.
2. No fall deaths. Edges are balustrades or rock; field cliffs are walls; every
   push (gusts, knockbacks) ends against a wall, never off an edge.
3. One colour and one light per vein (section 1); the floor light river always leads
   to the guardian.
4. The heart seal and its lit colours are visible from every point of the Ring
   (section 3.4).
5. Every dodgeable cue is equally readable at every graphics tier (section 6).
6. No borrowed models in the final product. Every phase 1 body is a placeholder
   listed in `src/render/characters/smith_heart_placeholder_looks.ts`; that list must
   be empty before the raid ships. New creatures are original, larger than the
   player, with their own animations.
7. Carved stone in the Smith's style (the Sanctum's runes), modelled in Blender with
   one kit per vein. A common Smith style across the veins so the raid never reads
   as four dungeons stitched together.
8. Nothing solid on a walking line, a pack spot, a gate's span or an arena's middle.

## 10. Testing

- `tests/smith_heart_route.test.ts`: the route contract over the real collision seam
  (`isBlocked`): the end-to-end walk with every gate open, a fresh claim held in the
  Gallery, the Pit Mouth versus the Slab, free order of the three veins, each
  causeway alone reaching the Heart, no step over `MAX_STEP_HEIGHT`, 12 yd paths and
  gates, and the Ring pack spacing.
- `tests/smith_heart_gating.test.ts`: the seal mask round trip, a fresh claim shut
  and dark, the Hammer first, the other three in any order, the Heart only with all
  four lit and the Ring clear.
- `tests/smith_heart_dev.test.ts`: the `/dev heart` family and the dev-only door.
- Every new Smith's Heart test follows the path pattern `tests/smith_heart_*.test.ts`
  (walls in the `gravewyrm_sanctum_walls` pattern when the phase 2 kit adds walls).
- Guard tests that must stay green: `tests/architecture.test.ts` (sim purity and
  determinism), `tests/localization_fixes.test.ts` (S3: every sim line has a client
  matcher), `tests/dungeon_gate_seal_delay.test.ts` (each sealed arena lies on its
  boss's side of the gate line).

## 11. Dev commands

`/dev heart` in `src/sim/dev/smith_heart_dev.ts`, dev-gated like `/dev sanctum`:

| Command | Does |
|---|---|
| `/dev heart` | help line |
| `/dev heart enter [normal]` | claim a fresh run and step in at the Cleft |
| `/dev heart tp <area or boss>` | jump inside the run (enters first): cleft, gallery, pit, balcony, ring, ringse, ringsw, breath, bridge, cornice, quench, ice, lake, heat, forge, anvil, heart; a boss name (hammer, breathboss, quenchboss, heatboss, final) lands beside that boss |
| `/dev heart kill <what>` | kill a guardian (hammer, breath, quench, heat), the final boss (final), all four guardians (guardians), one pack (`pack h1` and so on), every pack (trash), or all; kills credit through the normal death path, so gates and seal follow on the next tick |
| `/dev heart gates` | open every gate of the run |
| `/dev heart seal` | print the `smithHeartProgress` readout |
| `/dev heart reset` | free the run and claim a fresh one |

Pinned by `tests/smith_heart_dev.test.ts`, including the refusal without
`devCommands` and the door refusing a non-dev world.

## 12. Phase 2 plan

1. Blender kit per vein, ONE vein at a time, iterating with renders against the
   reworked dungeons; start with the Hammer: the world entrance crack, the Cleft and
   the Gallery. Then the Balcony and Ring (the reveal shot), then Breath, Quench and
   Heat.
2. Original creature models for every trash and boss body, emptying
   `smith_heart_placeholder_looks.ts`.
3. Real boss kits (section 7) as modules behind the `SimContext` seam under
   `src/sim/encounters/smith_heart/`, with heroic twists.
4. The four set pieces (section 6) as sim modules with ground cues.
5. The quest with Captain Thessaly at Highwatch.
6. Finder entry, raid lockout and loot wiring (section 8).
7. IP check of every new player-visible proper noun (the raid name, every mob and
   boss name, the earth hammer) before it ships, per `src/sim/content/CLAUDE.md`
   "Naming originality" and `docs/design/naming-audit.md`; each verdict recorded in
   this doc.

## 13. Shipping checklist

- [ ] Flip `SMITH_HEART_PLAYABLE` to true (`src/sim/content/smith_heart.ts`): this also builds the overworld door; check the door clearance, terrain calm anchor and parity goldens in the same change.
- [ ] Set `guideVisible` true and regenerate the wiki (`npm run wiki:content`), plus
      any `guide.*` prose keys.
- [ ] Book of Deeds records for the raid and its bosses (`src/sim/content/deeds.ts`,
      `docs/design/deeds.md`).
- [ ] Reliquary pages for its unique loot (`docs/design/reliquary.md`).
- [ ] i18n: English `t()` keys for every player string, entity names in
      `src/ui/world_entity_i18n.ts`, sim lines in `src/ui/sim_i18n.ts`, non-Latin
      fills for wordy names (M16).
- [ ] Finder entry next to the Ignivar raid family (`src/sim/content/dungeon_finder.ts`).
- [ ] Raid lockout, loot tables, committed WebP art for every new item id.
- [ ] Placeholder list empty; all names IP-checked.
- [ ] `content-obligations-reviewer` run over the content diff.

## 14. Open questions

1. Heroic at launch, or later as Ignivar did?
2. Attunement quest to enter (proposed: a short one with Thessaly at Highwatch), or
   open entry?
3. Ring width: keep 16 yd, or narrow to the pages' 14 yd once packs and pulls are
   playtested?
4. The south (Hammer) altar sits under the Balcony with no causeway or vein mouth
   behind it. Accept, or move the altars so each faces a causeway and the Hammer
   altar faces the Balcony stairs?
