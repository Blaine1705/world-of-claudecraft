import {
  HORDE_COUNTDOWN_TICKS,
  HORDE_DEPTH,
  HORDE_DURATION_TICKS,
  HORDE_HALF_WIDTH,
  HORDE_MAX_SHOTS,
  HORDE_MAX_UNITS,
  type HordeResult,
  type HordeShot,
  type HordeState,
  type HordeUnit,
  type HordeUpgrade,
  hordeResult,
} from './minigames/horde_barricade';

function bounded(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}
function integer(value: unknown, min: number, max: number): value is number {
  return bounded(value, min, max) && Number.isSafeInteger(value);
}
function isUpgrade(value: unknown): value is HordeUpgrade {
  return (
    typeof value === 'string' &&
    ['projectile', 'haste', 'pierce', 'explosive', 'double'].includes(value)
  );
}

/** The only persistent payload is one small, copied best result. */
export function sanitizeHordeResult(value: unknown, won = true): HordeResult | undefined {
  if (!value || typeof value !== 'object') return;
  const row = value as Partial<HordeResult>;
  if (
    !['bronze', 'silver', 'gold'].includes(row.rating ?? '') ||
    !integer(row.kills, 0, 10000) ||
    !integer(row.barrier, 0, 100) ||
    !integer(row.score, 0, 100500) ||
    row.score !== row.kills * 10 + row.barrier * 5
  )
    return;
  return hordeResult(row.kills, row.barrier, won);
}

function isUnit(value: unknown): value is HordeUnit {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<HordeUnit>;
  return (
    integer(row.id, 1, 100000) &&
    ['zombie', 'runner', 'brute', 'boss', 'crate'].includes(row.kind ?? '') &&
    (row.kind === 'crate'
      ? isUpgrade(row.reward) && integer(row.choiceId, 1, HORDE_DURATION_TICKS)
      : row.reward === undefined && row.choiceId === undefined) &&
    bounded(row.x, -HORDE_HALF_WIDTH, HORDE_HALF_WIDTH) &&
    bounded(row.z, 0, HORDE_DEPTH) &&
    integer(row.maxHp, 1, 10000) &&
    integer(row.hp, 1, row.maxHp)
  );
}
function isShot(value: unknown): value is HordeShot {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<HordeShot>;
  return (
    integer(row.id, 1, 100000) &&
    bounded(row.x, -HORDE_HALF_WIDTH - 3, HORDE_HALF_WIDTH + 3) &&
    bounded(row.z, 0, HORDE_DEPTH) &&
    integer(row.age, 0, 100) &&
    integer(row.damage, 1, 10000) &&
    integer(row.pierce, 1, 100)
  );
}

/** Owner snapshot only. Saves never restore a running arcade session. */
export function decodeHordeState(value: unknown, questId: string): HordeState | undefined {
  if (questId !== 'wq_wraithwood_barricade' || !value || typeof value !== 'object') return;
  const row = value as Partial<HordeState>;
  if (
    !['countdown', 'active', 'won', 'failed'].includes(row.phase ?? '') ||
    !integer(row.tick, 0, HORDE_COUNTDOWN_TICKS + HORDE_DURATION_TICKS) ||
    !bounded(row.playerX, -HORDE_HALF_WIDTH, HORDE_HALF_WIDTH) ||
    !integer(row.barrier, 0, 100) ||
    !integer(row.kills, 0, 10000) ||
    !integer(row.upgrade, 0, 3) ||
    !integer(row.projectiles, 1, 8) ||
    !integer(row.haste, 0, 3) ||
    (row.lastUpgrade !== undefined &&
      (!row.lastUpgrade ||
        typeof row.lastUpgrade !== 'object' ||
        !isUpgrade(row.lastUpgrade.kind) ||
        !integer(row.lastUpgrade.tick, 0, row.tick))) ||
    !integer(row.seed, 0, 0xffffffff) ||
    !integer(row.nextId, 1, 100001) ||
    typeof row.bossSpawned !== 'boolean' ||
    typeof row.bossKilled !== 'boolean' ||
    !Array.isArray(row.units) ||
    row.units.length > HORDE_MAX_UNITS ||
    !Array.from(row.units).every(isUnit) ||
    !Array.isArray(row.shots) ||
    row.shots.length > HORDE_MAX_SHOTS ||
    !Array.from(row.shots).every(isShot)
  )
    return;
  const ids = [...row.units, ...row.shots].map((entry) => entry.id);
  if (new Set(ids).size !== ids.length || ids.some((id) => id >= row.nextId!)) return;
  const ended = row.phase === 'won' || row.phase === 'failed';
  const result = sanitizeHordeResult(row.result, row.phase === 'won');
  if (ended && (!result || result.kills !== row.kills || result.barrier !== row.barrier)) return;
  return {
    phase: row.phase as HordeState['phase'],
    tick: row.tick,
    playerX: row.playerX,
    barrier: row.barrier,
    kills: row.kills,
    upgrade: row.upgrade as HordeState['upgrade'],
    projectiles: row.projectiles,
    haste: row.haste,
    ...(row.lastUpgrade
      ? { lastUpgrade: { kind: row.lastUpgrade.kind, tick: row.lastUpgrade.tick } }
      : {}),
    seed: row.seed,
    nextId: row.nextId,
    bossSpawned: row.bossSpawned,
    bossKilled: row.bossKilled,
    units: row.units.map(({ id, kind, x, z, hp, maxHp, reward, choiceId }) => ({
      id,
      kind,
      x,
      z,
      hp,
      maxHp,
      ...(kind === 'crate' ? { reward, choiceId } : {}),
    })),
    shots: row.shots.map(({ id, x, z, age, damage, pierce }) => ({
      id,
      x,
      z,
      age,
      damage,
      pierce,
    })),
    ...(ended ? { result } : {}),
  };
}
