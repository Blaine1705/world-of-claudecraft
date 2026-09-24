// drawProgramSignature: one string per PROGRAM a (material, object) draw links,
// so a pool of per-slot clones collapses to one compile unit while any two
// draws three would link as different programs stay apart. Every case is
// checked against three's own program cache key (tests/helpers/
// three_program_keys.ts, the pinned WebGLPrograms over a stub renderer): a
// signature that merged two keys would let the cast gate open on a program
// that never linked.

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { drawProgramSignature } from '../src/render/draw_program_signature_core';
import { threeProgramKeys } from './helpers/three_program_keys';

type Draw = { object: THREE.Object3D; material: THREE.Material };

const plane = new THREE.PlaneGeometry(1, 1);

function mesh(material: THREE.Material, geometry: THREE.BufferGeometry = plane): Draw {
  return { object: new THREE.Mesh(geometry, material), material };
}

function sig(draw: Draw): string {
  return drawProgramSignature(draw.object, draw.material);
}

function key(draw: Draw): string {
  return threeProgramKeys(draw.material, draw.object);
}

/** The two draws link one program set, and the signature says so. */
function expectOneProgram(a: Draw, b: Draw): void {
  expect(key(a), 'three keys them as one program').toBe(key(b));
  expect(sig(a)).toBe(sig(b));
}

/** The two draws link different programs, and the signature keeps them apart. */
function expectTwoPrograms(a: Draw, b: Draw): void {
  expect(key(a), 'three keys them as two programs').not.toBe(key(b));
  expect(sig(a)).not.toBe(sig(b));
}

function basic(params: THREE.MeshBasicMaterialParameters = {}): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, ...params });
}

describe('drawProgramSignature', () => {
  it('folds per-slot clones that differ only in uniforms and texture instances', () => {
    const texA = new THREE.Texture();
    const texB = new THREE.Texture();
    const proto = basic({ color: 0x7a3cff, opacity: 0.6, map: texA });
    const clone = proto.clone();
    clone.color.set(0xff2040);
    clone.opacity = 0.2;
    clone.map = texB;
    clone.name = 'slot-7';
    expectOneProgram(mesh(proto), mesh(clone));
    // Two different geometries with the same attribute set are one program too.
    expectOneProgram(mesh(proto), mesh(clone, new THREE.RingGeometry(0.5, 1, 32)));
  });

  it('splits transparent from opaque, and additive from normal blending', () => {
    expectTwoPrograms(mesh(basic()), mesh(basic({ transparent: false })));
    expectTwoPrograms(
      mesh(basic({ transparent: false })),
      mesh(basic({ transparent: false, blending: THREE.AdditiveBlending })),
    );
  });

  it('splits by material type and by the object kind that draws it', () => {
    const points = new THREE.PointsMaterial({ size: 2, transparent: true });
    expectTwoPrograms({ object: new THREE.Points(plane, points), material: points }, mesh(basic()));
    const sprite = new THREE.SpriteMaterial({ transparent: true });
    expectTwoPrograms({ object: new THREE.Sprite(sprite), material: sprite }, mesh(basic()));
    const line = new THREE.LineBasicMaterial({ transparent: true });
    expectTwoPrograms(
      { object: new THREE.LineSegments(plane, line), material: line },
      mesh(basic()),
    );
    // One textured PointsMaterial on a uv-carrying Points cloud links the
    // pointsUvs variant; on a Mesh it does not.
    const mapped = new THREE.PointsMaterial({ map: new THREE.Texture() });
    expectTwoPrograms(
      { object: new THREE.Points(plane, mapped), material: mapped },
      { object: new THREE.Mesh(plane, mapped), material: mapped },
    );
  });

  it('keeps every object kind apart even where three would not (conservative)', () => {
    // A LineBasicMaterial draws the same program on a Mesh and on a Line; an
    // extra unit is an idle slot and a cache hit, so the kind stays an axis.
    const line = new THREE.LineBasicMaterial();
    const onLine = { object: new THREE.LineSegments(plane, line), material: line };
    const onMesh = { object: new THREE.Mesh(plane, line), material: line };
    expect(key(onLine)).toBe(key(onMesh));
    expect(sig(onLine)).not.toBe(sig(onMesh));
  });

  it('splits the material inputs three keys that the material signature alone did not read', () => {
    const base = mesh(basic());
    expectTwoPrograms(base, mesh(basic({ toneMapped: false })));
    expectTwoPrograms(base, mesh(basic({ wireframe: true, map: new THREE.Texture() })));
    const channel = new THREE.Texture();
    channel.channel = 1;
    expectTwoPrograms(mesh(basic({ map: new THREE.Texture() })), mesh(basic({ map: channel })));
    const lowp = basic();
    lowp.precision = 'lowp';
    expectTwoPrograms(base, mesh(lowp));
    const attenuated = new THREE.PointsMaterial({ sizeAttenuation: true });
    const flat = new THREE.PointsMaterial({ sizeAttenuation: false });
    expectTwoPrograms(
      { object: new THREE.Points(plane, attenuated), material: attenuated },
      { object: new THREE.Points(plane, flat), material: flat },
    );
  });

  it('splits the texture-format, video and morph-presence inputs', () => {
    const rgba = new THREE.Texture();
    const rg = new THREE.Texture();
    rg.format = THREE.RGFormat;
    const lit = (normalMap: THREE.Texture) => new THREE.MeshStandardMaterial({ normalMap });
    expectTwoPrograms(mesh(lit(rgba)), mesh(lit(rg)));
    const video = new THREE.Texture();
    (video as THREE.Texture & { isVideoTexture: boolean }).isVideoTexture = true;
    video.colorSpace = THREE.SRGBColorSpace;
    const still = new THREE.Texture();
    still.colorSpace = THREE.SRGBColorSpace;
    expectTwoPrograms(mesh(basic({ map: still })), mesh(basic({ map: video })));
    // An empty morph array is still keyed on presence (morphNormals).
    const emptyNormals = plane.clone();
    emptyNormals.morphAttributes.normal = [];
    expectTwoPrograms(mesh(basic()), mesh(basic(), emptyNormals));
  });

  it('splits on the local clipping plane count, which the oracle cannot see', () => {
    const clipped = basic();
    clipped.clippingPlanes = [new THREE.Plane()];
    expect(sig(mesh(clipped))).not.toBe(sig(mesh(basic())));
  });

  it('splits a two-pass DoubleSide draw from its single-pass twin (forceSinglePass)', () => {
    // three links the back and the front program for a transparent DoubleSide
    // material; forceSinglePass draws one DoubleSide program instead.
    const twoPass = basic({ side: THREE.DoubleSide });
    const onePass = basic({ side: THREE.DoubleSide });
    onePass.forceSinglePass = true;
    expectTwoPrograms(mesh(twoPass), mesh(onePass));
  });

  it('splits the object and geometry inputs: instancing, skinning, normals, vertex alpha, morphs', () => {
    const material = basic({ vertexColors: true });
    const base = mesh(material);
    expectTwoPrograms(base, {
      object: new THREE.InstancedMesh(plane, material, 4),
      material,
    });
    const skinned = new THREE.SkinnedMesh(plane, material);
    expectTwoPrograms(base, { object: skinned, material });
    const noNormals = plane.clone();
    noNormals.deleteAttribute('normal');
    expectTwoPrograms(base, mesh(material, noNormals));
    const rgb = plane.clone();
    rgb.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(4 * 3), 3));
    const rgba = plane.clone();
    rgba.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(4 * 4), 4));
    expectTwoPrograms(mesh(material, rgb), mesh(material, rgba));
    const morphed = plane.clone();
    morphed.morphAttributes.position = [plane.attributes.position.clone()];
    expectTwoPrograms(base, mesh(material, morphed));
  });

  it('keys a ShaderMaterial on its source and defines, never merging two sources', () => {
    const vertexShader = 'void main() { gl_Position = vec4(position, 1.0); }';
    const fragmentShader = 'void main() { gl_FragColor = vec4(1.0); }';
    const proto = new THREE.ShaderMaterial({ vertexShader, fragmentShader, transparent: true });
    const clone = proto.clone();
    clone.uniforms = { uTint: { value: new THREE.Color(0xff0000) } };
    expectOneProgram(mesh(proto), mesh(clone));
    const otherSource = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: 'void main() { gl_FragColor = vec4(0.5); }',
      transparent: true,
    });
    expectTwoPrograms(mesh(proto), mesh(otherSource));
    const defined = proto.clone();
    defined.defines = { USE_RIM: '' };
    expectTwoPrograms(mesh(proto), mesh(defined));
    const raw = new THREE.RawShaderMaterial({ vertexShader, fragmentShader, transparent: true });
    expectTwoPrograms(mesh(proto), mesh(raw));
  });

  it('keys an onBeforeCompile hook on its identity', () => {
    const plain = basic();
    const hooked = basic();
    hooked.onBeforeCompile = (shader) => {
      shader.fragmentShader = `// rim\n${shader.fragmentShader}`;
    };
    expectTwoPrograms(mesh(plain), mesh(hooked));
  });
});
