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

Ten rating grants one percentage point. Both effective fractions cap at 20
percent. The combat path clamps defensively and the derived character-sheet
stats are also capped, so the displayed value always matches the applied value.

FURY's item-level 28 epics carry Offense and Defense Rating equal to the slot's
item-level primary-stat budget. A complete 11-slot kit totals 168 of each rating,
or 16.8 percent Offense and 16.8 percent Defense. This lands below the cap and
leaves room for later progression.

Warfare ratings are secondary ratings, like Crit Rating and Haste Rating. They do
not replace or inflate authored primary attributes. Each item still satisfies
the existing exact primary-stat budget for an item-level 28 epic, while the
Warfare schedule is pinned separately by the PvP catalog tests. The raw PvE tier
remains below item-level 31 heroic raid gear, and Warfare adds value only against
players.

The combat API receives damage after the caller's armor or resist calculation, so
Warfare multiplies that resolved amount before absorb shields. Keeping it as a
single, isolated multiplier makes the interaction explicit; mathematically it is
independent of mitigation apart from the engine's integer-rounding boundary.

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

FURY sells one item-level 28 epic tier for every equipment slot the game
currently supports. Prices are per purchase:

| Slot | Honor |
| --- | ---: |
| Main hand | 800 |
| Chest | 700 |
| Legs | 600 |
| Helmet | 500 |
| Shoulder | 400 |
| Gloves | 300 |
| Feet | 300 |
| Waist | 250 |
| Neck | 225 |
| Ring | 150 |

The current equipment model has main hand, helmet, neck, shoulder, chest, waist,
legs, gloves, feet, and two ring positions. It does not yet have cloak, wrist,
trinket, offhand, or ranged equipment positions.
