// The diff-before-write paths the bot uses for every member-facing write (D5).
//
// These are the arms the incident turned on. Before Phase 3 the nickname PATCH
// was unconditional, so every linked online member was written every sweep
// forever, and each write made Discord emit a GUILD_MEMBER_UPDATE that the bot
// answered with a members-meta POST back into the game. So the load-bearing case
// below is the boring one: with nothing changed, these functions must perform
// ZERO writes of either kind.
//
// The failure arms assert the CACHE rather than a call count, because that is
// what decides whether the next sweep retries. A cache updated after a failed
// write is indistinguishable from a successful one by call count alone, and it
// would silently strand that member until some unrelated field happened to move.
import { describe, expect, it } from 'vitest';
import {
  MEMBERS_META_BATCH,
  type MemberMetaRecord,
  reconcileMemberRolesFromUpdate,
} from '../bot/logic';
import {
  decideMemberUpdate,
  displayNameOf,
  type NicknameCaches,
  nickOf,
  pushChangedMemberMeta,
  pushOneMemberMeta,
  writeMemberNickname,
} from '../bot/member_writes';

/** Ids as STRINGS: `1000000000000000000 + i` is past Number.MAX_SAFE_INTEGER, so a
 * loop built that way collapses onto a few values and a population never grows. */
function memberId(index: number): string {
  return `1122334455${String(index).padStart(9, '0')}`;
}

function record(id: string, over: Partial<MemberMetaRecord> = {}): MemberMetaRecord {
  return {
    discord_user_id: id,
    name: 'Aldric',
    joinedAtMs: 1_700_000_000_000,
    role: null,
    ...over,
  };
}

function caches(
  seed: { nick?: string | null; name?: string; written?: string } = {},
): NicknameCaches {
  const c: NicknameCaches = {
    memberNicks: new Map<string, string | null>(),
    memberNames: new Map<string, string>(),
    lastWrittenNick: new Map<string, string>(),
  };
  if (seed.nick !== undefined) c.memberNicks.set(USER, seed.nick);
  if (seed.name !== undefined) c.memberNames.set(USER, seed.name);
  if (seed.written !== undefined) c.lastWrittenNick.set(USER, seed.written);
  return c;
}

const USER = memberId(1);

describe('nickname diff before PATCH', () => {
  it('writes NOTHING when the computed nick already matches the observed one', async () => {
    // The steady state, and the whole point of the phase: an unchanged member
    // costs no Discord PATCH, which means no echo event and no game-server POST.
    const c = caches({ nick: 'Aldric 20', name: 'Aldric 20', written: 'Aldric 20' });
    const calls: string[] = [];
    const result = await writeMemberNickname(USER, 'Aldric 20', c, {
      setNickname: async (_id, nick) => {
        calls.push(nick);
        return {};
      },
    });
    expect(result).toBe('skipped');
    expect(calls).toEqual([]);
  });

  it('writes when the nick differs, and moves all three caches together', async () => {
    const c = caches({ nick: 'Aldric 20', name: 'Aldric 20', written: 'Aldric 20' });
    const calls: { id: string; nick: string }[] = [];
    const result = await writeMemberNickname(USER, 'Aldric 21', c, {
      setNickname: async (id, nick) => {
        calls.push({ id, nick });
        return {};
      },
    });
    expect(result).toBe('written');
    expect(calls).toEqual([{ id: USER, nick: 'Aldric 21' }]);
    // All three, each asserted on its own: the raw nick is what the NEXT sweep
    // diffs against, the display name is what a members-meta record carries, and
    // lastWrittenNick is the only thing that can recognize the echo.
    expect(c.memberNicks.get(USER)).toBe('Aldric 21');
    expect(c.memberNames.get(USER)).toBe('Aldric 21');
    expect(c.lastWrittenNick.get(USER)).toBe('Aldric 21');
  });

  it('writes for a member whose nick has never been observed, and for one with none', async () => {
    // undefined means we cannot PROVE the write is redundant; null means they have
    // no nickname at all, which any computed nick differs from.
    for (const seed of [{}, { nick: null }] as const) {
      const c = caches(seed);
      let sent = 0;
      const result = await writeMemberNickname(USER, 'Aldric 20', c, {
        setNickname: async () => {
          sent += 1;
          return {};
        },
      });
      expect(result).toBe('written');
      expect(sent).toBe(1);
    }
  });

  it('leaves EVERY cache untouched when the PATCH fails, so the next sweep retries', async () => {
    // The arm a call-count assertion cannot make. If any of these moved, the next
    // sweep would believe the write had landed and never try again.
    const c = caches({ nick: 'Aldric 20', name: 'Aldric 20', written: 'Aldric 20' });
    const errors: unknown[] = [];
    let attempts = 0;
    const io = {
      setNickname: async (): Promise<unknown> => {
        attempts += 1;
        throw new Error('403 missing permissions');
      },
      onError: (e: unknown) => errors.push(e),
    };

    expect(await writeMemberNickname(USER, 'Aldric 21', c, io)).toBe('failed');
    expect(c.memberNicks.get(USER)).toBe('Aldric 20');
    expect(c.memberNames.get(USER)).toBe('Aldric 20');
    expect(c.lastWrittenNick.get(USER)).toBe('Aldric 20');
    expect(errors).toHaveLength(1);

    // The retry itself, which is what the untouched cache buys: a second sweep
    // still sees a difference and sends the PATCH again.
    expect(await writeMemberNickname(USER, 'Aldric 21', c, io)).toBe('failed');
    expect(attempts).toBe(2);
  });

  it('compares verbatim, with no trimming or normalization', async () => {
    // Trimming would make a name with a trailing space re-PATCH forever, which is
    // exactly the unconditional-write load this guard replaces.
    const c = caches({ nick: 'Aldric 20' });
    let sent = 0;
    await writeMemberNickname(USER, 'Aldric 20 ', c, {
      setNickname: async () => {
        sent += 1;
        return {};
      },
    });
    expect(sent).toBe(1);
  });
});

describe('members-meta diff before push', () => {
  it('pushes NOTHING when no member changed', async () => {
    const last = new Map<string, MemberMetaRecord>();
    const records = [record(memberId(1)), record(memberId(2))];
    for (const r of records) last.set(r.discord_user_id, r);
    const pushes: MemberMetaRecord[][] = [];
    const pushed = await pushChangedMemberMeta(records, last, {
      pushMembersMeta: async (batch) => {
        pushes.push(batch);
        return { updated: batch.length };
      },
    });
    expect(pushes).toEqual([]);
    expect(pushed).toEqual([]);
  });

  it('pushes only the members that changed, in input order', async () => {
    const last = new Map<string, MemberMetaRecord>();
    const records = [record(memberId(1)), record(memberId(2)), record(memberId(3))];
    for (const r of records) last.set(r.discord_user_id, r);
    const changed = [records[0], { ...records[1], role: 'admin' }, records[2]];
    const pushes: MemberMetaRecord[][] = [];
    const pushed = await pushChangedMemberMeta(changed, last, {
      pushMembersMeta: async (batch) => {
        pushes.push(batch);
        return { updated: batch.length };
      },
    });
    expect(pushes).toEqual([[{ ...records[1], role: 'admin' }]]);
    expect(pushed).toHaveLength(1);
    // And the cache now carries the NEW record, so a repeat sweep is silent.
    expect(last.get(memberId(2))?.role).toBe('admin');
    const again = await pushChangedMemberMeta(changed, last, {
      pushMembersMeta: async () => ({ updated: 1 }),
    });
    expect(again).toEqual([]);
  });

  it('never marks a batch clean when the server refuses it, and stops there', async () => {
    // `call` answers null rather than throwing, so the return value is the only
    // success signal. Marking on a null would strand the whole batch.
    const last = new Map<string, MemberMetaRecord>();
    const records = [record(memberId(1)), record(memberId(2))];
    const pushed = await pushChangedMemberMeta(records, last, {
      pushMembersMeta: async () => null,
    });
    expect(pushed).toEqual([]);
    expect(last.size).toBe(0);
    // Which means the very next sweep tries the same members again.
    const attempts: number[] = [];
    await pushChangedMemberMeta(records, last, {
      pushMembersMeta: async (batch) => {
        attempts.push(batch.length);
        return { updated: batch.length };
      },
    });
    expect(attempts).toEqual([2]);
  });

  it('keeps the byte-batching, and marks each batch as it succeeds', async () => {
    // Reaching the real batch size rather than asserting a bound it never meets.
    const total = MEMBERS_META_BATCH + 5;
    const records = Array.from({ length: total }, (_, i) => record(memberId(i)));
    const last = new Map<string, MemberMetaRecord>();
    const sizes: number[] = [];
    const pushed = await pushChangedMemberMeta(records, last, {
      pushMembersMeta: async (batch) => {
        sizes.push(batch.length);
        return { updated: batch.length };
      },
    });
    expect(sizes).toEqual([MEMBERS_META_BATCH, 5]);
    expect(pushed).toHaveLength(total);
    expect(last.size).toBe(total);
  });

  it('stops after a mid-run refusal, keeping the batches already accepted', async () => {
    const total = MEMBERS_META_BATCH + 5;
    const records = Array.from({ length: total }, (_, i) => record(memberId(i)));
    const last = new Map<string, MemberMetaRecord>();
    let calls = 0;
    const pushed = await pushChangedMemberMeta(records, last, {
      pushMembersMeta: async (batch) => {
        calls += 1;
        return calls === 1 ? { updated: batch.length } : null;
      },
    });
    expect(calls).toBe(2);
    expect(pushed).toHaveLength(MEMBERS_META_BATCH);
    // Exactly the accepted batch is remembered; the refused five are not.
    expect(last.size).toBe(MEMBERS_META_BATCH);
    expect(last.has(memberId(MEMBERS_META_BATCH))).toBe(false);
  });

  it('pushes one member only when their record moved', async () => {
    const last = new Map<string, MemberMetaRecord>();
    const first = record(USER);
    let sent = 0;
    const io = {
      pushMembersMeta: async (): Promise<unknown> => {
        sent += 1;
        return { updated: 1 };
      },
    };
    expect(await pushOneMemberMeta(first, last, io)).toBe(true);
    expect(sent).toBe(1);
    expect(await pushOneMemberMeta(record(USER), last, io)).toBe(false);
    expect(sent).toBe(1);
    expect(await pushOneMemberMeta(record(USER, { role: 'mod' }), last, io)).toBe(true);
    expect(sent).toBe(2);
  });

  it('does not remember a single push the server refused', async () => {
    const last = new Map<string, MemberMetaRecord>();
    expect(await pushOneMemberMeta(record(USER), last, { pushMembersMeta: async () => null })).toBe(
      false,
    );
    expect(last.size).toBe(0);
  });
});

describe('self-echo suppression on GUILD_MEMBER_UPDATE', () => {
  const parse = { roles: reconcileMemberRolesFromUpdate, displayName: displayNameOf };
  const user = { id: USER, username: 'aldric', global_name: 'Aldric' };

  it('does not push when the update is only the nick this bot just wrote', async () => {
    // The echo loop closed: our PATCH comes back as an event carrying exactly what
    // we wrote, and answering it with a members-meta POST is the bot generating
    // load against itself.
    const decision = decideMemberUpdate(
      { nick: 'Aldric 21', roles: ['r1', 'r2'], user },
      user,
      { roles: ['r1', 'r2'], lastWrittenNick: 'Aldric 21' },
      parse,
    );
    expect(decision.push).toBe(false);
    // The caches still move: the decision suppresses the PUSH, never the bookkeeping.
    expect(decision.nick).toBe('Aldric 21');
    expect(decision.displayName).toBe('Aldric 21');
    expect(decision.roles).toEqual(['r1', 'r2']);
  });

  it('ignores role ORDER, which Discord does not promise', () => {
    const decision = decideMemberUpdate(
      { nick: 'Aldric 21', roles: ['r2', 'r1'], user },
      user,
      { roles: ['r1', 'r2'], lastWrittenNick: 'Aldric 21' },
      parse,
    );
    expect(decision.push).toBe(false);
  });

  it('still pushes a genuine third-party update', () => {
    // Each arm on its own, because any one of them alone passing would let a real
    // change be swallowed as an echo.
    const cached = { roles: ['r1', 'r2'], lastWrittenNick: 'Aldric 21' };
    // A role granted, same nick.
    expect(
      decideMemberUpdate(
        { nick: 'Aldric 21', roles: ['r1', 'r2', 'r3'], user },
        user,
        cached,
        parse,
      ).push,
    ).toBe(true);
    // A role removed, same nick.
    expect(
      decideMemberUpdate({ nick: 'Aldric 21', roles: ['r1'], user }, user, cached, parse).push,
    ).toBe(true);
    // A moderator renamed them to something we did not write.
    expect(
      decideMemberUpdate({ nick: 'Banned User', roles: ['r1', 'r2'], user }, user, cached, parse)
        .push,
    ).toBe(true);
    // Their nickname was cleared entirely.
    expect(
      decideMemberUpdate({ nick: null, roles: ['r1', 'r2'], user }, user, cached, parse).push,
    ).toBe(true);
    // We never wrote a nick for them at all, so nothing can be our echo.
    expect(
      decideMemberUpdate(
        { nick: 'Aldric 21', roles: ['r1', 'r2'], user },
        user,
        { roles: ['r1', 'r2'], lastWrittenNick: undefined },
        parse,
      ).push,
    ).toBe(true);
  });

  it('reports a payload that carried no roles array as null, leaving the cache alone', () => {
    const decision = decideMemberUpdate(
      { nick: 'Aldric 21', user },
      user,
      { roles: ['r1'], lastWrittenNick: 'Aldric 21' },
      parse,
    );
    expect(decision.roles).toBeNull();
    // With no roles in the payload the cached set is what the echo check compares,
    // so this is still recognized as our own write.
    expect(decision.push).toBe(false);
  });
});

describe('member name resolution', () => {
  it('prefers the guild nick, then the global name, then the username', () => {
    expect(displayNameOf({ nick: 'Nick' }, { global_name: 'Global', username: 'user' })).toBe(
      'Nick',
    );
    expect(displayNameOf({}, { global_name: 'Global', username: 'user' })).toBe('Global');
    expect(displayNameOf({}, { username: 'user' })).toBe('user');
    expect(displayNameOf({}, {})).toBe('Member');
  });

  it('reads the raw nick as null when absent or not a string', () => {
    // The distinction memberNames cannot make, and the reason the nick is cached
    // separately: "no nickname" is not the same as "a nickname equal to the
    // global name", and only the raw field can tell them apart.
    expect(nickOf({ nick: 'Nick' })).toBe('Nick');
    expect(nickOf({})).toBeNull();
    expect(nickOf({ nick: null })).toBeNull();
    expect(nickOf({ nick: 42 })).toBeNull();
  });
});
