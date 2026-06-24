import crypto from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { requestIp } from './ratelimit';

const DESKTOP_LOGIN_TTL_MS = 5 * 60 * 1000;
const DESKTOP_LOGIN_CODE_BYTES = 20;

interface DesktopLoginCode {
  accountId: number;
  username: string;
  issuedAt: number;
  ip: string;
}

const desktopLoginCodes = new Map<string, DesktopLoginCode>();

function nowMs(): number {
  return Date.now();
}

function pruneDesktopLoginCodes(): void {
  const cutoff = nowMs() - DESKTOP_LOGIN_TTL_MS;
  for (const [code, entry] of desktopLoginCodes) {
    if (entry.issuedAt < cutoff) desktopLoginCodes.delete(code);
  }
}

export function createDesktopLoginCode(
  req: IncomingMessage,
  account: { id: number; username: string },
): { code: string; expiresInMs: number } {
  pruneDesktopLoginCodes();
  const code = crypto.randomBytes(DESKTOP_LOGIN_CODE_BYTES).toString('base64url');
  desktopLoginCodes.set(code, {
    accountId: account.id,
    username: account.username,
    issuedAt: nowMs(),
    ip: requestIp(req),
  });
  return { code, expiresInMs: DESKTOP_LOGIN_TTL_MS };
}

export function consumeDesktopLoginCode(
  req: IncomingMessage,
  code: unknown,
): { accountId: number; username: string } | null {
  pruneDesktopLoginCodes();
  if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{20,80}$/.test(code)) return null;
  const entry = desktopLoginCodes.get(code);
  if (!entry) return null;
  desktopLoginCodes.delete(code);
  if (nowMs() - entry.issuedAt > DESKTOP_LOGIN_TTL_MS) return null;
  if (entry.ip !== requestIp(req)) return null;
  return { accountId: entry.accountId, username: entry.username };
}

export function resetDesktopLoginCodesForTest(): void {
  desktopLoginCodes.clear();
}
