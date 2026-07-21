import { ITEMS, MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { Sim } from '../src/sim/sim';
import {
  dist2d,
  type Entity,
  type EquipSlot,
  type PlayerClass,
  type SimEvent,
} from '../src/sim/types';

export type OwnedDpsSpec =
  | 'packlord'
  | 'coldsight'
  | 'fieldcraft'
  | 'thundercall'
  | 'warspirit'
  | 'vespers';

export interface OwnedClassBalanceScenario {
  targets: 1 | 3;
  seconds: 15 | 60;
  window: 'burst' | 'sustained';
}

export interface OwnedClassBalanceResult {
  head: string;
  seed: number;
  spec: OwnedDpsSpec;
  playerClass: PlayerClass;
  scenario: OwnedClassBalanceScenario;
  totalDamage: number;
  dps: number;
  damageByTarget: Record<string, number>;
  damageBySource: Record<string, number>;
  castsByAbility: Record<string, number>;
  cooldownUses: Record<string, number>;
  buttonsPressed: number;
  resource: {
    type: string | null;
    start: number;
    end: number;
    max: number;
  };
  stats: {
    attackPower: number;
    rangedAttackPower: number;
    spellPower: number;
  };
  equipment: Record<string, string | null>;
}

type ProbeSim = Sim & {
  addEntity(entity: Entity): void;
  nextId: number;
};

interface Fixture {
  cls: PlayerClass;
  talentSpec: string;
  distance: number;
  hunterPet: boolean;
}

type PbeLoadout = Readonly<Partial<Record<EquipSlot, string>>>;

interface RunState {
  sim: ProbeSim;
  spec: OwnedDpsSpec;
  targets: Entity[];
  primary: Entity;
  castsByAbility: Record<string, number>;
  cooldownUses: Record<string, number>;
  buttonsPressed: number;
}

export const OWNED_CLASS_BALANCE_SCENARIOS: readonly OwnedClassBalanceScenario[] = [
  { targets: 1, seconds: 15, window: 'burst' },
  { targets: 1, seconds: 60, window: 'sustained' },
  { targets: 3, seconds: 15, window: 'burst' },
  { targets: 3, seconds: 60, window: 'sustained' },
] as const;

export const OWNED_DPS_SPECS: readonly OwnedDpsSpec[] = [
  'packlord',
  'coldsight',
  'fieldcraft',
  'thundercall',
  'warspirit',
  'vespers',
] as const;

const FIXTURES: Record<OwnedDpsSpec, Fixture> = {
  packlord: { cls: 'hunter', talentSpec: 'beast_mastery', distance: 20, hunterPet: true },
  coldsight: { cls: 'hunter', talentSpec: 'marksmanship', distance: 20, hunterPet: true },
  fieldcraft: { cls: 'hunter', talentSpec: 'survival', distance: 12, hunterPet: true },
  thundercall: { cls: 'shaman', talentSpec: 'elemental', distance: 18, hunterPet: false },
  warspirit: { cls: 'shaman', talentSpec: 'enhancement', distance: 3, hunterPet: false },
  vespers: { cls: 'priest', talentSpec: 'shadow', distance: 18, hunterPet: false },
};

// Fixed level-20 PBE loadouts. These deliberately use exact item ids instead of
// "best available" discovery so a new item cannot silently rewrite the balance
// baseline. Each class keeps its intended raid set, including its 4-piece bonus.
const HUNTER_PBE_LOADOUT: PbeLoadout = {
  mainhand: 'heroic_direfang_greatblade',
  helmet: 'heroic_nighttalon_crown',
  neck: 'yumis_keepsake_locket',
  shoulder: 'heroic_nighttalon_shoulderguards',
  chest: 'heroic_wyrmshadow_harness',
  waist: 'nighttalon_waistband',
  legs: 'tidewoven_trousers',
  gloves: 'nighttalon_grips',
  feet: 'bonechill_striders',
  ring1: 'sutils_gambit',
  ring2: 'sutils_gambit',
};

const THUNDERCALL_PBE_LOADOUT: PbeLoadout = {
  mainhand: 'stormcallers_focus',
  offhand: 'heroic_wraithfire_orb',
  helmet: 'heroic_stormcallers_crown',
  neck: 'zense_meridian',
  shoulder: 'heroic_stormcallers_spaulders',
  chest: 'shroud_of_the_gravewyrm',
  waist: 'stormcallers_waistguard',
  legs: 'lunar_choir_leggings',
  gloves: 'stormcallers_handguards',
  feet: 'shadowpulse_slippers',
  ring1: 'architects_cornerstone',
  ring2: 'architects_cornerstone',
};

const WARSPIRIT_PBE_LOADOUT: PbeLoadout = {
  mainhand: 'gravewyrm_cleaver',
  offhand: 'gravewyrm_cleaver',
  helmet: 'heroic_stormcallers_crown',
  neck: 'swiftfang_talisman',
  shoulder: 'heroic_stormcallers_spaulders',
  chest: 'morthens_cryptforged_hauberk',
  waist: 'stormcallers_waistguard',
  legs: 'heroic_deathlord_legguards',
  gloves: 'stormcallers_handguards',
  feet: 'tideworn_warboots',
  ring1: 'seal_of_the_nine_oaths',
  ring2: 'sutils_gambit',
};

const VESPERS_PBE_LOADOUT: PbeLoadout = {
  mainhand: 'scepter_of_the_deathless_court',
  offhand: 'heroic_wraithfire_orb',
  helmet: 'heroic_soulflame_cowl',
  neck: 'zense_meridian',
  shoulder: 'heroic_soulflame_mantle',
  chest: 'shroud_of_the_gravewyrm',
  waist: 'soulflame_cord',
  legs: 'lunar_choir_leggings',
  gloves: 'soulflame_gloves',
  feet: 'shadowpulse_slippers',
  ring1: 'architects_cornerstone',
  ring2: 'architects_cornerstone',
};

export const OWNED_CLASS_PBE_LOADOUTS: Readonly<Record<OwnedDpsSpec, PbeLoadout>> = {
  packlord: HUNTER_PBE_LOADOUT,
  coldsight: HUNTER_PBE_LOADOUT,
  fieldcraft: HUNTER_PBE_LOADOUT,
  thundercall: THUNDERCALL_PBE_LOADOUT,
  warspirit: WARSPIRIT_PBE_LOADOUT,
  vespers: VESPERS_PBE_LOADOUT,
};

function equipPbeLoadout(sim: Sim, spec: OwnedDpsSpec): void {
  const loadout = OWNED_CLASS_PBE_LOADOUTS[spec];
  for (const [slot, itemId] of Object.entries(loadout) as [EquipSlot, string][]) {
    if (!ITEMS[itemId]) throw new Error(`missing PBE fixture item ${itemId}`);
    sim.addItem(itemId, 1);
    sim.equipItemToSlot(itemId, slot);
  }
  const equipment = sim.players.get(sim.playerId)?.equipment;
  for (const [slot, itemId] of Object.entries(loadout) as [EquipSlot, string][]) {
    if (equipment?.[slot] !== itemId) {
      throw new Error(`failed to equip ${itemId} in ${slot}`);
    }
  }
}

function addTarget(sim: ProbeSim, xOffset: number, distance: number): Entity {
  const target = createMob(sim.nextId++, MOBS.training_dummy, 20, {
    x: sim.player.pos.x + xOffset,
    y: sim.player.pos.y,
    z: sim.player.pos.z + distance,
  });
  target.hostile = true;
  target.aiState = 'idle';
  target.moveSpeed = 0;
  target.maxHp = 100_000_000;
  target.hp = target.maxHp;
  target.weapon.min = 0;
  target.weapon.max = 0;
  target.weapon.speed = 100;
  sim.addEntity(target);
  return target;
}

function addHunterPet(sim: ProbeSim, target: Entity): Entity {
  const pet = createMob(sim.nextId++, MOBS.forest_wolf, 20, {
    x: target.pos.x + 1,
    y: target.pos.y,
    z: target.pos.z - 2,
  });
  pet.hostile = false;
  pet.ownerId = sim.playerId;
  pet.maxHp = 1_000_000;
  pet.hp = pet.maxHp;
  pet.aggroTargetId = target.id;
  pet.inCombat = true;
  sim.addEntity(pet);
  return pet;
}

function ownAura(
  target: Entity,
  id: string,
  sourceId: number,
): Entity['auras'][number] | undefined {
  return target.auras.find((aura) => aura.id === id && aura.sourceId === sourceId);
}

function fullStacks(player: Entity, kind: string, stacks: number): boolean {
  return player.auras.some((aura) => aura.kind === kind && (aura.stacks ?? 0) >= stacks);
}

function hasAura(player: Entity, id: string): boolean {
  return player.auras.some((aura) => aura.id === id);
}

function aimAt(state: RunState, target: Entity): void {
  state.sim.targetEntity(target.id);
  state.sim.player.facing = Math.atan2(
    target.pos.x - state.sim.player.pos.x,
    target.pos.z - state.sim.player.pos.z,
  );
  state.sim.player.prevFacing = state.sim.player.facing;
}

function castFingerprint(sim: Sim, abilityId: string): string {
  const p = sim.player;
  return JSON.stringify([
    p.resource,
    p.gcdRemaining,
    p.castingAbility,
    p.cooldowns.get(abilityId) ?? null,
    p.auras.map((aura) => [aura.id, aura.stacks ?? null, aura.remaining]),
  ]);
}

function tryCast(
  state: RunState,
  abilityId: string,
  target: Entity = state.primary,
  groundTarget = false,
): boolean {
  const resolved = state.sim.resolvedAbility(abilityId);
  if (!resolved || state.sim.player.resource < resolved.cost) return false;
  aimAt(state, target);
  const before = castFingerprint(state.sim, resolved.def.id);
  const resolvedId = resolved.def.id;
  const resolvedName = resolved.def.name;
  if (groundTarget) {
    state.sim.castAbility(abilityId, state.sim.playerId, { x: target.pos.x, z: target.pos.z });
  } else {
    state.sim.castAbility(abilityId);
  }
  if (castFingerprint(state.sim, resolvedId) === before) return false;
  state.buttonsPressed++;
  state.castsByAbility[resolvedName] = (state.castsByAbility[resolvedName] ?? 0) + 1;
  if (resolved.cooldown > 0) {
    state.cooldownUses[resolvedName] = (state.cooldownUses[resolvedName] ?? 0) + 1;
  }
  return true;
}

function castPacklord(state: RunState): void {
  if (state.sim.resolvedAbility('pack_command')?.def.id === 'unleash_beast') {
    if (tryCast(state, 'pack_command')) return;
  }
  if (tryCast(state, 'bestial_wrath')) return;
  if (state.sim.player.resource >= 75 && tryCast(state, 'arcane_shot')) return;
  if (tryCast(state, 'pack_command')) return;
  tryCast(state, 'arcane_shot');
}

function castColdsight(state: RunState): void {
  if (tryCast(state, 'cold_focus')) return;
  if (state.targets.length === 3 && tryCast(state, 'volley', state.primary, true)) return;
  if (tryCast(state, 'rapid_fire')) return;
  if (tryCast(state, 'aimed_shot')) return;
  tryCast(state, 'measured_shot');
}

function castFieldcraft(state: RunState): void {
  const wound = ownAura(state.primary, 'bloodhook_bleed', state.sim.playerId);
  const momentum =
    state.sim.player.auras.find((aura) => aura.id === 'hunting_momentum')?.stacks ?? 0;
  if (tryCast(state, 'bloodtrail_assault')) return;
  if (!wound) {
    if (dist2d(state.sim.player.pos, state.primary.pos) >= 8) {
      if (tryCast(state, 'bloodhook')) return;
    } else if (tryCast(state, 'trailbreak')) {
      return;
    }
  }
  if (wound && tryCast(state, 'shrapnel_charge')) return;
  if (wound && momentum >= 3 && tryCast(state, 'mongoose_bite')) return;
  if (wound && wound.remaining <= 3 && tryCast(state, 'mongoose_bite')) return;
  tryCast(state, 'raptor_strike');
}

function castThundercall(state: RunState): void {
  const thunder =
    state.sim.player.auras.find((aura) => aura.id === 'shaman_thunder_charges')?.stacks ?? 0;
  if (tryCast(state, 'elemental_mastery')) return;
  if (thunder >= 5) {
    if (state.targets.length === 3 && tryCast(state, 'earthquake', state.primary, true)) return;
    if (tryCast(state, 'earth_shock')) return;
  }
  const missingCinder = state.targets.find(
    (target) => !ownAura(target, 'flame_shock', state.sim.playerId),
  );
  if (missingCinder && thunder < 4 && tryCast(state, 'flame_shock', missingCinder)) return;
  tryCast(state, 'lightning_bolt');
}

function castWarspirit(state: RunState): void {
  if (hasAura(state.sim.player, 'shaman_stormcast') && tryCast(state, 'lightning_bolt')) return;
  if (tryCast(state, 'stormstrike')) return;
  if (!ownAura(state.primary, 'flame_shock', state.sim.playerId)) {
    if (tryCast(state, 'flame_shock')) return;
  }
  tryCast(state, 'earth_shock');
}

function castVespers(state: RunState): void {
  if (fullStacks(state.sim.player, 'gloomtithe', 5) && tryCast(state, 'summon_tithefiend')) return;
  const missingDirge = state.targets.find((target) => {
    const dirge = ownAura(target, 'shadow_word_pain', state.sim.playerId);
    return !dirge || dirge.remaining <= 3;
  });
  if (missingDirge && tryCast(state, 'shadow_word_pain', missingDirge)) return;
  if (tryCast(state, 'mind_blast')) return;
  tryCast(state, 'mind_flay');
}

function runRotation(state: RunState): void {
  const player = state.sim.player;
  if (player.dead || player.castingAbility || player.gcdRemaining > 0.001) return;
  if (player.chargeTargetId !== null) return;
  if (state.spec === 'packlord') castPacklord(state);
  else if (state.spec === 'coldsight') castColdsight(state);
  else if (state.spec === 'fieldcraft') castFieldcraft(state);
  else if (state.spec === 'thundercall') castThundercall(state);
  else if (state.spec === 'warspirit') castWarspirit(state);
  else castVespers(state);
}

function prepare(state: RunState): void {
  if (state.spec === 'packlord' || state.spec === 'coldsight' || state.spec === 'fieldcraft') {
    tryCast(state, 'aspect_of_the_hawk');
  } else if (state.spec === 'thundercall') {
    tryCast(state, 'flametongue_weapon');
  } else if (state.spec === 'warspirit') {
    tryCast(state, 'galeheart_weapon');
  } else if (state.spec === 'vespers') {
    tryCast(state, 'shadowform');
  }
  state.sim.tick();
  state.sim.player.gcdRemaining = 0;
  state.sim.player.resource = state.sim.player.maxResource;
  state.sim.drainEvents();
  state.castsByAbility = {};
  state.cooldownUses = {};
  state.buttonsPressed = 0;
}

function ownedByPlayer(sim: Sim, sourceId: number, playerId: number): boolean {
  let source = sim.entities.get(sourceId);
  const visited = new Set<number>();
  while (source && !visited.has(source.id)) {
    if (source.id === playerId) return true;
    visited.add(source.id);
    source = source.ownerId === null ? undefined : sim.entities.get(source.ownerId);
  }
  return false;
}

function collectDamage(
  state: RunState,
  events: SimEvent[],
  byTarget: Record<string, number>,
  bySource: Record<string, number>,
): number {
  let total = 0;
  for (const event of events) {
    if (
      event.type !== 'damage' ||
      event.amount <= 0 ||
      !ownedByPlayer(state.sim, event.sourceId, state.sim.playerId)
    ) {
      continue;
    }
    const targetIndex = state.targets.findIndex((target) => target.id === event.targetId);
    if (targetIndex < 0) continue;
    total += event.amount;
    const targetKey = `target_${targetIndex + 1}`;
    byTarget[targetKey] = (byTarget[targetKey] ?? 0) + event.amount;
    const sourceKey = event.ability ?? 'Auto Attack';
    bySource[sourceKey] = (bySource[sourceKey] ?? 0) + event.amount;
  }
  return total;
}

export function runOwnedClassDpsProbe(
  spec: OwnedDpsSpec,
  scenario: OwnedClassBalanceScenario,
  seed = 29_900,
  head = 'working-tree',
): OwnedClassBalanceResult {
  const fixture = FIXTURES[spec];
  const sim = new Sim({ seed, playerClass: fixture.cls, autoEquip: false }) as ProbeSim;
  sim.setPlayerLevel(20);
  if (!sim.applyTalents({ spec: fixture.talentSpec, rows: {} } as never)) {
    throw new Error(`failed to apply ${fixture.talentSpec}`);
  }
  equipPbeLoadout(sim, spec);
  // Keep all three targets in one unobstructed cluster. The starter-world origin
  // has a static collider just left of the player, so a negative offset turns the
  // third target into a line-of-sight fixture instead of an area-damage fixture.
  const offsets = scenario.targets === 1 ? [0] : [0, 2, 4];
  const targets = offsets.map((offset) => addTarget(sim, offset, fixture.distance));
  if (fixture.hunterPet) addHunterPet(sim, targets[0]);
  sim.targetEntity(targets[0].id);
  sim.startAutoAttack();
  const state: RunState = {
    sim,
    spec,
    targets,
    primary: targets[0],
    castsByAbility: {},
    cooldownUses: {},
    buttonsPressed: 0,
  };
  prepare(state);

  const resourceStart = sim.player.resource;
  const damageByTarget = Object.fromEntries(targets.map((_, index) => [`target_${index + 1}`, 0]));
  const damageBySource: Record<string, number> = {};
  let totalDamage = 0;
  for (let tick = 0; tick < scenario.seconds * 20; tick++) {
    runRotation(state);
    totalDamage += collectDamage(state, sim.tick(), damageByTarget, damageBySource);
  }
  const meta = sim.players.get(sim.playerId);
  if (!meta) throw new Error('missing player metadata');
  return {
    head,
    seed,
    spec,
    playerClass: fixture.cls,
    scenario,
    totalDamage,
    dps: totalDamage / scenario.seconds,
    damageByTarget,
    damageBySource,
    castsByAbility: state.castsByAbility,
    cooldownUses: state.cooldownUses,
    buttonsPressed: state.buttonsPressed,
    resource: {
      type: sim.player.resourceType,
      start: resourceStart,
      end: sim.player.resource,
      max: sim.player.maxResource,
    },
    stats: {
      attackPower: sim.player.attackPower,
      rangedAttackPower: sim.player.rangedPower,
      spellPower: sim.player.spellPower,
    },
    equipment: { ...meta.equipment },
  };
}

export function runOwnedClassDpsMatrix(
  seed = 29_900,
  head = 'working-tree',
): OwnedClassBalanceResult[] {
  return OWNED_DPS_SPECS.flatMap((spec) =>
    OWNED_CLASS_BALANCE_SCENARIOS.map((scenario) =>
      runOwnedClassDpsProbe(spec, scenario, seed, head),
    ),
  );
}

function printResult(result: OwnedClassBalanceResult): void {
  const { scenario } = result;
  console.log(
    `${result.spec.padEnd(12)} ${scenario.targets} target ${String(scenario.seconds).padStart(2)} sec ` +
      `${result.dps.toFixed(2).padStart(7)} DPS  buttons ${String(result.buttonsPressed).padStart(2)} ` +
      `${result.resource.type ?? 'none'} ${Math.round(result.resource.end)}/${result.resource.max}`,
  );
  const sources = Object.entries(result.damageBySource)
    .sort((left, right) => right[1] - left[1])
    .map(([ability, damage]) => `${ability}: ${damage}`)
    .join(', ');
  console.log(`  ${sources}`);
}

if (process.argv[1]?.endsWith('owned_class_balance_probe.ts')) {
  const head = process.env.WOC_BALANCE_HEAD ?? 'working-tree';
  for (const result of runOwnedClassDpsMatrix(29_900, head)) printResult(result);
}
