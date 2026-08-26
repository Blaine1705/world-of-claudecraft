import { EventEmitter } from 'node:events';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import {
  createDbTransactionDeadline,
  type DbTransactionDeadlineClient,
  DbTransactionDeadlineExceeded,
  type DbTransactionDeadlineScheduler,
  type DbTransactionDeadlineTimer,
} from '../../server/db_transaction_deadline';

const result = <Row extends QueryResultRow = QueryResultRow>(): QueryResult<Row> =>
  ({ rows: [] }) as unknown as QueryResult<Row>;

class FakeTimer implements DbTransactionDeadlineTimer {
  cleared = false;
  readonly unref = vi.fn();

  constructor(
    readonly atMs: number,
    readonly run: () => void,
  ) {}
}

class FakeScheduler implements DbTransactionDeadlineScheduler {
  now = 0;
  readonly timers: FakeTimer[] = [];

  nowMs = (): number => this.now;

  setTimeout = (run: () => void, delayMs: number): FakeTimer => {
    const timer = new FakeTimer(this.now + delayMs, run);
    this.timers.push(timer);
    return timer;
  };

  clearTimeout = (timer: DbTransactionDeadlineTimer): void => {
    (timer as FakeTimer).cleared = true;
  };

  elapse(ms: number): void {
    this.now += ms;
  }

  advance(ms: number): void {
    this.elapse(ms);
    for (const timer of this.timers) {
      if (!timer.cleared && timer.atMs <= this.now) {
        timer.cleared = true;
        timer.run();
      }
    }
  }
}

class FakeClient extends EventEmitter implements DbTransactionDeadlineClient {
  readonly queries: string[] = [];
  readonly releases: Array<Error | boolean | undefined> = [];

  constructor(
    private readonly respond: (text: string) => Promise<QueryResult<QueryResultRow>> = async () =>
      result(),
  ) {
    super();
  }

  async query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    _values?: unknown[],
  ): Promise<QueryResult<Row>> {
    this.queries.push(text);
    return (await this.respond(text)) as QueryResult<Row>;
  }

  release(error?: Error | boolean): void {
    this.releases.push(error);
  }
}

const fakeClient = (
  responder?: (text: string) => Promise<QueryResult<QueryResultRow>>,
): FakeClient => {
  return new FakeClient(responder);
};

const owner = (client: FakeClient, scheduler: FakeScheduler, timeoutMs = 100) =>
  createDbTransactionDeadline(client, {
    operation: 'bank save',
    timeoutMs,
    scheduler,
  });

describe('database transaction whole-operation deadline', () => {
  it('destroys the checked-out client when an active query reaches the wall deadline', async () => {
    const scheduler = new FakeScheduler();
    const active: { reject?: (error: Error) => void } = {};
    const client = fakeClient((text) =>
      text === 'SELECT slow'
        ? new Promise((_resolve, reject) => {
            active.reject = reject;
          })
        : Promise.resolve(result()),
    );
    const transaction = owner(client, scheduler);
    const pending = transaction.query('SELECT slow');

    scheduler.advance(100);
    const releasedWith = client.releases[0];
    active.reject?.(new Error('Connection terminated'));

    await expect(pending).rejects.toBe(releasedWith);
    expect(releasedWith).toBeInstanceOf(DbTransactionDeadlineExceeded);
    expect(client.releases).toEqual([releasedWith]);
    expect(scheduler.timers[0]?.unref).toHaveBeenCalledOnce();
  });

  it('expires while idle between statements and refuses every later query', async () => {
    const scheduler = new FakeScheduler();
    const client = fakeClient();
    const transaction = owner(client, scheduler);

    await transaction.query('BEGIN');
    scheduler.advance(100);
    const releasedWith = client.releases[0];

    await expect(transaction.query('SELECT 1')).rejects.toBe(releasedWith);
    expect(client.queries).toEqual(['BEGIN']);
    transaction.release();
    expect(client.releases).toEqual([releasedWith]);
  });

  it('clears the timer after a known COMMIT and returns the client once', async () => {
    const scheduler = new FakeScheduler();
    const client = fakeClient();
    const transaction = owner(client, scheduler);

    await transaction.query('BEGIN');
    await transaction.query('UPDATE characters SET state = state');
    await transaction.commit();
    transaction.release();
    scheduler.advance(1_000);

    expect(client.queries).toEqual(['BEGIN', 'UPDATE characters SET state = state', 'COMMIT']);
    expect(client.releases).toEqual([undefined]);
    expect(scheduler.timers[0]?.cleared).toBe(true);
  });

  it('rolls back an early coded query error while time remains', async () => {
    const scheduler = new FakeScheduler();
    const queryError = Object.assign(new Error('unique violation'), { code: '23505' });
    const client = fakeClient((text) =>
      text === 'INSERT' ? Promise.reject(queryError) : Promise.resolve(result()),
    );
    const transaction = owner(client, scheduler);

    await transaction.query('BEGIN');
    await expect(transaction.query('INSERT')).rejects.toBe(queryError);
    await transaction.rollback();
    transaction.release();

    expect(client.queries).toEqual(['BEGIN', 'INSERT', 'ROLLBACK']);
    expect(client.releases).toEqual([undefined]);
  });

  it('destroys instead of starting a rollback after the deadline', async () => {
    const scheduler = new FakeScheduler();
    const client = fakeClient();
    const transaction = owner(client, scheduler);
    await transaction.query('BEGIN');
    scheduler.elapse(101);

    await transaction.rollback();
    transaction.release();

    expect(client.queries).toEqual(['BEGIN']);
    expect(client.releases[0]).toBeInstanceOf(DbTransactionDeadlineExceeded);
    expect(client.releases).toHaveLength(1);
  });

  it('makes completion and final release idempotent', async () => {
    const scheduler = new FakeScheduler();
    const client = fakeClient();
    const transaction = owner(client, scheduler);

    await transaction.query('BEGIN');
    await transaction.commit();
    await transaction.commit();
    await transaction.rollback();
    transaction.release();
    transaction.release();

    expect(client.queries).toEqual(['BEGIN', 'COMMIT']);
    expect(client.releases).toEqual([undefined]);
  });

  it('destroys a client after a codeless query failure without attempting rollback', async () => {
    const scheduler = new FakeScheduler();
    const queryError = new Error('query read timeout');
    const client = fakeClient((text) =>
      text === 'UPDATE' ? Promise.reject(queryError) : Promise.resolve(result()),
    );
    const transaction = owner(client, scheduler);

    await transaction.query('BEGIN');
    await expect(transaction.query('UPDATE')).rejects.toBe(queryError);
    await transaction.rollback();
    transaction.release();

    expect(client.queries).toEqual(['BEGIN', 'UPDATE']);
    expect(client.releases).toEqual([queryError]);
  });

  it('destroys a client when rollback itself fails', async () => {
    const scheduler = new FakeScheduler();
    const rollbackError = Object.assign(new Error('connection failure'), { code: '08006' });
    const client = fakeClient((text) =>
      text === 'ROLLBACK' ? Promise.reject(rollbackError) : Promise.resolve(result()),
    );
    const transaction = owner(client, scheduler);

    await transaction.query('BEGIN');
    await transaction.rollback();
    transaction.release();

    expect(client.queries).toEqual(['BEGIN', 'ROLLBACK']);
    expect(client.releases).toEqual([rollbackError]);
  });

  it('preserves an ambiguous COMMIT error and never sends rollback after forced release', async () => {
    const scheduler = new FakeScheduler();
    const commitError = new Error('connection terminated during COMMIT');
    const client = fakeClient((text) =>
      text === 'COMMIT' ? Promise.reject(commitError) : Promise.resolve(result()),
    );
    const transaction = owner(client, scheduler);
    await transaction.query('BEGIN');

    await expect(transaction.commit()).rejects.toBe(commitError);
    await transaction.rollback();
    transaction.release();

    expect(client.queries).toEqual(['BEGIN', 'COMMIT']);
    expect(client.releases).toEqual([commitError]);
  });

  it('marks a wall deadline reached during COMMIT as outcome-ambiguous', async () => {
    const scheduler = new FakeScheduler();
    const active: { reject?: (error: Error) => void } = {};
    const client = fakeClient((text) =>
      text === 'COMMIT'
        ? new Promise((_resolve, reject) => {
            active.reject = reject;
          })
        : Promise.resolve(result()),
    );
    const transaction = owner(client, scheduler);
    await transaction.query('BEGIN');
    const pendingCommit = transaction.commit();

    scheduler.advance(100);
    const deadlineError = client.releases[0];
    active.reject?.(new Error('Connection terminated'));

    await expect(pendingCommit).rejects.toBe(deadlineError);
    expect(deadlineError).toMatchObject({ commitMayHaveSucceeded: true });
    await transaction.rollback();
    transaction.release();
    expect(client.queries).toEqual(['BEGIN', 'COMMIT']);
    expect(client.releases).toEqual([deadlineError]);
  });

  it('captures an asynchronous checked-out-client error and releases once', async () => {
    const scheduler = new FakeScheduler();
    const client = fakeClient();
    const transaction = owner(client, scheduler);
    const connectionError = Object.assign(new Error('idle transaction terminated'), {
      code: '25P03',
    });

    client.emit('error', connectionError);
    scheduler.advance(1_000);
    transaction.release();

    expect(client.releases).toEqual([connectionError]);
    await expect(transaction.query('SELECT 1')).rejects.toBe(connectionError);
  });

  it('accepts a real pg PoolClient structurally', () => {
    const acceptsPoolClient = (client: PoolClient): void => {
      const scheduler = new FakeScheduler();
      createDbTransactionDeadline(client, { timeoutMs: 100, scheduler });
    };
    expect(acceptsPoolClient).toBeTypeOf('function');
  });
});
