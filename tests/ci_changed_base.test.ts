import { describe, expect, it } from 'vitest';
import { resolveChangedBaseRef } from '../scripts/lib/ci_changed_base.mjs';

describe('resolveChangedBaseRef', () => {
  it('uses the branch upstream tracking ref when one is set', () => {
    const ref = resolveChangedBaseRef({
      execGit: () => 'upstream/release/v0.35.0\n',
    });
    expect(ref).toBe('upstream/release/v0.35.0');
  });

  it('falls back to origin/main when git reports no upstream (detached or untracked)', () => {
    const ref = resolveChangedBaseRef({
      execGit: () => {
        throw new Error('fatal: no upstream configured for branch');
      },
    });
    expect(ref).toBe('origin/main');
  });

  it('falls back when git echoes the literal placeholder for a missing upstream', () => {
    // Some git versions print the raw `@{upstream}` token instead of throwing.
    const ref = resolveChangedBaseRef({
      execGit: () => '@{upstream}\n',
    });
    expect(ref).toBe('origin/main');
  });

  it('honors a caller-supplied fallback instead of the default', () => {
    const ref = resolveChangedBaseRef(
      {
        execGit: () => {
          throw new Error('no upstream');
        },
      },
      'origin/release/v0.35.0',
    );
    expect(ref).toBe('origin/release/v0.35.0');
  });

  it('trims trailing whitespace from a real upstream ref', () => {
    const ref = resolveChangedBaseRef({
      execGit: () => '  origin/release/v0.34.0  \n',
    });
    expect(ref).toBe('origin/release/v0.34.0');
  });
});
