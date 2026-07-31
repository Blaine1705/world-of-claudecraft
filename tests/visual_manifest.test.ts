import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Node, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { describe, expect, it } from 'vitest';
import { MEDIA_ASSETS } from '../src/render/assets/manifest.generated';
import {
  type ClipMap,
  manifestUrls,
  manifestUrlsForGraphics,
  SKINS,
  VISUALS,
  visibleAttachmentsForGraphics,
  visualKeyFor,
} from '../src/render/characters/manifest';
import { MOBS, NPCS } from '../src/sim/data';

function expectedClipNames(clips: ClipMap): string[] {
  return [
    clips.idle,
    clips.walk,
    clips.run,
    clips.death,
    clips.cast,
    clips.sitDown,
    clips.sitIdle,
    clips.swim,
    clips.jump,
    clips.walkBack,
    clips.flourish,
    ...clips.attack,
    ...(clips.hit ?? []),
    ...Object.values(clips.emote ?? {}).flatMap((spec) => spec.clips),
  ].filter((name): name is string => !!name);
}

async function glbAnimationNames(path: string): Promise<Set<string>> {
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.read(path);
  return new Set(
    doc
      .getRoot()
      .listAnimations()
      .map((animation) => animation.getName()),
  );
}

async function glbRenderableContract(path: string): Promise<{
  sceneMeshes: number;
  scenePrimitives: number;
  skinnedVertices: number;
  defaultSceneNodes: number;
  animations: Map<string, { channels: number; keyframes: number; duration: number }>;
}> {
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const root = (await io.read(path)).getRoot();
  let sceneMeshes = 0;
  let scenePrimitives = 0;
  let skinnedVertices = 0;
  const visited = new Set<Node>();
  const visit = (node: Node): void => {
    if (visited.has(node)) return;
    visited.add(node);
    const mesh = node.getMesh();
    if (mesh) {
      sceneMeshes++;
      scenePrimitives += mesh.listPrimitives().length;
      if (node.getSkin()) {
        skinnedVertices += mesh
          .listPrimitives()
          .reduce(
            (total, primitive) => total + (primitive.getAttribute('POSITION')?.getCount() ?? 0),
            0,
          );
      }
    }
    for (const child of node.listChildren()) visit(child);
  };
  for (const node of root.getDefaultScene()?.listChildren() ?? []) visit(node);
  return {
    sceneMeshes,
    scenePrimitives,
    skinnedVertices,
    defaultSceneNodes: visited.size,
    animations: new Map(
      root.listAnimations().map((animation) => {
        let channels = 0;
        let keyframes = 0;
        let duration = 0;
        for (const channel of animation.listChannels()) {
          const target = channel.getTargetNode();
          const sampler = channel.getSampler();
          const input = sampler?.getInput();
          if (!target || !visited.has(target) || !input) continue;
          let channelDuration = 0;
          keyframes += input.getCount();
          for (const time of input.getArray() ?? []) {
            channelDuration = Math.max(channelDuration, Number(time));
          }
          duration = Math.max(duration, channelDuration);
          if (input.getCount() > 1 && channelDuration > 0) channels++;
        }
        return [animation.getName(), { channels, keyframes, duration }];
      }),
    ),
  };
}

describe('character visual manifest', () => {
  it('keeps Bursar Fernando in his likeness atlas (the Eastbrook banker easter egg)', () => {
    // The maintainer-approved easter egg: black shoulder-length hair and light
    // brown skin ride a repainted rogue palette resolved at skin index 0 (NPCs
    // always resolve skin 0; the mech precedent for a real index-0 texture).
    // The def must stay TINT-FREE: an entity tint would wash the repaint back
    // toward the gold villager look. Do not "clean up" any of the three.
    const key = visualKeyFor({
      kind: 'npc',
      templateId: 'bursar_fernando',
    } as never);
    expect(key).toBe('npc_fernando');
    expect(VISUALS.npc_fernando.tint).toBeUndefined();
    const atlas = SKINS.npc_fernando?.[0];
    expect(atlas).toBe('textures/skins/rogue/fernando.png');
    expect(existsSync(fileURLToPath(new URL(`../public/${atlas}`, import.meta.url)))).toBe(true);
  });

  it('resolves all three Chroniclers to the shared scholarly-mage visual', () => {
    // One def, three tints: the per-NPC NpcDef color carries each identity,
    // so the def must keep tint 'entity', and the three colors must stay
    // pairwise distinct and off the bursar gold and auctioneer amethyst.
    for (const templateId of [
      'chronicler_saul',
      'chronicler_osric_fenn',
      'chronicler_edda_hartwell',
    ]) {
      expect(visualKeyFor({ kind: 'npc', templateId } as never)).toBe('npc_chronicler');
    }
    const visual = VISUALS.npc_chronicler;
    expect(visual.url).toBe('models/chars/players/mage.glb');
    expect(visual.show).toEqual(['Mage_Hat']);
    expect(visual.tint).toBe('entity');
    expect(visual.attach?.map((a) => a.url)).toEqual([
      'models/weapons/staff.glb',
      'models/weapons/spellbook_open.glb',
    ]);
    expect(visual.attach?.[1]?.gripRef).toBe('Spellbook_open');

    expect(NPCS.chronicler_saul.color).toBe(0xd08a2e);
    expect(NPCS.chronicler_osric_fenn.color).toBe(0x3fa66b);
    expect(NPCS.chronicler_edda_hartwell.color).toBe(0x5a6fd6);
    const reserved = [NPCS.bursar_petra_vell.color, 0xc9a227, 0x8e5ad6];
    for (const id of [
      'chronicler_saul',
      'chronicler_osric_fenn',
      'chronicler_edda_hartwell',
    ] as const) {
      expect(reserved).not.toContain(NPCS[id].color);
    }
    // The Thornpeak chronicler's display name is renamed to Zenzie while the
    // template id stays (save compatibility); pin the English so a revert
    // cannot land silently.
    expect(NPCS.chronicler_edda_hartwell.name).toBe('Chronicler Zenzie');
  });

  it('uses the custom boar death clip without relying on a speed override', () => {
    expect(VISUALS.mob_boar.clips.death).toBe('Dying');
    expect(VISUALS.mob_boar.deathTimeScale).toBeUndefined();
  });

  it('uses the dedicated generated Lich form without player equipment', async () => {
    const visual = VISUALS.form_metamorph;
    expect(visual.url).toBe('models/chars/forms/metamorphosis.glb');
    expect(visual.url).not.toContain('players/rogue');
    expect(visual.url).not.toContain('creatures/demon');
    expect(visual.attach).toBeUndefined();
    expect(visual.show).toBeUndefined();
    expect(visual.tint).toBeUndefined();
    expect(visual.height).toBe(2.55);
    expect(visual.yaw).toBe(-Math.PI / 2);
    expect(visual.attackTimeScale).toBe(6);
    expect(visual.deathTimeScale).toBe(3);
    expect(visual.clips.idle).toBe('Idle');
    expect(visual.clips.walk).toBe('Walk');
    expect(visual.clips.run).toBe('Run');
    expect(visual.clips.attack).toEqual(['Attack']);
    expect(visual.clips.hit).toEqual(['Hit']);
    expect(visual.clips.death).toBe('Death');
    expect(visual.clips.cast).toBe('Cast');
    expect(visual.clips.jump).toBeUndefined();
    expect(VISUALS.form_lich).toBeUndefined();

    const animationNames = await glbAnimationNames(`public/${visual.url}`);
    expect(
      [...new Set(expectedClipNames(visual.clips))].filter((name) => !animationNames.has(name)),
    ).toEqual([]);
  });

  it('renders the Nythraxis phase-2 court as Aldren / Malric / Voss, not generic skeletons', () => {
    // The heroic "Spirit of X" adds are the same characters risen again, so they
    // must reuse each named crypt boss's visual. Without the MOB_KEYS entries they
    // fall through to FAMILY_KEYS.undead (skel_minion) and the court renders as
    // three identical grunts. Each add is pinned to its counterpart's key.
    const court: Array<[string, string]> = [
      ['nythraxis_heroic_warrior_add', 'fallen_captain_aldren'],
      ['nythraxis_heroic_priest_add', 'corrupted_priest_malric'],
      ['nythraxis_heroic_rogue_add', 'deathstalker_voss'],
    ];
    for (const [addId, namedId] of court) {
      const addKey = visualKeyFor({ kind: 'mob', templateId: addId } as never);
      const namedKey = visualKeyFor({
        kind: 'mob',
        templateId: namedId,
      } as never);
      expect(addKey, addId).toBe(namedKey);
      expect(addKey, addId).not.toBe('skel_minion');
    }
  });

  it('gives the summoned Water Elemental its own untinted animated water body', async () => {
    const key = visualKeyFor({
      kind: 'mob',
      templateId: 'water_elemental',
    } as never);
    expect(key).toBe('mob_water_elemental');

    const visual = VISUALS[key];
    expect(visual.url).toBe('models/creatures/water_elemental.glb');
    expect(visual.tint).toBeUndefined();
    expect(visual.clips.cast).toBe('Channel');
    expect(visual.clips.attack).toEqual(['Cast']);

    const animationNames = await glbAnimationNames(`public/${visual.url}`);
    expect(animationNames.size).toBeGreaterThan(0);
    expect(
      [...new Set(expectedClipNames(visual.clips))].filter((name) => !animationNames.has(name)),
    ).toEqual([]);
  });

  it('gives the Necromancer Gravewing its dedicated generated creature visual', async () => {
    const key = visualKeyFor({
      kind: 'mob',
      templateId: 'necromancy_gravewing',
    } as never);
    expect(key).toBe('mob_gravewing');

    const visual = VISUALS[key];
    expect(visual.url).toBe('models/creatures/gravewing.glb');
    expect(visual.height).toBe(2.4);
    expect(visual.yaw).toBe(-Math.PI / 2);
    expect(visual.attackTimeScale).toBe(6);
    expect(visual.tint).toBeUndefined();
    expect(visual.clips.cast).toBeUndefined();

    const animationNames = await glbAnimationNames(`public/${visual.url}`);
    expect(animationNames.size).toBeGreaterThan(0);
    expect(
      [...new Set(expectedClipNames(visual.clips))].filter((name) => !animationNames.has(name)),
    ).toEqual([]);
  });

  it('routes the Destruction summons to their dedicated untinted fel rigs', async () => {
    const summons = [
      {
        templateId: 'emberkin',
        key: 'mob_emberkin',
        url: 'models/creatures/emberkin.glb',
        height: 2.1,
        scale: 0.55,
      },
      {
        templateId: 'gloomshade',
        key: 'mob_gloomshade',
        url: 'models/creatures/gloomshade_chainwarden.glb',
        height: 2.75,
        scale: 1.15,
      },
      {
        templateId: 'pyre_colossus',
        key: 'mob_pyre_colossus',
        url: 'models/creatures/pyre_colossus.glb',
        height: 2.5,
        scale: 1.7,
      },
    ] as const;

    for (const summon of summons) {
      const key = visualKeyFor({
        kind: 'mob',
        templateId: summon.templateId,
      } as never);
      expect(key).toBe(summon.key);

      const visual = VISUALS[key];
      expect(visual.url).toBe(summon.url);
      expect(visual.height).toBe(summon.height);
      expect(MOBS[summon.templateId].scale).toBe(summon.scale);
      expect(visual.height * (MOBS[summon.templateId].scale ?? 1)).toBeCloseTo(
        summon.height * summon.scale,
      );
      expect(visual.yaw).toBe(-Math.PI / 2);
      expect(visual.attackTimeScale).toBe(6);
      expect(visual.deathTimeScale).toBe(3);
      expect(visual.tint).toBeUndefined();
      expect(visual.clips).toMatchObject({
        idle: 'Idle',
        walk: 'Walk',
        run: 'Run',
        death: 'Death',
        cast: 'Cast',
        jump: 'Jump',
        attack: ['Attack'],
        hit: ['Hit'],
      });

      const publicPath = `public/${visual.url}`;
      const animationNames = await glbAnimationNames(publicPath);
      const requiredClips = [...new Set(expectedClipNames(visual.clips))];
      expect(requiredClips.filter((name) => !animationNames.has(name))).toEqual([]);
      const renderable = await glbRenderableContract(publicPath);
      expect(renderable.sceneMeshes).toBeGreaterThan(0);
      expect(renderable.scenePrimitives).toBeGreaterThan(0);
      expect(renderable.skinnedVertices).toBeGreaterThan(0);
      expect(renderable.defaultSceneNodes).toBeGreaterThan(0);
      for (const clip of requiredClips) {
        const animation = renderable.animations.get(clip);
        expect(animation?.channels, `${summon.templateId} ${clip} channels`).toBeGreaterThan(0);
        expect(animation?.keyframes, `${summon.templateId} ${clip} keyframes`).toBeGreaterThan(1);
        expect(animation?.duration, `${summon.templateId} ${clip} duration`).toBeGreaterThan(0);
      }
      if (summon.templateId === 'gloomshade') {
        const binary = readFileSync(publicPath);
        expect(binary.byteLength).toBeLessThanOrEqual(1536 * 1024);
        expect(binary.includes('EXT_meshopt_compression')).toBe(true);
      }
      const digest = createHash('sha256')
        .update(readFileSync(publicPath))
        .digest('hex')
        .slice(0, 12);
      expect(MEDIA_ASSETS[visual.url]).toBe(
        `/media/${visual.url.replace(/\.glb$/, `.${digest}.glb`)}`,
      );
    }
  });

  it('points the Combat Mech manifest at animation clips baked into the GLB', async () => {
    const visual = VISUALS.player_mech;
    const animationNames = await glbAnimationNames(`public/${visual.url}`);

    expect(animationNames.size).toBeGreaterThan(0);
    expect(
      [...new Set(expectedClipNames(visual.clips))].filter((name) => !animationNames.has(name)),
    ).toEqual([]);
  });

  it('points the Stone Cantor manifest at clips present in the GLB (including the synthesized Hit)', async () => {
    const visual = VISUALS.mob_reedbound_acolyte;
    const animationNames = await glbAnimationNames(`public/${visual.url}`);

    expect(animationNames.size).toBeGreaterThan(0);
    expect(
      [...new Set(expectedClipNames(visual.clips))].filter((name) => !animationNames.has(name)),
    ).toEqual([]);
  });

  it('points the training dummy manifest at clips present in the GLB, with cast/jump deliberately absent', async () => {
    const visual = VISUALS.mob_training_dummy;
    const animationNames = await glbAnimationNames(`public/${visual.url}`);

    expect(animationNames.size).toBeGreaterThan(0);
    expect(
      [...new Set(expectedClipNames(visual.clips))].filter((name) => !animationNames.has(name)),
    ).toEqual([]);
    expect(visual.clips.cast).toBeUndefined();
    expect(visual.clips.jump).toBeUndefined();
    expect(animationNames.has('Cast')).toBe(false);
    expect(animationNames.has('Jump')).toBe(false);
  });

  it('points the baked wolf visuals (form_cat, mob_wolf, greyjaw) at clips in their GLBs', async () => {
    const byUrl = new Map<string, Set<string>>();
    for (const key of ['form_cat', 'mob_wolf', 'greyjaw'] as const) {
      const visual = VISUALS[key];
      const animationNames =
        byUrl.get(visual.url) ?? (await glbAnimationNames(`public/${visual.url}`));
      byUrl.set(visual.url, animationNames);

      expect(animationNames.size).toBeGreaterThan(0);
      expect(
        [...new Set(expectedClipNames(visual.clips))].filter((name) => !animationNames.has(name)),
      ).toEqual([]);
    }
  });

  it('keeps held weapons and props available on low graphics', () => {
    const allWeaponUrls = manifestUrls().filter((url) => url.startsWith('models/weapons/'));
    expect(allWeaponUrls.length).toBeGreaterThan(0);
    expect(manifestUrlsForGraphics(false)).toEqual(expect.arrayContaining(allWeaponUrls));
    expect(visibleAttachmentsForGraphics(VISUALS.player_warrior).map((a) => a.url)).toContain(
      'models/weapons/sword_1handed.glb',
    );
    expect(visibleAttachmentsForGraphics(VISUALS.player_rogue).map((a) => a.url)).toEqual([
      'models/weapons/dagger.glb',
      'models/weapons/dagger.glb',
    ]);
  });

  it('keeps deepfen_spearjaw on its raptor model despite its reptile family retag', () => {
    // Prose-only claim otherwise (FAMILY_KEYS.reptile comment): the explicit MOB_KEYS
    // override this pins is what actually keeps the model, and nothing else does.
    expect(visualKeyFor({ kind: 'mob', templateId: 'deepfen_spearjaw' } as never)).toBe(
      'mob_spearjaw',
    );
  });
});
