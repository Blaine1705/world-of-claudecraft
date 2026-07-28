// Per-player gather-node readiness persistence (D6): a relog can no longer
// reset a node respawn timer. Readiness persists as REMAINING-time deltas
// (src/sim/professions/node_persist.ts, the cooldown_persist.ts scheme), so a
// timer freezes at the logout frame and resumes against the loading sim's
// clock. Zero-default omission is load-bearing throughout: a character with
// every node ready serializes byte-identically to a pre-D6 save.
import { describe, expect, it } from 'vitest';
import { GATHER_NODES } from '../src/sim/content/gather_nodes';
import { isNodeHarvestableBy, resolveHarvest } from '../src/sim/professions/gathering';
import { applyNodeReadiness, serializeNodeReadiness } from '../src/sim/professions/node_persist';
import { Rng } from '../src/sim/rng';
import { type CharacterState, type PlayerMeta, Sim } from '../src/sim/sim';

const makeSim = (seed = 11) => new Sim({ seed, playerClass: 'warrior', autoEquip: false });
const metaOf = (sim: Sim): PlayerMeta => sim.meta(sim.playerId) as PlayerMeta;

// A real shipped node: the load filter keeps live ids only, so every arm below
// runs against content that actually exists. Respawn is 240 seconds
// (NODE_HARVEST_TABLE), pinned literally where the delta value matters.
const NODE = GATHER_NODES.find((n) => n.type === 'ore' && n.zoneId === 'eastbrook_vale');
if (!NODE) throw new Error('no eastbrook ore node in content');
const RESPAWN_SECONDS = 240;

describe('the pure remaining-delta round trip (no Sim)', () => {
  it('serializes only still-running timers, as remaining seconds', () => {
    // readyAt 10 at now 5 is 5 seconds remaining; readyAt exactly now is
    // elapsed and must NOT serialize (absent means ready on load).
    expect(serializeNodeReadiness({ [NODE.id]: 10, other: 5 }, 5)).toEqual({ [NODE.id]: 5 });
  });

  it('returns undefined (field omission) when nothing is running', () => {
    expect(serializeNodeReadiness({}, 0)).toBeUndefined();
    expect(serializeNodeReadiness({ [NODE.id]: 3 }, 9)).toBeUndefined();
  });

  it('re-anchors a saved delta onto the loading clock', () => {
    expect(applyNodeReadiness({ [NODE.id]: 30 }, 100)).toEqual({ [NODE.id]: 130 });
  });

  it('loads an absent field as the everything-ready default', () => {
    expect(applyNodeReadiness(undefined, 7)).toEqual({});
    expect(applyNodeReadiness(null, 7)).toEqual({});
  });

  it('drops a retired node id on load rather than persisting it forever', () => {
    expect(GATHER_NODES.some((n) => n.id === 'legacy_node')).toBe(false);
    expect(applyNodeReadiness({ legacy_node: 100, [NODE.id]: 50 }, 0)).toEqual({ [NODE.id]: 50 });
  });

  it('drops malformed values and clamps a tampered remaining to one respawn', () => {
    expect(applyNodeReadiness({ [NODE.id]: Number.NaN }, 0)).toEqual({});
    expect(applyNodeReadiness({ [NODE.id]: -5 }, 0)).toEqual({});
    expect(applyNodeReadiness({ [NODE.id]: Number.POSITIVE_INFINITY }, 0)).toEqual({});
    // A hand-edited save cannot lock a node for longer than one real respawn.
    expect(applyNodeReadiness({ [NODE.id]: 999999 }, 0)).toEqual({ [NODE.id]: RESPAWN_SECONDS });
  });
});

describe('the real save/load path closes the relog exploit', () => {
  it('a harvest-consumed timer survives serialize, addPlayer, and a second save', () => {
    const sim = makeSim();
    const meta = metaOf(sim);
    // The REAL write: resolveHarvest consumes this player's timer for the node
    // (nodeHarvestReadyAt[id] = now + respawn) exactly as a live harvest does.
    const result = resolveHarvest(meta, NODE, sim.time, new Rng(3));
    expect(result.granted).toBe(true);
    const state = sim.serializeCharacter(sim.playerId) as CharacterState;
    // Full remaining at save time, pinned to the literal respawn (sim.time is
    // still 0: no ticks ran between the harvest and the save).
    expect(state.nodeHarvestCooldowns).toEqual({ [NODE.id]: RESPAWN_SECONDS });

    // The logout gap: the loading sim has its own clock, already advanced.
    // The delta FROZE during logout, so the timer resumes with its full
    // remaining anchored at load time rather than expiring on wall time.
    const reloaded = makeSim(12);
    for (let i = 0; i < 10; i++) reloaded.tick();
    const pid = reloaded.addPlayer('warrior', 'Returner', { state });
    const meta2 = reloaded.meta(pid) as PlayerMeta;
    expect(meta2.nodeHarvestReadyAt[NODE.id]).toBeCloseTo(reloaded.time + RESPAWN_SECONDS, 6);
    // The exploit pin itself: the relog did NOT hand the node back.
    expect(isNodeHarvestableBy(meta2, NODE.id, reloaded.time)).toBe(false);

    // Fixed point: an immediate re-save carries the same delta forward (pinned
    // to the FIRST literal, so a serializer that stopped emitting the field
    // cannot satisfy the equality with undefined on both sides).
    const resaved = reloaded.serializeCharacter(pid) as CharacterState;
    expect(resaved.nodeHarvestCooldowns).toEqual({ [NODE.id]: RESPAWN_SECONDS });
  });

  it('a partially elapsed timer saves only its remaining, never the full respawn', () => {
    const sim = makeSim();
    metaOf(sim).nodeHarvestReadyAt[NODE.id] = sim.time + 30;
    const state = sim.serializeCharacter(sim.playerId) as CharacterState;
    expect(state.nodeHarvestCooldowns).toEqual({ [NODE.id]: 30 });
    const reloaded = makeSim(13);
    const pid = reloaded.addPlayer('warrior', 'Partway', { state });
    const meta2 = reloaded.meta(pid) as PlayerMeta;
    expect(meta2.nodeHarvestReadyAt[NODE.id]).toBeCloseTo(reloaded.time + 30, 6);
  });

  it('a fresh character and an all-elapsed map both omit the field entirely', () => {
    const fresh = makeSim();
    // Absence, not {}: the omission is what keeps a clean character
    // byte-identical to a pre-D6 save.
    expect(fresh.serializeCharacter(fresh.playerId)?.nodeHarvestCooldowns).toBeUndefined();
    metaOf(fresh).nodeHarvestReadyAt[NODE.id] = fresh.time - 1;
    expect(fresh.serializeCharacter(fresh.playerId)?.nodeHarvestCooldowns).toBeUndefined();
  });

  it('a pre-D6 save (no field) loads with every node ready', () => {
    const sim = makeSim();
    const state = sim.serializeCharacter(sim.playerId) as CharacterState;
    delete state.nodeHarvestCooldowns;
    const reloaded = makeSim(14);
    const pid = reloaded.addPlayer('warrior', 'Legacy', { state });
    const meta2 = reloaded.meta(pid) as PlayerMeta;
    expect(meta2.nodeHarvestReadyAt).toEqual({});
    expect(isNodeHarvestableBy(meta2, NODE.id, reloaded.time)).toBe(true);
  });

  it('a retired id self-heals out of the save on the next round trip', () => {
    const sim = makeSim();
    const state = sim.serializeCharacter(sim.playerId) as CharacterState;
    state.nodeHarvestCooldowns = { legacy_node: 100, [NODE.id]: 50 };
    const reloaded = makeSim(15);
    const pid = reloaded.addPlayer('warrior', 'Healed', { state });
    const meta2 = reloaded.meta(pid) as PlayerMeta;
    expect(meta2.nodeHarvestReadyAt).toEqual({ [NODE.id]: reloaded.time + 50 });
    // The re-save carries only the live id: the retired key is gone for good.
    expect(reloaded.serializeCharacter(pid)?.nodeHarvestCooldowns).toEqual({ [NODE.id]: 50 });
  });
});
