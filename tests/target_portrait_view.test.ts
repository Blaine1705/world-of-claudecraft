import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { mobPortraitBackgroundSvg } from '../scripts/lib/mob_portrait_background.mjs';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { MOBS } from '../src/sim/data';
import {
  TRANSIENT_MOB_PORTRAIT_SOURCE_IDS,
  targetPortraitSourceId,
  targetPortraitUrl,
} from '../src/ui/target_portrait_view';

// These twelve portraits had silently retained the old hooded-rogue render after their
// manifest visuals changed to frogs, goblins, and the training dummy. Pin both the current
// visual identity and the deterministic renderer output so a future model remap cannot leave
// a plausible-looking but incorrect portrait behind again.
const CORRECTED_PORTRAITS = {
  bogtoad: [
    'mob_murloc',
    'models/creatures/frog.glb',
    'b5ecbb01a36f1aa03094efd54b79962ba3985d8ec8b5bc70f42bc159b0c80f7d',
  ],
  drowsy_croaker: [
    'mob_murloc',
    'models/creatures/frog.glb',
    '46570e1af656c3b9e9428ee39ebac2682ed063e52bef25513a918f0d8cda2baf',
  ],
  mere_lurker: [
    'mob_murloc',
    'models/creatures/frog.glb',
    '5ea2fe8f6953714463a3438cbf20299d1eeac480557c1c8311603eeea44eb567',
  ],
  the_meredark: [
    'mob_murloc',
    'models/creatures/frog.glb',
    'b14db6ec964ea25c6de9b588ade5da44e702b93fa5a270751751322170e8a616',
  ],
  breach_wretch: [
    'mob_kobold',
    'models/creatures/goblin.glb',
    'b6fdd777507a714fe00dd6635535f38dde194c3d7d4c1fead226b7e8d68e21e9',
  ],
  fen_sprite: [
    'mob_kobold',
    'models/creatures/goblin.glb',
    '3f1c378547f3a490f673583a82981efdb22f066823e4f7936089b2e3d9a3ee07',
  ],
  harvest_sprite: [
    'mob_kobold',
    'models/creatures/goblin.glb',
    '5168f406c69e6470249d7bdbbd9c3742b603d497aac9719754d147df977937bd',
  ],
  hedge_gnome: [
    'mob_kobold',
    'models/creatures/goblin.glb',
    '8aae9d814e1047bf7c038d18483fb836b323ee445cc7b00eabe1b3d917a21e1c',
  ],
  willow_sprite: [
    'mob_kobold',
    'models/creatures/goblin.glb',
    'b766e56fd7817a91616c6832f76d565a30fbda2c879a76f5e55a4957ef773eb2',
  ],
  downs_bandit: [
    'mob_kobold',
    'models/creatures/goblin.glb',
    '8aae9d814e1047bf7c038d18483fb836b323ee445cc7b00eabe1b3d917a21e1c',
  ],
  wreck_thief: [
    'mob_kobold',
    'models/creatures/goblin.glb',
    '8aae9d814e1047bf7c038d18483fb836b323ee445cc7b00eabe1b3d917a21e1c',
  ],
  training_dummy: [
    'mob_training_dummy',
    'models/creatures/training_dummy.glb',
    'eb21d6829704369512b11dd96ad60c1fbe75ffe366544017f19786bf1eba6566',
  ],
} as const;

// These portraits all resolve through entity-tinted visuals. The escortees shared one stale
// green hooded render, while Cindraleth, Grubjaw, and the Wreck Warden retained older model
// stand-ins. Pin the tint inputs as well as each visual/model and deterministic output.
const CORRECTED_TINTED_PORTRAITS = {
  gravedigger_mosley: [
    'npc_villager',
    'models/chars/players/rogue.glb',
    0x8a7a5a,
    0.35,
    'd1506b30bf4a9a312cf8ce5c89d569e35d37ad549315e4b3871427abf638c009',
  ],
  castaway_navigator: [
    'npc_villager',
    'models/chars/players/rogue.glb',
    0x4a7a9c,
    0.35,
    'a4bd24428d9b603003bd67feb24c9563146e1ee675249f3cfd5c6df2d4eb5a77',
  ],
  fisher_bram: [
    'npc_villager',
    'models/chars/players/rogue.glb',
    0x4a6a8a,
    0.35,
    'f9cb5ea940f598e3b5bdda5b85b8a3db8465ac6516d5f56abc851d5dd15fc7b8',
  ],
  cindraleth_maw_matriarch: [
    'mob_dragonkin_matriarch',
    'models/creatures/dragonkin_elite.glb',
    0xf0b040,
    0.12,
    'f886b941777bd4e4fb2796295b383e423083836d3880edfdcb2ecfd474178140',
  ],
  grubjaw: [
    'mob_grubjaw',
    'models/creatures/grubjaw.glb',
    0x145a32,
    0.04,
    '5b77f8b7a3704e7653f47819b50a22e446058baa60c880d07a027005aa5fa87a',
  ],
  the_wreck_warden: [
    'mob_bruiser',
    'models/chars/players/barbarian.glb',
    0x7a8a86,
    0.3,
    '4f6b2c9259863befc5d1999f9be4eb26612a72bf7d1d35bf28abe7b2b6e8fa57',
  ],
} as const;

describe('targetPortraitUrl', () => {
  it('selects committed portrait art for mob templates only', () => {
    expect(targetPortraitUrl('morthen', true)).toBe('/ui/mobs/morthen.webp');
    expect(targetPortraitUrl('the_merchant', false)).toBeNull();
    // Sexton Marrow is both a living NPC id and an undead encounter id. Entity
    // kind, not catalog overlap, decides whether portrait art is appropriate.
    expect(MOBS.sexton_marrow).toBeDefined();
    expect(targetPortraitUrl('sexton_marrow', false)).toBeNull();
  });

  it('borrows exact existing creature portraits for transient guardians', () => {
    expect(TRANSIENT_MOB_PORTRAIT_SOURCE_IDS).toEqual({
      guardian_tithefiend: 'rift_dread_stalker',
      guardian_stampede_0: 'old_greyjaw',
      guardian_stampede_1: 'wild_boar',
      guardian_stampede_2: 'gloam_strider',
    });
    for (const [guardianId, sourceId] of Object.entries(TRANSIENT_MOB_PORTRAIT_SOURCE_IDS)) {
      expect(targetPortraitSourceId(guardianId, true), guardianId).toBe(sourceId);
      const url = targetPortraitUrl(guardianId, true);
      expect(url, guardianId).toBe(`/ui/mobs/${sourceId}.webp`);
      expect(existsSync(resolve(process.cwd(), `public${url}`)), guardianId).toBe(true);
    }
  });

  it('uses dedicated static art for the procedural Vale Cup ball', async () => {
    const url = targetPortraitUrl('vale_cup_ball', true);
    expect(url).toBe('/ui/portraits/vale_cup_ball.webp');
    const path = resolve(process.cwd(), `public${url}`);
    const bytes = readFileSync(path);
    expect(bytes.byteLength).toBe(2068);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      'a7c60d03e01897459a70d9d79aaf575ea6c12fc13db38e981fee3614a8076670',
    );
    expect(await sharp(bytes).metadata()).toMatchObject({
      width: 128,
      height: 128,
      space: 'srgb',
      channels: 3,
      hasAlpha: false,
    });
  });

  it('ships a decodable portrait with an opaque backdrop for every mob template', async () => {
    const entries = Object.entries(MOBS);
    const urls = entries.map(([mobId]) => targetPortraitUrl(mobId, true));
    const missing = urls.filter(
      (url) => !url || !existsSync(resolve(process.cwd(), `public${url}`)),
    );
    expect(missing).toEqual([]);
    const portraits = await Promise.all(
      entries.map(async ([mobId, mob]) => {
        const url = targetPortraitUrl(mobId, true);
        const image = sharp(resolve(process.cwd(), `public${url}`)).ensureAlpha();
        const background = sharp(Buffer.from(mobPortraitBackgroundSvg(mob.family, 128)));
        const [metadata, corner, pixels, backgroundPixels] = await Promise.all([
          image.metadata(),
          image.clone().extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer(),
          image.clone().raw().toBuffer(),
          background.raw().toBuffer(),
        ]);
        let subjectPixels = 0;
        for (let offset = 0; offset < pixels.length; offset += 4) {
          const difference =
            Math.abs(pixels[offset] - backgroundPixels[offset]) +
            Math.abs(pixels[offset + 1] - backgroundPixels[offset + 1]) +
            Math.abs(pixels[offset + 2] - backgroundPixels[offset + 2]);
          if (difference > 45) subjectPixels++;
        }
        return {
          metadata,
          cornerAlpha: corner[3],
          cornerBrightness: corner[0] + corner[1] + corner[2],
          subjectPixels,
        };
      }),
    );
    expect(
      portraits.every(({ metadata }) => metadata.width === 128 && metadata.height === 128),
    ).toBe(true);
    expect(portraits.every(({ cornerAlpha }) => cornerAlpha === 255)).toBe(true);
    expect(portraits.every(({ cornerBrightness }) => cornerBrightness > 0)).toBe(true);
    expect(portraits.every(({ subjectPixels }) => subjectPixels > 150)).toBe(true);
  });

  it('does not ship orphan portraits for removed or renamed mob templates', () => {
    const assets = readdirSync(resolve(process.cwd(), 'public/ui/mobs'))
      .filter((file) => !file.startsWith('.'))
      .sort();
    expect(assets).toEqual(
      Object.keys(MOBS)
        .map((id) => `${id}.webp`)
        .sort(),
    );
  });

  it('keeps corrected portraits synchronized with their current rendered models', () => {
    for (const [mobId, [visualKey, model, acceptedHash]] of Object.entries(CORRECTED_PORTRAITS)) {
      const mob = MOBS[mobId];
      expect(mob, `${mobId} fixture`).toBeDefined();
      const currentVisual = visualKeyFor({
        kind: 'mob',
        templateId: mobId,
        family: mob?.family,
      } as never);
      expect(currentVisual, `${mobId} visual key`).toBe(visualKey);
      expect(VISUALS[currentVisual]?.url, `${mobId} model`).toBe(model);
      const hash = createHash('sha256')
        .update(readFileSync(resolve(process.cwd(), `public/ui/mobs/${mobId}.webp`)))
        .digest('hex');
      expect(hash, `${mobId} rerender`).toBe(acceptedHash);
    }
  });

  it('keeps corrected tinted portraits synchronized with their live model and tint', () => {
    for (const [mobId, [visualKey, model, tint, tintStrength, acceptedHash]] of Object.entries(
      CORRECTED_TINTED_PORTRAITS,
    )) {
      const mob = MOBS[mobId];
      expect(mob, `${mobId} fixture`).toBeDefined();
      const currentVisual = visualKeyFor({
        kind: 'mob',
        templateId: mobId,
        family: mob?.family,
      } as never);
      expect(currentVisual, `${mobId} visual key`).toBe(visualKey);
      expect(VISUALS[currentVisual]?.url, `${mobId} model`).toBe(model);
      expect(VISUALS[currentVisual]?.tint, `${mobId} tint source`).toBe('entity');
      expect(VISUALS[currentVisual]?.tintStrength, `${mobId} tint strength`).toBe(tintStrength);
      expect(mob?.color, `${mobId} live tint`).toBe(tint);
      const hash = createHash('sha256')
        .update(readFileSync(resolve(process.cwd(), `public/ui/mobs/${mobId}.webp`)))
        .digest('hex');
      expect(hash, `${mobId} rerender`).toBe(acceptedHash);
    }
  });
});
