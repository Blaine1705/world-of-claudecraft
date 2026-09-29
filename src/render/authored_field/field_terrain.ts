// Painter for an authored open-air field's ground: the walkable tops and the
// cliff faces from the pure plan (field_mesh_core.ts), wrapped in Three
// geometry with the shared procedural stone, soil and rock detail. Built once
// per interior; the geometry is owned by the interior group (disposed with
// it), the materials and textures are shared.

import * as THREE from 'three';
import type { AuthoredFieldDef } from '../../sim/instances/authored_field';
import { surfaceMat } from '../gfx';
import { type FieldMeshData, planFieldCliffs, planFieldTops } from './field_mesh_core';
import { flagstoneDetail, rockDetail, soilDetail } from './field_textures';

function geometryOf(data: FieldMeshData, indexed: boolean): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(data.colors, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
  if (indexed) {
    geo.setIndex(data.indices);
  } else {
    // Tops are emitted as independent triangles already in draw order.
  }
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

export interface FieldTerrainOptions {
  lowGfx: boolean;
  /** Longest top triangle edge; the low tier coarsens it. */
  maxEdge?: number;
}

/** Build the ground of a field: tops (stone, soil) and cliffs, one mesh each. */
export function buildAuthoredFieldTerrain(
  def: AuthoredFieldDef,
  opts: FieldTerrainOptions,
): THREE.Group {
  const group = new THREE.Group();
  group.name = `authoredField:${def.key}`;
  const tops = planFieldTops(def, {
    maxEdge: opts.maxEdge ?? (opts.lowGfx ? 6 : 3),
    layerLift: 0,
  });
  const stone = flagstoneDetail();
  const soil = soilDetail();
  const rock = rockDetail();
  const topMats = {
    stone: surfaceMat({
      map: stone.map,
      normalMap: opts.lowGfx ? undefined : stone.normalMap,
      vertexColors: true,
      roughness: 0.93,
    }),
    soil: surfaceMat({
      map: soil.map,
      normalMap: opts.lowGfx ? undefined : soil.normalMap,
      vertexColors: true,
      roughness: 0.98,
    }),
  };
  for (const family of ['stone', 'soil'] as const) {
    const data = tops[family];
    if (data.positions.length === 0) continue;
    const mesh = new THREE.Mesh(geometryOf(data, false), topMats[family]);
    mesh.name = `fieldTop:${family}`;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  const cliffs = planFieldCliffs(def, {
    voidFloor: def.voidHeight - 25,
    columnStep: opts.lowGfx ? 3 : 1.6,
    rowStep: opts.lowGfx ? 6 : 3,
    flare: 0.22,
  });
  if (cliffs.positions.length > 0) {
    const mesh = new THREE.Mesh(
      geometryOf(cliffs, true),
      surfaceMat({
        map: rock.map,
        normalMap: opts.lowGfx ? undefined : rock.normalMap,
        vertexColors: true,
        roughness: 0.95,
        side: THREE.DoubleSide,
      }),
    );
    mesh.name = 'fieldCliffs';
    mesh.castShadow = !opts.lowGfx;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
