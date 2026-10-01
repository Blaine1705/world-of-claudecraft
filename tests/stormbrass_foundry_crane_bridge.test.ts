// The Stormbrass Foundry's Crane Bridge (src/render/stormbrass_foundry/
// foundry_gates.ts craneBridge, its numbers from foundry_plan_core.ts
// craneBridgeDeck): once it opens, every yard a body walks between the Crane
// Landing and the Drafting Yard is drawn, by the bridge's deck or by the
// terrain the field painter lays. The ramp used to stop 4 yd short of the
// yard's lip, leaving a walkable band over the void with nothing drawn.

import { describe, expect, it } from 'vitest';
import { drawnTopAt, planFieldTops } from '../src/render/authored_field/field_mesh_core';
import { craneBridgeDeck } from '../src/render/stormbrass_foundry/foundry_plan_core';
import {
  CRANE_BRIDGE,
  DRAFTING_YARD,
  MAIN_LINE,
  STORMBRASS_FOUNDRY_FIELD,
} from '../src/sim/content/stormbrass_foundry_layout';
import { authoredFieldHeight } from '../src/sim/instances/authored_field';

describe('the Crane Bridge, extended', () => {
  const tops = planFieldTops(STORMBRASS_FOUNDRY_FIELD, { maxEdge: 3, layerLift: 0 });
  const deck = craneBridgeDeck();

  it('reaches from inside the Crane Landing onto the Drafting Yard', () => {
    expect(deck.fromZ).toBeLessThanOrEqual(MAIN_LINE.z1);
    expect(deck.toZ).toBeGreaterThanOrEqual(DRAFTING_YARD.z0);
  });

  it('draws a floor under every walked yard of its span, at the walked height', () => {
    let worst = 0;
    let samples = 0;
    const gaps: string[] = [];
    for (let z = CRANE_BRIDGE.fromZ - 4; z <= DRAFTING_YARD.z0 + 4; z += 0.5) {
      for (const x of [-4, 0, 4]) {
        const walked = authoredFieldHeight(STORMBRASS_FOUNDRY_FIELD, x, z);
        let drawn = deck.deckAt(z);
        if (Number.isNaN(drawn)) drawn = drawnTopAt(tops.stone, x, z);
        if (Number.isNaN(drawn)) drawn = drawnTopAt(tops.soil, x, z);
        if (Number.isNaN(drawn)) {
          gaps.push(`${x},${z}`);
          continue;
        }
        samples++;
        // Where the deck and the yard overlap the higher top is what shows.
        const tops3 = [drawn, drawnTopAt(tops.stone, x, z), drawnTopAt(tops.soil, x, z)];
        const top = Math.max(...tops3.filter((h) => !Number.isNaN(h)));
        worst = Math.max(worst, Math.abs(top - walked));
      }
    }
    expect(gaps).toEqual([]);
    expect(samples).toBeGreaterThan(200);
    expect(worst).toBeLessThan(0.1);
  });
});
