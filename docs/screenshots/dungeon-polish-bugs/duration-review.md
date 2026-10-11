# Dungeon boss duration review, 2026-10-07

No boss HP or damage was changed for this analysis. This report distinguishes historical production kills from measured isolated encounters in the current PR4352 worktree.

## Current rework: measured automated reference

Five level20 players, one Protection paladin, one Discipline priest, Retribution paladin, Subtlety rogue, Fire mage. Equipment/talents from production fight152244. Two unknown mage jewelry IDs use real same-slot items from fight152107; this is a documented reference fixture, not an exact character replay. Initial HP/mana full, ordinary party buffs cast through Sim, then real dungeon claims and ordinary abilities/interact/movement input. No HP/mana refill, fabricated DPS, pinned threat, skipped immune phases or forced mechanic completion during combat. Other trash/bosses are removed for isolated encounters. Three deterministic seeds per boss/difficulty.

Combat time starts when the boss enters combat, ends on death. Morthen includes the complete Knellwyrm finale; the main-body time is reported separately. Hydra ends only when every head is dead. Out-of-combat introductions excluded from combat time; arrival-to-clear also saved. Kill medians below include kills with deaths: the clean column makes those explicit. A single clean kill is a reference measurement, not a distribution.

| Dungeon | Boss | NM HP | NM kill median / range s | Clean kills | HC HP | HC kill median / range s | Clean kills |
|---|---|---:|---|---:|---:|---|---:|
| hollow_crypt | Sexton Marrow | 3152 | 11.6 (11.6 to 11.6), 3/3 kills | 3/3 | 16099 | 41.65 (41.4 to 46.65), 3/3 kills | 3/3 |
| hollow_crypt | Lady of the Bonechill | 3998 | 5.35 (5.35 to 5.35), 3/3 kills | 3/3 | 18382 | 32.05 (29.95 to 32.4), 3/3 kills | 3/3 |
| hollow_crypt | Cantor Ilvane | 3195 | 18.9 (18.9 to 20.55), 3/3 kills | 3/3 | 14687 | no kill (0 wipes, 3 resets) | 0/3 |
| hollow_crypt | Morthen the Gravecaller | 6791 | 35.55 (34.1 to 36.55), 3/3 kills | 3/3 | 28837 | 106.7 (99.25 to 107.85), 3/3 kills | 1/3 |
| sunken_bastion | Knight-Commander Olen | 5995 | 9.7 (8.15 to 9.8), 3/3 kills | 3/3 | 18382 | no kill (3 wipes, 0 resets) | 0/3 |
| sunken_bastion | The Turretback Hermit | 4495 | 8.3 (8.3 to 8.3), 3/3 kills | 3/3 | 13801 | 32 (28.1 to 32.55), 3/3 kills | 3/3 |
| sunken_bastion | Gaol Turnkey | 3599 | 3.85 (3.8 to 5.4), 3/3 kills | 3/3 | 11041 | 18.45 (18.35 to 19.8), 3/3 kills | 3/3 |
| sunken_bastion | Gaoler Ossick | 6796 | 15.95 (15 to 16.5), 3/3 kills | 3/3 | 19530 | no kill (0 wipes, 3 resets) | 0/3 |
| sunken_bastion | Vael the Fogbinder | 11998 | 35.05 (31.75 to 38.25), 3/3 kills | 3/3 | 34449 | no kill (3 wipes, 0 resets) | 0/3 |
| drowned_temple | Choirmother Selthe | 9899 | 10.65 (10.55 to 10.65), 3/3 kills | 3/3 | 20650 | 33.3 (27.25 to 34.2), 3/3 kills | 1/3 |
| drowned_temple | Mere Hydra | 2000 | 7.5 (7.5 to 8.4), 3/3 kills | 3/3 | 4306 | no kill (3 wipes, 0 resets) | 0/3 |
| drowned_temple | Tideglass Colossus | 11495 | 43.2 (35.25 to 46.7), 3/3 kills | 3/3 | 23003 | no kill (3 wipes, 0 resets) | 0/3 |
| drowned_temple | Ysolei, Avatar of the Drowned Moon | 17994 | 25.6 (24.65 to 26.4), 3/3 kills | 3/3 | 34497 | no kill (3 wipes, 0 resets) | 0/3 |
| gravewyrm_sanctum | Sledge Tusker | 8992 | 16.8 (16.3 to 17.1), 3/3 kills | 3/3 | 13796 | 41.5 (39.3 to 43.7), 2/3 kills | 1/3 |
| gravewyrm_sanctum | Korgath the Bound | 12007 | 32.95 (32.3 to 34.15), 3/3 kills | 3/3 | 18391 | no kill (3 wipes, 0 resets) | 0/3 |
| gravewyrm_sanctum | Grand Necromancer Velkhar | 15000 | 62.45 (62.45 to 62.45), 1/3 kills | 1/3 | 22991 | no kill (3 wipes, 0 resets) | 0/3 |
| gravewyrm_sanctum | Korzul the Gravewyrm | 23988 | 82.45 (77.65 to 85.55), 3/3 kills | 3/3 | 36785 | no kill (3 wipes, 0 resets) | 0/3 |
| wildheart_basin | Great Saurian | 10002 | 14 (13.85 to 15.2), 3/3 kills | 3/3 | 14998 | 30.9 (30.75 to 32.5), 3/3 kills | 3/3 |
| wildheart_basin | Fanglord Beastmaster | 15000 | 41.5 (41.35 to 43.1), 3/3 kills | 3/3 | 23005 | no kill (3 wipes, 0 resets) | 0/3 |
| wildheart_basin | The Gorgebloom | 15000 | 17 (17 to 18.9), 3/3 kills | 3/3 | 23003 | no kill (3 wipes, 0 resets) | 0/3 |
| wildheart_basin | Zulgar, Voice of the Basin | 24808 | 60.3 (53.4 to 78.75), 3/3 kills | 0/3 | 36818 | no kill (3 wipes, 0 resets) | 0/3 |

Morthen body and complete finale:

| Difficulty | Seed | Body combat s | Complete finale combat s | Intro s | Deaths |
|---|---:|---:|---:|---:|---:|
| normal | 23 | 23 | 35.55 | 16.45 | 0 |
| normal | 47 | 24.55 | 36.55 | 16.45 | 0 |
| normal | 83 | 22.1 | 34.1 | 16.45 | 0 |
| heroic | 23 | 78.35 | 106.7 | 16.45 | 1 |
| heroic | 47 | 81.9 | 107.85 | 16.45 | 1 |
| heroic | 83 | 77.5 | 99.25 | 16.45 | 0 |

## Measurement limits

- This measures one automated strategy and roster, not the usual human group clear time. Three seeds exercise damage variation; they do not represent player/class/gear variation.

- NM Crypt/Bastion/Temple are leveling dungeons. A level20 geared group is an overgeared farming scenario; it cannot establish whether leveling players need more boss HP.

- The bot does not execute all mechanics correctly. Beastmaster remains bonded to Jaguar, the Vael policy knows the main body without waiting for the Beacon-Lit tell, and the bot lacks complete lantern grouping, fracture/lane/tsunami avoidance, Ysolei tear interception and Zulgar hunt kiting. Velkhar dry-floor handling remains imperfect. Wipes/resets, and kills with deaths, are not clean-duration estimates or independent evidence of excess HP/damage.

- Missing gems, historical item payloads, temporary stats and player-perfect rotations prevent exact reconstruction of production DPS. The comparison concerns elapsed timings, not equivalence between the two datasets.

- Hydra listed HP is per head; Beastmaster/Jaguar share a pool; Korgath requires additional shackles; Morthen finale adds Knellwyrm HP. Raw damage events include overkill and are not interpreted as exact HP consumed.

## Production parses, old 0.44.0 to 0.44.5 encounters

Public read-only service: https://parses.worldofclaudecraft.com/#/fights . Period2026-09-28 through2026-10-07. No0.45 rework fights were available at retrieval. Cohort: every participant level20, at least10 known tiered equipped slots, mean known ilvl>=28 individually; no DPS selection. Item levels derived from current item definitions. Correlated repeat kills, partial jewelry and kills with deaths are retained and flagged in the source dataset.

| Dungeon final | HC5 players n | Median s | Range s | NM5 players n / median |
|---|---:|---:|---|---|
| hollow_crypt | 13 | 12.35 | 7.6 to 29.3 | 0 / unresolved |
| drowned_temple | 14 | 21.23 | 11.9 to 59.4 | 0 / unresolved |
| sunken_bastion | 14 | 16.05 | 8 to 30.1 | 0 / unresolved |
| gravewyrm_sanctum | 14 | 20.35 | 13.45 to 28.5 | 1 / 14.7 |
| wildheart_basin | 11 | 18.15 | 11.7 to 31 | 0 / unresolved |

NM does not have enough geared five-player parses for a usual-duration claim: only one Korzul kill (14.7 s) qualifies. Separate three-player references: Morthen12.1s(n1), Ysolei4.6s median(n3), Vael11.35s median(n2), Korzul12.25s(n1), no Zulgar sample. They are never pooled with five-player groups.

## HP diagnosis

- No global HP increase for the rework. Marrow HC already takes41.4 to46.65s; Morthen HC body77.5 to81.9s and complete finale99.25 to107.85s. Korzul NM77.65 to85.55s. These encounters already have meaningful time from objectives and immune phases.

- Early NM speed with level20 gear is expected; preserve leveling tuning until testing the intended level band.

- Lady HC29.95 to32.4s, Hermit HC28.1 to32.55s and Great Saurian HC30.75 to32.5s are candidates for a targeted increase if the desired geared main-boss duration is45 to60s. This target is a design recommendation, not an existing acceptance criterion. A modest25percent HP experiment would be a starting point, not a guaranteed25percent duration increase. Candidate HP: Lady18382 to22978, Hermit13801 to17251, Saurian14998 to18748. No value has been applied.

- Turnkey HC18.35 to19.8s is a miniboss; its shorter duration alone does not justify a main-boss HP target.

- Do not tune unresolved HC encounters from failed bot runs. Their human usual-duration measurement remains incomplete. Resolve encounter execution and survival before increasing HP.

## Reproduction and validation

Scratch harness: tmp/dungeon-review/duration-party.ts, duration-run.ts and duration-report.mjs.

```powershell
$env:PROBE_BOSS=''
$env:PROBE_SEEDS='23,47,83'
npx tsx tmp/dungeon-review/duration-run.ts
```

126 unique boss/difficulty/seed results; Hydra and Korzul re-run after measurement-policy corrections. Marrow seed23 re-run in both modes and compared for exact deterministic timings and totals. Source data in duration-results.json; all per-second samples and pilot measurements in tmp/dungeon-review. No balance implementation was made; implementation gate was not run for this analysis.
