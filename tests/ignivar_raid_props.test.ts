import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getBounds, NodeIO, Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { MEDIA_ASSETS } from '../src/render/assets/manifest.generated';
import {
  buildIgnivarRaidProps,
  ensureIgnivarRaidPropAssets,
  IGNIVAR_RAID_PROP_MODELS,
  ignivarRaidPropInternalsForTest,
  isIgnivarRaidPropAvailable,
  isIgnivarRaidPropKey,
} from '../src/render/ignivar_raid_props';
import {
  IGNIVAR_FORGE_APPROACH_LAYOUT,
  IGNIVAR_MOLTEN_ASSEMBLY_LAYOUT,
} from '../src/sim/dungeon_layout';

const EXPECTED_PROP_KEYS = [
  'ignivar_chain',
  'ignivar_curved_gear_wall',
  'ignivar_fallen_automa',
  'ignivar_firepit',
  'ignivar_forge_anvil',
  'ignivar_forge_house',
  'ignivar_forge_station',
  'ignivar_furnace_pillar',
  'ignivar_gear_broad',
  'ignivar_gear_heavy',
  'ignivar_gear_machine',
  'ignivar_gear_small',
  'ignivar_gear_wall_cluster',
  'ignivar_reactor',
  'ignivar_wall_gear_relief',
  'ignivar_workbench',
] as const;

const EXPECTED_MODEL_DEFS = {
  ignivar_chain: {
    url: '/models/props/ignivar_chain.glb',
    height: 5.5,
    baseY: 2.45,
    castShadow: true,
  },
  ignivar_curved_gear_wall: {
    url: '/models/props/ignivar_curved_gear_wall.glb',
    height: 3.4,
    highDetailOnly: true,
  },
  ignivar_fallen_automa: {
    url: '/models/props/ignivar_fallen_automa.glb',
    height: 0.65,
    castShadow: true,
  },
  ignivar_firepit: {
    url: '/models/props/ignivar_firepit.glb',
    height: 1.1,
    emissiveIntensity: 0.42,
    castShadow: true,
  },
  ignivar_forge_anvil: {
    url: '/models/props/ignivar_forge_anvil.glb',
    height: 1.8,
    emissiveIntensity: 0.16,
  },
  ignivar_forge_house: {
    url: '/models/props/ignivar_forge_house.glb',
    height: 7.2,
    emissiveIntensity: 0.12,
    highDetailOnly: true,
  },
  ignivar_forge_station: {
    url: '/models/props/ignivar_forge_station.glb',
    height: 3.2,
    emissiveIntensity: 0.24,
  },
  ignivar_furnace_pillar: {
    url: '/models/props/ignivar_furnace_pillar.glb',
    height: 4.5,
    emissiveIntensity: 0.3,
    highDetailOnly: true,
  },
  ignivar_gear_broad: {
    url: '/models/props/ignivar_gear_broad.glb',
    height: 1.5,
    castShadow: true,
  },
  ignivar_gear_heavy: {
    url: '/models/props/ignivar_gear_heavy.glb',
    height: 1.7,
    castShadow: true,
  },
  ignivar_gear_machine: {
    url: '/models/props/ignivar_gear_machine.glb',
    height: 2.7,
  },
  ignivar_gear_small: {
    url: '/models/props/ignivar_gear_small.glb',
    height: 1.35,
    castShadow: true,
  },
  ignivar_gear_wall_cluster: {
    url: '/models/props/ignivar_gear_wall_cluster.glb',
    height: 3.3,
    highDetailOnly: true,
  },
  ignivar_reactor: {
    url: '/models/props/ignivar_reactor.glb',
    height: 3.4,
    emissiveIntensity: 0.38,
  },
  ignivar_wall_gear_relief: {
    url: '/models/props/ignivar_wall_gear_relief.glb',
    height: 3.4,
    highDetailOnly: true,
  },
  ignivar_workbench: {
    url: '/models/props/ignivar_workbench.glb',
    height: 1.55,
  },
} as const;

const DEPLOYED_PROP_KEYS = EXPECTED_PROP_KEYS.filter(
  (key) => key !== 'ignivar_curved_gear_wall' && key !== 'ignivar_forge_house',
);

const ASSEMBLY_HIGH_KEYS = [
  'ignivar_forge_station',
  'ignivar_firepit',
  'ignivar_wall_gear_relief',
  'ignivar_chain',
  'ignivar_fallen_automa',
  'ignivar_gear_machine',
  'ignivar_workbench',
  'ignivar_reactor',
  'ignivar_forge_anvil',
  'ignivar_gear_small',
  'ignivar_gear_heavy',
  'ignivar_gear_broad',
  'ignivar_gear_wall_cluster',
  'ignivar_furnace_pillar',
] as const;

const ASSEMBLY_LOW_KEYS = [
  'ignivar_forge_station',
  'ignivar_firepit',
  'ignivar_chain',
  'ignivar_fallen_automa',
  'ignivar_gear_machine',
  'ignivar_workbench',
  'ignivar_reactor',
  'ignivar_forge_anvil',
  'ignivar_gear_small',
  'ignivar_gear_heavy',
  'ignivar_gear_broad',
] as const;

const ASSET_CONTRACT = [
  ['ignivar_chain', 'e897d44fbf96fb5df4ad4bf0764011944c2cd0b0329d6db6b044464d1669acbb', 464],
  [
    'ignivar_curved_gear_wall',
    '6365a75426f3ad5d5461e6445dc32a869be58b1e65af9f0f6d0ede5711723e8f',
    101_162,
  ],
  [
    'ignivar_fallen_automa',
    'e86b1975fdc8dcbc86a12b105a3e10251450adfcc6b9f49bed6030ed681372de',
    444,
  ],
  ['ignivar_firepit', '6461291edeba6d73246e322300adf21d55a3b6ae638efcc3dbd9a02cf13e357b', 441],
  [
    'ignivar_forge_anvil',
    '2bdf7a48ae55fa617baff529d1c002c6c5610d3f96c06ce1d77c930a0f1545e8',
    101_460,
  ],
  [
    'ignivar_forge_house',
    'ebd4a0a3d74e87241056412b6e0e5358b0565c5728f488b04e468dda4e903c26',
    102_404,
  ],
  [
    'ignivar_forge_station',
    'f5949c5af2c3c4f12bebf0f1acaa6e3e64de8834cad8ad216fa51f4538d695be',
    101_978,
  ],
  [
    'ignivar_furnace_pillar',
    'f5b3f80fa75dfdc15c9a09bbc42ea6f36e646d9af3f58786d53aafd1ef5f0d5d',
    100_640,
  ],
  ['ignivar_gear_broad', '00e6e80e42f155eac3990d6b7b96a0492d460516719b5cf60b8c6b75312bdd3b', 468],
  ['ignivar_gear_heavy', 'd80c1ce72f0beb751aa5bd13549d2f67e47b107f44e4ab8eaea34f5727d3b43c', 458],
  [
    'ignivar_gear_machine',
    'ceb169adfcecde1390c591b940659211e1d96cbae70edc219bef0b0a2941086d',
    101_896,
  ],
  ['ignivar_gear_small', '7ca73a064ca49c33d6ec2a2a18bb15ca1b8f1864d6f597cbf610ed579e948e8e', 492],
  [
    'ignivar_gear_wall_cluster',
    'e24c9479f899b7fb6cb6b913f6505b55da589e5aed35abbe53d640ca72251f4e',
    100_696,
  ],
  ['ignivar_reactor', '5e695b7178fe4aaec5128168ac0d8e44a5a5aec796d8fa8e560f5fbb06cc18f9', 101_336],
  [
    'ignivar_wall_gear_relief',
    '8e35c6d244cba71ac156eba4356dc7fcb12ddc5df103c56b26617fb32cc1a855',
    101_420,
  ],
  [
    'ignivar_workbench',
    'b57839a72b2d2731591c72f947fbe693988657f19d92d185fb9fa32039086833',
    101_920,
  ],
] as const;

describe('Ignivar raid prop set', () => {
  it('registers every selected maintainer asset under a normalized production URL', () => {
    expect(Object.keys(IGNIVAR_RAID_PROP_MODELS).sort()).toEqual(EXPECTED_PROP_KEYS);
    expect(IGNIVAR_RAID_PROP_MODELS).toEqual(EXPECTED_MODEL_DEFS);
  });

  it('deploys the camera-safe set across both trash rooms without hiding collidable props', () => {
    const layouts = [IGNIVAR_FORGE_APPROACH_LAYOUT, IGNIVAR_MOLTEN_ASSEMBLY_LAYOUT];
    const placements = layouts.flatMap((layout) =>
      (layout.decor ?? []).filter((decor) => isIgnivarRaidPropKey(decor.key)),
    );

    expect(new Set(placements.map((decor) => decor.key))).toEqual(new Set(DEPLOYED_PROP_KEYS));
    for (const decor of placements) {
      if (!isIgnivarRaidPropKey(decor.key)) throw new Error(`Unknown Ignivar prop ${decor.key}`);
      const def = IGNIVAR_RAID_PROP_MODELS[decor.key];
      if (decor.r !== undefined) expect(def.highDetailOnly).not.toBe(true);
    }
  });

  it('pins the authored facing and scale of every deployed prop', () => {
    const transformPairs = (layout: typeof IGNIVAR_FORGE_APPROACH_LAYOUT) =>
      (layout.decor ?? [])
        .filter((decor) => isIgnivarRaidPropKey(decor.key))
        .map((decor) => [decor.yaw, decor.scale ?? 1]);

    expect(transformPairs(IGNIVAR_FORGE_APPROACH_LAYOUT)).toEqual([
      [0, 1],
      [0, 1],
      [0, 1],
      [Math.PI / 2, 1],
      [0, 1],
      [0, 1],
      [Math.PI / 2, 1],
      [-Math.PI / 2, 1],
      [Math.PI / 2, 1],
      [Math.PI / 2, 1],
      [Math.PI / 2, 1],
      [-1.2, 1],
      [-Math.PI / 2, 1],
      [-Math.PI / 2, 1],
      [0, 1],
      [0.7, 1],
      [-0.7, 1],
    ]);
    expect(transformPairs(IGNIVAR_MOLTEN_ASSEMBLY_LAYOUT)).toEqual([
      [Math.PI / 2, 1],
      [-Math.PI / 2, 1],
      [0, 1],
      [0, 1],
      [Math.PI / 2, 1],
      [0, 1],
      [0, 1],
      [0.9, 1],
      [-0.9, 1],
      [Math.PI / 2, 1],
      [Math.PI / 2, 1],
      [-Math.PI / 2, 1],
      [-Math.PI / 2, 1],
      [Math.PI / 2, 1],
      [-Math.PI / 2, 1],
      [-Math.PI / 2, 1],
      [0, 1],
      [Math.PI / 2, 1],
      [0.6, 1],
      [-0.6, 1],
    ]);
  });

  it('normalizes source meshes onto the floor at the authored target height', () => {
    const source = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(2, 4, 6),
      new THREE.MeshStandardMaterial({ color: 0x49301f }),
    );
    mesh.position.set(7, 5, -3);
    source.add(mesh);

    const template = ignivarRaidPropInternalsForTest.prepareTemplate(
      source,
      IGNIVAR_RAID_PROP_MODELS.ignivar_firepit,
    );
    const bounds = new THREE.Box3().setFromObject(template);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const preparedMesh = template.getObjectByProperty('type', 'Mesh') as THREE.Mesh;
    const material = preparedMesh.material as THREE.MeshStandardMaterial;

    expect(size.y).toBeCloseTo(1.1);
    expect(bounds.min.y).toBeCloseTo(0);
    expect(center.x).toBeCloseTo(0);
    expect(center.z).toBeCloseTo(0);
    expect(preparedMesh.castShadow).toBe(true);
    expect(preparedMesh.receiveShadow).toBe(true);
    expect(material.emissive.getHex()).toBe(0xff6a20);
    expect(material.emissiveIntensity).toBe(0.42);

    const plainSource = new THREE.Group();
    plainSource.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(1, 2, 1),
        new THREE.MeshStandardMaterial({ color: 0x49301f }),
      ),
    );
    const plainTemplate = ignivarRaidPropInternalsForTest.prepareTemplate(
      plainSource,
      IGNIVAR_RAID_PROP_MODELS.ignivar_gear_machine,
    );
    const plainMesh = plainTemplate.getObjectByProperty('type', 'Mesh') as THREE.Mesh;
    const plainMaterial = plainMesh.material as THREE.MeshStandardMaterial;
    expect(plainMesh.castShadow).toBe(false);
    expect(plainMesh.receiveShadow).toBe(true);
    expect(plainMaterial.emissive.getHex()).toBe(0x000000);
  });

  it('preserves mixed-decor transforms and physical props while shedding every low-tier detail', () => {
    const decor = [
      ...(IGNIVAR_FORGE_APPROACH_LAYOUT.decor ?? []),
      ...(IGNIVAR_MOLTEN_ASSEMBLY_LAYOUT.decor ?? []),
    ];
    const templates = new Map(
      EXPECTED_PROP_KEYS.map((key) => {
        const template = new THREE.Group();
        template.name = `${key}Template`;
        return [key, template] as const;
      }),
    );
    const high = ignivarRaidPropInternalsForTest.buildIgnivarRaidPropsWithTemplates(
      decor,
      false,
      templates,
    );
    const low = ignivarRaidPropInternalsForTest.buildIgnivarRaidPropsWithTemplates(
      decor,
      true,
      templates,
    );

    const ignivarPlacements = decor.filter((placement) => isIgnivarRaidPropKey(placement.key));
    expect(high?.children).toHaveLength(ignivarPlacements.length);
    const lowNames = low?.children.map((child) => child.name) ?? [];
    expect(lowNames).toEqual([
      'ignivar_forge_station',
      'ignivar_firepit',
      'ignivar_firepit',
      'ignivar_chain',
      'ignivar_chain',
      'ignivar_gear_small',
      'ignivar_gear_heavy',
      'ignivar_workbench',
      'ignivar_gear_machine',
      'ignivar_fallen_automa',
      'ignivar_reactor',
      'ignivar_gear_broad',
      'ignivar_fallen_automa',
      'ignivar_fallen_automa',
      'ignivar_forge_station',
      'ignivar_forge_station',
      'ignivar_firepit',
      'ignivar_firepit',
      'ignivar_chain',
      'ignivar_chain',
      'ignivar_fallen_automa',
      'ignivar_fallen_automa',
      'ignivar_gear_machine',
      'ignivar_workbench',
      'ignivar_reactor',
      'ignivar_forge_anvil',
      'ignivar_gear_small',
      'ignivar_gear_heavy',
      'ignivar_gear_broad',
      'ignivar_fallen_automa',
      'ignivar_fallen_automa',
    ]);
    for (const placement of ignivarPlacements) {
      if (placement.r !== undefined) expect(lowNames).toContain(placement.key);
    }
    for (const [key, def] of Object.entries(EXPECTED_MODEL_DEFS)) {
      if ('highDetailOnly' in def && def.highDetailOnly === true) {
        expect(lowNames).not.toContain(key);
      }
    }

    const transformed = ignivarRaidPropInternalsForTest.buildIgnivarRaidPropsWithTemplates(
      [
        { key: 'infernal_brazier', x: 99, z: 99, yaw: 0 },
        { key: 'ignivar_chain', x: 3, z: -7, yaw: 0.75, scale: 1.4 },
      ],
      false,
      templates,
    )?.children[0];
    expect(transformed?.name).toBe('ignivar_chain');
    expect(transformed?.position.toArray()).toEqual([3, 2.45, -7]);
    expect(transformed?.rotation.y).toBeCloseTo(0.75);
    expect(transformed?.scale.toArray()).toEqual([1.4, 1.4, 1.4]);
  });

  it('keeps successful props when an optional model is missing or rejected', async () => {
    const mixedDecor = [
      { key: 'infernal_brazier', x: 0, z: 0, yaw: 0 },
      { key: 'ignivar_chain', x: -4, z: 5, yaw: 0 },
      { key: 'ignivar_forge_anvil', x: 4, z: 5, yaw: 0 },
    ];
    const missing = new Map([
      ['ignivar_chain', new THREE.Group()] as const,
      ['ignivar_forge_anvil', null] as const,
    ]);
    expect(
      ignivarRaidPropInternalsForTest
        .buildIgnivarRaidPropsWithTemplates(mixedDecor, false, missing)
        ?.children.map((child) => child.name),
    ).toEqual(['ignivar_chain']);

    const loader = vi.fn(async (url: string) => {
      if (url.endsWith('ignivar_forge_anvil.glb')) {
        throw new Error('offline cosmetic CDN');
      }
      const scene = new THREE.Group();
      scene.add(
        new THREE.Mesh(
          new THREE.BoxGeometry(1, 2, 1),
          new THREE.MeshStandardMaterial({ color: 0x49301f }),
        ),
      );
      return { scene };
    });
    const release = vi.fn();
    try {
      expect(isIgnivarRaidPropAvailable('ignivar_chain', false)).toBe(false);
      await Promise.all([
        ignivarRaidPropInternalsForTest.ensureModelWithLoader('ignivar_chain', loader, release),
        ignivarRaidPropInternalsForTest.ensureModelWithLoader(
          'ignivar_forge_anvil',
          loader,
          release,
        ),
      ]);
      expect(loader.mock.calls.map(([url]) => url)).toEqual([
        '/models/props/ignivar_chain.glb',
        '/models/props/ignivar_forge_anvil.glb',
      ]);
      expect(release).toHaveBeenCalledTimes(1);
      expect(release).toHaveBeenCalledWith('/models/props/ignivar_chain.glb');
      expect(isIgnivarRaidPropAvailable('ignivar_chain', false)).toBe(true);
      expect(isIgnivarRaidPropAvailable('ignivar_forge_anvil', false)).toBe(false);
      expect(isIgnivarRaidPropAvailable('ignivar_curved_gear_wall', true)).toBe(false);
      expect(buildIgnivarRaidProps(mixedDecor, false)?.children.map((child) => child.name)).toEqual(
        ['ignivar_chain'],
      );
    } finally {
      const { resetIgnivarRaidPropCachesForTest } = await import(
        '../src/render/ignivar_raid_props'
      );
      resetIgnivarRaidPropCachesForTest();
    }
  });

  it('loads only referenced tier assets and caps each room render budget', () => {
    const trisByKey = new Map(ASSET_CONTRACT.map(([key, _sha, tris]) => [key, tris]));
    const budget = (decor: typeof IGNIVAR_FORGE_APPROACH_LAYOUT.decor, lowGfx: boolean) => {
      const placements = (decor ?? []).flatMap((entry) => {
        const { key } = entry;
        if (!isIgnivarRaidPropKey(key)) return [];
        if (lowGfx && IGNIVAR_RAID_PROP_MODELS[key].highDetailOnly) return [];
        return [{ ...entry, key }];
      });
      return {
        draws: placements.length,
        tris: placements.reduce((sum, entry) => sum + (trisByKey.get(entry.key) ?? 0), 0),
        shadowTris: placements.reduce(
          (sum, entry) =>
            sum +
            (IGNIVAR_RAID_PROP_MODELS[entry.key].castShadow ? (trisByKey.get(entry.key) ?? 0) : 0),
          0,
        ),
      };
    };

    expect(budget(IGNIVAR_FORGE_APPROACH_LAYOUT.decor, false)).toEqual({
      draws: 17,
      tris: 714_446,
      shadowTris: 4_560,
    });
    expect(budget(IGNIVAR_FORGE_APPROACH_LAYOUT.decor, true)).toEqual({
      draws: 14,
      tris: 411_690,
      shadowTris: 4_560,
    });
    expect(budget(IGNIVAR_MOLTEN_ASSEMBLY_LAYOUT.decor, false)).toEqual({
      draws: 20,
      tris: 918_328,
      shadowTris: 5_004,
    });
    expect(budget(IGNIVAR_MOLTEN_ASSEMBLY_LAYOUT.decor, true)).toEqual({
      draws: 17,
      tris: 615_572,
      shadowTris: 5_004,
    });

    expect(
      ignivarRaidPropInternalsForTest.keysIn(IGNIVAR_MOLTEN_ASSEMBLY_LAYOUT.decor ?? [], false),
    ).toEqual(ASSEMBLY_HIGH_KEYS);
    expect(
      ignivarRaidPropInternalsForTest.keysIn(IGNIVAR_MOLTEN_ASSEMBLY_LAYOUT.decor ?? [], true),
    ).toEqual(ASSEMBLY_LOW_KEYS);
  });

  it('orchestrates the literal high and low asset tiers', async () => {
    const highEnsure = vi.fn(async (_key: string) => undefined);
    const lowEnsure = vi.fn(async (_key: string) => undefined);
    await ensureIgnivarRaidPropAssets(
      IGNIVAR_MOLTEN_ASSEMBLY_LAYOUT.decor ?? [],
      false,
      highEnsure,
    );
    await ensureIgnivarRaidPropAssets(IGNIVAR_MOLTEN_ASSEMBLY_LAYOUT.decor ?? [], true, lowEnsure);
    expect(highEnsure.mock.calls.map(([key]) => key)).toEqual(ASSEMBLY_HIGH_KEYS);
    expect(lowEnsure.mock.calls.map(([key]) => key)).toEqual(ASSEMBLY_LOW_KEYS);
  });

  it('deduplicates concurrent and subsequent loads after success or failure', async () => {
    const source = () => {
      const scene = new THREE.Group();
      scene.add(
        new THREE.Mesh(
          new THREE.BoxGeometry(1, 2, 1),
          new THREE.MeshStandardMaterial({ color: 0x49301f }),
        ),
      );
      return { scene };
    };
    const loader = vi.fn(async (url: string) => {
      await Promise.resolve();
      if (url.endsWith('ignivar_forge_anvil.glb')) throw new Error('missing optional model');
      return source();
    });
    const release = vi.fn();
    try {
      await Promise.all([
        ignivarRaidPropInternalsForTest.ensureModelWithLoader('ignivar_chain', loader, release),
        ignivarRaidPropInternalsForTest.ensureModelWithLoader('ignivar_chain', loader, release),
      ]);
      await ignivarRaidPropInternalsForTest.ensureModelWithLoader('ignivar_chain', loader, release);
      await Promise.all([
        ignivarRaidPropInternalsForTest.ensureModelWithLoader(
          'ignivar_forge_anvil',
          loader,
          release,
        ),
        ignivarRaidPropInternalsForTest.ensureModelWithLoader(
          'ignivar_forge_anvil',
          loader,
          release,
        ),
      ]);
      await ignivarRaidPropInternalsForTest.ensureModelWithLoader(
        'ignivar_forge_anvil',
        loader,
        release,
      );

      expect(loader.mock.calls.map(([url]) => url)).toEqual([
        '/models/props/ignivar_chain.glb',
        '/models/props/ignivar_forge_anvil.glb',
      ]);
      expect(release).toHaveBeenCalledTimes(1);
      expect(release).toHaveBeenCalledWith('/models/props/ignivar_chain.glb');
    } finally {
      const { resetIgnivarRaidPropCachesForTest } = await import(
        '../src/render/ignivar_raid_props'
      );
      resetIgnivarRaidPropCachesForTest();
    }
  });

  it.each(ASSET_CONTRACT)(
    'ships %s as the reviewed compressed static mesh',
    async (key, sha, tris) => {
      if (!isIgnivarRaidPropKey(key)) throw new Error(`Unknown Ignivar prop ${key}`);
      await MeshoptDecoder.ready;
      const relativePath = `models/props/${key}.glb`;
      const bytes = readFileSync(path.join(__dirname, '..', 'public', relativePath));
      expect(bytes.byteLength).toBeLessThan(800_000);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(sha);
      expect(MEDIA_ASSETS[relativePath]).toBe(`/media/models/props/${key}.${sha.slice(0, 12)}.glb`);

      const root = (
        await new NodeIO()
          .registerExtensions(ALL_EXTENSIONS)
          .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
          .readBinary(bytes)
      ).getRoot();
      expect(
        root
          .listExtensionsRequired()
          .map((extension) => extension.extensionName)
          .sort(),
      ).toEqual(['EXT_meshopt_compression', 'KHR_mesh_quantization', 'KHR_texture_basisu']);
      expect(root.listAnimations()).toHaveLength(0);
      expect(root.listTextures().length).toBeGreaterThan(0);
      for (const texture of root.listTextures()) {
        expect(texture.getMimeType()).toBe('image/ktx2');
        expect(Math.max(...(texture.getSize() ?? [0, 0]))).toBeLessThanOrEqual(512);
      }
      const primitives = root.listMeshes().flatMap((mesh) => mesh.listPrimitives());
      expect(primitives).toHaveLength(1);
      expect(primitives[0].getMode()).toBe(Primitive.Mode.TRIANGLES);
      expect((primitives[0].getIndices()?.getCount() ?? 0) / 3).toBe(tris);
      const bounds = getBounds(root.listScenes()[0]);
      const sourceHeight = bounds.max[1] - bounds.min[1];
      expect(sourceHeight).toBeGreaterThan(0.3);
      if (key === 'ignivar_wall_gear_relief') {
        const normalizedScale = IGNIVAR_RAID_PROP_MODELS[key].height / sourceHeight;
        const normalizedDepth = (bounds.max[2] - bounds.min[2]) * normalizedScale;
        expect(normalizedDepth).toBeLessThanOrEqual(0.55);
      }
      const authoredRadii = [
        ...(IGNIVAR_FORGE_APPROACH_LAYOUT.decor ?? []),
        ...(IGNIVAR_MOLTEN_ASSEMBLY_LAYOUT.decor ?? []),
      ]
        .filter((entry) => entry.key === key && entry.r !== undefined)
        .map((entry) => entry.r as number);
      if (authoredRadii.length > 0) {
        const normalizedScale = IGNIVAR_RAID_PROP_MODELS[key].height / sourceHeight;
        const halfX = ((bounds.max[0] - bounds.min[0]) * normalizedScale) / 2;
        const halfZ = ((bounds.max[2] - bounds.min[2]) * normalizedScale) / 2;
        expect(Math.hypot(halfX, halfZ)).toBeLessThanOrEqual(Math.min(...authoredRadii));
      }
    },
  );
});
