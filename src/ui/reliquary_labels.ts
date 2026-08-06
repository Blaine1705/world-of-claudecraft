// Localized display text for Reliquary relic slots: the ONE display-name
// ladder every Reliquary surface reads, plus the sentence that tells a player
// where a missing relic comes from.
//
// This is the mount_labels.ts / armory_labels.ts family: a DOM-free,
// Node-testable localizer sitting between a pure core and its painters.
//
// Why it is its own module rather than part of reliquary_view.ts, since
// src/ui/CLAUDE.md does permit a pure view-core to import i18n for key and
// label selection:
//   1. The resolver has five call sites across TWO modules (hud.ts's chat log
//      and celebration banner, the window's cell name and recent chip, and the
//      search filter). Folding it into the view core would make hud.ts import a
//      view core just to name a relic.
//   2. Keeping the ARM CHOICE in the core and the TEXT here is what lets a
//      Vitest assert which source arm a hint selects with no locale loaded, and
//      lets the filter tests inject display names that share no substring with
//      the ids (proving the filter matches LOCALIZED text, not just something).
// reliquary_view.ts therefore emits ids and a ReliquarySourceLinePlan and takes
// injected search text, the same shape deeds_view.ts uses.
//
// The rule this module exists to enforce: an id NEVER becomes player-visible
// text by string surgery. There is no humanized `id.replace(/_/g, ' ')`
// fallback anywhere; an id no channel can name renders the authored
// "unknownRelic" copy, which is honest in every language.

import { DEEDS } from '../sim/content/deeds';
import { WEAPON_SKINS } from '../sim/content/weapon_skins';
import { DUNGEONS, ITEMS, MOBS, NPCS, ZONES } from '../sim/data';
import { localizeWeaponSkin } from './armory_labels';
import { craftNameKey } from './craft_name_view';
import { deedName, deedTitleText } from './deed_i18n';
import { dungeonDisplayName, itemDisplayName, tEntity, zoneDisplayName } from './entity_i18n';
import { gatheringProfessionNameKey } from './gathering_profession_name';
import { hasTranslation, type TranslationKey, t } from './i18n';
import { ownEntry } from './known_item';
import { MOUNT_NAME_KEYS } from './mount_labels';
import {
  type ReliquaryRelicNameKind,
  type ReliquarySourceLinePlan,
  reliquaryMarkFindKey,
} from './reliquary_view';

// The kind union is declared in the pure core (labels imports the core, never
// the reverse); re-exported here so both import paths keep resolving.
export type { ReliquaryRelicNameKind };

/**
 * Localized display name for one relic slot. Every Reliquary surface routes
 * here: grid cells, cell tooltips and aria labels, the Overview recent strip,
 * the search filter, and both hud.ts unlock ladders (chat log and celebration
 * banner), so a colon-namespaced id cannot render one way in chat and another
 * on the banner the way the two hand-rolled ladders used to.
 *
 * Every Record read goes through ownEntry: recent-find ids arrive off the wire,
 * and a bare index of a prototype key ('constructor') resolves a Function whose
 * missing fields render as "Object"/undefined (the R34 contract in
 * entity_i18n.ts).
 */
export function reliquaryRelicDisplayName(kind: ReliquaryRelicNameKind, id: string): string {
  if (kind === 'item' || kind === 'unknown') {
    const def = ownEntry(ITEMS, id);
    if (def) return itemDisplayName(def);
  }
  if (kind === 'mark') {
    // Mark ids arrive from a server-mirrored set, so a client older than the
    // server sees marks its catalog has no leaf for. t() on an untracked key
    // THROWS off a release build and renders the raw key string on one, and the
    // search filter now resolves every relic per keystroke, so one such id
    // would take down the whole window render rather than one chip.
    const markKey = reliquaryMarkFindKey(id);
    if (hasTranslation(markKey)) return t(markKey as TranslationKey);
  }
  if (kind === 'mount') {
    // Not mountDisplayName: that shared helper falls back to raw catalog
    // English and then to the raw id, which this module's contract forbids.
    // Membership first, then the authored copy.
    if (Object.hasOwn(MOUNT_NAME_KEYS, id)) return t(MOUNT_NAME_KEYS[id]);
  }
  if (kind === 'weapon_skin') {
    const def = ownEntry(WEAPON_SKINS, id);
    if (def) return localizeWeaponSkin(def).name;
  }
  if (kind === 'title') {
    const title = deedTitleText(id);
    if (title) return title;
  }
  return t('hudChrome.reliquary.unknownRelic');
}

/**
 * Casefolded display name, the shape the pure core's search filter matches
 * against (localized, so a player searches the names they can read).
 *
 * toLocaleLowerCase with the caller's tag, not toLowerCase: tr_TR ships, and
 * Turkish casefolds dotted/dotless I differently, so the invariant casing would
 * make a Turkish player's own keystrokes fail to match their own names. The
 * needle must be folded with the SAME tag (the deeds_window contract).
 */
export function reliquaryRelicSearchText(
  kind: ReliquaryRelicNameKind,
  id: string,
  tag: string,
): string {
  return reliquaryRelicDisplayName(kind, id).toLocaleLowerCase(tag);
}

// ---------------------------------------------------------------------------
// Source-line entity resolution. EVERY arm is membership-guarded before it
// localizes, because tEntity / dungeonDisplayName / zoneDisplayName / deedName
// all answer the RAW ID for an id they cannot place (the deliberate R34
// contract for wire-shaped ids). That fallback is right for a quest log, which
// still has to show the player something; it is wrong here, where the id would
// be spliced into a sentence and read as content: "Drops from
// gorne_the_dread in blackrock_hollow" must be impossible. A miss returns null
// and the whole line is dropped instead.
// ---------------------------------------------------------------------------

/** ZONES is an array, not a Record, so membership is a set built once. */
const ZONE_IDS: ReadonlySet<string> = new Set(ZONES.map((zone) => zone.id));

function bossName(mobId: string): string | null {
  return ownEntry(MOBS, mobId) ? tEntity({ kind: 'mob', id: mobId, field: 'name' }) : null;
}

function vendorName(npcId: string): string | null {
  return ownEntry(NPCS, npcId) ? tEntity({ kind: 'npc', id: npcId, field: 'name' }) : null;
}

function dungeonName(dungeonId: string): string | null {
  return ownEntry(DUNGEONS, dungeonId) ? dungeonDisplayName(dungeonId) : null;
}

function zoneName(zoneId: string): string | null {
  return ZONE_IDS.has(zoneId) ? zoneDisplayName(zoneId) : null;
}

function sourceDeedName(deedId: string): string | null {
  return ownEntry(DEEDS, deedId) ? deedName(deedId) : null;
}

/** Localized profession name for a source hint, or '' for an id on neither the
 *  craft ring nor the gathering table (no honest name means no source line
 *  rather than an invented one).
 *
 *  The typeof guard is not belt-and-braces: craftNameKey indexes its table bare
 *  (unlike its gathering sibling, which is Object.hasOwn-guarded), so a
 *  prototype key resolves Object.prototype.constructor, a truthy Function that
 *  would reach t() as a key. Guarding here keeps the fix inside this module
 *  rather than reshaping a helper five other windows share. */
function professionSourceName(professionId: string): string {
  const key = craftNameKey(professionId) ?? gatheringProfessionNameKey(professionId);
  return typeof key === 'string' ? t(key) : '';
}

/**
 * The player-visible "where does this come from" line for a missing relic,
 * localized from the pure plan. '' when the catalog authors no hint (or names
 * a profession this client cannot resolve): the surfaces hide the line rather
 * than print a blank sentence.
 */
export function reliquarySourceLineText(plan: ReliquarySourceLinePlan | undefined): string {
  if (plan === undefined) return '';
  switch (plan.kind) {
    case 'bossDungeon': {
      const boss = bossName(plan.bossId);
      const dungeon = dungeonName(plan.dungeonId);
      // Both halves or nothing: a half-resolved sentence would splice one raw
      // id into otherwise-real prose, which reads as content and is worse than
      // no line at all.
      if (boss === null || dungeon === null) return '';
      return t('hudChrome.reliquary.sourceBossDungeon', { boss, dungeon });
    }
    case 'boss': {
      const boss = bossName(plan.bossId);
      return boss === null ? '' : t('hudChrome.reliquary.sourceBoss', { boss });
    }
    case 'zone': {
      const zone = zoneName(plan.zoneId);
      return zone === null ? '' : t('hudChrome.reliquary.sourceZone', { zone });
    }
    case 'profession': {
      const profession = professionSourceName(plan.professionId);
      return profession === '' ? '' : t('hudChrome.reliquary.sourceProfession', { profession });
    }
    case 'deed': {
      const deed = sourceDeedName(plan.deedId);
      return deed === null ? '' : t('hudChrome.reliquary.sourceDeed', { deed });
    }
    case 'vendor': {
      const vendor = vendorName(plan.npcId);
      return vendor === null ? '' : t('hudChrome.reliquary.sourceVendor', { vendor });
    }
  }
}
