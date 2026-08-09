import { describe, expect, it } from 'vitest';
import {
  buildIgnivarWaterConduit,
  isIgnivarWaterConduitTemplate,
  isStableIgnivarWaterConduitTransition,
  syncIgnivarWaterConduitVisibility,
} from '../src/render/ignivar_conduit';
import { IGNIVAR_WATER_CONDUIT_TEMPLATES } from '../src/sim/ignivar_arena';

describe('Ignivar water conduit renderer', () => {
  it('recognizes only the stable encounter conduit templates', () => {
    expect(IGNIVAR_WATER_CONDUIT_TEMPLATES).toEqual({
      ready: 'ignivar_water_conduit_ready',
      active: 'ignivar_water_conduit_active',
      cooldown: 'ignivar_water_conduit_cooldown',
    });
    expect(isIgnivarWaterConduitTemplate(IGNIVAR_WATER_CONDUIT_TEMPLATES.ready)).toBe(true);
    expect(isIgnivarWaterConduitTemplate(IGNIVAR_WATER_CONDUIT_TEMPLATES.active)).toBe(true);
    expect(isIgnivarWaterConduitTemplate(IGNIVAR_WATER_CONDUIT_TEMPLATES.cooldown)).toBe(true);
    expect(isIgnivarWaterConduitTemplate('dungeon_exit')).toBe(false);
    expect(isIgnivarWaterConduitTemplate('ignivar_water_conduit')).toBe(false);
    expect(isIgnivarWaterConduitTemplate('ignivar_water_conduit_broken')).toBe(false);
    expect(
      isStableIgnivarWaterConduitTransition(
        IGNIVAR_WATER_CONDUIT_TEMPLATES.ready,
        IGNIVAR_WATER_CONDUIT_TEMPLATES.active,
      ),
    ).toBe(true);
    expect(
      isStableIgnivarWaterConduitTransition(
        IGNIVAR_WATER_CONDUIT_TEMPLATES.active,
        IGNIVAR_WATER_CONDUIT_TEMPLATES.cooldown,
      ),
    ).toBe(true);
    expect(
      isStableIgnivarWaterConduitTransition(IGNIVAR_WATER_CONDUIT_TEMPLATES.ready, 'dungeon_exit'),
    ).toBe(false);
  });

  it('keeps every non-lootable encounter state visible through renderer sync', () => {
    for (const templateId of Object.values(IGNIVAR_WATER_CONDUIT_TEMPLATES)) {
      const group = buildIgnivarWaterConduit(templateId).group;
      group.visible = false;
      expect(syncIgnivarWaterConduitVisibility(group, templateId, false)).toBe(true);
      expect(group.visible).toBe(true);
      expect(syncIgnivarWaterConduitVisibility(group, templateId, true)).toBe(false);
      expect(group.visible).toBe(false);
      expect(syncIgnivarWaterConduitVisibility(group, templateId, false, false)).toBe(false);
      expect(group.visible).toBe(false);
    }
  });

  it('keeps one stable view and reveals the water jet only while active', () => {
    const ready = buildIgnivarWaterConduit(IGNIVAR_WATER_CONDUIT_TEMPLATES.ready);
    const active = buildIgnivarWaterConduit(IGNIVAR_WATER_CONDUIT_TEMPLATES.active);
    const cooldown = buildIgnivarWaterConduit(IGNIVAR_WATER_CONDUIT_TEMPLATES.cooldown);

    expect(ready.height).toBe(3.6);
    expect(ready.group.name).toBe('ignivarWaterConduit');
    expect(active.group.name).toBe('ignivarWaterConduit');
    expect(cooldown.group.name).toBe('ignivarWaterConduit');
    expect(ready.group.getObjectByName('ignivarWaterConduit:ready')?.visible).toBe(true);
    expect(ready.group.getObjectByName('ignivarWaterConduit:active')?.visible).toBe(false);
    expect(active.group.getObjectByName('ignivarWaterJet')).toBeDefined();
    expect(active.group.getObjectByName('ignivarWaterCleanseZone')).toBeDefined();
    expect(active.group.getObjectByName('ignivarWaterConduit:active')?.visible).toBe(true);
    expect(cooldown.group.getObjectByName('ignivarWaterConduit:active')?.visible).toBe(false);
    expect(cooldown.group.getObjectByName('ignivarWaterConduit:cooldown')?.visible).toBe(true);
    const readyState = ready.group.getObjectByName('ignivarWaterConduit:ready');
    const cooldownState = cooldown.group.getObjectByName('ignivarWaterConduit:cooldown');
    expect(readyState?.getObjectByName('ignivarWaterReadyMarker')).toBeDefined();
    expect(readyState?.getObjectByName('ignivarWaterCooldownSeal')).toBeUndefined();
    expect(cooldownState?.getObjectByName('ignivarWaterCooldownSeal')).toBeDefined();
    expect(cooldownState?.getObjectByName('ignivarWaterReadyMarker')).toBeUndefined();

    syncIgnivarWaterConduitVisibility(ready.group, IGNIVAR_WATER_CONDUIT_TEMPLATES.active, false);
    expect(ready.group.getObjectByName('ignivarWaterConduit:ready')?.visible).toBe(false);
    expect(ready.group.getObjectByName('ignivarWaterConduit:active')?.visible).toBe(true);
  });

  it('clones the group while sharing its immutable graybox geometry', () => {
    const first = buildIgnivarWaterConduit(IGNIVAR_WATER_CONDUIT_TEMPLATES.ready).group;
    const second = buildIgnivarWaterConduit(IGNIVAR_WATER_CONDUIT_TEMPLATES.ready).group;
    const firstBase = first.getObjectByName('ignivarWaterConduit:ready')?.children[0];
    const secondBase = second.getObjectByName('ignivarWaterConduit:ready')?.children[0];

    expect(first).not.toBe(second);
    expect(firstBase).not.toBe(secondBase);
    if (!firstBase || !secondBase) throw new Error('Ignivar conduit base did not render');
    expect('geometry' in firstBase && 'geometry' in secondBase).toBe(true);
    if (!('geometry' in firstBase) || !('geometry' in secondBase)) {
      throw new Error('Ignivar conduit base must render as a mesh');
    }
    expect(firstBase.geometry).toBe(secondBase.geometry);
  });
});
