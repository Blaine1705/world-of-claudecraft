// The hint lines under a character-select roster row's level line: the zone
// the character stands in (so the owner can see where every character is
// without logging each one in), the raid lockouts it still carries (named and
// timed through the same rule as the in-world minimap badge), and the in-world
// notice for a character another session holds. Pure string builder, no DOM:
// main.ts drops the markup into the row it composes.
import { zoneDisplayName } from './entity_i18n';
import { esc } from './esc';
import { t } from './i18n';
import { formatLockoutDuration, raidLockoutDisplayName } from './raid_lockout_format';

/** Structural (the char-select `CharacterSummary` satisfies it) so this module
 *  does not import the net layer for a type. */
export interface CharselectHintSource {
  online: boolean;
  zoneId?: string | null;
  /** Lockout id -> absolute unlock epoch ms (the server already dropped expired
   *  entries; the row drops any that lapse between the fetch and the paint). */
  raidLockouts?: Record<string, number> | null;
}

/** One roster-row lockout, ready to render: the localized raid name and the
 *  countdown text for the time left at `nowMs`. */
export interface CharselectLockoutRow {
  id: string;
  name: string;
  time: string;
  msRemaining: number;
}

/** The localized zone name for a roster row, or null when the server sent no
 *  zone (an older server, or a save that resumes at the world start). */
export function charselectZoneLabel(c: CharselectHintSource): string | null {
  return c.zoneId ? zoneDisplayName(c.zoneId) : null;
}

/** The still-locked raids of a roster row, soonest to unlock first (ties by
 *  id, like the minimap panel). Empty when the server sent none (an older
 *  server) or every entry has already lapsed. */
export function charselectLockoutRows(
  c: CharselectHintSource,
  nowMs: number,
): CharselectLockoutRow[] {
  const src = c.raidLockouts;
  if (!src || typeof src !== 'object') return [];
  const rows: CharselectLockoutRow[] = [];
  for (const id of Object.keys(src)) {
    const until = src[id];
    if (typeof until !== 'number' || !Number.isFinite(until)) continue;
    const msRemaining = until - nowMs;
    if (msRemaining <= 0) continue;
    rows.push({
      id,
      name: raidLockoutDisplayName(id),
      time: formatLockoutDuration(msRemaining),
      msRemaining,
    });
  }
  return rows.sort(
    (a, b) => a.msRemaining - b.msRemaining || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/** The lockout line: a label plus one chip per locked raid (name and countdown,
 *  the in-world "locked to" sentence as its tooltip), or '' when none. */
export function charselectLockoutsHtml(c: CharselectHintSource, nowMs: number): string {
  const rows = charselectLockoutRows(c, nowMs);
  if (rows.length === 0) return '';
  const items = rows
    .map(
      (r) =>
        `<span class="char-lockout-item" title="${esc(
          t('hudChrome.raidLockout.lockedToast', { raid: r.name, time: r.time }),
        )}"><span class="char-lockout-name">${esc(r.name)}</span> <span class="char-lockout-time ui-num">${esc(r.time)}</span></span>`,
    )
    .join('');
  return `<span class="char-lockout-hint"><span class="char-lockout-label">${esc(t('character.raidLockouts'))}</span>${items}</span>`;
}

/** `nowMs` is the caller's wall clock (main.ts passes Date.now()): this module
 *  stays host-agnostic so tests can pin a countdown. */
export function charselectHintsHtml(c: CharselectHintSource, nowMs: number): string {
  const zone = charselectZoneLabel(c);
  const zoneHint = zone ? `<span class="char-zone-hint">${esc(zone)}</span>` : '';
  // Lockouts sit between the zone and the in-world notice: both state lines
  // first, the warning that explains the Take Over button last, nearest the
  // row's actions.
  const lockoutHint = charselectLockoutsHtml(c, nowMs);
  // Online characters explain themselves on their own hint line (below the
  // class) instead of a terse "(in world)" suffix, so the reason for the Take
  // Over button is unmissable.
  const inWorldHint = c.online
    ? `<span class="char-inworld-hint">${esc(t('character.inWorldHint'))}</span>`
    : '';
  return `${zoneHint}${lockoutHint}${inWorldHint}`;
}
