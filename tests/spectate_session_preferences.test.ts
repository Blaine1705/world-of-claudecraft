import { afterEach, expect, it, vi } from 'vitest';
import { bareClient } from './helpers/bare_client';

afterEach(() => vi.unstubAllGlobals());

it('replays preferences changed while watching once the own snapshot releases the hold', () => {
  vi.stubGlobal('WebSocket', { OPEN: 1 });
  const sent: Array<Record<string, unknown>> = [];
  const world = bareClient(1, {
    ws: { readyState: 1, send: (payload: string) => sent.push(JSON.parse(payload)) },
  });
  const wire = world as unknown as {
    onMessage(raw: string): void;
    applySnapshot(snapshot: unknown): void;
  };
  const self = (id: number, tid: string) => ({
    id,
    k: 'player',
    tid,
    nm: tid,
    lv: 20,
    x: 0,
    y: 0,
    z: 0,
    f: 0,
    hp: 100,
    mhp: 100,
  });
  wire.applySnapshot({ t: 'snap', ents: [], self: self(1, 'warrior') });
  wire.onMessage(JSON.stringify({ t: 'spectate', name: 'Watched' }));
  wire.applySnapshot({ t: 'snap', ents: [], self: self(2, 'mage') });
  world.setStopAutoAttackOnTargetSwitch(true);
  expect(sent).toEqual([]);
  wire.onMessage(JSON.stringify({ t: 'spectate', name: null }));
  expect(sent).toEqual([]);
  wire.applySnapshot({ t: 'snap', ents: [], self: self(1, 'warrior') });
  expect(sent).toEqual([{ t: 'cmd', cmd: 'stopAutoAttackOnTargetSwitch', enabled: true }]);
  wire.applySnapshot({ t: 'snap', ents: [], self: self(1, 'warrior') });
  expect(sent).toHaveLength(1);
});
