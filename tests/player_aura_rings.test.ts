import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PlayerAuraRings } from '../src/render/player_aura_rings';
import { playerAuraOrnamentSpec } from '../src/render/player_aura_rings_core';

const input = (id: string) => ({
  id,
  visible: true,
  color: '#33ccff',
  opacity: 0.7,
  scale: 1,
});

describe('PlayerAuraRings procedural ornaments', () => {
  it('builds the spell-specific number and kind of ornaments on every visible ring', () => {
    const rings = new PlayerAuraRings('high', true);
    rings.setRings([input('raised_guard'), input('iron_resolve')]);

    const raised = rings.group.children.filter((child) =>
      child.name.startsWith('player_aura_ornament_raised_guard_'),
    );
    const resolve = rings.group.children.filter((child) =>
      child.name.startsWith('player_aura_ornament_iron_resolve_'),
    );

    expect(raised).toHaveLength(playerAuraOrnamentSpec('raised_guard').count);
    expect(resolve).toHaveLength(playerAuraOrnamentSpec('iron_resolve').count);
    expect(raised.every((child) => child.name.endsWith('_shield'))).toBe(true);
    expect(resolve.every((child) => child.name.endsWith('_diamond'))).toBe(true);
  });

  it('orbits ornaments around their own ring while keeping them terrain-grounded', () => {
    const rings = new PlayerAuraRings('high', true);
    rings.setRings([input('revenge_free')]);
    const ornament = rings.group.children.find((child) =>
      child.name.startsWith('player_aura_ornament_revenge_free_'),
    );
    expect(ornament).toBeDefined();

    rings.update(true, 0, -40, 0, 1234, Number.NEGATIVE_INFINITY, 0);
    const first = ornament?.position.clone();
    rings.update(true, 0, -40, 0, 1234, Number.NEGATIVE_INFINITY, 1);

    expect(ornament?.position.x).not.toBeCloseTo(first?.x ?? 0);
    expect(ornament?.position.y).toBeGreaterThan(Number.NEGATIVE_INFINITY);
  });

  it('reduces low-tier ornament density without disabling orbit animation', () => {
    const rings = new PlayerAuraRings('low', false);
    rings.setRings([input('sudden_death')]);
    const ornaments = rings.group.children.filter((child) =>
      child.name.startsWith('player_aura_ornament_sudden_death_'),
    );
    expect(ornaments).toHaveLength(5);

    rings.update(true, 0, -40, 0, 1234, Number.NEGATIVE_INFINITY, 0);
    const first = ornaments[0].position.clone();
    rings.update(true, 0, -40, 0, 1234, Number.NEGATIVE_INFINITY, 1);

    expect(ornaments[0].position.x).not.toBeCloseTo(first.x);
  });

  it('applies progressively richer low, medium, and high ring presentation', () => {
    const build = (tier: 'low' | 'medium' | 'high', bloom: boolean) => {
      const rings = new PlayerAuraRings(tier, bloom);
      rings.setRings([input('sudden_death')]);
      rings.update(true, 0, -40, 0, 1234, Number.NEGATIVE_INFINITY, 0);
      const meshes = rings.group.children.filter(
        (child): child is THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial> =>
          child instanceof THREE.Mesh && child.geometry instanceof THREE.RingGeometry,
      );
      return {
        ringSegments: meshes[0].geometry.parameters.thetaSegments,
        glowOpacity: meshes[0].material.opacity,
        coreRed: meshes[1].material.color.r,
      };
    };

    const low = build('low', false);
    const medium = build('medium', false);
    const high = build('high', true);

    expect(low.ringSegments).toBe(32);
    expect(medium.ringSegments).toBe(48);
    expect(high.ringSegments).toBe(64);
    expect(low.glowOpacity).toBeLessThan(medium.glowOpacity);
    expect(medium.glowOpacity).toBeLessThan(high.glowOpacity);
    expect(low.coreRed).toBeCloseTo(medium.coreRed);
    expect(high.coreRed).toBeGreaterThan(medium.coreRed);
  });

  it('stops cosmetic orbit and pulse motion and hides the group when requested', () => {
    const rings = new PlayerAuraRings('high', true);
    rings.setRings([input('hot_streak')]);
    const ornament = rings.group.children.find((child) =>
      child.name.startsWith('player_aura_ornament_hot_streak_'),
    );
    const materials = rings.group.children
      .filter((child): child is THREE.Mesh => child instanceof THREE.Mesh)
      .map((child) => child.material)
      .filter(
        (material): material is THREE.MeshBasicMaterial =>
          material instanceof THREE.MeshBasicMaterial,
      );

    rings.update(true, 0, -40, 0, 1234, Number.NEGATIVE_INFINITY, 0, true);
    const first = ornament?.position.clone();
    const firstOpacities = materials.map((material) => material.opacity);
    rings.update(true, 0, -40, 0, 1234, Number.NEGATIVE_INFINITY, 10, true);

    expect(ornament?.position).toEqual(first);
    expect(materials.map((material) => material.opacity)).toEqual(firstOpacities);

    rings.update(true, 0, -40, 0, 1234, Number.NEGATIVE_INFINITY, 10, false);
    expect(materials.map((material) => material.opacity)).not.toEqual(firstOpacities);

    rings.update(false, 0, -40, 0, 1234, Number.NEGATIVE_INFINITY, 10, true);
    expect(rings.group.visible).toBe(false);
  });

  it('wires production graphics quality, bloom, and reduced motion into the ring renderer', () => {
    const renderer = readFileSync(new URL('../src/render/renderer.ts', import.meta.url), 'utf8');

    expect(renderer).toContain('new PlayerAuraRings(GFX.tier, GFX.composer)');
    expect(renderer).toMatch(
      /this\.playerAuraRings\.update\([\s\S]*?this\.reducedMotion\(\),[\s\S]*?\);/,
    );
  });
});
