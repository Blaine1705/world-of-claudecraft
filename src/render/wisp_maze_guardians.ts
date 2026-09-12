import * as THREE from 'three';
import { surfaceMat } from './gfx';
import { cloneMaterialWithHooks } from './material_clone_hooks';
import { markOwnedMaterial } from './shared_resource';

export const WISP_GUARDIAN_COLORS = [0xeb6354, 0xb879ec, 0x59baff, 0x70dba4] as const;

/** Four original construct silhouettes, each recognizable without relying on tint. */
export class WispMazeGuardians {
  readonly group = new THREE.Group();
  readonly actors: THREE.Group[] = [];
  private readonly box = new THREE.BoxGeometry(1, 1, 1);
  private readonly crystal = new THREE.OctahedronGeometry(1);
  private readonly ring = new THREE.TorusGeometry(0.65, 0.08, 5, 12);
  private readonly materials: (THREE.MeshLambertMaterial | THREE.MeshStandardMaterial)[] = [];

  constructor() {
    for (let index = 0; index < 4; index++) {
      const material = markOwnedMaterial(
        cloneMaterialWithHooks(
          surfaceMat({
            color: WISP_GUARDIAN_COLORS[index],
            emissive: WISP_GUARDIAN_COLORS[index],
            emissiveIntensity: 0.25,
          }),
        ),
      ) as THREE.MeshLambertMaterial | THREE.MeshStandardMaterial;
      this.materials.push(material);
      const root = new THREE.Group();
      root.name = `wisp-guardian-${index}`;
      const part = (
        geometry: THREE.BufferGeometry,
        x: number,
        y: number,
        z: number,
        sx: number,
        sy: number,
        sz: number,
      ) => {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, y, z);
        mesh.scale.set(sx, sy, sz);
        root.add(mesh);
        return mesh;
      };
      if (index === 0) {
        part(this.box, 0, 0.95, 0, 0.7, 0.85, 0.55);
        part(this.crystal, 0, 1.65, 0, 0.34, 0.34, 0.34);
        for (const side of [-1, 1]) {
          part(this.box, side * 0.55, 1.05, 0, 0.25, 0.65, 0.3);
          part(this.crystal, side * 0.5, 1.5, 0, 0.22, 0.38, 0.22);
        }
      } else if (index === 1) {
        part(this.crystal, 0, 1.1, 0, 0.45, 1, 0.45);
        part(this.ring, 0, 1.2, 0, 1, 1, 1).rotation.x = Math.PI / 2;
        part(this.ring, 0, 1.2, 0, 0.8, 0.8, 0.8).rotation.y = Math.PI / 2;
      } else if (index === 2) {
        part(this.crystal, 0, 0.8, 0, 0.65, 0.5, 0.65);
        part(this.box, 0, 1.25, 0.15, 0.3, 0.25, 0.45);
        for (const x of [-0.55, 0.55])
          for (const z of [-0.4, 0.4]) {
            part(this.box, x, 0.35, z, 0.18, 0.55, 0.18);
          }
      } else {
        part(this.crystal, 0, 1.05, 0, 0.4, 0.7, 0.35);
        part(this.crystal, 0, 1.85, 0, 0.22, 0.25, 0.22);
        for (const side of [-1, 1]) {
          const wing = part(this.crystal, side * 0.55, 1.2, 0, 0.55, 0.18, 0.3);
          wing.rotation.z = side * 0.4;
        }
      }
      this.actors.push(root);
      this.group.add(root);
    }
  }

  setFrightened(index: number, frightened: boolean): void {
    const material = this.materials[index];
    const color = frightened ? 0xd9f8ff : WISP_GUARDIAN_COLORS[index];
    material.color.setHex(color);
    material.emissive.setHex(color);
    material.emissiveIntensity = frightened ? 0.7 : 0.25;
  }

  dispose(): void {
    this.box.dispose();
    this.crystal.dispose();
    this.ring.dispose();
    for (const material of this.materials) material.dispose();
  }
}
