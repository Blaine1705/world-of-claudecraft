// @vitest-environment happy-dom
// Pins for the World PvP tab's pure view core (src/ui/hud/world_pvp/), its
// painter's markup and button wiring, the shared client hostility verdict
// (src/ui/pvp_hostile_core.ts), the ClientWorld decode of the wpvp self key
// (src/net/social_self_wire.ts), and the sim-string matcher rules that
// re-localize the flag's notices and kill lines (src/ui/sim_i18n.ts).
import { describe, expect, it } from 'vitest';
import { applySocialSelfWire, type SocialSelfMirrors } from '../src/net/social_self_wire';
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
  disarmClockText,
  WORLD_PVP_STAKES,
  wireWorldPvpPanel,
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
    expect(WORLD_PVP_STAKES.minLevel).toBe(10);
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
});

describe('worldPvpBodyHtml', () => {
  it('formats the disarm clock as m:ss through the formatters', () => {
    setLanguage('en');
    expect(disarmClockText(300)).toBe('5:00');
    expect(disarmClockText(61)).toBe('1:01');
    expect(disarmClockText(9)).toBe('0:09');
    expect(disarmClockText(-3)).toBe('0:00');
  });

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
    expect(down).toContain('10%'); // the fraction, through the percent formatter
    expect(down).toContain('/pvp toggles the flag');
    expect(down).toContain('data-focus-key="wpvp-action"');
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
    expect(locked).toContain('Requires level 10.');
  });
});

describe('wireWorldPvpPanel', () => {
  function mount(view: ReturnType<typeof buildWorldPvpWindowView>) {
    setLanguage('en');
    const el = document.createElement('div');
    el.innerHTML = worldPvpBodyHtml(view);
    const flags: boolean[] = [];
    const confirms: boolean[] = [];
    wireWorldPvpPanel(el, {
      world: () => ({ setWorldPvpFlag: (on: boolean) => flags.push(on) }) as never,
      setConfirming: (c) => confirms.push(c),
    });
    const click = (act: string) => {
      const btn = el.querySelector<HTMLElement>(`[data-act="${act}"]`);
      if (!btn) throw new Error(`no ${act} button`);
      btn.click();
    };
    return { click, flags, confirms };
  }

  it('the raise is a two-step confirm; lowering and keeping are one press each', () => {
    const down = mount(buildWorldPvpWindowView({ info: info(), honor: 0, confirming: false }));
    down.click('pvp-enable');
    expect(down.confirms).toEqual([true]);
    expect(down.flags).toEqual([]);
    const confirming = mount(buildWorldPvpWindowView({ info: info(), honor: 0, confirming: true }));
    confirming.click('pvp-cancel');
    expect(confirming.confirms).toEqual([false]);
    expect(confirming.flags).toEqual([]);
    confirming.click('pvp-confirm');
    expect(confirming.confirms).toEqual([false, false]);
    expect(confirming.flags).toEqual([true]);
    const up = mount(
      buildWorldPvpWindowView({ info: info({ flagged: true }), honor: 0, confirming: false }),
    );
    up.click('pvp-disable');
    expect(up.flags).toEqual([false]);
    const disarming = mount(
      buildWorldPvpWindowView({
        info: info({ flagged: true, disarmRemaining: 30 }),
        honor: 0,
        confirming: false,
      }),
    );
    disarming.click('pvp-keep');
    expect(disarming.flags).toEqual([true]);
  });

  it('a locked raise button is inert', () => {
    const locked = mount(
      buildWorldPvpWindowView({ info: info({ levelLocked: true }), honor: 0, confirming: false }),
    );
    locked.click('pvp-enable');
    expect(locked.confirms).toEqual([]);
    expect(locked.flags).toEqual([]);
  });
});

describe('applySocialSelfWire: the wpvp self key (the ClientWorld mirror)', () => {
  const mirrors = (): SocialSelfMirrors => ({
    tradeInfo: null,
    duelInfo: null,
    arenaInfo: null,
    bgInfo: null,
    dungeonFinderInfo: null,
    dungeonFinderBoard: null,
    cardMinigameInfo: { queued: false, available: true, match: null },
    honor: 0,
    lifetimeHonor: 0,
    marketInfo: null,
    marketCollectPending: false,
    mailInfo: null,
    mailUnread: 0,
    worldPvpInfo: null,
  });

  it('adopts a readout, keeps it when the key is omitted, clears it on null', () => {
    const target = mirrors();
    const readout = info({ flagged: true, kills: 2 });
    applySocialSelfWire(target, { wpvp: readout });
    expect(target.worldPvpInfo).toBe(readout);
    applySocialSelfWire(target, { honor: 5 });
    expect(target.worldPvpInfo).toBe(readout);
    expect(target.honor).toBe(5);
    applySocialSelfWire(target, { wpvp: null });
    expect(target.worldPvpInfo).toBeNull();
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

  it('inside a live battleground or arena the world arm is off (a flagged teammate is never red)', () => {
    const me = player(1, { pvpFlag: true });
    const teammate = player(2, { pvpFlag: true });
    const inBg = worldOf(me, [teammate], {
      bgInfo: {
        match: { state: 'active', myTeam: 0, players: [{ pid: 2, team: 0 }] },
      } as unknown as PvpHostileWorld['bgInfo'],
    });
    expect(isPvpHostilePlayer(inBg, teammate)).toBe(false);
    const inArena = worldOf(me, [teammate], {
      arenaInfo: {
        match: { state: 'active', oppPid: 7, enemies: [] },
      } as unknown as PvpHostileWorld['arenaInfo'],
    });
    expect(isPvpHostilePlayer(inArena, teammate)).toBe(false);
  });
});

describe('sim_i18n matcher: the World PvP lines round-trip', () => {
  it('re-localizes every notice, kill and defeat shape (English resolves to itself)', () => {
    setLanguage('en');
    const lines = [
      'World PvP enabled: other flagged players can attack you.',
      'World PvP enabled: you aided a flagged player in combat.',
      'World PvP disabled.',
      'World PvP stays enabled.',
      'World PvP will be disabled in 5 minutes.',
      'World PvP is already enabled.',
      'World PvP is already disabled.',
      'World PvP is already switching off.',
      'World PvP is disabled on this realm.',
      'World PvP: wait a moment before switching again.',
      `You must be at least level ${WORLD_PVP_MIN_LEVEL} to enable World PvP.`,
      'Usage: /pvp, /pvp on, or /pvp off.',
      worldPvpKillLine('Bet', 0, 1),
      worldPvpKillLine('Bet', 1_234, 1),
      worldPvpKillLine('Bet', 50_000, 3),
      worldPvpDefeatLine('Aleph', 0, 1),
      worldPvpDefeatLine('Aleph', 700, 1),
      worldPvpDefeatLine('Aleph', 0, 2),
      worldPvpDefeatLine('Aleph', 700, 2),
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
    expect(localizeSimText(worldPvpDefeatLine('Aleph', 700, 2))).toContain('Aleph and 1 other');
  });
});
