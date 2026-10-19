// A single immutable vault projection, streamed only as the socket drains.
// No whole-vault JSON string, parallel transfer queue, or storage size limit.
import {
  VAULT_TRANSFER_FRAME_BYTES,
  VAULT_TRANSFER_SOFT_BACKLOG_BYTES,
  VAULT_TRANSFER_STRING_CHARS,
  VAULT_TRANSFER_TOKEN_LIMIT,
  VAULT_TRANSFER_VERSION,
  type VaultTransferChunk,
  type VaultTransferToken,
} from '../src/vault_transfer_protocol';
import type { VaultInfo } from '../src/world_api';

function* textTokens(kind: 4 | 5, text: string): Generator<VaultTransferToken> {
  if (text.length === 0) {
    yield [kind, '', true];
    return;
  }
  for (let offset = 0; offset < text.length; offset += VAULT_TRANSFER_STRING_CHARS) {
    const end = Math.min(text.length, offset + VAULT_TRANSFER_STRING_CHARS);
    // Splitting a surrogate pair is lossless: each JSON token escapes a lone
    // code unit and the receiver rejoins the original UTF-16 string verbatim.
    yield [kind, text.slice(offset, end), end === text.length];
  }
}

function* tokens(value: unknown): Generator<VaultTransferToken> {
  if (typeof value === 'string') yield* textTokens(5, value);
  else if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    yield [6, value];
  } else if (Array.isArray(value)) {
    yield [2];
    for (const entry of value) yield* tokens(entry);
    yield [3];
  } else if (value && typeof value === 'object') {
    yield [0];
    for (const key in value) {
      if (!Object.hasOwn(value, key)) continue;
      const entry = (value as Record<string, unknown>)[key];
      if (entry === undefined) continue; // JSON's omitted optional fields
      yield* textTokens(4, key);
      yield* tokens(entry);
    }
    yield [1];
  } else throw new Error('Invalid vault projection value');
}

export class VaultTransferSender {
  private readonly iterator: Generator<VaultTransferToken>;
  private pending: IteratorResult<VaultTransferToken> | undefined;
  private prepared: VaultTransferChunk | undefined;
  private cursor = 0;

  constructor(
    readonly id: number,
    readonly info: VaultInfo,
  ) {
    this.iterator = tokens(info);
  }

  peek(): VaultTransferChunk {
    if (this.prepared) return this.prepared;
    const batch: VaultTransferToken[] = [];
    // Envelope and separators, with ample room for safe-integer ids/cursors.
    let bytes = 256;
    let next = this.pending ?? this.iterator.next();
    while (!next.done && batch.length < VAULT_TRANSFER_TOKEN_LIMIT) {
      const tokenBytes = Buffer.byteLength(JSON.stringify(next.value), 'utf8') + 1;
      if (bytes + tokenBytes > VAULT_TRANSFER_FRAME_BYTES) break;
      bytes += tokenBytes;
      batch.push(next.value);
      next = this.iterator.next();
    }
    this.pending = next;
    if (batch.length === 0 && !next.done) throw new Error('Vault token exceeds frame bound');
    this.prepared = {
      vaultTransfer: VAULT_TRANSFER_VERSION,
      id: this.id,
      cursor: this.cursor,
      done: !!next.done,
      tokens: batch,
    };
    return this.prepared;
  }

  // Called only after emit accepted the chunk. A throwing emitter retries the
  // same cursor and bytes instead of skipping data or stamping the revision.
  accept(): void {
    const chunk = this.peek();
    const next = this.cursor + chunk.tokens.length;
    if (!Number.isSafeInteger(next)) throw new Error('Vault cursor overflow');
    this.cursor = next;
    this.prepared = undefined;
  }
}

export function vaultTransferCanSend(ws?: { bufferedAmount?: number }): boolean {
  return (ws?.bufferedAmount ?? 0) <= VAULT_TRANSFER_SOFT_BACKLOG_BYTES;
}

export interface VaultTransferSession {
  ws?: { bufferedAmount?: number };
  lastSent: Readonly<Record<string, string>>;
  lastVaultWirePid: number | null;
  lastVaultWireRev: number | null;
  vaultTransferSocket?: unknown;
  nextVaultTransferId?: number;
  vaultTransfer?: { sender: VaultTransferSender; pid: number; rev: number };
}

export function emitPacedVaultProjection(
  emit: (key: 'vault', value: unknown) => void,
  session: VaultTransferSession,
  pid: number,
  rev: number | null,
  project: () => VaultInfo | null,
): void {
  if (session.vaultTransferSocket !== session.ws) {
    delete session.vaultTransfer;
    session.lastVaultWirePid = null;
    session.lastVaultWireRev = null;
    session.vaultTransferSocket = session.ws;
  }
  const changed = pid !== session.lastVaultWirePid || rev !== session.lastVaultWireRev;
  if (rev === null) {
    if (changed || session.lastSent.vault === undefined || session.vaultTransfer)
      emit('vault', null);
    delete session.vaultTransfer;
  } else {
    let pending = session.vaultTransfer;
    if (changed || (session.lastSent.vault === undefined && !pending)) {
      if (!pending || pending.pid !== pid || pending.rev !== rev) {
        // Cancel an obsolete immutable projection before taking the new one.
        delete session.vaultTransfer;
        const info = project();
        if (info === null) emit('vault', null);
        else {
          const id = (session.nextVaultTransferId ?? 0) + 1;
          if (!Number.isSafeInteger(id)) throw new Error('Vault transfer id overflow');
          session.nextVaultTransferId = id;
          pending = { sender: new VaultTransferSender(id, info), pid, rev };
          session.vaultTransfer = pending;
        }
      }
    }
    pending = session.vaultTransfer;
    if (pending && vaultTransferCanSend(session.ws)) {
      const chunk = pending.sender.peek();
      // Preserve ordinary small-vault wire records and their by-reference
      // decode. A completed first bounded token batch proves this is small.
      emit('vault', chunk.done && chunk.cursor === 0 ? pending.sender.info : chunk);
      pending.sender.accept();
      if (chunk.done) delete session.vaultTransfer;
    }
  }
  session.lastVaultWirePid = pid;
  session.lastVaultWireRev = rev;
}
