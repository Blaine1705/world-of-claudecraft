// The bind-on-pickup party trade window (Ignivar raid loot follow-up): a
// soulbound item awarded from party boss loot stays tradeable for a bounded
// window, but ONLY with the players who were loot-eligible at the exact moment
// the item dropped (the kill-time candidate snapshot, never the current party
// roster), and equipping the copy ends the window immediately (items.ts
// equipmentPayloadFor strips it on the bag-to-worn bridge).
//
// The clock is ctx.lockoutNowMs(), the shared raid-lockout clock: real epoch ms
// on the live server, tick-derived ms offline, so `untilMs` stays comparable to
// the host's own "now" in both worlds and survives a server restart. This
// module itself reads no clock (callers pass nowMs) and draws no rng; it is
// `src/sim`-pure bookkeeping over ItemInstancePayload.partyTrade.
//
// The window RIDES the copy: trading it hands the same payload over
// (social/trade.ts removeOffer/grantOffer preserve instances), so a recipient
// can pass it on to another drop-moment member within the same deadline.
// Mail, market, vendor, and guild-bank stay hard-blocked by def.soulbound at
// their existing gates; the trade offer path is the ONE channel this opens.

import type { ItemInstancePayload } from '../types';

/** How long a bind-on-pickup drop stays tradeable inside its drop group. */
export const BOP_PARTY_TRADE_MS = 2 * 60 * 60 * 1000;

/** Name equality for the eligible list: case-insensitive, so a client-typed
 *  or differently-cased mirror of the same character name never silently
 *  fails the window. Names are stored verbatim as stamped. */
function sameName(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** Builds the instance payload for a soulbound copy awarded from party loot,
 *  or undefined when no window applies: fewer than two eligible names means
 *  nobody exists to trade with, so the copy stays a plain grant. `eligible`
 *  is the drop-moment loot-candidate snapshot (winner included). */
export function bopPartyTradeInstance(
  nowMs: number,
  eligible: readonly string[],
): ItemInstancePayload | undefined {
  if (eligible.length < 2) return undefined;
  return { partyTrade: { untilMs: nowMs + BOP_PARTY_TRADE_MS, eligible: [...eligible] } };
}

/** Whether the copy's window is present, well-formed, and unexpired. The
 *  payload crosses a JSONB save/load boundary, so the shape checks are real
 *  input validation, not paranoia: a malformed window reads as no window
 *  (the copy falls back to plain soulbound, the safe direction). */
export function partyTradeActive(
  instance: ItemInstancePayload | undefined,
  nowMs: number,
): boolean {
  const trade = instance?.partyTrade;
  if (!trade || !Number.isFinite(trade.untilMs) || !Array.isArray(trade.eligible)) return false;
  return trade.untilMs > nowMs;
}

/** Whether the copy may be traded to `counterpartyName` right now: the window
 *  must be active AND the counterparty must be one of the drop-moment names. */
export function partyTradeWindowAllows(
  instance: ItemInstancePayload | undefined,
  counterpartyName: string,
  nowMs: number,
): boolean {
  if (!partyTradeActive(instance, nowMs)) return false;
  const eligible = instance?.partyTrade?.eligible ?? [];
  return eligible.some((name) => typeof name === 'string' && sameName(name, counterpartyName));
}

/** Milliseconds left on the copy's window, clamped to zero. */
export function partyTradeMsLeft(instance: ItemInstancePayload | undefined, nowMs: number): number {
  if (!partyTradeActive(instance, nowMs)) return 0;
  return Math.max(0, (instance?.partyTrade?.untilMs ?? 0) - nowMs);
}
