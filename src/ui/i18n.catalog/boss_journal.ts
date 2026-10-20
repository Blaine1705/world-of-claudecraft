// i18n source catalog: the five-player dungeon boss guides (the encounter
// journal opened from party frames or the Dungeon Finder; data modules under
// src/ui/boss_journal/dungeons/). Every line states what the encounter code
// really does (src/sim/encounters/<dungeon>/), with its numbers passed in as
// placeholders resolved per difficulty, never typed here. Cast names are NOT
// repeated: a mechanic with a cast bar reads its name from
// abilityUi.cast.<castId>, so the guide and the bar always agree.
//
// Assembled into `en` by ./index.ts under the `bossJournal` namespace.
// English here; the five non-Latin fills (M16) ride the locale overlays, the
// rest the maintainer fills at release.

export const bossJournalStrings = {
  common: {
    enrageName: 'Enrage',
    phaseEnrageSummary: 'Below {health} health the boss enrages for the rest of the fight.',
    enrageSummary:
      'Below {health} health its melee attacks deal {damage} more damage and come {haste} faster, for the rest of the fight.',
    enrageResponse:
      'Tank and healer save their defensive and healing cooldowns for this phase. Everyone else pushes damage to end it fast.',
    heroicHarder: 'Every ability on this page hits {scale} times as hard as on Normal.',
  },
  wildheart: {
    saurian: {
      overview:
        'A house-sized war-beast carrying a howdah walks a loop across the river ford. Passing it is not optional: the vine bridges open only once it is dead. Two telegraphed strikes, a healer rider at half health, and an enrage at the end.',
      phaseFordName: 'The River Ford',
      phaseFordSummary:
        'From the pull it alternates a tail sweep behind it and a stomp around it. Only one strike runs at a time.',
      phaseHowdahName: 'The Howdah Breaks',
      phaseHowdahSummary:
        'At {health} health the howdah splinters and a Howdah Hexcaller leaps down to heal the Saurian.',
      phaseEnrageName: 'Enraged',
      phaseEnrageSummary: 'Below {health} health it enrages for the rest of the fight.',
      tailSummary:
        'Every {every} sec, a {cast} sec cast, then its tail sweeps a {arc} degree cone behind it, out to {range} yd from its centre: {min} to {max} damage and a {push} yd knockback.',
      tailResponse: 'Never stand behind it. Attack from its sides.',
      stompSummary:
        'Every {every} sec, a {cast} sec cast, then everyone within {radius} yd of its centre takes {min} to {max} damage and is knocked down for {stun} sec.',
      stompResponse:
        'Everyone who can leaves the ring before the cast ends. The tank takes it; healers top the tank up after.',
      riderName: 'Howdah Rider',
      riderSummary:
        'Once, at {health} health: a Howdah Hexcaller jumps down beside the Saurian and fights alongside it, healing it with Ancestral Sap.',
      riderResponse:
        'The tank picks up the rider. Damage dealers interrupt its heal or kill it first.',
      sapSummary:
        "The rider's heal: a {cast} sec cast every {every} sec that restores {heal} of the Saurian's maximum health.",
      sapResponse: 'Interrupt it every time, or kill the rider.',
      enrageSummary:
        'Below {health} health everything it does deals {damage} more damage: melee, Tail Swipe and Earthshaking Stomp.',
      tipTank:
        'Keep it facing away from the group so nobody ends up behind its tail. Pick up the Howdah Hexcaller the moment it lands.',
      tipHealer:
        'Earthshaking Stomp knocks everyone near it down, so heal the tank after each one. Save a cooldown for the enrage.',
      tipDamage:
        'Stay at its sides, out of the tail cone and the stomp ring. At half health, interrupt Ancestral Sap or kill the rider.',
      choiceName: 'Rider first, or Saurian first?',
      choiceGain:
        'Killing the rider ends its heals for good: each Ancestral Sap restores {heal} of the Saurian every {every} sec.',
      choiceRisk:
        'While you kill the rider the Saurian keeps sweeping and stomping. Leave the rider up and someone must interrupt every heal.',
    },
    beast: {
      overview:
        'The Fanglord Beastmaster and his Great Jaguar share one health bar and die together. Standing close they are far tougher and hit harder, so the tank drags the master away while the jaguar hunts a marked player.',
      phasePitsName: 'The Beast Pits',
      phasePitsSummary:
        'One fight, two bodies. Their timers run the whole fight; there are no health phases.',
      bondName: 'Pack Bond',
      bondSummary:
        'While the Beastmaster and the jaguar stand within {reach} yd of each other, both take {dr} less damage and deal {damage} more.',
      bondHeroicSummary:
        'Frenzied Bond: while the Beastmaster and the jaguar stand within {reach} yd of each other, both take {dr} less damage and deal {damage} more.',
      bondResponse:
        'The tank drags the Beastmaster more than {reach} yd away from the jaguar and keeps him there.',
      sharedName: 'Shared Health',
      sharedSummary:
        'The two bodies share one health pool: damage on either counts the same, and when one dies the other dies too.',
      sharedResponse:
        'Hit whichever body is safest to reach. Nothing is lost by switching targets.',
      stalkName: 'Stalk',
      stalkSummary:
        "The jaguar marks a player who is not the master's tank and hunts them for {seconds} sec, ignoring taunts. In reach it bites every {biteEvery} sec: {min} to {max} damage, then a bleed of {bleed} every {bleedEvery} sec for {bleedSeconds} sec. Then it picks new prey.",
      stalkResponse:
        'Marked: run, and lead the jaguar away from the Beastmaster. Others slow, root or stun it.',
      waryName: 'Wary',
      warySummary:
        'Each kind of control (stun, root, slow) lands on the jaguar once, then that kind fails on it for {lockout} sec. Incapacitates, fears and polymorphs count as stuns.',
      waryResponse:
        'Take turns: one root, then one slow, then one stun, instead of three of the same.',
      quakeSummary:
        'Every {every} sec, a {cast} sec cast, then everyone within {radius} yd of the Beastmaster takes {min} to {max} damage.',
      quakeResponse: 'Everyone but the tank steps away from the Beastmaster.',
      huntName: 'Call of the Hunt',
      huntSummary: 'Every {every} sec both beasts attack {haste} faster for {seconds} sec.',
      huntResponse: 'Tank and healer use a cooldown through it; the jaguar bites faster too.',
      wardName: 'Thickhide Ward',
      wardSummary:
        'Every {every} sec the jaguar gains a shield that absorbs {amount} damage for {seconds} sec.',
      wardResponse: 'Hit the Beastmaster while the shield is up: the health pool is shared.',
      heelSummary:
        'Every {every} sec, a {cast} sec cast on the jaguar, then it leaps back to the Beastmaster and the bond returns.',
      heelResponse:
        'Stun, incapacitate or polymorph the jaguar during the cast to cancel it. It only works if the jaguar is not already Wary of stuns.',
      tipTank:
        'Pull the Beastmaster more than {normal} yd from the jaguar at once and hold him there, facing away from the group.',
      tipTankHeroic:
        'Pull the Beastmaster more than {heroic} yd from the jaguar at once and hold him there. After each Heel! drag him clear again.',
      tipHealer:
        'Watch the Stalk target: bites and bleeds land fast, faster during Call of the Hunt.',
      tipDamage:
        'Hit whichever body is safest. When stalked, run the jaguar away from the master; otherwise rotate slows, roots and stuns on it.',
      tipDamageHeroic:
        'Hit whichever body is safest. Keep a stun ready for every Heel! cast, and rotate slows and roots on the jaguar.',
      choiceName: 'Control the jaguar now, or save it?',
      choiceGain:
        'Slows, roots and stuns keep the jaguar off its prey and away from the Beastmaster.',
      choiceRisk:
        'Each kind of control works once, then fails for {lockout} sec, so spending all three at once leaves nothing for the next hunt.',
      choiceRiskHeroic:
        'Each kind of control works once, then fails for {lockout} sec. Spend your stun early and nothing can cancel the next Heel!.',
      heroicBond: 'Frenzied Bond: Pack Bond reaches {reach} yd.',
      heroicHeel:
        'Heel!: the jaguar leaps back to the Beastmaster unless a stun lands during its cast. Thickhide Ward absorbs {amount}.',
    },
    bloom: {
      overview:
        'A rooted man-eating flower rains seedpods on the loam beds around it. Players without pollen stamp the pods flat before they sprout; pollinated players must stay off them, or the pods sprout at once.',
      phaseTerraceName: 'The Weeping Falls',
      phaseTerraceSummary:
        'It never moves. Its cast timers pause while another cast runs, so the listed cadences are the shortest gaps.',
      seedSummary:
        'Every {every} sec, a {cast} sec cast, then {count} seedpods land, one on each loam bed. Stepping on a pod while not Pollinated stamps it out. A pod left alone sprouts a Thorn Sprout after {sprout} sec.',
      seedHeroicSummary:
        'Every {every} sec, a {cast} sec cast, then {count} seedpods land, one on each loam bed. Stepping on a pod while not Pollinated stamps it out. Burrowing Seeds: a pod left alone burrows after {burrow} sec and a Thorn Sprout rises next to the nearest player.',
      seedResponse:
        'Players who are not Pollinated walk over every pod quickly. Pollinated players stay off them.',
      pollinateName: 'Pollinate',
      pollinateSummary:
        'Every {every} sec, {count} players are Pollinated for {seconds} sec. A Pollinated player who touches a pod makes it sprout at once.',
      pollinateHeroicSummary:
        'Every {every} sec, {count} players are Pollinated for {seconds} sec. A Pollinated player who touches a pod makes it sprout at once. Pollen Cloud: standing within {cloudRadius} yd of a Pollinated player for {cloudSeconds} sec pollinates you too.',
      pollinateResponse:
        'Pollinated: keep off the pods until it wears off, and on Heroic away from allies.',
      sproutName: 'Thorn Sprout',
      sproutSummary:
        'An elite add that grows from a sprouted pod and attacks the nearest player. Sprouts wither when the Gorgebloom dies.',
      sproutResponse: 'The tank picks it up and damage dealers kill it.',
      lashSummary:
        'Every {every} sec, a {cast} sec cast aims a {length} yd lane, {width} yd wide, at a player (a non-tank when possible): {min} to {max} damage and a {root} sec root.',
      lashResponse: 'Step sideways out of the lane before the cast ends.',
      gorgeSummary:
        'Every {every} sec, a {cast} sec cast on its target, then a bite for {mult} times its melee hit and Digesting: {perSecond} damage per second for {seconds} sec. It cannot be dodged by moving.',
      gorgeResponse: 'Tank: use a defensive cooldown for it. Healers cover the Digesting damage.',
      spitName: 'Bloom Spit',
      spitSummary:
        'If its target stays out of its reach for {delay} sec, it spits every {every} sec for {min} to {max} damage.',
      spitResponse: 'The tank stays in melee range.',
      tipTank:
        'Stay in melee: walking away earns Bloom Spit. Use a cooldown for every Gorge and pick up each Thorn Sprout.',
      tipHealer:
        'Gorge is the big hit on the tank, followed by Digesting. Vine Lash roots and hurts whoever stands in its lane.',
      tipDamage:
        'If you are not Pollinated, stamp out pods between attacks. Step out of Vine Lash and kill any Thorn Sprout fast.',
      choiceName: 'Who stamps the seeds?',
      choiceGain:
        'Every pod stamped out is one less elite Thorn Sprout, and the fight stays on the flower.',
      choiceRisk:
        'Running to the beds costs damage and melee time, and a Pollinated player who touches a pod sprouts it at once.',
      heroicBurrow:
        'Burrowing Seeds: an untouched pod burrows after {burrow} sec and its Sprout rises next to the nearest player.',
      heroicCloud:
        'Pollen Cloud: standing within {cloudRadius} yd of a Pollinated player for {cloudSeconds} sec pollinates you too.',
    },
    zulgar: {
      overview:
        'The high priest of the basin. A steady fight with a telegraphed ring, until he turns into a jaguar spirit and hunts one player. The hunted player kites him across lit sun glyphs, which slow him.',
      phaseShrineName: 'The Shrine',
      phaseShrineSummary: 'He fights in melee and pulses a ring around himself.',
      phaseHuntName: 'Spirit of the Hunt',
      phaseHuntSummary:
        'At {first} and {second} health he becomes a jaguar spirit for {seconds} sec and chases a marked player.',
      phaseEnrageName: 'Enraged',
      pulseSummary:
        'Every {every} sec, a {cast} sec cast, then one burst on everyone within {radius} yd of him: {min} to {max} damage.',
      pulseResponse: 'Everyone but the tank leaves the ring before the cast ends.',
      roarName: 'Jaguar Roar',
      roarSummary:
        'Each melee hit has a {chance} chance to knock the player he hits back {distance} yd.',
      roarResponse: 'The tank keeps open ground behind them.',
      huntSummary:
        'At {first} and {second} health: a {cast} sec cast, then for {seconds} sec he hunts one marked player (the Prey, never the tank while others stand). He runs {speed} faster than a player, ignores taunts and does not attack. If he catches the Prey: {maul} damage and a {stun} sec stun, then he picks new prey. A mauled player is safe for {respite} sec.',
      huntHeroicSummary:
        'At {first} and {second} health: a {cast} sec cast, then for {seconds} sec he hunts the Prey. Twin Prey: two players are marked and he switches between them every {switchEvery} sec. He runs {speed} faster than a player, ignores taunts and does not attack. If he catches a Prey: {maul} damage and a {stun} sec stun.',
      huntResponse:
        'Prey: run through lit sun glyphs to slow him. Everyone else slows, roots and stuns him while he hunts.',
      glyphName: 'Sun Glyphs',
      glyphSummary:
        '{count} glyphs ring the shrine. When the jaguar spirit crosses a lit glyph he is slowed by {slow} for {seconds} sec, and that glyph goes dark for {dark} sec. During the hunt slows and roots land on him, and stuns last half as long.',
      glyphResponse: 'Spread the glyphs out: do not burn them all on the first hunt.',
      ambushName: 'Ambush',
      ambushSummary:
        'After each hunt he vanishes for {seconds} sec. A {radius} yd circle marks the farthest player, giving a {warn} sec warning, then he lands there: {min} to {max} damage to everyone inside.',
      ambushResponse: 'Get out of the circle.',
      tipTank:
        'Keep open ground behind you for Jaguar Roar. When the hunt ends he comes back to you: be ready to take him.',
      tipHealer:
        'Wildheart Pulse hits anyone left in the ring. A Maul is a big single hit: top up the Prey.',
      tipDamage:
        'Leave the pulse ring. During the hunt, slow, root and stun him to protect the Prey, and run through lit glyphs if you are the Prey.',
      tipDamageHeroic:
        'Leave the pulse ring. During the hunt, slow, root and stun him to protect both Prey. After each hunt, get out of the Ambush circle.',
      choiceName: 'Spend a glyph now, or save it?',
      choiceGain: 'Each lit glyph you lead him through slows him hard and buys the Prey time.',
      choiceRisk:
        'A used glyph stays dark for {dark} sec, and each hunt lasts {seconds} sec: burn them all at the start and the end of the hunt has none.',
      heroicTwinPrey: 'Twin Prey: two players are hunted; he switches every {switchEvery} sec.',
      heroicAmbush:
        'Ambush: after each hunt he pounces on a {radius} yd circle at the farthest player.',
    },
  },
  sanctum: {
    tusker: {
      overview:
        'A house-sized tusker hauls a sledge of burning soul braziers up and down the Sledge Road. It walks the road in a loop and unhitches the sledge where you pull it. At half health the sledge tips over and spills fire behind it.',
      phaseRoadName: 'On the Road',
      phaseRoadSummary:
        'Two telegraphed attacks from the start: a frontal sweep and a charge down a painted lane.',
      phaseSpillName: 'The Sledge Tips',
      phaseSpillSummary: 'At {health} health the sledge tips over and soulfire spills behind it.',
      phaseEnrageName: 'Enraged',
      phaseEnrageSummary: 'Below {health} health it enrages for the rest of the fight.',
      sweepSummary:
        'Every {every} sec, a {cast} sec cast, then its tusks sweep a {arc} degree cone in front of it, {range} yd past its body: {min} to {max} damage and a {push} yd knockback.',
      sweepResponse:
        'The tank holds it facing away from the group. Everyone else attacks from its sides or rear.',
      trampleSummary:
        'Every {every} sec, a {cast} sec cast paints a {length} yd lane toward the farthest player, then it charges down the lane: {min} to {max} damage and a {stun} sec knockdown to everyone in it.',
      trampleResponse:
        'Step sideways out of the painted lane before the cast ends. The farthest player is the target, so ranged players keep room to side-step.',
      spillName: 'Spilled Braziers',
      spillSummary:
        'Once, at {health} health: the sledge tips and {count} soulfire patches ({radius} yd) burn behind it for {seconds} sec, {min} to {max} damage per second to anyone inside.',
      spillResponse: 'Walk out of the fire at once and fight away from the patches.',
      enrageSummary:
        'Below {health} health it deals {damage} more damage for the rest of the fight.',
      enrageResponse:
        'Save healing and defensive cooldowns for the last stretch and finish it fast.',
      tipTank:
        'Hold it facing away from the group and keep still, so the sweep cone never swings into allies. Expect a knockback with every Tusk Sweep.',
      tipHealer:
        'Tusk Sweep and Trample are the damage spikes. Stand to its side, not at the far edge where Trample aims, and keep a cooldown for its enrage below {health}.',
      tipDamage:
        'Attack from the sides or rear. Watch the floor for the painted lane and step out of it. At half health, leave the fire behind it.',
    },
    korgath: {
      overview:
        "The Smith's foreman, chained to four seal pillars. Each chain still on him cuts the damage he takes by {perChain}, so breaking chains makes him easier to kill. But every chain you break frees one more of his attacks for the rest of the fight.",
      phaseLockName: 'The Lock',
      phaseLockSummary:
        'He starts bound by {chains} chains, one to each pillar. A Seal Shackle at each pillar holds its chain.',
      phaseFreedName: 'Broken Chains',
      phaseFreedSummary:
        'Each broken chain frees one attack for the rest of the pull, even if the chain is later re-riveted.',
      phaseEnrageName: 'Enraged',
      lockboundName: 'Lockbound',
      lockboundSummary:
        'Each intact chain cuts the damage he takes by {perChain}: {all} less damage while all four hold.',
      lockboundResponse:
        'Break chains to speed up the kill. Decide how many first: each one also frees an attack.',
      shacklesName: 'Seal Shackles',
      shacklesSummary:
        "A Seal Shackle stands at each pillar's foot. Shackles can't be attacked until Korgath is pulled. Killing one breaks its chain. While the Anvil chain holds he can't leave {leash} yd of the terrace's middle.",
      shacklesResponse:
        'Damage dealers kill the Shackles of the chains you chose to break. The tank keeps Korgath in the middle meanwhile.',
      strainSummary:
        'While any chain holds: every {every} sec, a {cast} sec cast, then a blast in a {radius} yd ring around each pillar whose chain still holds: {min} to {max} damage and a knockback. It stops once all four chains are broken.',
      strainResponse: 'Step away from every pillar with an intact chain before the cast ends.',
      stompSummary:
        'Every {every} sec, a {cast} sec cast, then a ring {radius} yd past his body: {min} to {max} damage to everyone inside.',
      stompResponse:
        'Ranged players stay outside the ring. Melee step out if they can; healers top up anyone it hits.',
      rerivetSummary:
        '{delay} sec after a chain breaks, a Broodsworn Goadsmith climbs over the rim behind its pillar, walks to the Shackle and channels Re-rivet for {channel} sec. If it finishes, the chain and a fresh Shackle return with their {perChain} damage cut, but the freed attack stays.',
      rerivetResponse: 'Interrupt, stun or kill the Goadsmith before the channel ends.',
      lastLinkName: 'Last Link',
      lastLinkSummary:
        'While exactly one chain is left, Strain comes every {every} sec instead of every {base} sec.',
      lastLinkResponse:
        'Break the last chain quickly, or stay ready to leave its pillar every {every} sec.',
      maulSummary:
        'Hammer chain broken: every {every} sec, a {cast} sec cast, then a {arc} degree cleave in front of him, {range} yd past his body, for {mult} times his melee hit.',
      maulResponse:
        'Only the tank stands in front. Everyone else moves behind him during the cast.',
      flailSummary:
        'Tongs chain broken: every {every} sec, a {cast} sec cast paints a {length} yd lane at the farthest player who is not the tank, then the whip hits everyone in it: {min} to {max} damage.',
      flailResponse: 'Step sideways out of the lane before the cast ends.',
      chargeSummary:
        'Anvil chain broken: he can leave the middle of the terrace. Every {every} sec, a {cast} sec cast paints a {length} yd lane at the farthest player, then he charges down it: {min} to {max} damage and a knockback.',
      chargeResponse:
        'Step out of the lane. While the Anvil chain holds he stays within {leash} yd of the middle and never charges.',
      bellowSummary:
        'Bellows chain broken: every {every} sec, a {cast} sec cast, then {min} to {max} damage to everyone and a {push} yd shove away from him.',
      bellowResponse:
        'It hits the whole group and cannot be avoided: healers top everyone up before it lands.',
      tipTank:
        'Hold him in the middle, facing away from the group. Once the Hammer chain breaks, Maul Arc hits everything in front of him. Until the Anvil chain breaks he cannot leave {leash} yd of the middle.',
      tipHealer:
        'Strain, Shuddering Stomp and every freed attack land hard. Each chain left on makes the fight longer; each chain broken adds an attack to heal through.',
      tipDamage:
        'Kill Shackles to break the chains you chose, then burn Korgath. Step out of painted lanes and away from pillars that still hold a chain.',
      tipDamageHeroic:
        'Kill Shackles to break the chains you chose, then burn Korgath. Stop every Goadsmith before its Re-rivet ends. Step out of painted lanes and away from pillars that still hold a chain.',
      choiceName: 'How many chains do you break?',
      choiceGain:
        'Each broken chain removes {perChain} of his damage cut: from {all} with all four chains, down to none. The fight gets much shorter.',
      choiceRisk:
        "Each broken chain frees one attack for the rest of the pull. Hammer: Maul Arc. Tongs: Chain Flail. Anvil: Threshold Charge, and he can leave the middle. Bellows: Foreman's Bellow.",
      choiceRiskHeroic:
        "Each broken chain frees one attack for the rest of the pull. Hammer: Maul Arc. Tongs: Chain Flail. Anvil: Threshold Charge, and he can leave the middle. Bellows: Foreman's Bellow. A Goadsmith also comes to re-rivet each broken chain.",
      heroicRerivet:
        'Re-rivet: {delay} sec after a chain breaks, a Goadsmith tries to restore it. Interrupt, stun or kill it.',
      heroicLastLink: 'Last Link: with one chain left, Strain comes every {every} sec.',
    },
    velkhar: {
      overview:
        'Velkhar raises the thawed dead from three meltwater pools. Only the cold keeps them down: a Bonewalker killed on dry ice stays dead, but one killed in meltwater rises again and heals him.',
      phaseVaultName: 'The Ritual Vault',
      phaseVaultSummary:
        'Bonewalkers keep climbing out of the pools. At {wave1} and {wave2} health an extra wave rises, one from each pool.',
      thawName: 'Waking Thaw',
      thawSummary:
        "Every {every} sec one pool's pyre roars and {count} Raised Bonewalkers climb out {warn} sec later. The pools take turns. At {wave1} and {wave2} health, one more climbs out of each pool.",
      thawResponse:
        'The tank gathers them and drags them onto dry ice. Damage dealers kill them there.',
      heldName: 'Held and Unquenched',
      heldSummary:
        'A Bonewalker killed on dry ice is Held: it freezes into a statue and stays dead. One killed in meltwater sinks, then rises again {delay} sec later at {share} health and heals Velkhar for {heal} of his health.',
      heldResponse: 'Kill Bonewalkers only on dry ice: never in a pool or on a meltwater strip.',
      graspName: 'Grasp of the Thawed',
      graspSummary: 'A Bonewalker standing in meltwater deals {bonus} more damage.',
      graspResponse: 'The tank keeps Bonewalkers out of the water.',
      trenchSummary:
        "Every {every} sec, a {cast} sec cast paints a {width} yd lane from him toward a player who is not the tank, out to the vault's rim. Then {min} to {max} damage to everyone in it, and the lane stays meltwater for {seconds} sec.",
      trenchResponse:
        'Step out of the lane. Do not kill Bonewalkers on the meltwater strip it leaves.',
      volleySummary:
        'Every {every} sec, a {cast} sec cast, then {min} to {max} shadow damage to everyone.',
      volleyResponse: 'It cannot be avoided: healers keep the whole group topped up.',
      warmHandsName: 'Warm Hands',
      warmHandsSummary:
        'A Bonewalker that stands still for {still} sec melts a {radius} yd meltwater puddle under itself for {seconds} sec.',
      warmHandsResponse:
        'Keep the Bonewalkers moving, and never finish one off on top of a puddle.',
      twiceWokenName: 'Twice-Woken',
      twiceWokenSummary:
        'A Bonewalker that rises again comes back at full health and deals {bonus} more damage.',
      twiceWokenResponse: 'Do not let any rise: kill them all on dry ice.',
      tipTank:
        'Pick up every Bonewalker and drag it onto dry ice, out of the pools and the meltwater strips. In meltwater they hit {bonus} harder.',
      tipTankHeroic:
        'Pick up every Bonewalker and drag it onto dry ice, out of the pools and the meltwater strips. Keep them moving: one that stands still melts a puddle under itself.',
      tipHealer:
        'Shadow Volley hits everyone every {every} sec. Bonewalkers in meltwater hit {bonus} harder, so watch the tank when they reach water.',
      tipDamage:
        'Kill Bonewalkers only on dry ice, then return to Velkhar. Step out of the Soulfire Trench lane.',
      choiceName: 'Where do the dead fall?',
      choiceGain:
        'A Bonewalker killed on dry ice is gone for good: fewer adds and a cleaner fight.',
      choiceRisk:
        'Killed in meltwater, it rises again and heals Velkhar for {heal} of his health each time. Dragging them to dry ice costs time, so plan the kill spot before you burn them.',
      heroicWarmHands:
        'Warm Hands: a Bonewalker that stands still for {still} sec melts a meltwater puddle.',
      heroicTwiceWoken:
        'Twice-Woken: a Bonewalker that rises again returns at full health and deals {bonus} more damage.',
    },
    korzul: {
      overview:
        'A dragon fight on a frozen lake his fire keeps breaking. Every breath spends ice, and the group aims his fire, so the group decides which ice to lose. A wyrm with no ice left breathes without pause.',
      phaseLakeName: 'The Frozen Lake',
      phaseLakeSummary:
        'He bursts out of the ice and lands in the middle of the lake. His fight starts when he touches down.',
      phaseFlightName: 'Flights',
      phaseFlightSummary:
        'At {first} and {second} health he takes off and fights from the air until he crashes back down.',
      phaseLastName: 'The Last Phase',
      phaseLastSummary:
        'After the second flight: Grave Breath every {breath} sec and Wing Gale every {gale} sec on the ground.',
      iceName: 'Breaking Ice',
      iceSummary:
        'The lake is made of ice plates. His fire cracks an uncracked plate and breaks a cracked one. A cracked plate refreezes after {refreeze} sec. A broken plate is open water.',
      iceHeroicSummary:
        'The lake is made of ice plates. His fire cracks an uncracked plate and breaks a cracked one. Deep Quench: on Heroic a cracked plate never refreezes. A broken plate is open water.',
      iceResponse: 'Spend ice on purpose: aim his fire at plates the group can afford to lose.',
      waterName: 'Open Water',
      waterSummary:
        'Standing in open water slows you by {slow} and deals {perSecond} damage per second.',
      waterResponse: 'Stay on the ice. Leave the water at once if a shove puts you in it.',
      breathSummary:
        "Every {every} sec, a {cast} sec cast along the tank's line, then a {arc} degree fire cone {range} yd past his body: {min} to {max} damage to everyone in it except the tank. Up to {plates} plates under the cone burn, nearest first.",
      breathResponse:
        'Only the tank stands in front. The tank turns the breath toward ice the group can spare.',
      tailSummary:
        'Every {every} sec, a {cast} sec cast, then his tail sweeps the {arc} degrees behind him, {range} yd past his body: {min} to {max} damage and a knockback.',
      tailResponse: 'Never stand behind him. Attack from his sides.',
      infernoSummary:
        'Every {every} sec, and once at {health} health, he channels for {duration} sec: {pulses} fire pulses within {radius} yd, each stronger than the last (the last pulse deals {min} to {max}). Pulse {crack} cracks the plate under him and pulse {brk} breaks it: when it breaks he is Doused and the channel ends.',
      infernoResponse:
        'Get {radius} yd away from him. Start him on a cracked plate and the channel ends at pulse {crack}.',
      galeSummary: 'A {cast} sec cast, then everyone is pushed {push} yd away from him.',
      galeResponse: 'Keep open water behind you clear, so the push lands you on ice.',
      plungeSummary:
        "In the air he marks a player who is not the tank with Wyrm's Eye for {eye} sec. When it ends he pours Plunging Fire on that player's whole plate: a {warn} sec warning, then {min} to {max} damage to anyone on it, and the plate burns. {roundsFirst} rounds in the first flight, {roundsSecond} in the second.",
      plungeHeroicSummary:
        "In the air he marks two players who are not the tank with Wyrm's Eye for {eye} sec (Twin Eyes). When it ends he pours Plunging Fire on each marked player's whole plate: a {warn} sec warning, then {min} to {max} damage to anyone on it, and the plate burns. {roundsFirst} rounds in the first flight, {roundsSecond} in the second.",
      plungeResponse:
        'Marked: walk to an uncracked plate away from the group. Everyone else leaves that plate.',
      broodName: 'Brood from Below',
      broodSummary: 'When he takes off, a Scaleguard climbs out of each broken plate, up to {max}.',
      broodResponse: 'The tank picks them up and the group kills them while he is in the air.',
      descentSummary:
        'He ends each flight by landing on the unbroken plate with the most players: a {warn} sec shadow, then {min} to {max} damage within {radius} yd and a knockback, and that plate burns.',
      descentResponse:
        'Gather on a plate you can afford to crack, then run out of the shadow before he lands.',
      flareName: 'Shard Flare',
      flareSummary:
        'After the second flight the shard flares: Grave Breath every {breath} sec and Wing Gale every {gale} sec, on the ground.',
      flareResponse: 'Breaths come faster: plan which plates are left to spend.',
      noIceName: 'No Ice Left',
      noIceSummary:
        'If every plate is broken, he hovers over the open water and breathes without pause.',
      noIceResponse: 'Never run out of ice: it ends the fight in a wipe.',
      tipTank:
        'Turn Grave Breath onto ice the group can spare, never across the group. Move him onto a cracked plate before a Grave Inferno to cut it short.',
      tipHealer:
        'Grave Inferno pulses grow fast: make sure everyone leaves. Plunging Fire, Crashing Descent and every knockback into water hit hard.',
      tipDamage:
        "Never stand in front of him or behind him. With Wyrm's Eye, take it to an uncracked plate away from the group. Kill the Scaleguards during flights.",
      tipDamageHeroic:
        "Never stand in front of him or behind him. Two players get Wyrm's Eye at once: each takes it to a different uncracked plate away from the group. Kill the Scaleguards during flights.",
      choiceIceName: 'Which ice do you spend?',
      choiceIceGain:
        'Aim his breath, his Plunging Fire and his landing at chosen plates and the rest of the lake stays safe to stand on.',
      choiceIceRisk:
        'Every broken plate is open water, and each one lets a Scaleguard climb out at his next flight (up to {max}). With no ice left he breathes without pause.',
      choiceDouseName: 'Douse the Inferno?',
      choiceDouseGain:
        'With him on a cracked plate, pulse {crack} breaks it, he is Doused and Grave Inferno ends early, before the strongest pulses.',
      choiceDouseRisk:
        'That plate is gone for good. Left on uncracked ice, the channel runs to pulse {brk} and still breaks the plate.',
      heroicDeepQuench: 'Deep Quench: a cracked plate never refreezes.',
      heroicTwinEyes: "Twin Eyes: Wyrm's Eye marks two players at once.",
    },
  },
};
