import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureLocaleLoaded, setLanguage } from '../src/ui/i18n';
import { chatPlayerContextActions, selfPlayerContextActions } from '../src/ui/player_context_menu';

describe('chat player context menu', () => {
  afterEach(() => setLanguage('en'));

  it('offers social and report actions from chat names without live-only actions', () => {
    const actions = chatPlayerContextActions(state({ canGuildInvite: true }));

    expect(actions.map((a) => a.id)).toEqual([
      'info',
      'whisper',
      'invite',
      'friend',
      'ginvite',
      'ignore',
      'block',
      'report',
      'close',
    ]);
    // trade and duel need a live entity in range, so they stay on the world menu
    expect(actions.map((a) => a.id)).not.toContain('trade');
    expect(actions.map((a) => a.id)).not.toContain('duel');
  });

  it('does not allow reporting yourself from chat, but still offers Player Info', () => {
    const actions = chatPlayerContextActions(state({ playerName: 'Adventurer' }));

    expect(actions.map((a) => a.id)).not.toContain('report');
    expect(actions.map((a) => a.id)).not.toContain('ignore');
    expect(actions.map((a) => a.id)).not.toContain('block');
    expect(actions.map((a) => a.id)).toEqual(['info', 'close']);
  });

  // Ignore and block are two DIFFERENT tiers, and the menu must never conflate them:
  // ignore is chat-only, block also kills invites/whispers/mail/who. Each toggles its
  // own label independently of the other.
  it('toggles the ignore label without touching the block label', () => {
    const muted = chatPlayerContextActions(state({ ignored: true }));
    expect(muted.find((a) => a.id === 'ignore')?.label).toBe('Unignore');
    expect(muted.find((a) => a.id === 'block')?.label).toBe('Block');

    const unmuted = chatPlayerContextActions(state({ ignored: false }));
    expect(unmuted.find((a) => a.id === 'ignore')?.label).toBe('Ignore');
  });

  it('toggles the block label without touching the ignore label', () => {
    const blocked = chatPlayerContextActions(state({ blocked: true }));
    expect(blocked.find((a) => a.id === 'block')?.label).toBe('Unblock');
    expect(blocked.find((a) => a.id === 'ignore')?.label).toBe('Ignore');

    const unblocked = chatPlayerContextActions(state({ blocked: false }));
    expect(unblocked.find((a) => a.id === 'block')?.label).toBe('Block');
  });

  it('offers an ignore but no block offline: blocking needs an account and a server', () => {
    const actions = chatPlayerContextActions(state({ online: false }));

    expect(actions.map((a) => a.id)).toContain('ignore');
    expect(actions.map((a) => a.id)).not.toContain('block');
    // friending is server-side too
    expect(actions.map((a) => a.id)).not.toContain('friend');
  });

  it('offers Player Info even when the player is nowhere near you', () => {
    // The menu carries no proximity input at all any more: out of interest scope the
    // Hud falls back to the public character sheet, so the row is always present.
    expect(chatPlayerContextActions(state()).map((a) => a.id)).toContain('info');
    expect(chatPlayerContextActions(state({ online: false })).map((a) => a.id)).toContain('info');
  });

  // An official streamer's channels are the reason a player opens the menu on a
  // broadcaster's name, so they lead, above Player Info. Both menus (the chat-name
  // one and the nameplate/unit-frame one) build them from the same
  // streamerMenuActions, so the two can never disagree.
  it('puts the stream links above Player Info, in platform order', () => {
    const actions = chatPlayerContextActions(state({ streamerLinks: ALL_LINKS }));

    expect(actions.map((a) => a.id)).toEqual([
      'stream-twitch',
      'stream-x',
      'stream-kick',
      'stream-youtube',
      'info',
      'whisper',
      'invite',
      'friend',
      'ignore',
      'block',
      'report',
      'close',
    ]);
  });

  it('renders only the platforms that are actually present', () => {
    const actions = chatPlayerContextActions(
      state({ streamerLinks: { youtube: 'https://youtu.be/abc', x: 'https://x.com/woc' } }),
    );
    const streamIds = actions.map((a) => a.id).filter((id) => id.startsWith('stream-'));

    // present-only, and still in the platform render order (x before youtube)
    expect(streamIds).toEqual(['stream-x', 'stream-youtube']);
  });

  it('adds no stream rows at all for a player with no links', () => {
    expect(chatPlayerContextActions(state()).map((a) => a.id)).toEqual([
      'info',
      'whisper',
      'invite',
      'friend',
      'ignore',
      'block',
      'report',
      'close',
    ]);
    expect(chatPlayerContextActions(state({ streamerLinks: {} }))).not.toContainEqual(
      expect.objectContaining({ id: 'stream-twitch' }),
    );
  });

  // A streamer looking at their OWN name still gets their links: they are not a
  // social action taken on someone else, so they sit outside the samePlayer guard.
  it('offers the stream links on your own name', () => {
    const actions = chatPlayerContextActions(
      state({ playerName: 'Adventurer', streamerLinks: ALL_LINKS }),
    );

    expect(actions.map((a) => a.id)).toEqual([
      'stream-twitch',
      'stream-x',
      'stream-kick',
      'stream-youtube',
      'info',
      'close',
    ]);
  });

  // The render-side security gate. A link that is not a plain https URL on that
  // platform's own host never becomes a row, so it can never reach window.open.
  it('drops a hostile or off-host link instead of rendering it', () => {
    const actions = chatPlayerContextActions(
      state({
        streamerLinks: {
          twitch: 'javascript:alert(1)',
          x: 'https://x.com.evil.example/woc',
          kick: 'http://kick.com/woc',
          youtube: 'https://www.youtube.com/@woc',
        },
      }),
    );
    const streamIds = actions.map((a) => a.id).filter((id) => id.startsWith('stream-'));

    expect(streamIds).toEqual(['stream-youtube']);
  });

  it('carries the brand icon and the normalized href on each stream row', () => {
    const rows = streamerMenuActions(ALL_LINKS);

    expect(rows.map((r) => r.icon)).toEqual(['twitch', 'x', 'kick', 'youtube']);
    expect(rows.map((r) => r.href)).toEqual([
      'https://twitch.tv/woc',
      'https://x.com/woc',
      'https://kick.com/woc',
      'https://www.youtube.com/@woc',
    ]);
    expect(rows.map((r) => r.label)).toEqual([
      'Watch on Twitch',
      'View on X',
      'Watch on Kick',
      'Watch on YouTube',
    ]);
  });

  // The id -> platform mapping the Hud re-validates the URL against at click time.
  it('maps a stream row back to its platform, and nothing else', () => {
    expect(streamerActionPlatform('stream-twitch')).toBe('twitch');
    expect(streamerActionPlatform('stream-x')).toBe('x');
    expect(streamerActionPlatform('stream-kick')).toBe('kick');
    expect(streamerActionPlatform('stream-youtube')).toBe('youtube');
    expect(streamerActionPlatform('report')).toBeNull();
    expect(streamerActionPlatform('close')).toBeNull();
  });

  it('localizes chat context action labels', async () => {
    // Lazy locale flip: await the locale chunk so the synchronous t() label reads resolve
    // German rather than the English fallback (the bootstrap awaits the same way before paint).
    await ensureLocaleLoaded('de_DE');
    setLanguage('de_DE');
    const actions = chatPlayerContextActions(state());

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
