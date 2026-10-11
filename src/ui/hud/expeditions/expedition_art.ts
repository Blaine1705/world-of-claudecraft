import { FINDER_ACTIVITIES } from '../../../sim/content/dungeon_finder';
import { classIconUrl } from '../../class_icon_art';
import { esc } from '../../esc';
import { svgIcon } from '../../ui_icons';

/** Reuse shipped illustrations and encounter portraits, with no remote asset requests. */
export function expeditionImageUrl(dungeonId: string): string {
  if (dungeonId === 'hollow_crypt') return '/textures/loading/hollow-crypt-empty.webp';
  const encounter = FINDER_ACTIVITIES.find(
    (activity) => activity.dungeonId === dungeonId,
  )?.encounters.find((entry) => entry.final);
  return encounter ? `/ui/dungeons/${encounter.mobId}.webp` : '/ui/chrome/dfinder.webp';
}

export function expeditionHero(dungeonId: string, title: string, subtitle: string): string {
  return `<div class="expedition-hero"><img class="expedition-hero-art" src="${esc(expeditionImageUrl(dungeonId))}" alt="" decoding="async" draggable="false"><div class="expedition-hero-shade"></div><div class="expedition-hero-copy"><p>${subtitle}</p><h3>${title}</h3></div></div>`;
}

export function expeditionClassEmblem(cls: string): string {
  const url = classIconUrl(cls);
  return `<span class="ui-portrait-wrap expedition-emblem"><span class="ui-portrait">${url ? `<img src="${esc(url)}" alt="" decoding="async" draggable="false">` : svgIcon('character')}</span></span>`;
}
