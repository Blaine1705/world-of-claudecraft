// The shared loopback guard behind every script that mints accounts, grants
// roles, or drives /dev cheats (scripts/lib/loopback_guard.mjs). The reject
// cases are the phase 16 security review's verified bypass attempts; the
// DATABASE arm must agree with what node-postgres actually resolves,
// including the ?host= query override a WHATWG-hostname check misses.
import { describe, expect, it } from 'vitest';
import { assertLoopbackDatabaseUrl, assertLoopbackUrl } from '../scripts/lib/loopback_guard.mjs';

describe('assertLoopbackUrl', () => {
  it('accepts the three loopback spellings, bracketed v6 and normalized shorthand included', () => {
    expect(assertLoopbackUrl('http://localhost:8787', 'SERVER_URL').hostname).toBe('localhost');
    expect(assertLoopbackUrl('http://127.0.0.1:8799/ws', 'SERVER_URL').port).toBe('8799');
    expect(assertLoopbackUrl('http://[::1]:8787', 'SERVER_URL').hostname).toBe('[::1]');
    // WHATWG URL normalizes IPv4 shorthand at parse time, so 127.1 reaches
    // the allowlist AS 127.0.0.1: genuinely loopback, correctly accepted.
    expect(assertLoopbackUrl('http://127.1', 'SERVER_URL').hostname).toBe('127.0.0.1');
  });

  it('rejects every verified bypass shape, naming only the hostname', () => {
    const rejects = [
      'http://127.0.0.1@evil.example.com', // userinfo trick: real host is evil
      'http://127.0.0.1.evil.example.com', // subdomain lookalike
      'http://localhost.evil.example.com',
      'http://localhost.', // trailing-dot FQDN
      'http://[::ffff:127.0.0.1]', // v4-mapped v6
      'http://evil.example.com',
    ];
    for (const url of rejects) {
      expect(() => assertLoopbackUrl(url, 'SERVER_URL'), url).toThrow(/non-loopback SERVER_URL/);
    }
  });

  it('throws on an unparseable URL without echoing a value', () => {
    expect(() => assertLoopbackUrl('not a url', 'SERVER_URL')).toThrow(
      /invalid SERVER_URL \(not a parseable URL\)/,
    );
  });
});

describe('assertLoopbackDatabaseUrl', () => {
  it('accepts loopback connection strings', () => {
    expect(() => assertLoopbackDatabaseUrl('postgres://u:p@127.0.0.1:5434/db')).not.toThrow();
    expect(() => assertLoopbackDatabaseUrl('postgres://u:p@localhost/db')).not.toThrow();
  });

  it('rejects the ?host= override node-postgres would actually honor', () => {
    expect(() =>
      assertLoopbackDatabaseUrl('postgres://u:p@127.0.0.1:5432/db?host=evil.example.com'),
    ).toThrow(/non-loopback DATABASE_URL/);
  });

  it('rejects a remote host and the credentials-in-userinfo trick', () => {
    expect(() => assertLoopbackDatabaseUrl('postgres://u:p@db.example.com/db')).toThrow(
      /non-loopback/,
    );
    expect(() => assertLoopbackDatabaseUrl('postgres://localhost@evil.example.com/db')).toThrow(
      /non-loopback/,
    );
  });

  it('fails closed on a hostless or unset connection string, each with ITS message', () => {
    // Split arms (the fix-round review: an alternation pins neither): the
    // hostless string surfaces as the (none) refusal, the unset value as the
    // explicit missing arm, and neither echoes the raw value.
    expect(() => assertLoopbackDatabaseUrl('postgres:///db')).toThrow(
      /non-loopback DATABASE_URL host "\(none\)"/,
    );
    expect(() => assertLoopbackDatabaseUrl(undefined)).toThrow(/missing DATABASE_URL/);
    expect(() => assertLoopbackDatabaseUrl('')).toThrow(/missing DATABASE_URL/);
  });
});
