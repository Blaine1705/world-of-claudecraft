// Starter-tool sourcing: the four gather quests hand over the tool their own
// objective needs, and the tier-1 tools they hand over cannot be vendored back
// into copper.
//
// Both halves are one mechanism. Under the always-require-tool rule (#2343) a
// bare-handed harvest is denied outright, and a new character starts with zero
// copper, so a gather quest that grants nothing silently required a detour to
// earn 20 copper and buy the tool first. questFallbackGrants closes that on
// accept, and re-grants on every accept; q_prof_hobby_switch is repeatable, so
// the grant needs noVendorSell (or accept-sell-abandon mints copper) AND
// noMarketList (or the same loop, stashing instead of selling, drains other
// players' copper through a free listing instead).
import { describe, expect, it } from 'vitest';
import type { GatheringProfessionId } from '../src/sim/content/professions';
import { ZONE1_QUESTS } from '../src/sim/content/zone1';
import { ITEMS, QUESTS } from '../src/sim/data';
import { sellAllJunk, sellItem } from '../src/sim/items';
import { attuneArchetypePair, hobbyCandidatesForPair } from '../src/sim/professions/archetype';
import { NODE_TYPE_BY_PROFESSION } from '../src/sim/professions/gathering';
import { bestOwnedGatherToolTierOrNone, NO_TOOL_OWNED } from '../src/sim/professions/tools';
import { questFallbackGrants } from '../src/sim/quest_fallback';
import { acceptQuest } from '../src/sim/quests/quest_commands';
import { Sim } from '../src/sim/sim';
import type { Entity, QuestDef } from '../src/sim/types';
import { terrainHeight } from '../src/sim/world';

type AnySim = Sim & Record<string, any>;
type AnyEntity = Entity & Record<string, any>;

/** The four quests whose objective is a node harvest. */
const GATHER_QUEST_IDS = [
  'q_prof_intro',
  'q_prof_attune_smith',
  'q_prof_attune_bombardier',
  'q_prof_hobby_switch',
] as const;

/** The three tier-1 tools a gather quest can hand over. */
const TIER_1_TOOLS = ['copper_mining_pick', 'handaxe', 'gathering_sickle'] as const;
/** Bought, never granted, so still sellable: the discriminating negative case. */
const HIGHER_TIER_TOOLS = [
  'iron_mining_pick',
  'mithril_mining_pick',
  'felling_axe',
  'ironbark_axe',
  'bronze_sickle',
  'silverleaf_sickle',
] as const;

/** The gathering profession whose tool clears a node type's gate. */
function professionForNodeType(nodeType: string): GatheringProfessionId {
  for (const [professionId, type] of Object.entries(NODE_TYPE_BY_PROFESSION)) {
    if (type === nodeType) return professionId as GatheringProfessionId;
  }
  throw new Error(`no gathering profession harvests node type ${nodeType}`);
}

/** The node types one quest's gather objectives target. */
function gatherNodeTypes(quest: QuestDef): string[] {
  return quest.objectives
    .filter((objective) => objective.type === 'gather')
    .map((objective) => (objective as { nodeType: string }).nodeType);
}

function teleport(sim: AnySim, e: AnyEntity, x: number, z: number): void {
  e.pos.x = x;
  e.pos.z = z;
  e.pos.y = terrainHeight(x, z, sim.cfg.seed);
  e.prevPos = { ...e.pos };
  sim.rebucket(e);
}

function findNpc(sim: AnySim, templateId: string): AnyEntity {
  const npc = [...sim.entities.values()].find(
    (e: AnyEntity) => e.kind === 'npc' && e.templateId === templateId,
  );
  if (!npc) throw new Error(`npc ${templateId} not in world`);
  return npc as AnyEntity;
}

/** A sim with the player standing on the quest's giver, ready to accept. */
function simAtGiver(questId: string): { sim: AnySim; pid: number; meta: any } {
  const sim = new Sim({ seed: 7, playerClass: 'warrior', autoEquip: false }) as AnySim;
  const pid = sim.playerId;
  const player = sim.entities.get(pid) as AnyEntity;
  const giver = findNpc(sim, QUESTS[questId].giverNpcId);
  teleport(sim, player, giver.pos.x, giver.pos.z);
  return { sim, pid, meta: sim.players.get(pid) };
}

describe('the gather quests grant the tool their own objective needs', () => {
  it('all four declare requiredItems, and the tool matches the objective node type', () => {
    for (const questId of GATHER_QUEST_IDS) {
      const quest = ZONE1_QUESTS[questId];
      expect(quest, questId).toBeDefined();
      const nodeTypes = gatherNodeTypes(quest);
      // Guard the premise: these are gather quests, so a future objective
      // rewrite that drops the harvest cannot leave this test asserting
      // nothing about a quest it no longer describes.
      expect(nodeTypes.length, `${questId} has no gather objective`).toBeGreaterThan(0);
      const required = quest.requiredItems ?? [];
      expect(required.length, `${questId} grants no tool`).toBeGreaterThan(0);
      // DERIVED, not restated: the granted tool must clear the tool gate for
      // the profession that harvests this quest's own node type. A pick on a
      // herb quest fails here.
      for (const nodeType of nodeTypes) {
        const professionId = professionForNodeType(nodeType);
        const granted = required.map((itemId) => ({ itemId, count: 1 }));
        expect(
          bestOwnedGatherToolTierOrNone(granted as any, professionId, ITEMS),
          `${questId} (${nodeType}) grants no ${professionId} tool: ${required.join(', ')}`,
        ).toBeGreaterThan(NO_TOOL_OWNED);
      }
    }
  });

  it('splits pick and sickle by objective: two of the four need a sickle', () => {
    const byQuest = Object.fromEntries(
      GATHER_QUEST_IDS.map((questId) => [questId, ZONE1_QUESTS[questId].requiredItems ?? []]),
    );
    expect(byQuest).toEqual({
      q_prof_intro: ['copper_mining_pick'],
      q_prof_attune_smith: ['copper_mining_pick'],
      q_prof_attune_bombardier: ['gathering_sickle'],
      q_prof_hobby_switch: ['gathering_sickle'],
    });
  });

  it('accepting on a fresh character with zero copper actually hands the tool over', () => {
    // All three non-repeatable gather quests driven through the real accept
    // path, both tools covered. The attunement quests carry a completionEffect,
    // so each needs its own pinned pair as the selection; q_prof_intro takes
    // none. q_prof_attune_smith matters most: it is the independent entry point
    // with no q_prof_intro gate, so it cannot lean on the intro quest's pick.
    for (const [questId, selection] of [
      ['q_prof_intro', undefined],
      ['q_prof_attune_smith', 'weaponcrafting+armorcrafting'],
      ['q_prof_attune_bombardier', 'engineering+alchemy'],
    ] as const) {
      const { sim, pid, meta } = simAtGiver(questId);
      const tool = ZONE1_QUESTS[questId].requiredItems![0];
      meta.copper = 0;
      expect(sim.countItem(tool, pid), `${questId} precondition`).toBe(0);

      acceptQuest(sim.ctx, questId, selection ?? pid, selection === undefined ? undefined : pid);

      expect(meta.questLog.has(questId), `${questId} not accepted`).toBe(true);
      expect(sim.countItem(tool, pid), `${questId} did not grant ${tool}`).toBe(1);
      expect(meta.copper, `${questId} must not cost copper`).toBe(0);
    }
  });

  it('re-grants a lost tool on the repeatable quest, and never stacks a second copy', () => {
    const questId = 'q_prof_hobby_switch';
    const { sim, pid, meta } = simAtGiver(questId);
    const tool = ZONE1_QUESTS[questId].requiredItems![0];
    meta.questsDone.add('q_prof_intro'); // satisfy requiresQuest
    // A hobby switch is only legal once a pair is attuned; take one, then pick
    // a legal hobby off the live candidate list rather than a guessed literal.
    attuneArchetypePair(sim.ctx, pid, 'engineering+alchemy', 'new');
    const hobby = hobbyCandidatesForPair(
      meta.archetype.activeArchetype as string,
      meta.archetype.pairedMajor as string,
    ).find((candidate: string) => candidate !== meta.archetype.hobbyCraft);
    expect(hobby, 'no legal hobby target').toBeDefined();

    acceptQuest(sim.ctx, questId, hobby as string, pid);
    expect(meta.questLog.has(questId)).toBe(true);
    expect(sim.countItem(tool, pid)).toBe(1);

    // Abandon, lose the tool, accept again: the fallback re-grants it.
    sim.abandonQuest(questId, pid);
    sim.removeItem(tool, 1, pid);
    expect(sim.countItem(tool, pid)).toBe(0);
    acceptQuest(sim.ctx, questId, hobby as string, pid);
    expect(sim.countItem(tool, pid)).toBe(1);

    // Still holding it, accept once more: no second copy. This is the arm that
    // keeps the repeatable quest from being an item faucet on its own.
    sim.abandonQuest(questId, pid);
    acceptQuest(sim.ctx, questId, hobby as string, pid);
    expect(sim.countItem(tool, pid)).toBe(1);
    expect(questFallbackGrants(ZONE1_QUESTS[questId], () => true)).toEqual([]);
  });
});

describe('the tier-1 starter tools have no route to value', () => {
  it('every tier-1 gathering tool carries BOTH flags, and no higher tier carries either', () => {
    for (const itemId of TIER_1_TOOLS) {
      // noVendorSell closes the copper mint; noMarketList closes the value
      // route the unbounded re-grant supply would otherwise reach through a
      // free listing. Both are load-bearing, so both are pinned.
      expect(ITEMS[itemId]?.noVendorSell, `${itemId} noVendorSell`).toBe(true);
      expect(ITEMS[itemId]?.noMarketList, `${itemId} noMarketList`).toBe(true);
    }
    // The negative arm: without it, "all tools are locked down" would pass this
    // block just as happily as the intended rule.
    for (const itemId of HIGHER_TIER_TOOLS) {
      expect(ITEMS[itemId], itemId).toBeDefined();
      expect(ITEMS[itemId].noVendorSell ?? false, `${itemId} must stay sellable`).toBe(false);
      expect(ITEMS[itemId].noMarketList ?? false, `${itemId} must stay listable`).toBe(false);
    }
  });

  it('the re-grant supply is unbounded, so the tools must have no value route at all', () => {
    // The reason both flags exist, stated as a test rather than as prose. The
    // re-grant predicate is questFallbackGrants -> ctx.countItem, and countItem
    // scans ONLY meta.inventory: stash the tool anywhere else and the next
    // accept hands over another. This pins that the SUPPLY is unbounded, which
    // is what makes an open sell or listing route unacceptable rather than
    // merely untidy.
    const questId = 'q_prof_hobby_switch';
    const { sim, pid, meta } = simAtGiver(questId);
    const tool = ZONE1_QUESTS[questId].requiredItems![0];
    meta.questsDone.add('q_prof_intro');
    attuneArchetypePair(sim.ctx, pid, 'engineering+alchemy', 'new');
    const hobby = hobbyCandidatesForPair(
      meta.archetype.activeArchetype as string,
      meta.archetype.pairedMajor as string,
    ).find((candidate: string) => candidate !== meta.archetype.hobbyCraft) as string;

    let minted = 0;
    for (let cycle = 0; cycle < 3; cycle++) {
      expect(sim.countItem(tool, pid), `cycle ${cycle} starts empty-handed`).toBe(0);
      acceptQuest(sim.ctx, questId, hobby, pid);
      // A fresh tool appeared from nothing, on a quest already completed before.
      expect(sim.countItem(tool, pid), `cycle ${cycle} grant`).toBe(1);
      minted += 1;
      // Stand in for a bank deposit, a mail attachment, or a trade: the tool
      // leaves the inventory countItem reads, and nothing else changes.
      sim.removeItem(tool, 1, pid);
      sim.abandonQuest(questId, pid);
    }
    // Three accepts, three tools minted, none of them still in a bag. The
    // supply is bounded by nothing but how often the player re-accepts.
    expect(minted).toBe(3);
    expect(sim.countItem(tool, pid)).toBe(0);

    // Which is fine ONLY because a stashed copy converts to nothing: the def
    // carries both flags, so neither the vendor nor the World Market will take
    // it. If either flag is ever dropped, this loop becomes a live exploit.
    expect(ITEMS[tool].noVendorSell).toBe(true);
    expect(ITEMS[tool].noMarketList).toBe(true);
  });

  it('sellItem refuses a granted tool and pays nothing, but still pays for a tier-2 one', () => {
    const { sim, pid, meta } = simAtGiver('q_prof_intro');
    const vendor = findNpc(sim, 'trader_wilkes');
    teleport(sim, sim.entities.get(pid) as AnyEntity, vendor.pos.x, vendor.pos.z);
    meta.copper = 0;

    sim.addItem('gathering_sickle', 1, pid);
    sellItem(sim.ctx, 'gathering_sickle', 1, pid);
    expect(sim.countItem('gathering_sickle', pid), 'the sickle was sold').toBe(1);
    expect(meta.copper, 'the sickle minted copper').toBe(0);

    // The same call on a tier-2 tool pays out, so the refusal above is the
    // flag doing its job rather than the vendor path being broken.
    sim.addItem('bronze_sickle', 1, pid);
    sellItem(sim.ctx, 'bronze_sickle', 1, pid);
    expect(sim.countItem('bronze_sickle', pid)).toBe(0);
    expect(meta.copper).toBe(ITEMS.bronze_sickle.sellValue);
  });

  // NOT a noVendorSell pin: junkSellableSlot gates on quality === 'poor' first,
  // and every tier-1 tool is 'common', so this stays green with the flag
  // removed. What it does pin is that a granted tool never becomes junk-quality,
  // which is the other way the sweep could start eating them.
  it('the junk sweep never picks up a granted tool, on the quality gate alone', () => {
    const { sim, pid, meta } = simAtGiver('q_prof_intro');
    const vendor = findNpc(sim, 'trader_wilkes');
    teleport(sim, sim.entities.get(pid) as AnyEntity, vendor.pos.x, vendor.pos.z);
    meta.copper = 0;
    for (const itemId of TIER_1_TOOLS) sim.addItem(itemId, 1, pid);

    sellAllJunk(sim.ctx, pid);

    for (const itemId of TIER_1_TOOLS) {
      expect(sim.countItem(itemId, pid), `${itemId} was swept`).toBe(1);
    }
    expect(meta.copper).toBe(0);
  });
});
