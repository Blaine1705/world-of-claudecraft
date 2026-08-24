// The guild-signpost popup: a small centered card listing a noticeboard's
// posted notices, opened by the HUD's 'listings' noticeboard event arm and
// closed by its one button. Guild names and notes are world data spliced
// verbatim (the player-name rule); only the title, the stat and status
// labels, and the close label localize. Server-filled guild-board rows
// (server/noticeboard_guilds.ts) carry the optional NoticeboardListing
// fields and render ranked with the shared .guild-tier-N colour, member and
// lifetime-XP stats, and the pledge recruiting status; authored rows omit
// them and keep the bare guild-plus-note card. The card reuses the tutorial
// card family's chrome (styles/hud.css .tut-card + the .nb-* extensions)
// rather than the .window machinery: it is transient feedback, not a managed
// HUD window, so it owns no focus trap, no ESC arbitration, and no z-order
// entanglement with the window stack. That reasoning also decides its a11y
// role: role="status" like the coach card, announced on open and dismissable
// in passing, NOT a role="dialog" (a dialog promises focus capture, an
// Escape route, and a managed close, none of which a transient card
// provides; PR #3467 review, finding 10). If the posting system later makes
// this interactive, adopt the full markDialogRoot recipe instead of widening
// this.

import { guildTierForLifetimeXp } from '../sim/guild_tier';
import type { NoticeboardListing } from '../sim/types';
import { formatNumber, t, tPlural } from './i18n';

export class NoticeboardPopup {
  private root: HTMLElement | null = null;
  private listings: readonly NoticeboardListing[] = [];

  show(listings: readonly NoticeboardListing[]): void {
    this.listings = listings;
    this.hide();
    const ui = document.getElementById('ui');
    if (!ui) return;

    const root = document.createElement('div');
    root.className = 'tut-card nb-popup';
    root.setAttribute('role', 'status');

    const title = document.createElement('div');
    title.className = 'tut-title';
    title.id = 'nb-popup-title';
    title.textContent = t('hudChrome.noticeboard.popupTitle');
    root.appendChild(title);

    const list = document.createElement('div');
    list.className = 'nb-list';
    listings.forEach((listing, index) => {
      const item = document.createElement('div');
      item.className = 'nb-item';

      const head = document.createElement('div');
      head.className = 'nb-head';
      const ranked = listing.lifetimeXp !== undefined;
      if (ranked) {
        // Rank follows the guild board's lifetime-XP order the server sent.
        const rank = document.createElement('span');
        rank.className = 'nb-rank';
        rank.textContent = formatNumber(index + 1, { maximumFractionDigits: 0 });
        head.appendChild(rank);
      }
      const guild = document.createElement('span');
      guild.className = ranked
        ? `nb-guild guild-tier-${guildTierForLifetimeXp(listing.lifetimeXp ?? 0)}`
        : 'nb-guild';
      guild.textContent = listing.guild;
      head.appendChild(guild);
      if (listing.pledgesOpen !== undefined) {
        const status = document.createElement('span');
        status.className = listing.pledgesOpen ? 'nb-status open' : 'nb-status closed';
        status.textContent = listing.pledgesOpen
          ? t('hudChrome.pledge.open')
          : t('hudChrome.pledge.closed');
        head.appendChild(status);
        if (listing.pledgesOpen && (listing.pledgeMinLevel ?? 1) > 1) {
          const floor = document.createElement('span');
          floor.className = 'nb-status floor';
          floor.textContent = t('hudChrome.pledge.minLevel', {
            level: formatNumber(listing.pledgeMinLevel ?? 1, { maximumFractionDigits: 0 }),
          });
          head.appendChild(floor);
        }
      }
      item.appendChild(head);

      if (ranked && listing.members !== undefined) {
        const stats = document.createElement('div');
        stats.className = 'nb-stats';
        stats.textContent = tPlural('hudChrome.plurals.noticeboardGuildStats', listing.members, {
          count: formatNumber(listing.members, { maximumFractionDigits: 0 }),
          xp: formatNumber(listing.lifetimeXp ?? 0, { maximumFractionDigits: 0 }),
        });
        item.appendChild(stats);
      }

      if (listing.note !== '') {
        const note = document.createElement('div');
        note.className = 'nb-note';
        note.textContent = listing.note;
        item.appendChild(note);
      }
      list.appendChild(item);
    });
    root.appendChild(list);

    const close = document.createElement('button');
    close.className = 'tut-skip';
    close.type = 'button';
    close.textContent = t('hudChrome.noticeboard.close');
    close.addEventListener('click', () => this.hide());
    root.appendChild(close);

    ui.appendChild(root);
    this.root = root;
  }

  hide(): void {
    this.root?.remove();
    this.root = null;
  }

  /** Re-localize after an in-game language switch (the Hud's
   *  woc:languagechange fan-out): repaint the open card's chrome strings. */
  relocalize(): void {
    if (this.root) this.show(this.listings);
  }
}
