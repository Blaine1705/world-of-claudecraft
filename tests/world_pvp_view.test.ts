// Pins for the World PvP tab's pure view core (src/ui/hud/world_pvp/), its
// painter's markup, the shared client hostility verdict
// (src/ui/pvp_hostile_core.ts), and the sim-string matcher rules that
// re-localize the flag's notices and kill lines (src/ui/sim_i18n.ts).
import { describe, expect, it } from 'vitest';
import {
  WORLD_PVP_DISARM_SECONDS,
  WORLD_PVP_KILL_HONOR,
  WORLD_PVP_MIN_LEVEL,
  WORLD_PVP_STAKE_CAP_COPPER,
} from '../src/sim/pvp';
import { worldPvpDefeatLine, worldPvpKillLine } from '../src/sim/pvp/world_pvp';
import type { Entity } from '../src/sim/types';
import {
  buildWorldPvpWindowView,
  formatDisarmClock,
  WORLD_PVP_STAKES,
  worldPvpAction,
  worldPvpBodyHtml,
} from '../src/ui/hud/world_pvp';
import { setLanguage } from '../src/ui/i18n';
import {
  isPvpHostilePlayer,
  isPvpHostileTargetId,
  type PvpHostileWorld,
} from '../src/ui/pvp_hostile_core';
import { localizeSimText } from '../src/ui/sim_i18n';
import type { WorldPvpInfo } from '../src/world_api';

const info = (over: Partial<WorldPvpInfo> = {}): WorldPvpInfo => ({
  flagged: false,
  disarmRemaining: null,
  kills: 0,
  deaths: 0,
  levelLocked: false,
  ...over,
});

describe('buildWorldPvpWindowView', () => {
  it('is pending until the readout arrives', () => {
    const view = buildWorldPvpWindowView({ info: null, honor: 0, confirming: false });
    expect(view).toEqual({ kind: 'pending', sig: 'world-pending' });
  });

  it('offers enable when down, disable when up, keep-up mid-countdown, locked under level', () => {
    expect(worldPvpAction(info())).toBe('enable');
    expect(worldPvpAction(info({ flagged: true }))).toBe('disable');
    expect(worldPvpAction(info({ flagged: true, disarmRemaining: 42 }))).toBe('keepUp');
    expect(worldPvpAction(info({ levelLocked: true }))).toBe('locked');
    // A flagged player who somehow reads level-locked is still flagged: disable wins.
    expect(worldPvpAction(info({ flagged: true, levelLocked: true }))).toBe('disable');
  });

  it('carries the resolved stakes from the sim rules, never literals', () => {
    expect(WORLD_PVP_STAKES).toEqual({
      stakeCapCopper: WORLD_PVP_STAKE_CAP_COPPER,
      stakePercent: 10,
      killHonor: WORLD_PVP_KILL_HONOR,
      disarmMinutes: WORLD_PVP_DISARM_SECONDS / 60,
      greyLevelGap: 5,
      minLevel: WORLD_PVP_MIN_LEVEL,
    });
    const view = buildWorldPvpWindowView({ info: info(), honor: 12, confirming: false });
    expect(view.kind === 'live' && view.stakes).toBe(WORLD_PVP_STAKES);
  });

  it('only the raise carries the confirm step, and the signature tracks every input', () => {
    const base = { info: info(), honor: 5, confirming: true };
    const raising = buildWorldPvpWindowView(base);
    expect(raising.kind === 'live' && raising.confirming).toBe(true);
    const lowering = buildWorldPvpWindowView({ ...base, info: info({ flagged: true }) });
    expect(lowering.kind === 'live' && lowering.confirming).toBe(false);
    const sigs = new Set(
      [
        base,
        { ...base, confirming: false },
        { ...base, honor: 6 },
        { ...base, info: info({ kills: 1 }) },
        { ...base, info: info({ deaths: 1 }) },
        { ...base, info: info({ flagged: true }) },
        { ...base, info: info({ flagged: true, disarmRemaining: 10.2 }) },
        { ...base, info: info({ levelLocked: true }) },
      ].map((input) => buildWorldPvpWindowView(input).sig),
    );
    expect(sigs.size).toBe(8);
    // The countdown is whole seconds (ceil) so the strip does not rebuild 20x a second.
    const a = buildWorldPvpWindowView({
      ...base,
      info: info({ flagged: true, disarmRemaining: 10.2 }),
    });
    const b = buildWorldPvpWindowView({
      ...base,
      info: info({ flagged: true, disarmRemaining: 10.9 }),
    });
    expect(a.sig).toBe(b.sig);
    expect(a.kind === 'live' && a.disarmRemaining).toBe(11);
  });

  it('formats the disarm clock as m:ss', () => {
    expect(formatDisarmClock(300)).toBe('5:00');
    expect(formatDisarmClock(61)).toBe('1:01');
    expect(formatDisarmClock(9)).toBe('0:09');
    expect(formatDisarmClock(-3)).toBe('0:00');
  });
});

describe('worldPvpBodyHtml', () => {
  it('renders the pending note, then the live panel with the right action button', () => {
    setLanguage('en');
    expect(worldPvpBodyHtml({ kind: 'pending', sig: 'x' })).toContain(
      'Waiting for your PvP status',
    );
    const down = worldPvpBodyHtml(
      buildWorldPvpWindowView({ info: info(), honor: 3, confirming: false }),
    );
    expect(down).toContain('data-act="pvp-enable"');
    expect(down).not.toContain('data-act="pvp-disable"');
    expect(down).toContain('Your PvP flag is down.');
    expect(down).toContain('Record: 0 kills, 0 deaths');
    expect(down).toContain('Honor: 3');
    expect(down).toContain('5g'); // the stake cap, through the money formatter
    expect(down).toContain('10%');
    expect(down).toContain('/pvp toggles the flag');
    const confirming = worldPvpBodyHtml(
      buildWorldPvpWindowView({ info: info(), honor: 3, confirming: true }),
    );
    expect(confirming).toContain('data-act="pvp-confirm"');
    expect(confirming).toContain('data-act="pvp-cancel"');
    expect(confirming).not.toContain('data-act="pvp-enable"');
    const up = worldPvpBodyHtml(
      buildWorldPvpWindowView({ info: info({ flagged: true }), honor: 0, confirming: false }),
    );
    expect(up).toContain('data-act="pvp-disable"');
    expect(up).toContain('is-on');
    const disarming = worldPvpBodyHtml(
      buildWorldPvpWindowView({
        info: info({ flagged: true, disarmRemaining: 125 }),
        honor: 0,
        confirming: false,
      }),
    );
    expect(disarming).toContain('data-act="pvp-keep"');
    expect(disarming).toContain('2:05');
    const locked = worldPvpBodyHtml(
      buildWorldPvpWindowView({ info: info({ levelLocked: true }), honor: 0, confirming: false }),
    );
    expect(locked).toContain('disabled aria-disabled="true"');
    expect(locked).toContain(`Requires level ${WORLD_PVP_MIN_LEVEL}.`);
  });

  it('escapes nothing it did not author (no raw player text reaches the markup)', () => {
    setLanguage('en');
    const html = worldPvpBodyHtml(
      buildWorldPvpWindowView({ info: info(), honor: 0, confirming: false }),
    );
    expect(html).not.toContain('<script');
  });
});

describe('isPvpHostilePlayer (the shared client verdict)', () => {
  const player = (id: number, extra: Partial<Entity> = {}): Entity =>
    ({ id, kind: 'player', dead: false, guild: '', ...extra }) as Entity;
  const worldOf = (
    self: Entity,
    others: Entity[],
    over: Partial<PvpHostileWorld> = {},
  ): PvpHostileWorld => ({
    playerId: self.id,
    entities: new Map([self, ...others].map((e) => [e.id, e])),
    duelInfo: null,
    arenaInfo: null,
    bgInfo: null,
    partyInfo: null,
    ...over,
  });

  it('two flagged strangers are hostile; one-sided flags, self, corpses and party mates are not', () => {
    const me = player(1, { pvpFlag: true });
    const stranger = player(2, { pvpFlag: true });
    const unflagged = player(3);
    const corpse = player(4, { pvpFlag: true, dead: true });
    const world = worldOf(me, [stranger, unflagged, corpse]);
    expect(isPvpHostilePlayer(world, stranger)).toBe(true);
    expect(isPvpHostileTargetId(world, 2)).toBe(true);
    expect(isPvpHostilePlayer(world, unflagged)).toBe(false);
    expect(isPvpHostilePlayer(world, me)).toBe(false);
    expect(isPvpHostilePlayer(world, corpse)).toBe(false);
    expect(isPvpHostileTargetId(world, null)).toBe(false);
    expect(isPvpHostileTargetId(world, 99)).toBe(false);
    const grouped = worldOf(me, [stranger], {
      partyInfo: { members: [{ pid: 2 }] } as unknown as PvpHostileWorld['partyInfo'],
    });
    expect(isPvpHostilePlayer(grouped, stranger)).toBe(false);
  });

  it('an unflagged local player sees nobody as world-hostile, but a duel opponent stays red', () => {
    const me = player(1);
    const flagged = player(2, { pvpFlag: true });
    expect(isPvpHostilePlayer(worldOf(me, [flagged]), flagged)).toBe(false);
    const duel = worldOf(me, [flagged], {
      duelInfo: { state: 'active', otherPid: 2 } as unknown as PvpHostileWorld['duelInfo'],
    });
    expect(isPvpHostilePlayer(duel, flagged)).toBe(true);
  });
});

describe('sim_i18n matcher: the World PvP lines round-trip', () => {
  it('re-localizes every notice, kill and defeat shape (English resolves to itself)', () => {
    setLanguage('en');
    const lines = [
      'World PvP enabled: other flagged players can attack you.',
      'World PvP disabled.',
      'World PvP stays enabled.',
      'World PvP will be disabled in 5 minutes.',
      'World PvP is already enabled.',
      'World PvP is already disabled.',
      'World PvP is already switching off.',
      `You must be at least level ${WORLD_PVP_MIN_LEVEL} to enable World PvP.`,
      'Usage: /pvp, /pvp on, or /pvp off.',
      worldPvpKillLine('Bet', 0, 1),
      worldPvpKillLine('Bet', 1_234, 1),
      worldPvpKillLine('Bet', 50_000, 3),
      worldPvpDefeatLine('Aleph', 0, 1),
      worldPvpDefeatLine('Aleph', 700, 1),
      worldPvpDefeatLine('Aleph', 0, 3),
      worldPvpDefeatLine('Aleph', 700, 3),
    ];
    for (const line of lines) {
      const localized = localizeSimText(line);
      expect(localized, line).not.toBeNull();
    }
    // Names splice through verbatim and the money re-formats through the locale.
    expect(localizeSimText(worldPvpKillLine('Bet', 1_234, 1))).toContain('Bet');
    expect(localizeSimText(worldPvpDefeatLine('Aleph', 700, 3))).toContain('Aleph and 2 others');
  });
});
