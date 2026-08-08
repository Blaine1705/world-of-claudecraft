// Mounts and riding: what a mount does, how you learn to ride, how reins work as
// items, what puts you back on your feet, the speed tiers, the stables race, and
// mounts as tradable goods. All curated guide prose, no generated roster: the wiki
// content generator emits no mount data yet, and a hand-typed table of every mount
// would drift the next time one lands (and would advertise the two catalog mounts
// that have no player-facing acquisition path today). Spoiler-safe: no move-speed
// percentages, no drop rates, no per-boss mount tables, no race time budget.

import { formatNumber } from '../../ui/i18n';
import { hrefFor } from '../routes';
import type { GuidePage } from './types';
import { callout, p, pageHeader, paras, related, section } from './ui';

// Mirrors MOUNT_TRAIN_MIN_LEVEL in src/sim/mounts_training.ts. Copied rather than
// imported: that module pulls src/sim/data (the whole content graph) into the guide
// bundle for one integer. It is a plain player-facing gate, told to you in game.
const RIDING_MIN_LEVEL = 20;

export const mounts: GuidePage = {
  titleKey: 'guide.nav.mounts',
  render() {
    const level = formatNumber(RIDING_MIN_LEVEL);
    return `
      <article class="guide-article guide-mounts">
        ${pageHeader('guide.mountsPage.heading', 'guide.mountsPage.intro')}
        ${section('guide.mountsPage.whatHeading', p('guide.mountsPage.whatBody'))}
        ${section(
          'guide.mountsPage.learnHeading',
          paras('guide.mountsPage.learnBody', { level }) +
            callout(p('guide.mountsPage.whereBody'), {
              variant: 'note',
              titleKey: 'guide.mountsPage.whereHeading',
            }),
        )}
        ${section('guide.mountsPage.firstHeading', p('guide.mountsPage.firstBody'))}
        ${section('guide.mountsPage.rideHeading', paras('guide.mountsPage.rideBody'))}
        ${section('guide.mountsPage.breaksHeading', paras('guide.mountsPage.breaksBody'))}
        ${section('guide.mountsPage.speedHeading', p('guide.mountsPage.speedBody'))}
        ${section('guide.mountsPage.collectHeading', p('guide.mountsPage.collectBody'))}
        ${section('guide.mountsPage.raceHeading', paras('guide.mountsPage.raceBody'))}
        ${section('guide.mountsPage.goodsHeading', p('guide.mountsPage.goodsBody'))}
        ${related([
          { href: hrefFor('world'), key: 'guide.nav.world' },
          { href: hrefFor('economy'), key: 'guide.nav.economy' },
          { href: hrefFor('gear'), key: 'guide.nav.gear' },
          { href: hrefFor('reference/controls'), key: 'guide.nav.controls' },
        ])}
      </article>`;
  },
};
