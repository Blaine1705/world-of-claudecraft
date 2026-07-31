// Shared loopback guards for scripts that mint accounts, grant roles, or
// drive /dev cheats: every target they touch must be local, and the DATABASE
// arm must validate the host node-postgres will ACTUALLY use (pg-connection-
// string honors a ?host= query override, so a WHATWG-hostname-only check is
// bypassable). Extracted on the rule of three (admin_professions_shot.mjs,
// mob_stall_repro.mjs, load_professions.mjs each hand-carried a copy) so the
// control is testable in one place: tests/loopback_guard.test.ts.

import { parse as parsePgTarget } from 'pg-connection-string';

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '::1'];

/** Throws unless the URL's hostname is loopback. Never echoes credentials:
 *  only the hostname appears in the error. Returns the parsed URL. */
export function assertLoopbackUrl(urlStr, label) {
  let u;
  try {
    u = new URL(urlStr);
  } catch {
    throw new Error(`invalid ${label} (not a parseable URL)`);
  }
  const host = u.hostname.replace(/^\[/, '').replace(/\]$/, '');
  if (!LOOPBACK_HOSTS.includes(host)) {
    throw new Error(
      `refusing non-loopback ${label} host "${u.hostname}"; this tool runs against a LOCAL ` +
        'dev target only. Allowed hosts: localhost, 127.0.0.1, ::1.',
    );
  }
  return u;
}

/** Throws unless the EFFECTIVE Postgres host (the one node-postgres resolves,
 *  ?host= override included) is loopback. Never echoes the raw value:
 *  DATABASE_URL carries credentials. Fails closed on an unparseable or
 *  hostless connection string. Returns the bare loopback host. */
export function assertLoopbackDatabaseUrl(raw, label = 'DATABASE_URL') {
  let dbHost;
  try {
    dbHost = String(parsePgTarget(raw ?? '').host ?? '').toLowerCase();
  } catch {
    throw new Error(`invalid ${label} (not a parseable connection string)`);
  }
  const bare = dbHost.replace(/^\[/, '').replace(/\]$/, '');
  if (!LOOPBACK_HOSTS.includes(bare)) {
    throw new Error(
      `refusing non-loopback ${label} host "${dbHost || '(none)'}"; this tool must only ever ` +
        'run against a disposable local dev database.',
    );
  }
  return bare;
}
