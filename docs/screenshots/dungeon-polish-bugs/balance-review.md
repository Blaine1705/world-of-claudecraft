# Dungeon effects and balance review — 2026-10-07

No production code, HP or damage values were changed in this review. Current figures
come from the existing polish worktree based on PR #4352 at
`ab3230e6e3d435b983a86c009cb2db74bec2f920`; latest release/v0.45.0 was re-fetched
and remains `55de7ffe926d781df7b2caee4314318c7ff730ac`.

## Main findings

Current normal finales have substantially more health than the old normal bosses
recorded in production. Vael, Ysolei, Korzul and Zulgar normal also exceed their
recorded **heroic** health. This supports the manager's observation about normal
HP resembling heroic, but it compares different encounter versions, not two
difficulties of the same deployed build.

| Final boss | Current normal HP | Parse normal HP | Current / parse N | Current heroic HP | Parse heroic HP | Current / parse H |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Morthen the Gravecaller | 6,791 | [1,191](https://parses.worldofclaudecraft.com/#/fight/152689) | 5.70x | 28,837 | [7,883](https://parses.worldofclaudecraft.com/#/fight/152244) | 3.66x |
| Vael the Fogbinder | 11,998 | [1,490](https://parses.worldofclaudecraft.com/#/fight/152950) | 8.05x | 34,449 | [8,777](https://parses.worldofclaudecraft.com/#/fight/152240) | 3.92x |
| Ysolei, Avatar of the Drowned Moon | 17,994 | [2,176](https://parses.worldofclaudecraft.com/#/fight/152941) | 8.27x | 34,497 | [13,132](https://parses.worldofclaudecraft.com/#/fight/152234) | 2.63x |
| Korzul the Gravewyrm | 23,988 | [6,127](https://parses.worldofclaudecraft.com/#/fight/151963) | 3.92x | 36,785 | [13,138](https://parses.worldofclaudecraft.com/#/fight/152230) | 2.80x |
| Zulgar, Voice of the Basin | 24,808 | [6,882](https://parses.worldofclaudecraft.com/#/fight/150161) | 3.60x | 36,818 | [14,757](https://parses.worldofclaudecraft.com/#/fight/152217) | 2.49x |

The comparison selects level-20 characters with known occupied-piece mean ilvl
at least 28. Heroic samples use the same five-player cohort; its protection
paladin has complete known ilvl 34.85. Party means are around 30, with two mage
pieces unavailable in the current item catalog, so those means are partial.
Normal samples are mostly solo; Korzul normal is a genuine three-player group.
Production builds are 0.44.5, except the selected Korzul/Zulgar normal at 0.44.4.
Item levels are derived from item IDs, not a recorded ilvl or Perfected payload.
These are selected examples, not population medians or fresh-geared five-player
normal runs. [Full parse selection and caveats](parses-selected.md).

The original feedback's Olen/crab dungeon is currently named Sunken Bastion.
Current Drowned Temple contains Selthe, Hydra, Colossus and Ysolei. Recent parse
actor lists do not contain Olen or the other newly rewritten side bosses, so they
have no directly matching production comparison in this sample.

## Current HP and raw weapon values

Extraction calls the real `createMob`, `mobTemplateForDungeonDifficulty`,
`mobLevelForDungeonDifficulty` and `applyDungeonMobTuning`. All listed normal
boss levels are fixed; all heroic bosses are level 22. Small deviations from round
HP targets are the actual rounded multiplier results.

| Dungeon | Boss | Normal HP | Heroic HP | Normal raw swing | Heroic raw swing | Swing seconds |
| --- | --- | ---: | ---: | --- | --- | ---: |
| Hollow Crypt | Sexton Marrow | 3,152 | 16,099 | 32–50 | 1,476–2,306 | 2.2 |
| Hollow Crypt | Lady of the Bonechill | 3,998 | 18,382 | 35–54 | 1,476–2,306 | 2 |
| Hollow Crypt | Cantor Ilvane | 3,195 | 14,687 | 33–51 | 1,402–2,190 | 2.2 |
| Hollow Crypt | Morthen the Gravecaller | 6,791 | 28,837 | 41–65 | 1,574–2,460 | 2.6 |
| Hollow Crypt | Knellwyrm | 1,081 | 7,254 | 43–68 | 1,675–2,618 | 2.4 |
| Sunken Bastion | Knight-Commander Olen | 5,995 | 18,382 | 48–74 | 1,417–2,214 | 2.2 |
| Sunken Bastion | Gaoler Ossick | 6,796 | 19,530 | 51–79 | 1,417–2,214 | 2.4 |
| Sunken Bastion | Vael the Fogbinder | 11,998 | 34,449 | 52–81 | 1,439–2,248 | 2.4 |
| Sunken Bastion | The Turretback Hermit | 4,495 | 13,801 | 55–85 | 1,529–2,390 | 2.8 |
| Sunken Bastion | Gaol Turnkey | 3,599 | 11,041 | 51–79 | 1,417–2,214 | 2.6 |
| Drowned Temple | Choirmother Selthe | 9,899 | 20,650 | 63–98 | 1,360–2,125 | 2.2 |
| Drowned Temple | Tideglass Colossus | 11,495 | 23,003 | 69–108 | 1,422–2,221 | 2.8 |
| Drowned Temple | Ysolei, Avatar of the Drowned Moon | 17,994 | 34,497 | 76–119 | 1,483–2,317 | 2.5 |
| Drowned Temple | Mere Hydra | 2,000 | 4,306 | 69–108 | 1,422–2,221 | 2.6 |
| Gravewyrm Sanctum | Sledge Tusker | 8,992 | 13,796 | 398–622 | 1,393–2,177 | 2.8 |
| Gravewyrm Sanctum | Korgath the Bound | 12,007 | 18,391 | 788–1,231 | 1,708–2,668 | 2.8 |
| Gravewyrm Sanctum | Grand Necromancer Velkhar | 15,000 | 22,991 | 524–819 | 1,637–2,558 | 2 |
| Gravewyrm Sanctum | Korzul the Gravewyrm | 23,988 | 36,785 | 734–1,148 | 1,778–2,779 | 2.6 |
| Wildheart Basin | Great Saurian | 10,002 | 14,998 | 398–622 | 1,550–2,423 | 2.8 |
| Wildheart Basin | Fanglord Beastmaster | 15,000 | 23,005 | 525–820 | 1,764–2,756 | 2.6 |
| Wildheart Basin | Fanglord's Great Jaguar | shared with Beastmaster | shared with Beastmaster | 397–621 | 1,615–2,523 | 2 |
| Wildheart Basin | The Gorgebloom | 15,000 | 23,003 | 531–829 | 1,550–2,423 | 2.6 |
| Wildheart Basin | Zulgar, Voice of the Basin | 24,808 | 36,818 | 527–824 | 1,743–2,723 | 2.55 |

Raw weapon bounds are before crit, buffs, enrage, target armor/stance/block and
absorbs; casts and movement interrupt normal swing cadence. Selthe **does not
melee**: her 2s Moonwater Bolt uses 1.2x weapon, 76–118 normal / 1,632–2,550 heroic.
Jaguar's shared pool is the Beastmaster's; its ordinary swings are suppressed
during stalk, which instead uses Bite 120–150 / 300–375. Hydra values are per head:
three independent pools that regrow. Four Korgath shackles add 1,500 / 2,303 each;
two Ilvane choristers add 391 / 1,844 each. Knellwyrm is a separate post-Morthen
phase in both difficulties in this branch.

## Damage and observed high-gear tank pressure

The same protection paladin appears in all five selected heroics. Parsed means
are landed hit/block damage after armor and absorption. They are not raw authored
ranges or maximum hits. Boss DTPS includes that boss's other abilities, but excludes
adds, trash and pets as damage sources. Do not equate raw bounds with observed means.

| Final boss | Current normal raw swing | Current heroic raw swing | Heroic parse tank mean melee | Heroic parse tank DTPS | Heroic kill seconds | Parse |
| --- | --- | --- | ---: | ---: | ---: | --- |
| Morthen the Gravecaller | 41–65 | 1,574–2,460 | 438.80 | 205.36 | 11.95 | [152244](https://parses.worldofclaudecraft.com/#/fight/152244) |
| Vael the Fogbinder | 52–81 | 1,439–2,248 | 502.75 | 143.73 | 16.10 | [152240](https://parses.worldofclaudecraft.com/#/fight/152240) |
| Ysolei, Avatar of the Drowned Moon | 76–119 | 1,483–2,317 | 597.17 | 216.41 | 20.35 | [152234](https://parses.worldofclaudecraft.com/#/fight/152234) |
| Korzul the Gravewyrm | 734–1,148 | 1,778–2,779 | 433.83 | 133.54 | 24.30 | [152230](https://parses.worldofclaudecraft.com/#/fight/152230) |
| Zulgar, Voice of the Basin | 527–824 | 1,743–2,723 | 670.10 | 255.38 | 30.10 | [152217](https://parses.worldofclaudecraft.com/#/fight/152217) |

[All 99 active damage/percentage mechanics](boss-mechanics.md) include each
ability's normal/heroic range, cadence, cast, armor handling and source. Notable
values in the dungeon from the manager's HP feedback:

- Olen Bulwark: 60–70 / 360–420; Sentence: 110–125 / 660–750; Brine: 18 / 156 per second.
- Ossick Cudgel: 77–119 / 2,126–3,321 every 12s. It is scripted physical damage
  **without an armor reduction call**. Drowning Pit on failed rescue: 60% / 80%
  of the victim's maximum HP.
- Crab Claw Sweep: 90–110 / 720–880; Shell Slam: 50–60 / 400–480.
- Vael Mist Surge: 30–40 / 180–240; Reaping Scythe: 60–70 / 360–420 per strike.

Korgath initially has 80% damage reduction from four shackles, Olen can have 40%
reduction plus an immune add phase, and Korzul has two 24-second immune flights.
Morthen has an immune candle ritual. Therefore extra HP alone does not predict the
current encounter duration from an old parse; mechanics, vulnerabilities, adds,
healing and uptime also changed. No automatic tuning recommendation is applied.

## Camera-effect review

37 tests passed across four files:

`npx vitest run tests/camera_relative_floor_shaders.test.ts tests/trash_engine_quench_slab.test.ts tests/gravewyrm_sanctum_lights.test.ts tests/gravewyrm_sanctum_boss_fx_core.test.ts --experimental.fsModuleCache=false --maxWorkers=1`

Current offline captures hold the shared render clock at 7.4 seconds and orbit
each location at low, normal and high pitch. No old camera-dependent floor flicker
was reproduced on the reviewed quench circles, vault rims, ritual circle or final
lake boundary. Static fire remains upright; rotating toward the camera about the
vertical is intentional. The literal name “Fire Blazer” does not exist, so both
orange/soul static braziers were reviewed as the likely reported effect. Without
the manager's original image, the exact “ring” and “Fire Blazer” identities remain
an interpretation rather than a guaranteed match.

- Quench circles: [front](review-effects/checked_quench_circles_front.png), [orbit](review-effects/checked_quench_circles_orbit.png).
- Vault rims: [front](review-effects/checked_vault_rims_front.png), [high](review-effects/checked_vault_rims_high.png).
- Final lake boundary: [front](review-effects/checked_final_lake_ring_front.png), [orbit](review-effects/checked_final_lake_ring_orbit.png).
- Fire brazier: [front](review-effects/checked_orange_brazier_front.png), [high](review-effects/checked_orange_brazier_high.png).
- Spawned Soul Brazier body and fire: [current capture](review-effects/checked_spawned_brazier.png).

The earlier unrelated offline 502/training-dummy/staff preload warnings remain;
no new shader or effect error appeared. This read-only review did not rerun the
implementation's full merge gate, and does not supersede its existing QA status.

## Reproduction and artifacts

- `npx tsx tmp/dungeon-review/current-numbers.ts`: 60 live-entity difficulty rows, including separate adds/heads.
- `npx tsx tmp/dungeon-review/current-mechanics.ts`: active damage and HP thresholds from live tuning/callsites.
- `node tmp/dungeon-review/shot.mjs effects`, with `SHOT_URL=http://127.0.0.1:5365/`: current angle evidence.
- Public Parses MCP/API responses, version filters, gear snapshots and exclusions remain in `tmp/dungeon-review/raw/`.
- [Boss stats CSV](boss-stats.csv), [current entity JSON](current-boss-numbers.json), [mechanics JSON](boss-mechanics.json), [selected parse JSON](parses-selected.json).

No staging, commit, push, deployment or remote mutation was performed.
