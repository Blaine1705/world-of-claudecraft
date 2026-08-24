// The suspicion-flag emitters + the Flagged-view cache (server/suspicion_flags.ts).
// The SQL module is mocked, so this suite drives the detector host (the push
// seam), the fire-and-forget FIFO, the registration-burst emitter, and the
// cache's bust-on-write wiring without a pool.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotDetector, BotDetectorHost } from '../server/bot_detector/contract';
import { createBotDetector as createStubDetector } from '../server/bot_detector/stub';

const dbMock = vi.hoisted(() => ({
  upsertSuspicionFlag: vi.fn(async (_input: unknown) => {}),
  refreshSuspicionFlagDetails: vi.fn(async (_input: unknown) => true),
}));

vi.mock('../server/suspicion_flags_db', () => ({
  SUSPICION_FLAG_DETAILS_MAX: 2000,
  upsertSuspicionFlag: dbMock.upsertSuspicionFlag,
  refreshSuspicionFlagDetails: dbMock.refreshSuspicionFlagDetails,
}));

import {
  attachDetectorFlagHost,
  bustSuspicionFlagCache,
  configureSuspicionFlagDataset,
  createDetectorFlagHost,
  DETECTOR_FLAG_KIND,
  DETECTOR_FLAG_REFRESH_FLOOR_MS,
  flagRegistrationBurst,
  readSuspicionFlagDataset,
  resetSuspicionFlagDatasetForTests,
  suspicionFlagsIdle,
} from '../server/suspicion_flags';

// Opaque placeholder text: the host treats details as data and never reads it.
const DETAILS = 'summary line one\nsummary line two';

beforeEach(() => {
  dbMock.upsertSuspicionFlag.mockClear();
  dbMock.refreshSuspicionFlagDetails.mockClear();
  resetSuspicionFlagDatasetForTests();
});

afterEach(async () => {
  await suspicionFlagsIdle();
  resetSuspicionFlagDatasetForTests();
});

describe('the detector flag host', () => {
  it('pins the storage key the active-flag dedupe index is built on', () => {
    expect(DETECTOR_FLAG_KIND).toBe('session_automation');
  });

  it('records a decision under the public storage policy (source, kind, severity, cap)', async () => {
    const host = createDetectorFlagHost();
    const landed = host.recordSuspicionFlag({
      accountId: 42,
      details: `${DETAILS}${'x'.repeat(3000)}`,
    });
    await expect(landed).resolves.toBe(true);
    expect(dbMock.upsertSuspicionFlag).toHaveBeenCalledOnce();
    const input = dbMock.upsertSuspicionFlag.mock.calls[0][0] as { details: string };
    expect(input).toMatchObject({
      accountId: 42,
      source: 'bot_detector',
      kind: 'session_automation',
      severity: 'high',
    });
    expect(input.details.length).toBe(2000);
    expect(input.details.startsWith(DETAILS)).toBe(true);
    expect(dbMock.refreshSuspicionFlagDetails).not.toHaveBeenCalled();
  });

  it('refreshes details through the no-occurrence path, on the same key', async () => {
    const host = createDetectorFlagHost();
    await expect(
      host.refreshSuspicionFlagDetails({ accountId: 42, details: DETAILS }),
    ).resolves.toBe(true);
    expect(dbMock.upsertSuspicionFlag).not.toHaveBeenCalled();
    expect(dbMock.refreshSuspicionFlagDetails).toHaveBeenCalledWith({
      accountId: 42,
      source: 'bot_detector',
      kind: DETECTOR_FLAG_KIND,
      details: DETAILS,
    });
  });

  it('drops an observation without a sane account id', async () => {
    const host = createDetectorFlagHost();
    await expect(host.recordSuspicionFlag({ accountId: 0, details: DETAILS })).resolves.toBe(false);
    await expect(
      host.recordSuspicionFlag({ accountId: Number.NaN, details: DETAILS }),
    ).resolves.toBe(false);
    await expect(
      host.refreshSuspicionFlagDetails({ accountId: -3, details: DETAILS }),
    ).resolves.toBe(false);
    expect(dbMock.upsertSuspicionFlag).not.toHaveBeenCalled();
    expect(dbMock.refreshSuspicionFlagDetails).not.toHaveBeenCalled();
  });

  it('paces refreshes per account: one write per floor window, latest summary on the next', async () => {
    let now = 1_700_000_000_000;
    const host = createDetectorFlagHost(() => now);
    await expect(host.refreshSuspicionFlagDetails({ accountId: 42, details: 'v1' })).resolves.toBe(
      true,
    );
    now += DETECTOR_FLAG_REFRESH_FLOOR_MS - 1;
    // Inside the floor: accepted (nothing to retry) but not written.
    await expect(host.refreshSuspicionFlagDetails({ accountId: 42, details: 'v2' })).resolves.toBe(
      true,
    );
    // Another account is paced on its own.
    await host.refreshSuspicionFlagDetails({ accountId: 43, details: 'other' });
    await suspicionFlagsIdle();
    expect(dbMock.refreshSuspicionFlagDetails).toHaveBeenCalledTimes(2);
    expect(
      dbMock.refreshSuspicionFlagDetails.mock.calls.map(
        (c) => (c[0] as { details: string }).details,
      ),
    ).toEqual(['v1', 'other']);

    now += 1;
    await host.refreshSuspicionFlagDetails({ accountId: 42, details: 'v3' });
    await suspicionFlagsIdle();
    expect(dbMock.refreshSuspicionFlagDetails).toHaveBeenCalledTimes(3);
    expect(dbMock.refreshSuspicionFlagDetails.mock.calls[2][0]).toMatchObject({ details: 'v3' });
    // A record is never paced: it is a decision, not a rewrite.
    await host.recordSuspicionFlag({ accountId: 42, details: 'decision' });
    await host.recordSuspicionFlag({ accountId: 42, details: 'decision again' });
    await suspicionFlagsIdle();
    expect(dbMock.upsertSuspicionFlag).toHaveBeenCalledTimes(2);
  });

  it('coalesces refreshes queued behind a slow write: latest details win, one UPDATE', async () => {
    let release: () => void = () => {};
    const slow = new Promise<void>((resolve) => {
      release = resolve;
    });
    dbMock.upsertSuspicionFlag.mockImplementationOnce(async () => {
      await slow;
    });
    const host = createDetectorFlagHost(() => 1_700_000_000_000);
    const decision = host.recordSuspicionFlag({ accountId: 42, details: 'decision' });
    const first = host.refreshSuspicionFlagDetails({ accountId: 42, details: 'v1' });
    const second = host.refreshSuspicionFlagDetails({ accountId: 42, details: 'v2' });
    expect(second).toBe(first);
    release();
    await expect(decision).resolves.toBe(true);
    await expect(first).resolves.toBe(true);
    await suspicionFlagsIdle();
    expect(dbMock.refreshSuspicionFlagDetails).toHaveBeenCalledOnce();
    expect(dbMock.refreshSuspicionFlagDetails.mock.calls[0][0]).toMatchObject({ details: 'v2' });
  });

  it('serializes writes in call order and never throws into the caller (fire-and-forget)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const order: string[] = [];
    dbMock.upsertSuspicionFlag.mockImplementationOnce(async () => {
      order.push('record');
      throw new Error('db down');
    });
    dbMock.refreshSuspicionFlagDetails.mockImplementationOnce(async () => {
      order.push('refresh');
      return true;
    });
    const host = createDetectorFlagHost();
    let landed: Promise<boolean> = Promise.resolve(true);
    let refreshed: Promise<boolean> = Promise.resolve(true);
    expect(() => {
      landed = host.recordSuspicionFlag({ accountId: 42, details: DETAILS });
      refreshed = host.refreshSuspicionFlagDetails({ accountId: 42, details: DETAILS });
    }).not.toThrow();
    // The lost write resolves false (the detector retries); the next one still runs.
    await expect(landed).resolves.toBe(false);
    await expect(refreshed).resolves.toBe(true);
    expect(order).toEqual(['record', 'refresh']);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});

describe('attachDetectorFlagHost', () => {
  it('hands the host to a detector that accepts one and says so', () => {
    const attached: BotDetectorHost[] = [];
    const detector: BotDetector = {
      ...createStubDetector(),
      attachHost: (host) => {
        attached.push(host);
      },
    };
    const lines: string[] = [];
    expect(attachDetectorFlagHost(detector, (line) => lines.push(line))).toBe(true);
    expect(lines).toEqual(['[bot-detector] suspicion-flag host: attached']);
    expect(attached).toHaveLength(1);
    expect(typeof attached[0].recordSuspicionFlag).toBe('function');
    expect(typeof attached[0].refreshSuspicionFlagDetails).toBe('function');
  });

  it('skips a detector build without the seam, so an older bundle still boots', () => {
    const lines: string[] = [];
    expect(attachDetectorFlagHost(createStubDetector(), (line) => lines.push(line))).toBe(false);
    expect(lines[0]).toMatch(/not accepted/);
  });
});

describe('flagRegistrationBurst', () => {
  it('mints a burst flag carrying the cohort as related accounts', async () => {
    flagRegistrationBurst({
      accountId: 42,
      signals: ['8 accounts from IP 203.0.113.9 in 10 minutes'],
      cohortAccountIds: [41, 40],
    });
    await suspicionFlagsIdle();
    expect(dbMock.upsertSuspicionFlag).toHaveBeenCalledWith({
      accountId: 42,
      source: 'registration_burst',
      kind: 'registration_burst',
      severity: 'medium',
      details: 'Automated registration pattern: 8 accounts from IP 203.0.113.9 in 10 minutes',
      relatedAccountIds: [41, 40],
    });
  });

  it('escalates a multi-signal burst to high and ignores an empty signal set', async () => {
    flagRegistrationBurst({ accountId: 1, signals: ['a', 'b'], cohortAccountIds: [] });
    flagRegistrationBurst({ accountId: 2, signals: [], cohortAccountIds: [] });
    await suspicionFlagsIdle();
    expect(dbMock.upsertSuspicionFlag).toHaveBeenCalledTimes(1);
    expect(dbMock.upsertSuspicionFlag.mock.calls[0][0]).toMatchObject({
      accountId: 1,
      severity: 'high',
    });
  });
});

describe('the Flagged-view cache', () => {
  const dataset = () => ({
    rows: [],
    countsByStatus: { new: 0, under_review: 0, cleared: 0, actioned: 0 },
    truncated: false,
  });

  it('serves through one single-flight cached read and refuses when unconfigured', async () => {
    resetSuspicionFlagDatasetForTests();
    expect(() => readSuspicionFlagDataset()).toThrow(/not configured/);
    const source = vi.fn(async () => dataset());
    configureSuspicionFlagDataset(source);
    await readSuspicionFlagDataset();
    await readSuspicionFlagDataset();
    expect(source).toHaveBeenCalledTimes(1);
  });

  it('busts on every flag write, so a workflow change is visible on the next read', async () => {
    const source = vi.fn(async () => dataset());
    configureSuspicionFlagDataset(source);
    await readSuspicionFlagDataset();
    expect(source).toHaveBeenCalledTimes(1);

    // A direct bust (the transition handlers call this).
    bustSuspicionFlagCache();
    await readSuspicionFlagDataset();
    expect(source).toHaveBeenCalledTimes(2);

    // An emitter write busts through the FIFO tail.
    flagRegistrationBurst({ accountId: 9, signals: ['x'], cohortAccountIds: [] });
    await suspicionFlagsIdle();
    await readSuspicionFlagDataset();
    expect(source).toHaveBeenCalledTimes(3);

    // A detector decision busts; a details refresh rides the TTL instead, or a
    // few live confirmed sessions would bust the cache every few seconds.
    const host = createDetectorFlagHost();
    await host.recordSuspicionFlag({ accountId: 9, details: DETAILS });
    await readSuspicionFlagDataset();
    expect(source).toHaveBeenCalledTimes(4);
    await host.refreshSuspicionFlagDetails({ accountId: 9, details: DETAILS });
    await readSuspicionFlagDataset();
    expect(source).toHaveBeenCalledTimes(4);
  });
});
