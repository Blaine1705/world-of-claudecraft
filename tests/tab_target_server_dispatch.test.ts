import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { COMMAND_NAMES } from '../src/world_api';

const serverSource = readFileSync(join(__dirname, '../server/game.ts'), 'utf8').replace(
  /^\s*\/\/.*$/gm,
  '',
);

function dispatchArm(token: string): string {
  const start = serverSource.indexOf(`case '${token}':`);
  expect(start, `case '${token}' missing`).toBeGreaterThan(-1);
  const end = serverSource.indexOf('break;', start);
  expect(end, `case '${token}' break missing`).toBeGreaterThan(start);
  return serverSource.slice(start, end);
}

describe('tab target server dispatch', () => {
  it('keeps the shipped forward tab command wired to Sim.tabTarget', () => {
    expect(COMMAND_NAMES).toContain('tab');
    expect(dispatchArm('tab')).toContain('sim.tabTarget(pid);');
  });

  it('keeps the reverse tab command wired to Sim.tabTargetPrev', () => {
    expect(COMMAND_NAMES).toContain('tabPrev');
    expect(dispatchArm('tabPrev')).toContain('sim.tabTargetPrev(pid);');
  });
});
