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
  signal?: AbortSignal;
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

export class DbTransactionAborted extends Error {
  readonly code = 'DB_TRANSACTION_ABORTED' as const;
  readonly commitMayHaveSucceeded: boolean;

  constructor(operation: string, commitMayHaveSucceeded: boolean) {
    super(`${operation} transaction aborted`);
    this.name = 'DbTransactionAborted';
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
  private timer: DbTransactionDeadlineTimer | null = null;
  private completion: Completion | null = null;
  private activePhase: QueryPhase | null = null;
  private released = false;
  private releaseReason: Error | null = null;
  private timerCleared = false;
  private clientErrorListenerAttached = false;
  private abortListenerAttached = false;

  private readonly onClientError = (error: Error): void => {
    this.forceRelease(error);
  };

  private readonly onAbort = (): void => {
    if (this.released || this.completion !== null) return;
    if (this.scheduler.nowMs() >= this.deadlineAtMs) {
      this.expire(this.activePhase === 'commit');
      return;
    }
    this.forceRelease(new DbTransactionAborted(this.operation, this.activePhase === 'commit'));
  };

  constructor(
    private readonly client: DbTransactionDeadlineClient,
    private readonly timeoutMs: number,
    private readonly operation: string,
    private readonly scheduler: DbTransactionDeadlineScheduler,
    private readonly signal?: AbortSignal,
  ) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new RangeError('transaction deadline timeoutMs must be a positive finite number');
    }
    this.deadlineAtMs = scheduler.nowMs() + timeoutMs;
    client.on('error', this.onClientError);
    this.clientErrorListenerAttached = true;
    if (signal) {
      signal.addEventListener('abort', this.onAbort, { once: true });
      this.abortListenerAttached = true;
      if (signal.aborted) {
        this.onAbort();
        return;
      }
    }
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
    this.detachAbortListener();
  }

  /** Best-effort cleanup that never replaces the transaction's primary error. */
  async rollback(): Promise<void> {
    if (this.completion !== null || this.released) return;
    try {
      await this.executeQuery('rollback', 'ROLLBACK');
      this.completion = 'rolled_back';
      this.clearDeadlineTimer();
      this.detachAbortListener();
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
    this.detachListeners();
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
      if (this.released && this.releaseReason) throw this.releaseReason;
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
    this.detachListeners();
    this.client.release(error);
  }

  private clearDeadlineTimer(): void {
    if (this.timerCleared) return;
    this.timerCleared = true;
    if (this.timer) this.scheduler.clearTimeout(this.timer);
  }

  private detachClientErrorListener(): void {
    if (!this.clientErrorListenerAttached) return;
    this.clientErrorListenerAttached = false;
    this.client.removeListener('error', this.onClientError);
  }

  private detachAbortListener(): void {
    if (!this.signal || !this.abortListenerAttached) return;
    this.abortListenerAttached = false;
    this.signal.removeEventListener('abort', this.onAbort);
  }

  private detachListeners(): void {
    this.detachClientErrorListener();
    this.detachAbortListener();
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
    options.signal,
  );
}
