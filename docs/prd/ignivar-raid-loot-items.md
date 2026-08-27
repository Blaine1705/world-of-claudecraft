# Crucible of the Last Spring: the full item catalog

## Status

The complete, reviewable enumeration of every item, token, stat line, and
set bonus in the Ignivar raid loot plan, plus the full list of changes to
existing gear. The design rationale (item-level derivation, budgets, the
token economy, drop tables, the lineage retune, the Hit program, the
viability check) lives in docs/prd/ignivar-raid-loot.md; this document is
the item-by-item data that plan implies, laid out for review before the
content records are written. Numbers here are exact: primary stat lines
are computed with the same largest-remainder normalization and per-slot
budgets that tests/item_level.test.ts enforces (35 x slot mult x 0.7,
epic quality), so what is reviewed here is what the budget sweep will pin.

Shared by every gear item below: item level 35 (source 26 + epic 6 + raid
3), epic quality, requiredLevel 20, soulbound. Set pieces are class-locked
to their set's class. Armor values by slot:

| Slot | Mail | Leather | Cloth |
|---|---|---|---|
| chest | 380 | 215 | 105 |
| legs | 345 | 195 | 95 |
| helmet | 325 | 185 | 90 |
| shoulder | 290 | 165 | 80 |
| waist | 270 | 150 | 75 |
| gloves | 270 | 150 | 75 |
| feet | 255 | 145 | 70 |

Affix scales (off the primary budget): Spell Damage 14 on
chest/legs/helmet, 10 on shoulder/gloves/waist, 8 on feet/jewelry, 26 on
the damage staff, 10 on the wand and held offhand; Healing Power 25 on
chest/legs/helmet, 18 on shoulder/gloves/waist, 14 on feet/jewelry, 45 on
the healing staff, 30 on the healing mace, 18 on the healing shield and
orb. Ratings: armor 60 primary + 25 secondary, weapons 70 + 30, jewelry a
single 25. Set pieces carry only crit and haste; Hit appears exactly where
the Hit program in the plan doc says (elective waists at 60, the physical
neck and ring and the spell-damage ring at 25, and three weapon
secondaries at 30).

## The 29 tier sets, every piece

Five pieces per set (helmet, shoulder, chest, gloves, legs), redeemed from
sigils at the Crucible Quartermaster. Bonuses at 2 and 4 pieces, and by
maintainer directive every bonus hooks the spec's underlying engine (its
rotation loop, resource bank, or signature mechanic) rather than granting
raw stats; damage-caster and healer 2-pieces additionally carry the full
cast-pushback immunity the incumbents gave up in the retune. Numbers are
design targets for the tuning pass.

### Warrior

**Slagbreaker Battlegear** (`slagbreaker`), arms (Battlecraft), mail. 2 pieces: Redhand gains a third charge. 4 pieces: Redhand strikes reduce Maiming Strike's remaining cooldown by 1.5 sec, and Maiming Strike deals 15% more damage to targets wearing your Gaping Wounds.

| Piece | Slot | Armor | Stats | Affix | Ratings |
|---|---|---|---|---|---|
| Slagbreaker Helm (`slagbreaker_helmet`) | helmet | 325 | Str 14, Sta 7 | none | crit 60, haste 25 |
| Slagbreaker Pauldrons (`slagbreaker_shoulder`) | shoulder | 290 | Str 12, Sta 6 | none | crit 60, haste 25 |
| Slagbreaker Hauberk (`slagbreaker_chest`) | chest | 380 | Str 17, Sta 8 | none | crit 60, haste 25 |
| Slagbreaker Gauntlets (`slagbreaker_gloves`) | gloves | 270 | Str 11, Sta 6 | none | crit 60, haste 25 |
| Slagbreaker Legguards (`slagbreaker_legs`) | legs | 345 | Str 15, Sta 7 | none | crit 60, haste 25 |

**Emberfury Harness** (`emberfury`), fury (Bloodrush), mail. 2 pieces: Bloodletting generates 6 additional rage while you are Enraged. 4 pieces: Spending 80 rage on Red Harvest refunds both Twinstrike charges and extends your Enrage by 2 sec.

| Piece | Slot | Armor | Stats | Affix | Ratings |
|---|---|---|---|---|---|
| Emberfury Helm (`emberfury_helmet`) | helmet | 325 | Str 14, Sta 7 | none | haste 60, crit 25 |
| Emberfury Pauldrons (`emberfury_shoulder`) | shoulder | 290 | Str 12, Sta 6 | none | haste 60, crit 25 |
| Emberfury Hauberk (`emberfury_chest`) | chest | 380 | Str 17, Sta 8 | none | haste 60, crit 25 |
| Emberfury Gauntlets (`emberfury_gloves`) | gloves | 270 | Str 11, Sta 6 | none | haste 60, crit 25 |
| Emberfury Legguards (`emberfury_legs`) | legs | 345 | Str 15, Sta 7 | none | haste 60, crit 25 |

**Forgewall Aegis** (`forgewall`), prot (Ironguard), mail. 2 pieces: Iron Resolve converts rage at 5 absorb per point instead of 4. 4 pieces: Blocking an attack grants 3 rage, and a Revenge made free by a dodge or parry strikes one additional target.

| Piece | Slot | Armor | Stats | Affix | Ratings |
|---|---|---|---|---|---|
| Forgewall Helm (`forgewall_helmet`) | helmet | 325 | Str 10, Sta 11 | none | crit 60, haste 25 |
| Forgewall Pauldrons (`forgewall_shoulder`) | shoulder | 290 | Str 8, Sta 10 | none | crit 60, haste 25 |
| Forgewall Hauberk (`forgewall_chest`) | chest | 380 | Str 11, Sta 14 | none | crit 60, haste 25 |
| Forgewall Gauntlets (`forgewall_gloves`) | gloves | 270 | Str 8, Sta 9 | none | crit 60, haste 25 |
| Forgewall Legguards (`forgewall_legs`) | legs | 345 | Str 10, Sta 12 | none | crit 60, haste 25 |

### Paladin

**Dawnforged Vestments** (`dawnforged`), holy (Sunmender), mail. 2 pieces: Radiant Chorus arms Radiant Resonance after healing a single injured ally. Damage taken no longer delays your spellcasting. 4 pieces: Consuming an Ascension charge refunds 2 Devotion, and Dawn's Embrace cast under Radiant Resonance leaves a heal over time for 30% of its amount over 6 sec.

| Piece | Slot | Armor | Stats | Affix | Ratings |
|---|---|---|---|---|---|
| Dawnforged Helm (`dawnforged_helmet`) | helmet | 325 | Int 11, Spi 10 | Healing Power 25 | haste 60, crit 25 |
| Dawnforged Pauldrons (`dawnforged_shoulder`) | shoulder | 290 | Int 9, Spi 9 | Healing Power 18 | haste 60, crit 25 |
| Dawnforged Hauberk (`dawnforged_chest`) | chest | 380 | Int 13, Spi 12 | Healing Power 25 | haste 60, crit 25 |
| Dawnforged Gauntlets (`dawnforged_gloves`) | gloves | 270 | Int 9, Spi 8 | Healing Power 18 | haste 60, crit 25 |
| Dawnforged Legguards (`dawnforged_legs`) | legs | 345 | Int 11, Spi 11 | Healing Power 25 | haste 60, crit 25 |

**Oathpyre Bastion** (`oathpyre`), protection (Faithwarden), mail. 2 pieces: Vowkeeper Strike's Solar Reprisal chance rises to 30%, and to 40% when it follows a block. 4 pieces: Sunward Disc bounces to one additional target, and each impact during Bastion Rite grants an absorb equal to 2% of your maximum health.

| Piece | Slot | Armor | Stats | Affix | Ratings |
|---|---|---|---|---|---|
| Oathpyre Helm (`oathpyre_helmet`) | helmet | 325 | Str 10, Sta 11 | none | crit 60, haste 25 |
| Oathpyre Pauldrons (`oathpyre_shoulder`) | shoulder | 290 | Str 8, Sta 10 | none | crit 60, haste 25 |
| Oathpyre Hauberk (`oathpyre_chest`) | chest | 380 | Str 11, Sta 14 | none | crit 60, haste 25 |
| Oathpyre Gauntlets (`oathpyre_gloves`) | gloves | 270 | Str 8, Sta 9 | none | crit 60, haste 25 |
| Oathpyre Legguards (`oathpyre_legs`) | legs | 345 | Str 10, Sta 12 | none | crit 60, haste 25 |

**Zealfire Warplate** (`zealfire`), retribution (Dawnreaver), mail. 2 pieces: Final Edict and Dawnfall cut each other's remaining cooldown by 3 sec instead of 2. 4 pieces: Sun God's Verdict needs one fewer inscription, and resolving it grants 2 Devotion.

| Piece | Slot | Armor | Stats | Affix | Ratings |
|---|---|---|---|---|---|
| Zealfire Helm (`zealfire_helmet`) | helmet | 325 | Str 14, Sta 7 | none | crit 60, haste 25 |
| Zealfire Pauldrons (`zealfire_shoulder`) | shoulder | 290 | Str 12, Sta 6 | none | crit 60, haste 25 |
| Zealfire Hauberk (`zealfire_chest`) | chest | 380 | Str 17, Sta 8 | none | crit 60, haste 25 |
| Zealfire Gauntlets (`zealfire_gloves`) | gloves | 270 | Str 11, Sta 6 | none | crit 60, haste 25 |
| Zealfire Legguards (`zealfire_legs`) | legs | 345 | Str 15, Sta 7 | none | crit 60, haste 25 |

### Hunter

**Packlord's Emberhide** (`packlord_emberhide`), beast_mastery (Packlord), leather. 2 pieces: Pack Command grants 2 Pack Ferocity when your pet's strike critically hits. 4 pieces: Unleash Beast's pet frenzy lasts 12 sec, and Bestial Wrath doubles the damage bonus of your next Unleash Beast.

| Piece | Slot | Armor | Stats | Affix | Ratings |
|---|---|---|---|---|---|
| Packlord's Cowl (`packlord_emberhide_helmet`) | helmet | 185 | Agi 14, Sta 7 | none | crit 60, haste 25 |
| Packlord's Spaulders (`packlord_emberhide_shoulder`) | shoulder | 165 | Agi 12, Sta 6 | none | crit 60, haste 25 |
| Packlord's Tunic (`packlord_emberhide_chest`) | chest | 215 | Agi 17, Sta 8 | none | crit 60, haste 25 |
| Packlord's Grips (`packlord_emberhide_gloves`) | gloves | 150 | Agi 11, Sta 6 | none | crit 60, haste 25 |
| Packlord's Breeches (`packlord_emberhide_legs`) | legs | 195 | Agi 15, Sta 7 | none | crit 60, haste 25 |

**Coldsight Trackers** (`coldsight_trackers`), marksmanship (Coldsight), leather. 2 pieces: Measured Shot restores 5 additional focus. 4 pieces: Aimed Shot critical strikes extend Cold Focus by 1.5 sec, and Rapid Fire's channel restores 30 focus over its duration.

| Piece | Slot | Armor | Stats | Affix | Ratings |
|---|---|---|---|---|---|
| Coldsight Cowl (`coldsight_trackers_helmet`) | helmet | 185 | Agi 14, Sta 7 | none | crit 60, haste 25 |
| Coldsight Spaulders (`coldsight_trackers_shoulder`) | shoulder | 165 | Agi 12, Sta 6 | none | crit 60, haste 25 |
| Coldsight Tunic (`coldsight_trackers_chest`) | chest | 215 | Agi 17, Sta 8 | none | crit 60, haste 25 |
| Coldsight Grips (`coldsight_trackers_gloves`) | gloves | 150 | Agi 11, Sta 6 | none | crit 60, haste 25 |
| Coldsight Breeches (`coldsight_trackers_legs`) | legs | 195 | Agi 15, Sta 7 | none | crit 60, haste 25 |

**Slagsnare Trappings** (`slagsnare`), survival (Fieldcraft), leather. 2 pieces: Gutting Strike generates 20 focus against targets carrying your Bloodhook wound. 4 pieces: Woundrend spent at 3 Hunting Momentum keeps the stacks when it strikes a Bloodhook wound. Cannot occur more than once every 10 sec.

| Piece | Slot | Armor | Stats | Affix | Ratings |
|---|---|---|---|---|---|
| Slagsnare Cowl (`slagsnare_helmet`) | helmet | 185 | Agi 14, Sta 7 | none | haste 60, crit 25 |
| Slagsnare Spaulders (`slagsnare_shoulder`) | shoulder | 165 | Agi 12, Sta 6 | none | haste 60, crit 25 |
| Slagsnare Tunic (`slagsnare_chest`) | chest | 215 | Agi 17, Sta 8 | none | haste 60, crit 25 |
| Slagsnare Grips (`slagsnare_gloves`) | gloves | 150 | Agi 11, Sta 6 | none | haste 60, crit 25 |
| Slagsnare Breeches (`slagsnare_legs`) | legs | 195 | Agi 15, Sta 7 | none | haste 60, crit 25 |

### Rogue

**Cinderfang Shroud** (`cinderfang`), assassination (Knifework), leather. 2 pieces: Venom Dart extends your venom wound by 8 sec and awards a combo point. 4 pieces: Venomrend's fresh wound begins at ritual stage 2, and its energy return rises to 30.

| Piece | Slot | Armor | Stats | Affix | Ratings |
|---|---|---|---|---|---|
| Cinderfang Cowl (`cinderfang_helmet`) | helmet | 185 | Agi 14, Sta 7 | none | crit 60, haste 25 |
| Cinderfang Spaulders (`cinderfang_shoulder`) | shoulder | 165 | Agi 12, Sta 6 | none | crit 60, haste 25 |
| Cinderfang Tunic (`cinderfang_chest`) | chest | 215 | Agi 17, Sta 8 | none | crit 60, haste 25 |
| Cinderfang Grips (`cinderfang_gloves`) | gloves | 150 | Agi 11, Sta 6 | none | crit 60, haste 25 |
| Cinderfang Breeches (`cinderfang_legs`) | legs | 195 | Agi 15, Sta 7 | none | crit 60, haste 25 |

**Smolderstrike Leathers** (`smolderstrike`), combat (Thuggery), leather. 2 pieces: Redline stays open for 10 sec. 4 pieces: Lights Out delivered at full Redline depth refunds 20 sec of Mirrored Blades' cooldown, and its energy return rises to 40.

| Piece | Slot | Armor | Stats | Affix | Ratings |
|---|---|---|---|---|---|
| Smolderstrike Cowl (`smolderstrike_helmet`) | helmet | 185 | Agi 14, Sta 7 | none | haste 60, crit 25 |
| Smolderstrike Spaulders (`smolderstrike_shoulder`) | shoulder | 165 | Agi 12, Sta 6 | none | haste 60, crit 25 |
| Smolderstrike Tunic (`smolderstrike_chest`) | chest | 215 | Agi 17, Sta 8 | none | haste 60, crit 25 |
| Smolderstrike Grips (`smolderstrike_gloves`) | gloves | 150 | Agi 11, Sta 6 | none | haste 60, crit 25 |
| Smolderstrike Breeches (`smolderstrike_legs`) | legs | 195 | Agi 15, Sta 7 | none | haste 60, crit 25 |

**Ashveil Garb** (`ashveil`), subtlety (Skulduggery), leather. 2 pieces: Openers used from Duskveil bank 2 Gloam. 4 pieces: The Shadow Veil opened at 3 Gloam lasts 9 sec and arms a second doubled Lurker's Strike.

| Piece | Slot | Armor | Stats | Affix | Ratings |
|---|---|---|---|---|---|
| Ashveil Cowl (`ashveil_helmet`) | helmet | 185 | Agi 14, Sta 7 | none | crit 60, haste 25 |
| Ashveil Spaulders (`ashveil_shoulder`) | shoulder | 165 | Agi 12, Sta 6 | none | crit 60, haste 25 |
| Ashveil Tunic (`ashveil_chest`) | chest | 215 | Agi 17, Sta 8 | none | crit 60, haste 25 |
| Ashveil Grips (`ashveil_gloves`) | gloves | 150 | Agi 11, Sta 6 | none | crit 60, haste 25 |
| Ashveil Breeches (`ashveil_legs`) | legs | 195 | Agi 15, Sta 7 | none | crit 60, haste 25 |

### Priest

**Creed of Embers Vestments** (`emberscreed`), discipline (Doctrine), cloth. 2 pieces: Your Doctrine link converts 40% of your damage into healing. Damage taken no longer delays your spellcasting. 4 pieces: When your Psalm of Warding is fully consumed, your next Scouring Hymn is instant and free.

| Piece | Slot | Armor | Stats | Affix | Ratings |
|---|---|---|---|---|---|
| Creed of Embers Hood (`emberscreed_helmet`) | helmet | 90 | Int 11, Spi 10 | Healing Power 25 | haste 60, crit 25 |
| Creed of Embers Mantle (`emberscreed_shoulder`) | shoulder | 80 | Int 9, Spi 9 | Healing Power 18 | haste 60, crit 25 |
| Creed of Embers Robe (`emberscreed_chest`) | chest | 105 | Int 13, Spi 12 | Healing Power 25 | haste 60, crit 25 |
| Creed of Embers Handwraps (`emberscreed_gloves`) | gloves | 75 | Int 9, Spi 8 | Healing Power 18 | haste 60, crit 25 |
| Creed of Embers Leggings (`emberscreed_legs`) | legs | 95 | Int 11, Spi 11 | Healing Power 25 | haste 60, crit 25 |

**Benison Dawnweave** (`benison_dawnweave`), holy (Benison), cloth. 2 pieces: Seraphic Vigil watches for allies falling below 50% health instead of 35%. Damage taken no longer delays your spellcasting. 4 pieces: When Seraphic Vigil fires, your next Choirmend costs half as much and casts 30% faster.

| Piece | Slot | Armor | Stats | Affix | Ratings |
|---|---|---|---|---|---|
| Dawnweave Hood (`benison_dawnweave_helmet`) | helmet | 90 | Int 11, Spi 10 | Healing Power 25 | crit 60, haste 25 |
| Dawnweave Mantle (`benison_dawnweave_shoulder`) | shoulder | 80 | Int 9, Spi 9 | Healing Power 18 | crit 60, haste 25 |
| Dawnweave Robe (`benison_dawnweave_chest`) | chest | 105 | Int 13, Spi 12 | Healing Power 25 | crit 60, haste 25 |
| Dawnweave Handwraps (`benison_dawnweave_gloves`) | gloves | 75 | Int 9, Spi 8 | Healing Power 18 | crit 60, haste 25 |
| Dawnweave Leggings (`benison_dawnweave_legs`) | legs | 95 | Int 11, Spi 11 | Healing Power 25 | crit 60, haste 25 |

**Vesperash Shroud** (`vesperash`), shadow (Vespers), cloth. 2 pieces: Mindfracture grants 2 Gloomtithe. Damage taken no longer delays your spellcasting. 4 pieces: Summoning your Tithefiend at 5 Gloomtithe resets Mindfracture's cooldown, and the fiend returns twice as much mana per hit.

| Piece | Slot | Armor | Stats | Affix | Ratings |
|---|---|---|---|---|---|
| Vesperash Hood (`vesperash_helmet`) | helmet | 90 | Int 14, Spi 7 | Spell Damage 14 | crit 60, haste 25 |
| Vesperash Mantle (`vesperash_shoulder`) | shoulder | 80 | Int 12, Spi 6 | Spell Damage 10 | crit 60, haste 25 |
| Vesperash Robe (`vesperash_chest`) | chest | 105 | Int 17, Spi 8 | Spell Damage 14 | crit 60, haste 25 |
| Vesperash Handwraps (`vesperash_gloves`) | gloves | 75 | Int 11, Spi 6 | Spell Damage 10 | crit 60, haste 25 |
| Vesperash Leggings (`vesperash_legs`) | legs | 95 | Int 15, Spi 7 | Spell Damage 14 | crit 60, haste 25 |

### Shaman

**Stormkindled Regalia** (`stormkindled`), elemental (Thundercall), mail. 2 pieces: Unleash Weapon on Pyrebrand grants 3 Thunder. Damage taken no longer delays your spellcasting. 4 pieces: Venting a full 5-Thunder Earthen Jolt makes your next Arc Bolt instant and grants 1 Thunder.

| Piece | Slot | Armor | Stats | Affix | Ratings |
|---|---|---|---|---|---|
| Stormkindled Helm (`stormkindled_helmet`) | helmet | 325 | Int 14, Spi 7 | Spell Damage 14 | crit 60, haste 25 |
| Stormkindled Pauldrons (`stormkindled_shoulder`) | shoulder | 290 | Int 12, Spi 6 | Spell Damage 10 | crit 60, haste 25 |
| Stormkindled Hauberk (`stormkindled_chest`) | chest | 380 | Int 17, Spi 8 | Spell Damage 14 | crit 60, haste 25 |
| Stormkindled Gauntlets (`stormkindled_gloves`) | gloves | 270 | Int 11, Spi 6 | Spell Damage 10 | crit 60, haste 25 |
| Stormkindled Legguards (`stormkindled_legs`) | legs | 345 | Int 15, Spi 7 | Spell Damage 14 | crit 60, haste 25 |

**Warspirit Emberscale** (`warspirit_emberscale`), enhancement (Warspirit), mail. 2 pieces: Ancestral Strike advances your cadence 3 steps. 4 pieces: Consuming Stormcast fires one additional Galeheart Echo at 50% damage, and Stormsurge's chance rises to 35%.

| Piece | Slot | Armor | Stats | Affix | Ratings |
|---|---|---|---|---|---|
| Emberscale Helm (`warspirit_emberscale_helmet`) | helmet | 325 | Agi 14, Sta 7 | none | haste 60, crit 25 |
| Emberscale Pauldrons (`warspirit_emberscale_shoulder`) | shoulder | 290 | Agi 12, Sta 6 | none | haste 60, crit 25 |
| Emberscale Hauberk (`warspirit_emberscale_chest`) | chest | 380 | Agi 17, Sta 8 | none | haste 60, crit 25 |
| Emberscale Gauntlets (`warspirit_emberscale_gloves`) | gloves | 270 | Agi 11, Sta 6 | none | haste 60, crit 25 |
| Emberscale Legguards (`warspirit_emberscale_legs`) | legs | 345 | Agi 15, Sta 7 | none | haste 60, crit 25 |

**Stonehearth Bastion** (`stonehearth`), enhancement (Warspirit), off-tank, mail. 2 pieces: Stonebound's damage penalty softens to 5%. 4 pieces: While Stonebound, every completed cadence grants an absorb equal to 4% of your maximum health, stacking up to 12%.

| Piece | Slot | Armor | Stats | Affix | Ratings |
|---|---|---|---|---|---|
| Stonehearth Helm (`stonehearth_helmet`) | helmet | 325 | Agi 10, Sta 11 | none | crit 60, haste 25 |
| Stonehearth Pauldrons (`stonehearth_shoulder`) | shoulder | 290 | Agi 8, Sta 10 | none | crit 60, haste 25 |
| Stonehearth Hauberk (`stonehearth_chest`) | chest | 380 | Agi 11, Sta 14 | none | crit 60, haste 25 |
| Stonehearth Gauntlets (`stonehearth_gloves`) | gloves | 270 | Agi 8, Sta 9 | none | crit 60, haste 25 |
| Stonehearth Legguards (`stonehearth_legs`) | legs | 345 | Agi 10, Sta 12 | none | crit 60, haste 25 |

**Springmender Scale** (`springmender`), restoration (Spiritmend), mail. 2 pieces: Mending Waters deposits 65% of its healing as Mending Current. Damage taken no longer delays your spellcasting. 4 pieces: Cascading Mend reaches a fourth ally and harvests Mending Currents at 150%.

| Piece | Slot | Armor | Stats | Affix | Ratings |
|---|---|---|---|---|---|
| Springmender Helm (`springmender_helmet`) | helmet | 325 | Int 11, Spi 10 | Healing Power 25 | haste 60, crit 25 |
| Springmender Pauldrons (`springmender_shoulder`) | shoulder | 290 | Int 9, Spi 9 | Healing Power 18 | haste 60, crit 25 |
| Springmender Hauberk (`springmender_chest`) | chest | 380 | Int 13, Spi 12 | Healing Power 25 | haste 60, crit 25 |
| Springmender Gauntlets (`springmender_gloves`) | gloves | 270 | Int 9, Spi 8 | Healing Power 18 | haste 60, crit 25 |
| Springmender Legguards (`springmender_legs`) | legs | 345 | Int 11, Spi 11 | Healing Power 25 | haste 60, crit 25 |

### Mage

**Chronoweave Vestments** (`chronoweave`), arcane (Chronomancy), cloth. 2 pieces: Temporal Echo converts 50% of your single-target Arcane damage into healing. Damage taken no longer delays your spellcasting. 4 pieces: While at 4 Arcane Charges, Aether Surge's chance to arm Aether Rush doubles to 50%.

| Piece | Slot | Armor | Stats | Affix | Ratings |
|---|---|---|---|---|---|
| Chronoweave Hood (`chronoweave_helmet`) | helmet | 90 | Int 11, Spi 10 | Healing Power 25 | haste 60, crit 25 |
| Chronoweave Mantle (`chronoweave_shoulder`) | shoulder | 80 | Int 9, Spi 9 | Healing Power 18 | haste 60, crit 25 |
| Chronoweave Robe (`chronoweave_chest`) | chest | 105 | Int 13, Spi 12 | Healing Power 25 | haste 60, crit 25 |
| Chronoweave Handwraps (`chronoweave_gloves`) | gloves | 75 | Int 9, Spi 8 | Healing Power 18 | haste 60, crit 25 |
| Chronoweave Leggings (`chronoweave_legs`) | legs | 95 | Int 11, Spi 11 | Healing Power 25 | haste 60, crit 25 |

**Pyroclast Regalia** (`pyroclast`), fire (Pyromancy), cloth. 2 pieces: Cinderfall gains a second charge. Damage taken no longer delays your spellcasting. 4 pieces: A Pyrelance spent on Hot Streak leaves its Ignite burning 50% hotter.

| Piece | Slot | Armor | Stats | Affix | Ratings |
|---|---|---|---|---|---|
| Pyroclast Hood (`pyroclast_helmet`) | helmet | 90 | Int 14, Spi 7 | Spell Damage 14 | crit 60, haste 25 |
| Pyroclast Mantle (`pyroclast_shoulder`) | shoulder | 80 | Int 12, Spi 6 | Spell Damage 10 | crit 60, haste 25 |
| Pyroclast Robe (`pyroclast_chest`) | chest | 105 | Int 17, Spi 8 | Spell Damage 14 | crit 60, haste 25 |
| Pyroclast Handwraps (`pyroclast_gloves`) | gloves | 75 | Int 11, Spi 6 | Spell Damage 10 | crit 60, haste 25 |
| Pyroclast Leggings (`pyroclast_legs`) | legs | 95 | Int 15, Spi 7 | Spell Damage 14 | crit 60, haste 25 |

**Frostquench Weave** (`frostquench`), frost (Cryomancy), cloth. 2 pieces: Rimelance critical strikes bank a second Icicle. Damage taken no longer delays your spellcasting. 4 pieces: Glacial Spike grants 2 Fingers of Frost, and an Ice Lance spent on Winter's Chill shaves 2 sec off Winterlash's cooldown.

| Piece | Slot | Armor | Stats | Affix | Ratings |
|---|---|---|---|---|---|
| Frostquench Hood (`frostquench_helmet`) | helmet | 90 | Int 14, Spi 7 | Spell Damage 14 | haste 60, crit 25 |
| Frostquench Mantle (`frostquench_shoulder`) | shoulder | 80 | Int 12, Spi 6 | Spell Damage 10 | haste 60, crit 25 |
| Frostquench Robe (`frostquench_chest`) | chest | 105 | Int 17, Spi 8 | Spell Damage 14 | haste 60, crit 25 |
| Frostquench Handwraps (`frostquench_gloves`) | gloves | 75 | Int 11, Spi 6 | Spell Damage 10 | haste 60, crit 25 |
| Frostquench Leggings (`frostquench_legs`) | legs | 95 | Int 15, Spi 7 | Spell Damage 14 | haste 60, crit 25 |

### Warlock

**Hexthread Shroud** (`hexthread`), affliction (Hexcraft), cloth. 2 pieces: Evil Eye lasts 30 sec. Damage taken no longer delays your spellcasting. 4 pieces: A Sentence passed at 80 or more Condemnation refunds 25, and each Fate Thread adds 8% to its damage.

| Piece | Slot | Armor | Stats | Affix | Ratings |
|---|---|---|---|---|---|
| Hexthread Hood (`hexthread_helmet`) | helmet | 90 | Int 14, Spi 7 | Spell Damage 14 | haste 60, crit 25 |
| Hexthread Mantle (`hexthread_shoulder`) | shoulder | 80 | Int 12, Spi 6 | Spell Damage 10 | haste 60, crit 25 |
| Hexthread Robe (`hexthread_chest`) | chest | 105 | Int 17, Spi 8 | Spell Damage 14 | haste 60, crit 25 |
| Hexthread Handwraps (`hexthread_gloves`) | gloves | 75 | Int 11, Spi 6 | Spell Damage 10 | haste 60, crit 25 |
| Hexthread Leggings (`hexthread_legs`) | legs | 95 | Int 15, Spi 7 | Spell Damage 14 | haste 60, crit 25 |

**Gravebrand Regalia** (`gravebrand`), demonology (Necromancy), cloth. 2 pieces: Essence Reap creates a second Soul Fragment on critical strikes. Damage taken no longer delays your spellcasting. 4 pieces: Reaping Command costs 1 Soul Fragment, and detonating your Ossuary Mark grants 2 Soul Fragments.

| Piece | Slot | Armor | Stats | Affix | Ratings |
|---|---|---|---|---|---|
| Gravebrand Hood (`gravebrand_helmet`) | helmet | 90 | Int 14, Spi 7 | Spell Damage 14 | crit 60, haste 25 |
| Gravebrand Mantle (`gravebrand_shoulder`) | shoulder | 80 | Int 12, Spi 6 | Spell Damage 10 | crit 60, haste 25 |
| Gravebrand Robe (`gravebrand_chest`) | chest | 105 | Int 17, Spi 8 | Spell Damage 14 | crit 60, haste 25 |
| Gravebrand Handwraps (`gravebrand_gloves`) | gloves | 75 | Int 11, Spi 6 | Spell Damage 10 | crit 60, haste 25 |
| Gravebrand Leggings (`gravebrand_legs`) | legs | 95 | Int 15, Spi 7 | Spell Damage 14 | crit 60, haste 25 |

**Ruincaller Vestments** (`ruincaller`), destruction (Ruination), cloth. 2 pieces: Conflagrate gains a third charge. Damage taken no longer delays your spellcasting. 4 pieces: Ruinbolt spends every banked Wrack, dealing 12% more damage for each point beyond the third.

| Piece | Slot | Armor | Stats | Affix | Ratings |
|---|---|---|---|---|---|
| Ruincaller Hood (`ruincaller_helmet`) | helmet | 90 | Int 14, Spi 7 | Spell Damage 14 | crit 60, haste 25 |
| Ruincaller Mantle (`ruincaller_shoulder`) | shoulder | 80 | Int 12, Spi 6 | Spell Damage 10 | crit 60, haste 25 |
| Ruincaller Robe (`ruincaller_chest`) | chest | 105 | Int 17, Spi 8 | Spell Damage 14 | crit 60, haste 25 |
| Ruincaller Handwraps (`ruincaller_gloves`) | gloves | 75 | Int 11, Spi 6 | Spell Damage 10 | crit 60, haste 25 |
| Ruincaller Leggings (`ruincaller_legs`) | legs | 95 | Int 15, Spi 7 | Spell Damage 14 | crit 60, haste 25 |

### Druid

**Moonscorch Raiment** (`moonscorch`), balance (Moongrove), leather. 2 pieces: Moonseed extends Lunar Tempest by 9 sec. Damage taken no longer delays your spellcasting. 4 pieces: Moonsurge also restores 35 mana, and Sunwake leaves 1 Moontide banked after it spends the tide.

| Piece | Slot | Armor | Stats | Affix | Ratings |
|---|---|---|---|---|---|
| Moonscorch Cowl (`moonscorch_helmet`) | helmet | 185 | Int 14, Spi 7 | Spell Damage 14 | crit 60, haste 25 |
| Moonscorch Spaulders (`moonscorch_shoulder`) | shoulder | 165 | Int 12, Spi 6 | Spell Damage 10 | crit 60, haste 25 |
| Moonscorch Tunic (`moonscorch_chest`) | chest | 215 | Int 17, Spi 8 | Spell Damage 14 | crit 60, haste 25 |
| Moonscorch Grips (`moonscorch_gloves`) | gloves | 150 | Int 11, Spi 6 | Spell Damage 10 | crit 60, haste 25 |
| Moonscorch Breeches (`moonscorch_legs`) | legs | 195 | Int 15, Spi 7 | Spell Damage 14 | crit 60, haste 25 |

**Wildfang Emberhide** (`wildfang_emberhide`), feral (Wildfang), cat, leather. 2 pieces: Redharvest's energy return rises by 15. 4 pieces: Redharvest leaves your Flense bleed ticking when it cashes out your wounds. Cannot occur more than once every 20 sec.

| Piece | Slot | Armor | Stats | Affix | Ratings |
|---|---|---|---|---|---|
| Wildfang Cowl (`wildfang_emberhide_helmet`) | helmet | 185 | Agi 14, Sta 7 | none | crit 60, haste 25 |
| Wildfang Spaulders (`wildfang_emberhide_shoulder`) | shoulder | 165 | Agi 12, Sta 6 | none | crit 60, haste 25 |
| Wildfang Tunic (`wildfang_emberhide_chest`) | chest | 215 | Agi 17, Sta 8 | none | crit 60, haste 25 |
| Wildfang Grips (`wildfang_emberhide_gloves`) | gloves | 150 | Agi 11, Sta 6 | none | crit 60, haste 25 |
| Wildfang Breeches (`wildfang_emberhide_legs`) | legs | 195 | Agi 15, Sta 7 | none | crit 60, haste 25 |

**Cinderbark Ward** (`cinderbark`), feral (Wildfang), bear tank, leather. 2 pieces: Sweeping Claws banks Old Blood for every enemy struck. 4 pieces: Marrowbreak's emergency shield grows to 25% of your maximum health and refunds 25 rage.

| Piece | Slot | Armor | Stats | Affix | Ratings |
|---|---|---|---|---|---|
| Cinderbark Cowl (`cinderbark_helmet`) | helmet | 185 | Agi 10, Sta 11 | none | crit 60, haste 25 |
| Cinderbark Spaulders (`cinderbark_shoulder`) | shoulder | 165 | Agi 8, Sta 10 | none | crit 60, haste 25 |
| Cinderbark Tunic (`cinderbark_chest`) | chest | 215 | Agi 11, Sta 14 | none | crit 60, haste 25 |
| Cinderbark Grips (`cinderbark_gloves`) | gloves | 150 | Agi 8, Sta 9 | none | crit 60, haste 25 |
| Cinderbark Breeches (`cinderbark_legs`) | legs | 195 | Agi 10, Sta 12 | none | crit 60, haste 25 |

**Grovespring Raiment** (`grovespring`), restoration (Groveheart), leather. 2 pieces: Swiftmend does not consume the effect it feeds on. Cannot occur more than once every 20 sec. Damage taken no longer delays your spellcasting. 4 pieces: Overbloom harvests 75% of your remaining effects and immediately banks 1 Verdance.

| Piece | Slot | Armor | Stats | Affix | Ratings |
|---|---|---|---|---|---|
| Grovespring Cowl (`grovespring_helmet`) | helmet | 185 | Int 11, Spi 10 | Healing Power 25 | haste 60, crit 25 |
| Grovespring Spaulders (`grovespring_shoulder`) | shoulder | 165 | Int 9, Spi 9 | Healing Power 18 | haste 60, crit 25 |
| Grovespring Tunic (`grovespring_chest`) | chest | 215 | Int 13, Spi 12 | Healing Power 25 | haste 60, crit 25 |
| Grovespring Grips (`grovespring_gloves`) | gloves | 150 | Int 9, Spi 8 | Healing Power 18 | haste 60, crit 25 |
| Grovespring Breeches (`grovespring_legs`) | legs | 195 | Int 11, Spi 11 | Healing Power 25 | haste 60, crit 25 |

## The 15 sigils

Tokens are kind tool, epic, soulbound, noDiscard, stack 20, class-locked
to their group. One sigil buys any one matching-slot set piece for the
holder's class at the Crucible Quartermaster.

| Sigil | Classes | Redeems |
|---|---|---|
| Helm Sigil of the Anvil (`sigil_anvil_helmet`) | warrior, priest, druid | any helmet set piece for your class |
| Helm Sigil of the Ember (`sigil_ember_helmet`) | paladin, rogue, shaman | any helmet set piece for your class |
| Helm Sigil of the Tempest (`sigil_tempest_helmet`) | hunter, mage, warlock | any helmet set piece for your class |
| Mantle Sigil of the Anvil (`sigil_anvil_shoulder`) | warrior, priest, druid | any shoulder set piece for your class |
| Mantle Sigil of the Ember (`sigil_ember_shoulder`) | paladin, rogue, shaman | any shoulder set piece for your class |
| Mantle Sigil of the Tempest (`sigil_tempest_shoulder`) | hunter, mage, warlock | any shoulder set piece for your class |
| Robe Sigil of the Anvil (`sigil_anvil_chest`) | warrior, priest, druid | any chest set piece for your class |
| Robe Sigil of the Ember (`sigil_ember_chest`) | paladin, rogue, shaman | any chest set piece for your class |
| Robe Sigil of the Tempest (`sigil_tempest_chest`) | hunter, mage, warlock | any chest set piece for your class |
| Grip Sigil of the Anvil (`sigil_anvil_gloves`) | warrior, priest, druid | any gloves set piece for your class |
| Grip Sigil of the Ember (`sigil_ember_gloves`) | paladin, rogue, shaman | any gloves set piece for your class |
| Grip Sigil of the Tempest (`sigil_tempest_gloves`) | hunter, mage, warlock | any gloves set piece for your class |
| Legging Sigil of the Anvil (`sigil_anvil_legs`) | warrior, priest, druid | any legs set piece for your class |
| Legging Sigil of the Ember (`sigil_ember_legs`) | paladin, rogue, shaman | any legs set piece for your class |
| Legging Sigil of the Tempest (`sigil_tempest_legs`) | hunter, mage, warlock | any legs set piece for your class |

## Off-set waist and feet, all ten variants

Waist budget 17, feet 16. The Hit-flavored waists are the deliberate Hit
electives; healer waists take haste instead.

| Variant | Piece | Slot | Armor | Stats | Affix | Ratings | Classes |
|---|---|---|---|---|---|---|---|
| Cloth spell damage | Cord of the Last Flame | waist | 75 | Int 11, Spi 6 | Spell Damage 10 | hit 60, crit 25 | mage, priest, warlock |
| Cloth spell damage | Cindersoaked Slippers | feet | 70 | Int 11, Spi 5 | Spell Damage 8 | crit 60, haste 25 | mage, priest, warlock |
| Cloth healing | Springbinder Sash | waist | 75 | Int 9, Spi 8 | Healing Power 18 | haste 60, crit 25 | mage, priest |
| Cloth healing | Steps of Quiet Water | feet | 70 | Int 8, Spi 8 | Healing Power 14 | haste 60, crit 25 | mage, priest |
| Leather tanking | Cinderbark Cinch | waist | 150 | Agi 8, Sta 9 | none | hit 60, crit 25 | druid |
| Leather tanking | Ashenbark Treads | feet | 145 | Agi 7, Sta 9 | none | crit 60, haste 25 | druid |
| Leather dps | Slagstalker Belt | waist | 150 | Agi 11, Sta 6 | none | hit 60, crit 25 | rogue, hunter, druid |
| Leather dps | Ashrunner Boots | feet | 145 | Agi 11, Sta 5 | none | crit 60, haste 25 | rogue, hunter, druid |
| Leather spell damage | Moonscorch Waistwrap | waist | 150 | Int 11, Spi 6 | Spell Damage 10 | hit 60, crit 25 | druid |
| Leather spell damage | Scorchgrove Striders | feet | 145 | Int 11, Spi 5 | Spell Damage 8 | crit 60, haste 25 | druid |
| Leather healing | Grovetender Belt | waist | 150 | Int 9, Spi 8 | Healing Power 18 | haste 60, crit 25 | druid |
| Leather healing | Dewfall Moccasins | feet | 145 | Int 8, Spi 8 | Healing Power 14 | haste 60, crit 25 | druid |
| Mail tanking | Forgewall Girdle | waist | 270 | Str 8, Sta 9 | none | hit 60, crit 25 | warrior, paladin, shaman |
| Mail tanking | Anvilstance Sabatons | feet | 255 | Str 7, Sta 9 | none | crit 60, haste 25 | warrior, paladin, shaman |
| Mail dps | Warforged Waistguard | waist | 270 | Str 11, Sta 6 | none | hit 60, crit 25 | warrior, paladin, shaman |
| Mail dps | Furnace March Greaves | feet | 255 | Str 11, Sta 5 | none | crit 60, haste 25 | warrior, paladin, shaman |
| Mail spell damage | Stormkindled Chain | waist | 270 | Int 11, Spi 6 | Spell Damage 10 | hit 60, crit 25 | shaman |
| Mail spell damage | Thundershock Treads | feet | 255 | Int 11, Spi 5 | Spell Damage 8 | crit 60, haste 25 | shaman |
| Mail healing | Tidebinder Links | waist | 270 | Int 9, Spi 8 | Healing Power 18 | haste 60, crit 25 | paladin, shaman |
| Mail healing | Springwarden Sabatons | feet | 255 | Int 8, Spi 8 | Healing Power 14 | haste 60, crit 25 | paladin, shaman |

## Jewelry

Class-open (no armor type). Neck budget 16, ring 15, one rating each.

| Piece | Slot | Role | Stats | Affix | Rating |
|---|---|---|---|---|---|
| Pendant of the First Tempering | neck | tank | Str 7, Sta 9 | none | crit 25 |
| Ignivar's Ember Choker | neck | physical dps | Str 8, Agi 8 | none | hit 25 |
| Locket of the Last Flame | neck | spell damage | Int 11, Spi 5 | Spell Damage 8 | crit 25 |
| Heartspring Amulet | neck | healing | Int 8, Spi 8 | Healing Power 14 | haste 25 |
| Seal of the Forgewall | ring | tank | Str 7, Sta 8 | none | crit 25 |
| Band of Marked Strikes | ring | physical dps | Str 8, Agi 7 | none | hit 25 |
| Circle of Cinders | ring | spell damage | Int 10, Spi 5 | Spell Damage 8 | hit 25 |
| Loop of Quiet Springs | ring | healing | Int 8, Spi 7 | Healing Power 14 | haste 25 |

## Shields and held offhands

Held-slot budget 18 (offhand mult 0.75).

| Piece | Kind | Stats | Affix | Ratings | Extra | Classes |
|---|---|---|---|---|---|---|
| Bulwark of the Inner Crucible | shield | Str 8, Sta 10 | none | crit 25 | armor 1250, block 30 | warrior, paladin, shaman |
| Ember Warden's Barrier | shield | Int 9, Spi 9 | Healing Power 18 | haste 25 | armor 1250, block 22 | paladin, shaman |
| Orb of the Last Spring | held offhand | Int 9, Spi 9 | Healing Power 18 | haste 25 | | priest, mage, druid, paladin, shaman |
| Cinder of the First Design | held offhand | Int 12, Spi 6 | Spell Damage 10 | crit 25 | | mage, priest, warlock, druid |

## Weapons

One-hand dps budget 17.2 at item level 35, two-hand 19.8 (the 1.15
premium); damage ranges keep a plus or minus 20 percent spread around
average = dps x speed. One-hand stat budget 25, two-hand 33.

| Weapon | Type | Hand | Speed | Damage | Stats | Affix | Ratings |
|---|---|---|---|---|---|---|---|
| Forgefather's Warhammer | mace | one-hand | 2.6 | 36 to 54 | Str 17, Sta 8 | none | crit 70, haste 30 |
| Cinderfang Kris | dagger | one-hand | 1.8 | 25 to 37 | Agi 17, Sta 8 | none | crit 70, hit 30 |
| Slagrender Cleaver | axe | one-hand | 2.4 | 33 to 50 | Str 9, Agi 9, Sta 7 | none | crit 70, hit 30 |
| Anvilguard Blade | sword | one-hand | 2.6 | 36 to 54 | Str 11, Sta 14 | none | crit 70, haste 30 |
| Heart of the End Greatblade | sword | two-hand | 3.5 | 55 to 83 | Str 22, Sta 11 | none | crit 70, haste 30 |
| Emberflight Longbow | bow | ranged mainhand | 2.8 | 39 to 58 | Agi 17, Sta 8 | none | crit 70, haste 30 |
| Staff of the Last Spring | staff | two-hand | 3.2 | 51 to 76 | Int 17, Spi 16 | Healing Power 45 | haste 70, crit 30 |
| Forgefire Spire | staff | two-hand | 3.2 | 51 to 76 | Int 22, Spi 11 | Spell Damage 26 | crit 70, haste 30 |
| Springtouched Crozier | mace | one-hand | 2.4 | 33 to 50 | Int 13, Spi 12 | Healing Power 30 | haste 70, crit 30 |
| Wand of Quenched Sparks | wand | mainhand | 1.5 | 21 to 31 | Int 17, Spi 8 | Spell Damage 10 | crit 70, hit 30 |

Every weapon gets its WEAPON_TYPE_BY_ITEM row and weapon-variant art
registration. Cinderfang Kris is a dagger for backstab eligibility.

## Changes to existing gear (the retune), complete list

Full rationale, the parse evidence, and the viability math are in the plan
doc's Prerequisite section; this is the change list for review. All of it
ships in the same release as the new loot, never earlier.

**1. Lineage merge with 2/4/6 breakpoints.** Each archetype's tier-1 and
tier-2 families count as ONE lineage (ItemSet gains a lineage id;
aggregateSetBonuses sums counts across the lineage's families and applies
one shared table; item ids, tags, and names unchanged):

| Lineage | Families | 2 pieces | 4 pieces | 6 pieces |
|---|---|---|---|---|
| Strength | deathlord + crownforged | Str 10, Sta 10 | attack power 25 + Gravemight at 40 attack power | 4 percent haste + Hit 3 percent + Bonesplinter at 5 per tick |
| Agility | wyrmshadow + nighttalon | Agi 10, crit 1 percent | attack power 25 + Fangrush at 15 percent attack speed | 4 percent haste + Hit 3 percent + Ragged Gash at 4 per tick |
| Caster | necromancers + soulflame + stormcallers | Int 10, Spi 10, 50 percent pushback | spell power 12 + Clearcasting at 6 percent chance | 4 percent haste + Soulblaze at 25 spell power |

Today's tiers for contrast: 2/3/4 per family, stackable across families,
paying up to 80 attack power, 30 stats, 7.5 percent haste, 6 percent Hit,
and a heavier bleed from seven worn pieces.

**2. Constants.** SET_HASTE_3PC_RATING 150 to 80 (7.5 to 4 percent;
SET_HASTE_3PC moves in step), SET_HIT_4PC_RATING 60 to 30. Proc values:
Gravemight 60 to 40 attack power, Fangrush 25 to 15 percent, Clearcasting
10 to 6 percent chance, Soulblaze 40 to 25 spell power, Bonesplinter 8 to
5 per tick, Ragged Gash 6 to 4 per tick. Caster pushback: full immunity
to 50 percent on the incumbents; full immunity moves to every new caster
and healer set's 2-piece. WARFARE and the haste leveling kits: WARFARE
untouched; the kits ride the shared haste constant down.

**3. The Hit program flips (live items).**

| Item | Today | Becomes |
|---|---|---|
| crownforged helmet and shoulders (authored seeds) | hitRating 20 | critRating 20 |
| nighttalon crown and shoulderguards | hitRating 20 | critRating 20 |
| soulflame cowl and mantle | hitRating 20 | hasteRating 20 |
| crownforged/nighttalon/soulflame gloves and waists (world boss pieces) | hitRating 20 | same flip as their family |
| heroic raid variants of all the above | 55 Hit primary (derived) | 55 crit or haste (follows the seed automatically) |
| morthens_cryptforged_hauberk (heroic five-man chest) | hitRating 40 | critRating 40 |
| bloodmane_war_legguards (heroic five-man legs) | hitRating 40 | critRating 40 |
| tideworn_warboots (heroic five-man feet) | hitRating 40 | critRating 40 |
| gravescale_girdle (heroic five-man waist) | hitRating 40 | critRating 40 |
| swiftfang_talisman (mark-vendor jewelry) | hitRating 25 | hasteRating 25 |

Kept as the deliberate Hit answers: basin_stalkers_tunic,
tidewoven_trousers, bonechill_striders, bonechill_cord,
seal_of_the_nine_oaths, oath_of_the_round_table, the two Hit-carrying
heroic mainhands, and the four caster heroic Hit pieces. Rule: every
physical slot family keeps one Hit and one non-Hit option at comparable
power.

## Counts and gates

202 new item ids: 145 set pieces, 15 sigils, 20 waist/feet, 8 jewelry, 4
shields/held offhands, 10 weapons. 192 icons through the assets:items
pipeline (weapons register through the variant tables). Acceptance gates:
the item_level.test.ts budget sweep over every piece above, the
old-versus-new balance harness (full six-piece lineage versus full new
kit per archetype, plus the blend paths), and the drop tables in the plan
doc's boss sections.
