// The Prime Draft's cable terminal: where its two gantry cables end. The model
// (prime_draft_model_core.ts) carries both cables as its own skinned moorings
// mesh, and their far ends are fixed in the MODEL's frame, 7.4 model yards
// behind it and 7.4 up. Nothing stood there, so the cables ended in the air.
// This draws what they are plugged into: a riveted junction box with two
// porcelain bushings, hung from the gantry scaffold's head by a thick feeder
// cable (the scaffold stands on the Gantry's north lip behind the Draft).
//
// The Draft crawls while it is bolted (the sim's boltedSpeed), so the terminal
// FOLLOWS the cable ends: the box is pulled along by the cables and its feeder
// swings from the scaffold's head, never leaving the cables hanging in the
// air. Once the Draft tears free (the moorings are hidden) the box stays where
// it hung, its feeder slack, until a reset pull moors it again.
//
// Cosmetic (no telegraph, nothing a player reacts to): one merged PartBin mesh
// per shared foundry material and one stretched cylinder, built at
// construction under the creature effects' root, which attaches through the
// compile gate; a frame writes two transforms and allocates nothing.

import * as THREE from 'three';
import { foundryMaterial, PartBin } from './foundry_mesh';
import {
  DRAFT_TETHER,
  draftCableTerminal,
  draftFeederHead,
  type TetherPoint,
} from './prime_draft_tether_core';

const UP = new THREE.Vector3(0, 1, 0);

export class FoundryDraftTether {
  private readonly box: THREE.Group;
  private readonly feeder: THREE.Mesh;
  private readonly feederGeo: THREE.CylinderGeometry;
  private readonly at: TetherPoint = { x: 0, y: 0, z: 0 };
  private readonly head: TetherPoint = { x: 0, y: 0, z: 0 };
  private readonly dir = new THREE.Vector3();
  private readonly home: TetherPoint = { x: 0, y: 0, z: 0 };
  private homed = false;

  constructor(parent: THREE.Object3D) {
    const T = DRAFT_TETHER;
    const bin = new PartBin();
    // The junction box (its centre on the origin), strapped in brass, a
    // hazard band round its waist, the hanger eye on its roof.
    bin.box('iron', 0, 0, 0, T.boxHalf.x, T.boxHalf.y, T.boxHalf.z);
    bin.box('brass', 0, T.boxHalf.y - 0.1, 0, T.boxHalf.x + 0.06, 0.07, T.boxHalf.z + 0.06);
    bin.box('brass', 0, -T.boxHalf.y + 0.1, 0, T.boxHalf.x + 0.06, 0.07, T.boxHalf.z + 0.06);
    bin.box('hazard', 0, 0, 0, T.boxHalf.x + 0.03, 0.16, T.boxHalf.z + 0.03);
    bin.ring('iron', 0, T.boxHalf.y + 0.28, 0, 0.3, 0.09);
    bin.cyl('iron', 0, T.boxHalf.y, T.boxHalf.y + 0.2, 0, 0.16, 0.2, 10);
    // The two bushings the Draft's cables plug into (the box's front is +z,
    // toward the Draft): stacked porcelain sheds on an iron stem, a brass cap.
    for (const side of [-1, 1]) {
      const x = side * T.bushingX;
      const z = T.boxHalf.z;
      bin.add(
        'iron',
        new THREE.CylinderGeometry(0.12, 0.12, 0.7, 10),
        x,
        0,
        z + 0.35,
        0,
        [1, 1, 1],
        Math.PI / 2,
      );
      for (let k = 0; k < 3; k++)
        bin.add(
          'stone',
          new THREE.CylinderGeometry(0.34 - k * 0.05, 0.3 - k * 0.05, 0.12, 12),
          x,
          0,
          z + 0.14 + k * 0.2,
          0,
          [1, 1, 1],
          Math.PI / 2,
        );
      bin.add('brass', new THREE.SphereGeometry(0.17, 10, 8), x, 0, z + 0.74);
    }
    // Rivet rows down the box's flanks.
    for (const side of [-1, 1])
      for (let y = -T.boxHalf.y + 0.3; y <= T.boxHalf.y - 0.3; y += 0.3)
        for (const z of [-T.boxHalf.z + 0.15, T.boxHalf.z - 0.15])
          bin.box('brass', side * (T.boxHalf.x + 0.02), y, z, 0.03, 0.05, 0.05);
    this.box = bin.build('stormbrassDraftTerminal');
    this.box.visible = false;
    parent.add(this.box);
    // The feeder: a unit-long cable from its foot (the origin) up its +Y,
    // stretched and aimed at the scaffold's head each frame.
    this.feederGeo = new THREE.CylinderGeometry(T.feederRadius, T.feederRadius, 1, 10, 1, true);
    this.feederGeo.translate(0, 0.5, 0);
    this.feeder = new THREE.Mesh(this.feederGeo, foundryMaterial('black'));
    this.feeder.name = 'stormbrassDraftFeeder';
    this.feeder.castShadow = true;
    this.feeder.frustumCulled = false;
    this.feeder.visible = false;
    parent.add(this.feeder);
  }

  /**
   * Every frame: `draft` is the living Prime Draft in view (or null), `moored`
   * whether its moorings are on (prime_draft_gesture_core.ts), `inFight` its
   * combat flag. Out of a fight it stands on its spot: that is where the
   * scaffold's head is measured from.
   */
  update(
    draft: {
      pos: { x: number; y: number; z: number };
      facing: number;
      scale: number;
    } | null,
    moored: boolean,
    inFight: boolean,
  ): void {
    if (!draft) {
      this.box.visible = false;
      this.feeder.visible = false;
      this.homed = false;
      return;
    }
    if (!this.homed || !inFight) {
      this.home.x = draft.pos.x;
      this.home.y = draft.pos.y;
      this.home.z = draft.pos.z;
      this.homed = true;
    }
    // Moored, the box rides the cable ends; torn free, it stays where it hung.
    if (moored || !this.box.visible) {
      draftCableTerminal(draft.pos, draft.facing, draft.scale || 1, this.at);
      this.box.position.set(this.at.x, this.at.y, this.at.z);
      this.box.rotation.y = draft.facing;
    }
    draftFeederHead(this.home, this.head);
    this.dir.set(this.head.x - this.at.x, this.head.y - this.at.y, this.head.z - this.at.z);
    const len = this.dir.length();
    this.feeder.position.set(this.at.x, this.at.y + DRAFT_TETHER.boxHalf.y + 0.3, this.at.z);
    if (len > 1e-3) {
      this.feeder.quaternion.setFromUnitVectors(UP, this.dir.multiplyScalar(1 / len));
      this.feeder.scale.set(1, len, 1);
    }
    this.box.visible = true;
    this.feeder.visible = true;
  }

  dispose(): void {
    this.box.removeFromParent();
    this.feeder.removeFromParent();
    this.box.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    this.feederGeo.dispose();
  }
}
