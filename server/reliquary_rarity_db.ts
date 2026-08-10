// SQL boundary for the Reliquary population-rarity aggregate (the *_db.ts
// convention: the query lives here, parameterized, and no other module
// carries raw SQL for it). Unlike deeds rarity there is NO relic observer
// table: relic ownership lives inside the characters.state JSONB blob
// (deedStats.itemsDiscovered for item relics, reliquary.marks for kill-proof
// marks, reliquary.illuminatedPages for page illumination), so the numerators
// unnest those arrays in place. The read is an observer: nothing here can
// grant, deny, or mutate reliquary state.
//
// Cost posture, decided with the deeds walk in view: this scan does NOT get
// its own cadence. main.ts runs it inside the SAME single-flight refresh and
// TTL cache as deedRarityCounts, so the characters walk happens at most once
// per DEEDS_RARITY_TTL_MS no matter which UI asks. The blob extraction makes
// this the heavier half of that refresh (it detoasts every eligible
// character's state, which the deeds COUNT arms never do); the measured
// figures live in the phase record and the heavy-timeout transaction below is
// the allowance for them.

import {
  RELIQUARY_ITEM_TO_PAGES,
  RELIQUARY_MARK_IDS,
  RELIQUARY_PAGE_ORDER,
} from '../src/sim/content/reliquary';
import { DB_HEAVY_STATEMENT_TIMEOUT_MS, ELIGIBLE_ACCOUNT_SQL, runWithStatementTimeout } from './db';
import { DEED_RARITY_MIN_LEVEL } from './deeds_db';

/** The population aggregate the public endpoint serves: how many eligible
 *  characters have found each catalogued relic id (item relics by first
 *  discovery, mark relics by the kill-proof ledger; zero-found ids absent)
 *  and how many have illuminated each page (zero-illumination pages absent).
 *  GLOBAL (cross-realm) by design, the deeds rarity precedent: at current
 *  population, per-realm percentages would be noise. Weapon-skin and title
 *  relics are deliberately not counted (account-scoped and deed-scoped
 *  ownership live outside the character blob); they stay absent from `found`
 *  and the client renders no line for them, the same shape as zero-found. */
export interface ReliquaryRarityAggregate {
  totalEligible: number;
  found: Record<string, number>;
  illuminated: Record<string, number>;
}

/** A blob array read that tolerates a malformed or absent path: anything that
 *  is not a JSON array unnests as empty rather than failing the refresh. The
 *  serializer only ever writes string arrays here, so this guards restore
 *  drift and hand-edited rows, not a live shape. */
function blobArraySql(path: string): string {
  return `CASE WHEN jsonb_typeof(${path}) = 'array' THEN ${path} ELSE '[]'::jsonb END`;
}

export async function reliquaryRarityCounts(): Promise<ReliquaryRarityAggregate> {
  // Catalog filters ride text[] binds (never interpolated) so the unnest
  // GROUP BY only aggregates catalogued ids: itemsDiscovered holds every item
  // a character ever discovered, and filtering in SQL keeps the grouped row
  // set bounded by the catalog rather than the item table.
  const itemIds = [...RELIQUARY_ITEM_TO_PAGES.keys()];
  const markIds = [...RELIQUARY_MARK_IDS];
  const pageIds = [...RELIQUARY_PAGE_ORDER];
  // All arms run in ONE raised-timeout transaction, the deedRarityCounts
  // posture: a large table can legitimately exceed the default statement
  // timeout, and the shared transaction raises the allowance once on one
  // client. READ COMMITTED still applies (no single snapshot across arms), so
  // a fill committing mid-refresh can skew one cycle; the client-side
  // fraction clamp absorbs it, exactly as the deeds fraction gate does.
  //
  // Every arm embeds the SAME eligibility predicate deedRarityCounts pins on
  // both its axes (the DEED_RARITY_MIN_LEVEL floor plus state IS NOT NULL,
  // and ELIGIBLE_ACCOUNT_SQL VERBATIM through an `accounts a` join), so a
  // banned, suspended, or sub-floor character leaves every numerator and the
  // denominator together and no count can read past the population it is
  // measured against.
  return runWithStatementTimeout(DB_HEAVY_STATEMENT_TIMEOUT_MS, async (query) => {
    const foundItems = await query(
      `SELECT x.id, COUNT(*)::int AS found
       FROM characters c
       JOIN accounts a ON a.id = c.account_id
       CROSS JOIN LATERAL jsonb_array_elements_text(
         ${blobArraySql(`c.state->'deedStats'->'itemsDiscovered'`)}
       ) AS x(id)
      WHERE c.level >= $1 AND c.state IS NOT NULL AND ${ELIGIBLE_ACCOUNT_SQL}
        AND x.id = ANY($2::text[])
      GROUP BY x.id`,
      [DEED_RARITY_MIN_LEVEL, itemIds],
    );
    const foundMarks = await query(
      `SELECT x.id, COUNT(*)::int AS found
       FROM characters c
       JOIN accounts a ON a.id = c.account_id
       CROSS JOIN LATERAL jsonb_array_elements_text(
         ${blobArraySql(`c.state->'reliquary'->'marks'`)}
       ) AS x(id)
      WHERE c.level >= $1 AND c.state IS NOT NULL AND ${ELIGIBLE_ACCOUNT_SQL}
        AND x.id = ANY($2::text[])
      GROUP BY x.id`,
      [DEED_RARITY_MIN_LEVEL, markIds],
    );
    const illuminatedPages = await query(
      `SELECT x.id, COUNT(*)::int AS illuminated
       FROM characters c
       JOIN accounts a ON a.id = c.account_id
       CROSS JOIN LATERAL jsonb_array_elements_text(
         ${blobArraySql(`c.state->'reliquary'->'illuminatedPages'`)}
       ) AS x(id)
      WHERE c.level >= $1 AND c.state IS NOT NULL AND ${ELIGIBLE_ACCOUNT_SQL}
        AND x.id = ANY($2::text[])
      GROUP BY x.id`,
      [DEED_RARITY_MIN_LEVEL, pageIds],
    );
    const eligible = await query(
      `SELECT COUNT(*)::int AS eligible
       FROM characters c
       JOIN accounts a ON a.id = c.account_id
      WHERE c.level >= $1 AND c.state IS NOT NULL AND ${ELIGIBLE_ACCOUNT_SQL}`,
      [DEED_RARITY_MIN_LEVEL],
    );
    const found: Record<string, number> = {};
    for (const row of foundItems.rows) found[row.id] = row.found;
    for (const row of foundMarks.rows) found[row.id] = row.found;
    const illuminated: Record<string, number> = {};
    for (const row of illuminatedPages.rows) illuminated[row.id] = row.illuminated;
    return { totalEligible: eligible.rows[0]?.eligible ?? 0, found, illuminated };
  });
}
