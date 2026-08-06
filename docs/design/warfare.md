# Warfare tuning

Warfare is one player-facing PvP combat rating. On the character sheet it shows
both effects together: the percentage increase to damage dealt to hostile players
and the percentage reduction to damage taken from hostile players.

The implementation keeps separate offense and defense fractions so their caps can
be tuned independently, but those are internal mechanics rather than separate
player-facing stats. Every current FURY item grants the same Warfare rating to
both sides.

Both are inert outside hostile player-versus-player combat. Friendly damage,
self-damage, pets, player-versus-mob damage, and mob-versus-player damage do not
read Warfare.

## Rating curve and cap

Ten rating grants one percentage point (`PVP_RATING_PER_PCT`). Both effective
fractions cap at 30 percent (`PVP_OFFENSE_CAP` and `PVP_DEFENSE_CAP` in
`src/sim/pvp/power.ts`). The combat path clamps defensively and the derived
character-sheet stats are also capped, so the displayed value always matches the
applied value.

FURY's epics sit at item level 31, level with the heroic five-man and rift
clear-time epics, and each carries Offense and Defense Rating equal to the full
primary-stat budget of its slot (`WARFARE_RATING_FRACTION`, 1.0, on every slot).
The arithmetic that reaches the cap:

| Wearing | Offense / Defense rating | Result |
| --- | --- | --- |
| The seven set armor pieces | 120 / 120 | |
| The four unsettable slots (main hand, neck, two rings) | 62 / 62 | |
| **Complete 11-slot kit, before any set bonus** | **182 / 182** | 18.2% / 18.2% |
| Complete kit plus the 2-piece bonus | 182 / 222 | 18.2% / 22.2% |
| Complete kit plus the 4-piece bonus | 222 / 222 | 22.2% / 22.2% |
| **Complete kit plus the seven-piece set** | **302 / 302** | **30.0% / 30.0%** (clamped) |

The two points over 300 are rounding slack, nothing more. The set carries 120 of
a fully geared character's 302 rating, about 40 percent: it is a meaningful
top-up that rewards completion, not the main event. The 18.2 percent base is a
rise over the 16.8 the tier shipped with, so no partial kit is a per-piece
regression while a player is mid-grind.

Read the 2- and 4-piece rows as progress rather than as builds. Armor is ranked,
so a class equips its own weight and anything below it: cloth wearers have
exactly one usable family, leather wearers would never drop to cloth and lose
armor, and only the mail classes have two families, which they would never mix
because one is Strength and the other caster. The intermediate tiers exist to pay
a player while they are buying.

The whole schedule is pinned by `tests/pvp_honor_gear.test.ts` (the per-item
budget, price and jewelry guards) and `tests/warfare_gear_tier.test.ts` (the
tier arithmetic and the anti-hybrid property).

Warfare ratings are secondary ratings, like Crit Rating and Haste Rating. They do
not replace or inflate authored primary attributes.

The combat API receives damage after the caller's armor or resist calculation, so
Warfare multiplies that resolved amount before absorb shields. Keeping it as a
single, isolated multiplier makes the interaction explicit; mathematically it is
independent of mitigation apart from the engine's integer-rounding boundary.

## Stat budgets, and why honor gear is not a PvE shortcut

Three authored fractions shape every FURY item, all named constants in
`src/sim/content/pvp_honor.ts` so the tests pin the constant rather than a
number:

| Constant | Value | Applies to |
| --- | ---: | --- |
| `WARFARE_STAT_FRACTION` | 0.90 | primary stats on armor and weapons |
| `WARFARE_JEWELRY_STAT_FRACTION` | 0.75 | primary stats on neck and rings |
| `WARFARE_RATING_FRACTION` | 1.00 | Warfare Offense and Defense Rating, every slot |

Armor mitigation and weapon damage are the slot's inherent baseline rather than
budget-derived, and both sit on the item-level-31 curve beside the same-slot,
same-armor-type PvE epics.

Jewelry is held lower on purpose. At the armor fraction a Warfare ring would
reach 12 primary points against the badge ring's 11 and a Warfare neck 13 against
the badge neck's 12, overtaking the only other jewelry source in the game. At
0.75 the ring lands on 10 and the neck on 11, and the badge-jewelry guard in
`tests/pvp_honor_gear.test.ts` passes untouched.

The rule this tier is built to, which **replaces** the older assertion that honor
gear "never out-stats same-tier PvE gear" (that sentence was written when item
level 28 was the ceiling, and that tier no longer exists):

> Honor gear sits at the current five-man epic item level, carries a deliberate
> primary-stat discount against a same-slot PvE epic, and never reaches raid or
> legendary stat levels. Its advantage over PvE gear is expressed entirely in
> Warfare, which is inert outside hostile player-versus-player combat.

Moving the tier to item level 31 at a 90 percent stat fraction does make a
complete honor kit a credible floor for a player who has no heroic epics. The
answer to "is honor a shortcut past the heroic tier" is structural rather than a
tuning argument:

- Every item-level-31 PvE epic in the game carries a combat rating: hit, crit, or
  haste. **No Warfare piece carries one, and none will.** Pinned from both sides
  by `tests/warfare_gear_tier.test.ts` and `tests/combat_rating.test.ts`.
- A Warfare piece carries 90 percent of the slot's primary-stat budget; every
  item-level-31 PvE epic carries 100 percent. Same-slot, the honor chest is 20
  points against every item-level-31 PvE chest's 22.
- Every Warfare set bonus is a Warfare rating or a PvP-gated effect, so the set
  contributes exactly zero in PvE, while the PvE tier sets contribute attack
  power, stats, haste, and procs.

So the honor kit in PvE is a stat-only kit at a 10 percent discount with no
ratings and no set. That is a legitimate floor for a fresh level 20 and it is not
a substitute for the heroic tier.

## The four Warfare sets

The four armor families are also four item sets (`src/sim/content/item_sets.ts`).
Neck, rings and weapons carry no set tag: they are shared across role profiles,
so the seven armor pieces are the only coherent grouping.

| Set id | Name | Armor | Identity |
| --- | --- | --- | --- |
| `warfare_furyforged` | Furyforged Battlegear | mail | Strength |
| `warfare_stormbound` | Stormbound Vestments | mail | caster |
| `warfare_ashstalker` | Ashstalker Kit | leather | Agility |
| `warfare_cinderweave` | Cinderweave Regalia | cloth | caster |

Breakpoints are 2, 4 and 7 of the seven armor pieces, the same in every family:

| Tier | Bonus |
| --- | --- |
| 2 pieces | +40 Warfare Defense Rating |
| 4 pieces | +40 Warfare Offense Rating, and crowd control cast on you by hostile players lasts 15 percent less |
| 7 pieces | +80 Warfare Offense and Defense Rating, plus the family signature |

The 4-piece wording is deliberate. Crowd control applied by a player's **pet** is
entity kind `mob` and takes the non-hostile-pair early return in
`Sim.diminishedCrowdControlDuration`, so it is not reduced: "cast on you by
hostile players" is true where "from hostile players" would not be.

Signatures, all `pvpOnly` and therefore inert in PvE by construction (the gate in
`src/sim/combat/set_procs.ts` sits before the chance roll, so a signature draws
no rng outside hostile player-versus-player combat):

| Set | Signature | Trigger | Effect |
| --- | --- | --- | --- |
| Furyforged | Unbroken Oath | kill | Killing a hostile player grants a 200-damage absorb for 10 sec |
| Ashstalker | Ashen Step | kill | Killing a hostile player grants +40 percent movement speed for 6 sec |
| Stormbound, Cinderweave | Emberward | spell cast | 15 percent chance on cast to grant a 120-damage absorb for 8 sec, 20 sec internal cooldown |

Movement speed on the Agility set is tuned for Thornhollow Fields, which is a
capture-the-flag mode.

### Why the capstone is 7 of 7

An earlier draft used 2, 4 and 6, on the reasoning that leaving one armor slot
free was a build decision. It was not a decision: the seventh slot had one right
answer, which was to abandon the chest, the most expensive armor piece and the
one with the best PvE replacement. Measured against a tier-1 plus tier-2 warrior,
the six-piece design's full honor kit cost 5,400 honor in armor and measured
1.03x, while six pieces plus a raid chest, a raid weapon and badge jewelry cost
4,200 and measured 0.89x. The cheaper build won outright.

At 7 of 7, dropping the chest forfeits both the 22-rating piece and the 80/80
capstone: 30.0 percent Warfare falls to 20.0, and the same hybrid build measures
1.34x. `tests/warfare_gear_tier.test.ts` pins the property (the loss must exceed
the chest's own rating by a wide margin, proving the capstone and not merely the
piece is lost) and `tests/warfare_balance_harness.test.ts` pins the ratio.

### The replacement invariant

Every Warfare set bonus is either a Warfare rating or a PvP-gated effect, never a
flat stat. This is what makes "honor gear is never better than raid gear in a
raid" structural rather than a balance argument, and it is enforced rather than
documented: `tests/warfare_gear_tier.test.ts` rejects any other effect key on a
Warfare tier, and asserts that the resolved capstone aggregate leaves every
non-Warfare field at zero.

## The main hand is a contested slot, deliberately

The main hand remains dominated by PvE drops for anyone who has them. An
item-level-31 honor weapon carries 20 primary stats and 15.9 weapon DPS; the
item-level-33 raid epic carries 30 and 19.1, and the item-level-37 rift legendary
carries 49 and 21.4. A full honor kit that swaps in the raid epic weapon goes
from 1.03x to 0.89x, and with the legendary to 0.81x. No Warfare budget a single
main hand can carry closes a two-tier item-level gap, and raising it would not
help: a complete kit already sits at the cap, so rating above 300 is discarded
and the first slot dropped is nearly free.

This is accepted rather than fought. It is classic-authentic (PvP sets were
armor; weapons came from raids), it is a real build decision, and the honor
weapon remains the correct weapon for the large majority of players. Jewelry, by
contrast, lands almost exactly even against badge jewelry, which is the right
shape for a choice.

## Arena and duels

`PVP_OFFENSE_CAP` and `PVP_DEFENSE_CAP` are global, and `isHostileTo` is true for
ranked arena and duels as well as battlegrounds. Raising both from 0.20 to 0.30
takes the maximum gear swing from 1.2 / 0.8 = 1.50x to 1.3 / 0.7 = **1.86x**, and
the sets' PvP-gated procs and crowd-control reduction fire in all three contexts.

This is accepted for the tier refactor: an ungeared level 20 losing badly to a
fully geared one is the intended shape, and ranked arena has its own rating
ladder that matches like against like. The lever if live data says the swing is
too wide is pre-identified: `PvpCaps` already takes independent offense and
defense caps and `pvpFractionsFromRatings` already threads them, so a split (for
example 0.25 offense against 0.30 defense) is a constant edit with no structural
change.

## Honor income

Phase 1 starts with these owner-selected values:

- Ranked 1v1 win: 25 Honor.
- Ranked 2v2 win: 50 Honor per winning player.
- Fiesta takedown: 20 Honor.
- Completed Fiesta match: 20 Honor.
- Fiesta win bonus: 40 Honor.
- Thornhollow Fields battleground win: 60 Honor per winning player
  (`BATTLEGROUND_WIN_HONOR`).
- Thornhollow Fields battleground loss, played out to a result: 20 Honor
  (`BATTLEGROUND_LOSS_HONOR`); a draw pays the loss amount to both sides.
- First Thornhollow Fields WIN of each UTC day: a flat 20 Honor on top of the win
  award (`BATTLEGROUND_FIRST_WIN_BONUS_HONOR`), so the day's first win pays 80
  against a routine 60, a ratio of 1.33x.

Only the first ranked Arena win against the same opponent or team pays Honor
each UTC day. Repeated Fiesta rewards against the same opposition pay 100, 50,
25, then 0 percent (`HONOR_REPEAT_DR`, shared with battleground kill and assist
honor). Thornhollow Fields RESULTS decay on their own curve,
`BATTLEGROUND_RESULT_DR`, which pays 100, 50, 25, then a 25 percent floor per
repeated opposing-team identity each UTC day: a full 5v5 match is long enough
that the arena's first-win-only rule would be needlessly punishing, and long
enough that a repeated opponent is queue shape rather than collusion.
Ranked wins also taper after 10 wins in one UTC day to 50 percent, then after 15
wins to a 25 percent floor. These values are named constants and can be tuned
without changing rating, matchmaking, or combat rules.

The two decay curves are deliberately separate. The zero floor is right where it
came from: in arena, meeting the same team repeatedly is evidence of win-trading.
In a 5v5 battleground on a low-population realm it is simply what the queue
produces, and the code cannot tell the two apart, so a zero floor made grind
length swing about 1.7x on queue variety rather than on effort. A 25 percent
floor keeps farming one premade heavily penalised (15 Honor against 60) while
honest repeat play never pays literally nothing. Battleground kill and assist
honor stay on the shared curve because their counters live on the match and reset
every match, so they never had this problem.

The daily bonus is flat rather than a multiple of the win award. An earlier shape
derived it (win times two, so the day's first win paid 180, three times a routine
one), which paid logging in for a single win better than it paid playing a
session, and on a day spent against one stable premade accounted for 53 percent
of all result honor: it was propping up the zero floor above rather than doing
its own job. The two are now sized independently.

The thing to watch after launch is the distribution of distinct opposing team
identities faced per player per day, bucketed by realm population. If thin realms
still cluster near one or two, the floor is set too low. That is a matchmaking
property, so the response is not a price change, which would compensate for it
everywhere else and mask it.

Offline Fiesta practice pays no Honor. Fiesta forfeits pay no completion or win
bonus, and a forfeited Thornhollow Fields match pays nothing on either side (the leavers'
opponents still take the rating win). A Thornhollow Fields deserter takes the loss on
the spot: leaving, disconnecting, or being jailed out of a live match records
the L and applies the loss-side rating delta immediately, so pulling the plug
while losing never protects a rating. Ranked, Fiesta, and Thornhollow Fields result
accounting is exactly once, including a disconnect during the post-match return
delay.

Thornhollow Fields rating is its own per-character ladder (base 1500, floor 100), moved
zero-sum by the arena's Elo over team-average ratings; a draw applies the 0.5
draw score. The queue is rated but NOT rating-matched: matchmaking fills
first-come from the queue, and strict banding is an explicitly deferred
follow-up.

## FURY prices

FURY sells one item-level 31 epic tier for every equipment slot the game
currently supports. Prices are per purchase:

| Slot | Slot budget | Honor |
| --- | ---: | ---: |
| Main hand | 22 | 1,200 |
| Chest | 22 | 1,200 |
| Legs | 20 | 1,050 |
| Helmet | 18 | 900 |
| Shoulder | 16 | 700 |
| Gloves | 15 | 550 |
| Feet | 14 | 550 |
| Waist | 15 | 450 |
| Neck | 14 | 400 |
| Ring | 13 | 275 |

- The seven-piece armor set, the capstone: **5,400 honor**.
- A complete 11-slot kit: **7,550 honor**.

Roughly 1.75x the schedule the tier launched with. It is now genuinely
best-in-slot for PvP armor and should be earned. The main hand comes down to the
chest's price rather than up: it shares the chest's slot budget of 22, so equal
pricing is the more principled reading of the ladder, and it is the slot most
likely to be replaced by a raid drop, so charging the tier's highest price for
its most replaceable item would be a trap. Rings and the neck stay the cheapest
slots so a new PvP player gets a real upgrade on the first day.

Against planning figures of about 900 honor for a committed day of Thornhollow
Fields and 450 for a lighter session, the seven-piece set is roughly 6 days of
committed play and the complete kit roughly 8.4. Prices are tunable and should be
revisited against live battleground throughput. The first thing to look at is
queue variety: result honor decays per opposing team identity per UTC day, so on
a thin realm the grind runs materially longer than on a healthy one. That is a
matchmaking property, not a pricing one, and the response is not a price change.

The current equipment model has main hand, helmet, neck, shoulder, chest, waist,
legs, gloves, feet, and two ring positions. It does not yet have cloak, wrist,
trinket, offhand, or ranged equipment positions.

The same stock list is sold from two placements: FURY in Eastbrook and the named
quartermaster in Highwatch. One stock, two vendors.
