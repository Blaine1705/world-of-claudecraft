// Incrementally builds the future VaultInfo only. Public state changes atomically
// after the normal strict vault decoder validates the completed tree. There is
// no parallel-transfer map, declared-size preallocation, or whole JSON buffer.
import {
  VAULT_TRANSFER_DEPTH,
  VAULT_TRANSFER_FRAME_BYTES,
  VAULT_TRANSFER_STRING_CHARS,
  VAULT_TRANSFER_TOKEN_LIMIT,
  VAULT_TRANSFER_VERSION,
  type VaultTransferToken,
} from '../vault_transfer_protocol';
import type { VaultInfo } from '../world_api';
import { decodeVaultInfoWire, isRecord } from './vault_snapshot_wire';

type Frame = { value: Record<string, unknown> | unknown[]; key?: string };
export interface VaultTransferMirror {
  vaultInfo: VaultInfo | null;
  vaultTransferReceiver?: VaultTransferReceiver;
}

function tokenValid(token: unknown): token is VaultTransferToken {
  if (!Array.isArray(token)) return false;
  if ([0, 1, 2, 3].includes(token[0])) return token.length === 1;
  if (token[0] === 4 || token[0] === 5) {
    return (
      token.length === 3 &&
      typeof token[1] === 'string' &&
      token[1].length <= VAULT_TRANSFER_STRING_CHARS &&
      typeof token[2] === 'boolean'
    );
  }
  return (
    token[0] === 6 &&
    token.length === 2 &&
    (token[1] === null ||
      typeof token[1] === 'boolean' ||
      (typeof token[1] === 'number' && Number.isFinite(token[1])))
  );
}

function tokensWithinFrame(value: unknown): value is VaultTransferToken[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > VAULT_TRANSFER_TOKEN_LIMIT)
    return false;
  let bytes = 256; // Same conservative envelope allowance as the sender.
  const encoder = new TextEncoder();
  for (const token of value) {
    if (!tokenValid(token)) return false;
    // Check one bounded token at a time. Do not stringify an attacker-sized
    // batch before discovering that its declared frame exceeds the bound.
    bytes += encoder.encode(JSON.stringify(token)).length + 1;
    if (bytes > VAULT_TRANSFER_FRAME_BYTES) return false;
  }
  return true;
}

export class VaultTransferReceiver {
  private id = 0;
  private cursor = 0;
  private root: unknown;
  private hasRoot = false;
  private stack: Frame[] = [];
  private text: { kind: 4 | 5; value: string } | undefined;
  private active = false;

  private clear(): void {
    this.root = undefined;
    this.hasRoot = false;
    this.stack = [];
    this.text = undefined;
    this.active = false;
  }

  private add(value: unknown): boolean {
    const parent = this.stack.at(-1);
    if (!parent) {
      if (this.hasRoot) return false;
      this.root = value;
      this.hasRoot = true;
    } else if (Array.isArray(parent.value)) parent.value.push(value);
    else {
      if (parent.key === undefined || Object.hasOwn(parent.value, parent.key)) return false;
      // __proto__, constructor and prototype stay inert own data, just as in
      // JSON.parse and the existing bank/vault decoder. Never indexed assign.
      Object.defineProperty(parent.value, parent.key, {
        value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
      parent.key = undefined;
    }
    return true;
  }

  private consume(token: VaultTransferToken): boolean {
    const kind = token[0];
    if (this.text && kind !== this.text.kind) return false;
    if (kind === 4 || kind === 5) {
      const parent = this.stack.at(-1);
      if (kind === 4 && (!parent || Array.isArray(parent.value) || parent.key !== undefined))
        return false;
      if (!this.text) this.text = { kind, value: '' };
      this.text.value += token[1];
      if (!token[2]) return true;
      const value = this.text.value;
      this.text = undefined;
      if (kind === 4) {
        if (!parent || Object.hasOwn(parent.value, value)) return false;
        parent.key = value;
        return true;
      }
      return this.add(value);
    }
    if (kind === 0 || kind === 2) {
      if (this.stack.length >= VAULT_TRANSFER_DEPTH) return false;
      const value = kind === 0 ? (Object.create(null) as Record<string, unknown>) : [];
      if (!this.add(value)) return false;
      this.stack.push({ value });
      return true;
    }
    if (kind === 1 || kind === 3) {
      const parent = this.stack.at(-1);
      if (!parent || parent.key !== undefined || Array.isArray(parent.value) !== (kind === 3))
        return false;
      this.stack.pop();
      return true;
    }
    return this.add(token[1]);
  }

  // undefined means an accepted partial chunk or an obsolete transfer, not an
  // empty vault. Null is malformed, matching the existing vault reject policy.
  receive(value: unknown): VaultInfo | null | undefined {
    if (
      !isRecord(value) ||
      Object.keys(value).some(
        (k) => !['vaultTransfer', 'id', 'cursor', 'done', 'tokens'].includes(k),
      ) ||
      value.vaultTransfer !== VAULT_TRANSFER_VERSION ||
      !Number.isSafeInteger(value.id) ||
      (value.id as number) <= 0 ||
      !Number.isSafeInteger(value.cursor) ||
      (value.cursor as number) < 0 ||
      typeof value.done !== 'boolean' ||
      !tokensWithinFrame(value.tokens)
    ) {
      this.clear();
      return null;
    }
    const id = value.id as number;
    const cursor = value.cursor as number;
    if (id < this.id || (id === this.id && !this.active)) return undefined;
    if (id > this.id) {
      this.clear();
      this.id = id;
      this.cursor = 0;
      if (cursor !== 0) return null;
      this.active = true;
    }
    if (
      !this.active ||
      cursor !== this.cursor ||
      !Number.isSafeInteger(cursor + value.tokens.length)
    ) {
      this.clear();
      return null;
    }
    for (const token of value.tokens) {
      if (!this.consume(token)) {
        this.clear();
        return null;
      }
    }
    this.cursor += value.tokens.length;
    if (!value.done) {
      if (this.hasRoot && this.stack.length === 0 && !this.text) {
        this.clear();
        return null;
      }
      return undefined;
    }
    const result =
      this.hasRoot && this.stack.length === 0 && !this.text ? decodeVaultInfoWire(this.root) : null;
    this.clear();
    return result;
  }
}

export function applyVaultTransferWire(target: VaultTransferMirror, value: unknown): void {
  if (isRecord(value) && Object.hasOwn(value, 'vaultTransfer')) {
    target.vaultTransferReceiver ??= new VaultTransferReceiver();
    const decoded = target.vaultTransferReceiver.receive(value);
    if (decoded !== undefined) target.vaultInfo = decoded;
  } else {
    delete target.vaultTransferReceiver;
    target.vaultInfo = decodeVaultInfoWire(value);
  }
}

export function resetVaultTransferWire(target: VaultTransferMirror): void {
  delete target.vaultTransferReceiver;
  target.vaultInfo = null;
}
