// Riding-lesson next-gate beacon: a pulsing light pillar + ground ring the renderer
// parks at the gate the player must ride to next, so the active gate is easy to find
// on the flagged course. Cosmetic only: it is driven entirely from
// IWorld.mountTrainingView() (phase 'ride' + nextGate) and conveys nothing the HUD
// panel does not already show. It reads no governor/tier state.
//
// Reuses the yellow-orange summon-glow palette (vfx.mountSummonGlow) for visual
// consistency with the mount summon. A gate-advance edge kicks a brief flash so a
// cleared gate reads as progress; the whole thing hides the moment the view goes null.

import * as THREE from 'three';
import type { MountTrainingView } from '../world_api';

// The summon-glow palette (cream / amber / ember), boosted so the composer bloom
// picks the beacon up on the tiers that run it.
const AMBER = new THREE.Color(0xffb347).multiplyScalar(2.2);
const CREAM = new THREE.Color(0xffe0a0).multiplyScalar(2.2);
const PILLAR_HEIGHT = 7;

export class MountBeacon {
  private readonly group = new THREE.Group();
  private readonly pillarMat: THREE.MeshBasicMaterial;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private readonly ring: THREE.Mesh;
  private lastSessionId = '';
  private lastGate = -1;
  private flash = 0;

  constructor(
    scene: THREE.Object3D,
    private readonly groundAt: (x: number, z: number) => number,
  ) {
    this.pillarMat = new THREE.MeshBasicMaterial({
      color: AMBER.clone(),
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.ringMat = new THREE.MeshBasicMaterial({
      color: CREAM.clone(),
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    // A slightly tapered vertical column rising from the gate.
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.5, PILLAR_HEIGHT, 12, 1, true),
      this.pillarMat,
    );
    pillar.position.y = PILLAR_HEIGHT / 2;
    // A flat ground ring the pillar stands in.
    this.ring = new THREE.Mesh(new THREE.RingGeometry(1.7, 2.4, 28), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.08;
    this.group.add(pillar, this.ring);
    this.group.visible = false;
    this.group.renderOrder = 3;
    scene.add(this.group);
  }

  /** Per-frame update from the authoritative view. Positions the beacon at the next
   *  gate while riding, pulses it, and hides it otherwise. `time` is the renderer's
   *  shared clock (seconds); `dt` the frame delta. */
  update(view: MountTrainingView | null, time: number, dt: number): void {
    const gate = view && view.phase === 'ride' ? view.nextGate : null;
    if (!view || !gate) {
      this.group.visible = false;
      this.lastSessionId = '';
      this.lastGate = -1;
      this.flash = 0;
      return;
    }
    // Gate-advance edge (same session, higher gate index): kick a brief flash.
    if (view.sessionId === this.lastSessionId && view.gate > this.lastGate) this.flash = 1;
    this.lastSessionId = view.sessionId;
    this.lastGate = view.gate;
    this.flash = Math.max(0, this.flash - dt * 2.6);

    this.group.position.set(gate.x, this.groundAt(gate.x, gate.z), gate.z);
    this.group.visible = true;
    // Continuous breathing pulse plus the fading advance flash.
    const pulse = 0.5 + 0.5 * Math.sin(time * 3.4);
    this.pillarMat.opacity = 0.3 + 0.22 * pulse + 0.4 * this.flash;
    this.ringMat.opacity = 0.42 + 0.28 * pulse + 0.5 * this.flash;
    const ringScale = 1 + 0.12 * pulse + 0.5 * this.flash;
    this.ring.scale.set(ringScale, ringScale, ringScale);
  }
}
