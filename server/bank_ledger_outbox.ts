// A pure, bounded staging owner for bank_ledger command batches. The live
// coordinator reserves capacity BEFORE it mutates the Sim, then commits the
// command's immutable rows into this queue. A character save captures one exact
// prefix and acknowledges it only after the state and ledger rows commit in the
// same database transaction.

import type { BankLedgerRow } from './db';

export interface BankLedgerOutboxLimits {
  readonly maxRows: number;
  readonly maxEncodedBytes: number;
}

// bank_ledger.ts derives a combined adversarial ceiling of 62.3 rows/s and the
// live character autosave interval is 30 seconds. That is 1,869 rows per normal
// save window. 2,048 leaves a small scheduler margin while deliberately refusing
// to retain two failed-save windows for one session. The byte cap gives those
// rows about 1 KiB each on average and independently catches unusually large item
// instances before their object graphs can become an unbounded memory queue.
export const BANK_LEDGER_OUTBOX_DEFAULT_SESSION_LIMITS: BankLedgerOutboxLimits = Object.freeze({
  maxRows: 2_048,
  maxEncodedBytes: 2 * 1024 * 1024,
});

// At most 32 row-saturated sessions or 32 byte-saturated sessions can occupy a
// process at once. This is a pressure fuse, not extra throughput: callers must
// refuse a mutation whose reservation cannot fit and let healthy saves release
// committed prefixes. Encoded bytes count the stable batch key, every normalized
// row field, and the serialized instance payload in UTF-8.
export const BANK_LEDGER_OUTBOX_DEFAULT_GLOBAL_LIMITS: BankLedgerOutboxLimits = Object.freeze({
  maxRows: 65_536,
  maxEncodedBytes: 64 * 1024 * 1024,
});

// Matches the existing storage-purchase idempotency-key contract. UUIDs,
// session counters, and colon-scoped domain keys all fit without allowing
// whitespace, control characters, or log/SQL punctuation into receipts.
export const BANK_LEDGER_OUTBOX_BATCH_KEY_MAX_LENGTH = 200;
const BANK_LEDGER_OUTBOX_BATCH_KEY_SHAPE = /^[A-Za-z0-9_.:-]+$/;

export type BankLedgerOutboxRowInput = Readonly<BankLedgerRow>;

export type SerializedBankLedgerOutboxRow = Readonly<
  Omit<BankLedgerRow, 'instance' | 'counterpartyCopperDelta' | 'counterpartyCount'> & {
    /** The detached JSON payload bound to the future jsonb parameter. */
    instanceJson: string | null;
    /** Optional DB columns are normalized so the encoded shape is stable. */
    counterpartyCopperDelta: number | null;
    counterpartyCount: number | null;
  }
>;

export interface BankLedgerCommandBatch {
  readonly batchKey: string;
  readonly rows: readonly SerializedBankLedgerOutboxRow[];
  readonly encodedBytes: number;
}

export interface BankLedgerOutboxReservationRequest {
  readonly maxRows: number;
  readonly maxEncodedBytes: number;
  /**
   * A domain idempotency key, such as a storage purchase key. When absent, the
   * outbox calls its injected key factory exactly once for a successful attempt.
   */
  readonly batchKey?: string;
}

export interface BankLedgerOutboxReservation {
  readonly batchKey: string;
  readonly maxRows: number;
  readonly maxEncodedBytes: number;
}

export interface BankLedgerOutboxUsage {
  readonly queuedRows: number;
  readonly queuedEncodedBytes: number;
  readonly reservedRows: number;
  readonly reservedEncodedBytes: number;
}

export interface BankLedgerOutboxBudgetUsage {
  readonly rows: number;
  readonly encodedBytes: number;
}

export interface BankLedgerOutboxSnapshot {
  readonly batches: readonly BankLedgerCommandBatch[];
  readonly rowCount: number;
  readonly encodedBytes: number;
}

export type BankLedgerBatchKeyFactory = () => string;

interface BudgetState {
  rows: number;
  encodedBytes: number;
}

const budgetStates = new WeakMap<BankLedgerOutboxBudget, BudgetState>();

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}

function assertIntegerOrNull(value: number | null, name: string): void {
  if (value !== null && !Number.isSafeInteger(value)) {
    throw new RangeError(`${name} must be a safe integer or null`);
  }
}

function checkedLimits(limits: BankLedgerOutboxLimits, name: string): BankLedgerOutboxLimits {
  assertPositiveInteger(limits.maxRows, `${name}.maxRows`);
  assertPositiveInteger(limits.maxEncodedBytes, `${name}.maxEncodedBytes`);
  return Object.freeze({
    maxRows: limits.maxRows,
    maxEncodedBytes: limits.maxEncodedBytes,
  });
}

function budgetState(budget: BankLedgerOutboxBudget): BudgetState {
  const state = budgetStates.get(budget);
  if (!state) throw new TypeError('unknown bank ledger outbox budget');
  return state;
}

function budgetCanAcquire(
  budget: BankLedgerOutboxBudget,
  rows: number,
  encodedBytes: number,
): boolean {
  const state = budgetState(budget);
  return (
    state.rows + rows <= budget.limits.maxRows &&
    state.encodedBytes + encodedBytes <= budget.limits.maxEncodedBytes
  );
}

function budgetAcquire(
  budget: BankLedgerOutboxBudget,
  rows: number,
  encodedBytes: number,
): boolean {
  if (!budgetCanAcquire(budget, rows, encodedBytes)) return false;
  const state = budgetState(budget);
  state.rows += rows;
  state.encodedBytes += encodedBytes;
  return true;
}

function budgetRelease(budget: BankLedgerOutboxBudget, rows: number, encodedBytes: number): void {
  assertNonNegativeInteger(rows, 'released rows');
  assertNonNegativeInteger(encodedBytes, 'released encoded bytes');
  const state = budgetState(budget);
  if (rows > state.rows || encodedBytes > state.encodedBytes) {
    throw new Error('bank ledger outbox budget accounting underflow');
  }
  state.rows -= rows;
  state.encodedBytes -= encodedBytes;
}

/**
 * The one budget shared by every live session outbox in a realm process.
 * Its counters are private to this module so callers cannot bypass reservation
 * accounting. Tests and isolated GameServer rigs can construct a smaller one.
 */
export class BankLedgerOutboxBudget {
  readonly limits: BankLedgerOutboxLimits;

  constructor(limits: BankLedgerOutboxLimits = BANK_LEDGER_OUTBOX_DEFAULT_GLOBAL_LIMITS) {
    this.limits = checkedLimits(limits, 'global limits');
    budgetStates.set(this, { rows: 0, encodedBytes: 0 });
  }

  get usage(): BankLedgerOutboxBudgetUsage {
    const state = budgetState(this);
    return Object.freeze({ rows: state.rows, encodedBytes: state.encodedBytes });
  }
}

/** The process-owned production budget. Unit tests should construct their own. */
export const bankLedgerOutboxProcessBudget = new BankLedgerOutboxBudget();

function checkedBatchKey(batchKey: unknown): string {
  if (
    typeof batchKey !== 'string' ||
    batchKey.length === 0 ||
    batchKey.length > BANK_LEDGER_OUTBOX_BATCH_KEY_MAX_LENGTH ||
    !BANK_LEDGER_OUTBOX_BATCH_KEY_SHAPE.test(batchKey)
  ) {
    throw new TypeError(
      `bank ledger batch key must be 1 to ${BANK_LEDGER_OUTBOX_BATCH_KEY_MAX_LENGTH} characters from [A-Za-z0-9_.:-]`,
    );
  }
  return batchKey;
}

function checkedString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

function checkedNullableString(value: unknown, name: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new TypeError(`${name} must be a string or null`);
  return value;
}

function serializedInstance(instance: unknown): string | null {
  // Match the existing db writer's `instance == null` boundary exactly: both
  // null and undefined bind as SQL NULL. Other unsupported top-level values
  // still stringify to undefined and fail below.
  if (instance === null || instance === undefined) return null;
  const json = JSON.stringify(instance);
  if (json === undefined) {
    throw new TypeError('bank ledger row instance is not JSON serializable');
  }
  return json;
}

function serializeRow(row: BankLedgerOutboxRowInput): SerializedBankLedgerOutboxRow {
  checkedString(row.realm, 'row.realm');
  assertPositiveInteger(row.characterId, 'row.characterId');
  assertPositiveInteger(row.accountId, 'row.accountId');
  checkedString(row.op, 'row.op');
  checkedNullableString(row.itemId, 'row.itemId');
  assertIntegerOrNull(row.count, 'row.count');
  if (!Number.isSafeInteger(row.copperDelta)) {
    throw new RangeError('row.copperDelta must be a safe integer');
  }
  assertNonNegativeInteger(row.purchasedSlotsAfter, 'row.purchasedSlotsAfter');
  checkedString(row.container, 'row.container');
  assertIntegerOrNull(row.containerId, 'row.containerId');
  assertIntegerOrNull(row.counterpartyCopperDelta ?? null, 'row.counterpartyCopperDelta');
  assertIntegerOrNull(row.counterpartyCount ?? null, 'row.counterpartyCount');

  return Object.freeze({
    realm: row.realm,
    characterId: row.characterId,
    accountId: row.accountId,
    op: row.op,
    itemId: row.itemId,
    count: row.count,
    instanceJson: serializedInstance(row.instance),
    copperDelta: row.copperDelta,
    purchasedSlotsAfter: row.purchasedSlotsAfter,
    container: row.container,
    containerId: row.containerId,
    counterpartyCopperDelta: row.counterpartyCopperDelta ?? null,
    counterpartyCount: row.counterpartyCount ?? null,
  });
}

const utf8Encoder = new TextEncoder();

/**
 * Detach one logical command from all caller-owned objects and measure the
 * exact UTF-8 JSON shape retained by this outbox. Array order is durable order.
 */
export function serializeBankLedgerCommandBatch(
  batchKey: string,
  rows: readonly BankLedgerOutboxRowInput[],
): BankLedgerCommandBatch {
  const checkedKey = checkedBatchKey(batchKey);
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new RangeError('bank ledger command batch must contain at least one row');
  }
  const serializedRows = Object.freeze(rows.map(serializeRow));
  const encodedBytes = utf8Encoder.encode(
    JSON.stringify({ batchKey: checkedKey, rows: serializedRows }),
  ).byteLength;
  return Object.freeze({
    batchKey: checkedKey,
    rows: serializedRows,
    encodedBytes,
  });
}

interface ReservationState {
  readonly batchKey: string;
  readonly maxRows: number;
  readonly maxEncodedBytes: number;
}

interface SnapshotState {
  readonly batches: readonly BankLedgerCommandBatch[];
  consumed: boolean;
}

export interface BankLedgerOutboxOptions {
  readonly budget?: BankLedgerOutboxBudget;
  readonly limits?: BankLedgerOutboxLimits;
  /** No Date.now or randomness lives here. The host owns stable key allocation. */
  readonly nextBatchKey?: BankLedgerBatchKeyFactory;
}

export class BankLedgerOutbox {
  readonly limits: BankLedgerOutboxLimits;

  private readonly budget: BankLedgerOutboxBudget;
  private readonly nextBatchKey: BankLedgerBatchKeyFactory | undefined;
  private readonly reservations = new Map<BankLedgerOutboxReservation, ReservationState>();
  private readonly pendingKeys = new Set<string>();
  private readonly snapshotStates = new WeakMap<BankLedgerOutboxSnapshot, SnapshotState>();
  private readonly batches: BankLedgerCommandBatch[] = [];
  private queuedRows = 0;
  private queuedEncodedBytes = 0;
  private reservedRows = 0;
  private reservedEncodedBytes = 0;
  private closed = false;

  constructor(options: BankLedgerOutboxOptions = {}) {
    this.budget = options.budget ?? bankLedgerOutboxProcessBudget;
    this.limits = checkedLimits(
      options.limits ?? BANK_LEDGER_OUTBOX_DEFAULT_SESSION_LIMITS,
      'session limits',
    );
    this.nextBatchKey = options.nextBatchKey;
  }

  get usage(): BankLedgerOutboxUsage {
    return Object.freeze({
      queuedRows: this.queuedRows,
      queuedEncodedBytes: this.queuedEncodedBytes,
      reservedRows: this.reservedRows,
      reservedEncodedBytes: this.reservedEncodedBytes,
    });
  }

  get discarded(): boolean {
    return this.closed;
  }

  get hasPending(): boolean {
    return this.queuedRows > 0 || this.reservedRows > 0;
  }

  /**
   * Acquire both the session and process budgets before a gameplay mutation.
   * A capacity refusal is null. Invalid arguments and broken key allocation are
   * programmer errors and throw without changing any counter.
   */
  tryReserve(request: BankLedgerOutboxReservationRequest): BankLedgerOutboxReservation | null {
    this.assertOpen();
    assertPositiveInteger(request.maxRows, 'reservation.maxRows');
    assertPositiveInteger(request.maxEncodedBytes, 'reservation.maxEncodedBytes');
    if (
      this.queuedRows + this.reservedRows + request.maxRows > this.limits.maxRows ||
      this.queuedEncodedBytes + this.reservedEncodedBytes + request.maxEncodedBytes >
        this.limits.maxEncodedBytes
    ) {
      return null;
    }
    if (!budgetCanAcquire(this.budget, request.maxRows, request.maxEncodedBytes)) return null;

    const generated = request.batchKey ?? this.nextBatchKey?.();
    if (generated === undefined) {
      throw new TypeError('bank ledger reservation needs a batch key or injected key factory');
    }
    const batchKey = checkedBatchKey(generated);
    if (this.pendingKeys.has(batchKey)) {
      throw new Error(`duplicate bank ledger batch key: ${batchKey}`);
    }
    // There is no await or user callback between the capacity probe and this
    // acquisition. Keeping the acquire fallible also protects future reuse.
    if (!budgetAcquire(this.budget, request.maxRows, request.maxEncodedBytes)) return null;

    const reservation = Object.freeze({
      batchKey,
      maxRows: request.maxRows,
      maxEncodedBytes: request.maxEncodedBytes,
    });
    this.reservations.set(reservation, reservation);
    this.pendingKeys.add(batchKey);
    this.reservedRows += request.maxRows;
    this.reservedEncodedBytes += request.maxEncodedBytes;
    return reservation;
  }

  /** Cancel only when the guarded mutation did not happen. */
  cancel(reservation: BankLedgerOutboxReservation): boolean {
    if (this.closed) return false;
    const state = this.reservations.get(reservation);
    if (!state) return false;
    this.reservations.delete(reservation);
    this.pendingKeys.delete(state.batchKey);
    this.reservedRows -= state.maxRows;
    this.reservedEncodedBytes -= state.maxEncodedBytes;
    budgetRelease(this.budget, state.maxRows, state.maxEncodedBytes);
    return true;
  }

  /**
   * Convert one live reservation into one immutable all-rows-or-none command
   * batch. A failed validation leaves the reservation active so no capacity is
   * silently freed after a caller may already have mutated gameplay state.
   */
  commit(
    reservation: BankLedgerOutboxReservation,
    rows: readonly BankLedgerOutboxRowInput[],
  ): BankLedgerCommandBatch {
    this.assertOpen();
    const state = this.reservations.get(reservation);
    if (!state) throw new Error('inactive bank ledger outbox reservation');
    const batch = serializeBankLedgerCommandBatch(state.batchKey, rows);
    if (batch.rows.length > state.maxRows) {
      throw new RangeError('bank ledger batch exceeds its reserved row limit');
    }
    if (batch.encodedBytes > state.maxEncodedBytes) {
      throw new RangeError('bank ledger batch exceeds its reserved byte limit');
    }

    this.reservations.delete(reservation);
    this.reservedRows -= state.maxRows;
    this.reservedEncodedBytes -= state.maxEncodedBytes;
    this.queuedRows += batch.rows.length;
    this.queuedEncodedBytes += batch.encodedBytes;
    this.batches.push(batch);

    // The full maximum was acquired by tryReserve. Only the unused tail is
    // released here, so the actual queued batch remains charged exactly once.
    budgetRelease(
      this.budget,
      state.maxRows - batch.rows.length,
      state.maxEncodedBytes - batch.encodedBytes,
    );
    return batch;
  }

  /** Capture all committed work currently queued, never live reservations. */
  snapshot(): BankLedgerOutboxSnapshot {
    this.assertOpen();
    const batches = Object.freeze(this.batches.slice());
    const snapshot = Object.freeze({
      batches,
      rowCount: this.queuedRows,
      encodedBytes: this.queuedEncodedBytes,
    });
    this.snapshotStates.set(snapshot, { batches, consumed: false });
    return snapshot;
  }

  /**
   * Splice only the exact object prefix this outbox captured. Appends made while
   * a save was in flight remain queued. A stale, overlapping, forged, or already
   * acknowledged snapshot is a no-op.
   */
  acknowledge(snapshot: BankLedgerOutboxSnapshot): boolean {
    if (this.closed) return false;
    const state = this.snapshotStates.get(snapshot);
    if (!state || state.consumed) return false;
    state.consumed = true;
    if (state.batches.length > this.batches.length) return false;
    for (let i = 0; i < state.batches.length; i++) {
      if (this.batches[i] !== state.batches[i]) return false;
    }

    let rows = 0;
    let encodedBytes = 0;
    for (const batch of state.batches) {
      rows += batch.rows.length;
      encodedBytes += batch.encodedBytes;
      this.pendingKeys.delete(batch.batchKey);
    }
    this.batches.splice(0, state.batches.length);
    this.queuedRows -= rows;
    this.queuedEncodedBytes -= encodedBytes;
    budgetRelease(this.budget, rows, encodedBytes);
    return true;
  }

  /**
   * Session teardown abandons all unsaved work and every unused reservation.
   * The outbox closes permanently so stale callbacks cannot spend released
   * process capacity. Repeated discard calls are safe.
   */
  discard(): void {
    if (this.closed) return;
    const rows = this.queuedRows + this.reservedRows;
    const encodedBytes = this.queuedEncodedBytes + this.reservedEncodedBytes;
    this.closed = true;
    this.batches.length = 0;
    this.reservations.clear();
    this.pendingKeys.clear();
    this.queuedRows = 0;
    this.queuedEncodedBytes = 0;
    this.reservedRows = 0;
    this.reservedEncodedBytes = 0;
    budgetRelease(this.budget, rows, encodedBytes);
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('bank ledger outbox was discarded');
  }
}
