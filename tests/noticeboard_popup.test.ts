// @vitest-environment happy-dom
//
// The guild-signpost popup's two renders: a server-filled guild-board row
// (rank, shared .guild-tier-N colour class, member/XP stats, recruiting
// status chips) and a bare authored row, which must keep the original
// guild-plus-note card with none of the board chrome.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { guildTierForLifetimeXp } from '../src/sim/guild_tier';
import type { NoticeboardListing } from '../src/sim/types';
import { NoticeboardPopup } from '../src/ui/noticeboard_popup';

describe('NoticeboardPopup', () => {
  let popup: NoticeboardPopup;

  beforeEach(() => {
    document.body.innerHTML = '<div id="ui"></div>';
    popup = new NoticeboardPopup();
  });

  afterEach(() => {
    popup.hide();
    document.body.innerHTML = '';
  });

  function show(listings: NoticeboardListing[]): HTMLElement {
    popup.show(listings);
    const root = document.querySelector('.nb-popup');
    expect(root).not.toBeNull();
    return root as HTMLElement;
  }

  it('renders a guild-board row ranked, tier-coloured, with stats and an open status', () => {
    // Arrange
    const listing: NoticeboardListing = {
      guild: 'Stormcallers',
      note: 'chill, invites open',
      lifetimeXp: 2_500_000,
      members: 12,
      pledgesOpen: true,
      pledgeMinLevel: 10,
    };

    // Act
    const root = show([listing]);

    // Assert
    const item = root.querySelector('.nb-item') as HTMLElement;
    expect(item.querySelector('.nb-rank')?.textContent).toBe('1');
    const guild = item.querySelector('.nb-guild') as HTMLElement;
    expect(guild.textContent).toBe('Stormcallers');
    expect(guild.classList.contains(`guild-tier-${guildTierForLifetimeXp(2_500_000)}`)).toBe(true);
    expect(item.querySelector('.nb-status.open')?.textContent).toBe('Accepting pledges');
    expect(item.querySelector('.nb-status.floor')?.textContent).toBe('Level 10+');
    expect(item.querySelector('.nb-stats')?.textContent).toContain('12 members');
    expect(item.querySelector('.nb-stats')?.textContent).toContain('lifetime XP');
    expect(item.querySelector('.nb-note')?.textContent).toBe('chill, invites open');
  });

  it('renders a closed guild with no level floor chip and skips an empty note', () => {
    // Arrange
    const listing: NoticeboardListing = {
      guild: 'Gatekept',
      note: '',
      lifetimeXp: 50,
      members: 1,
      pledgesOpen: false,
    };

    // Act
    const root = show([listing]);

    // Assert
    const item = root.querySelector('.nb-item') as HTMLElement;
    expect(item.querySelector('.nb-status.closed')?.textContent).toBe('Not accepting pledges');
    expect(item.querySelector('.nb-status.floor')).toBeNull();
    expect(item.querySelector('.nb-stats')?.textContent).toContain('1 member,');
    expect(item.querySelector('.nb-note')).toBeNull();
  });

  it('keeps an authored row as the bare guild-plus-note card with no board chrome', () => {
    // Arrange
    const listing: NoticeboardListing = { guild: 'Authored', note: 'hand-written call' };

    // Act
    const root = show([listing]);

    // Assert
    const item = root.querySelector('.nb-item') as HTMLElement;
    expect(item.querySelector('.nb-guild')?.textContent).toBe('Authored');
    expect((item.querySelector('.nb-guild') as HTMLElement).className).toBe('nb-guild');
    expect(item.querySelector('.nb-rank')).toBeNull();
    expect(item.querySelector('.nb-status')).toBeNull();
    expect(item.querySelector('.nb-stats')).toBeNull();
    expect(item.querySelector('.nb-note')?.textContent).toBe('hand-written call');
  });

  it('numbers the rows in board order', () => {
    // Arrange
    const rows: NoticeboardListing[] = [
      { guild: 'First', note: '', lifetimeXp: 200, members: 2, pledgesOpen: true },
      { guild: 'Second', note: '', lifetimeXp: 100, members: 2, pledgesOpen: true },
    ];

    // Act
    const root = show(rows);

    // Assert
    const ranks = [...root.querySelectorAll('.nb-rank')].map((el) => el.textContent);
    expect(ranks).toEqual(['1', '2']);
  });
});
