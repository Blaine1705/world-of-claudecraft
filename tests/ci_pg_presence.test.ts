// The runtime half of the real-SQL merge bar (ruling R16, recorded in the
// woc-marketplace hardening state). Every pg integration suite gates on
// TEST_DATABASE_URL and SKIPS GREEN without it, so losing the CI service
// wiring would silently drop hundreds of money and security tests while
// every check stayed green. tests/ci_workflow.test.ts pins the wiring's
// SOURCE per job span; this suite is the live assertion the source pin
// cannot be: inside GitHub Actions it demands the variable EXIST. Coverage
// mechanism, stated precisely: the variable is workflow-static, so losing
// it REQUIRES a .github/ (or config) diff, and exactly those diffs force
// the selective gate into FULL mode, where this suite always runs; nightly
// re-proves it daily on every tracked ref. A workflow edit, job rename, or
// service relocation therefore cannot re-skip the battery without this
// suite going red on its own PR. Local runs stay free: without the
// variable the pg suites are documented dev-optional (tests/CLAUDE.md,
// "Opt-in DB gates").
import { describe, expect, it } from 'vitest';

describe('ci real-sql presence', () => {
  it('GitHub Actions runs of this suite always carry TEST_DATABASE_URL', () => {
    if (process.env.GITHUB_ACTIONS !== 'true') return;
    expect(
      process.env.TEST_DATABASE_URL,
      'the pg suites are skipping green in CI: the per-leg Postgres service or its ' +
        'job-level TEST_DATABASE_URL is gone from this job (see tests/ci_workflow.test.ts)',
    ).toBeTruthy();
  });
});
