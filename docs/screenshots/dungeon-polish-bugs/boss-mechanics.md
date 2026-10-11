# Current dungeon boss mechanics

Damage is input to dealDamage before source aura modifiers, target stance/DR/vulnerability and absorbs. Percentages are fractions of target maxHp unless stated bossMaxHp. Heavy attacks expose prearmor bounds separately.

## hollow_crypt

| Boss | Mechanic | Normal | Heroic | Cadence | Cast | Armor | Source | Notes |
|---|---|---|---|---|---|---|---|---|
| Sexton Marrow | Shovelful | {"min":48,"max":75,"coefficient":1.5} | {"min":2214,"max":3459,"coefficient":1.5} | every 11s | 1.2 | heavySwing -> mobArmorReduction | src/sim/encounters/hollow_crypt/marrow.ts |  |
| Sexton Marrow | Open Grave | {"min":42,"max":52} | {"min":252,"max":312} | mark every 15s; opens after 4s | 1 | none at damage callsite | src/sim/encounters/hollow_crypt/marrow.ts |  |
| Sexton Marrow | Grave Dirt | {"min":9,"max":9} | {"min":54,"max":54} | each 1s inside an open grave |  | none at damage callsite | src/sim/encounters/hollow_crypt/marrow.ts |  |
| Sexton Marrow | Burial Toll | {"min":30,"max":38} | {"min":180,"max":228} | at 66% and 33% boss HP; 3 peals, 3s each |  | none at damage callsite | src/sim/encounters/hollow_crypt/marrow.ts |  |
| Sexton Marrow | Gravedigger's Blow | none | {"min":1476,"max":2306,"coefficient":1} | every 9s, heroic only | 0.8 | heavySwing -> mobArmorReduction | src/sim/encounters/hollow_crypt/marrow.ts | Adds 6% vulnerability per stack, max 6 stacks, 20s duration. |
| Lady of the Bonechill | Bride's Lament | {"min":60,"max":75} | {"min":300,"max":375} | every 22s | 3 | none at damage callsite | src/sim/encounters/hollow_crypt/lady.ts | Unsheltered targets; each existing Lingering Lament stack adds 50% to this damage, max 3. |
| Lady of the Bonechill | Frozen Embrace | {"min":6,"max":6} | {"min":30,"max":30} | each 1s during 8s hold; every 30s |  | none at damage callsite | src/sim/encounters/hollow_crypt/lady_embrace.ts | 1 victim normal, 2 heroic; break by damaging the boss for 6% max HP. |
| Lady of the Bonechill | Shattering Fall | {"min":150,"max":180} | {"min":750,"max":900} | if Frozen Embrace is not answered |  | none at damage callsite | src/sim/encounters/hollow_crypt/lady_embrace.ts |  |
| Cantor Ilvane | Dirge of the Hollow | {"min":105,"max":125} | {"min":840,"max":1000} | every 16s; below30% every11s | 2.5 | none at damage callsite | src/sim/encounters/hollow_crypt/ilvane.ts | Kickable; cast becomes 1.8s below30%. |
| Cantor Ilvane | Bone Organ | {"min":100,"max":115} | {"min":800,"max":920} | every 26s; 2 note waves (3 below30%) |  | none at damage callsite | src/sim/encounters/hollow_crypt/ilvane_organ.ts |  |
| Morthen the Gravecaller | Shadow Pulse | {"min":24,"max":30} | {"min":216,"max":270} | every 12s, 9s in Last Rites | 2 | none at damage callsite | src/sim/encounters/hollow_crypt/morthen.ts |  |
| Morthen the Gravecaller | Reap the Unquiet | {"min":55,"max":65} | {"min":495,"max":585} | every 14s below35% | 2 | none at damage callsite | src/sim/encounters/hollow_crypt/morthen.ts |  |
| Morthen the Gravecaller | Grave Chill | {"perSecond":"3 + floor(ritualSeconds/5)"} | {"perSecond":"27 + 9*floor(ritualSeconds/5)"} | each1s while candle Rite is active |  | none at damage callsite | src/sim/encounters/hollow_crypt/morthen.ts |  |
| Morthen the Gravecaller | Bound Soul interception | {"min":12,"max":16} | {"min":108,"max":144} | soul every 15s |  | none at damage callsite | src/sim/encounters/hollow_crypt/morthen_gravecall.ts | Walker snapshots mechanic factor at launch; missed souls heal boss3% and add10% output up to10 stacks. |
| Morthen the Gravecaller | Candle's Price | {"targetMaxHpFractionPerSecond":0.06} | {"targetMaxHpFractionPerSecond":0.08} | each1s during 4s relight channel | 4 | none at damage callsite | src/sim/encounters/hollow_crypt/morthen_candles.ts | No mechanic multiplier on percentage. |
| Morthen the Gravecaller | Name the Dead (wrong candle) | none | {"min":252,"max":288} | wrong relight order, heroic only |  | none at damage callsite | src/sim/encounters/hollow_crypt/morthen_candles.ts |  |
| Morthen the Gravecaller | Grasp of the Grave | none | {"min":162,"max":198} | every 16s; 1.5s fuse, heroic only |  | none at damage callsite | src/sim/encounters/hollow_crypt/morthen_grasp.ts |  |
| Knellwyrm | Wyrmcall Pyre (touchdown) | {"min":60,"max":75} | {"min":1200,"max":1500} | one touchdown after Morthen falls |  | none at damage callsite | src/sim/encounters/hollow_crypt/knellwyrm.ts |  |
| Knellwyrm | Pyre Strafe | {"min":35,"max":45} | {"min":700,"max":900} | every 26s, 2.5s marking |  | none at damage callsite | src/sim/encounters/hollow_crypt/knellwyrm.ts |  |
| Knellwyrm | Pyre Strafe burning lane | {"min":14,"max":14} | {"min":280,"max":280} | each1s for 10s |  | none at damage callsite | src/sim/encounters/hollow_crypt/knellwyrm.ts |  |
| Knellwyrm | Dread Bellow | {"min":12,"max":18} | {"min":240,"max":360} | every 30s | 2 | none at damage callsite | src/sim/encounters/hollow_crypt/knellwyrm.ts | Boss takes25% more damage for8s afterward. |
| Knellwyrm | Barrowflame Breath | {"min":30,"max":38} | {"min":600,"max":760} | every 13s | 2 | none at damage callsite | src/sim/mob/mob_cast_bars.ts (MOBS.crypt_knellwyrm.breathCone) |  |
| Knellwyrm | Tail Lash | {"min":20,"max":28} | {"min":400,"max":560} | every10s | 1 | none at damage callsite | src/sim/content/hollow_crypt.ts (MOBS.crypt_knellwyrm.trashKit) |  |
| Knellwyrm | Wing Gust | {"min":12,"max":18} | {"min":240,"max":360} | every19s | 1.5 | none at damage callsite | src/sim/content/hollow_crypt.ts (MOBS.crypt_knellwyrm.trashKit) |  |
| Knellwyrm | Burning Knell | none | {"min":1000,"max":1120} | every55s; 3 breaths; 4.5s marks, heroic only |  | none at damage callsite | src/sim/encounters/hollow_crypt/knellwyrm_knell.ts |  |

## sunken_bastion

| Boss | Mechanic | Normal | Heroic | Cadence | Cast | Armor | Source | Notes |
|---|---|---|---|---|---|---|---|---|
| Knight-Commander Olen | Rebounding Bulwark | {"min":60,"max":70} | {"min":360,"max":420} | every18s | 1.5 | none at damage callsite | src/sim/encounters/sunken_bastion/olen.ts | Up to3 victims normal,4heroic; rebounces every0.35s. |
| Knight-Commander Olen | Sentence of the Tide | {"min":110,"max":125} | {"min":660,"max":750} | every22s; 5s mark | 1 | none at damage callsite | src/sim/encounters/sunken_bastion/olen.ts |  |
| Knight-Commander Olen | Hallowed Brine | {"perSecond":18} | {"perSecond":156} | every14s, lasts15s | 1.2 | none at damage callsite | src/sim/encounters/sunken_bastion/olen.ts | Heroic chooses26 then multiplies6:156/s; Olen has40%DR while in pool. |
| Gaoler Ossick | Gaoler's Cudgel | {"min":77,"max":119,"coefficient":1.5} | {"min":2126,"max":3321,"coefficient":1.5} | every12s | 1 | none at damage callsite | src/sim/encounters/sunken_bastion/ossick.ts | Direct weapon coefficient; no mechanic multiplier and no armor call. |
| Gaoler Ossick | Anchor Crash | none | {"min":300,"max":360} | on anchor cast, every24s, heroic only | 1.8 | none at damage callsite | src/sim/encounters/sunken_bastion/ossick.ts |  |
| Gaoler Ossick | Shackle Strain | {"min":40,"max":50} | {"min":240,"max":300} | each1s while too far apart, 12s tether, every28s | 1.2 | none at damage callsite | src/sim/encounters/sunken_bastion/ossick.ts |  |
| Gaoler Ossick | Drowning Pit | {"targetMaxHpFraction":0.6} | {"targetMaxHpFraction":0.8} | failed anchor rescue, every24s | 1.8 | none at damage callsite | src/sim/encounters/sunken_bastion/ossick.ts | Dragged over8s normal/7s heroic. No mechanic multiplier. |
| Gaol Turnkey | Crushing Irons | {"targetMaxHpFraction":0.3} | {"targetMaxHpFraction":0.45} | after10s failed cage, cage every24s | 1.6 | none at damage callsite | src/sim/encounters/sunken_bastion/turnkey.ts |  |
| Gaol Turnkey | Brine Flood | none | {"targetMaxHpFractionPerTick":"0.02 + 0.01*(second-1)"} | each1s in heroic cage |  | none at damage callsite | src/sim/encounters/sunken_bastion/turnkey.ts | 2%,3%,...,11% over10s if never rescued; no mechanic multiplier. |
| Vael the Fogbinder | Mist Surge | {"min":30,"max":40} | {"min":180,"max":240} | every12s; 8s below25% | 1.5 | none at damage callsite | src/sim/encounters/sunken_bastion/vael.ts |  |
| Vael the Fogbinder | Fogburst | {"min":50,"max":60} | {"min":300,"max":360} | wrong shadow struck during veil at70%/40% |  | none at damage callsite | src/sim/encounters/sunken_bastion/vael.ts |  |
| Vael the Fogbinder | Drowning Hymn | {"perSecond":"8 + 3*floor(veilElapsed/3)"} | {"perSecond":"48 + 18*floor(veilElapsed/3)"} | each1s in 18s veil |  | none at damage callsite | src/sim/encounters/sunken_bastion/vael.ts |  |
| Vael the Fogbinder | Reaping Scythe | {"min":60,"max":70} | {"min":360,"max":420} | every20s, chain of3 |  | none at damage callsite | src/sim/encounters/sunken_bastion/vael_shadowstep.ts |  |
| Vael the Fogbinder | Grave Shadow | none | {"min":108,"max":108} | each1s for6s, heroic only |  | none at damage callsite | src/sim/encounters/sunken_bastion/vael_shadowstep.ts |  |
| The Turretback Hermit | Claw Sweep | {"min":90,"max":110} | {"min":720,"max":880} | every12s | 2 | none at damage callsite | src/sim/content/sunken_bastion.ts (MOBS.turretback_hermit) |  |
| The Turretback Hermit | Shell Slam | {"min":50,"max":60} | {"min":400,"max":480} | every16s | 1.5 | none at damage callsite | src/sim/content/sunken_bastion.ts (MOBS.turretback_hermit) | Withdraw at25% cuts taken damage60% for6s; summons2crawlers at60%/30%. |

## drowned_temple

| Boss | Mechanic | Normal | Heroic | Cadence | Cast | Armor | Source | Notes |
|---|---|---|---|---|---|---|---|---|
| Choirmother Selthe | Moonwater Bolt | {"min":76,"max":118,"coefficient":1.2} | {"min":1632,"max":2550,"coefficient":1.2} | repeated 2s cast +0.5s gap | 2 | none at damage callsite | src/sim/encounters/drowned_temple/selthe.ts | Kickable. She never melees; no mechanic multiplier on weapon roll. |
| Choirmother Selthe | Sea-Song | {"min":35,"max":45} | {"min":158,"max":203} | every10s | 1.5 | none at damage callsite | src/sim/encounters/drowned_temple/selthe.ts |  |
| Choirmother Selthe | Mere Surge | {"min":110,"max":130} | {"min":495,"max":585} | every18s | 3 | none at damage callsite | src/sim/encounters/drowned_temple/selthe.ts |  |
| Choirmother Selthe | Chorus | {"totalSplitAmongCaught":400} | {"totalSplitAmongCaught":1800} | every25s after5s mark |  | none at damage callsite | src/sim/encounters/drowned_temple/selthe.ts | Each target gets round((400/n)*difficultyFactor), before othermodifiers. |
| Choirmother Selthe | Solo | {"min":150,"max":150} | {"min":675,"max":675} | every25s, offset12s, after5s mark |  | none at damage callsite | src/sim/encounters/drowned_temple/selthe.ts |  |
| Choirmother Selthe | Drowning Aria | {"damagePerSecond":[30,40,50,60,70]} | {"damagePerSecond":[135,180,225,270,315]} | every22s, 5s channel | 5 | none at damage callsite | src/sim/encounters/drowned_temple/selthe.ts | Resets ramp when a different body catches beam; kick or loss oflineofsight ends. |
| Choirmother Selthe | Chorus Echo | none | {"min":540,"max":540} | after4s, heroic only |  | none at damage callsite | src/sim/encounters/drowned_temple/selthe.ts |  |
| Choirmother Selthe | Solo Echo | none | {"min":675,"max":675} | after4s, heroic only |  | none at damage callsite | src/sim/encounters/drowned_temple/selthe.ts |  |
| Mere Hydra | Freezing Breath | {"min":110,"max":130} | {"min":660,"max":780} | every12s | 2 | none at damage callsite | src/sim/encounters/drowned_temple/hydra_elements.ts |  |
| Mere Hydra | Venom Spit | {"min":60,"max":75} | {"min":360,"max":450} | every10s, 3 marks, 1.5s warning |  | none at damage callsite | src/sim/encounters/drowned_temple/hydra_elements.ts |  |
| Mere Hydra | Venom pool | {"min":20,"max":20} | {"min":120,"max":120} | each1s for6s |  | none at damage callsite | src/sim/encounters/drowned_temple/hydra_elements.ts |  |
| Mere Hydra | Crushing Torrent | {"min":90,"max":110} | {"min":540,"max":660} | every12s | 2 | none at damage callsite | src/sim/encounters/drowned_temple/hydra_elements.ts |  |
| Mere Hydra | Tsunami | {"min":160,"max":190} | {"min":960,"max":1140} | every40s; heroic backwash after3.5s | 4.5 | none at damage callsite | src/sim/encounters/drowned_temple/hydra_tsunami.ts |  |
| Mere Hydra | Frostlocked Torrent | {"min":90,"max":110} | {"min":540,"max":660} | combined breaths between tsunamis | 2 | none at damage callsite | src/sim/encounters/drowned_temple/hydra_combo.ts |  |
| Mere Hydra | Ice Shards | {"min":60,"max":75} | {"min":360,"max":450} | ice wall destroyed by tsunami |  | none at damage callsite | src/sim/encounters/drowned_temple/hydra_combo.ts |  |
| Mere Hydra | Venom Current | {"min":30,"max":30} | {"min":180,"max":180} | each1s inside sliding current |  | none at damage callsite | src/sim/encounters/drowned_temple/hydra_combo.ts |  |
| Mere Hydra | Toxic Rime | {"min":100,"max":120} | {"min":600,"max":720} | after4s crystals |  | none at damage callsite | src/sim/encounters/drowned_temple/hydra_combo.ts |  |
| Tideglass Colossus | Moonlight Lance | {"min":90,"max":110} | {"min":450,"max":550} | every12s | 2 | none at damage callsite | src/sim/encounters/drowned_temple/tideglass_colossus.ts |  |
| Tideglass Colossus | Resonant Slam | {"min":70,"max":90} | {"min":350,"max":450} | every14s | 1.5 | none at damage callsite | src/sim/encounters/drowned_temple/tideglass_colossus.ts |  |
| Tideglass Colossus | Shattering Glass | none | {"min":400,"max":400} | reflection death, heroic only |  | none at damage callsite | src/sim/encounters/drowned_temple/tideglass_colossus.ts |  |
| Tideglass Colossus | Tideglass Fracture | {"min":120,"max":130} | {"min":600,"max":650} | every32s,3 rounds, 2.5s warning N/2s H | 1.5 | none at damage callsite | src/sim/encounters/drowned_temple/tideglass_fracture.ts |  |
| Ysolei, Avatar of the Drowned Moon | Lunar Tide | {"min":60,"max":80} | {"min":300,"max":400} | every10s | 1.5 | none at damage callsite | src/sim/encounters/drowned_temple/ysolei.ts |  |
| Ysolei, Avatar of the Drowned Moon | Tidal Crash | {"min":250,"max":300} | {"min":1250,"max":1500} | Undertow every25s, 3s pull |  | none at damage callsite | src/sim/encounters/drowned_temple/ysolei.ts |  |
| Ysolei, Avatar of the Drowned Moon | Rising Tide | {"min":45,"max":45} | {"min":225,"max":225} | each1s flooded half; flips every30s below66% |  | none at damage callsite | src/sim/encounters/drowned_temple/ysolei.ts |  |
| Ysolei, Avatar of the Drowned Moon | Riptide | none | {"min":200,"max":200} | each1s for10s after Undertow, heroic only |  | none at damage callsite | src/sim/encounters/drowned_temple/ysolei.ts |  |
| Ysolei, Avatar of the Drowned Moon | Moonlight Tear | {"min":70,"max":85} | {"min":350,"max":425} | 75%/45% bossHP;3tears N/4H | 3 | none at damage callsite | src/sim/encounters/drowned_temple/ysolei_moon.ts | Moonsear existingstacks multiply damage by1+1.5*stacks. Uncaughttear heals boss2% andadds10%output. |
| Ysolei, Avatar of the Drowned Moon | Spilled Moonlight | {"min":30,"max":30} | {"min":150,"max":150} | each1s for8s |  | none at damage callsite | src/sim/encounters/drowned_temple/ysolei_moon.ts |  |
| Ysolei, Avatar of the Drowned Moon | Falling Moon | {"min":300,"max":340} | {"min":1500,"max":1700} | 20%HP if ward notbroken within12sN/10sH | 12 | none at damage callsite | src/sim/encounters/drowned_temple/ysolei_moon.ts | Heroic10scast; ward6%bossmaxHP; successfulbreak5sstun+25%vulnerability. |

## gravewyrm_sanctum

| Boss | Mechanic | Normal | Heroic | Cadence | Cast | Armor | Source | Notes |
|---|---|---|---|---|---|---|---|---|
| Sledge Tusker | Tusk Sweep | {"min":180,"max":220} | {"min":450,"max":550} | every12s | 1.5 | none at damage callsite | src/sim/encounters/gravewyrm_sanctum/sledge_tusker.ts |  |
| Sledge Tusker | Trample | {"min":200,"max":240} | {"min":500,"max":600} | every16s | 2 | none at damage callsite | src/sim/encounters/gravewyrm_sanctum/sledge_tusker.ts |  |
| Sledge Tusker | Spilled Braziers | {"min":36,"max":44} | {"min":90,"max":110} | each1s for10s at50%HP |  | none at damage callsite | src/sim/encounters/gravewyrm_sanctum/sledge_tusker.ts | At20%HP,30%damagebuff affects all output. |
| Korgath the Bound | Maul Arc | {"min":1024,"max":1600,"coefficient":1.3} | {"min":2220,"max":3468,"coefficient":1.3} | every10s after hammer chain breaks | 1.6 | armorReduction(p.stats.armor,boss.level), not effectiveArmorOf/mobArmorReduction | src/sim/encounters/gravewyrm_sanctum/korgath.ts |  |
| Korgath the Bound | Chain Flail | {"min":200,"max":240} | {"min":500,"max":600} | every14s aftertongsbreak | 2 | none at damage callsite | src/sim/encounters/gravewyrm_sanctum/korgath.ts |  |
| Korgath the Bound | Threshold Charge | {"min":180,"max":220} | {"min":450,"max":550} | every18s afteranvilbreak | 2 | none at damage callsite | src/sim/encounters/gravewyrm_sanctum/korgath.ts |  |
| Korgath the Bound | Foreman's Bellow | {"min":100,"max":120} | {"min":250,"max":300} | every20s afterbellowsbreak | 2 | none at damage callsite | src/sim/encounters/gravewyrm_sanctum/korgath.ts |  |
| Korgath the Bound | Strain | {"min":180,"max":220} | {"min":450,"max":550} | every20s; heroic1chainleft every10s | 2 | none at damage callsite | src/sim/encounters/gravewyrm_sanctum/korgath.ts |  |
| Korgath the Bound | Shuddering Stomp | {"min":190,"max":285} | {"min":475,"max":713} | every12s | 1.5 | none at damage callsite | src/sim/encounters/gravewyrm_sanctum/korgath.ts | Melee enragebelow30%:1.5damage,1.3haste; doesnot multiply these scripted min/max. |
| Grand Necromancer Velkhar | Soulfire Trench | {"min":200,"max":240} | {"min":500,"max":600} | every18s | 2 | none at damage callsite | src/sim/encounters/gravewyrm_sanctum/velkhar.ts | Damage on castlanding in meltedzones; persistentstrip itself has no timed damage call. |
| Grand Necromancer Velkhar | Shadow Volley | {"min":90,"max":110} | {"min":225,"max":275} | every12s | 1.5 | none at damage callsite | src/sim/encounters/gravewyrm_sanctum/velkhar.ts |  |
| Grand Necromancer Velkhar | Unquenched Tithe (boss heal) | {"bossMaxHpFraction":0.02} | {"bossMaxHpFraction":0.02} | each unquenchedBonewalker re-rises after4s |  | none at damage callsite | src/sim/encounters/gravewyrm_sanctum/velkhar.ts | Normal raisedat60%HP; heroicfullHP+25%damage. Grasp increases addoutput30% inwater; WarmHands createswater after3sstill. |
| Korzul the Gravewyrm | Grave Breath | {"min":250,"max":300} | {"min":625,"max":750} | every15s;12s lastphase | 2 | none at damage callsite | src/sim/encounters/gravewyrm_sanctum/korzul.ts |  |
| Korzul the Gravewyrm | Tail Sweep | {"min":200,"max":240} | {"min":500,"max":600} | every12s | 1.2 | none at damage callsite | src/sim/encounters/gravewyrm_sanctum/korzul.ts |  |
| Korzul the Gravewyrm | Grave Inferno | {"pulses":[[70,90],[140,180],[210,270],[280,360]],"total":[700,900]} | {"pulses":[[175,225],[350,450],[525,675],[700,900]],"total":[1750,2250]} | every30s +50%HP;4pulses every2s | 8 | none at damage callsite | src/sim/encounters/gravewyrm_sanctum/korzul.ts | Doused if ownplatebreaks; channel has no melee. |
| Korzul the Gravewyrm | Quench-Water | {"min":60,"max":60} | {"min":150,"max":150} | each1s onbrokenplate |  | none at damage callsite | src/sim/encounters/gravewyrm_sanctum/korzul.ts | Actual codeuses60*mechanicMult=>N60/H150; quenchPerSecondHeroic150constantunused. |
| Korzul the Gravewyrm | Plunging Fire | {"min":300,"max":350} | {"min":750,"max":875} | during24sflights at70%/40%;3swarning |  | none at damage callsite | src/sim/encounters/gravewyrm_sanctum/korzul.ts |  |
| Korzul the Gravewyrm | Crashing Descent | {"min":250,"max":300} | {"min":625,"max":750} | endofflight;3swarning |  | none at damage callsite | src/sim/encounters/gravewyrm_sanctum/korzul.ts |  |

## wildheart_basin

| Boss | Mechanic | Normal | Heroic | Cadence | Cast | Armor | Source | Notes |
|---|---|---|---|---|---|---|---|---|
| Great Saurian | Tail Swipe | {"min":180,"max":220} | {"min":450,"max":550} | every12s | 1 | none at damage callsite | src/sim/encounters/wildheart_basin/great_saurian.ts |  |
| Great Saurian | Earthshaking Stomp | {"min":160,"max":200} | {"min":400,"max":500} | every16s | 2 | none at damage callsite | src/sim/encounters/wildheart_basin/great_saurian.ts | 20%HPenrageadds30%alloutput;50%HPspawnsHowdahHexcaller. |
| Fanglord Beastmaster | Beast Pit Quake | {"min":180,"max":220} | {"min":450,"max":550} | every13s | 1.5 | none at damage callsite | src/sim/encounters/wildheart_basin/beastmaster.ts | PackBondadds20%output and50%DR whilepairwithin15ydN/20ydH. |
| Fanglord's Great Jaguar | Jaguar Bite | {"min":120,"max":150} | {"min":300,"max":375} | every2s during10s fixate |  | none at damage callsite | src/sim/encounters/wildheart_basin/beastmaster.ts | Jaguar ordinaryautos suppressed by swingTimer>=0.5 in stepStalk; this scriptedbite isactual attack. |
| Fanglord's Great Jaguar | Rending Bite | {"min":20,"max":20} | {"min":50,"max":50} | each2s for6s |  | none at damage callsite | src/sim/encounters/wildheart_basin/beastmaster.ts | 20damage N/50H per2stick; bleedarmorignored; sourcebuffsandbleedvulnerability mayraise. |
| The Gorgebloom | Vine Lash | {"min":180,"max":220} | {"min":450,"max":550} | every10s | 1.5 | none at damage callsite | src/sim/encounters/wildheart_basin/gorgebloom.ts |  |
| The Gorgebloom | Gorge | {"min":1062,"max":1658,"coefficient":2} | {"min":3100,"max":4846,"coefficient":2} | every15s | 1.5 | heavySwing -> mobArmorReduction | src/sim/encounters/wildheart_basin/gorgebloom.ts |  |
| The Gorgebloom | Digesting | {"min":40,"max":40} | {"min":100,"max":100} | each1s for6s |  | none at damage callsite | src/sim/encounters/wildheart_basin/gorgebloom.ts |  |
| The Gorgebloom | Bloom Spit | {"min":140,"max":170} | {"min":350,"max":425} | every2s aftertargetoutofreach1.5s |  | none at damage callsite | src/sim/encounters/wildheart_basin/gorgebloom.ts |  |
| Zulgar, Voice of the Basin | Wildheart Pulse | {"min":170,"max":243} | {"min":425,"max":608} | every12s | 1.5 | none at damage callsite | src/sim/encounters/wildheart_basin/zulgar.ts |  |
| Zulgar, Voice of the Basin | Mauled | {"min":500,"max":500} | {"min":1250,"max":1250} | caughtduring20shunts at70%/40%HP |  | none at damage callsite | src/sim/encounters/wildheart_basin/zulgar.ts | 1spauseaftercatch;5sPreyrespite; normal500/H1250 beforemods. |
| Zulgar, Voice of the Basin | Ambush | none | {"min":625,"max":750} | heroichunt;1.5s floorwarning |  | none at damage callsite | src/sim/encounters/wildheart_basin/zulgar.ts |  |

## Boss maxHP checks

- rimeweb: Frozen Embrace release damage, normal 240, heroic 1103. src/sim/encounters/hollow_crypt/lady_embrace.ts. 
- morthen: Gorged soul bossheal, normal 204, heroic 865. src/sim/encounters/hollow_crypt/morthen_gravecall.ts. 
- vael_the_mistcaller: Fog Veil break damage, normal 600, heroic 1723. src/sim/encounters/sunken_bastion/vael.ts. 
- tideglass_colossus: Reflection maxHP, normal 920, heroic 1840. src/sim/encounters/drowned_temple/tideglass_colossus.ts. One reflection perpresentplayer on75%/50%/25% flare; ownercannotdamage ownreflection.
- ysolei: Plenilune Ward absorb, normal 1080, heroic 2070. src/sim/encounters/drowned_temple/ysolei_moon.ts. 
- ysolei: Moonswell missedtear bossheal, normal 360, heroic 690. src/sim/encounters/drowned_temple/ysolei_moon.ts. 
- grand_necromancer_velkhar: Unquenched Tithe heal, normal 300, heroic 460. src/sim/encounters/gravewyrm_sanctum/velkhar.ts. 
- wildheart_beastmaster: Thickhide Ward absorb, normal 600, heroic 900. src/sim/encounters/wildheart_basin/beastmaster.ts. Explicit authored difficulty amounts; nohealth multiplier.

## Limits

- Nominal every/cast values are not guaranteed observed cast intervals: clocks, overlappingbars, movement, immunity and encounterphase scheduling delay or suppress casts.
- Spell mechanics carry no player spell-power coefficient; their damage uses fixed tuning or the transformed bossweapon.
- Add waves and trash damage are separate sources and are not fully enumerated here.
- Hydra rows group the three heads: Freezing Breath is the left head, Venom Spit the center, Crushing Torrent the right; factors and nominal health are equal.
- Any missed soul, moontear, bond, enrage, vulnerability or stacking mechanic changes output; listed ranges are unstacked baseline.
- Candle drain occurs at channel ages0.5,1.5,2.5,3.5 seconds, not only on integer age.
- No parse provenance inferred here: root compares live service/version/gear/context separately.
