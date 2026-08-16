// Authored guild-signpost listings, keyed by NoticeboardDef id
// (content/noticeboards.ts), NOT templateId, which Eastbrook's board shares
// with the island's. A board with an entry here raises the noticeboard
// event's 'listings' arm (types.ts NoticeboardListing) instead of 'empty';
// guild names and notes are world data the client splices verbatim, never
// translation keys. Production ships this table EMPTY: every board reads
// "nothing posted" until a real posting system fills it, and test servers
// can overlay dummy rows here (any such rows are removed before merge).

import type { NoticeboardListing } from '../types';

// ===========================================================================
// TEST DATA BELOW: REMOVE BEFORE OPENING THE PR (revert this commit; the
// production table is empty). Placeholder guild notices so the listings arm
// can be seen on the test server.
// ===========================================================================
export const NOTICEBOARD_LISTINGS: Readonly<Record<string, readonly NoticeboardListing[]>> = {
  proving_shore_noticeboard: [
    {
      guild: 'The Emberline Company',
      note: 'Recruiting fresh graduates of the Proving Shore. Ask for Serah at the Eastbrook well.',
    },
    {
      guild: 'Mirefen Salvage Crew',
      note: 'Divers wanted, swimmers preferred, cowards tolerated. Pay in shells and stories.',
    },
    {
      guild: 'The Quiet Lantern',
      note: 'Night escorts along the vale roads. We walk so you sleep.',
    },
  ],
};
