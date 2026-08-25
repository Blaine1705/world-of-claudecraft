// @vitest-environment happy-dom
// Graduation teardown: the coach borrows the shared #ui root (the whole HUD)
// and must never remove it. The v0.40 ferry-crossing freeze was exactly this:
// disengage() called root.remove() after the coach refactor re-pointed root
// from its own card to #ui, so riding the ferry off the island deleted the
// entire HUD subtree and every later Hud.update() threw on a null lookup.

import { beforeEach, describe, expect, it } from 'vitest';
import { BootcampOverlay } from '../src/ui/bootcamp';

describe('BootcampOverlay.disengage', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="ui"><div id="petbar"></div></div>';
  });

  it('removes only its own nodes, never the shared #ui root', () => {
    const coach = new BootcampOverlay();
    (coach as unknown as { ensureDom(): void }).ensureDom();
    const ownNodes = document.querySelectorAll('#ui .tut-prompt, #ui .tut-glow').length;
    expect(ownNodes, 'the coach minted its own nodes into #ui').toBeGreaterThan(0);

    (coach as unknown as { disengage(): void }).disengage();

    expect(document.getElementById('ui'), '#ui survives graduation').not.toBeNull();
    expect(document.getElementById('petbar'), 'HUD siblings survive graduation').not.toBeNull();
    expect(
      document.querySelectorAll('#ui .tut-prompt, #ui .tut-glow, #ui .tut-voice').length,
      'the coach cleans up every node it minted',
    ).toBe(0);
  });

  it('mints the coach DOM from a MID-LESSON resume, not only from the arrival caption', () => {
    // The keepsake-ring round regression: a session resuming with the rail
    // station already active never fires the one-shot arrival caption, and
    // captions had become the only ensureDom() caller, so every instruction
    // bubble no-oped for the whole session. Engagement itself must mint.
    const coach = new BootcampOverlay();
    const world = {
      playerId: 1,
      player: { id: 1, pos: { x: -300, y: 0, z: 50 }, dead: false, hp: 100 },
      cfg: { playerClass: 'warrior' },
      questLog: new Map([['q_ps_strike_true', { state: 'active' }]]),
      questState: () => null,
      entities: new Map(),
    } as never;
    const renderer = {
      camYaw: 0,
      worldToScreen: () => ({ x: Number.NaN, y: Number.NaN }),
    } as never;
    const keybinds = { capFor: () => 'F', movementCaps: () => ({}) } as never;

    coach.update(world, renderer, keybinds);

    expect(
      document.querySelectorAll('#ui .tut-prompt').length,
      'engagement minted the instruction bubble without any caption firing',
    ).toBe(1);
  });

  it('re-engages cleanly after a teardown (the return ferry)', () => {
    const coach = new BootcampOverlay();
    const priv = coach as unknown as { ensureDom(): void; disengage(): void };
    priv.ensureDom();
    priv.disengage();
    priv.ensureDom();
    expect(document.querySelectorAll('#ui .tut-prompt').length, 'one prompt, not zero or two').toBe(
      1,
    );
  });
});
