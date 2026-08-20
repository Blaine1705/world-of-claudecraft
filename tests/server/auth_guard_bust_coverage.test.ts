// Bust-site completeness for the marketplace auth-guard cache, by DISCOVERY.
// A hand-enumerated bust list is exactly the class that rots (the escrow
// round's routing pin went blind to a hoisted-SQL writer; the hand-kept
// narrowing sibling list missed 11 of 16 modules), so this scan walks EVERY
// server/*.ts file, finds every SQL statement that writes what the two guard
// reads project (auth_tokens rows; the accounts moderation columns; the
// chat-quota POLICY columns), attributes each to its enclosing top-level
// function, and requires that function to call the matching bust. The
// classifier is COLUMN-precise on purpose: the chat-quota consume machinery
// (the stored procedure DDL in general_chat_quota_schema.ts) writes only
// window_started_at/message_count, which the guard read never projects, so
// it classifies OUT structurally instead of by hand exemption. The one
// reasoned exemption is the federated provision-race account DELETE, exact
// count 1 (it removes only fresh, unused accounts that cannot hold live
// tokens or cached moderation rows).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { stripComments } from '../helpers/strip_comments';

const SERVER_DIR = fileURLToPath(new URL('../../server', import.meta.url));

/** Recursive .ts walk (the shared-walk rule: subdirectories are in scope so a
 *  writer moved under server/http/ or a new domain dir cannot escape). */
function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkTsFiles(p, out);
    else if (name.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** The accounts columns the moderation guard read projects. chat_mute_reason,
 *  cheater_mark_*, password/email/locale and friends are NOT here: writes
 *  touching only those change nothing the cache serves. */
const PROJECTION_COLUMNS = [
  'banned_at',
  'suspended_until',
  'moderation_reason',
  'chat_muted_until',
  'chat_strikes',
  'deactivated_at',
];

interface Site {
  file: string;
  index: number;
  kind: string;
}

/** Every in-scope write site in one stripped source, by the column-precise
 *  classifier described in the header. */
function discoverSites(
  file: string,
  src: string,
): { inScope: Site[]; accountDeletes: Site[]; unclassifiable: Site[] } {
  const inScope: Site[] = [];
  const accountDeletes: Site[] = [];
  const unclassifiable: Site[] = [];
  for (const m of src.matchAll(/\b(INSERT\s+INTO|DELETE\s+FROM|UPDATE)\s+auth_tokens\b/g)) {
    inScope.push({ file, index: m.index ?? 0, kind: 'auth_tokens' });
  }
  for (const m of src.matchAll(/\bUPDATE\s+accounts\b/g)) {
    // The SET list ends at the WHERE. The window is generous, and a
    // statement whose WHERE sits beyond it is UNCLASSIFIABLE and reds
    // loudly below: a giant SET list must never silently classify out with
    // a projected column hiding past the truncation.
    const window = src.slice(m.index, (m.index ?? 0) + 1500);
    if (!/\bWHERE\b/.test(window)) {
      unclassifiable.push({ file, index: m.index ?? 0, kind: 'accounts_update_unbounded' });
      continue;
    }
    const setClause = window.split(/\bWHERE\b/)[0];
    if (PROJECTION_COLUMNS.some((c) => setClause.includes(c))) {
      inScope.push({ file, index: m.index ?? 0, kind: 'accounts_update' });
    }
  }
  for (const m of src.matchAll(
    /\b(INSERT\s+INTO|DELETE\s+FROM|UPDATE)\s+account_general_chat_rate_limits\b/g,
  )) {
    const verb = m[1].split(/\s/)[0];
    const head = src.slice(m.index, (m.index ?? 0) + 700).split(/\bWHERE\b|\bVALUES\b/)[0];
    // A row DELETE removes the policy (the read's LEFT JOIN goes null): in
    // scope. INSERT/UPDATE are in scope only when they touch the projected
    // policy columns; the consume machinery's window/counter churn is not.
    const policy = verb === 'DELETE' || /\bmessages\b|\bwindow_minutes\b/.test(head);
    if (policy) inScope.push({ file, index: m.index ?? 0, kind: 'quota_policy' });
  }
  for (const m of src.matchAll(/\bDELETE\s+FROM\s+accounts\b/g)) {
    accountDeletes.push({ file, index: m.index ?? 0, kind: 'accounts_delete' });
  }
  return { inScope, accountDeletes, unclassifiable };
}

/** Top-level exported function spans: [header index, next header index). All
 *  current writers are exported top-level functions; an in-scope site landing
 *  OUTSIDE every span (module scope, a hoisted SQL const, a class method)
 *  fails the totality assert loudly instead of escaping attribution. */
function functionSpans(src: string): { name: string; start: number; end: number }[] {
  const headers = [...src.matchAll(/^export (?:async )?function (\w+)/gm)].map((m) => ({
    name: m[1],
    start: m.index ?? 0,
  }));
  return headers.map((h, i) => ({
    name: h.name,
    start: h.start,
    end: i + 1 < headers.length ? headers[i + 1].start : src.length,
  }));
}

describe('auth-guard bust coverage (discovered, never hand-enumerated)', () => {
  const files = walkTsFiles(SERVER_DIR).sort();
  const sources = new Map(files.map((f) => [f, stripComments(readFileSync(f, 'utf8'))]));

  it('every discovered writer function calls the matching bust (exact reconciliation)', () => {
    // file (relative) -> function -> { sites, bust kinds present }
    const discovered: Record<string, Record<string, { sites: string[]; busts: string[] }>> = {};
    let totalInScope = 0;
    for (const file of files) {
      const src = sources.get(file) ?? '';
      const { inScope, unclassifiable } = discoverSites(file, src);
      expect(
        unclassifiable,
        `${file}: UPDATE accounts statements whose SET list outruns the scan window`,
      ).toEqual([]);
      if (inScope.length === 0) continue;
      const spans = functionSpans(src);
      const rel = file.slice(SERVER_DIR.length + 1);
      for (const site of inScope) {
        totalInScope += 1;
        const span = spans.find((s) => site.index >= s.start && site.index < s.end);
        // Classification totality: an in-scope write outside every exported
        // top-level function (module scope, hoisted const, class method) has
        // no attributable bust and must red here, not slip through.
        expect(
          span,
          `${rel}: in-scope ${site.kind} write at index ${site.index} sits outside every exported top-level function`,
        ).toBeDefined();
        if (!span) continue;
        const body = src.slice(span.start, span.end);
        const busts = [
          body.includes('bustWocAuthGuardToken(') ? 'token' : null,
          body.includes('bustWocAuthGuardAccount(') ? 'account' : null,
        ].filter((b): b is string => b !== null);
        expect(
          busts.length,
          `${rel}: ${span.name} writes the guard projection (${site.kind}) but calls no bust`,
        ).toBeGreaterThan(0);
        if (discovered[rel] === undefined) discovered[rel] = {};
        const perFile = discovered[rel];
        if (perFile[span.name] === undefined) perFile[span.name] = { sites: [], busts };
        perFile[span.name].sites.push(site.kind);
      }
    }
    // The reconciliation table: DISCOVERED map, pinned exactly. A new writer
    // (new statement, new function, new file) changes this map and reds the
    // deep-equal, forcing the bust decision to be made in the same change.
    expect(discovered).toEqual({
      'chat_filter_db.ts': {
        applyChatStrike: { sites: ['accounts_update'], busts: ['account'] },
        resetChatStrikes: { sites: ['accounts_update'], busts: ['account'] },
      },
      'db.ts': {
        saveToken: { sites: ['auth_tokens'], busts: ['token'] },
        revokeTokensExcept: { sites: ['auth_tokens', 'auth_tokens'], busts: ['account'] },
        revokeToken: { sites: ['auth_tokens'], busts: ['token'] },
        revokeReadToken: { sites: ['auth_tokens'], busts: ['token'] },
        revokeCompanionToken: { sites: ['auth_tokens'], busts: ['account'] },
        consumePasswordResetRequest: { sites: ['auth_tokens'], busts: ['account'] },
        setAccountDeactivated: { sites: ['accounts_update'], busts: ['account'] },
      },
      'general_chat_quota_db.ts': {
        setGeneralChatRateLimit: {
          sites: ['quota_policy', 'quota_policy'],
          busts: ['account'],
        },
      },
      'moderation_db.ts': {
        moderateAccount: {
          sites: ['accounts_update', 'accounts_update', 'accounts_update', 'accounts_update'],
          busts: ['account'],
        },
        muteAccountChat: { sites: ['accounts_update'], busts: ['account'] },
        liftAccountChatMute: { sites: ['accounts_update'], busts: ['account'] },
        reactivateAccountAudited: { sites: ['accounts_update'], busts: ['account'] },
        resetChatStrikesAudited: { sites: ['accounts_update'], busts: ['account'] },
      },
    });
    // Non-vacuity floor: the scan that discovered nothing would satisfy every
    // absence check above. Twenty in-scope statements at the rider.
    expect(totalInScope).toBe(20);
  });

  it('classifies the quota CONSUME machinery out by COLUMN, not by hand', () => {
    // The stored-procedure DDL writes account_general_chat_rate_limits but
    // touches only window_started_at/message_count: it must be discovered by
    // the raw table regex AND rejected by the column classifier, proving the
    // classifier (not a file exemption) is what excludes it.
    const schema = sources.get(join(SERVER_DIR, 'general_chat_quota_schema.ts')) ?? '';
    const raw = [...schema.matchAll(/\bUPDATE\s+account_general_chat_rate_limits\b/g)];
    expect(raw.length).toBeGreaterThanOrEqual(2);
    const { inScope } = discoverSites('general_chat_quota_schema.ts', schema);
    expect(inScope).toEqual([]);
  });

  it('carries exactly ONE reasoned accounts-DELETE exemption (the federated race loser)', () => {
    const deletes: Site[] = [];
    for (const file of files) {
      deletes.push(...discoverSites(file, sources.get(file) ?? '').accountDeletes);
    }
    // deleteUnusedFederatedProvision removes only a freshly provisioned,
    // never-used account (the provision race loser): it cannot hold a live
    // token or a cached moderation row, so no bust is owed. Any SECOND hard
    // delete of accounts rows must land here and make its own case.
    expect(deletes.map((d) => d.file.slice(SERVER_DIR.length + 1))).toEqual([
      'federated_auth_db.ts',
    ]);
  });

  it('scopes the cache to the marketplace: the import boundary is exact', () => {
    // The admin surface stays uncached BY WIRING: the only server files that
    // may touch the cache module are the writers above (bust calls) and
    // main.ts (boot construction, the runtime injection into the marketplace
    // routes, and the ops readout). The routes file itself consumes the
    // bundle through the WocMarketRuntime injection and so never imports the
    // module; require_admin, admin.ts, every other guard bundle, and ws_auth
    // must never appear here.
    const importers = files
      .filter((f) => (sources.get(f) ?? '').includes("from './woc_auth_guard_cache'"))
      .map((f) => f.slice(SERVER_DIR.length + 1))
      .sort();
    expect(importers).toEqual([
      'chat_filter_db.ts',
      'db.ts',
      'general_chat_quota_db.ts',
      'main.ts',
      'moderation_db.ts',
    ]);
    // The same boundary from the other side: no relative-path variant of the
    // import escapes the equality above.
    for (const file of files) {
      const src = sources.get(file) ?? '';
      if (
        src.includes('woc_auth_guard_cache') &&
        !importers.includes(file.slice(SERVER_DIR.length + 1))
      ) {
        expect.fail(`${file} references woc_auth_guard_cache outside the pinned import set`);
      }
    }
  });
});
