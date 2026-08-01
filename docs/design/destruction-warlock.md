# Destruction Warlock

Destruction is a deterministic siege caster. It builds a small secondary resource,
prepares a target with Burning Pact, and chooses between a slow single-target bolt,
sustained ground pressure, or an execute. It does not use Affliction's multi-DoT
engine or Necromancy's summon economy.

## Resource: Ruin

- Ruin has five visible marks and persists as synchronized aura state.
- Its dedicated draggable ritual meter sits away from the player unit frame. Empty
  obsidian seals ignite individually, and the complete bank gains a full-state flare.
- While out of combat, the normal two-second resource tick generates one Ruin up to
  three. The last two marks must be earned in combat.
- Gloom Bolt generates one Ruin when its projectile lands.
- Conflagrate generates one Ruin and one Desolation.
- Ruinbolt and Rain of Fire cost three Ruin.
- Duskfire costs one Ruin and refunds it when its claimed target dies within five
  seconds.
- Copied Brand damage and Pyre Colossus Worldfire never generate Ruin.

## Rotation

Burning Pact is the setup spell. Conflagrate requires the caster's Burning Pact,
pulls one future tick forward without deleting the effect, and has two charges with
a twelve-second recharge.

Desolation changes the next spender:

- Ruinbolt casts 30% faster.
- Rain of Fire begins with an immediate wave instead of waiting for its first
  interval.

Ruinous Brand marks an enemy for fifteen seconds. The next three direct spells echo
for 25% damage when cast into the branded enemy, or copy 50% of their resolved direct
damage to it when cast into another target. The echoes cannot recurse, generate Ruin,
or repeat proc rolls.

## Permanent demons

- Emberkin is the Warlock's shared starter demon before specialization. Choosing
  Destruction keeps it; choosing Affliction or Necromancy removes it from the known
  spellbook. It casts Felbolt from range, using its authored cast animation and a
  compact green fel projectile. Its summon ranks at levels 1, 8, 14, and 20 grow its
  visual scale from 0.55 to 0.85 without changing its combat role.
- Gloomshade is the tank option. It taunts normally and automatically uses Abyssal
  Chain every fifteen seconds when an ordinary enemy moves 8 to 20 yards away,
  pulling it back to melee range. Bosses and control-immune enemies cannot be pulled.

## Major cooldown

Pyre Colossus is an instant aimed cast with a three-minute cooldown. It impacts
for area Fire damage, fights for fifteen seconds as a guardian without replacing
the normal demon, and answers each Ruin spender with one deterministic Worldfire
attack.

## Localization handoff

Spanish and the newly introduced ability keys are refreshed in this contribution.
The following reworded existing descriptions still need a maintainer translation
pass in every non-English locale except Spanish before release:

- `entities.abilities.rain_of_fire.description`
- `entities.abilities.shadowburn.description`
- `entities.abilities.conflagrate.description`
- `entities.abilities.summon_infernal.description`
- `entities.abilities.chaos_bolt.description`

## Level progression

| Level | Addition |
| --- | --- |
| 5 | Destruction specialization, Ruin, and Conflagrate |
| 5 | Ruinbolt |
| 12 | Duskfire |
| 10 | Ruinous Brand |
| 8 | Rain of Fire, rank 1 (4 sec) |
| 18 | Rain of Fire, rank 2 (6 sec) |
| 13 | Pyre Colossus |

Blackrot, Hex of Anguish, and Sear are excluded from committed Destruction. Duskborn,
Spellhound, Warfiend, and Wraithborn have been retired from the Warlock class rather
than retained as hidden summons.

## Tuning anchors

| Ability | Mana / Ruin | Cast/CD | Damage |
| --- | --- | --- | --- |
| Conflagrate | 40 / generates 1 | instant, 2 charges, 12s recharge | 54-64 plus one advanced Burning Pact tick |
| Ruinbolt | 65 / costs 3 | 2.5s, no cooldown | 128-156 |
| Duskfire | 35 / costs 1 | instant, 12s cooldown | 72-84 below 20% health |
| Ruinous Brand | 35 / none | instant, 20s cooldown | three 50% copies |
| Rain of Fire | 45-60 / costs 3 | instant, no cooldown | 5-7 per wave for 4s; rank 2: 8-11 for 6s |
| Pyre Colossus | 100 / none | instant aimed, 180s cooldown | 58-72 impact plus Worldfire |
