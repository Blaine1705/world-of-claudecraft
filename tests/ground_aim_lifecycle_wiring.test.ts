import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');

function section(from: string, to: string): string {
  const start = main.indexOf(from);
  const end = main.indexOf(to, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return main.slice(start, end);
}

describe('ground aim lifecycle wiring', () => {
  it('uses the canonical attackability and active PvP opponent helpers', () => {
    const options = section('hud.attachOptions({', 'hud.attachDiscordHook(');

    expect(options).toContain(
      'isAttackableEntity(world.entities.get(targetId), world.playerId, activePvpOpponentIds(world))',
    );
  });

  it('cancels after reconnect', () => {
    const reconnect = section('online.onReconnected = () => {', 'hud.attachReporting({');

    expect(reconnect).toContain('priorOnReconnected?.();');
    expect(reconnect).toContain('hud.cancelGroundAim();');
  });

  it('cancels after teleport-scale displacement', () => {
    const movement = section('function resolveMove(', 'lastResolveMovePos = {');

    expect(movement).toContain(
      'if (clickMoveBrokenByTeleport(lastResolveMovePos, playerPos)) hud.cancelGroundAim();',
    );
  });

  it('cancels on the player death transition', () => {
    const death = section(
      'if (shouldClearAutorunOnDeath(playerWasDead, playerDead)) {',
      'playerWasDead = playerDead;',
    );

    expect(death).toContain('hud.cancelGroundAim();');
  });

  it('preserves the smart seed when there is no desktop cursor sample', () => {
    const sync = section('function syncGroundAimReticle(): void {', 'const reticle =');

    expect(sync).toContain('if (cursor) {');
    expect(sync).not.toContain(': null');
  });
});
