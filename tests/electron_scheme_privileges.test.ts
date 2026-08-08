import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const main = readFileSync(join(__dirname, '..', 'electron', 'main.cjs'), 'utf8');

// electron/main.cjs is the Electron entry and cannot run under vitest, so the
// app:// scheme registration is pinned as text (same rationale as the updater
// and gpu wiring pins). Every privilege here is load-bearing and fails soft
// when lost: standard gives the scheme real URL semantics (relative
// resolution, origins), secure marks it a secure context, supportFetchAPI
// lets the client fetch() its own assets, corsEnabled keeps cross-origin
// checks coherent, and codeCache enables the V8 compile cache for app://
// scripts (codeCache requires standard). A refactor that rebuilds the
// privileges object and silently drops one would not fail any runtime test,
// so the object is pinned key by key, and the key set is pinned exactly so a
// dangerous privilege (bypassCSP, allowServiceWorkers, stream) cannot ride in
// silently either.
describe('app:// scheme privileges pin (electron/main.cjs)', () => {
  it('registers privileged schemes exactly once', () => {
    // The privileges scan anchors on the app entry, but only inside the first
    // call; this count keeps a second registration from dodging that scan.
    const occurrences = main.split('protocol.registerSchemesAsPrivileged(').length - 1;
    expect(occurrences, 'expected exactly one registerSchemesAsPrivileged call').toBe(1);
  });

  it('carries standard, secure, supportFetchAPI, corsEnabled, and codeCache, and nothing else', () => {
    const start = main.indexOf('protocol.registerSchemesAsPrivileged(');
    expect(start, 'registerSchemesAsPrivileged call not found in main.cjs').toBeGreaterThan(-1);
    const end = main.indexOf(']);', start);
    expect(end, 'unterminated registerSchemesAsPrivileged call').toBeGreaterThan(start);
    const call = main.slice(start, end);
    // Anchor the privileges object to the app entry itself, not merely the
    // same call, so another scheme's privileges cannot satisfy the pin on
    // app's behalf; then drop comment lines so a commented-out privilege
    // reads as absent rather than present.
    const appEntry = /scheme: 'app',\s*privileges: \{([^}]*)\}/.exec(call);
    expect(appEntry, "no privileges object attached to scheme: 'app'").not.toBeNull();
    const body = (appEntry?.[1] ?? '')
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    const required = ['standard', 'secure', 'supportFetchAPI', 'corsEnabled', 'codeCache'];
    for (const privilege of required) {
      expect(body, `privilege ${privilege} must be explicitly true`).toContain(
        `${privilege}: true`,
      );
    }
    // Exact key-set equality doubles as the deny-list: adding any privilege
    // beyond these five must be a deliberate edit here, in the same change.
    const keys = [...body.matchAll(/([A-Za-z]+):/g)].map((match) => match[1]).sort();
    expect(keys, 'app scheme privileges must carry exactly the pinned keys').toEqual(
      [...required].sort(),
    );
  });
});
