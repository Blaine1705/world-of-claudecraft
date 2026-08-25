import { describe, expect, it } from 'vitest';
import { resolveEntryTimeouts } from '../scripts/lib/pr_shot_entry_opts.mjs';

// The raise-only escape-hatch rule behind scripts/pr_screenshots.mjs's
// ENTRY_OPTS: NAV_TIMEOUT_MS lifts every wait together, and
// ENTRY_SELECTOR_TIMEOUT_MS can raise the class-card wait past even that,
// but never sink it under the page-load budget it must outlast.
describe('pr_screenshots entry-timeout resolution', () => {
  it('defaults both waits to the 60s CI behavior', () => {
    expect(resolveEntryTimeouts({})).toEqual({
      navTimeoutMs: 60000,
      selectorTimeoutMs: 60000,
    });
  });

  it('an ENTRY_SELECTOR_TIMEOUT_MS override above the nav ceiling wins', () => {
    expect(resolveEntryTimeouts({ ENTRY_SELECTOR_TIMEOUT_MS: '90000' })).toEqual({
      navTimeoutMs: 60000,
      selectorTimeoutMs: 90000,
    });
  });

  it('an override below the nav ceiling is ignored (raise-only)', () => {
    expect(resolveEntryTimeouts({ ENTRY_SELECTOR_TIMEOUT_MS: '5000' })).toEqual({
      navTimeoutMs: 60000,
      selectorTimeoutMs: 60000,
    });
  });

  it('NAV_TIMEOUT_MS lifts both waits together', () => {
    expect(resolveEntryTimeouts({ NAV_TIMEOUT_MS: '120000' })).toEqual({
      navTimeoutMs: 120000,
      selectorTimeoutMs: 120000,
    });
  });
});
