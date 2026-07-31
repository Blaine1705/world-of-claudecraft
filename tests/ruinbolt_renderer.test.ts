import { describe, expect, it, vi } from 'vitest';
import { Renderer } from '../src/render/renderer';
import type { SimEvent } from '../src/sim/types';

interface RuinboltRendererHarness {
  handleEvent(event: SimEvent): void;
}

function makeHarness(sourceClass = 'warlock', claim = true) {
  const handleSpellfx = vi.fn(() => claim);
  const onDamage = vi.fn();
  const projectile = vi.fn();
  const meleeSpark = vi.fn();
  const renderer = Object.create(Renderer.prototype) as RuinboltRendererHarness & {
    abilityVfx: { handleSpellfx: typeof handleSpellfx; onDamage: typeof onDamage };
    vfx: { projectile: typeof projectile; meleeSpark: typeof meleeSpark };
    sim: {
      playerId: number;
      entities: Map<number, { kind: 'player'; templateId: string }>;
    };
    views: Map<number, never>;
    triggerAttack: ReturnType<typeof vi.fn>;
  };
  renderer.abilityVfx = { handleSpellfx, onDamage };
  renderer.vfx = { projectile, meleeSpark };
  renderer.sim = {
    playerId: 11,
    entities: new Map([[11, { kind: 'player', templateId: sourceClass }]]),
  };
  renderer.views = new Map<number, never>();
  renderer.triggerAttack = vi.fn();
  return { renderer, handleSpellfx, onDamage, projectile };
}

describe('Ruinbolt renderer routing', () => {
  it('claims the labeled Gloom Bolt projectile without spawning the generic shadow orb', () => {
    const harness = makeHarness();
    const event: SimEvent = {
      type: 'spellfx',
      sourceId: 11,
      targetId: 22,
      school: 'shadow',
      fx: 'projectile',
      ability: 'shadow_bolt',
    };

    harness.renderer.handleEvent(event);

    expect(harness.handleSpellfx).toHaveBeenCalledWith(event);
    expect(harness.projectile).not.toHaveBeenCalled();
  });

  it('claims the existing chaos_bolt heavyBolt without spawning the generic projectile', () => {
    const harness = makeHarness();
    const event: SimEvent = {
      type: 'spellfx',
      sourceId: 11,
      targetId: 22,
      school: 'shadow',
      fx: 'heavyBolt',
    };

    harness.renderer.handleEvent(event);

    expect(harness.handleSpellfx).toHaveBeenCalledWith({ ...event, ability: 'chaos_bolt' });
    expect(harness.projectile).not.toHaveBeenCalled();
  });

  it('routes only chaos_bolt damage into its premium impact painter', () => {
    const harness = makeHarness();
    const ruinbolt: SimEvent = {
      type: 'damage',
      sourceId: 11,
      targetId: 22,
      school: 'shadow',
      ability: 'Ruinbolt',
      kind: 'hit',
      amount: 142,
      crit: false,
    };

    harness.renderer.handleEvent(ruinbolt);

    expect(harness.onDamage).toHaveBeenCalledWith(ruinbolt);

    const unrelated = makeHarness();
    unrelated.renderer.handleEvent({ ...ruinbolt, ability: 'shadow_bolt' });
    expect(unrelated.onDamage).not.toHaveBeenCalled();
  });

  it('leaves unrelated heavy bolts on the existing generic renderer path', () => {
    const harness = makeHarness('mage');

    harness.renderer.handleEvent({
      type: 'spellfx',
      sourceId: 11,
      targetId: 22,
      school: 'fire',
      fx: 'heavyBolt',
      ability: 'pyroblast',
    });

    expect(harness.handleSpellfx).not.toHaveBeenCalled();
    expect(harness.projectile).toHaveBeenCalledWith(11, 22, 'fire', 2);
  });
});
