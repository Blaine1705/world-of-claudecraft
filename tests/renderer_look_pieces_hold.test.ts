// The live candidate path's HOLD for composed looks whose pieces are not
// resident (src/render/characters/look_pieces.ts): the entity keeps waiting
// with its pieces enqueued and takes no slot of the frame's view budget; the
// local target and a covered frame build synchronously as before; the manifest
// path (a deadline-bearing call) never holds.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetArrivalCoverForTest, setArrivalCover } from '../src/render/arrival_cover';
import { GPU_WORK_PRIORITY } from '../src/render/background_gpu_queue';
import { setModularLookProvider } from '../src/render/characters';
import {
  LOOK_TEXTURE_BANDS,
  lookPiecesStats,
  resetLookPiecesForTest,
  STUBBLE_BAND_LABEL,
} from '../src/render/characters/look_pieces';
import { DEFAULT_APPEARANCE, type ModularLook } from '../src/render/characters/modular';
import { decalKey, hasDecalTexture } from '../src/render/characters/stubble';
import { makeQuestObjectGate } from '../src/render/quest_object_gate_core';
import { Renderer } from '../src/render/renderer';
import type { Entity } from '../src/sim/types';

const source = readFileSync(new URL('../src/render/renderer.ts', import.meta.url), 'utf8');

function entity(id: number, kind: Entity['kind'], templateId = 'warrior'): Entity {
  return {
    id,
    kind,
    templateId,
    targetId: null,
    pos: { x: id, y: 0, z: 0 },
    hp: 1,
    maxHp: 1,
    dead: false,
  } as unknown as Entity;
}

// A never-seen style pair so the hold is real: nothing in this process has
// painted it (look_pieces.test.ts uses other pairs).
const LOOK: ModularLook = {
  app: { ...DEFAULT_APPEARANCE, hair: 'crew', beard: 'scruff', blush: 'none', eyeshadow: 'none' },
  worn: {},
};
const SEL = { scalp: 'crew', beard: 'scruff' } as const;

interface HoldRenderer {
  createCandidateViews(
    limit: number,
    createdViewTypes: string[],
    deadlineMs?: number,
    holdUnreadyLooks?: boolean,
  ): { created: number; trimmed: boolean };
}

function rendererFor(entities: Entity[], targetId: number | null) {
  const player = entity(1, 'player');
  player.targetId = targetId;
  const map = new Map(entities.map((e) => [e.id, e]));
  const views = new Map<number, object>();
  const runs: { label: string; priority: number }[] = [];
  const createView = vi.fn((e: Entity) => views.set(e.id, {}));
  const renderer = Object.create(Renderer.prototype) as Record<string, unknown> & HoldRenderer;
  renderer.sim = { entities: map, player, questLog: new Map() };
  renderer.views = views;
  renderer.questObjectHidden = makeQuestObjectGate({});
  renderer.viewCreateRetry = { canAttempt: () => true };
  renderer.createView = createView;
  renderer.viewCandidates = entities.map((e) => ({ id: e.id, d2: e.id, priority: 0 }));
  renderer.backgroundGpuWork = {
    run: (work: () => unknown, priority: number, label: string) => {
      runs.push({ label, priority });
      return Promise.resolve(work());
    },
  };
  return { renderer, createView, views, runs };
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < LOOK_TEXTURE_BANDS + 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

describe('the composed-look hold on the live candidate path', () => {
  beforeEach(() => {
    resetLookPiecesForTest();
    resetArrivalCoverForTest();
    // every player composes with the never-seen look; mobs keep their rig
    setModularLookProvider((e) => (e.kind === 'player' ? LOOK : null));
  });
  afterEach(() => {
    setModularLookProvider(null);
    resetArrivalCoverForTest();
  });

  it('holds an unready composed look without spending a slot, never the target, and builds it once resident', async () => {
    expect(hasDecalTexture(SEL)).toBe(false);
    const held = entity(2, 'player');
    const target = entity(3, 'player');
    const mob = entity(4, 'mob', 'forest_wolf');
    const { renderer, createView, runs } = rendererFor([held, target, mob], target.id);
    // budget of ONE view: the held player must not be the one that eats it
    const first = renderer.createCandidateViews(1, [], Infinity, true);
    expect(first).toEqual({ created: 1, trimmed: true });
    expect(createView).toHaveBeenCalledTimes(1);
    expect(createView).toHaveBeenCalledWith(target);
    expect(lookPiecesStats()).toMatchObject({ pending: 1, holds: 1 });
    expect(runs[0]).toEqual({
      label: `${STUBBLE_BAND_LABEL}:${decalKey(SEL)}:0`,
      priority: GPU_WORK_PRIORITY.LIVE_VIEW,
    });
    // the pieces land on the queue; the next pass builds the held body
    await flush();
    expect(hasDecalTexture(SEL)).toBe(true);
    createView.mockClear();
    const second = renderer.createCandidateViews(4, [], Infinity, true);
    expect(second).toEqual({ created: 2, trimmed: false });
    expect(createView.mock.calls.map(([e]) => (e as Entity).id)).toEqual([held.id, mob.id]);
    expect(lookPiecesStats().holds).toBe(1);
  });

  it('never holds on the manifest path or under a cover (the synchronous build as today)', () => {
    const NEVER_SEEN: ModularLook = {
      app: { ...LOOK.app, hair: 'crew', beard: 'stubble' },
      worn: {},
    };
    setModularLookProvider((e) => (e.kind === 'player' ? NEVER_SEEN : null));
    expect(hasDecalTexture({ scalp: 'crew', beard: 'stubble' })).toBe(false);
    const peer = entity(2, 'player');
    const manifest = rendererFor([peer], null);
    expect(manifest.renderer.createCandidateViews(4, [], performance.now() + 10_000)).toEqual({
      created: 1,
      trimmed: false,
    });
    expect(manifest.createView).toHaveBeenCalledWith(peer);
    expect(manifest.runs).toEqual([]);
    setArrivalCover(true);
    const covered = rendererFor([peer], null);
    expect(covered.renderer.createCandidateViews(4, [], Infinity, true).created).toBe(1);
    expect(covered.runs).toEqual([]);
    expect(lookPiecesStats().holds).toBe(0);
  });

  it('is wired on the runtime call alone (source pin)', () => {
    const runtime = source.indexOf(
      'createdViews += this.createCandidateViews(\n      this.runtimeViewCreateBudget(dt),\n      createdViewTypes,\n      Infinity,\n      true,\n    ).created;',
    );
    expect(runtime).toBeGreaterThan(-1);
    // the manifest call keeps its three arguments
    expect(source).toContain(
      'this.createCandidateViews(\n            remainingPrewarmViewBudget(policy.maxViews, createdViews),\n            createdViewTypes,\n            buildDeadline,\n          );',
    );
    // the hold precedes the build and the slot count, and never spends a slot
    const loop = source.slice(
      source.indexOf('private createCandidateViews('),
      source.indexOf('private holdComposedLook('),
    );
    expect(loop).toContain(
      'if (holdUnreadyLooks && this.holdComposedLook(e)) continue;\n      this.createView(e);\n      sampleCreatedViewType(createdViewTypes, e);\n      created++;',
    );
    const hold = source.slice(
      source.indexOf('private holdComposedLook('),
      source.indexOf('\n  }', source.indexOf('private holdComposedLook(')),
    );
    expect(hold).toContain(
      'if (e.id === this.sim.player.targetId || arrivalCoverActive()) return false;',
    );
    expect(hold).toContain('GPU_WORK_PRIORITY.LIVE_VIEW');
    expect(source).toContain('lookPieces: lookPiecesStats(),');
  });
});
