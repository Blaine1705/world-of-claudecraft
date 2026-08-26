import type { QueryResult, QueryResultRow } from 'pg';

export interface DbTransactionDeadlineClient {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<Row>>;
  release(error?: Error | boolean): void;
  on(event: 'error', listener: (error: Error) => void): unknown;
  removeListener(event: 'error', listener: (error: Error) => void): unknown;
}

export interface DbTransactionDeadlineTimer {
  unref(): unknown;
}

export interface DbTransactionDeadlineScheduler {
  nowMs(): number;
  setTimeout(run: () => void, delayMs: number): DbTransactionDeadlineTimer;
  clearTimeout(timer: DbTransactionDeadlineTimer): void;
}

export interface DbTransactionDeadlineOptions {
  timeoutMs: number;
  operation?: string;
  scheduler?: DbTransactionDeadlineScheduler;
}

const DEFAULT_SCHEDULER: DbTransactionDeadlineScheduler = {
  nowMs: () => Date.now(),
  setTimeout: (run, delayMs) => setTimeout(run, delayMs),
  clearTimeout: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
};

type QueryPhase = 'statement' | 'commit' | 'rollback';
type Completion = 'committed' | 'rolled_back';

export class DbTransactionDeadlineExceeded extends Error {
  readonly commitMayHaveSucceeded: boolean;

  constructor(operation: string, timeoutMs: number, commitMayHaveSucceeded: boolean) {
    super(`${operation} exceeded its ${timeoutMs} ms transaction deadline`);
    this.name = 'DbTransactionDeadlineExceeded';
    this.commitMayHaveSucceeded = commitMayHaveSucceeded;
  }
}

const pgErrorCode = (error: unknown): string | undefined =>
  (error as { code?: string } | null | undefined)?.code;

const errorForRelease = (error: unknown): Error =>
  error instanceof Error ? error : new Error('PostgreSQL transaction failed');

/**
 * Owns the wall deadline and checked-out-client lifecycle for one transaction.
 * Construct it immediately before BEGIN and route every statement through it.
 */
export class DbTransactionDeadline {
  private readonly deadlineAtMs: number;
  private readonly timer: DbTransactionDeadlineTimer;
  private completion: Completion | null = null;
  private activePhase: QueryPhase | null = null;
  private released = false;
  private releaseReason: Error | null = null;
  private timerCleared = false;
  private listenerAttached = true;

  private readonly onClientError = (error: Error): void => {
    this.forceRelease(error);
  };

  constructor(
    private readonly client: DbTransactionDeadlineClient,
    private readonly timeoutMs: number,
    private readonly operation: string,
    private readonly scheduler: DbTransactionDeadlineScheduler,
  ) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new RangeError('transaction deadline timeoutMs must be a positive finite number');
    }
    this.deadlineAtMs = scheduler.nowMs() + timeoutMs;
    client.on('error', this.onClientError);
    this.timer = scheduler.setTimeout(() => {
      this.expire(this.activePhase === 'commit');
    }, timeoutMs);
    this.timer.unref();
  }

  async query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<Row>> {
    return this.executeQuery<Row>('statement', text, values);
  }

  async commit(): Promise<void> {
    if (this.completion !== null) return;
    await this.executeQuery('commit', 'COMMIT');
    this.completion = 'committed';
    this.clearDeadlineTimer();
  }

  /** Best-effort cleanup that never replaces the transaction's primary error. */
  async rollback(): Promise<void> {
    if (this.completion !== null || this.released) return;
    try {
      await this.executeQuery('rollback', 'ROLLBACK');
      this.completion = 'rolled_back';
      this.clearDeadlineTimer();
    } catch (error) {
      this.forceRelease(errorForRelease(error));
    }
  }

  /** Return a completed transaction, or destroy an incomplete one, exactly once. */
  release(): void {
    if (this.released) return;
    if (this.completion === null) {
      this.forceRelease(new Error(`${this.operation} transaction released before completion`));
      return;
    }
    this.released = true;
    this.clearDeadlineTimer();
    this.detachErrorListener();
    this.client.release();
  }

  private async executeQuery<Row extends QueryResultRow = QueryResultRow>(
    phase: QueryPhase,
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<Row>> {
    this.assertCanQuery(phase);
    this.activePhase = phase;
    try {
      const response = await this.client.query<Row>(text, values);
      if (this.scheduler.nowMs() >= this.deadlineAtMs) {
        this.expire(phase === 'commit');
        throw this.releaseReason;
      }
      return response;
    } catch (error) {
      // Socket destruction makes pg reject the active query with a generic
      // connection error. When this owner already forced that destruction,
      // keep its causal error (including COMMIT ambiguity) instead.
      if (this.released && this.releaseReason) throw this.releaseReason;
      // A driver-side timeout has no SQLSTATE and does not cancel the server
      // query. Destroy the socket rather than issue a ROLLBACK into a response
      // that may still be in flight and return a desynchronized client.
      if (!this.released && pgErrorCode(error) === undefined) {
        this.forceRelease(errorForRelease(error));
      }
      throw error;
    } finally {
      if (this.activePhase === phase) this.activePhase = null;
    }
  }

  private assertCanQuery(phase: QueryPhase): void {
    if (this.completion !== null) {
      throw new Error(`${this.operation} transaction is already complete`);
    }
    if (this.released) {
      throw this.releaseReason ?? new Error(`${this.operation} transaction client was released`);
    }
    if (this.activePhase !== null) {
      throw new Error(`${this.operation} transaction already has a query in flight`);
    }
    if (this.scheduler.nowMs() >= this.deadlineAtMs) {
      this.expire(phase === 'commit');
      throw this.releaseReason;
    }
  }

  private expire(commitMayHaveSucceeded: boolean): void {
    if (this.released || this.completion !== null) return;
    this.forceRelease(
      new DbTransactionDeadlineExceeded(this.operation, this.timeoutMs, commitMayHaveSucceeded),
    );
  }

  private forceRelease(error: Error): void {
    if (this.released) return;
    this.released = true;
    this.releaseReason = error;
    this.clearDeadlineTimer();
    this.detachErrorListener();
    this.client.release(error);
  }

  private clearDeadlineTimer(): void {
    if (this.timerCleared) return;
    this.timerCleared = true;
    this.scheduler.clearTimeout(this.timer);
  }

  private detachErrorListener(): void {
    if (!this.listenerAttached) return;
    this.listenerAttached = false;
    this.client.removeListener('error', this.onClientError);
  }
}

export function createDbTransactionDeadline(
  client: DbTransactionDeadlineClient,
  options: DbTransactionDeadlineOptions,
): DbTransactionDeadline {
  return new DbTransactionDeadline(
    client,
    options.timeoutMs,
    options.operation ?? 'PostgreSQL operation',
    options.scheduler ?? DEFAULT_SCHEDULER,
  );
}
