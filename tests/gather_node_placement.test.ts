// Gather-node placement: does every authored node in src/sim/content/gather_nodes.ts
// sit somewhere a player can actually reach, stand on, and work?
//
// Nothing validated a node COORDINATE before this file, and the content had drifted
// badly: six of the eleven herb patches sat on a lake floor about 4 yards under the
// surface, all three Eastbrook ones included, so the only way to pick a herb in the
// starting zone was to swim to the bottom of Mirror Lake. A seventh node, a wood
// stand, sat in the Glimmermere shallows against a wall whose gradient reaches 3.28
// rise/run inside its own harvest reach.
//
// Every threshold here is a SHIPPED constant, never a fresh number: the movement
// climb limit and body radius come from the pathfinding module, the harvest reach
// is the same INTERACT_RANGE the harvest gate uses, and the water margin matches
// the one generateDecorations already screens world props with. The point is that
// this file cannot drift away from the rules the game actually enforces.
//
// The seed is the shipped world seed, and only that one. Terrain is a pure
// function of (x, z, seed): node coordinates are hand-authored against THIS
// world, so validating them at any other seed would be checking placements
// against terrain that never ships.

import { describe, expect, it } from 'vitest';
import { isBlocked } from '../src/sim/colliders';
import { GATHER_NODE_TYPES, GATHER_NODES, WORLD_MAX_X, ZONES, zoneAt } from '../src/sim/data';
import { PLAYER_BODY_RADIUS, PLAYER_MAX_CLIMB_SLOPE, PLAYER_SWIM_DEPTH } from '../src/sim/pathfind';
import { INTERACT_RANGE } from '../src/sim/types';
import {
  DECORATION_MAX_SLOPE,
  groundHeight,
  isInWaterBody,
  nearSteepWalls,
  terrainHeight,
  terrainSteepness,
  terrainSteepnessAt,
  waterLevelAt,
} from '../src/sim/world';

const WORLD_SEED = 20061; // src/main.ts WORLD_SEED, server/game.ts WORLD_SEED

// Freeboard a node needs above the local water surface. The NUMBER is not a new
// one: generateDecorations (world.ts) refuses to anchor a tree or boulder below
// waterLevel() + 1, and a gather node is the same kind of object, a procedurally
// placed world prop seated on the heightfield. The PREDICATE here is deliberately
// not the same: that screen reads terrainHeight against the global waterLevel()
// everywhere, while this reads groundHeight against waterLevelAt and only inside
// a declared water body, so a dry sunken feature (the Mirefen impact crater is
// one) stays legal exactly as isInWaterBody documents. No shipped node is
// currently separated by that difference. Measured headroom on the shipped
// content after this change: the tightest passing node clears by 0.57yd
// (ore_mirefen_t2, a genuine bank inside a lake's blend ring), and the tightest
// FAILING one missed by 0.54yd (the old wood_thornpeak_1, ankle deep in the
// Glimmermere), so the line sits in a real gap rather than splitting a cluster.
const WATER_MARGIN = 1;

// A node's "harvest reach" is exactly the gate harvestNode enforces: flat 2D
// distance <= INTERACT_RANGE (gathering.ts distToNode). Every arm below that
// talks about the ground AROUND a node means this disc.
const REACH = INTERACT_RANGE;

/** Height the local water surface sits at, or -Infinity where no water is declared. */
function waterAt(x: number, z: number): number {
  return waterLevelAt(x, z);
}

/** True where the ground is high enough above any declared water to be dry land. */
function isDryLand(x: number, z: number): boolean {
  if (!isInWaterBody(x, z)) return true; // no water declared here at all
  return groundHeight(x, z, WORLD_SEED) >= waterAt(x, z) + WATER_MARGIN;
}

/** Deep enough under a declared water surface that a player swims instead of walking. */
function isSwimDepth(x: number, z: number): boolean {
  return groundHeight(x, z, WORLD_SEED) < waterAt(x, z) - PLAYER_SWIM_DEPTH;
}

/**
 * Can a player hold this exact spot? These are the sim's own rules, not a
 * restatement: player_motion strips control and slides the player downhill off
 * ground whose gradient beats MAX_CLIMB_SLOPE (its steepGround arm, which reads
 * the memoized terrainSteepnessAt, so this uses the same function), a static
 * collider pushes the body out (colliders.isBlocked), and ground below swim
 * depth means treading water rather than standing.
 */
function canStand(x: number, z: number): boolean {
  if (isBlocked(WORLD_SEED, x, z, PLAYER_BODY_RADIUS)) return false;
  if (isSwimDepth(x, z)) return false;
  return terrainSteepnessAt(x, z, WORLD_SEED) <= PLAYER_MAX_CLIMB_SLOPE;
}

// Sampling density for the two reach sweeps below. Both use the same fan so a
// gradient the slope arm rejects cannot hide in a gap the stand arm would have
// looked at: at 0.5yd rings and 24 spokes the widest arc gap is about 1.3yd at
// the far edge of reach. This is a screen, not a proof, and it deliberately
// costs more than it needs to; the whole file runs in about a second.
const SWEEP_STEP = 0.5;
const SWEEP_SPOKES = 24;

/**
 * Steepest gradient anywhere in a node's harvest reach, node included. Uses the
 * EXACT terrainSteepness rather than the cell-memoized terrainSteepnessAt,
 * because this arm is about the shape of the ground a prop is anchored into
 * (world.ts screens scatter props the same way) rather than about the movement
 * gate, which is what canStand covers.
 */
function steepestInReach(x: number, z: number): number {
  let worst = terrainSteepness(x, z, WORLD_SEED);
  for (let r = SWEEP_STEP; r <= REACH; r += SWEEP_STEP) {
    for (let k = 0; k < SWEEP_SPOKES; k++) {
      const a = (k / SWEEP_SPOKES) * Math.PI * 2;
      worst = Math.max(
        worst,
        terrainSteepness(x + Math.cos(a) * r, z + Math.sin(a) * r, WORLD_SEED),
      );
    }
  }
  return worst;
}

/** The closest spot inside the harvest reach a player can stand on, or null. */
function nearestStandSpot(x: number, z: number): { x: number; z: number; r: number } | null {
  if (canStand(x, z)) return { x, z, r: 0 };
  for (let r = SWEEP_STEP; r <= REACH; r += SWEEP_STEP) {
    for (let k = 0; k < SWEEP_SPOKES; k++) {
      const a = (k / SWEEP_SPOKES) * Math.PI * 2;
      const sx = x + Math.cos(a) * r;
      const sz = z + Math.sin(a) * r;
      if (canStand(sx, sz)) return { x: sx, z: sz, r };
    }
  }
  return null;
}

// --- hub reachability -------------------------------------------------------
// A coarse walkability flood, stepping the sim's own uphill wall rule. findPath
// cannot answer this: its window caps at 64 cells per axis and it falls back to
// a straight line past that, so it would report every far node "reachable" by
// fiat. Water is traversable because players swim, which is why a submerged node
// still passes THIS arm and gets caught by the dry-land and stand-spot arms
// instead: each arm fails for its own reason.

const FLOOD_CELL = 2; // yards per cell
const FLOOD_MARGIN = 45; // yards of slack around the hub + nodes bounding box

/** Height the body rides at: the water surface when submerged, else the ground. */
function rideHeight(x: number, z: number): number {
  const h = groundHeight(x, z, WORLD_SEED);
  const wl = waterAt(x, z);
  return h < wl ? wl : h;
}

/**
 * player_motion's wall rule in SHAPE, not verbatim: an uphill step is refused
 * when the step itself beats the climb limit OR it lands on ground whose own
 * gradient does, so approaching a wall at an angle cannot cheat it, and downhill
 * is never refused. Four deliberate divergences, all in the permissive direction
 * so this cannot invent a wall the game does not have: it rides rideHeight where
 * movement reads groundHeight and skips the block entirely while swimming, it
 * treats a swim-depth destination as passable outright, it steps 2 yards where a
 * player steps about RUN_SPEED * DT (which climbs the east rim roughly 2 yards
 * further than a 0.5-yard flood), and it refuses a blocked step where movement
 * would slide along the collider.
 */
function stepAllowed(fromX: number, fromZ: number, toX: number, toZ: number): boolean {
  if (isBlocked(WORLD_SEED, toX, toZ, PLAYER_BODY_RADIUS)) return false;
  const h0 = rideHeight(fromX, fromZ);
  const h1 = rideHeight(toX, toZ);
  const run = Math.hypot(toX - fromX, toZ - fromZ);
  if (h1 <= h0 || run <= 1e-5) return true;
  if ((h1 - h0) / run > PLAYER_MAX_CLIMB_SLOPE) return false;
  if (isSwimDepth(toX, toZ)) return true; // swimming skips the climb gate
  return terrainSteepnessAt(toX, toZ, WORLD_SEED) <= PLAYER_MAX_CLIMB_SLOPE;
}

interface Box {
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
}

function floodFrom(origin: { x: number; z: number }, box: Box): Set<string> {
  const cell = (v: number) => Math.round(v / FLOOD_CELL);
  const key = (cx: number, cz: number) => `${cx},${cz}`;
  const start: [number, number] = [cell(origin.x), cell(origin.z)];
  const reached = new Set([key(start[0], start[1])]);
  const queue: [number, number][] = [start];
  for (let head = 0; head < queue.length; head++) {
    const [cx, cz] = queue[head];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue;
        const nx = (cx + dx) * FLOOD_CELL;
        const nz = (cz + dz) * FLOOD_CELL;
        if (nx < box.xMin || nx > box.xMax || nz < box.zMin || nz > box.zMax) continue;
        const k = key(cx + dx, cz + dz);
        if (reached.has(k)) continue;
        if (!stepAllowed(cx * FLOOD_CELL, cz * FLOOD_CELL, nx, nz)) continue;
        reached.add(k);
        queue.push([cx + dx, cz + dz]);
      }
    }
  }
  return reached;
}

function boxAround(points: { x: number; z: number }[]): Box {
  return {
    xMin: Math.max(-WORLD_MAX_X, Math.min(...points.map((p) => p.x)) - FLOOD_MARGIN),
    xMax: Math.min(WORLD_MAX_X, Math.max(...points.map((p) => p.x)) + FLOOD_MARGIN),
    zMin: Math.min(...points.map((p) => p.z)) - FLOOD_MARGIN,
    zMax: Math.max(...points.map((p) => p.z)) + FLOOD_MARGIN,
  };
}

function cellKey(x: number, z: number): string {
  return `${Math.round(x / FLOOD_CELL)},${Math.round(z / FLOOD_CELL)}`;
}

// Reachability floods are the one expensive thing here, so run each zone's once
// and share it across the arms that need it.
const reachedByZone = new Map<string, Set<string>>();
for (const zone of ZONES) {
  const nodes = GATHER_NODES.filter((n) => n.zoneId === zone.id).map((n) => n.pos);
  reachedByZone.set(zone.id, floodFrom(zone.hub, boxAround([zone.hub, ...nodes])));
}

// Named points used as counter-examples below. Every one is measured, not
// assumed, and each is asserted to genuinely have the property it stands for, so
// an arm can never pass because its counter-example quietly stopped being one.
const ON_MIRROR_LAKE_FLOOR = { x: -86, z: 90 }; // where herb_eastbrook_1 used to sit
const IN_GLIMMERMERE_SHALLOWS = { x: -55, z: 765 }; // where wood_thornpeak_1 used to sit
const ON_EAST_RIM_WALL = { x: 165, z: 0 };
const ON_SOWFIELD_STAND = { x: -41, z: -137 }; // groundHeight adds the stand lift here
const INSIDE_A_TOWN_COLLIDER = { x: -29, z: 0 };

describe('gather node placement: every node sits on ground a player can work', () => {
  it('dry land: no node sits at or under a declared water surface', () => {
    for (const node of GATHER_NODES) {
      const { x, z } = node.pos;
      const clearance = isInWaterBody(x, z)
        ? groundHeight(x, z, WORLD_SEED) - waterAt(x, z)
        : Number.POSITIVE_INFINITY;
      expect(
        isDryLand(x, z),
        `${node.id} at (${x},${z}) clears the water by ${clearance.toFixed(2)}yd, needs ${WATER_MARGIN}`,
      ).toBe(true);
    }
  });

  it('the dry-land arm rejects a lake floor and the shallows, so it can fail', () => {
    // Both are real placements this change moved off. Assert the property first
    // (these points ARE wet), then that the arm says so.
    expect(isInWaterBody(ON_MIRROR_LAKE_FLOOR.x, ON_MIRROR_LAKE_FLOOR.z)).toBe(true);
    expect(groundHeight(ON_MIRROR_LAKE_FLOOR.x, ON_MIRROR_LAKE_FLOOR.z, WORLD_SEED)).toBeLessThan(
      waterAt(ON_MIRROR_LAKE_FLOOR.x, ON_MIRROR_LAKE_FLOOR.z),
    );
    expect(isDryLand(ON_MIRROR_LAKE_FLOOR.x, ON_MIRROR_LAKE_FLOOR.z)).toBe(false);
    // The shallows are ABOVE the waterline yet still fail: freeboard alone is
    // what this arm measures, not merely "is it submerged".
    expect(
      groundHeight(IN_GLIMMERMERE_SHALLOWS.x, IN_GLIMMERMERE_SHALLOWS.z, WORLD_SEED),
    ).toBeGreaterThan(waterAt(IN_GLIMMERMERE_SHALLOWS.x, IN_GLIMMERMERE_SHALLOWS.z));
    expect(isDryLand(IN_GLIMMERMERE_SHALLOWS.x, IN_GLIMMERMERE_SHALLOWS.z)).toBe(false);
  });

  it('walkable slope: no node, and no ground in its harvest reach, is a cliff', () => {
    // Both halves matter and neither subsumes the other. The old wood_thornpeak_1
    // measured a perfectly walkable 0.94 AT the node while the wall inside its
    // own reach hit 3.28, so a node-only check passed it; the reach sweep is what
    // caught it. Both figures come from the sweep below, so re-measuring with it
    // reproduces them. Headroom on the shipped table is real rather than
    // marginal: the steepest reach of any passing node is wood_thornpeak_t2 at
    // 1.04 against the 1.5 limit.
    expect(
      DECORATION_MAX_SLOPE,
      'this arm reads the movement climb limit as the prop-anchoring limit too; world.ts says they are the same gradient, and they are two independent literals, so pin the equality rather than the coincidence',
    ).toBe(PLAYER_MAX_CLIMB_SLOPE);
    for (const node of GATHER_NODES) {
      const { x, z } = node.pos;
      expect(
        terrainSteepness(x, z, WORLD_SEED),
        `${node.id} at (${x},${z}) stands on unwalkable ground`,
      ).toBeLessThanOrEqual(PLAYER_MAX_CLIMB_SLOPE);
      expect(
        steepestInReach(x, z),
        `${node.id} at (${x},${z}) has a cliff inside its ${REACH}yd harvest reach`,
      ).toBeLessThanOrEqual(PLAYER_MAX_CLIMB_SLOPE);
      expect(
        nearSteepWalls(x, z),
        `${node.id} at (${x},${z}) sits in a deliberate wall band (zone ridge or world rim)`,
      ).toBe(false);
    }
  });

  it('the slope arm rejects the rim wall and the reach sweep rejects a wall in range', () => {
    expect(terrainSteepness(ON_EAST_RIM_WALL.x, ON_EAST_RIM_WALL.z, WORLD_SEED)).toBeGreaterThan(
      PLAYER_MAX_CLIMB_SLOPE,
    );
    expect(nearSteepWalls(ON_EAST_RIM_WALL.x, ON_EAST_RIM_WALL.z)).toBe(true);
    // The reach sweep on its own: walkable at the point, cliff within reach.
    expect(
      terrainSteepness(IN_GLIMMERMERE_SHALLOWS.x, IN_GLIMMERMERE_SHALLOWS.z, WORLD_SEED),
    ).toBeLessThanOrEqual(PLAYER_MAX_CLIMB_SLOPE);
    expect(steepestInReach(IN_GLIMMERMERE_SHALLOWS.x, IN_GLIMMERMERE_SHALLOWS.z)).toBeGreaterThan(
      PLAYER_MAX_CLIMB_SLOPE,
    );
  });

  it('no collider overlap: no node is buried inside a building, trunk or fence', () => {
    for (const node of GATHER_NODES) {
      const { x, z } = node.pos;
      expect(
        isBlocked(WORLD_SEED, x, z, PLAYER_BODY_RADIUS),
        `${node.id} at (${x},${z}) overlaps a static collider`,
      ).toBe(false);
    }
  });

  it('the collider arm rejects a point inside a town collider, so it can fail', () => {
    expect(
      isBlocked(WORLD_SEED, INSIDE_A_TOWN_COLLIDER.x, INSIDE_A_TOWN_COLLIDER.z, PLAYER_BODY_RADIUS),
    ).toBe(true);
  });

  it('a stand spot: every node can be worked from a spot that is itself reachable', () => {
    // Existence alone is not enough: a standable ledge walled off from the rest
    // of the zone would satisfy "there is somewhere to stand" while being no use
    // to a player, so the spot has to sit in the hub's reachable set too.
    for (const node of GATHER_NODES) {
      const { x, z } = node.pos;
      const spot = nearestStandSpot(x, z);
      expect(
        spot,
        `${node.id} at (${x},${z}) has nowhere within ${REACH}yd a player can stand`,
      ).not.toBeNull();
      if (!spot) continue;
      expect(spot.r).toBeLessThanOrEqual(REACH);
      expect(
        reachedByZone.get(node.zoneId)?.has(cellKey(spot.x, spot.z)),
        `${node.id}'s stand spot (${spot.x.toFixed(1)},${spot.z.toFixed(1)}) is cut off from the ${node.zoneId} hub`,
      ).toBe(true);
    }
  });

  it('the stand-spot arm rejects a lake floor, whose whole reach is swim depth', () => {
    expect(isSwimDepth(ON_MIRROR_LAKE_FLOOR.x, ON_MIRROR_LAKE_FLOOR.z)).toBe(true);
    expect(nearestStandSpot(ON_MIRROR_LAKE_FLOOR.x, ON_MIRROR_LAKE_FLOOR.z)).toBeNull();
  });

  it('the stand-spot arm rejects a standable spot that is walled off', () => {
    // The other half of that arm, which the lake floor cannot exercise: it
    // returns null before the reachability leg is ever consulted. On the rim
    // wall a spot IS standable, and the leg is the only thing that rejects it.
    // Floods its own box containing the point, because the Eastbrook box stops
    // near x = -12 and using it would pass for being out of bounds instead.
    const spot = nearestStandSpot(ON_EAST_RIM_WALL.x, ON_EAST_RIM_WALL.z);
    expect(spot, 'the rim fixture must be standable, or it proves nothing').not.toBeNull();
    if (!spot) return;
    const box = boxAround([ZONES[0].hub, ON_EAST_RIM_WALL]);
    const reached = floodFrom(ZONES[0].hub, box);
    expect(reached.has(cellKey(spot.x, spot.z))).toBe(false);
  });

  it('hub reachability: every node is walkable-or-swimmable from its zone hub', () => {
    for (const node of GATHER_NODES) {
      const reached = reachedByZone.get(node.zoneId);
      expect(reached, `no flood for zone ${node.zoneId}`).toBeDefined();
      expect(
        reached?.has(cellKey(node.pos.x, node.pos.z)),
        `${node.id} at (${node.pos.x},${node.pos.z}) is cut off from the ${node.zoneId} hub`,
      ).toBe(true);
    }
  });

  it('the reachability arm rejects a point walled off behind the world rim', () => {
    const hub = ZONES[0].hub;
    // Flood a box that deliberately CONTAINS the rim point, so failing to reach
    // it is the wall's doing and not the bounding box's.
    const box = boxAround([hub, ON_EAST_RIM_WALL]);
    expect(ON_EAST_RIM_WALL.x).toBeLessThanOrEqual(box.xMax);
    expect(ON_EAST_RIM_WALL.z).toBeLessThanOrEqual(box.zMax);
    expect(ON_EAST_RIM_WALL.z).toBeGreaterThanOrEqual(box.zMin);
    const reached = floodFrom(hub, box);
    // NOT the hub cell: floodFrom seeds that unconditionally, so asserting it
    // would hold for a flood that spread nowhere at all. A cell 100 yards out
    // proves the flood actually travelled before the wall stopped it.
    expect(reached.has(cellKey(100, 0))).toBe(true);
    expect(reached.has(cellKey(ON_EAST_RIM_WALL.x, ON_EAST_RIM_WALL.z))).toBe(false);
  });

  it('zone containment: a node resolves to the zone whose material it grants', () => {
    // nodeMaterialFor(node.type, node.zoneId) keys the yield off the DECLARED
    // zoneId, so a node standing in one band while claiming another hands out
    // that other zone's material. zoneAt is the same resolver the sim uses, and
    // it is exclusive at zMax where the existing band check in
    // tests/gather_nodes.test.ts is inclusive on both ends: a node exactly on a
    // boundary passes there and is mis-zoned here.
    for (const node of GATHER_NODES) {
      expect(
        zoneAt(node.pos.z).id,
        `${node.id} at z=${node.pos.z} claims ${node.zoneId} but stands in another zone`,
      ).toBe(node.zoneId);
      expect(
        Math.abs(node.pos.x),
        `${node.id} is outside the world's x bounds`,
      ).toBeLessThanOrEqual(WORLD_MAX_X);
    }
  });

  it('the zone arm rejects a boundary z the inclusive band check would allow', () => {
    const eastbrook = ZONES[0];
    expect(eastbrook.id).toBe('eastbrook_vale');
    // z === zMax passes "z >= zMin && z <= zMax" for eastbrook_vale, yet zoneAt
    // hands it to the next band, which is precisely the mis-zoned yield case.
    const boundary = eastbrook.zMax;
    expect(boundary >= eastbrook.zMin && boundary <= eastbrook.zMax).toBe(true);
    expect(zoneAt(boundary).id).not.toBe(eastbrook.id);
  });

  it('minimum spacing: no two nodes collapse into one harvest reach', () => {
    // Two nodes closer than the reach are one node to a player: useGatherToolItem
    // has to arbitrate between them, and the props overlap. INTERACT_RANGE is the
    // floor rather than a fresh number, and the Eastbrook ore trio deliberately
    // sits at exactly that distance (tests/gather_tool_use.test.ts leans on the
    // 5yd pair to prove nearest-node selection), so the bound is inclusive.
    for (let i = 0; i < GATHER_NODES.length; i++) {
      for (let j = i + 1; j < GATHER_NODES.length; j++) {
        const a = GATHER_NODES[i];
        const b = GATHER_NODES[j];
        const d = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
        expect(d, `${a.id} and ${b.id} are ${d.toFixed(2)}yd apart`).toBeGreaterThanOrEqual(
          INTERACT_RANGE,
        );
      }
    }
  });

  it('the spacing floor is exercised by real content, not passing by slack', () => {
    // Without this the arm above could hold simply because nothing comes close
    // to the floor. Bracketing the tightest real pair into [INTERACT_RANGE,
    // INTERACT_RANGE + 1) proves the bound is load-bearing: the Eastbrook ore
    // trio sits exactly on it, so any node nudged closer fails immediately.
    let tightest = Number.POSITIVE_INFINITY;
    let pair = '';
    for (let i = 0; i < GATHER_NODES.length; i++) {
      for (let j = i + 1; j < GATHER_NODES.length; j++) {
        const a = GATHER_NODES[i];
        const b = GATHER_NODES[j];
        const d = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
        if (d < tightest) {
          tightest = d;
          pair = `${a.id} / ${b.id}`;
        }
      }
    }
    expect(tightest, `tightest pair ${pair}`).toBeLessThan(INTERACT_RANGE + 1);
  });

  it('coverage floor: every zone keeps every gathering profession worth visiting', () => {
    // A relocation must never be allowed to drain a zone of a type (moving a node
    // across a band boundary would). The floor is what ships today, so it holds a
    // relocation flat without freezing the count: node COUNTS are owned elsewhere
    // and only ever grow from here.
    //
    // The total is NOT enough on its own. Thornpeak ships four nodes per type but
    // only two of them are tier 1, so a total-only floor of 3 would still pass a
    // relocation that drained the zone's last tier-1 node and left a traveller
    // holding a starter tool with nothing it can work. Hence the second floor.
    for (const zone of ZONES) {
      for (const type of GATHER_NODE_TYPES) {
        const ofType = GATHER_NODES.filter((n) => n.zoneId === zone.id && n.type === type);
        expect(
          ofType.length,
          `${zone.id} offers only ${ofType.length} ${type} node(s)`,
        ).toBeGreaterThanOrEqual(3);
        const tier1 = ofType.filter((n) => n.tier === 1);
        expect(
          tier1.length,
          `${zone.id} offers no tier-1 ${type} node, so a starter tool cannot work the zone`,
        ).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('the coverage floors are exercised by real content, not passing by slack', () => {
    // Both floors sit close enough to the shipped content to bite. Without this,
    // either could hold purely because every zone ships far more than the floor.
    let leanestTotal = Number.POSITIVE_INFINITY;
    let leanestTier1 = Number.POSITIVE_INFINITY;
    for (const zone of ZONES) {
      for (const type of GATHER_NODE_TYPES) {
        const ofType = GATHER_NODES.filter((n) => n.zoneId === zone.id && n.type === type);
        leanestTotal = Math.min(leanestTotal, ofType.length);
        leanestTier1 = Math.min(leanestTier1, ofType.filter((n) => n.tier === 1).length);
      }
    }
    // Eastbrook ships exactly three of each type, so the total floor is tight.
    expect(leanestTotal).toBe(3);
    // Thornpeak ships exactly two tier-1 nodes of each type, so losing both is
    // two relocations away, not a theoretical concern.
    expect(leanestTier1).toBe(2);
  });

  it('render anchor: groundHeight and terrainHeight agree at every node', () => {
    // src/render/gather_nodes.ts seats each node prop at terrainHeight, while
    // every check above (and all movement) uses groundHeight, which adds the
    // Sowfield stand lift and dock plank surfaces on top of the same baseline.
    // Where the two disagree the prop renders sunk into the platform a player is
    // standing on, so a node authored onto a dock or a stand tier is a bug even
    // though it is dry, level, clear and reachable.
    for (const node of GATHER_NODES) {
      const { x, z } = node.pos;
      expect(
        groundHeight(x, z, WORLD_SEED),
        `${node.id} at (${x},${z}) is anchored on a raised walkable surface`,
      ).toBeCloseTo(terrainHeight(x, z, WORLD_SEED), 9);
    }
  });

  it('the Mirror Lake landmark stays reachable on foot without swimming', () => {
    // Moving the Eastbrook herbs onto the bank took them outside this landmark's
    // visit radius, so Wayfarer of the Vale no longer collects the mark while you
    // pick. That is only acceptable while the landmark itself can still be
    // visited dry, and nothing else asserts it: after the relocation no test and
    // no parity golden touches this POI at all, so a future lake-radius or
    // edit-layer change could flood the shore and quietly turn a deed step into a
    // swim. One standable, dry point inside the radius is all the deed needs.
    const poi = ZONES[0].pois.find((p) => p.id === 'mirror_lake');
    expect(poi, 'mirror_lake POI missing from eastbrook_vale').toBeDefined();
    if (!poi) return;
    const VISIT_RADIUS = 20; // src/sim/deeds.ts POI_VISIT_RADIUS, not exported
    let best = Number.NEGATIVE_INFINITY;
    for (let dx = -VISIT_RADIUS; dx <= VISIT_RADIUS; dx += 0.5) {
      for (let dz = -VISIT_RADIUS; dz <= VISIT_RADIUS; dz += 0.5) {
        if (Math.hypot(dx, dz) > VISIT_RADIUS) continue;
        const x = poi.x + dx;
        const z = poi.z + dz;
        if (!canStand(x, z) || !isDryLand(x, z)) continue;
        const wl = waterAt(x, z);
        best = Math.max(
          best,
          wl === -Infinity ? Number.POSITIVE_INFINITY : groundHeight(x, z, WORLD_SEED) - wl,
        );
      }
    }
    expect(
      best,
      `no dry standable ground within ${VISIT_RADIUS}yd of the Mirror Lake landmark`,
    ).toBeGreaterThanOrEqual(WATER_MARGIN);
  });

  it('the anchor arm rejects a Sowfield stand tier, where the two really differ', () => {
    const { x, z } = ON_SOWFIELD_STAND;
    const lift = groundHeight(x, z, WORLD_SEED) - terrainHeight(x, z, WORLD_SEED);
    expect(lift).toBeGreaterThan(0.2);
    expect(groundHeight(x, z, WORLD_SEED)).not.toBeCloseTo(terrainHeight(x, z, WORLD_SEED), 9);
  });
});

// Deliberately NOT an arm: road clearance, and the honest reason is not that no
// threshold exists. One does, in exactly the form the water margin above was
// taken from: generateDecorations refuses to anchor a world prop within 5 yards
// of a road (world.ts, `roadDistance(x, z) < 5`). Adopting it here would fail
// five nodes that ship today: wood_mirefen_t2 at 0.3yd (effectively standing in
// the road), ore_eastbrook_1 at 1.7, ore_eastbrook_3 at 3.3, herb_thornpeak_2 at
// 3.8, and ore_mirefen_2 at 4.0.
//
// Two of those are the Copper Dig ore trio, deliberately placed beside the road
// that serves the mine and pinned there by tests/gather_nodes.test.ts, so the
// rule would fight an intentional placement as well as force relocations this
// change is not scoped to make. That is a content decision needing its own pass,
// not something to settle as a side effect, and wood_mirefen_t2 sitting on the
// road surface looks like a real defect worth raising separately. Recorded here
// so the omission reads as a decision rather than an oversight.
