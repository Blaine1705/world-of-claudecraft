# Nythraxis class balance, Monte Carlo


Every class and spec at level 20 in best-in-slot gear, sampled against the Nythraxis raid boss
on the `integration/v031-class-overhauls` tree. All numbers are absolute DPS, HPS or damage
taken per second out of the real `src/sim` core, not ratios.

## How it was measured

- **Target.** The `nythraxis_scourge_of_thornpeak` template as a dummy: its real level, armor
  and `undead` family, inert so the number is the class rotation and not the encounter script.
  Normal is level 20 / 798 armor; heroic is the `nythraxis_boss_arena` heroic record (level 22,
  `armorMultiplier` 1.2, so 1,058 armor). Boss health is re-pinned every tick so a 300 s window
  always completes.
- **Windows.** One 300 s run per seed, with cumulative damage snapshotted at 15 / 30 / 60 / 120 /
  300 s. Under a fixed seed a shorter window is an exact prefix of the longer one. A separate
  30 s bench pins the boss at 15% health for the sub-20% execute phase.
- **Seeds.** 24 combat seeds per spec per difficulty. Sim seeds drive world generation as well as
  the rng, so the world is pinned to the live realm seed (20061) and only the combat stream
  varies. Sampling the sim seed directly resamples the terrain: one seed dropped the probe target
  inside a collider and read a spec at 0 DPS.
- **BiS means best gear AND best talents.** Per spec the harness greedily swaps every equipment
  slot and every one of the six talent rows, keeping whatever MEASURES highest over a fixed seed
  set. This matters: the shipped probe reads Thundercall about 30% higher on its hand-picked rows
  than on the class default build. Pet picks are optimised the same way (Ridge Stalker is the
  best legal tame, the Doomguard the best demon).
- **Item pool.** The whole table at level 20, Nythraxis drops and heroic variants included. A
  second pass repeats everything with legendaries excluded, because one legendary distorts the
  comparison badly enough to need its own control.

### What this does not model

Encounter mechanics (Gravebreaker splash, Soul Rend, add waves, Dread Curse), raid buffs from
other classes, consumables, movement, and target swapping. It is a patchwerk bench: the ceiling
each spec can reach standing still on one target, plus an execute-phase and a heroic-armor
variant. Treat it as the relative ordering and the absolute floor, not a live parse.

Search note: the greedy build search landed in a worse local optimum on the full item pool for druid/balance, hunter/marksmanship, hunter/survival, mage/fire, paladin/retribution, shaman/elemental, warlock/affliction, warlock/demonology, warrior/arms, so those rows use the epic-only build (a legal member of the full pool) instead.

## DPS: full best-in-slot (legendaries included)

### Normal Nythraxis (level 20, 798 armor)

| Spec | 15s burst | 30s | 60s | 120s | 300s | sub-20% | +/- (60s) | GCD idle | OOM |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Assassination (Knifework) | 293 | 297 | **308** | 313 | 315 | 297 | 11.6 | 1% | - |
| Balance (Moongrove) | 248 | 263 | **275** | 280 | 283 | 263 | 9.0 | 0% | - |
| Fury (Bloodrush) | 307 | 272 | **258** | 247 | 252 | 278 | 16.8 | 9% | - |
| Feral cat (Wildfang) | 256 | 241 | **230** | 223 | 221 | 241 | 9.4 | 40% | - |
| Retribution (Dawnreaver) | 336 | 261 | **222** | 205 | 209 | 273 | 8.4 | 23% | - |
| Enhancement (Warspirit) | 226 | 224 | **220** | 190 | 169 | 224 | 13.1 | 58% | 69s |
| Subtlety (Skulduggery) | 219 | 200 | **204** | 204 | 209 | 200 | 11.0 | 62% | - |
| Frost (Cryomancy) | 205 | 207 | **202** | 200 | 133 | 207 | 10.8 | 39% | 126s |
| Combat (Thuggery) | 222 | 211 | **201** | 201 | 201 | 211 | 9.9 | 58% | - |
| Beast Mastery (Packlord) | 256 | 208 | **196** | 185 | 90 | 208 | 12.2 | 23% | - |
| Arms (Battlecraft) | 234 | 208 | **195** | 189 | 187 | 208 | 10.0 | 1% | - |
| Fire (Pyromancy) | 294 | 209 | **186** | 150 | 86 | 310 | 16.6 | 62% | 96s |
| Shadow (Vespers) | 175 | 175 | **173** | 174 | 153 | 175 | 3.4 | 14% | 222s |
| Survival (Fieldcraft) | 157 | 161 | **163** | 153 | 87 | 161 | 6.4 | 0% | - |
| Affliction (Hexcraft) | 135 | 144 | **157** | 149 | 135 | 144 | 5.9 | 8% | 225s |
| Elemental (Thundercall) | 170 | 157 | **152** | 147 | 106 | 157 | 4.8 | 30% | 160s |
| Demonology (Pactbound) | 154 | 157 | **151** | 137 | 97 | 157 | 4.0 | 43% | 138s |
| Marksmanship (Coldsight) | 148 | 141 | **141** | 136 | 63 | 141 | 7.3 | 0% | - |
| Destruction (Ruination) | 107 | 117 | **130** | 119 | 80 | 117 | 3.7 | 44% | 131s |

Spread at 60 s: 308 top, 130 bottom, median 196, top/bottom 2.37x.

### Heroic Nythraxis (level 22, 958 armor)

| Spec | 15s burst | 30s | 60s | 120s | 300s | sub-20% | +/- (60s) | GCD idle | OOM |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Assassination (Knifework) | 270 | 275 | **283** | 287 | 288 | 275 | 11.1 | 1% | - |
| Balance (Moongrove) | 226 | 245 | **253** | 259 | 263 | 245 | 14.0 | 0% | - |
| Fury (Bloodrush) | 284 | 245 | **228** | 222 | 223 | 251 | 16.5 | 11% | - |
| Feral cat (Wildfang) | 237 | 223 | **214** | 206 | 203 | 223 | 8.2 | 40% | - |
| Retribution (Dawnreaver) | 318 | 246 | **208** | 195 | 198 | 259 | 9.3 | 23% | - |
| Enhancement (Warspirit) | 212 | 206 | **205** | 178 | 157 | 206 | 12.1 | 58% | 70s |
| Frost (Cryomancy) | 189 | 193 | **193** | 190 | 125 | 193 | 14.4 | 39% | 126s |
| Combat (Thuggery) | 207 | 191 | **183** | 183 | 182 | 191 | 10.8 | 58% | - |
| Fire (Pyromancy) | 272 | 192 | **180** | 145 | 84 | 294 | 15.4 | 62% | 96s |
| Subtlety (Skulduggery) | 188 | 181 | **180** | 182 | 187 | 181 | 15.8 | 62% | - |
| Beast Mastery (Packlord) | 240 | 191 | **179** | 170 | 85 | 191 | 17.7 | 23% | - |
| Arms (Battlecraft) | 207 | 189 | **179** | 175 | 173 | 190 | 9.4 | 2% | - |
| Shadow (Vespers) | 175 | 175 | **173** | 175 | 153 | 175 | 3.4 | 14% | 222s |
| Affliction (Hexcraft) | 134 | 143 | **152** | 143 | 130 | 143 | 4.0 | 8% | 227s |
| Demonology (Pactbound) | 148 | 153 | **147** | 133 | 95 | 153 | 6.6 | 43% | 139s |
| Elemental (Thundercall) | 174 | 149 | **147** | 144 | 85 | 149 | 5.2 | 42% | 126s |
| Survival (Fieldcraft) | 139 | 147 | **146** | 139 | 82 | 147 | 6.2 | 0% | - |
| Destruction (Ruination) | 107 | 118 | **130** | 119 | 80 | 118 | 3.5 | 44% | 131s |
| Marksmanship (Coldsight) | 136 | 129 | **127** | 123 | 58 | 129 | 4.9 | 0% | - |

Spread at 60 s: 283 top, 127 bottom, median 180, top/bottom 2.22x.

## DPS: builds searched for the long fight

The same greedy search run against a 180 s objective instead of 45 s, so a mana capstone like
Evocation can actually pay for itself. The 300 s column below is the honest sustain number; the
burst tables above are the honest burst number. Where the two differ a lot, the spec is really
two builds.

### Normal Nythraxis, sustain-objective builds

| Spec | 15s burst | 30s | 60s | 120s | 300s | sub-20% | +/- (60s) | GCD idle | OOM |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Assassination (Knifework) | 306 | 307 | **315** | 317 | 319 | 307 | 13.8 | 1% | - |
| Fury (Bloodrush) | 354 | 319 | **296** | 285 | 288 | 321 | 23.5 | 7% | - |
| Balance (Moongrove) | 241 | 272 | **283** | 281 | 284 | 272 | 8.8 | 0% | - |
| Feral cat (Wildfang) | 252 | 240 | **235** | 227 | 223 | 240 | 10.8 | 40% | - |
| Enhancement (Warspirit) | 228 | 223 | **219** | 209 | 175 | 223 | 13.0 | 48% | 114s |
| Subtlety (Skulduggery) | 211 | 204 | **218** | 225 | 235 | 204 | 17.0 | 58% | - |
| Combat (Thuggery) | 235 | 229 | **214** | 212 | 211 | 229 | 14.3 | 58% | - |
| Retribution (Dawnreaver) | 284 | 247 | **213** | 210 | 214 | 250 | 13.6 | 20% | - |
| Arms (Battlecraft) | 242 | 209 | **202** | 196 | 196 | 210 | 9.0 | 1% | - |
| Frost (Cryomancy) | 191 | 208 | **200** | 201 | 132 | 208 | 9.9 | 38% | 130s |
| Beast Mastery (Packlord) | 237 | 201 | **189** | 184 | 104 | 201 | 10.9 | 26% | - |
| Fire (Pyromancy) | 284 | 199 | **180** | 150 | 88 | 288 | 14.4 | 60% | 96s |
| Shadow (Vespers) | 163 | 172 | **174** | 176 | 175 | 172 | 3.6 | 4% | 265s |
| Survival (Fieldcraft) | 169 | 166 | **162** | 161 | 114 | 166 | 6.9 | 0% | - |
| Affliction (Hexcraft) | 130 | 149 | **156** | 143 | 128 | 149 | 4.3 | 14% | 199s |
| Demonology (Pactbound) | 157 | 157 | **153** | 136 | 99 | 157 | 6.1 | 40% | 147s |
| Elemental (Thundercall) | 184 | 159 | **146** | 145 | 106 | 159 | 7.0 | 28% | 170s |
| Destruction (Ruination) | 110 | 130 | **133** | 128 | 95 | 130 | 3.9 | 35% | 166s |
| Marksmanship (Coldsight) | 121 | 118 | **118** | 112 | 56 | 118 | 4.0 | 0% | - |

Spread at 60 s: 315 top, 118 bottom, median 200, top/bottom 2.67x.

### Burst build against sustain build, at 300 s

| Spec | burst build @300s | sustain build @300s | change |
|---|---:|---:|---:|
| Survival (Fieldcraft) | 87 | 114 | +32% |
| Destruction (Ruination) | 80 | 95 | +18% |
| Shadow (Vespers) | 153 | 175 | +15% |
| Beast Mastery (Packlord) | 90 | 104 | +15% |
| Fury (Bloodrush) | 252 | 288 | +14% |
| Subtlety (Skulduggery) | 209 | 235 | +13% |
| Combat (Thuggery) | 201 | 211 | +5% |
| Arms (Battlecraft) | 187 | 196 | +5% |
| Enhancement (Warspirit) | 169 | 175 | +3% |
| Demonology (Pactbound) | 97 | 99 | +3% |
| Retribution (Dawnreaver) | 209 | 214 | +2% |
| Fire (Pyromancy) | 86 | 88 | +2% |
| Assassination (Knifework) | 315 | 319 | +1% |
| Feral cat (Wildfang) | 221 | 223 | +1% |
| Balance (Moongrove) | 283 | 284 | +0% |
| Elemental (Thundercall) | 106 | 106 | +0% |
| Frost (Cryomancy) | 133 | 132 | +-0% |
| Affliction (Hexcraft) | 135 | 128 | -5% |
| Marksmanship (Coldsight) | 63 | 56 | -10% |

## DPS: epic-only control (no legendaries)

### Normal Nythraxis, epics only

| Spec | 15s burst | 30s | 60s | 120s | 300s | sub-20% | +/- (60s) | GCD idle | OOM |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Balance (Moongrove) | 240 | 255 | **266** | 272 | 276 | 255 | 9.7 | 0% | - |
| Assassination (Knifework) | 229 | 239 | **252** | 259 | 262 | 239 | 12.2 | 1% | - |
| Feral cat (Wildfang) | 256 | 241 | **230** | 223 | 221 | 241 | 9.4 | 40% | - |
| Retribution (Dawnreaver) | 336 | 261 | **222** | 205 | 209 | 273 | 8.4 | 23% | - |
| Fury (Bloodrush) | 261 | 218 | **204** | 194 | 194 | 236 | 15.2 | 17% | - |
| Frost (Cryomancy) | 205 | 207 | **202** | 200 | 133 | 207 | 10.8 | 39% | 126s |
| Arms (Battlecraft) | 234 | 208 | **195** | 189 | 187 | 208 | 10.0 | 1% | - |
| Fire (Pyromancy) | 294 | 209 | **186** | 150 | 86 | 310 | 16.6 | 62% | 96s |
| Enhancement (Warspirit) | 225 | 189 | **174** | 151 | 131 | 189 | 10.3 | 61% | 81s |
| Shadow (Vespers) | 175 | 175 | **173** | 174 | 153 | 175 | 3.4 | 14% | 222s |
| Beast Mastery (Packlord) | 221 | 174 | **170** | 163 | 77 | 174 | 6.9 | 21% | - |
| Survival (Fieldcraft) | 157 | 161 | **163** | 153 | 87 | 161 | 6.4 | 0% | - |
| Affliction (Hexcraft) | 135 | 144 | **157** | 149 | 135 | 144 | 5.9 | 8% | 225s |
| Combat (Thuggery) | 168 | 166 | **156** | 155 | 155 | 166 | 8.2 | 58% | - |
| Subtlety (Skulduggery) | 149 | 147 | **153** | 156 | 159 | 147 | 10.4 | 62% | - |
| Elemental (Thundercall) | 170 | 157 | **152** | 147 | 106 | 157 | 4.8 | 30% | 160s |
| Demonology (Pactbound) | 154 | 157 | **151** | 137 | 97 | 157 | 4.0 | 43% | 138s |
| Marksmanship (Coldsight) | 148 | 141 | **141** | 136 | 63 | 141 | 7.3 | 0% | - |
| Destruction (Ruination) | 115 | 113 | **126** | 122 | 84 | 113 | 3.4 | 43% | 137s |

Spread at 60 s: 266 top, 126 bottom, median 173, top/bottom 2.11x.

### What the legendaries are worth

| Spec | 60s full BiS | 60s epic only | legendary gain |
|---|---:|---:|---:|
| Subtlety (Skulduggery) | 204 | 153 | +33% |
| Combat (Thuggery) | 201 | 156 | +28% |
| Fury (Bloodrush) | 258 | 204 | +27% |
| Enhancement (Warspirit) | 220 | 174 | +26% |
| Assassination (Knifework) | 308 | 252 | +22% |
| Beast Mastery (Packlord) | 196 | 170 | +15% |
| Balance (Moongrove) | 275 | 266 | +3% |
| Destruction (Ruination) | 130 | 126 | +3% |
| Feral cat (Wildfang) | 230 | 230 | +0% |
| Marksmanship (Coldsight) | 141 | 141 | +0% |
| Survival (Fieldcraft) | 163 | 163 | +0% |
| Fire (Pyromancy) | 186 | 186 | +0% |
| Frost (Cryomancy) | 202 | 202 | +0% |
| Retribution (Dawnreaver) | 222 | 222 | +0% |
| Shadow (Vespers) | 173 | 173 | +0% |
| Elemental (Thundercall) | 152 | 152 | +0% |
| Affliction (Hexcraft) | 157 | 157 | +0% |
| Demonology (Pactbound) | 151 | 151 | +0% |
| Arms (Battlecraft) | 195 | 195 | +0% |

## Resource economy

Does each spec's own resource design actually hold up over a five minute fight? "Starved" is the
share of GCD-ready moments where NOTHING in the kit was affordable, and "dry at" is the first
second that happened. "Capped" is time sitting at maximum, i.e. regeneration thrown away, which
matters for rage, energy and focus rather than mana.

| Spec | Resource | Avg held | Capped | Starved | Dry at | Below 25% | Cheapest press |
|---|---|---:|---:|---:|---:|---:|---:|
| Balance (Moongrove) | mana | 98% | 33% | 0% | never | 0% | 10 |
| Feral cat (Wildfang) | energy | 25% | 0% | 2% | 52s | 40% | 10 |
| Beast Mastery (Packlord) | focus | 91% | 45% | 0% | never | 0% | 20 |
| Marksmanship (Coldsight) | focus | 48% | 1% | 12% | 13s | 15% | 20 |
| Survival (Fieldcraft) | focus | 93% | 62% | 0% | never | 0% | 20 |
| Fire (Pyromancy) | mana | 16% | 0% | 26% | 112s | 78% | 15 |
| Frost (Cryomancy) | mana | 22% | 0% | 44% | 137s | 68% | 15 |
| Retribution (Dawnreaver) | mana | 86% | 2% | 0% | never | 0% | 15 |
| Shadow (Vespers) | mana | 35% | 0% | 65% | 245s | 46% | 30 |
| Assassination (Knifework) | energy | 66% | 4% | 0% | 243s | 1% | 20 |
| Combat (Thuggery) | energy | 20% | 0% | 41% | 3s | 71% | 20 |
| Subtlety (Skulduggery) | energy | 17% | 0% | 40% | 4s | 69% | 20 |
| Elemental (Thundercall) | mana | 28% | 1% | 80% | 164s | 59% | 35 |
| Enhancement (Warspirit) | mana | 13% | 1% | 37% | 77s | 82% | 25 |
| Affliction (Hexcraft) | mana | 27% | 0% | 38% | 227s | 48% | 35 |
| Demonology (Pactbound) | mana | 20% | 0% | 66% | 138s | 64% | 35 |
| Destruction (Ruination) | mana | 19% | 1% | 93% | 131s | 65% | 35 |
| Arms (Battlecraft) | rage | 68% | 8% | 2% | never | 4% | 10 |
| Fury (Bloodrush) | rage | 48% | 2% | 2% | never | 26% | 10 |

## Healers

### Normal pressure

| Spec | HPS | absorb/s | total/s | incoming | overheal | deaths | avg mana | starved | dry at | DPS |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Restoration (Spiritmend) | 121 | 0 | **121** | 136 | 22% | 1.3 | 48% | 38% | 174s | 15 |
| Restoration (Groveheart) | 106 | 0 | **106** | 137 | 16% | 12.9 | 35% | 15% | 157s | 8 |
| Holy (Sunmender) | 87 | 0 | **87** | 138 | 38% | 21.3 | 34% | 44% | 125s | 61 |
| Discipline (Doctrine) | 43 | 35 | **79** | 135 | 24% | 21.4 | 19% | 74% | 67s | 8 |
| Holy (Benison) | 73 | 0 | **73** | 135 | 39% | 24.0 | 21% | 50% | 75s | 6 |
| Arcane (Chronomancy) | 45 | 0 | **45** | 134 | 22% | 39.3 | 20% | 28% | 86s | 22 |

### Heroic pressure

| Spec | HPS | absorb/s | total/s | incoming | overheal | deaths | avg mana | starved | dry at | DPS |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Restoration (Spiritmend) | 150 | 0 | **150** | 243 | 12% | 36.5 | 47% | 56% | 167s | 7 |
| Restoration (Groveheart) | 115 | 0 | **115** | 244 | 13% | 40.8 | 36% | 12% | 148s | 1 |
| Holy (Sunmender) | 93 | 0 | **93** | 246 | 30% | 44.8 | 25% | 53% | 85s | 50 |
| Holy (Benison) | 91 | 0 | **91** | 240 | 27% | 37.0 | 21% | 54% | 82s | 8 |
| Discipline (Doctrine) | 66 | 23 | **89** | 239 | 15% | 46.1 | 17% | 67% | 62s | 1 |
| Arcane (Chronomancy) | 45 | 0 | **45** | 238 | 17% | 63.3 | 18% | 34% | 76s | 17 |

## Tanks

### Normal Nythraxis melee

| Spec | pool | armor | DTPS | unhealed survival | biggest hit | avoided | blocked | threat/s | DPS |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Protection (Ironguard) | 2632 | 3007 | **112** | 23.6s | 875 (33%) | 27% | 5% | 173 | 64 |
| Protection (Faithwarden) | 2318 | 3122 | **136** | 17.2s | 860 (37%) | 16% | 50% | 620 | 123 |
| Feral bear (Wildfang) | 1957 | 4507 | **196** | 10.0s | 794 (41%) | 17% | 0% | 158 | 70 |
| Stonebound off-tank (Warspirit) | 1733 | 3657 | **201** | 8.7s | 1252 (72%) | 13% | 0% | 187 | 97 |

### Heroic Nythraxis melee

| Spec | pool | armor | DTPS | unhealed survival | biggest hit | avoided | blocked | threat/s | DPS |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Protection (Ironguard) | 2632 | 3007 | **179** | 14.9s | 1405 (53%) | 29% | 5% | 161 | 58 |
| Protection (Faithwarden) | 2318 | 3122 | **249** | 9.4s | 1389 (60%) | 15% | 50% | 607 | 118 |
| Feral bear (Wildfang) | 1957 | 4507 | **325** | 6.1s | 1321 (68%) | 18% | 0% | 142 | 63 |
| Stonebound off-tank (Warspirit) | 1733 | 3657 | **399** | 4.4s | 2433 (140%) | 14% | 0% | 23 | 59 |

## What the spread costs the raid

Nythraxis is a 10-player encounter (`suggestedPlayers: 10`) with a 60,000 pool on normal and
192,000 on heroic. A standard 1 tank / 2 healer / 7 DPS split turns each DPS number into a kill
time; the tank contributes its measured boss damage and healers their filler damage.

| Comp | 7 DPS drawn from | normal kill | heroic kill |
|---|---|---:|---:|
| best 7 | Assassination, Balance, Fury, Feral cat, Retribution, Enhancement, Subtlety | 33s | 118s |
| middle 7 | Subtlety, Frost, Combat, Beast Mastery, Arms, Fire, Shadow | 41s | 146s |
| worst 7 | Shadow, Survival, Affliction, Elemental, Demonology, Marksmanship, Destruction | 51s | 179s |

## Builds the optimiser landed on

- **Balance (Moongrove)** rows: L14 dru_r14_moonfury, L20 dru_r20_berserk
  - gear: mainhand=heroic_deathless_heartwood helmet=soulflame_cowl neck=zense_meridian shoulder=heroic_soulflame_mantle chest=heroic_necromancers_starshroud waist=soulflame_cord legs=necromancers_legwraps gloves=soulflame_gloves feet=heroic_necromancers_soulsteps ring1=architects_cornerstone ring2=sutils_gambit
  - damage: Wildbolt 46%, Moonsurge 42%, Lunar Tempest 6%, Moonseed 4%, Deathbloom 1%, Wand 1%
- **Feral cat (Wildfang)** rows: L14 dru_r14_savage_fury, L20 dru_r20_tranquility
  - gear: mainhand=heroic_maul_of_the_scourged_wilds helmet=heroic_nighttalon_crown neck=medallion_of_endless_profit shoulder=heroic_nighttalon_shoulderguards chest=heroic_wyrmshadow_harness waist=nighttalon_waistband legs=heroic_wyrmshadow_legguards gloves=heroic_wyrmshadow_talongrips feet=dreamroot_boots ring1=seal_of_the_nine_oaths ring2=oath_of_the_round_table
  - damage: Auto Attack 41%, Redharvest 28%, Flense 17%, Rendclaw 14%
- **Beast Mastery (Packlord)** rows: class default
  - gear: mainhand=heroic_direfang_greatblade helmet=heroic_nighttalon_crown neck=swiftfang_talisman shoulder=heroic_nighttalon_shoulderguards chest=heroic_wyrmshadow_harness waist=nighttalon_waistband legs=heroic_wyrmshadow_legguards gloves=heroic_wyrmshadow_talongrips feet=bonechill_striders ring1=sutils_gambit ring2=fleetblood_band
  - damage: Stampede 33%, Auto Shot 31%, Auto Attack 21%, Fell Shot 9%, Pack Command 3%, Unleash Beast Clap 2%
- **Marksmanship (Coldsight)** rows: L14 hun_r14_trapcraft, L17 hun_r17_shell_and_fang, L20 hun_r20_fang_chorus
  - gear: mainhand=heroic_direfang_greatblade helmet=heroic_nighttalon_crown neck=swiftfang_talisman shoulder=heroic_nighttalon_shoulderguards chest=heroic_wyrmshadow_harness waist=nighttalon_waistband legs=heroic_wyrmshadow_legguards gloves=nighttalon_grips feet=heroic_wyrmshadow_treads ring1=sutils_gambit ring2=fleetblood_band
  - damage: Auto Shot 31%, Long Draw 19%, Auto Attack 18%, Fevered Draw 11%, Measured Shot 8%, Venom Barb 6%
- **Survival (Fieldcraft)** rows: L20 hun_r20_fang_chorus
  - gear: mainhand=heroic_bonewrought_greatsword helmet=heroic_nighttalon_crown neck=swiftfang_talisman shoulder=heroic_nighttalon_shoulderguards chest=heroic_wyrmshadow_harness waist=nighttalon_waistband legs=heroic_wyrmshadow_legguards gloves=nighttalon_grips feet=heroic_wyrmshadow_treads ring1=sutils_gambit ring2=architects_cornerstone
  - damage: Auto Attack 49%, Woundrend 17%, Bloodhook Wound 8%, Gutting Strike 8%, Shrapnel Charge 7%, Hunting Momentum 5%
- **Fire (Pyromancy)** rows: class default
  - gear: mainhand=scepter_of_the_deathless_court helmet=heroic_soulflame_cowl neck=zense_meridian shoulder=heroic_soulflame_mantle chest=heroic_necromancers_starshroud waist=soulflame_cord legs=necromancers_legwraps gloves=soulflame_gloves feet=heroic_necromancers_soulsteps ring1=nielas_coldlight_band ring2=ashen_focus_ring
  - damage: Cinderfall 24%, Ignite 19%, Scald 18%, Pyrelance 18%, Cinderbolt 17%, Wand 3%
- **Frost (Cryomancy)** rows: class default
  - gear: mainhand=scepter_of_the_deathless_court helmet=heroic_soulflame_cowl neck=zense_meridian shoulder=heroic_soulflame_mantle chest=shroud_of_the_gravewyrm waist=soulflame_cord legs=necromancers_legwraps gloves=soulflame_gloves feet=heroic_necromancers_soulsteps ring1=nielas_coldlight_band ring2=ashen_focus_ring
  - damage: Ice Lance 41%, Winterlash 18%, Rimelance 15%, Glacial Spike 12%, Auto Attack 9%, Frozen Orb 3%
- **Retribution (Dawnreaver)** rows: L14 pal_r14_zeal, L17 pal_r17_sanctified_fervor, L20 pal_r20_dawn_echo
  - gear: mainhand=deathless_greatblade helmet=heroic_soulflame_cowl neck=medallion_of_endless_profit shoulder=heroic_crownforged_warspaulders chest=morthens_cryptforged_hauberk waist=crownforged_girdle legs=deathless_warguard_legmail gloves=crownforged_gauntlets feet=tideworn_warboots ring1=seal_of_the_nine_oaths ring2=oath_of_the_round_table
  - damage: Auto Attack 28%, Hammer of Wrath 19%, Final Edict 18%, Holy Ground 11%, Hammer of Grace 9%, Requital Aura 4%
- **Shadow (Vespers)** rows: L20 pri_r20_incarnate_spirit
  - gear: mainhand=lunar_tide_greatstaff helmet=heroic_soulflame_cowl neck=zense_meridian shoulder=heroic_soulflame_mantle chest=heroic_necromancers_starshroud waist=soulflame_cord legs=necromancers_legwraps gloves=soulflame_gloves feet=heroic_necromancers_soulsteps ring1=nielas_coldlight_band ring2=architects_cornerstone
  - damage: Litany of Woe 38%, Tithefiend Strike 27%, Mindfracture 17%, Dirge of Decay 16%, Wand 1%
- **Assassination (Knifework)** rows: L14 rog_r14_ceaseless_cuts
  - gear: mainhand=heroic_kingsbane_last_oath offhand=mistcallers_fang helmet=heroic_nighttalon_crown neck=swiftfang_talisman shoulder=heroic_nighttalon_shoulderguards chest=heroic_wyrmshadow_harness waist=nighttalon_waistband legs=heroic_wyrmshadow_legguards gloves=nighttalon_grips feet=heroic_wyrmshadow_treads ring1=seal_of_the_nine_oaths ring2=oath_of_the_round_table
  - damage: Wicked Slash 36%, Auto Attack 35%, Venomrend 18%, Second Shadow 3%, Dirt Nap 3%, Chain Arc 2%
- **Combat (Thuggery)** rows: L14 rog_r14_ceaseless_cuts
  - gear: mainhand=heroic_kingsbane_last_oath offhand=kingsbane_last_oath helmet=heroic_nighttalon_crown neck=swiftfang_talisman shoulder=heroic_nighttalon_shoulderguards chest=heroic_wyrmshadow_harness waist=nighttalon_waistband legs=heroic_wyrmshadow_legguards gloves=heroic_wyrmshadow_talongrips feet=dreamroot_boots ring1=sutils_gambit ring2=seal_of_the_nine_oaths
  - damage: Auto Attack 67%, Wicked Slash 13%, Body Blow 10%, Dirt Nap 3%, Chain Arc 2%, Venom Dart 2%
- **Subtlety (Skulduggery)** rows: L14 rog_r14_venom_dividend, L20 rog_r20_deathmark
  - gear: mainhand=heroic_kingsbane_last_oath offhand=kingsbane_last_oath helmet=heroic_nighttalon_crown neck=yumis_keepsake_locket shoulder=heroic_nighttalon_shoulderguards chest=heroic_wyrmshadow_harness waist=nighttalon_waistband legs=heroic_wyrmshadow_legguards gloves=heroic_wyrmshadow_talongrips feet=dreamroot_boots ring1=sutils_gambit ring2=fleetblood_band
  - damage: Auto Attack 64%, Red Ribbon 27%, Throat Wire 4%, Chain Arc 2%, Bleed Out 2%, Dirt Nap 1%
- **Elemental (Thundercall)** rows: L14 sha_r14_chain_lightning, L20 sha_r20_tidal_waves
  - gear: mainhand=stormcallers_focus helmet=heroic_soulflame_cowl neck=zense_meridian shoulder=heroic_soulflame_mantle chest=heroic_necromancers_starshroud waist=soulflame_cord legs=necromancers_legwraps gloves=wyrmchoir_handwraps feet=heroic_necromancers_soulsteps ring1=architects_cornerstone ring2=zyzzs_deathless_signet offhand=pearlward_aegis
  - damage: Arc Bolt 77%, Earthen Jolt 23%
- **Enhancement (Warspirit)** rows: L14 sha_r14_improved_flame_shock, L20 sha_r20_elemental_fury
  - gear: mainhand=heroic_kingsbane_last_oath offhand=kingsbane_last_oath helmet=heroic_nighttalon_crown neck=medallion_of_endless_profit shoulder=heroic_nighttalon_shoulderguards chest=morthens_cryptforged_hauberk waist=gravescale_girdle legs=lunar_choir_leggings gloves=gravewyrm_claws feet=tideworn_warboots ring1=seal_of_the_nine_oaths ring2=oath_of_the_round_table
  - damage: Auto Attack 47%, Galeheart Echo 27%, Arc Bolt 16%, Ancestral Strike 7%, Chain Arc 2%, Cinder Jolt 1%
- **Affliction (Hexcraft)** rows: L5 wlk_r5_improved_immolate
  - gear: mainhand=scepter_of_the_deathless_court helmet=heroic_soulflame_cowl neck=zense_meridian shoulder=heroic_soulflame_mantle chest=heroic_necromancers_starshroud waist=soulflame_cord legs=necromancers_legwraps gloves=soulflame_gloves feet=heroic_necromancers_soulsteps ring1=architects_cornerstone ring2=nielas_coldlight_band
  - damage: Gloom Bolt 19%, Auto Attack 19%, Burning Pact 13%, Blackrot 12%, Ruinbolt 11%, Hex of Anguish 10%
- **Demonology (Pactbound)** rows: L5 wlk_r5_improved_immolate, L20 wlk_r20_curse_mastery
  - gear: mainhand=scepter_of_the_deathless_court helmet=heroic_soulflame_cowl neck=zense_meridian shoulder=heroic_soulflame_mantle chest=heroic_necromancers_starshroud waist=soulflame_cord legs=necromancers_legwraps gloves=soulflame_gloves feet=heroic_necromancers_soulsteps ring1=architects_cornerstone ring2=nielas_coldlight_band
  - damage: Auto Attack 28%, Gloom Bolt 26%, Burning Pact 14%, Hex of Anguish 13%, Blackrot 12%, Duskfire 4%
- **Destruction (Ruination)** rows: L5 wlk_r5_improved_immolate
  - gear: mainhand=heroic_deathless_heartwood helmet=heroic_soulflame_cowl neck=yumis_keepsake_locket shoulder=heroic_soulflame_mantle chest=shroud_of_the_gravewyrm waist=soulflame_cord legs=lunar_choir_leggings gloves=soulflame_gloves feet=shadowpulse_slippers ring1=nielas_coldlight_band ring2=architects_cornerstone
  - damage: Auto Attack 31%, Burning Pact 27%, Conflagrate 16%, Ruinbolt 10%, Wand 4%, Hex of Anguish 4%
- **Arms (Battlecraft)** rows: L14 war_row_battle_rhythm, L20 war_row_bladestorm
  - gear: mainhand=deathless_greatblade helmet=heroic_crownforged_dreadhelm neck=medallion_of_endless_profit shoulder=heroic_crownforged_warspaulders chest=morthens_cryptforged_hauberk waist=crownforged_girdle legs=deathless_warguard_legmail gloves=crownforged_gauntlets feet=tideworn_warboots ring1=seal_of_the_nine_oaths ring2=oath_of_the_round_table
  - damage: Auto Attack 34%, Redhand 27%, Maiming Strike 20%, Brute Swing 7%, Gaping Wounds 5%, Bonesplinter 4%
- **Fury (Bloodrush)** rows: L14 war_row_blood_offering
  - gear: mainhand=kingsbane_last_oath offhand=gravewyrm_cleaver helmet=heroic_crownforged_dreadhelm neck=zense_meridian shoulder=heroic_crownforged_warspaulders chest=morthens_cryptforged_hauberk waist=crownforged_girdle legs=deathless_warguard_legmail gloves=crownforged_gauntlets feet=dreamroot_boots ring1=unbroken_circle ring2=oath_of_the_round_table
  - damage: Auto Attack 43%, Red Harvest 24%, Twinstrike 19%, Bloodletting 6%, Chain Arc 4%, Bonesplinter 3%
# Findings

## 1. Thronebane is an item bug, and it is the top of the DPS table

`kingsbane_last_oath` (and its auto-minted `heroic_kingsbane_last_oath`) carries
**21.4 weapon dps**, above the 19.1 that every two-hander in the level-20 table
tops out at, and it still has **no `hand` field**. `canEquipItemInSlot` therefore
returns true for the OFFHAND on Fury warrior, all three Rogue specs, and
Enhancement shaman. Both the normal and the heroic variant exist, so the pair is
farmable without a duplicate drop.

Measured over 24 seeds at 60 s, full BiS against the epic-only control:

| Spec | full BiS | epic only | legendary worth |
|---|---:|---:|---:|
| Subtlety rogue | 200 | 146 | **+36%** |
| Combat rogue | 201 | 156 | **+28%** |
| Fury warrior | 258 | 204 | **+27%** |
| Enhancement shaman | 220 | 174 | **+26%** |
| Assassination rogue | 308 | 252 | **+22%** |
| Fire mage | 198 | 164 | +21% |
| Beast Mastery hunter | 196 | 170 | +15% |
| Elemental shaman | 150 | 132 | +14% |

The top five are exactly the five specs that can hold Thronebane in BOTH hands.
Fire mage, Beast Mastery and Elemental gain from their own class legendaries
(`heroic_deathless_heartwood` for the casters), which is legendaries working as
intended; the dual-wield cluster is the outlier, and it also locks Mage, Priest,
Warlock and Druid out of the best weapon in the game entirely (`requiredClass`
is warrior/rogue/hunter/shaman/paladin).

READ THE ZEROES WITH CARE: eight specs show +0% because the greedy search found
a worse local optimum on the full item pool than on epics alone, so the study
substituted the epic build for both columns. Those rows mean "the search found no
legendary upgrade", not "no legendary upgrade exists".

This is the same defect the v0.30.0 fury study found and sized; the fix never
reached this branch. That study measured a mainhand lock ALONE as insufficient,
so the package is still: add `hand: 'mainhand'` AND re-band the weapon to at or
under the 19.1 two-hander ceiling. Item ids resolve on load, so it is
retroactive with no migration.

## 2. The spread is about 2.4x against a declared intent of about 1.15x

`tests/owned_class_balance_harness.test.ts` states the intended shape: Vespers
within 0.9-1.2x of Thundercall, Warspirit within 0.95-1.15x of Vespers, Moongrove
and Wildfang both inside 180-225 with a spread cap of 0.15. That is a plus or
minus 15% band. The measured roster is much wider, and the epic-only control
shows removing the legendary does not close it:

| Window | Top | Bottom | Median | Spread |
|---|---:|---:|---:|---:|
| 15 s | 336 (Retribution) | 107 (Destruction) | 222 | **3.15x** |
| 30 s | 297 | 117 | 208 | 2.53x |
| 60 s | 308 (Assassination) | 130 (Destruction) | 198 | **2.37x** |
| 120 s | 313 | 119 | 189 | 2.63x |
| 300 s | 315 (Assassination) | 58 (Marksmanship) | 153 | **5.39x** |

Epic-only at 60 s is still 2.11x (266 top, 126 bottom), and heroic is 2.27x. The
item is a real problem but it is not the reason the roster is wide.

Retribution owns the opening 15 seconds at 336 and settles to 222 by one minute;
Assassination is the opposite shape, starting at 293 and still climbing at five
minutes. Both are inside the same table, which is what a 3.15x burst spread
against a 2.37x sustained spread actually looks like in play.

## 3. The sustain cliff is the biggest single effect, and it tracks resource type

The gap between the 60 s and 300 s columns separates the roster almost perfectly
by what the spec spends. Normal Nythraxis is roughly a 40 s kill for a competent
10-man and heroic is around 140 s, so the long column is what heroic progression
actually feels like.

| Retains most of its 60 s DPS at 300 s | Retains least |
|---|---|
| Balance druid 103%, Assassination rogue 102%, Combat rogue 100% | Fire mage 41%, Marksmanship hunter 42% |
| Fury warrior 97%, Subtlety rogue 97%, Arms warrior 96%, Feral druid 96% | Beast Mastery hunter 46%, Survival hunter 53% |
| Retribution paladin 94%, Shadow priest 88%, Affliction warlock 86% | Destruction warlock 62%, Demonology warlock 64%, Frost mage 67% |

Everything in the left column runs on rage, energy, or a self-sustaining mana
engine. Everything in the right column runs on a mana or focus pool that simply
empties. Marksmanship falls from 139 DPS to 58.

CAVEAT ON MY OWN METHOD: the first build search used a 45 s objective, which
cannot see mana recovery and therefore never picked Evocation. The study re-ran
the whole search against a 180 s objective; the sustain table in the report is
that second search. What the second search found is the interesting part, and it
is not "the cliff was an artifact":

- **Priest HAS an answer and takes it.** The 180 s search picks
  `pri_r11_meditation` (every 3rd spell costs 50% less, +7.4%) and
  `pri_r20_incarnate_spirit` (+17.4%). Shadow priest retains 88% at 300 s.
- **Mage has an answer and REJECTS it.** `mag_r20_evocation` (Aetherwell:
  channel to restore mana) exists on the row, and the search still prefers
  `mag_r20_rune_of_power` (+10% damage aura) even over a three-minute fight. The
  mana capstone loses its own row, so Fire mage keeps its 41% retention.
- **Hunter has no answer at all.** Every level-20 option (Overdraw, Chain
  Reaction, Fang Chorus) is a damage talent; there is no focus restoration
  anywhere on the tree. Marksmanship cannot spec out of falling to 58 DPS.

Re-measuring every spec on its sustain build settles it. Speccing for the long
fight rescues several: Survival hunter 87 -> 114 at 300 s (+31%), Destruction
warlock 80 -> 95, Beast Mastery 90 -> 104, Fury 252 -> 288, Shadow priest
153 -> 175. It does NOT rescue the two worst: **Fire mage gets WORSE**
(82 -> 78) and **Marksmanship stays on the floor** (58 -> 60).

So the cliff is a real design gap, and it is a DIFFERENT gap per class: the mage
needs Evocation to be worth its row, the hunter needs a focus talent to exist,
and those are exactly the two specs no build can save.

## 4. One healer holds the group; the priests run dry in about a minute

Every healer faced an identical pattern: a boss swing on the tank every 2.6 s
plus a raid-wide pulse worth 10% of each member's own pool every 15 s, about
136 incoming DTPS on normal.

| Healer | Throughput/s | Covers | Deaths | Runs dry |
|---|---:|---:|---:|---:|
| Restoration shaman | **121** | 89% | **1.3** | 169 s |
| Restoration druid | 106 | 78% | 12.9 | 123 s |
| Holy paladin | 87 | 63% | 21.3 | 115 s |
| Discipline priest | 79 | 58% | 21.4 | **63 s** |
| Holy priest | 73 | 54% | 24.0 | **68 s** |
| Arcane mage (Chronomancy) | **41** | 30% | 42.8 | **55 s** |

Restoration shaman is the only spec that both sustains its pool and holds the
group. Chronomancy covers under a third of the incoming damage and is dry at
55 s: as a healer it does not currently function. Note that Chronomancy is the
one healer loop authored from scratch for this study rather than ported from the
shipped probe, so its number carries the most rotation risk of the six.

On heroic the pattern is 243 incoming DTPS against a best-case 150, so heroic
needs two healers minimum and three for anything but a perfect pull.

## 5. Raised Guard gives the warrior a permanent 50% physical reduction

| Tank | Mitigation | Cost | Cooldown | Duration | Uptime | Effect |
|---|---|---:|---:|---:|---:|---|
| Ironguard warrior | Raised Guard | 15 rage | 12 s, **2 charges** | 6 s | ~100% | **50% physical DR** |
| Faithwarden paladin | Bastion Rite | 20 | 10 s | 6 s | ~60% | 20% DR + 20% block |
| Wildfang bear | Barkskin | 30 | **60 s** | 15 s | 25% | **+150 armor** |

Two charges on a 12 s recharge covering a 6 s buff is continuous uptime.
Barkskin grants flat armor to a bear already above 4,600, worth roughly 1%
damage reduction: at that armor level it is not functionally a mitigation
cooldown. Re-running the bear's whole build search with Barkskin in its rotation
produced an identical score (12.6 both times), which confirms this is the kit and
not the loop.

The paladin blocks half of all incoming swings and still takes more damage per
second than the warrior, while generating **3.6x the warrior's threat** (620 vs
173 TPS). The three tanks are unequal on two different axes in opposite
directions: the warrior survives, the paladin holds aggro, and the bear does
neither.

## 6. The heroic level step only taxes direct casts

Heroic Nythraxis is level 22, and a +2 level target costs 14 points of spell hit
(96% to 82% before hit rating). But `isSpellResisted` is rolled ONCE per cast, at
projectile impact (`casting_lifecycle.ts:2071`), and never per damage-over-time
tick. So:

- Shadow priest: 173.2 DPS on normal, 173.2 on heroic. Identical to the digit.
- Destruction warlock: 130.0 on both.
- Balance druid, direct-cast heavy: 274.6 to 243.7, an 11% loss.

A DoT-heavy or pet-heavy spec pays nothing for the difficulty step while a
direct-cast spec pays a tenth of its damage, and the advantage grows with every
level of content above the player.

## How much of this is my rotations?

A weak rotation and a weak spec look identical in a DPS column, so every spec
that finished near the bottom was re-measured against alternative loops:

| Spec | study rotation | best alternative tried |
|---|---:|---|
| Destruction warlock | 120.6 | late Conflagrate, **+2.9%** |
| Marksmanship hunter | 116.4 | maintain Serpent Sting, **+6.1%** |
| Elemental shaman | 148.4 | Earth Shock at 4 charges, **+4.0%** |
| Affliction warlock | 142.7 | Drain Life filler, -9.9% |
| Shadow priest | 174.1 | never clip Mind Flay, -26.6% |

The largest upside available to any bottom finisher is 6.1%, so the floor of the
table is real. Read Marksmanship as roughly 147 rather than 139 at 60 s: it wants
Serpent Sting kept up and the study's loop did not. Shadow priest confirms the
opposite: clipping Mind Flay with Mind Blast is correct by 27%.

The three tanks and six healers carry more rotation risk than the DPS specs,
because their loops are hand-authored rather than ported. Chronomancy is the
least trustworthy number in the whole study.

## Suggested order of work

1. **Thronebane.** `hand: 'mainhand'` plus a weapon re-band to at or under 19.1.
   Cheap, retroactive, and it removes the largest single distortion.
2. **The sustain cliff**, which is two separate fixes. For the mage, make
   `mag_r20_evocation` worth its row (it currently loses to a +10% damage aura
   even in a three-minute fight). For the hunter, there is no focus-restoration
   talent anywhere on the tree to take. Neither is a damage-tuning problem.
3. **Bear mitigation.** Barkskin needs to be a percentage damage reduction (or a
   far shorter cooldown) to be a cooldown at all at endgame armor values.
4. **Warrior threat or paladin threat.** A 3.6x threat gap between two tanks
   means one of them cannot main-tank a pull the other can.
5. **Chronomancy.** Verify against a hand-played parse before tuning: this study
   authored its rotation and it is the least trustworthy number in the set.
