// Reliquary page name / description localization (the deed_i18n entity-style
// pattern scoped to The Reliquary). The English source of truth is the
// RELIQUARY_PAGES content table itself (name/desc on the page def); this module
// adds the locale plumbing, and the fill lives in per-base-locale chunks
// (reliquary_i18n.locales/<locale>.ts, each lazily fetched via
// ensureReliquaryLocalesLoaded) without touching a single call site. An absent
// or not-yet-resident locale table or field still falls back to the authored
// English (clean English is preferable to a broken guess).
//
// Coverage today: the five non-Latin locale tables (ja_JP, ko_KR, ru_RU,
// zh_CN, zh_TW) ship page NAMES now, because a Latin-script reader can at least
// parse an English proper noun while a CJK/Cyrillic reader cannot. The Latin
// locales, and every page desc, are release fill (the Phase 22 worklist); until
// then they render the authored English through the fallback above.

import { RELIQUARY_PAGES, RELIQUARY_PAGES_BY_ID } from '../sim/content/reliquary';
import { getLanguage, isPseudoActive, type SupportedLanguage } from './i18n';

export type ReliquaryTranslationField = 'name' | 'desc';

/** Per-page localized fields; any omitted field falls back to English. */
export interface ReliquaryLocaleEntry {
  name?: string;
  desc?: string;
}

export type ReliquaryLocaleTable = Record<string, ReliquaryLocaleEntry>;

// The fill tables live in per-base-locale chunks
// (reliquary_i18n.locales/<locale>.ts) behind RELIQUARY_LOCALE_LOADERS,
// mirroring the deed_i18n model: the eager renderer bundle (hud.ts, the
// Reliquary window) carries zero reliquary locale bytes for a default-English
// player, and a non-en visitor fetches ONLY their own locale's chunk.
// `residentReliquaryLocales` holds the assembled table per LANGUAGE once that
// locale's chunk resolves; en and en_CA resolve to the authored English in
// localeEntry before this map is consulted, so they never fetch a chunk.

/** A per-base-locale reliquary chunk: its table, plus the co-located override
 *  layer for any dialect that rides it (es carries es_ES, fr_FR carries fr_CA).
 *  No dialect layer ships yet; the escape hatch mirrors deed_i18n so a release
 *  fill that needs one does not have to reshape the module. */
export interface ReliquaryLocaleModule {
  table: ReliquaryLocaleTable;
  dialects?: Record<string, ReliquaryLocaleTable>;
}

type ReliquaryBaseLocale =
  | 'cs_CZ'
  | 'da_DK'
  | 'de_DE'
  | 'es'
  | 'fr_FR'
  | 'id_ID'
  | 'it_IT'
  | 'ja_JP'
  | 'ko_KR'
  | 'nl_NL'
  | 'pl_PL'
  | 'pt_BR'
  | 'ru_RU'
  | 'sv_SE'
  | 'tr_TR'
  | 'vi_VN'
  | 'zh_CN'
  | 'zh_TW';

// The per-locale dynamic-import thunks (the DEED_LOCALE_LOADERS shape scoped to
// The Reliquary): each shipped base locale is its own content-hashed chunk. The
// record is PARTIAL because only the five non-Latin locales are filled today; a
// base locale with no chunk resolves to a resident no-op and keeps rendering the
// authored English, so the release fill adds a file plus one row here and
// nothing else. Production never reassigns the map; tests spy a single locale's
// thunk (vi.spyOn) to assert per-locale fetch counts and simulate a failed chunk
// fetch. Read at call time in ensureReliquaryLocalesLoaded (never captured) so a
// spy replacement is honored.
export const RELIQUARY_LOCALE_LOADERS: Partial<
  Record<ReliquaryBaseLocale, () => Promise<ReliquaryLocaleModule>>
> = {
  ja_JP: () => import('./reliquary_i18n.locales/ja_JP'),
  ko_KR: () => import('./reliquary_i18n.locales/ko_KR'),
  ru_RU: () => import('./reliquary_i18n.locales/ru_RU'),
  zh_CN: () => import('./reliquary_i18n.locales/zh_CN'),
  zh_TW: () => import('./reliquary_i18n.locales/zh_TW'),
};

// Dialect locales ride their base locale's chunk (es_ES over es, fr_CA over
// fr_FR); the base chunk co-locates the override layer under `dialects`.
const RELIQUARY_DIALECT_BASE: Partial<Record<SupportedLanguage, ReliquaryBaseLocale>> = {
  es_ES: 'es',
  fr_CA: 'fr_FR',
};

// The assembled reliquary table per LANGUAGE, each resident once its own chunk
// resolves. Absent until then: a non-en read falls back to the authored English
// (the documented absent-table behavior).
const residentReliquaryLocales: Partial<Record<SupportedLanguage, ReliquaryLocaleTable>> = {};
// One coalesced in-flight promise PER LANGUAGE, cleared on reject so a failed
// fetch of one locale leaves a retry possible and never blocks another locale.
const inflightReliquaryLocales = new Map<SupportedLanguage, Promise<void>>();

/** Make the reliquary locale table resident for `lang` (a no-op for en / en_CA,
 *  once resident, and for a locale with no chunk yet). Callers await it beside
 *  ensureLocaleLoaded (bootstrap / picker); every lookup in this module stays
 *  synchronous and falls back to the authored English until it resolves.
 *  Fetches ONLY `lang`'s chunk (a dialect rides its base locale's chunk).
 *  Rejects on a failed chunk fetch (the caller owns the UI, English keeps
 *  rendering) and clears the in-flight slot so a retry can start a fresh
 *  import. */
export async function ensureReliquaryLocalesLoaded(lang: SupportedLanguage): Promise<void> {
  if (lang === 'en' || lang === 'en_CA') return;
  if (residentReliquaryLocales[lang]) return;
  const existing = inflightReliquaryLocales.get(lang);
  if (existing) return existing;
  const dialectBase = RELIQUARY_DIALECT_BASE[lang];
  const base = dialectBase ?? (lang as ReliquaryBaseLocale);
  const loader = RELIQUARY_LOCALE_LOADERS[base];
  if (!loader) return; // no chunk for this locale yet (release fill): resident no-op
  const task = loader()
    .then((mod) => {
      // Shape-tolerant read (the ensureLocaleLoaded gotcha): a production chunk
      // may expose the module under `default` while raw vitest resolves the
      // SOURCE .ts with named exports only.
      const m = (mod as { default?: ReliquaryLocaleModule }).default ?? mod;
      const override = dialectBase ? m.dialects?.[lang] : undefined;
      residentReliquaryLocales[lang] = override ? { ...m.table, ...override } : m.table;
      inflightReliquaryLocales.delete(lang);
    })
    .catch((err) => {
      inflightReliquaryLocales.delete(lang);
      throw err;
    });
  inflightReliquaryLocales.set(lang, task);
  return task;
}

// --- en_XA dev pseudo-locale port ---------------------------------------------
//
// Reliquary page English resolves from the sim content table, OUTSIDE the i18n
// catalog (localeEntry returns undefined for 'en'), so the tableFor pseudo swap
// never reaches it: under ?lang=en_XA a page name would render plain English
// inside pseudolocalized chrome, hiding the very literals the pseudo-locale
// exists to expose. maybePseudo folds it through a faithful port of the
// generator's transform (scripts/i18n_pseudo.mjs) so the accent-push+bracket
// form matches the committed en_XA table byte for byte (pinned in tests). The
// whole path sits behind the `!import.meta.env.PROD` gate below, so a release
// build statically drops the port and its map.

// 1:1 accent-push map for the 52 ASCII letters (copied from
// scripts/i18n_pseudo.mjs; the two must stay identical, guarded by the drift pin
// in the reliquary pseudo test).
const PSEUDO_ACCENT_MAP: Record<string, string> = {
  a: 'á',
  b: 'ƀ',
  c: 'ç',
  d: 'ð',
  e: 'é',
  f: 'ƒ',
  g: 'ĝ',
  h: 'ĥ',
  i: 'í',
  j: 'ĵ',
  k: 'ķ',
  l: 'ļ',
  m: 'ɱ',
  n: 'ñ',
  o: 'ó',
  p: 'þ',
  q: 'ɋ',
  r: 'ŕ',
  s: 'š',
  t: 'ţ',
  u: 'ú',
  v: 'ʋ',
  w: 'ŵ',
  x: 'ẋ',
  y: 'ý',
  z: 'ž',
  A: 'Á',
  B: 'Ɓ',
  C: 'Ç',
  D: 'Ð',
  E: 'É',
  F: 'Ƒ',
  G: 'Ĝ',
  H: 'Ĥ',
  I: 'Í',
  J: 'Ĵ',
  K: 'Ķ',
  L: 'Ļ',
  M: 'Ɱ',
  N: 'Ñ',
  O: 'Ó',
  P: 'Þ',
  Q: 'Ɋ',
  R: 'Ŕ',
  S: 'Š',
  T: 'Ţ',
  U: 'Ú',
  V: 'Ʋ',
  W: 'Ŵ',
  X: 'Ẋ',
  Y: 'Ý',
  Z: 'Ž',
};

function pseudoAccentPush(text: string): string {
  let out = '';
  for (const ch of text) out += PSEUDO_ACCENT_MAP[ch] ?? ch;
  return out;
}

/** Accent-push the literal text of `s`, preserving every {token} exactly, then
 *  bracket the whole leaf. A faithful port of scripts/i18n_pseudo.mjs's
 *  pseudoString; exported only for the drift pin that compares it to the
 *  generated en_XA table. */
export function pseudoReliquaryString(s: string): string {
  const transformed = s
    .split(/(\{[^}]*\})/g)
    .map((part) => (part.startsWith('{') && part.endsWith('}') ? part : pseudoAccentPush(part)))
    .join('');
  return `[${transformed}]`;
}

// Fold a resolved reliquary English string under the dev pseudo-locale, else
// return it untouched. The `!import.meta.env.PROD` prefix makes the whole branch
// statically dead in a release build, so the port above tree-shakes away.
function maybePseudo(s: string): string {
  return !import.meta.env.PROD && isPseudoActive() ? pseudoReliquaryString(s) : s;
}

function localeEntry(pageId: string): ReliquaryLocaleEntry | undefined {
  const lang = getLanguage();
  if (lang === 'en' || lang === 'en_CA') return undefined;
  return residentReliquaryLocales[lang]?.[pageId];
}

/** Localized page name; the raw page id for a catalog-unknown id (content
 *  drift), which is what every render site wants for an id it cannot place. */
export function reliquaryPageName(pageId: string): string {
  const def = RELIQUARY_PAGES_BY_ID[pageId];
  if (!def) return pageId;
  return maybePseudo(localeEntry(pageId)?.name ?? def.name);
}

/** Localized page description; '' for a catalog-unknown id or a page that
 *  authors no blurb (callers hide the surface entirely). */
export function reliquaryPageDesc(pageId: string): string {
  const def = RELIQUARY_PAGES_BY_ID[pageId];
  if (!def) return '';
  return maybePseudo(localeEntry(pageId)?.desc ?? def.desc ?? '');
}

export interface ReliquaryTranslationManifestEntry {
  id: string;
  field: ReliquaryTranslationField;
  source: string;
}

/** Every (page, field) pair the fill must cover, with its English source (the
 *  deedTranslationManifest shape for coverage tooling). A page with no authored
 *  desc contributes only its name row. */
export function reliquaryTranslationManifest(): ReliquaryTranslationManifestEntry[] {
  const entries: ReliquaryTranslationManifestEntry[] = [];
  for (const def of RELIQUARY_PAGES) {
    entries.push({ id: def.id, field: 'name', source: def.name });
    if (def.desc !== undefined) {
      entries.push({ id: def.id, field: 'desc', source: def.desc });
    }
  }
  return entries;
}
