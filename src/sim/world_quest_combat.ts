import {
  COMBAT_QUEST_SITES,
  type CombatQuestSite,
  COMBAT_QUEST_TUNING as T,
} from './content/world_quest_combat';
import { MOBS, NPCS } from './data';
import { createMob, createNpc } from './entity';
import type { PlayerMeta } from './sim';
import type { SimContext } from './sim_context';
import { dist2d, type Entity, INTERACT_RANGE, type WorldQuestCombatState } from './types';
import { activeWorldQuestsForCycle } from './world_quest_rotation';

type CombatRole = 'leader' | 'soldier' | 'captain' | 'wave' | 'sapper' | 'boss';
interface CombatMember {
  id: number;
  role: CombatRole;
  group: number;
  defeated: boolean;
}
export interface CombatQuestRun {
  ownerId: number;
  participants: Set<number>;
  members: CombatMember[];
  startedAt: number;
  nextWaveAt: number;
  wave: number;
  integrity: number;
  finished: boolean;
}

function eligible(
  ctx: SimContext,
  meta: PlayerMeta,
  player: Entity,
  site: CombatQuestSite,
): boolean {
  return (
    !player.dead &&
    !meta.leaving &&
    (!ctx.cfg.world || !!ctx.cfg.world.npcs[site.npcId]) &&
    player.level >= site.minLevel &&
    Math.hypot(player.pos.x - site.center.x, player.pos.z - site.center.z) <= site.radius &&
    meta.worldQuestLog.get(site.questId)?.state === 'active' &&
    activeWorldQuestsForCycle(meta.worldQuestCycle).some((q) => q.id === site.questId)
  );
}

function readout(meta: PlayerMeta, site: CombatQuestSite, state: WorldQuestCombatState): void {
  const progress = meta.worldQuestLog.get(site.questId);
  if (!progress) return;
  const previous = progress.combat;
  if (
    previous &&
    Object.keys(state).every(
      (key) =>
        previous[key as keyof WorldQuestCombatState] === state[key as keyof WorldQuestCombatState],
    )
  )
    return;
  progress.combat = state;
  meta.wireRev++;
}

function emptyReadout(phase: WorldQuestCombatState['phase']): WorldQuestCombatState {
  return { phase, stage: 0, kills: 0, required: 0, trail: 0, integrity: 100, secondsRemaining: 0 };
}

export function ensureCombatQuestPost(ctx: SimContext, site: CombatQuestSite): void {
  if ((ctx.cfg.world && !ctx.cfg.world.npcs[site.npcId]) || ctx.entities.has(site.npcEntityId))
    return;
  const base = NPCS[site.npcId];
  if (!base) return;
  const npc = createNpc(
    site.npcEntityId,
    { ...base, pos: site.start, questIds: [], vendorItems: undefined, dynamic: true },
    ctx.groundPos(site.start.x, site.start.z),
  );
  ctx.addEntity(npc);
}

export function clearCombatQuest(
  ctx: SimContext,
  meta: PlayerMeta,
  questId: string,
  failed = false,
): void {
  const run = meta.combatWorldQuestRuns.get(questId);
  if (run) {
    run.participants.delete(meta.entityId);
    meta.combatWorldQuestRuns.delete(questId);
    if (run.participants.size === 0) {
      for (const member of run.members) {
        const mob = ctx.entities.get(member.id);
        if (mob?.worldQuestCombatOwnerId === run.ownerId) ctx.dropEntity(mob.id);
      }
    } else if (run.ownerId === meta.entityId) {
      const nextOwnerId = Math.min(...run.participants);
      for (const member of run.members) {
        const mob = ctx.entities.get(member.id);
        if (!mob || mob.worldQuestCombatOwnerId !== run.ownerId) continue;
        mob.worldQuestCombatOwnerId = nextOwnerId;
        if (mob.tappedById === run.ownerId) mob.tappedById = nextOwnerId;
      }
      run.ownerId = nextOwnerId;
    }
  }
  const progress = meta.worldQuestLog.get(questId);
  if (progress?.state === 'active') {
    progress.count = 0;
    progress.combat = emptyReadout(failed ? 'failed' : 'ready');
    meta.wireRev++;
  }
}

export function clearCombatQuests(ctx: SimContext, meta: PlayerMeta): void {
  for (const questId of meta.combatWorldQuestRuns.keys()) clearCombatQuest(ctx, meta, questId);
}

function spawn(
  ctx: SimContext,
  site: CombatQuestSite,
  run: CombatQuestRun,
  templateId: string,
  role: CombatRole,
  dx: number,
  dz: number,
  group = 0,
  attack = false,
): Entity {
  const template = MOBS[templateId];
  const player = ctx.entities.get(run.ownerId)!;
  const mob = createMob(
    ctx.nextId++,
    template,
    Math.max(site.minLevel, Math.min(20, player.level)),
    ctx.groundPos(site.center.x + dx, site.center.z + dz),
  );
  mob.worldQuestCombatOwnerId = run.ownerId;
  mob.worldQuestCombatRole = role;
  if (role === 'sapper') mob.moveSpeed = T.sapperMoveSpeed;
  mob.tappedById = run.ownerId;
  mob.runScoped = true;
  mob.summonedAdd = true;
  mob.hardDespawnTimer = T.lifetime;
  // The paired captains share a wave; the finale retains its full elite health.
  if (role === 'wave' || role === 'soldier' || role === 'sapper') {
    mob.maxHp = Math.round(mob.maxHp * 0.7);
    mob.hp = mob.maxHp;
  }
  if (role === 'captain') {
    mob.maxHp = Math.round(mob.maxHp * T.captainHealthMultiplier);
    mob.hp = mob.maxHp;
    mob.weapon = {
      ...mob.weapon,
      min: Math.round(mob.weapon.min * T.captainDamageMultiplier),
      max: Math.round(mob.weapon.max * T.captainDamageMultiplier),
    };
  }
  mob.wanderTimer = T.lifetime;
  const point = ctx.resolveMovePoint(mob.pos.x, mob.pos.z, 0.6, mob);
  mob.pos = ctx.groundPos(point.x, point.z);
  mob.spawnPos = { ...mob.pos };
  mob.prevPos = { ...mob.pos };
  ctx.addEntity(mob);
  run.members.push({ id: mob.id, role, group, defeated: false });
  if (attack) ctx.aggroMob(mob, player, false);
  return mob;
}

function spawnBoss(ctx: SimContext, site: CombatQuestSite, run: CombatQuestRun): void {
  if (run.members.some((m) => m.role === 'boss')) return;
  const ids = {
    warband: 'warlord_drogmar',
    restless_company: 'fallen_captain_aldren',
    hold_highwatch: 'brakka_wallbreaker',
  };
  spawn(ctx, site, run, ids[site.encounterId], 'boss', 0, 8, 0, true);
}

function sharedRun(ctx: SimContext, questId: string): CombatQuestRun | null {
  for (const candidate of ctx.players.values()) {
    const run = candidate.combatWorldQuestRuns.get(questId);
    if (run && !run.finished && run.participants.size > 0) return run;
  }
  return null;
}

function startRun(ctx: SimContext, meta: PlayerMeta, site: CombatQuestSite): void {
  clearCombatQuest(ctx, meta, site.questId);
  const active = sharedRun(ctx, site.questId);
  if (active) {
    active.participants.add(meta.entityId);
    meta.combatWorldQuestRuns.set(site.questId, active);
    updateReadout(ctx, meta, site, active);
    return;
  }
  const run: CombatQuestRun = {
    ownerId: meta.entityId,
    participants: new Set([meta.entityId]),
    members: [],
    startedAt: ctx.time,
    nextWaveAt: ctx.time + 3,
    wave: 0,
    integrity: 100,
    finished: false,
  };
  meta.combatWorldQuestRuns.set(site.questId, run);
  if (site.encounterId === 'warband') {
    spawn(ctx, site, run, 'warlord_drogmar', 'leader', -18, 1, 0);
    spawn(ctx, site, run, 'brutok_skullsmasher', 'leader', 17, 3, 1);
    spawn(ctx, site, run, 'ogre_crusher', 'leader', 0, 21, 2);
    spawn(ctx, site, run, 'thornpeak_ogre', 'soldier', -14, 3, 0);
  }
  updateReadout(ctx, meta, site, run);
}

/** Existing interact command starts a run only at its real, registered expedition NPC. */
export function talkToCombatQuest(
  ctx: SimContext,
  npc: Entity,
  meta: PlayerMeta,
  player: Entity,
): boolean {
  const site = COMBAT_QUEST_SITES.find(
    (s) => s.npcEntityId === npc.id && s.npcId === npc.templateId,
  );
  if (!site) return false;
  if (
    npc.kind !== 'npc' ||
    npc.dead ||
    !eligible(ctx, meta, player, site) ||
    dist2d(player.pos, npc.pos) > INTERACT_RANGE + 1 ||
    Math.abs(player.pos.y - npc.pos.y) > INTERACT_RANGE ||
    Math.hypot(npc.pos.x - site.start.x, npc.pos.z - site.start.z) > 0.1 ||
    meta.combatWorldQuestRuns.has(site.questId)
  )
    return true;
  startRun(ctx, meta, site);
  return true;
}

function liveMembers(ctx: SimContext, run: CombatQuestRun, role?: CombatRole): CombatMember[] {
  return run.members.filter(
    (m) => !m.defeated && (!role || m.role === role) && !ctx.entities.get(m.id)?.dead,
  );
}

function updateReadout(
  ctx: SimContext,
  meta: PlayerMeta,
  site: CombatQuestSite,
  run: CombatQuestRun,
): void {
  const boss = run.members.some((m) => m.role === 'boss');
  const leaders = run.members.filter((m) => m.role === 'leader');
  const waves = site.encounterId === 'restless_company' || site.encounterId === 'hold_highwatch';
  readout(meta, site, {
    phase: boss ? 'boss' : waves ? 'waves' : 'leaders',
    stage: run.wave,
    kills: leaders.length
      ? leaders.filter((m) => m.defeated).length
      : run.members.filter((m) => m.defeated && m.role !== 'boss').length,
    required: leaders.length || 3,
    trail: 0,
    integrity: run.integrity,
    secondsRemaining: Math.max(0, Math.ceil(T.lifetime - (ctx.time - run.startedAt))),
  });
}

function spawnWave(ctx: SimContext, site: CombatQuestSite, run: CombatQuestRun): void {
  run.wave++;
  const undead = site.encounterId === 'restless_company';
  const direction = run.wave % 2 === 1 ? -1 : 1;
  for (let i = 0; i < run.wave + 1; i++)
    spawn(
      ctx,
      site,
      run,
      undead ? 'boneclad_revenant' : 'thornpeak_ogre',
      'wave',
      direction * (15 + i * 3),
      7 + i * 2,
      run.wave,
      true,
    );
  if (undead && run.wave === 2) {
    // Both captains are present at once: killing the priest first stops healing,
    // while killing the warrior first removes his melee pressure.
    spawn(ctx, site, run, 'corrupted_priest_malric', 'captain', -16, 15, 0, true);
    spawn(ctx, site, run, 'fallen_captain_aldren', 'captain', 16, 15, 1, true);
  }
  run.nextWaveAt = Number.POSITIVE_INFINITY;
}

/** Called on every participant tick, even outside the mission area, for reliable teardown. */
export function updateCombatQuests(ctx: SimContext, meta: PlayerMeta, player: Entity): string[] {
  const completed: string[] = [];
  for (const site of COMBAT_QUEST_SITES) {
    const run = meta.combatWorldQuestRuns.get(site.questId);
    if (!eligible(ctx, meta, player, site)) {
      if (run) clearCombatQuest(ctx, meta, site.questId, true);
      continue;
    }
    ensureCombatQuestPost(ctx, site);
    if (!run) {
      const progress = meta.worldQuestLog.get(site.questId)!;
      if (!progress.combat) readout(meta, site, emptyReadout('ready'));
      continue;
    }
    if (run.finished) {
      clearCombatQuest(ctx, meta, site.questId);
      completed.push(site.questId);
      continue;
    }
    const missing = run.members.some(
      (m) =>
        !m.defeated && (!ctx.entities.has(m.id) || ctx.entities.get(m.id)?.aiState === 'evade'),
    );
    if (missing || ctx.time - run.startedAt >= T.lifetime || run.integrity <= 0) {
      clearCombatQuest(ctx, meta, site.questId, true);
      continue;
    }
    if (site.encounterId === 'warband') {
      if (run.members.filter((m) => m.role === 'leader' && m.defeated).length === 3)
        spawnBoss(ctx, site, run);
    } else if (!run.members.some((m) => m.role === 'boss')) {
      if (liveMembers(ctx, run).length === 0) {
        const awaitingSappers =
          site.encounterId === 'hold_highwatch' &&
          run.wave > 0 &&
          !run.members.some((m) => m.role === 'sapper' && m.group === run.wave);
        if (awaitingSappers) {
          // Let the assault's stuns expire before players must intercept runners.
          if (!Number.isFinite(run.nextWaveAt)) run.nextWaveAt = ctx.time + T.wavePause;
          if (ctx.time >= run.nextWaveAt) {
            for (let i = 0; i < 2; i++)
              spawn(
                ctx,
                site,
                run,
                'ironvein_sapper',
                'sapper',
                i ? 10 : -10,
                12 + i * 4,
                run.wave,
              );
            run.nextWaveAt = Number.POSITIVE_INFINITY;
          }
        } else if (run.wave === 3) spawnBoss(ctx, site, run);
        else {
          if (!Number.isFinite(run.nextWaveAt)) run.nextWaveAt = ctx.time + T.wavePause;
          if (ctx.time >= run.nextWaveAt) spawnWave(ctx, site, run);
        }
      }
    }
    updateReadout(ctx, meta, site, run);
  }
  return completed;
}

/** Exact run membership prevents ambient mobs from advancing an expedition. */
export function onCombatQuestKill(ctx: SimContext, mob: Entity, _meta: PlayerMeta): void {
  if (!mob.dead || mob.worldQuestCombatOwnerId === undefined) return;
  for (const site of COMBAT_QUEST_SITES) {
    const owner = ctx.players.get(mob.worldQuestCombatOwnerId);
    const run = owner?.combatWorldQuestRuns.get(site.questId);
    if (
      !run ||
      mob.worldQuestCombatOwnerId !== run.ownerId ||
      Math.hypot(mob.pos.x - site.center.x, mob.pos.z - site.center.z) > site.radius
    )
      continue;
    const member = run.members.find((m) => m.id === mob.id && !m.defeated);
    if (!member) continue;
    const hasEligibleParticipant = [...run.participants].some((participantId) => {
      const participant = ctx.players.get(participantId);
      const player = ctx.entities.get(participantId);
      return !!participant && !!player && eligible(ctx, participant, player, site);
    });
    if (!hasEligibleParticipant) continue;
    member.defeated = true;
    if (member.role === 'boss') run.finished = true;
    mob.corpseTimer = 0;
    for (const participantId of run.participants) {
      const participant = ctx.players.get(participantId);
      if (participant) updateReadout(ctx, participant, site, run);
    }
    return;
  }
}

/** Sappers use ordinary movement/collision and crowd control, but pursue the gate. */
export function updateCombatQuestSapper(ctx: SimContext, mob: Entity): boolean {
  if (mob.worldQuestCombatOwnerId === undefined) return false;
  const meta = ctx.players.get(mob.worldQuestCombatOwnerId);
  if (!meta) {
    ctx.dropEntity(mob.id);
    return true;
  }
  const site = COMBAT_QUEST_SITES.find((s) => s.encounterId === 'hold_highwatch')!;
  const run = meta.combatWorldQuestRuns.get(site.questId);
  const member = run?.members.find((m) => m.id === mob.id && m.role === 'sapper' && !m.defeated);
  if (!run || !member) return false;
  if (ctx.isRooted(mob)) return true;
  const gate = ctx.groundPos(site.start.x, site.start.z);
  const slow = mob.auras.reduce(
    (mult, a) => (a.kind === 'slow' ? Math.min(mult, a.value) : mult),
    1,
  );
  ctx.moveToward(mob, gate, mob.moveSpeed * Math.max(0, slow));
  if (dist2d(mob.pos, gate) <= T.gateRadius) {
    run.integrity = Math.max(0, run.integrity - T.sapperGateDamage);
    member.defeated = true;
    ctx.dropEntity(mob.id);
    meta.wireRev++;
  }
  return true;
}
