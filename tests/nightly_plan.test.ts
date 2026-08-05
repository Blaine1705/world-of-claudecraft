import { describe, expect, it } from 'vitest';
import {
  buildTargets,
  NIGHTLY_ISSUE_LABEL,
  NIGHTLY_ISSUE_TITLE,
  pickActiveReleaseBranch,
  planNightlyReport,
  renderIssueBody,
  renderRecoveryComment,
  summarizeRunJobs,
} from '../scripts/lib/nightly_plan.mjs';

const RUN = {
  runUrl: 'https://github.com/levy-street/world-of-claudecraft/actions/runs/123',
  targets: ['main', 'release/v0.35.0'],
  timestamp: '2026-08-05T04:47:00.000Z',
} as const;

const FAILED = [
  {
    name: 'Nightly tests (release/v0.35.0)',
    conclusion: 'failure',
    html_url: 'https://github.com/levy-street/world-of-claudecraft/runs/1',
  },
] as const;

const openIssue = (number: number, extra: Record<string, unknown> = {}) => ({
  number,
  state: 'open',
  ...extra,
});

describe('pickActiveReleaseBranch', () => {
  it('picks the highest release/vX.Y.Z by semver, not by string order', () => {
    expect(
      pickActiveReleaseBranch([
        'release/v0.9.0',
        'release/v0.35.0',
        'release/v0.27.0',
        'release/v0.10.1',
      ]),
    ).toBe('release/v0.35.0');
    // String comparison would call v0.9.0 the highest here; semver must win.
    expect(pickActiveReleaseBranch(['release/v0.9.0', 'release/v0.10.0'])).toBe('release/v0.10.0');
  });

  it('accepts the unprefixed form and ignores names that do not parse', () => {
    expect(pickActiveReleaseBranch(['release/0.36.0', 'release/v0.35.0'])).toBe('release/0.36.0');
    expect(
      pickActiveReleaseBranch(['release/next', 'release/v1.2', 'main', 'feature/release/v9.9.9']),
    ).toBeNull();
    expect(pickActiveReleaseBranch([])).toBeNull();
  });
});

describe('buildTargets', () => {
  it('gates main plus the active release branch on a scheduled run', () => {
    expect(buildTargets({ inputRef: null, releaseBranch: 'release/v0.35.0' })).toEqual([
      'main',
      'release/v0.35.0',
    ]);
  });

  it('collapses to the default branch when no release branch resolves', () => {
    expect(buildTargets({ inputRef: null, releaseBranch: null })).toEqual(['main']);
    expect(buildTargets({ inputRef: '   ', releaseBranch: null })).toEqual(['main']);
  });

  it('lets a dispatch ref replace the whole list (the acceptance drill path)', () => {
    expect(
      buildTargets({ inputRef: 'scratch/broken-test', releaseBranch: 'release/v0.35.0' }),
    ).toEqual(['scratch/broken-test']);
  });

  it('never lists the default branch twice', () => {
    expect(buildTargets({ inputRef: null, releaseBranch: 'main' })).toEqual(['main']);
  });
});

describe('summarizeRunJobs', () => {
  it('judges only completed jobs, so the in-progress report job never counts', () => {
    const { completed, failed } = summarizeRunJobs([
      { name: 'Nightly tests (main)', status: 'completed', conclusion: 'success', html_url: 'u1' },
      { name: 'Report nightly verdict', status: 'in_progress', conclusion: null, html_url: 'u2' },
    ]);
    expect(completed.map((job) => job.name)).toEqual(['Nightly tests (main)']);
    expect(failed).toEqual([]);
  });

  it('counts every non-success, non-skipped, non-neutral conclusion as a failure', () => {
    const { failed } = summarizeRunJobs([
      { name: 'a', status: 'completed', conclusion: 'failure', html_url: '' },
      { name: 'b', status: 'completed', conclusion: 'cancelled', html_url: '' },
      { name: 'c', status: 'completed', conclusion: 'timed_out', html_url: '' },
      { name: 'd', status: 'completed', conclusion: 'action_required', html_url: '' },
      { name: 'e', status: 'completed', conclusion: 'success', html_url: '' },
      { name: 'f', status: 'completed', conclusion: 'skipped', html_url: '' },
      { name: 'g', status: 'completed', conclusion: 'neutral', html_url: '' },
    ]);
    expect(failed.map((job) => job.name)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('fails closed on a completed job with an unreadable conclusion', () => {
    const { failed } = summarizeRunJobs([
      { name: 'weird', status: 'completed', conclusion: null, html_url: '' },
    ]);
    expect(failed.map((job) => job.name)).toEqual(['weird']);
    expect(failed[0].conclusion).toBe('unknown');
  });
});

describe('planNightlyReport', () => {
  it('creates the labeled tracking issue on the first red run', () => {
    const plan = planNightlyReport({ ...RUN, failed: [...FAILED], openIssues: [] });
    expect(plan).toEqual({
      action: 'create',
      title: NIGHTLY_ISSUE_TITLE,
      body: renderIssueBody({ ...RUN, failed: [...FAILED] }),
      labels: [NIGHTLY_ISSUE_LABEL],
    });
    if (plan.action !== 'create') throw new Error('unreachable');
    expect(plan.body).toContain(RUN.runUrl);
    expect(plan.body).toContain('Nightly tests (release/v0.35.0): failure');
    expect(plan.body).toContain('Refs gated: main, release/v0.35.0');
  });

  it('updates the existing open issue on a repeat failure, never a second issue', () => {
    const plan = planNightlyReport({ ...RUN, failed: [...FAILED], openIssues: [openIssue(42)] });
    expect(plan.action).toBe('update');
    if (plan.action !== 'update') throw new Error('unreachable');
    expect(plan.issueNumber).toBe(42);
    expect(plan.comment).toContain('Still red');
    expect(plan.comment).toContain(RUN.runUrl);
  });

  it('keeps exactly one tracking issue even if duplicates exist: oldest wins, none created', () => {
    const plan = planNightlyReport({
      ...RUN,
      failed: [...FAILED],
      openIssues: [openIssue(50), openIssue(42)],
    });
    expect(plan.action).toBe('update');
    if (plan.action !== 'update') throw new Error('unreachable');
    expect(plan.issueNumber).toBe(42);
  });

  it('ignores pull requests and non-open entries from the issues listing', () => {
    const plan = planNightlyReport({
      ...RUN,
      failed: [...FAILED],
      openIssues: [
        openIssue(7, { pull_request: { url: 'x' } }),
        { number: 8, state: 'closed' },
        { state: 'open' },
      ],
    });
    expect(plan.action).toBe('create');
  });

  it('closes the issue with a recovery comment on the first green run', () => {
    const plan = planNightlyReport({ ...RUN, failed: [], openIssues: [openIssue(42)] });
    expect(plan).toEqual({
      action: 'close',
      issueNumber: 42,
      comment: renderRecoveryComment(RUN),
    });
    if (plan.action !== 'close') throw new Error('unreachable');
    expect(plan.comment).toContain('green again');
  });

  it('does nothing on a green run with no open tracking issue', () => {
    expect(planNightlyReport({ ...RUN, failed: [], openIssues: [] })).toEqual({
      action: 'none',
      reason: 'green run and no open tracking issue',
    });
  });

  it('says so in the body when ref resolution failed instead of guessing', () => {
    const plan = planNightlyReport({ ...RUN, targets: [], failed: [...FAILED], openIssues: [] });
    if (plan.action !== 'create') throw new Error('expected create');
    expect(plan.body).toContain('unknown (ref resolution failed)');
  });
});
