import { describe, expect, it } from 'vitest';
import {
  type FeatureFootprint,
  featureEdgeDistance,
  isZoneFeatureVisible,
} from '../src/render/zone_feature_visibility_core';

// The Willowfen's feature group, roughly: a zone-spanning band of geometry in
// the x[-540,-180] z[180,700] rectangle. Measured live at 17,214,888 triangles,
// submitted every frame from anywhere in the world because zone features were
// frustum-culled and nothing more.
const FEN: FeatureFootprint = { centerX: -360, centerZ: 440, halfX: 180, halfZ: 260 };

describe('zone feature distance visibility', () => {
  it('measures to the footprint EDGE, not its centre', () => {
    // The distinction is load-bearing: these groups can be hundreds of yards
    // across, so a centre-distance test would hide a hedge maze the player is
    // standing at the corner of. Just inside the west edge:
    expect(featureEdgeDistance(FEN, -539, 440)).toBe(0);
    expect(isZoneFeatureVisible(FEN, -539, 440, 165)).toBe(true);
    // ...and 100 yd east of the east edge is 100, not ~280 from the centre.
    expect(featureEdgeDistance(FEN, -80, 440)).toBe(100);
  });

  it('hides a group the fog has already swallowed, at the measured positions', () => {
    // The Evergarden spot the 28.5M reading came from. 740 yd from the
    // Willowfen against a garden fog far of 630, so all 17.2M of its triangles
    // were being submitted to draw exactly zero pixels.
    expect(featureEdgeDistance(FEN, 442, 1102)).toBeCloseTo(740.6, 1);
    expect(isZoneFeatureVisible(FEN, 442, 1102, 630)).toBe(false);

    // The Drakelands, right across the map: 1500 yd, hidden under any preset.
    expect(featureEdgeDistance(FEN, 360, 2100)).toBeCloseTo(1500.5, 1);
    expect(isZoneFeatureVisible(FEN, 360, 2100, 850)).toBe(false);

    // But the cull stays conservative where it genuinely is close. The Mirefen
    // spot is 162 yd out against a marsh far of 165, so it still draws: this
    // hides only what the fog had already made invisible, never anything the
    // player could have seen.
    expect(featureEdgeDistance(FEN, -18, 256)).toBe(162);
    expect(isZoneFeatureVisible(FEN, -18, 256, 165)).toBe(true);
  });

  it('uses the same boundary as the terrain cull, so ground and props agree', () => {
    // terrain.ts hides a chunk at `distance < fogFar`; a feature standing on
    // ground that is no longer drawn must not outlive it.
    expect(isZoneFeatureVisible(FEN, -80, 440, 100)).toBe(false);
    expect(isZoneFeatureVisible(FEN, -80, 440, 100.5)).toBe(true);
  });

  it('is diagonal-aware rather than axis-aligned', () => {
    // Off the north-east corner: 3-4-5 from the corner, not the larger of the
    // two axis gaps.
    expect(featureEdgeDistance(FEN, -180 + 30, 700 + 40)).toBeCloseTo(50, 9);
  });

  it('keeps a group visible when its bounds could not be measured', () => {
    // An empty group yields no Box3, and blanking a feature because we failed
    // to measure it would be a far worse failure than drawing it.
    expect(isZoneFeatureVisible(null, 0, 0, 1)).toBe(true);
    expect(isZoneFeatureVisible(null, 99_400, 0, 45)).toBe(true);
  });

  it('never hides a group the player is standing inside', () => {
    for (const far of [45, 100, 165, 630]) {
      expect(isZoneFeatureVisible(FEN, FEN.centerX, FEN.centerZ, far)).toBe(true);
    }
  });
});
