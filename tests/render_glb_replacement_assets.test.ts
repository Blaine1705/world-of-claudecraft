// Guards the GLB replacement of the procedural critters/fish/gather-node/
// mailbox/delve-prop models: every preload URL declared by the render modules
// must point at a real file under public/models, and every referenced GLB
// must have been picked up by the media manifest.
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { artisanRowPreloadInternalsForTest } from '../src/render/artisan_row_props';
import { MEDIA_ASSETS } from '../src/render/assets/manifest.generated';
import { critterPreloadInternalsForTest } from '../src/render/critters';
import { marshDressingPreloadInternalsForTest } from '../src/render/delve_marsh_dressing';
import { delvePropsPreloadInternalsForTest } from '../src/render/delve_props';
import { doorPortalPreloadInternalsForTest } from '../src/render/door_portal';
import { fishPreloadInternalsForTest } from '../src/render/fish';
import { gatherNodePreloadInternalsForTest } from '../src/render/gather_nodes';
import { mailboxPreloadInternalsForTest } from '../src/render/mailbox';
import { orkadiaPropsPreloadInternalsForTest } from '../src/render/orkadia_props';
import { questObjectPreloadInternalsForTest } from '../src/render/quest_objects';
import { stationsPreloadInternalsForTest } from '../src/render/stations';
import { wildheartPropsPreloadInternalsForTest } from '../src/render/wildheart_props';
import { yumiMazePreloadInternalsForTest } from '../src/render/yumi_maze';

const publicDir = path.join(__dirname, '..', 'public');

function expectAssetExistsAndManifested(url: string): void {
  const rel = url.replace(/^\//, '');
  expect(existsSync(path.join(publicDir, rel)), `${url} should exist under public/`).toBe(true);
  expect(
    MEDIA_ASSETS[rel],
    `${url} should be present in the generated media manifest`,
  ).toBeDefined();
}

function readGlbJson(url: string): { extensionsUsed?: string[] } {
  const bytes = readFileSync(path.join(publicDir, url.replace(/^\//, '')));
  const jsonLength = bytes.readUInt32LE(12);
  return JSON.parse(
    bytes
      .subarray(20, 20 + jsonLength)
      .toString('utf8')
      .trim(),
  );
}

describe('GLB-replacement asset preload sets resolve to real, manifested files', () => {
  it('critter species assets', () => {
    for (const url of Object.values(critterPreloadInternalsForTest.speciesAssetUrl)) {
      expectAssetExistsAndManifested(url);
    }
  });

  it('leaping fish asset', () => {
    expectAssetExistsAndManifested(fishPreloadInternalsForTest.fishAssetUrl);
  });

  it('gather node assets', () => {
    for (const url of Object.values(gatherNodePreloadInternalsForTest.nodeAssetUrl)) {
      expectAssetExistsAndManifested(url);
    }
  });

  it('mailbox pillar asset', () => {
    expectAssetExistsAndManifested(mailboxPreloadInternalsForTest.mailboxAssetUrl);
  });

  it('standalone delve prop assets', () => {
    for (const url of Object.values(delvePropsPreloadInternalsForTest.standalonePropUrl)) {
      expectAssetExistsAndManifested(url);
    }
  });

  it('marsh dressing anchor assets', () => {
    for (const url of Object.values(marshDressingPreloadInternalsForTest.marshAssetUrl)) {
      expectAssetExistsAndManifested(url);
    }
  });

  it('yumi maze brazier and torch assets', () => {
    for (const url of Object.values(yumiMazePreloadInternalsForTest.yumiMazeAssetUrl)) {
      expectAssetExistsAndManifested(url);
    }
  });

  it('dungeon door arch asset', () => {
    expectAssetExistsAndManifested(doorPortalPreloadInternalsForTest.doorArchAssetUrl);
    expectAssetExistsAndManifested(doorPortalPreloadInternalsForTest.wildheartGateAssetUrl);
  });

  it('quest object assets', () => {
    for (const url of Object.values(questObjectPreloadInternalsForTest.questObjectUrl)) {
      expectAssetExistsAndManifested(url);
    }
  });

  it('artisan row prop assets', () => {
    for (const url of Object.values(artisanRowPreloadInternalsForTest.assetUrl)) {
      expectAssetExistsAndManifested(url);
    }
  });

  it('crafting station prop assets (Professions 2.0 Phase 9)', () => {
    for (const url of Object.values(stationsPreloadInternalsForTest.assetUrl)) {
      expectAssetExistsAndManifested(url);
    }
  });

  it('Orkadia war-camp prop assets', () => {
    for (const url of Object.values(orkadiaPropsPreloadInternalsForTest.assetUrl)) {
      expectAssetExistsAndManifested(url);
    }
  });

  it('Wildheart Basin jungle prop assets', () => {
    for (const url of Object.values(wildheartPropsPreloadInternalsForTest.assetUrl)) {
      expectAssetExistsAndManifested(url);
      const file = path.join(publicDir, url.replace(/^\//, ''));
      const size = statSync(file).size;
      expect(size, `${url} should meet the static-prop size floor`).toBeGreaterThanOrEqual(40_000);
      expect(size, `${url} should meet the static-prop size ceiling`).toBeLessThanOrEqual(100_000);
      expect(readGlbJson(url).extensionsUsed, `${url} should use Meshopt`).toContain(
        'EXT_meshopt_compression',
      );
    }
  });
});
