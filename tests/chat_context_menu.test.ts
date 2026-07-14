import { afterEach, describe, expect, it } from 'vitest';
import { ensureLocaleLoaded, setLanguage } from '../src/ui/i18n';
import { chatPlayerContextActions, selfPlayerContextActions } from '../src/ui/player_context_menu';

describe('chat player context menu', () => {
  afterEach(() => setLanguage('en'));

  it('offers social and report actions from chat names without live-only actions', () => {
    const actions = chatPlayerContextActions({
      playerName: 'Badmage',
      selfName: 'Adventurer',
      online: true,
      isFriend: false,
      ignored: false,
      canGuildInvite: true,
      alreadyGuilded: false,
      canReport: true,
    });

    expect(actions.map((a) => a.id)).toEqual([
      'whisper',
      'invite',
      'friend',
      'ginvite',
      'ignore',
      'report',
      'close',
    ]);
    expect(actions.map((a) => a.id)).not.toContain('trade');
    expect(actions.map((a) => a.id)).not.toContain('duel');
  });

  it('does not allow reporting yourself from chat', () => {
    const actions = chatPlayerContextActions({
      playerName: 'Adventurer',
      selfName: 'Adventurer',
      online: true,
      isFriend: false,
      ignored: false,
      canGuildInvite: false,
      alreadyGuilded: false,
      canReport: true,
    });

    expect(actions.map((a) => a.id)).not.toContain('report');
  });

  it('localizes chat context action labels', async () => {
    // Lazy locale flip: await the locale chunk so the synchronous t() label reads resolve
    // German rather than the English fallback (the bootstrap awaits the same way before paint).
    await ensureLocaleLoaded('de_DE');
    setLanguage('de_DE');
    const actions = chatPlayerContextActions({
      playerName: 'Badmage',
      selfName: 'Adventurer',
      online: true,
      isFriend: false,
      ignored: false,
      canGuildInvite: false,
      alreadyGuilded: false,
      canReport: true,
    });

    expect(actions.find((a) => a.id === 'whisper')?.label).toBe('Flüstern');
    expect(actions.find((a) => a.id === 'report')?.label).toBe('Spieler melden');
  });
});

describe('self player context menu', () => {
  it('offers Leave Party from the player portrait only while grouped', () => {
    expect(
      selfPlayerContextActions({
        inParty: true,
        isLeader: false,
        isRaid: false,
        partySize: 3,
        isHeroic: false,
      }).map((action) => action.id),
    ).toEqual(['loot-settings', 'leave-party', 'close']);

    expect(
      selfPlayerContextActions({
        inParty: false,
        isLeader: false,
        isRaid: false,
        partySize: 1,
        isHeroic: false,
      }).map((action) => action.id),
    ).not.toContain('leave-party');
  });
});
