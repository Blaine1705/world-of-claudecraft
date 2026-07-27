import { describe, expect, it } from 'vitest';
import { bagCapacity } from '../src/sim/bags';
import { GATHER_NODES } from '../src/sim/content/gather_nodes';
import { recipeById } from '../src/sim/content/recipes';
import { ITEMS, NPCS, QUESTS, STATIONS } from '../src/sim/data';
import { hasRecipeMaterials, resolveCraft } from '../src/sim/professions/crafting';
import { stationsOfType } from '../src/sim/professions/stations';
import { turnInQuestCore } from '../src/sim/quests/quest_commands';
import { Sim } from '../src/sim/sim';
import { terrainHeight } from '../src/sim/world';

// Downward grade substitution (D8): a fine grade satisfies a requirement for
// its base, never the reverse. Not a courtesy. The fine grade REPLACES the
// plain yield and eastbrook_vale is all tier-1 veins, so without this a
// player carrying any tier-2 tool could no longer gather copper_ore,
// ironbark_log or silverleaf_herb at all, and the two eastbrook work orders
// plus every tier-1 recipe fed by those three would go unfarmable for them.
//
// The pure planner is pinned in tests/material_grades.test.ts; this file
// pins the three live call sites it was wired into: the craft gate, the craft
// consumption, and quest collect credit + turn-in.

function makeSim(seed = 42) {
  return new Sim({ seed, playerClass: 'warrior', autoEquip: false });
}

function grantItem(sim: Sim, itemId: string, count: number, pid: number) {
  for (let i = 0; i < count; i++) sim.addItem(itemId, 1, pid);
}

function placeAtStationFor(sim: Sim, pid: number, recipeId: string) {
  const stationType = recipeById(recipeId)?.stationType;
  if (!stationType) throw new Error(`${recipeId} is not station-bound`);
  const station = stationsOfType(STATIONS, stationType)[0];
  const entity = (sim as any).entities.get(pid);
  entity.pos.x = station.pos.x;
  entity.pos.z = station.pos.z;
  entity.prevPos = { ...entity.pos };
}

// The work-order giver stands at his own counter; acceptQuest gates on being
// near him, so the harness walks there rather than forcing the quest log.
function placeAtQuestGiver(sim: Sim, pid: number, npcId: string) {
  const npc = NPCS[npcId];
  const p = (sim as any).entities.get(pid);
  p.pos.x = npc.pos.x;
  p.pos.z = npc.pos.z;
  p.pos.y = terrainHeight(npc.pos.x, npc.pos.z, (sim as any).cfg.seed);
  p.prevPos = { ...p.pos };
}

// A shipped, free-floor recipe whose reagent list names a plain node material:
// the exact shape a player past the tier-1 tool can no longer feed directly.
const VEST = 'recipe_eastbrook_chain_vest'; // copper_ore x4 + smithing_flux x9

describe('crafting accepts the fine grade for a plain reagent', () => {
  it('the recipe names copper_ore, and the fixture holds only its fine grade', () => {
    // Premise pin: if the recipe is ever re-specced, the cases below stop
    // meaning what they say, and this fails first with a readable reason.
    const reagents = recipeById(VEST)!.reagents;
    expect(reagents.find((r) => r.itemId === 'copper_ore')?.count).toBe(4);
  });

  it('crafts from fine copies alone, consuming the fine grade', () => {
    const sim = makeSim();
    const pid = sim.playerId;
    grantItem(sim, 'fine_copper_ore', 4, pid);
    grantItem(sim, 'smithing_flux', 9, pid);

    expect(hasRecipeMaterials((sim as any).ctx, recipeById(VEST)!, pid)).toBe(true);
    const result = resolveCraft((sim as any).ctx, pid, VEST);

    expect(result.ok, `craft denied: ${JSON.stringify(result)}`).toBe(true);
    expect(sim.countItem('eastbrook_chain_vest', pid)).toBe(1);
    expect(sim.countItem('fine_copper_ore', pid)).toBe(0);
    // And it never conjured the plain grade to spend.
    expect(sim.countItem('copper_ore', pid)).toBe(0);
  });

  it('denies, and consumes nothing, when the fine copies are one short', () => {
    // The negative arm: substitution widens what counts, it does not waive the
    // count. Without this the case above would pass on a gate that ignored
    // quantity entirely.
    const sim = makeSim();
    const pid = sim.playerId;
    grantItem(sim, 'fine_copper_ore', 3, pid);
    grantItem(sim, 'smithing_flux', 9, pid);

    expect(hasRecipeMaterials((sim as any).ctx, recipeById(VEST)!, pid)).toBe(false);
    const result = resolveCraft((sim as any).ctx, pid, VEST);

    expect(result.ok).toBe(false);
    expect(sim.countItem('fine_copper_ore', pid)).toBe(3);
    expect(sim.countItem('smithing_flux', pid)).toBe(9);
    expect(sim.countItem('eastbrook_chain_vest', pid)).toBe(0);
  });

  it('spends the plain grade first and keeps the premium copies', () => {
    const sim = makeSim();
    const pid = sim.playerId;
    grantItem(sim, 'copper_ore', 3, pid);
    grantItem(sim, 'fine_copper_ore', 3, pid);
    grantItem(sim, 'smithing_flux', 9, pid);

    expect(resolveCraft((sim as any).ctx, pid, VEST).ok).toBe(true);
    // 4 needed: all 3 plain, then exactly 1 fine.
    expect(sim.countItem('copper_ore', pid)).toBe(0);
    expect(sim.countItem('fine_copper_ore', pid)).toBe(2);
  });

  it('the output-fits gate models the grade the craft will actually spend', () => {
    // The #2350 capacity gate simulates the consumption on a scratch copy, so
    // it must take the SAME grades the real consumption takes. Here the ONLY
    // slot the craft frees is the fine-ore one: the flux stack is left with a
    // remainder, so its slot survives. A scratch walk that removed the plain
    // id would free nothing, see a full bag, and deny a craft that fits.
    const sim = makeSim();
    const pid = sim.playerId;
    const meta = (sim as any).players.get(pid);
    grantItem(sim, 'fine_copper_ore', 4, pid); // one slot, fully consumed
    sim.addItem('smithing_flux', 10, pid); // one slot, 9 consumed, 1 remains
    const capacity = bagCapacity(meta.bags);
    const fillerStack = ITEMS.bone_fragments.stackSize ?? 20;
    while (meta.inventory.length < capacity) sim.addItem('bone_fragments', fillerStack, pid);
    expect(meta.inventory.length).toBe(capacity);
    // Premise: no free slot right now, so the output can only fit on the room
    // the consumption frees.
    expect(sim.ctx.canAddItem('eastbrook_chain_vest', 1, pid)).toBe(false);

    const result = resolveCraft((sim as any).ctx, pid, VEST);

    expect(result.ok, `craft denied: ${JSON.stringify(result)}`).toBe(true);
    expect(sim.countItem('eastbrook_chain_vest', pid)).toBe(1);
    expect(sim.countItem('fine_copper_ore', pid)).toBe(0);
    expect(sim.countItem('smithing_flux', pid)).toBe(1);
  });

  it('a self-signed FINE copy still earns the #1145 quantity discount', () => {
    // Using the better tool must never COST a perk. The discount keys on
    // holding a self-gathered signed copy of the reagent, and after D8 the
    // self-gathered copy of copper ore is fine copper ore for anyone past the
    // tier-1 pick. Three copies against a listed four: the craft succeeds only
    // because the discount fired, so ok:true is the decisive assertion.
    const sim = makeSim();
    const pid = sim.playerId;
    const meta = (sim as any).players.get(pid);
    sim.addItemInstance('fine_copper_ore', { signer: meta.name }, pid, 3);
    grantItem(sim, 'smithing_flux', 9, pid);

    const result = resolveCraft((sim as any).ctx, pid, VEST);

    expect(result.ok, `craft denied: ${JSON.stringify(result)}`).toBe(true);
    expect(result.selfSignedBonusApplied).toBe(true);
    expect(sim.countItem('fine_copper_ore', pid)).toBe(0);
  });

  it("someone ELSE's signed fine copy earns no quantity discount", () => {
    // The self-only half of the rule survives the widening: three traded
    // copies are still one short of the listed four.
    const sim = makeSim();
    const pid = sim.playerId;
    sim.addItemInstance('fine_copper_ore', { signer: 'Gatherer Friend' }, pid, 3);
    grantItem(sim, 'smithing_flux', 9, pid);

    const result = resolveCraft((sim as any).ctx, pid, VEST);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('insufficient_materials');
    expect(sim.countItem('fine_copper_ore', pid)).toBe(3);
  });

  it('a fine-grade reagent is NOT satisfied by the plain grade (the gate stays a gate)', () => {
    // The one-directional half. If this ever flipped, the whole tool ladder
    // would collapse back into a shopping trip.
    const sim = makeSim();
    const pid = sim.playerId;
    const pick = 'recipe_thorium_mining_pick'; // fine_iron_ore x4 + mithril_mining_pick
    placeAtStationFor(sim, pid, pick);
    grantItem(sim, 'iron_ore', 8, pid);
    grantItem(sim, 'mithril_mining_pick', 1, pid);

    expect(hasRecipeMaterials((sim as any).ctx, recipeById(pick)!, pid)).toBe(false);
    const result = resolveCraft((sim as any).ctx, pid, pick);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('insufficient_materials');
    expect(sim.countItem('iron_ore', pid)).toBe(8);
    expect(sim.countItem('mithril_mining_pick', pid)).toBe(1);
  });
});

describe('quest collect credit spans the grades', () => {
  // The eastbrook work order that would otherwise become unfarmable: the ore
  // it asks for stops dropping for anyone carrying a tier-2 pick.
  const ORDER = 'q_prof_workorder_forge'; // collect copper_ore x8

  it('the objective names copper_ore, an eastbrook (all tier-1) yield', () => {
    const objective = QUESTS[ORDER].objectives[0];
    expect(objective.type).toBe('collect');
    expect((objective as { itemId: string }).itemId).toBe('copper_ore');
    expect((objective as { count: number }).count).toBe(8);
    // The premise that makes the substitution load-bearing rather than a nicety.
    const eastbrookOre = GATHER_NODES.filter(
      (n) => n.zoneId === 'eastbrook_vale' && n.type === 'ore',
    );
    expect(eastbrookOre.length).toBeGreaterThan(0);
    expect([...new Set(eastbrookOre.map((n) => n.tier))]).toEqual([1]);
  });

  it('fine copies move the counter and make the quest ready', () => {
    const sim = makeSim();
    const pid = sim.playerId;
    const meta = (sim as any).players.get(pid);
    placeAtQuestGiver(sim, pid, QUESTS[ORDER].giverNpcId);
    sim.acceptQuest(ORDER, pid);
    expect(meta.questLog.get(ORDER), 'quest was not accepted').toBeDefined();

    grantItem(sim, 'fine_copper_ore', 8, pid);

    const qp = meta.questLog.get(ORDER);
    expect(qp.counts[0]).toBe(8);
    expect(qp.state).toBe('ready');
  });

  it('a mixed bag counts once per unit, and the turn-in spends the plain ore first', () => {
    const sim = makeSim();
    const pid = sim.playerId;
    const meta = (sim as any).players.get(pid);
    placeAtQuestGiver(sim, pid, QUESTS[ORDER].giverNpcId);
    sim.acceptQuest(ORDER, pid);
    expect(meta.questLog.get(ORDER), 'quest was not accepted').toBeDefined();

    grantItem(sim, 'copper_ore', 5, pid);
    grantItem(sim, 'fine_copper_ore', 5, pid);
    // 10 held against a required 8: the counter clamps at the requirement.
    expect(meta.questLog.get(ORDER).counts[0]).toBe(8);

    turnInQuestCore((sim as any).ctx, ORDER, QUESTS[ORDER], meta);

    // 8 taken: all 5 plain, then 3 fine, leaving the 2 premium copies.
    expect(sim.countItem('copper_ore', pid)).toBe(0);
    expect(sim.countItem('fine_copper_ore', pid)).toBe(2);
    expect(meta.questsDone.has(ORDER)).toBe(true);
  });

  it('seven fine copies do NOT satisfy an eight-unit objective', () => {
    // Negative arm, same reason as the craft one: the counter widened, the
    // requirement did not.
    const sim = makeSim();
    const pid = sim.playerId;
    const meta = (sim as any).players.get(pid);
    placeAtQuestGiver(sim, pid, QUESTS[ORDER].giverNpcId);
    sim.acceptQuest(ORDER, pid);
    expect(meta.questLog.get(ORDER), 'quest was not accepted').toBeDefined();

    grantItem(sim, 'fine_copper_ore', 7, pid);

    const qp = meta.questLog.get(ORDER);
    expect(qp.counts[0]).toBe(7);
    expect(qp.state).toBe('active');
  });
});
