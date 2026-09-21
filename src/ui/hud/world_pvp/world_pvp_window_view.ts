// Pure view model for the World PvP tab of the merged PvP window: the /pvp
// flag's state line, which button the panel offers (raise, lower, keep up, or a
// locked raise with the level requirement), the two-step raise confirmation,
// and the resolved stakes copy inputs. DOM-free and i18n-free (root CLAUDE.md
// pure-core contract): it hands the painter ids and numbers, never strings.
// The painter (world_pvp_panel.ts) localizes and wires it; arena_window.ts
// composes it as the fourth tab.

import {
  WORLD_PVP_DISARM_SECONDS,
  WORLD_PVP_GREY_LEVEL_GAP,
  WORLD_PVP_KILL_HONOR,
  WORLD_PVP_MIN_LEVEL,
  WORLD_PVP_STAKE_CAP_COPPER,
  WORLD_PVP_STAKE_FRACTION,
} from '../../../sim/pvp/world_pvp_rules';
import type { WorldPvpInfo } from '../../../world_api';

/** What the one action button does. `locked` renders the raise disabled with
 *  the level requirement; `keepUp` cancels a running disarm countdown. */
export type WorldPvpActionKind = 'enable' | 'disable' | 'keepUp' | 'locked';

export interface WorldPvpStakes {
  stakeCapCopper: number;
  /** Whole percent, for the copy (10, not 0.1). */
  stakePercent: number;
  killHonor: number;
  disarmMinutes: number;
  greyLevelGap: number;
  minLevel: number;
}

export type WorldPvpWindowView =
  | { kind: 'pending'; sig: string }
  | {
      kind: 'live';
      flagged: boolean;
      /** Whole seconds left on the disarm countdown, or null. */
      disarmRemaining: number | null;
      action: WorldPvpActionKind;
      /** The raise button was pressed once; the panel now offers confirm/cancel. */
      confirming: boolean;
      kills: number;
      deaths: number;
      honor: number;
      stakes: WorldPvpStakes;
      /** Render-skip signature: every id and number the markup depends on. */
      sig: string;
    };

export interface WorldPvpWindowViewInput {
  info: WorldPvpInfo | null;
  honor: number;
  /** The painter's raise-confirmation state (cleared on any state change). */
  confirming: boolean;
}

export const WORLD_PVP_STAKES: WorldPvpStakes = {
  stakeCapCopper: WORLD_PVP_STAKE_CAP_COPPER,
  stakePercent: Math.round(WORLD_PVP_STAKE_FRACTION * 100),
  killHonor: WORLD_PVP_KILL_HONOR,
  disarmMinutes: Math.round(WORLD_PVP_DISARM_SECONDS / 60),
  greyLevelGap: WORLD_PVP_GREY_LEVEL_GAP,
  minLevel: WORLD_PVP_MIN_LEVEL,
};

export function worldPvpAction(info: WorldPvpInfo): WorldPvpActionKind {
  if (info.flagged) return info.disarmRemaining === null ? 'disable' : 'keepUp';
  return info.levelLocked ? 'locked' : 'enable';
}

export function buildWorldPvpWindowView(input: WorldPvpWindowViewInput): WorldPvpWindowView {
  const info = input.info;
  if (!info) return { kind: 'pending', sig: 'world-pending' };
  const action = worldPvpAction(info);
  // Confirmation only ever guards the raise: a disarm or a cancel is one press.
  const confirming = action === 'enable' && input.confirming;
  const disarmRemaining = info.disarmRemaining === null ? null : Math.ceil(info.disarmRemaining);
  const sig = [
    'world',
    info.flagged ? 1 : 0,
    disarmRemaining ?? -1,
    action,
    confirming ? 1 : 0,
    info.kills,
    info.deaths,
    input.honor,
  ].join('|');
  return {
    kind: 'live',
    flagged: info.flagged,
    disarmRemaining,
    action,
    confirming,
    kills: info.kills,
    deaths: info.deaths,
    honor: input.honor,
    stakes: WORLD_PVP_STAKES,
    sig,
  };
}

/** m:ss for the countdown line; whole seconds in, never negative. */
export function formatDisarmClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(s / 60);
  const rest = s % 60;
  return `${minutes}:${rest < 10 ? '0' : ''}${rest}`;
}
