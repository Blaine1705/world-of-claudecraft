// World PvP: a spoiler-safe overview of the /pvp flag. Concepts only (opt-in,
// the flag and its countdown, who counts as an enemy, the stakes shape, the
// fair-play rules); no honor amounts, gold caps or tuning constants (guide
// spoiler policy). The Honor currency itself is explained once, on the arena
// page, which is the PvP hub.

import { esc } from '../../ui/esc';
import { t } from '../../ui/i18n';
import { hrefFor } from '../routes';
import type { GuidePage } from './types';
import { pageHeader, related, section } from './ui';

export const worldPvp: GuidePage = {
  titleKey: 'guide.nav.worldPvp',
  render() {
    return `
      <article class="guide-article guide-world-pvp">
        ${pageHeader('guide.worldPvpPage.heading', 'guide.worldPvpPage.intro')}
        ${section('guide.worldPvpPage.flagHeading', `<p>${esc(t('guide.worldPvpPage.flagBody'))}</p>`)}
        ${section('guide.worldPvpPage.stakesHeading', `<p>${esc(t('guide.worldPvpPage.stakesBody'))}</p>`)}
        ${section('guide.worldPvpPage.limitsHeading', `<p>${esc(t('guide.worldPvpPage.limitsBody'))}</p>`)}
        ${related([
          { href: hrefFor('arena'), key: 'guide.nav.arena' },
          { href: hrefFor('thornhollow-fields'), key: 'guide.nav.thornhollow' },
          { href: hrefFor('commands'), key: 'guide.nav.commands' },
        ])}
      </article>
    `;
  },
};
