import fs, { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  acquireFullSuiteLock,
  DEFAULT_MAX_WAIT_MS,
  DEFAULT_STALE_MS,
  isPidAlive,
} from '../scripts/lib/gate_lock.mjs';

const gate = readFileSync(new URL('../scripts/gate.mjs', import.meta.url), 'utf8');

// A real temp directory (not a mocked fs): the module's only impure surface beyond
// the injected clock/pid/sleep/isAlive is plain file IO, so exercising it against a
// throwaway dir is both faster to write and closer to the real gate than mocking fs.
let lockDir: string;

beforeEach(() => {
  lockDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-lock-test-'));
});

afterEach(() => {
  fs.rmSync(lockDir, { recursive: true, force: true });
});

const LOCK_FILE_NAME = 'test.lock';
const lockPath = () => path.join(lockDir, LOCK_FILE_NAME);
const noSleep = () => Promise.resolve();

describe('isPidAlive', () => {
  it('reports the current process as alive', () => {
    expect(isPidAlive(process.pid)).toBe(true);
  });

  it('reports a pid that cannot plausibly exist as not alive', () => {
    // PIDs are a bounded namespace; this value is outside it on every real OS.
    expect(isPidAlive(999_999_999)).toBe(false);
  });
});

describe('acquireFullSuiteLock: uncontended', () => {
  it('creates the lock file with this process pid and the injected clock, and release() removes it', async () => {
    const { release } = await acquireFullSuiteLock({
      lockDir,
      lockFileName: LOCK_FILE_NAME,
      pid: 4242,
      now: () => 1_000,
      sleep: noSleep,
    });

    const raw = fs.readFileSync(lockPath(), 'utf8');
    expect(JSON.parse(raw)).toEqual({ pid: 4242, startedAt: 1_000 });

    release();
    expect(fs.existsSync(lockPath())).toBe(false);
  });
});

describe('acquireFullSuiteLock: contended wait', () => {
  it('waits, prints a message naming the holder, and acquires once the holder releases', async () => {
    fs.writeFileSync(lockPath(), JSON.stringify({ pid: 7777, startedAt: 500 }));

    const logs: string[] = [];
    let sleepCalls = 0;
    const sleep = (_ms: number) => {
      sleepCalls++;
      // Simulate the holder releasing on the first poll so the loop terminates.
      fs.rmSync(lockPath(), { force: true });
      return Promise.resolve();
    };

    const { release } = await acquireFullSuiteLock({
      lockDir,
      lockFileName: LOCK_FILE_NAME,
      pid: 4242,
      now: () => 600,
      pollMs: 5,
      sleep,
      log: (msg: string) => logs.push(msg),
      isAlive: (pid) => pid === 7777, // the holder is alive, so this is a real wait, not a reclaim
    });

    expect(sleepCalls).toBe(1);
    expect(logs.some((l) => l.includes('7777'))).toBe(true);
    expect(JSON.parse(fs.readFileSync(lockPath(), 'utf8'))).toEqual({ pid: 4242, startedAt: 600 });

    release();
  });

  it('only logs again when the holder identity changes, not on every poll', async () => {
    fs.writeFileSync(lockPath(), JSON.stringify({ pid: 7777, startedAt: 500 }));
    const logs: string[] = [];
    let polls = 0;
    const sleep = (_ms: number) => {
      polls++;
      if (polls >= 3) fs.rmSync(lockPath(), { force: true });
      return Promise.resolve();
    };

    await acquireFullSuiteLock({
      lockDir,
      lockFileName: LOCK_FILE_NAME,
      pid: 4242,
      now: () => 600,
      pollMs: 5,
      sleep,
      log: (msg: string) => logs.push(msg),
      isAlive: (pid) => pid === 7777,
    });

    expect(polls).toBe(3);
    expect(logs.length).toBe(1);
  });
});

describe('acquireFullSuiteLock: stale reclaim', () => {
  it('reclaims immediately (no wait) when the holder pid is gone', async () => {
    fs.writeFileSync(lockPath(), JSON.stringify({ pid: 999_999_999, startedAt: 0 }));
    let sleepCalls = 0;

    const { release } = await acquireFullSuiteLock({
      lockDir,
      lockFileName: LOCK_FILE_NAME,
      pid: 4242,
      now: () => 1_000,
      sleep: () => {
        sleepCalls++;
        return Promise.resolve();
      },
      isAlive: () => false,
    });

    expect(sleepCalls).toBe(0);
    expect(JSON.parse(fs.readFileSync(lockPath(), 'utf8')).pid).toBe(4242);
    release();
  });

  it('reclaims a lock older than the stale ceiling even while its pid is alive', async () => {
    const startedAt = 0;
    const now = DEFAULT_STALE_MS + 1;
    fs.writeFileSync(lockPath(), JSON.stringify({ pid: 7777, startedAt }));
    let sleepCalls = 0;

    const { release } = await acquireFullSuiteLock({
      lockDir,
      lockFileName: LOCK_FILE_NAME,
      pid: 4242,
      now: () => now,
      sleep: () => {
        sleepCalls++;
        return Promise.resolve();
      },
      isAlive: () => true, // pid IS alive; only the age ceiling should trigger reclaim
    });

    expect(sleepCalls).toBe(0);
    release();
  });

  it('does not reclaim a live holder still under the stale ceiling', async () => {
    fs.writeFileSync(lockPath(), JSON.stringify({ pid: 7777, startedAt: 0 }));
    let sleepCalls = 0;
    const sleep = () => {
      sleepCalls++;
      fs.rmSync(lockPath(), { force: true }); // let the wait terminate
      return Promise.resolve();
    };

    await acquireFullSuiteLock({
      lockDir,
      lockFileName: LOCK_FILE_NAME,
      pid: 4242,
      now: () => DEFAULT_STALE_MS - 1,
      sleep,
      isAlive: () => true,
    });

    expect(sleepCalls).toBe(1);
  });

  it('reclaims a corrupt or unreadable lock file rather than waiting on it forever', async () => {
    fs.writeFileSync(lockPath(), 'not json');
    let sleepCalls = 0;

    const { release } = await acquireFullSuiteLock({
      lockDir,
      lockFileName: LOCK_FILE_NAME,
      pid: 4242,
      now: () => 1_000,
      sleep: () => {
        sleepCalls++;
        return Promise.resolve();
      },
      isAlive: () => true,
    });

    expect(sleepCalls).toBe(0);
    release();
  });
});

describe('acquireFullSuiteLock: opt-out', () => {
  it('never touches the filesystem and release() is a no-op', async () => {
    const { release } = await acquireFullSuiteLock({
      optOut: true,
      lockDir,
      lockFileName: LOCK_FILE_NAME,
      sleep: noSleep,
    });

    expect(fs.existsSync(lockPath())).toBe(false);
    expect(() => release()).not.toThrow();
    expect(fs.existsSync(lockPath())).toBe(false);
  });

  it('opting out does not disturb a lock another process is holding', async () => {
    fs.writeFileSync(lockPath(), JSON.stringify({ pid: 7777, startedAt: 0 }));

    const { release } = await acquireFullSuiteLock({
      optOut: true,
      lockDir,
      lockFileName: LOCK_FILE_NAME,
      sleep: noSleep,
    });
    release();

    expect(JSON.parse(fs.readFileSync(lockPath(), 'utf8')).pid).toBe(7777);
  });
});

describe('acquireFullSuiteLock: release safety', () => {
  it('never deletes a lock file that another process has since taken over', async () => {
    const { release } = await acquireFullSuiteLock({
      lockDir,
      lockFileName: LOCK_FILE_NAME,
      pid: 4242,
      now: () => 1_000,
      sleep: noSleep,
    });

    // Simulate a reclaim race: another process decided our lock looked stale (or a
    // stray manual cleanup) and wrote its own lock over ours before we released.
    fs.writeFileSync(lockPath(), JSON.stringify({ pid: 5555, startedAt: 2_000 }));

    release();

    expect(JSON.parse(fs.readFileSync(lockPath(), 'utf8')).pid).toBe(5555);
  });

  it('release() is safe to call when the lock file is already gone', async () => {
    const { release } = await acquireFullSuiteLock({
      lockDir,
      lockFileName: LOCK_FILE_NAME,
      pid: 4242,
      now: () => 1_000,
      sleep: noSleep,
    });

    fs.rmSync(lockPath(), { force: true });
    expect(() => release()).not.toThrow();
  });
});

describe('acquireFullSuiteLock: never blocks the gate from running tests', () => {
  it('gives up after repeated failures to remove a stale lock, instead of spinning forever', async () => {
    fs.writeFileSync(lockPath(), JSON.stringify({ pid: 999_999_999, startedAt: 0 }));
    const logs: string[] = [];
    let sleepCalls = 0;

    const { release } = await acquireFullSuiteLock({
      lockDir,
      lockFileName: LOCK_FILE_NAME,
      pid: 4242,
      now: () => 1_000,
      sleep: () => {
        sleepCalls++;
        return Promise.resolve();
      },
      isAlive: () => false, // the holder IS stale; only removing it fails
      unlink: () => {
        throw Object.assign(new Error('EPERM'), { code: 'EPERM' });
      },
      log: (msg: string) => logs.push(msg),
    });

    // Bounded (a handful of yields), not zero and not unbounded: it must yield between
    // retries rather than hot-spin, but it must also terminate.
    expect(sleepCalls).toBeGreaterThan(0);
    expect(sleepCalls).toBeLessThan(20);
    expect(logs.some((l) => l.includes('WARN') && l.includes('stale'))).toBe(true);
    // The unresolvable lock file is left in place; still, release() must be safe to call.
    expect(() => release()).not.toThrow();
  });

  it('degrades to unserialized rather than throwing when lock creation fails for a reason other than EEXIST', async () => {
    const logs: string[] = [];

    const { release } = await acquireFullSuiteLock({
      lockDir,
      lockFileName: LOCK_FILE_NAME,
      pid: 4242,
      now: () => 1_000,
      sleep: noSleep,
      writeFile: () => {
        throw Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' });
      },
      log: (msg: string) => logs.push(msg),
    });

    expect(logs.some((l) => l.includes('WARN') && l.includes('ENOENT'))).toBe(true);
    expect(() => release()).not.toThrow();
  });

  it('gives up waiting past maxWaitMs and proceeds unserialized, even for a live, non-stale holder', async () => {
    fs.writeFileSync(lockPath(), JSON.stringify({ pid: 7777, startedAt: 0 }));
    const logs: string[] = [];
    let elapsed = 0;
    const sleep = (ms: number) => {
      elapsed += ms;
      return Promise.resolve();
    };

    const { release } = await acquireFullSuiteLock({
      lockDir,
      lockFileName: LOCK_FILE_NAME,
      pid: 4242,
      now: () => elapsed,
      pollMs: 1000,
      maxWaitMs: 5000,
      sleep,
      isAlive: () => true,
      log: (msg: string) => logs.push(msg),
    });

    expect(logs.some((l) => l.includes('WARN') && l.includes('waited over'))).toBe(true);
    expect(() => release()).not.toThrow();
    // The live holder's lock is untouched: this run backed off, it did not reclaim.
    expect(JSON.parse(fs.readFileSync(lockPath(), 'utf8')).pid).toBe(7777);
  });

  it('never exceeds maxWaitMs by more than roughly one poll interval', async () => {
    fs.writeFileSync(lockPath(), JSON.stringify({ pid: 7777, startedAt: 0 }));
    let elapsed = 0;
    let polls = 0;
    const sleep = (ms: number) => {
      polls++;
      elapsed += ms;
      return Promise.resolve();
    };

    await acquireFullSuiteLock({
      lockDir,
      lockFileName: LOCK_FILE_NAME,
      pid: 4242,
      now: () => elapsed,
      pollMs: 1000,
      maxWaitMs: 5000,
      sleep,
      isAlive: () => true,
    });

    expect(elapsed).toBeLessThanOrEqual(6000);
    expect(polls).toBeLessThanOrEqual(6);
  });
});

describe('acquireFullSuiteLock: long-wait visibility', () => {
  it('re-announces the same holder periodically as the clock advances, not just once', async () => {
    fs.writeFileSync(lockPath(), JSON.stringify({ pid: 7777, startedAt: 0 }));
    const logs: string[] = [];
    let elapsed = 0;
    let polls = 0;
    const sleep = (ms: number) => {
      polls++;
      elapsed += ms;
      if (polls >= 4) fs.rmSync(lockPath(), { force: true }); // let the wait terminate
      return Promise.resolve();
    };

    await acquireFullSuiteLock({
      lockDir,
      lockFileName: LOCK_FILE_NAME,
      pid: 4242,
      now: () => elapsed,
      pollMs: 60_000, // 1 minute per poll
      reannounceMs: 90_000, // re-announce after 1.5 minutes of silence
      sleep,
      isAlive: () => true,
      log: (msg: string) => logs.push(msg),
    });

    // 4 polls at 60s = 4 minutes elapsed, crossing the 90s reannounce threshold more
    // than once: the same pid must be logged more than the single first-sight line.
    expect(logs.filter((l) => l.includes('7777')).length).toBeGreaterThan(1);
  });
});

describe('readHolder pid validation (via acquireFullSuiteLock reclaim behavior)', () => {
  it.each([0, -1, 1.5, Number.NaN])(
    'treats an unusable holder pid (%s) as corrupt and reclaims immediately',
    async (badPid) => {
      fs.writeFileSync(lockPath(), JSON.stringify({ pid: badPid, startedAt: 0 }));
      let sleepCalls = 0;

      const { release } = await acquireFullSuiteLock({
        lockDir,
        lockFileName: LOCK_FILE_NAME,
        pid: 4242,
        now: () => 1_000,
        sleep: () => {
          sleepCalls++;
          return Promise.resolve();
        },
        // If pid validation is missing, process.kill(0|-1, 0) would read as alive and this
        // would never be consulted for those two cases; a real isAlive would also never
        // be asked about a non-integer pid, so returning true here is a conservative
        // "would incorrectly wait" signal this test proves does NOT happen.
        isAlive: () => true,
      });

      expect(sleepCalls).toBe(0);
      expect(JSON.parse(fs.readFileSync(lockPath(), 'utf8')).pid).toBe(4242);
      release();
    },
  );
});

describe('gate.mjs wiring pin', () => {
  it('imports the lock and locks only the full-suite step, releasing in a finally', () => {
    expect(gate).toContain("import { acquireFullSuiteLock } from './lib/gate_lock.mjs'");
    expect(gate).toContain('FULL_SUITE_STEP_NAME');
    expect(gate).toContain('acquireFullSuiteLock');
    expect(gate).toMatch(/locked\s*=\s*name === FULL_SUITE_STEP_NAME/);
    expect(gate).toMatch(/finally\s*{\s*release\(\);?\s*}/);
  });

  it('reads GATE_NO_LOCK as the opt-out and announces it', () => {
    expect(gate).toContain("process.env.GATE_NO_LOCK === '1'");
    expect(gate).toContain('GATE_NO_LOCK=1');
  });
});

// DEFAULT_MAX_WAIT_MS is exercised above only through injected small values; this just
// pins that the shipped default is meaningfully bounded (well under DEFAULT_STALE_MS,
// so a stuck wait cannot silently ride the full 3-hour staleness ceiling) and generous
// (comfortably above the multi-worktree contention wall clock this issue measured).
describe('DEFAULT_MAX_WAIT_MS', () => {
  it('sits well under the staleness ceiling and well over a realistic contended wait', () => {
    expect(DEFAULT_MAX_WAIT_MS).toBeLessThan(DEFAULT_STALE_MS);
    expect(DEFAULT_MAX_WAIT_MS).toBeGreaterThan(30 * 60 * 1000); // > 30 minutes
  });
});
