// The Stormbrass Foundry's set dressing: the Blender kit instanced over the
// layout (foundry_kit.ts: every sim prop, the edge dressing, the rail loop,
// the catwalk trusses, the pour line, the molten channel's trough, the
// skyline in the drop), the kit pieces that move (foundry_machines.ts: crane
// jibs, flywheels, gears, piston rods, ladles), the Main Line's four conveyor
// belts with their scrolling chevrons, running in their kit housings into
// the Stamping Press (its hammers are foundry_press.ts), the molten brass and
// its sparks (foundry_molten.ts) and the steam and smoke of every vent, valve
// and stack (foundry_steam.ts).
//
// Motion is shader-side on the shared clock, or one matrix write per moving
// mesh in its own onBeforeRender: no per-frame JavaScript pass, nothing off
// screen costs anything. Everything here is cosmetic.

import * as THREE from 'three';
import {
  MAIN_LINE_BELTS,
  STORMBRASS_FOUNDRY_FIELD,
} from '../../sim/content/stormbrass_foundry_layout';
import { sharedUniforms } from '../gfx';
import { BRIDGE_SPARK_GATE, craneBridgeSeats } from './foundry_bridge_core';
import { buildFoundryKitDressing, upgradeWhenKitLands } from './foundry_kit';
import {
  type FoundryEmitter,
  planFoundryEmitters,
  planFoundryKitPlacements,
} from './foundry_kit_plan_core';
import { buildFoundryMachines } from './foundry_machines';
import { buildFoundryMolten } from './foundry_molten';
import { COIL_TOP, planFoundryPlumes } from './foundry_plan_core';
import { buildPressHammers } from './foundry_press';
import type { SparkEmitter } from './foundry_sparks';
import { buildFoundrySteam } from './foundry_steam';

type Ground = (x: number, z: number) => number;

// ---- the Main Line: belts, the Stamping Press ------------------------------------------

const BELT_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Chevrons scrolling toward the press (uDir > 0) or back to the chute (< 0),
// uDir in units of 3 yd a second (0: the belt stands still, its chevrons still
// pointing toward the press); hazard edges down both sides. The Line-Master's
// conveyors (G19) drive uDir and uAlarm (the red chevrons of a reversal) per
// belt through FOUNDRY_BELT_UNIFORMS.
const BELT_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uDir;
uniform float uAlarm;
uniform float uLength;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  float along = vUv.y * uLength;
  float across = vUv.x - 0.5;
  float scroll = along - uTime * 3.0 * uDir;
  float heading = uDir < 0.0 ? -1.0 : 1.0;
  float chev = fract((scroll - abs(across) * 3.0 * heading) / 3.0);
  float arrow = smoothstep(0.56, 0.59, chev) * smoothstep(0.76, 0.73, chev);
  // Worn rubber slats riding the rollers: every slat a groove, scuffs and
  // grime drifting with the belt, a dull sheen down the middle.
  float slat = fract(scroll * 1.6);
  float groove = smoothstep(0.0, 0.08, slat) * smoothstep(1.0, 0.92, slat);
  float grime = noise(vec2(vUv.x * 9.0, scroll * 0.7));
  float scuff = noise(vec2(vUv.x * 2.5 + 7.0, scroll * 0.18));
  vec3 rubber = vec3(0.055, 0.057, 0.062) * (0.55 + 0.45 * groove) * (0.75 + 0.5 * grime);
  rubber += vec3(0.05, 0.052, 0.058) * smoothstep(0.35, 0.0, abs(across)) * (0.4 + 0.6 * scuff);
  // The heading chevrons: brass-yellow paint worn through by the load (red
  // while the lever's klaxon warns of a reversal).
  vec3 paint = mix(vec3(0.46, 0.3, 0.055), vec3(0.95, 0.2, 0.12), uAlarm);
  float worn = 0.45 + 0.55 * smoothstep(0.25, 0.7, scuff) * (0.6 + 0.4 * grime);
  vec3 col = mix(rubber, paint * (0.8 + 0.3 * grime), arrow * mix(worn, 1.0, uAlarm) * 0.9);
  // The steel lacing strip down each edge, bolted every half yard.
  float edge = smoothstep(0.455, 0.465, abs(across));
  float bolt = smoothstep(0.22, 0.1, length(vec2(fract(scroll * 2.0) - 0.5, (abs(across) - 0.48) * 12.0)));
  col = mix(col, vec3(0.16, 0.165, 0.18) + bolt * 0.22, edge);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

/** Each belt's run, shared by every built Foundry (one claim is in view at a
 *  time): the encounter painter (foundry_fx.ts) writes them from the belts'
 *  encounter objects, so offline and online scroll alike. Idle (0) until the
 *  Line-Master's fight starts them. */
export const FOUNDRY_BELT_UNIFORMS: readonly {
  uDir: { value: number };
  uAlarm: { value: number };
}[] = MAIN_LINE_BELTS.xs.map(() => ({ uDir: { value: 0 }, uAlarm: { value: 0 } }));

function buildBelts(ground: Ground): THREE.Group {
  const group = new THREE.Group();
  group.name = 'stormbrassBelts';
  const len = MAIN_LINE_BELTS.z1 - MAIN_LINE_BELTS.z0;
  MAIN_LINE_BELTS.xs.forEach((x, i) => {
    const material = new THREE.ShaderMaterial({
      name: `stormbrassBelt${i}`,
      vertexShader: BELT_VERT,
      fragmentShader: BELT_FRAG,
      uniforms: {
        uTime: sharedUniforms.uTime,
        uDir: FOUNDRY_BELT_UNIFORMS[i].uDir,
        uAlarm: FOUNDRY_BELT_UNIFORMS[i].uAlarm,
        uLength: { value: len },
      },
    });
    const geo = new THREE.PlaneGeometry(MAIN_LINE_BELTS.halfWidth * 2, len).rotateX(-Math.PI / 2);
    // PlaneGeometry's v runs +y; after the tilt it runs toward -z: a half turn
    // about y (winding kept, still facing up) makes v run from the chute (z0)
    // to the press (z1).
    geo.rotateY(Math.PI);
    const mesh = new THREE.Mesh(geo, material);
    const zc = (MAIN_LINE_BELTS.z0 + MAIN_LINE_BELTS.z1) / 2;
    mesh.position.set(x, ground(x, zc) + 0.04, zc);
    mesh.name = `stormbrassBelt:${i}`;
    mesh.userData.beltIndex = i;
    mesh.receiveShadow = true;
    group.add(mesh);
  });
  return group;
}

/** Every steam and smoke source: the kit's vents, valves and stacks, and the
 *  plumes climbing the mountain's face below the rim (fewer on the low tier). */
function steamSources(lowGfx: boolean): FoundryEmitter[] {
  const placed = planFoundryKitPlacements().filter(
    (p) => !(lowGfx && p.piece === 'Kit_BoilerHouse'),
  );
  const out = planFoundryEmitters(placed);
  for (const pl of planFoundryPlumes(lowGfx ? 0 : 1)) {
    out.push({ kind: 'smoke', x: pl.x, y: pl.y, z: pl.z, w: pl.w, h: pl.h, seed: pl.seed });
  }
  return out;
}

/** The shower the great coil throws when a strike lands (gate 3, opened by
 *  the strike clock in foundry_landmarks.ts). */
function coilStrikeSparks(): SparkEmitter[] {
  return [
    {
      x: COIL_TOP.x,
      y: COIL_TOP.y + 2.5,
      z: COIL_TOP.z,
      vx: 0,
      vy: 3,
      vz: 0,
      spread: 17,
      life: 1.6,
      gravity: 12,
      size: 0.34,
      count: 220,
      hue: 1,
      gate: 3,
    },
  ];
}

/** The showers where the Crane Bridge's span grinds onto its seats (the
 *  gate's rig opens the gate over the last yard of the lowering). */
function bridgeSeatSparks(): SparkEmitter[] {
  // A fountain off each seat's whole width, and a low sheet skittering out
  // across the deck from under the span.
  return craneBridgeSeats().flatMap((s) => [
    {
      x: s.x,
      y: s.y,
      z: s.z,
      vx: 0,
      vy: 7.5,
      vz: 0,
      spread: 7,
      life: 1.3,
      gravity: 11,
      size: 0.22,
      count: 260,
      hue: 0,
      gate: BRIDGE_SPARK_GATE,
      across: { x: 9, z: 0 },
    },
    {
      x: s.x,
      y: s.y + 0.1,
      z: s.z,
      vx: 0,
      vy: 1.2,
      vz: 0,
      spread: 9,
      life: 0.8,
      gravity: 6,
      size: 0.16,
      count: 160,
      hue: 0,
      gate: BRIDGE_SPARK_GATE,
      across: { x: 9, z: 0 },
    },
  ]);
}

/** Build the kit dressing, the machines, the belts, the hot metal, the steam. */
export function buildFoundryDressing(ground: Ground, lowGfx: boolean, density = 1): THREE.Group {
  const group = new THREE.Group();
  group.name = 'stormbrassDressing';
  group.add(buildFoundryKitDressing(lowGfx));
  const machines = buildFoundryMachines();
  upgradeWhenKitLands(machines, () => buildFoundryMachines());
  group.add(machines);
  group.add(buildBelts(ground));
  group.add(buildPressHammers(ground));
  const grinder = STORMBRASS_FOUNDRY_FIELD.props.find((p) => p.kind === 'sf_grinder') ?? null;
  group.add(
    buildFoundryMolten({
      lowGfx,
      density,
      extraSparks: [...coilStrikeSparks(), ...bridgeSeatSparks()],
      grinder,
    }),
  );
  const steam = buildFoundrySteam(steamSources(lowGfx));
  if (steam) group.add(steam);
  return group;
}
