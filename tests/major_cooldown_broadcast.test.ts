// End to end through the real broadcast: a GameServer's snapshot pass carries a
// player's tracked cooldowns (`mcd`) on the stable aura channel, and a bare
// ClientWorld fed those exact snapshots mirrors them into the peer entity's
// cooldown map. Pins the wiring the unit pair (tests/major_cooldown_wire.test.ts)
// cannot: the game.ts splice, the online.ts decode on the aura channel only, the
// held set across lite records, the self skip, and that the `mcd` value carries
// keys only (no remaining time or deadline).
import { describe, expect, it } from 'vitest';
import { GameServer } from '../server/game';
import { SPENT_COOLDOWN_UNKNOWN_REMAINING } from '../src/net/peer_major_cooldown_wire';
import { STABLE_TIMER_WIRE_VERSION } from '../src/world_api';
import { bareClient, broadcast, fakeWs, joinServer, lastSnap } from './helpers/bare_client';

const MEDALLION = 'trinket:medallion_of_defiance';
const STABLE = { timerWireVersion: STABLE_TIMER_WIRE_VERSION };

// biome-ignore lint/suspicious/noExplicitAny: snapshot frames are untyped wire JSON
type Snap = any;

function setup() {
  const server = new GameServer();
  const viewerWs = fakeWs();
  const subjectWs = fakeWs();
  const viewer = joinServer(server, viewerWs, 1, 'Watcher', 'warrior', STABLE);
  const subject = joinServer(server, subjectWs, 2, 'Gravelmaw', 'warrior', STABLE);
  const subjectEntity = server.sim.entities.get(subject.pid);
  if (!subjectEntity) throw new Error('subject missing');
  const step = (): Snap => {
    server.sim.tick();
    viewerWs.sent.length = 0;
    broadcast(server);
    return lastSnap(viewerWs.sent);
  };
  const recordOf = (snap: Snap) =>
    (snap?.ents ?? []).find((e: { id: number }) => e.id === subject.pid);
  return { server, viewer, subject, subjectEntity, step, recordOf };
}

describe('enemy cooldowns through the broadcast', () => {
  it('ships mcd on the aura channel, and lite records of a moving player never repeat it', () => {
    const { subjectEntity, step, recordOf } = setup();
    subjectEntity.cooldowns.set('recklessness', 150);
    const first = recordOf(step());
    expect(first.mcd).toEqual(['recklessness']);
    expect(first.auras).toBeDefined();

    // The subject moves every tick: its lite records go out, without the channel.
    let liteWithoutChannel = 0;
    for (let i = 0; i < 12; i++) {
      subjectEntity.pos.x += 0.5;
      const record = recordOf(step());
      if (record && record.mcd === undefined && record.auras === undefined) liteWithoutChannel++;
      if (record) expect(record.mcd).toBeUndefined();
    }
    expect(liteWithoutChannel).toBeGreaterThan(0);

    // A newly armed cooldown changes the channel, so it rides the next record.
    subjectEntity.cooldowns.set('die_by_sword', 100);
    let carried: Snap = null;
    for (let i = 0; i < 6 && !carried; i++) {
      const record = recordOf(step());
      if (record?.mcd) carried = record;
    }
    expect(carried.mcd).toEqual(['die_by_sword', 'recklessness']);
  });

  it('mirrors the spent keys into the peer with no time, keeps them across lite records, and leaves self alone', () => {
    const { viewer, subject, subjectEntity, server, step } = setup();
    const viewerEntity = server.sim.entities.get(viewer.pid);
    if (!viewerEntity) throw new Error('viewer missing');
    subjectEntity.cooldowns.set('recklessness', 150);
    viewerEntity.cooldowns.set('recklessness', 42);
    const client = bareClient(viewer.pid);
    // biome-ignore lint/suspicious/noExplicitAny: applySnapshot is the private decode entry
    const apply = (snap: Snap) => (client as any).applySnapshot(structuredClone(snap));

    apply(step());
    const peer = client.entities.get(subject.pid);
    expect(peer?.cooldowns.get('recklessness')).toBe(SPENT_COOLDOWN_UNKNOWN_REMAINING);

    for (let i = 0; i < 20; i++) {
      subjectEntity.pos.x += 0.5;
      apply(step());
    }
    // Still spent, still timeless: the lite records that omitted the channel
    // neither cleared it nor taught the client anything about when it returns.
    expect(client.entities.get(subject.pid)?.cooldowns.get('recklessness')).toBe(
      SPENT_COOLDOWN_UNKNOWN_REMAINING,
    );

    // Once it comes back on the server, the next channel record clears it.
    subjectEntity.cooldowns.delete('recklessness');
    for (let i = 0; i < 6; i++) apply(step());
    expect(client.entities.get(subject.pid)?.cooldowns.has('recklessness')).toBe(false);

    // The viewer's own map is the self channel's, never a peer key.
    const self = client.entities.get(viewer.pid)?.cooldowns.get('recklessness') ?? 0;
    expect(self).toBeLessThanOrEqual(42);
  });

  it('never shows the medallion off an equip lockout, and shows it once used', () => {
    const lockout = setup();
    lockout.subjectEntity.cooldowns.set(MEDALLION, 30); // TRINKET_EQUIP_LOCKOUT on equip
    lockout.subjectEntity.cooldowns.set('recklessness', 150);
    expect(lockout.recordOf(lockout.step()).mcd).toEqual(['recklessness']);

    const used = setup();
    used.subjectEntity.cooldowns.set(MEDALLION, 120);
    const record = used.recordOf(used.step());
    expect(record.mcd).toEqual([MEDALLION]);
  });
});
