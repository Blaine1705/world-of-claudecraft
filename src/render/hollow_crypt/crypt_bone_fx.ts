// The necromancers' bones (plan: crypt_trash_kit_fx_core.ts; host:
// crypt_trash_kit_fx.ts):
//
//  - Reassemble. While a fallen Ossuary Warrior's bones lie (the bodyless
//    `crypt_bone_pile` mob on its corpse), a soul-green rune ring pulses under
//    them, a slow breath that quickens to a frantic heartbeat over the
//    template's 8 s; bone chips rattle and soul wisps rise off it; a soul
//    tether runs from the nearest living Gravecaller Necromancer to the pile,
//    its light flowing down into the bones (kill the necromancer). When the
//    warrior stands (the rig's flourish, Skeletons_Awaken_Standing, plays on
//    the revive edge), bone shards are drawn in from all round and it rises
//    out of a column of soul fire; when the pile is broken or its master
//    falls, the glow dies, the bones scatter and a dust puff settles.
//  - Grave Rupture. Soul wisps boil off the marked corpse over the bar; on the
//    land a shadow-green ghost-fire blast, bone shards flying, dark smoke, a
//    white-green flash scorched into the floor and two shockwaves out to the
//    ring. The heroic pool burns as bubbling necrotic tar with sickly light in
//    its veins until its object goes (its edge is crypt_trash_fx.ts's
//    telegraph ring).
//  - Splinter Burst. Bone splinters flung out of a Bone Minion's burst.
//  - Marrow Crush. The Bone Brute's smash tears a fissure down its narrow
//    cone, dust bursting up along it, rock chips jumping.
//
// The pile's glow and tether and the pool's body draw on every tier; the
// particles shed with the host's density.

import * as THREE from 'three';
import {
  CRYPT_BONE_PILE,
  CRYPT_BONES_CRUMBLE,
  CRYPT_GRAVE_RUPTURE,
  CRYPT_REASSEMBLE,
  CRYPT_RUPTURE_POOL,
  CRYPT_RUPTURE_RING,
  CRYPT_SPLINTER_BURST,
} from '../../sim/mob/trash_kit/cast_ids';
import type { Entity, SimEvent } from '../../sim/types';
import { coneSpot, shockwave } from './crypt_creature_fx_core';
import { drapePolar, HALO_FRAG, NOISE_GLSL, SHOCK_FRAG } from './crypt_fx_floor';
import type { CryptKitHost, KitBeam, KitGlyph, KitPatch } from './crypt_trash_kit_fx';
import { KIT_STEPS } from './crypt_trash_kit_fx';
import {
  BONE_WHITE,
  CRUMBLE,
  CRYPT_KIT_MOBS,
  hazardLevel,
  MARROW_CRACK,
  marrowCrack,
  marrowCrushCone,
  nearestWithin,
  PILE_TETHER_REACH,
  pileGlow,
  pileProgress,
  pilePulseHz,
  pileRattleRate,
  REASSEMBLE_GATHER,
  RUPTURE_BLAST,
  reassembleSeconds,
  ruptureScorch,
  ruptureSpec,
  SOUL_GREEN,
  splinterReach,
} from './crypt_trash_kit_fx_core';

const PILE_SLOTS = 6;
const POOL_SLOTS = 3;
const SCORCH_SLOTS = 3;
const CRACK_SLOTS = 2;
const SHOCK_SLOTS = 8;
const FLASH_SLOTS = 6;
const SCAN_SEC = 0.1;
/** A pile's tether is drawn from the necromancer's chest. */
const CHEST = 2.1;

/** The soul-green rune ring under a pile: an outer band, an inner ring, runes
 *  turning between them and a wisping core, beating with the countdown. */
const PILE_FRAG = /* glsl */ `
uniform float uTime;
uniform float uRing;
uniform float uCore;
uniform float uFade;
uniform float uSpin;
varying vec2 vPolar;
varying vec3 vLocal;
${NOISE_GLSL}
void main() {
  float r = vPolar.x;
  float band = 1.0 - smoothstep(0.0, 0.065, abs(r - 0.84));
  float inner = 1.0 - smoothstep(0.0, 0.03, abs(r - 0.6));
  float seg = fract(vPolar.y * 14.0 + uSpin);
  float rune = step(0.18, seg) * step(seg, 0.52) * (1.0 - smoothstep(0.0, 0.05, abs(r - 0.72)));
  float n = fbm(vLocal.xz * 1.3 + vec2(uTime * 0.35, -uTime * 0.25));
  float k = max(1.0 - r, 0.0);
  float core = k * k * (0.45 + 0.75 * n) * uCore;
  float halo = smoothstep(0.84, 1.0, r) * (1.0 - smoothstep(0.92, 1.0, r)) * 0.6;
  float lit = band * uRing + inner * 0.7 * uRing + rune * 0.85 * uRing + core + halo * uRing;
  vec3 deep = vec3(0.08, 0.34, 0.1);
  vec3 hot = vec3(0.7, 1.0, 0.62);
  vec3 col = mix(deep, hot, clamp(lit * 0.7, 0.0, 1.0)) * (0.9 + 0.55 * lit);
  gl_FragColor = vec4(col, clamp(lit, 0.0, 1.0) * uFade);
}
`;

/** The soul tether: a hot core with pulses flowing from the necromancer (A)
 *  down into the bones (B). */
const TETHER_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform float uAlpha;
varying vec2 vUv;
void main() {
  float across = abs(vUv.x - 0.5) * 2.0;
  float core = 1.0 - smoothstep(0.0, 0.3, across);
  float soft = 1.0 - smoothstep(0.15, 1.0, across);
  float flow = fract(vUv.y * 4.0 - uTime * 1.6);
  float pulse = smoothstep(0.0, 0.12, flow) * (1.0 - smoothstep(0.12, 0.55, flow));
  float ends = smoothstep(0.0, 0.05, vUv.y) * (1.0 - smoothstep(0.95, 1.0, vUv.y));
  float a = (core * 0.85 + soft * 0.3 + pulse * soft * 0.9) * ends * uAlpha;
  gl_FragColor = vec4(uColor * (1.0 + 1.4 * core + 1.2 * pulse), a);
}
`;

/** The burst corpse's crater: a white-green flash, then charred ash with
 *  grave-green embers glowing in its cracks and spokes. */
const SCORCH_FRAG = /* glsl */ `
uniform float uFlash;
uniform float uChar;
uniform float uEmbers;
varying vec2 vPolar;
varying vec3 vLocal;
${NOISE_GLSL}
void main() {
  float r = vPolar.x;
  float n = fbm(vLocal.xz * 0.8);
  float edge = 1.0 - smoothstep(0.62, 1.0, r + (n - 0.5) * 0.35);
  float cracks = 1.0 - smoothstep(0.02, 0.08, abs(fbm(vLocal.xz * 1.5 + 3.0) - 0.5));
  float sp = abs(sin(vPolar.y * 6.2831 * 5.5 + n * 3.0));
  sp = sp * sp;
  sp = sp * sp;
  sp = sp * sp;
  float glow = uEmbers * edge * max(cracks, sp * (1.0 - r));
  float flash = uFlash * (1.0 - smoothstep(0.0, 1.0, r));
  vec3 ash = vec3(0.02, 0.035, 0.025);
  vec3 hot = vec3(0.55, 1.0, 0.45) * 1.8;
  vec3 col = mix(ash, hot, clamp(glow + flash, 0.0, 1.0)) + vec3(0.9, 1.0, 0.85) * flash * 1.5;
  float a = clamp(uChar * edge * (0.6 + 0.4 * n) + glow * 0.9 + flash, 0.0, 1.0);
  gl_FragColor = vec4(col, a);
}
`;

/** The heroic rupture pool: bubbling necrotic tar, sickly light in its veins
 *  and a lit rim, swirling. */
const POOL_FRAG = /* glsl */ `
uniform float uTime;
uniform float uLevel;
varying vec2 vPolar;
varying vec3 vLocal;
${NOISE_GLSL}
void main() {
  float r = vPolar.x;
  vec2 p = vLocal.xz;
  float sw = fbm(p * 0.7 + vec2(uTime * 0.35, -uTime * 0.27));
  float sw2 = fbm(p * 1.6 - vec2(uTime * 0.5, uTime * 0.2) + sw * 2.0);
  float edge = 1.0 - smoothstep(0.86, 1.0, r + (sw - 0.5) * 0.12);
  vec2 c = p * 1.3;
  vec2 ci = floor(c);
  vec2 cf = fract(c) - 0.5;
  float h = h21(ci);
  float life = fract(uTime * (0.5 + h) + h * 7.0);
  float bub = (1.0 - smoothstep(0.0, 0.06, abs(length(cf) - 0.36 * life))) * (1.0 - life) * step(0.5, h);
  float veins = 1.0 - smoothstep(0.03, 0.1, abs(sw2 - 0.5));
  float rim = smoothstep(0.76, 0.95, r) * edge;
  float lit = clamp(veins * 0.85 + bub * 1.3 + rim * 0.9 + 0.15 * sw2, 0.0, 1.0);
  vec3 col = mix(vec3(0.025, 0.05, 0.03), vec3(0.45, 1.0, 0.35) * 1.7, lit);
  gl_FragColor = vec4(col, clamp(edge * 0.84 + lit * 0.4, 0.0, 1.0) * uLevel);
}
`;

/** The Marrow Crush fissure torn down the cone (polar: x the reach, y across
 *  the arc), lit grave-green from below as it opens, a hot front at its tip. */
const CRACK_FRAG = /* glsl */ `
uniform float uReach;
uniform float uGlow;
uniform float uFade;
varying vec2 vPolar;
varying vec3 vLocal;
${NOISE_GLSL}
void main() {
  float r = vPolar.x;
  if (r > uReach) discard;
  float n = fbm(vLocal.xz * 1.4);
  float axis = abs(vPolar.y - 0.5 + (n - 0.5) * 0.22);
  float main = 1.0 - smoothstep(0.0, 0.03 + 0.03 * (1.0 - r), axis);
  float br = abs(fract(vPolar.y * 3.0 + r * 1.7 + n) - 0.5);
  float branches = (1.0 - smoothstep(0.0, 0.045, br)) * smoothstep(0.2, 0.55, r);
  float crack = max(main, branches * 0.8);
  float front = 1.0 - smoothstep(0.0, 0.08, abs(r - uReach));
  float stain = 0.3 * (0.55 + 0.45 * n) * (1.0 - smoothstep(0.7, 1.0, r));
  vec3 col = mix(vec3(0.5, 0.46, 0.4), vec3(0.025, 0.024, 0.022), crack);
  col += vec3(0.5, 1.0, 0.4) * crack * uGlow * 1.5 + vec3(1.0, 0.96, 0.86) * front * uGlow;
  float a = clamp(crack * 0.95 + stain + front * uGlow, 0.0, 1.0) * uFade;
  gl_FragColor = vec4(col, a);
}
`;

interface Pile {
  id: number;
  corpseId: number;
  born: number;
  phase: number;
  spin: number;
  x: number;
  y: number;
  z: number;
  necroId: number;
  rattle: number;
  wisp: number;
  /** Clock time the pile went (the glow then dies), or -1 while it lies. */
  dying: number;
  patch: KitPatch | null;
  tether: KitBeam | null;
}

interface Timed {
  patch: KitPatch;
  span: number;
  reach: number;
  color: readonly [number, number, number];
}

interface Flash {
  glyph: KitGlyph;
  span: number;
  size: number;
}

export class CryptBoneFx {
  private readonly piles: Pile[] = [];
  private readonly pileRings: KitPatch[] = [];
  private readonly tethers: KitBeam[] = [];
  private readonly pools: KitPatch[] = [];
  private readonly scorches: KitPatch[] = [];
  private readonly cracks: KitPatch[] = [];
  private readonly shocks: Timed[] = [];
  private readonly flashes: Flash[] = [];
  private readonly necros: { id: number; x: number; z: number }[] = [];
  private necroCount = 0;
  private readonly rings = new Set<number>();
  private readonly seconds: number;
  private readonly rupture = ruptureSpec();
  private readonly crush = marrowCrushCone();
  private readonly splinter = splinterReach();
  private scan = 0;
  private boil = 0;
  private bubble = 0;

  constructor(private readonly host: CryptKitHost) {
    this.seconds = reassembleSeconds();
    for (let i = 0; i < PILE_SLOTS; i++) {
      this.pileRings.push(
        host.patch(
          4,
          64,
          PILE_FRAG,
          {
            uRing: { value: 0 },
            uCore: { value: 0 },
            uFade: { value: 0 },
            uSpin: { value: 0 },
          },
          KIT_STEPS.pileGlow,
          true,
        ),
      );
      this.tethers.push(
        host.beam(
          TETHER_FRAG,
          { uColor: { value: rgb(SOUL_GREEN) }, uAlpha: { value: 0 } },
          KIT_STEPS.beam,
        ),
      );
    }
    for (let i = 0; i < POOL_SLOTS; i++) {
      this.pools.push(host.patch(6, 56, POOL_FRAG, { uLevel: { value: 0 } }, KIT_STEPS.hazardBody));
    }
    for (let i = 0; i < SCORCH_SLOTS; i++) {
      this.scorches.push(
        host.patch(
          7,
          56,
          SCORCH_FRAG,
          { uFlash: { value: 0 }, uChar: { value: 0 }, uEmbers: { value: 0 } },
          KIT_STEPS.scorch,
        ),
      );
    }
    for (let i = 0; i < CRACK_SLOTS; i++) {
      this.cracks.push(
        host.patch(
          14,
          24,
          CRACK_FRAG,
          { uReach: { value: 0 }, uGlow: { value: 0 }, uFade: { value: 0 } },
          KIT_STEPS.scorch,
        ),
      );
    }
    for (let i = 0; i < SHOCK_SLOTS; i++) {
      this.shocks.push({
        patch: host.patch(
          5,
          64,
          SHOCK_FRAG,
          { uColor: { value: rgb(SOUL_GREEN) }, uAlpha: { value: 0 } },
          KIT_STEPS.shock,
          true,
        ),
        span: 0,
        reach: 0,
        color: SOUL_GREEN,
      });
    }
    for (let i = 0; i < FLASH_SLOTS; i++) {
      this.flashes.push({
        glyph: host.glyph(
          HALO_FRAG,
          { uColor: { value: rgb(SOUL_GREEN) }, uAlpha: { value: 0 } },
          KIT_STEPS.glyph,
        ),
        span: 0,
        size: 0,
      });
    }
  }

  // ------------------------------------------------------------------ events

  handleEvent(ev: SimEvent): boolean {
    if (ev.type !== 'spellfx') return false;
    const world = this.host.world;
    if (ev.fx === 'windup' && ev.ability === CRYPT_REASSEMBLE) {
      const at = world.entities.get(ev.sourceId) ?? world.entities.get(ev.targetId);
      if (at) this.layPile(ev.sourceId, ev.targetId, at);
      return true;
    }
    if (ev.fx === 'nova' && ev.ability === CRYPT_REASSEMBLE) {
      const body = world.entities.get(ev.sourceId);
      const pile = this.piles.find((p) => p.corpseId === ev.sourceId && p.dying < 0);
      if (pile) this.letGo(pile);
      if (body) this.standUp(body);
      return true;
    }
    if (ev.fx === 'nova' && ev.ability === CRYPT_BONES_CRUMBLE) {
      const pile = this.piles.find((p) => p.id === ev.sourceId);
      const at = world.entities.get(ev.sourceId);
      if (pile) {
        this.crumble(pile.x, pile.y, pile.z);
        this.letGo(pile);
      } else if (at) this.crumble(at.pos.x, this.host.groundY(at.pos.x, at.pos.z), at.pos.z);
      return true;
    }
    if (ev.fx === 'nova' && ev.ability === CRYPT_GRAVE_RUPTURE) {
      const at = world.entities.get(ev.sourceId);
      if (at) this.ruptureBlast(at.pos.x, at.pos.z);
      return true;
    }
    if (ev.fx === 'nova' && ev.ability === CRYPT_SPLINTER_BURST) {
      const at = world.entities.get(ev.sourceId);
      if (at) this.splinterBurst(at.pos.x, at.pos.z);
      return true;
    }
    if (ev.fx === 'fireCone') {
      const src = world.entities.get(ev.sourceId);
      if (src?.templateId === CRYPT_KIT_MOBS.brute) {
        this.marrowCrush(src);
        return true;
      }
    }
    return false;
  }

  // ------------------------------------------------------------ the bone pile

  private layPile(id: number, corpseId: number, at: Entity): Pile | null {
    let pile = this.piles.find((p) => p.id === id);
    if (pile) {
      if (corpseId >= 0) pile.corpseId = corpseId;
      return pile;
    }
    if (this.piles.length >= PILE_SLOTS) {
      const oldest = this.piles.find((p) => p.dying >= 0) ?? this.piles[0];
      this.release(oldest);
    }
    const h = this.host;
    const x = at.pos.x;
    const z = at.pos.z;
    const y = h.groundY(x, z);
    const patch = this.pileRings.find((p) => p.owner < 0) ?? null;
    const tether = this.tethers.find((t) => t.owner < 0) ?? null;
    pile = {
      id,
      corpseId,
      born: h.now(),
      phase: 0,
      spin: 0,
      x,
      y,
      z,
      necroId: -1,
      rattle: 0,
      wisp: 0,
      dying: -1,
      patch,
      tether,
    };
    if (patch) {
      patch.owner = id;
      patch.born = h.now();
      drapePolar(patch.mesh, h.groundY, x, z, 2.3, 0.06);
      patch.mesh.visible = true;
    }
    if (tether) tether.owner = id;
    this.piles.push(pile);
    // The bones stir as the pile is laid: a puff of grave dust and a gasp of light.
    this.flash(x, y + 0.6, z, 2.6, 0.35, SOUL_GREEN);
    for (let i = 0; i < Math.round(16 * h.density); i++) this.wispAt(x, y, z, 1.4, 0);
    return pile;
  }

  /** The pile is gone: its glow dies over a beat; the tether goes at once. */
  private letGo(pile: Pile): void {
    if (pile.dying >= 0) return;
    pile.dying = this.host.now();
    if (pile.tether) {
      pile.tether.owner = -1;
      pile.tether.mesh.visible = false;
      pile.tether = null;
    }
  }

  private release(pile: Pile): void {
    if (pile.patch) {
      pile.patch.owner = -1;
      pile.patch.mesh.visible = false;
    }
    if (pile.tether) {
      pile.tether.owner = -1;
      pile.tether.mesh.visible = false;
    }
    const i = this.piles.indexOf(pile);
    if (i >= 0) this.piles.splice(i, 1);
  }

  /** The warrior stands: shards drawn in from all round, soul fire rising. */
  private standUp(body: Entity): void {
    const h = this.host;
    const x = body.pos.x;
    const z = body.pos.z;
    const y = h.groundY(x, z);
    const now = h.now();
    const g = REASSEMBLE_GATHER;
    const n = Math.round(70 * h.density);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + h.rand() * 0.3;
      const r = g.reach * (0.55 + 0.45 * h.rand());
      const sy = y + 0.2 + h.rand() * 1.6;
      const sx = x + Math.sin(a) * r;
      const sz = z + Math.cos(a) * r;
      const tx = x + (h.rand() - 0.5) * 0.6;
      const ty = y + 0.6 + h.rand() * 1.8;
      const tz = z + (h.rand() - 0.5) * 0.6;
      const life = g.seconds * (0.75 + 0.25 * h.rand());
      h.shards.emit(now + h.rand() * 0.08, {
        x: sx,
        y: sy,
        z: sz,
        vx: (tx - sx) / life,
        vy: (ty - sy) / life,
        vz: (tz - sz) / life,
        life,
        size0: 0.34 + h.rand() * 0.22,
        size1: 0.18,
        spin: (h.rand() - 0.5) * 14,
        r: BONE_WHITE[0],
        g: BONE_WHITE[1],
        b: BONE_WHITE[2],
        a: 1,
      });
      // A thread of soul light trailing each shard home.
      if (i % 2 === 0) {
        h.glow.emit(now, {
          x: sx,
          y: sy,
          z: sz,
          vx: (tx - sx) / life,
          vy: (ty - sy) / life,
          vz: (tz - sz) / life,
          life,
          size0: 0.5,
          size1: 0.2,
          r: SOUL_GREEN[0],
          g: SOUL_GREEN[1],
          b: SOUL_GREEN[2],
          a: 0.8,
        });
      }
    }
    // The column of soul fire it rises out of, as the shards arrive.
    const flames = Math.round(90 * h.density);
    for (let i = 0; i < flames; i++) {
      const a = h.rand() * Math.PI * 2;
      const r = 0.3 + h.rand() * 1.3;
      h.fire.emit(now + g.seconds * 0.6 + h.rand() * 0.55, {
        x: x + Math.sin(a) * r,
        y: y + 0.1,
        z: z + Math.cos(a) * r,
        vx: Math.sin(a) * 0.4,
        vy: 2.8 + h.rand() * 3.2,
        vz: Math.cos(a) * 0.4,
        ay: 2,
        life: 0.7 + h.rand() * 0.5,
        drag: 0.8,
        size0: 0.9 + h.rand() * 0.7,
        size1: 2.2 + h.rand() * 1.8,
        r: 0.9 + h.rand() * 0.3,
        g: 0,
        b: 0,
        a: 0.9,
      });
    }
    for (let i = 0; i < Math.round(50 * h.density); i++) {
      const a = h.rand() * Math.PI * 2;
      h.glow.emit(now + g.seconds * 0.7 + h.rand() * 0.6, {
        x: x + Math.sin(a) * 0.8,
        y: y + 0.4,
        z: z + Math.cos(a) * 0.8,
        vx: Math.cos(a) * 2.2,
        vy: 4 + h.rand() * 4,
        vz: -Math.sin(a) * 2.2,
        ay: -1,
        life: 1 + h.rand() * 0.8,
        drag: 1.2,
        size0: 0.22,
        size1: 0.06,
        r: SOUL_GREEN[0],
        g: SOUL_GREEN[1],
        b: SOUL_GREEN[2],
        a: 1,
      });
    }
    this.shock(x, z, 4.6, 0.55, SOUL_GREEN, g.seconds * 0.7);
    this.flash(x, y + 1.6, z, 5.5, 0.6, SOUL_GREEN, g.seconds * 0.65);
    h.shakeAt(x, z, 0.3);
  }

  /** The pile crumbles for good: the bones scatter and grave dust settles. */
  private crumble(x: number, y: number, z: number): void {
    const h = this.host;
    const now = h.now();
    const n = Math.round(46 * h.density);
    for (let i = 0; i < n; i++) {
      const a = h.rand() * Math.PI * 2;
      const sp = CRUMBLE.speed * (0.4 + h.rand() * 0.8);
      h.shards.emit(now, {
        x: x + Math.sin(a) * 0.5,
        y: y + 0.3 + h.rand() * 0.4,
        z: z + Math.cos(a) * 0.5,
        vx: Math.sin(a) * sp,
        vy: 2 + h.rand() * 4,
        vz: Math.cos(a) * sp,
        ay: -19,
        life: 1.2 + h.rand() * 0.5,
        floor: y + 0.06,
        size0: 0.3 + h.rand() * 0.25,
        size1: 0.26,
        spin: (h.rand() - 0.5) * 12,
        r: BONE_WHITE[0] * 0.9,
        g: BONE_WHITE[1] * 0.9,
        b: BONE_WHITE[2] * 0.9,
        a: 1,
      });
    }
    for (let i = 0; i < Math.round(26 * h.density); i++) {
      const a = (i / 26) * Math.PI * 2;
      const sp = 2.5 + h.rand() * 2;
      h.dust.emit(now + h.rand() * 0.05, {
        x,
        y: y + 0.3,
        z,
        vx: Math.sin(a) * sp,
        vy: 0.6 + h.rand(),
        vz: Math.cos(a) * sp,
        life: 1.4 + h.rand() * 0.6,
        drag: 2,
        floor: y + 0.15,
        size0: 0.9,
        size1: 2.8 + h.rand(),
        spin: (h.rand() - 0.5) * 0.6,
        r: 0.5,
        g: 0.49,
        b: 0.44,
        a: 0.55,
      });
    }
    // The last of the soul light escaping the bones.
    for (let i = 0; i < Math.round(14 * h.density); i++) this.wispAt(x, y, z, 1, 0);
  }

  // --------------------------------------------------------------- the rupture

  private ruptureBlast(x: number, z: number): void {
    const h = this.host;
    const y = h.groundY(x, z);
    const now = h.now();
    const reach = this.rupture.radius || 5;
    // The ghost-fire blast: tongues thrown out and up from the corpse.
    const flames = Math.round(150 * h.density);
    for (let i = 0; i < flames; i++) {
      const a = h.rand() * Math.PI * 2;
      const sp = 2 + h.rand() * 7;
      h.fire.emit(now + h.rand() * 0.06, {
        x: x + Math.sin(a) * 0.4,
        y: y + 0.3 + h.rand() * 0.8,
        z: z + Math.cos(a) * 0.4,
        vx: Math.sin(a) * sp,
        vy: 2 + h.rand() * 6,
        vz: Math.cos(a) * sp,
        ay: 2.5,
        life: 0.55 + h.rand() * 0.5,
        drag: 2.2,
        size0: 1 + h.rand() * 0.8,
        size1: 2.6 + h.rand() * 2.4,
        r: 1 + h.rand() * 0.3,
        g: 0,
        b: 0,
        a: 0.95,
      });
    }
    // Bone shards flung out of the corpse.
    const shards = Math.round(80 * h.density);
    for (let i = 0; i < shards; i++) {
      const a = h.rand() * Math.PI * 2;
      const sp = 8 + h.rand() * 12;
      h.shards.emit(now, {
        x,
        y: y + 0.5 + h.rand() * 0.5,
        z,
        vx: Math.sin(a) * sp,
        vy: 4 + h.rand() * 8,
        vz: Math.cos(a) * sp,
        ay: -24,
        life: 1.1 + h.rand() * 0.6,
        drag: 0.7,
        floor: y + 0.06,
        size0: 0.32 + h.rand() * 0.3,
        size1: 0.28,
        spin: (h.rand() - 0.5) * 18,
        r: BONE_WHITE[0],
        g: BONE_WHITE[1],
        b: BONE_WHITE[2],
        a: 1,
      });
    }
    // Dark necrotic smoke rolling up after it.
    for (let i = 0; i < Math.round(44 * h.density); i++) {
      const a = h.rand() * Math.PI * 2;
      const sp = 1.5 + h.rand() * 3.5;
      h.dust.emit(now + 0.05 + h.rand() * 0.2, {
        x: x + Math.sin(a) * 0.8,
        y: y + 0.6,
        z: z + Math.cos(a) * 0.8,
        vx: Math.sin(a) * sp,
        vy: 1.5 + h.rand() * 2.5,
        vz: Math.cos(a) * sp,
        ay: 0.6,
        life: 1.6 + h.rand() * 0.9,
        drag: 1.4,
        size0: 1.6,
        size1: 4.4 + h.rand() * 2,
        spin: (h.rand() - 0.5) * 0.5,
        r: 0.05,
        g: 0.09,
        b: 0.05,
        a: 0.6,
      });
    }
    // Sickly sparks.
    for (let i = 0; i < Math.round(90 * h.density); i++) {
      const a = h.rand() * Math.PI * 2;
      const up = h.rand();
      const sp = 6 + h.rand() * 10;
      h.glow.emit(now, {
        x,
        y: y + 0.8,
        z,
        vx: Math.sin(a) * sp * (1 - up * 0.5),
        vy: 3 + up * 9,
        vz: Math.cos(a) * sp * (1 - up * 0.5),
        ay: -9,
        life: 0.7 + h.rand() * 0.6,
        drag: 1.6,
        size0: 0.2,
        size1: 0.05,
        r: 0.7,
        g: 1,
        b: 0.55,
        a: 1,
      });
    }
    this.shock(x, z, reach * 1.08, 0.5, SOUL_GREEN);
    this.shock(x, z, reach * 0.72, 0.36, [0.92, 1, 0.86]);
    this.flash(x, y + 1.2, z, 7.5, 0.4, [0.8, 1, 0.7]);
    const scorch = this.scorches.find((s) => s.owner < 0) ?? this.scorches[0];
    drapePolar(scorch.mesh, h.groundY, x, z, reach * 0.9, 0.05);
    scorch.owner = 1;
    scorch.born = now;
    scorch.mesh.visible = true;
    h.shakeAt(x, z, 0.55);
  }

  // --------------------------------------------------------- the minion's burst

  private splinterBurst(x: number, z: number): void {
    const h = this.host;
    const y = h.groundY(x, z);
    const now = h.now();
    const n = Math.round(60 * h.density);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + h.rand() * 0.2;
      const sp = 10 + h.rand() * 11;
      h.shards.emit(now, {
        x,
        y: y + 0.7 + h.rand() * 0.6,
        z,
        vx: Math.sin(a) * sp,
        vy: 1.5 + h.rand() * 3.5,
        vz: Math.cos(a) * sp,
        ay: -16,
        life: 0.9 + h.rand() * 0.4,
        drag: 1.1,
        floor: y + 0.06,
        size0: 0.42 + h.rand() * 0.3,
        size1: 0.34,
        spin: (h.rand() - 0.5) * 22,
        r: BONE_WHITE[0],
        g: BONE_WHITE[1],
        b: BONE_WHITE[2],
        a: 1,
      });
      if (i % 2 === 0) {
        h.glow.emit(now, {
          x,
          y: y + 0.9,
          z,
          vx: Math.sin(a) * sp * 1.1,
          vy: 1 + h.rand() * 2,
          vz: Math.cos(a) * sp * 1.1,
          life: 0.35 + h.rand() * 0.2,
          drag: 2.6,
          size0: 0.3,
          size1: 0.08,
          r: 1,
          g: 0.95,
          b: 0.82,
          a: 0.9,
        });
      }
    }
    this.shock(x, z, (this.splinter || 3.5) * 1.1, 0.4, BONE_WHITE);
    h.shakeAt(x, z, 0.2);
  }

  // ------------------------------------------------------------ the crush

  private marrowCrush(e: Entity): void {
    const h = this.host;
    const { range, arcDeg } = this.crush;
    if (range <= 0) return;
    const now = h.now();
    const crack = this.cracks.find((c) => c.owner < 0) ?? this.cracks[0];
    drapePolar(crack.mesh, h.groundY, e.pos.x, e.pos.z, range, 0.05, e.facing, arcDeg);
    crack.owner = e.id;
    crack.born = now;
    crack.mesh.visible = true;
    const c = Math.cos(e.facing);
    const s = Math.sin(e.facing);
    const n = Math.round(40 * h.density);
    for (let i = 0; i < n; i++) {
      const spot = coneSpot(i, n, range, arcDeg, 0.8);
      const wx = e.pos.x + spot.x * c + spot.z * s;
      const wz = e.pos.z - spot.x * s + spot.z * c;
      const gy = h.groundY(wx, wz);
      const delay = (spot.r / range) * MARROW_CRACK.tear;
      h.dust.emit(now + delay, {
        x: wx,
        y: gy + 0.2,
        z: wz,
        vx: Math.sin(e.facing) * 2 + (h.rand() - 0.5) * 1.5,
        vy: 2 + h.rand() * 2.5,
        vz: Math.cos(e.facing) * 2 + (h.rand() - 0.5) * 1.5,
        ay: -1.2,
        life: 1.1 + h.rand() * 0.6,
        drag: 2,
        floor: gy + 0.15,
        size0: 1,
        size1: 3 + h.rand() * 1.4,
        spin: (h.rand() - 0.5) * 0.6,
        r: 0.55,
        g: 0.52,
        b: 0.47,
        a: 0.6,
      });
      if (i % 2 === 0) {
        h.shards.emit(now + delay, {
          x: wx,
          y: gy + 0.15,
          z: wz,
          vx: (h.rand() - 0.5) * 3,
          vy: 4 + h.rand() * 5,
          vz: (h.rand() - 0.5) * 3,
          ay: -22,
          life: 1,
          floor: gy + 0.05,
          size0: 0.28 + h.rand() * 0.22,
          size1: 0.24,
          spin: (h.rand() - 0.5) * 12,
          r: 0.42,
          g: 0.4,
          b: 0.37,
          a: 1,
        });
      }
    }
    h.shakeAt(e.pos.x, e.pos.z, 0.45);
  }

  // ------------------------------------------------------------- helpers

  private wispAt(x: number, y: number, z: number, spread: number, delay: number): void {
    const h = this.host;
    const a = h.rand() * Math.PI * 2;
    const r = h.rand() * spread;
    h.glow.emit(h.now() + delay, {
      x: x + Math.sin(a) * r,
      y: y + 0.2,
      z: z + Math.cos(a) * r,
      vx: Math.cos(a) * 0.5,
      vy: 1.2 + h.rand() * 1.4,
      vz: -Math.sin(a) * 0.5,
      ay: 0.4,
      life: 1.2 + h.rand() * 0.9,
      drag: 0.6,
      size0: 0.32 + h.rand() * 0.2,
      size1: 0.08,
      r: SOUL_GREEN[0],
      g: SOUL_GREEN[1],
      b: SOUL_GREEN[2],
      a: 0.85,
    });
  }

  private shock(
    x: number,
    z: number,
    reach: number,
    seconds: number,
    color: readonly [number, number, number],
    delay = 0,
  ): void {
    const slot = this.shocks.find((s) => s.patch.owner < 0) ?? this.shocks[0];
    drapePolar(slot.patch.mesh, this.host.groundY, x, z, reach, 0.05);
    slot.patch.owner = 1;
    slot.patch.born = this.host.now() + delay;
    slot.span = seconds;
    slot.reach = reach;
    slot.color = color;
    (slot.patch.mat.uniforms.uColor.value as THREE.Color).setRGB(color[0], color[1], color[2]);
    slot.patch.mat.uniforms.uAlpha.value = 0;
    slot.patch.mesh.scale.set(0.01, 1, 0.01);
    slot.patch.mesh.visible = true;
  }

  private flash(
    x: number,
    y: number,
    z: number,
    size: number,
    seconds: number,
    color: readonly [number, number, number],
    delay = 0,
  ): void {
    const slot = this.flashes.find((f) => f.glyph.owner < 0) ?? this.flashes[0];
    slot.glyph.owner = 1;
    slot.glyph.born = this.host.now() + delay;
    slot.span = seconds;
    slot.size = size;
    slot.glyph.mesh.position.set(x, y, z);
    (slot.glyph.mat.uniforms.uColor.value as THREE.Color).setRGB(color[0], color[1], color[2]);
    slot.glyph.mat.uniforms.uAlpha.value = 0;
    slot.glyph.mesh.visible = true;
  }

  // ----------------------------------------------------------------- frame

  update(dt: number): void {
    const h = this.host;
    const world = h.world;
    const now = h.now();
    this.scan -= dt;
    if (this.scan <= 0) {
      this.scan = SCAN_SEC;
      this.scanWorld();
    }
    for (let i = this.piles.length - 1; i >= 0; i--) this.stepPile(this.piles[i], dt);
    // The rupture's marked corpse boils with soul light over the bar.
    this.boil += dt * 22 * h.density;
    for (const id of this.rings) {
      const ring = world.entities.get(id);
      if (!ring) continue;
      const gy = h.groundY(ring.pos.x, ring.pos.z);
      const n = Math.min(4, Math.floor(this.boil));
      for (let k = 0; k < n; k++) this.wispAt(ring.pos.x, gy, ring.pos.z, 1.2, 0);
    }
    this.boil -= Math.floor(this.boil);
    this.bubble += dt * 16 * h.density;
    for (const pool of this.pools) {
      if (pool.owner < 0) continue;
      const gone = pool.goneAt >= 0 ? now - pool.goneAt : -1;
      const level = hazardLevel(now - pool.born, gone);
      pool.mat.uniforms.uLevel.value = level;
      if (level <= 0 && gone >= 0) {
        pool.owner = -1;
        pool.goneAt = -1;
        pool.mesh.visible = false;
        continue;
      }
      if (gone < 0 && this.bubble >= 1) {
        const r = (this.rupture.radius || 5) * 0.85 * Math.sqrt(h.rand());
        const a = h.rand() * Math.PI * 2;
        const px = pool.mesh.position.x + Math.sin(a) * r;
        const pz = pool.mesh.position.z + Math.cos(a) * r;
        h.glow.emit(now, {
          x: px,
          y: h.groundY(px, pz) + 0.1,
          z: pz,
          vx: 0,
          vy: 0.9 + h.rand() * 1.2,
          vz: 0,
          life: 0.8 + h.rand() * 0.6,
          drag: 0.8,
          size0: 0.3,
          size1: 0.7,
          r: 0.4,
          g: 0.9,
          b: 0.3,
          a: 0.55,
        });
      }
    }
    this.bubble -= Math.floor(this.bubble);
    for (const s of this.scorches) {
      if (s.owner < 0) continue;
      const ph = ruptureScorch(now - s.born);
      s.mat.uniforms.uFlash.value = ph.flash;
      s.mat.uniforms.uChar.value = ph.char;
      s.mat.uniforms.uEmbers.value = ph.embers;
      if (now - s.born > RUPTURE_BLAST.scorch) {
        s.owner = -1;
        s.mesh.visible = false;
      }
    }
    for (const c of this.cracks) {
      if (c.owner < 0) continue;
      const ph = marrowCrack(now - c.born);
      c.mat.uniforms.uReach.value = ph.reach;
      c.mat.uniforms.uGlow.value = ph.glow;
      c.mat.uniforms.uFade.value = ph.fade;
      if (now - c.born > MARROW_CRACK.seconds) {
        c.owner = -1;
        c.mesh.visible = false;
      }
    }
    for (const s of this.shocks) {
      if (s.patch.owner < 0) continue;
      const t = now - s.patch.born;
      if (t < 0) continue;
      const w = shockwave(t, s.reach, s.span);
      if (w.done) {
        s.patch.owner = -1;
        s.patch.mesh.visible = false;
        continue;
      }
      const k = w.radius / Math.max(s.reach, 1e-3);
      s.patch.mesh.scale.set(k, 1, k);
      s.patch.mat.uniforms.uAlpha.value = w.alpha;
    }
    for (const f of this.flashes) {
      if (f.glyph.owner < 0) continue;
      const t = now - f.glyph.born;
      if (t < 0) continue;
      const k = t / Math.max(f.span, 1e-3);
      if (k >= 1) {
        f.glyph.owner = -1;
        f.glyph.mesh.visible = false;
        continue;
      }
      f.glyph.mesh.scale.setScalar(f.size * (0.45 + 0.55 * Math.sqrt(k)));
      f.glyph.mat.uniforms.uAlpha.value = (1 - k) * (1 - k);
    }
  }

  private stepPile(pile: Pile, dt: number): void {
    const h = this.host;
    const now = h.now();
    if (pile.dying >= 0) {
      const k = (now - pile.dying) / CRUMBLE.glowFade;
      if (k >= 1) {
        this.release(pile);
        return;
      }
      if (pile.patch) pile.patch.mat.uniforms.uFade.value = (1 - k) * (1 - k);
      return;
    }
    const progress = pileProgress(now - pile.born, this.seconds);
    pile.phase += dt * pilePulseHz(progress);
    pile.spin += dt * (0.05 + 0.25 * progress);
    const glow = pileGlow(pile.phase, progress);
    if (pile.patch) {
      const u = pile.patch.mat.uniforms;
      u.uRing.value = glow.ring;
      u.uCore.value = glow.core;
      u.uFade.value = Math.min(1, (now - pile.born) / 0.2);
      u.uSpin.value = pile.spin;
    }
    // The soul tether from its necromancer, flowing down into the bones.
    const necro = pile.necroId >= 0 ? h.world.entities.get(pile.necroId) : undefined;
    if (pile.tether) {
      const on = !!necro && !necro.dead;
      pile.tether.mesh.visible = on;
      if (necro && on) {
        const u = pile.tether.mat.uniforms;
        const ny = h.groundY(necro.pos.x, necro.pos.z);
        (u.uA.value as THREE.Vector3).set(
          necro.pos.x,
          ny + CHEST * (necro.scale || 1),
          necro.pos.z,
        );
        (u.uB.value as THREE.Vector3).set(pile.x, pile.y + 0.35, pile.z);
        u.uWidth.value = 0.16 + 0.1 * Math.min(1, glow.ring);
        u.uSag.value = 0.8;
        u.uWave.value = 0.12;
        u.uAlpha.value = 0.45 + 0.35 * Math.min(1, glow.ring);
      }
    }
    // Bones rattling and soul wisps rising, quickening with the countdown.
    pile.rattle += dt * pileRattleRate(progress) * h.density;
    while (pile.rattle >= 1) {
      pile.rattle -= 1;
      const a = h.rand() * Math.PI * 2;
      const r = h.rand() * 1.2;
      h.shards.emit(now, {
        x: pile.x + Math.sin(a) * r,
        y: pile.y + 0.12,
        z: pile.z + Math.cos(a) * r,
        vx: (h.rand() - 0.5) * 1.4,
        vy: 1.5 + h.rand() * (1.5 + 2.5 * progress),
        vz: (h.rand() - 0.5) * 1.4,
        ay: -20,
        life: 0.5 + h.rand() * 0.3,
        floor: pile.y + 0.05,
        size0: 0.2 + h.rand() * 0.14,
        size1: 0.18,
        spin: (h.rand() - 0.5) * 16,
        r: BONE_WHITE[0],
        g: BONE_WHITE[1],
        b: BONE_WHITE[2],
        a: 1,
      });
    }
    pile.wisp += dt * (5 + 14 * progress) * h.density;
    while (pile.wisp >= 1) {
      pile.wisp -= 1;
      this.wispAt(pile.x, pile.y, pile.z, 1.3, 0);
    }
    // Light drawn down the tether into the bones.
    if (necro && !necro.dead && h.rand() < dt * 9 * h.density) {
      const ny = h.groundY(necro.pos.x, necro.pos.z) + CHEST * (necro.scale || 1);
      const life = 0.7;
      h.glow.emit(now, {
        x: necro.pos.x,
        y: ny,
        z: necro.pos.z,
        vx: (pile.x - necro.pos.x) / life,
        vy: (pile.y + 0.4 - ny) / life,
        vz: (pile.z - necro.pos.z) / life,
        life,
        size0: 0.4,
        size1: 0.2,
        r: SOUL_GREEN[0],
        g: SOUL_GREEN[1],
        b: SOUL_GREEN[2],
        a: 0.9,
      });
    }
  }

  private scanWorld(): void {
    const h = this.host;
    const world = h.world;
    const now = h.now();
    this.necroCount = 0;
    this.rings.clear();
    for (const e of world.entities.values()) {
      if (e.kind === 'object') {
        if (e.templateId === CRYPT_RUPTURE_RING) this.rings.add(e.id);
        else if (e.templateId === CRYPT_RUPTURE_POOL) this.holdPool(e);
        continue;
      }
      if (e.kind !== 'mob' || e.dead) continue;
      if (e.templateId === CRYPT_BONE_PILE) {
        const pile = this.layPile(e.id, -1, e);
        if (pile && pile.dying < 0) {
          pile.x = e.pos.x;
          pile.z = e.pos.z;
        }
      } else if (e.templateId === CRYPT_KIT_MOBS.necromancer) {
        if (this.necroCount >= this.necros.length) this.necros.push({ id: 0, x: 0, z: 0 });
        const slot = this.necros[this.necroCount++];
        slot.id = e.id;
        slot.x = e.pos.x;
        slot.z = e.pos.z;
      }
    }
    for (const pile of this.piles) {
      if (pile.dying >= 0) continue;
      const e = world.entities.get(pile.id);
      if (!e || e.dead) {
        this.letGo(pile);
        continue;
      }
      const i = nearestWithin(pile.x, pile.z, this.necros, this.necroCount, PILE_TETHER_REACH);
      pile.necroId = i >= 0 ? this.necros[i].id : -1;
    }
    for (const pool of this.pools) {
      if (pool.owner < 0 || pool.goneAt >= 0) continue;
      if (!world.entities.has(pool.owner)) pool.goneAt = now;
    }
  }

  private holdPool(e: Entity): void {
    if (this.pools.some((p) => p.owner === e.id)) return;
    const slot = this.pools.find((p) => p.owner < 0);
    if (!slot) return;
    const h = this.host;
    slot.owner = e.id;
    slot.born = h.now();
    slot.goneAt = -1;
    drapePolar(slot.mesh, h.groundY, e.pos.x, e.pos.z, e.scale || this.rupture.radius || 5, 0.05);
    slot.mat.uniforms.uLevel.value = 0;
    slot.mesh.visible = true;
  }
}

function rgb(c: readonly [number, number, number]): THREE.Color {
  return new THREE.Color(c[0], c[1], c[2]);
}
