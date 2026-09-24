// Faction reputation currencies: balances, rewards, sanitization, and spending.
// Pure simulation system behind SimContext: host-agnostic, zero wall-clock, zero DOM/Three.js.

import { FACTION_IDS, type FactionId } from './factions';
import type { PlayerMeta } from './sim';
import type { SimContext } from './sim_context';
import type { WorldQuestDef } from './types';

export interface FactionRewardPlayerState {
  // Allied faction reward and toy tracking (session-only, cooldown timers)
  alliedHearthstoneReadyAt?: number;
  alliedHearthstoneAttunement?: FactionId;
  riftGliderReadyAt?: number;
  targetDummyReadyAt?: number;
  dawnStandardReadyAt?: number;
  dawnStandardSeconds?: number;
  shockBombReadyAt?: number;
}

export const FACTION_CURRENCY_ITEM_IDS: Readonly<Record<FactionId, string>> = Object.freeze({
  rift_watch: 'rift_watch_mark',
  church_order: 'church_order_crest',
  automatons: 'automaton_cog',
});

export function freshFactionCurrencies(): Record<FactionId, number> {
  return {
    rift_watch: 0,
    church_order: 0,
    automatons: 0,
  };
}

export function sanitizeFactionCurrencies(raw: unknown): Record<FactionId, number> {
  const result = freshFactionCurrencies();
  if (!raw || typeof raw !== 'object') return result;
  const obj = raw as Record<string, unknown>;
  for (const id of FACTION_IDS) {
    const val = obj[id];
    if (typeof val === 'number' && Number.isFinite(val) && val > 0) {
      result[id] = Math.floor(val);
    }
  }
  return result;
}

/** Reward in faction currency for completing a World Quest in that faction's zone. */
export function worldQuestFactionCurrencyReward(_quest: WorldQuestDef, level: number): number {
  return level <= 15 ? 5 : 10;
}

/** Display name of each faction's currency (English fallback / diagnostic). */
export function factionCurrencyName(factionId: FactionId): string {
  switch (factionId) {
    case 'rift_watch':
      return 'Rift Watch Mark';
    case 'church_order':
      return 'Order Crest';
    case 'automatons':
      return 'Automaton Cog';
  }
}

/** Get a player's current balance of a faction currency. */
export function getFactionCurrency(meta: PlayerMeta, factionId: FactionId): number {
  return meta.factionCurrencies?.[factionId] ?? 0;
}

/** Check if player has at least the required amount of faction currency. */
export function hasFactionCurrency(meta: PlayerMeta, factionId: FactionId, amount: number): boolean {
  return getFactionCurrency(meta, factionId) >= amount;
}

/** Award faction currency directly to PlayerMeta. */
export function awardFactionCurrency(
  meta: PlayerMeta,
  factionId: FactionId,
  amount: number,
  _ctx?: SimContext,
): number {
  if (!meta.factionCurrencies) {
    meta.factionCurrencies = freshFactionCurrencies();
  }
  const current = meta.factionCurrencies[factionId] ?? 0;
  const next = current + Math.max(0, Math.floor(amount));
  meta.factionCurrencies[factionId] = next;
  return next;
}

/** Deduct faction currency from PlayerMeta if sufficient balance exists. */
export function spendFactionCurrency(
  meta: PlayerMeta,
  factionId: FactionId,
  amount: number,
  _ctx?: SimContext,
): boolean {
  const cost = Math.max(0, Math.floor(amount));
  if (cost === 0) return true;
  if (!hasFactionCurrency(meta, factionId, cost)) return false;
  if (!meta.factionCurrencies) {
    meta.factionCurrencies = freshFactionCurrencies();
  }
  meta.factionCurrencies[factionId] -= cost;
  return true;
}
