import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { farMeshShown } from '../src/render/characters/far_lod_reveal_core';
import {
  characterFormReadyMask,
  characterFormVisibility,
  requestedCharacterForm,
  resolvedCharacterForm,
} from '../src/render/characters/form_visual_selection_core';
import {
  anyCharacterRigDrawing,
  applyCharacterFormVisibility,
  ENTITY_GATE_STAND_INS,
  entityHasNoBody,
} from '../src/render/entity_gate_stand_in_core';

// THE INVERSE INVARIANT of the live compile gates: never leave an entity with
// no representation. A gate exists so a still-linking program is not drawn; it
// is only fair while SOMETHING else still tells the player the entity is there
// (the link is not cancellable and the gate timeout is diagnostic only, so the
// window is unbounded). Every gate call site names its stand-in in
// ENTITY_GATE_STAND_INS, this file drives that stand-in, and the coverage pin
// below reds on any gate call site that has not registered one.

const rendererSource = () =>
  readFileSync(new URL('../src/render/renderer.ts', import.meta.url), 'utf8');

function rig(visible: boolean): { root: { visible: boolean }; setActive(on: boolean): void } {
  const node = {
    root: { visible },
    setActive(on: boolean) {
      node.root.visible = on;
    },
  };
  return node;
}

function slots(overrides: Record<string, unknown> = {}) {
  return {
    visual: null,
    sheepVisual: null,
    bearVisual: null,
    catVisual: null,
    travelVisual: null,
    metamorphVisual: null,
    fireballTravelVisual: null,
    ...overrides,
  } as never;
}

describe('entity gate stand-in registry', () => {
  it('names a stand-in for every registered gate call site', () => {
    expect(ENTITY_GATE_STAND_INS.length).toBeGreaterThan(0);
    for (const row of ENTITY_GATE_STAND_INS) {
      expect(row.standIn.trim(), `${row.gate} stand-in`).not.toBe('');
      expect(row.hides.trim(), `${row.gate} hides`).not.toBe('');
      expect(row.callSite.trim(), `${row.gate} call site`).not.toBe('');
    }
  });

  it('covers every live gate call site in the renderer (a new gate must register one)', () => {
    const gates = ['gateViewOnCompile', 'gateSwapOnCompile', 'gateSwapFlagOnCompile'] as const;
    const lines = rendererSource().split('\n');
    for (const gate of gates) {
      const callSites = lines.filter((line) => line.includes(`this.${gate}(`));
      expect(callSites.length, `${gate} has call sites`).toBeGreaterThan(0);
      const registered = ENTITY_GATE_STAND_INS.filter((row) => row.gate === gate);
      for (const line of callSites) {
        const match = registered.find((row) => line.includes(row.callSite));
        expect(
          match?.standIn,
          `unregistered ${gate} call site (name its stand-in in ENTITY_GATE_STAND_INS): ${line.trim()}`,
        ).toBeTruthy();
      }
      // ...and no row may pin a call site that has been moved or dropped.
      for (const row of registered) {
        expect(
          callSites.some((line) => line.includes(row.callSite)),
          `stale registry row: ${row.callSite}`,
        ).toBe(true);
      }
    }
  });
});

describe('entity gate stand-ins actually stand in', () => {
  it('arrival gate: no body at all, so the nameplate is forced on', () => {
    // The one gate with no in-world stand-in: it hides the whole group, so
    // entityHasNoBody reports true and nameplatePlanInto overrides the toggles.
    expect(entityHasNoBody(true, true, false)).toBe(true);
  });

  it('shapeshift form gate: the base body draws, so no plate is forced', () => {
    const sheep = rig(false);
    const base = rig(true);
    const requested = requestedCharacterForm(1); // polymorph
    // Built but still linking: the readiness mask holds the resolved form at base.
    const pendingMask = characterFormReadyMask(sheep, null, null, null, null, sheep.root);
    const pending = characterFormVisibility(resolvedCharacterForm(requested, pendingMask));
    const view = slots({ visual: base, sheepVisual: sheep });
    applyCharacterFormVisibility(view, pending, false);
    expect(base.root.visible).toBe(true);
    expect(sheep.root.visible).toBe(false);
    expect(anyCharacterRigDrawing(view)).toBe(true);
    expect(entityHasNoBody(false, true, true)).toBe(false);

    // ...and once it links the sheep takes over and the body steps back.
    const readyMask = characterFormReadyMask(sheep, null, null, null, null, null);
    const ready = characterFormVisibility(resolvedCharacterForm(requested, readyMask));
    applyCharacterFormVisibility(view, ready, false);
    expect(base.root.visible).toBe(false);
    expect(sheep.root.visible).toBe(true);
    expect(anyCharacterRigDrawing(view)).toBe(true);
  });

  it('base-visual swap gate: the outgoing rig is the drawing body', () => {
    const outgoing = rig(true);
    const incoming = rig(true);
    const view = slots({ visual: incoming });
    // The base body is gated by its own swap: applyCharacterFormVisibility hides
    // the incoming rig, and the outgoing one (still parented, see
    // tests/renderer_compile_gate.test.ts) is what the player sees.
    applyCharacterFormVisibility(view, characterFormVisibility('base'), true);
    expect(incoming.root.visible).toBe(false);
    expect(anyCharacterRigDrawing(view)).toBe(false);
    expect(anyCharacterRigDrawing(slots({ visual: outgoing }))).toBe(true);
  });

  it('far-bake gate: the articulated rig stands in until the baked mesh links', () => {
    expect(farMeshShown(true, true, true)).toBe(false); // pending: rig keeps drawing
    expect(farMeshShown(true, true, false)).toBe(true); // settled: mesh takes over
  });

  it('mount and weapon gates: the character keeps drawing throughout', () => {
    // Both hide only an accessory node, never the body, so the rider/wearer is
    // the stand-in and no plate is forced.
    const body = rig(true);
    expect(anyCharacterRigDrawing(slots({ visual: body }))).toBe(true);
    expect(entityHasNoBody(false, true, true)).toBe(false);
  });

  it('counts the bespoke fireball travel body, and leaves rigless object views alone', () => {
    // The Mage travel form takes every rig out of the frame on purpose; its own
    // visual is the body, so it must not trip the forced-plate stand-in.
    expect(anyCharacterRigDrawing(slots({ fireballTravelVisual: {} }))).toBe(true);
    // An object view (door, loot) owns no rig at all: only the arrival gate,
    // which hides its group too, can leave it unrepresented.
    expect(entityHasNoBody(false, false, false)).toBe(false);
  });
});
