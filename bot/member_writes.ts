// The two member-facing WRITE paths, plus the decision the member-update event
// feeds them. Extracted out of main.ts rather than written there because
// `main.ts` calls `main()` at module scope, so nothing inside it is reachable
// from a test (ledger item L8 says to extract instead of reaching for a
// source-text pin, the same move R6 made for the cadence constants).
//
// The rule all three share is D5, diff before write: the bot pushed a nickname
// PATCH for every linked online member on every sweep whether or not anything had
// changed, and Discord answered each PATCH with a GUILD_MEMBER_UPDATE that the
// handler turned into a members-meta POST back into the game. So one unchanged
// member cost a Discord write, a gateway event and a game write, five minutes
// apart, forever. Diffing first collapses the steady state to nothing at all.
//
// Every cache update here happens ONLY after the write actually succeeded, which
// is the pattern computeRoleSync's caller already used: a cache written
// optimistically would claim a failed write had landed, and the retry that would
// have fixed it next sweep never happens.
//
// IO arrives as injected callbacks, so all of this is unit-tested without a
// network, a Discord token, or a clock.

import {
  changedMemberMeta,
  chunk,
  isSelfNickEcho,
  MEMBERS_META_BATCH,
  type MemberMetaRecord,
  memberMetaChanged,
  nicknameNeedsWrite,
} from './logic';

/** The caches a nickname write reads and, on success, updates. */
export interface NicknameCaches {
  /** Raw `member.nick` per member, null when they have none set. */
  memberNicks: Map<string, string | null>;
  /** Display name per member (nick, else global_name, else username). */
  memberNames: Map<string, string>;
  /** The nick THIS bot last wrote, used only to recognize our own echo. */
  lastWrittenNick: Map<string, string>;
}

export interface NicknameWriteIo {
  /** Rejects on a failed PATCH, the way the Discord shell already behaves. */
  setNickname: (userId: string, nick: string) => Promise<unknown>;
  onError?: (error: unknown) => void;
}

/**
 * Send a member's nickname PATCH, but only when the computed nick actually
 * differs from the nick we last observed for them. Returns what happened, so a
 * caller (and a test) can tell a skipped write from a failed one.
 *
 * On success all three caches move together: the raw nick, because that is what
 * the next sweep diffs against; the display name, because after our PATCH the
 * member's nick IS this value, so the echo Discord sends back carries nothing
 * new; and lastWrittenNick, which is what lets that echo be recognized.
 */
export async function writeMemberNickname(
  userId: string,
  nick: string,
  caches: NicknameCaches,
  io: NicknameWriteIo,
): Promise<'skipped' | 'written' | 'failed'> {
  if (!nicknameNeedsWrite(nick, caches.memberNicks.get(userId))) return 'skipped';
  try {
    await io.setNickname(userId, nick);
  } catch (error) {
    // Deliberately NOT touching a cache here. Leaving the observed nick as it was
    // is what makes the next sweep try again instead of believing this landed.
    io.onError?.(error);
    return 'failed';
  }
  caches.memberNicks.set(userId, nick);
  caches.memberNames.set(userId, nick);
  caches.lastWrittenNick.set(userId, nick);
  return 'written';
}

export interface MetaPushIo {
  /**
   * Answers null for a failed push rather than rejecting, matching the game
   * client's envelope handling. The return value is therefore the ONLY success
   * signal available, and marking a batch clean without reading it would strand
   * every member in it until some later unrelated field happened to move.
   */
  pushMembersMeta: (records: MemberMetaRecord[]) => Promise<unknown>;
}

/**
 * Push exactly the members whose meta changed since the last SUCCESSFUL push,
 * still batched under the byte cap the roster push has always used. In steady
 * state nothing has changed, so this sends no request at all. Returns the records
 * that were actually accepted.
 *
 * A failed batch stops the run rather than skipping ahead: the members in it keep
 * their old cache entries and are retried next sweep, and pressing on would just
 * spend more requests against a server that has already refused one.
 */
export async function pushChangedMemberMeta(
  records: readonly MemberMetaRecord[],
  lastPushed: Map<string, MemberMetaRecord>,
  io: MetaPushIo,
  batchSize: number = MEMBERS_META_BATCH,
): Promise<MemberMetaRecord[]> {
  const pushed: MemberMetaRecord[] = [];
  for (const batch of chunk(changedMemberMeta(records, lastPushed), batchSize)) {
    if ((await io.pushMembersMeta(batch)) === null) return pushed;
    for (const record of batch) {
      lastPushed.set(record.discord_user_id, record);
      pushed.push(record);
    }
  }
  return pushed;
}

/**
 * Push ONE member's meta if it changed. Used where a live event re-resolves a
 * single member's flair, so a role grant reflects in game without waiting for the
 * sweep.
 */
export async function pushOneMemberMeta(
  record: MemberMetaRecord,
  lastPushed: Map<string, MemberMetaRecord>,
  io: MetaPushIo,
): Promise<boolean> {
  if (!memberMetaChanged(record, lastPushed.get(record.discord_user_id))) return false;
  if ((await io.pushMembersMeta([record])) === null) return false;
  lastPushed.set(record.discord_user_id, record);
  return true;
}

/** What a GUILD_MEMBER_UPDATE should do to the caches, and whether it pushes. */
export interface MemberUpdateDecision {
  /** The member's new role set, or null when the payload carried none. */
  roles: string[] | null;
  /** The member's new raw nick, null when they have none. */
  nick: string | null;
  displayName: string;
  /** False when this update is only our own nickname write coming back. */
  push: boolean;
}

/**
 * Decide what an incoming GUILD_MEMBER_UPDATE means. The caches are read, never
 * written: the caller applies the decision, so the ordering (judge against the
 * OLD cached roles, then move them) cannot be got wrong by accident here.
 *
 * `push` is false only for our own echo. Discord emits one of these for every
 * nickname PATCH the bot makes, and answering it with a members-meta POST is the
 * bot generating load against itself. A third-party change (a role granted, a
 * moderator renaming someone to a value we did not write) is not an echo and
 * still pushes.
 */
export function decideMemberUpdate(
  payload: Record<string, unknown>,
  user: Record<string, unknown>,
  cached: { roles: readonly string[]; lastWrittenNick: string | undefined },
  parse: {
    roles: (payload: Record<string, unknown>) => string[] | null;
    displayName: (payload: Record<string, unknown>, user: Record<string, unknown>) => string;
  },
): MemberUpdateDecision {
  const roles = parse.roles(payload);
  const nick = nickOf(payload);
  const echo = isSelfNickEcho(
    { nick, roleIds: roles ?? cached.roles },
    cached.lastWrittenNick,
    cached.roles,
  );
  return { roles, nick, displayName: parse.displayName(payload, user), push: !echo };
}

/** The member's RAW server nickname, or null when they have none set. */
export function nickOf(member: Record<string, unknown>): string | null {
  return typeof member.nick === 'string' ? member.nick : null;
}

/**
 * The name the game shows for a member: their guild nickname, else their Discord
 * display name, else their username. Moved here with the write paths so the value
 * a members-meta record carries is decided in one tested place.
 */
export function displayNameOf(
  member: Record<string, unknown>,
  user: Record<string, unknown>,
): string {
  const nick = typeof member.nick === 'string' ? member.nick : '';
  const global = typeof user.global_name === 'string' ? user.global_name : '';
  const username = typeof user.username === 'string' ? user.username : '';
  return nick || global || username || 'Member';
}
