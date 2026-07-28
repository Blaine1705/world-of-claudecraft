# Druid v0.29 playtest guide

Companion to `druid-v029-class-design.md`. Probe numbers come from
`scripts/druid_balance_probe.ts`: 123 seconds, level 20, fixed PBE gear, and an
eight-seed deterministic average. The probe uses normal resource regeneration
and does not inject mana, energy, or rage.

## Probe result

The table records the measured best capstone for each 123-second, eight-seed
profile.

| Profile | Best capstone | Metric | Result |
|---|---|---|---:|
| Moongrove, one target | Nature's Echo | DPS | 209.0 |
| Moongrove, three targets | Nature's Echo | DPS | 176.5 |
| Wildfang, Wolf | Quickening | DPS | 211.9 |
| Groveheart, three injured allies | Wild Apex | HPS | 20.7 |

Moongrove and Wolf are both near the 200 DPS peer anchor, with a 1.4% spread
between their measured best one-target builds, and each of the three lanes
measures a DISTINCT best capstone (Nature's Echo, Quickening, Wild Apex). Wolf pays no hybrid tax.
Groveheart heals from a dedicated intellect-leather fixture, uses a real
three-ally pressure profile with normal mana limits, and is not compared
against a fake damage rotation. On the 60-second owned-class HPS harness it
lands inside the peer healer envelope (91.3 HPS one ally, 42.4 HPS three
allies at the shared seed), clustering with the triage healers; the gap to
the AoE chain healers over long pressure windows is a flagged PBE question.

The attacking-live-mob profile produced 5,302 Moonwing damage with 6 chosen
payoffs, 5,925 Wolf damage with 12 payoffs, and 2,192 Bruin damage with three
Marrowbreaks under Craven Roar upkeep. Bruin took 139 incoming damage and
built 5,741.4 threat during the 30-second profile. This is the tank-behavior
check, not a claim that Bruin should match a damage arm.

The Bruin tank profile (`runDruidBruinTankProbe`, seed 42920) measured 22.0%
less incoming damage than Wolf posture over a 30-second passive window under
real mob swings (177 against 227), 182 threat per 100 damage from the bear
multiplier and the feral threat bonus, a 1,150 snap-threat full-bank
Marrowbreak, the full 3-second Menace forced-target window, and a 5-second
handoff under the classic 110% rule after shifting out.

### Full capstone comparison

| Profile | Nature's Echo | Wild Apex | Quickening |
|---|---:|---:|---:|
| Moongrove, one target DPS | 209.0 | 204.1 | 193.8 |
| Moongrove, three target DPS | 176.5 | 145.9 | 175.0 |
| Wildfang, Wolf DPS | 209.7 | 196.9 | 211.9 |
| Groveheart, three ally HPS | 20.3 | 20.7 | 20.3 |

## Setup

1. Start offline play and create a Druid.
2. Use `/dev level 20`, choose a specialization, and repick the redesigned rows.
3. Use `/dev bis` after changing specialization.
4. Compare both a high-health training target and an attacking live mob.
5. Use `/dev god` when comparing tank or healing behavior.

## Moongrove

Enter Moonwing Form and keep Lunar Tempest active. Wildbolt fills Moontide
(Skyfall and Moonseed casts fill it too). At three pips BOTH buttons light
up: Moonseed shows Moonsurge (the damage slam) and Skyfall shows Sunwake
(the burn plus mana refund). Press ONE: either spends the whole bank and
both revert. Moonsurge fires even while Moonseed's own cooldown is running.
Use Moonseed on cooldown below full bank and never let Lunar Tempest fall.

The expected feel is one unchanging loop with a chosen payoff: damage when
your mana is healthy, Sunwake when it is not, and the pick should feel like
yours every cycle. Shifting out pauses everything; it must not erase or
continue building the bank.

## Wildfang

Wolf loop: keep Flense active (18 sec), build combo points with Rendclaw,
apply Bloodrift (24 sec), and press the Gorebite slot when Old Blood
transforms it into Redharvest. Combo points are optional on the press: the
detonation and energy refund always fire, and any points held only grow the
bite. The long bleeds mean one or two builders after Bloodrift still detonate
nearly full bleeds.

Bruin loop: keep Craven Roar up and maintain threat with Sweeping Claws and
Bonecrush. Old Blood is shared with Wolf, so a bank built before shifting
remains available. At three stages Bonecrush becomes Marrowbreak. Above half
health it must deal its burst and snap threat without an absorb. Below half
health it must deal no burst or snap threat and instead grant the absorb and
rage refund.

## Groveheart

Cast Wildbloom and Second Bloom deliberately across injured allies. Only casts
that plant a new owned HoT add Verdance; refreshing the same owned HoT must not.
Five plants transform Swiftmend into Overbloom. Let several owned HoTs retain
meaningful duration before spending: every affected ally should receive one
immediate harvest heal, the old HoTs should disappear, and a fresh Wildbloom
should appear on the selected target. With Seedspread, each harvested ally
receives the replant.

## What to verify

- A bank stage is visible and advances from the documented press only.
- Moonseed cannot cast or extend Lunar Tempest outside Moonwing.
- A full bank changes the existing action instead of adding a new bar action.
- Shifts preserve Moongrove and Old Blood; combat end clears only Old Blood.
- Same-spec row repicks and specialization changes clear engine state.
- Nature's Echo seeds one stage, Wild Apex strengthens the payoff, and
  Quickening restores the current form's resource.
- Wildfang can queue as tank or damage in Dungeon Finder.
- Swiftmend and Overbloom share one slot cooldown: after a harvest, the base
  button cannot immediately consume the fresh replant, and the running clock
  shows on the transformed button.
- At full Moontide BOTH payoff buttons arm at once; pressing either spends
  the bank and reverts both. Only one payoff per cycle is possible.
- Moonsurge fires through Moonseed's own recharge, and pressing it never
  arms Moonseed's cooldown.
- Redharvest fires at zero combo points (bank-only press) and scales up with
  any points held.
