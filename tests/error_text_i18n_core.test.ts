// The hud error-text matcher, driven directly as the pure function it now is
// (src/ui/error_text_i18n_core.ts). Hud used to own this table as a private
// method, so every arm could only be reached through a full HUD rig; the deps bag
// here is the whole of the live state it still needs, which is what makes the
// lockout arms and the fall-through chain assertable in isolation.
import { describe, expect, it } from 'vitest';
import { type ErrorTextLockoutDeps, localizeErrorText } from '../src/ui/error_text_i18n_core';
import type { RaidLockout } from '../src/ui/raid_lockout';
import { localizeServerText } from '../src/ui/server_i18n';
import { localizeSimText } from '../src/ui/sim_i18n';

// A deps bag whose formatter returns a recognizable sentinel, so an arm that
// silently formatted the countdown some other way fails instead of matching.
function deps(lockouts: RaidLockout[] = []): ErrorTextLockoutDeps {
  return {
    raidLockouts: () => lockouts,
    formatLockoutDuration: (ms) => `<${ms}ms>`,
  };
}

describe('localizeErrorText', () => {
  it('localizes the general-chat quota denial with the formatted retry seconds', () => {
    expect(localizeErrorText('General chat limit reached. Try again in 3 seconds.', deps())).toBe(
      'General chat limit reached. Try again in 3 seconds.',
    );
    // The seconds run through formatDuration, so a plural/singular change in the
    // sim's English does not have to be mirrored here byte for byte.
    expect(localizeErrorText('General chat limit reached. Try again in 1 seconds.', deps())).toBe(
      'General chat limit reached. Try again in 1 second.',
    );
    // Anchored on a positive integer, so a zero never reaches the quota arm. The
    // two null checks are what make this decisive: the English it returns is the
    // input byte for byte, so only proving no other table claims it separates a
    // deliberate fall-through from an accidental match.
    const zero = 'General chat limit reached. Try again in 0 seconds.';
    expect(localizeServerText(zero)).toBeNull();
    expect(localizeSimText(zero)).toBeNull();
    expect(localizeErrorText(zero, deps())).toBe(zero);
  });

  it('maps the two exact chat-quota rows to their own keys', () => {
    expect(
      localizeErrorText('General chat is temporarily unavailable. Try again shortly.', deps()),
    ).toBe('General chat is temporarily unavailable. Try again shortly.');
    expect(
      localizeErrorText(
        'Your previous General chat message is still sending. Try again in a moment.',
        deps(),
      ),
    ).toBe('Your previous General chat message is still sending. Try again in a moment.');
  });

  it('enriches a raid lockout with the live countdown from the deps bag', () => {
    const withLock = deps([{ id: 'nythraxis_boss_arena', msRemaining: 90_000 }]);

    expect(localizeErrorText('You are locked to Nythraxis Raid Arena.', withLock)).toBe(
      'You are locked to Nythraxis Raid Arena. Unlocks in <90000ms>.',
    );
  });

  it('resolves the heroic lockout name and countdown from the matching lockout id', () => {
    const heroic = deps([{ id: 'gravewyrm_sanctum:heroic', msRemaining: 3_600_000 }]);

    expect(localizeErrorText('You are locked to Heroic Gravewyrm Sanctum.', heroic)).toBe(
      'You are locked to Heroic Gravewyrm Sanctum. Unlocks in <3600000ms>.',
    );
    // No mirrored lockout (an unrelated raid is locked): the countdown-free
    // heroic message, never a toast with a blank or wrong time.
    expect(
      localizeErrorText(
        'You are locked to Heroic Gravewyrm Sanctum.',
        deps([{ id: 'nythraxis_boss_arena', msRemaining: 90_000 }]),
      ),
    ).toBe('You are locked to Heroic Gravewyrm Sanctum.');
  });

  it('falls through to the base sim matcher once the raid lockout has cleared', () => {
    const cleared = localizeErrorText('You are locked to Nythraxis Raid Arena.', deps());

    expect(cleared).toBe(localizeSimText('You are locked to Nythraxis Raid Arena.'));
    expect(cleared).not.toBeNull();
    expect(cleared).not.toContain('Unlocks in');
  });

  it('falls through to localizeServerText, then localizeSimText, then the input', () => {
    const serverText = 'Mira added to friends.';
    expect(localizeServerText(serverText)).not.toBeNull();
    expect(localizeErrorText(serverText, deps())).toBe(localizeServerText(serverText));

    const simText = 'You are locked to Nythraxis Raid Arena.';
    expect(localizeServerText(simText)).toBeNull();
    expect(localizeSimText(simText)).not.toBeNull();
    expect(localizeErrorText(simText, deps())).toBe(localizeSimText(simText));

    const unmatched = 'Nothing in any table recognizes this line.';
    expect(localizeServerText(unmatched)).toBeNull();
    expect(localizeSimText(unmatched)).toBeNull();
    expect(localizeErrorText(unmatched, deps())).toBe(unmatched);
  });
});
