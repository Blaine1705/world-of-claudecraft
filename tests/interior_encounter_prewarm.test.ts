import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  encounterPrewarmDisabled,
  encounterPrewarmForInterior,
  INTERIOR_ENCOUNTER_PREWARM,
  liveSoulRendPrewarmIdentity,
  planInteriorEncounterPrewarm,
  shouldQueueLiveSoulRendPrewarm,
  vfxWeaponSkinIds,
} from '../src/render/interior_encounter_prewarm';
import { prewarmProgramContentKeys } from '../src/render/prewarm_policy';
import { WEAPON_VFX } from '../src/render/weapon_vfx';
import { WEAPON_SKINS } from '../src/sim/content/weapon_skins';
import { ALL_CLASSES } from '../src/sim/types';
import { codeWithoutLineComments } from './helpers/code_without_line_comments';

// Every source pin below reads the COMMENT-STRIPPED text: a pin that a comment
// can satisfy says nothing about what runs.
const readSource = (path: string): string =>
  codeWithoutLineComments(readFileSync(new URL(path, import.meta.url), 'utf8'));

const NYTHRAXIS_ALDRIC = 'brother_aldric_raid';

describe('interior encounter prewarm spec', () => {
  it('warms Soul Rend overlays at arena entry, not boot, and warms no encounter NPC', () => {
    const spec = INTERIOR_ENCOUNTER_PREWARM.nythraxis;
    expect(spec).toBeDefined();
    // Aldric is deliberately absent: measured cold (parked in a start zone that
    // never compiled npc_aldric), his 70% spawn linked ZERO programs because
    // the player bodies on screen already carry them.
    expect(Object.keys(spec).sort()).toEqual([
      'soulRendLivePlayerVisuals',
      'soulRendPlayerClasses',
      'soulRendVfxWeaponSkins',
    ]);
    expect(JSON.stringify(spec)).not.toContain('aldric');
    expect(spec.soulRendPlayerClasses).toBe(true);
    expect(spec.soulRendVfxWeaponSkins).toBe(true);
    expect(spec.soulRendLivePlayerVisuals).toBe(true);
    expect(encounterPrewarmForInterior('nythraxis')).toEqual(spec);
    expect(encounterPrewarmForInterior('crypt')).toBeNull();
    expect(encounterPrewarmForInterior('arena')).toBeNull();

    const renderer = readSource('../src/render/renderer.ts');
    const buildStart = renderer.indexOf('private buildInterior(');
    const buildEnd = renderer.indexOf('\n  // Outdoor fog presets', buildStart);
    const build = renderer.slice(buildStart, buildEnd);
    expect(build).toContain('startInteriorEncounterPrewarm(interior, this)');
    const kickAt = build.indexOf('startInteriorEncounterPrewarm(interior, this)');
    const kitAt = build.indexOf('.buildInterior(interior, ox, oz, opts)');
    expect(kickAt).toBeGreaterThan(-1);
    expect(kitAt).toBeGreaterThan(kickAt);

    const mobListStart = renderer.indexOf('const PREWARM_MOB_TEMPLATE_IDS = [');
    expect(mobListStart).toBeGreaterThan(-1);
    const mobListEnd = renderer.indexOf('] as const;', mobListStart);
    expect(mobListEnd).toBeGreaterThan(mobListStart);
    const mobList = renderer.slice(mobListStart, mobListEnd);
    // Positive control: a renamed marker would leave an empty slice that
    // satisfies every not.toContain below without reading a thing.
    expect(mobList).toContain('forest_wolf');
    expect(mobList).not.toContain(NYTHRAXIS_ALDRIC);
    expect(mobList).not.toContain('nythraxis');
    expect(renderer).not.toContain("'entities.nythraxis");
  });

  it('lists every catalog skin whose model has a weapon VFX spec', () => {
    const ids = vfxWeaponSkinIds(WEAPON_SKINS, {
      ice_fang: {},
      cinderbrand: {},
      missing_model: {},
    });
    expect(ids).toContain('ice_fang_sword');
    expect(ids).toContain('cinderbrand_sword');
    expect(ids).not.toContain('guildmark_arming_sword');
    expect(ids.some((id) => WEAPON_SKINS[id]?.model === 'missing_model')).toBe(false);
    // The production pairing, which the fake map above cannot check: if the
    // skin.model to WEAPON_VFX key contract drifts, the catalog half warms
    // nothing and every other assertion here stays green.
    const live = vfxWeaponSkinIds(WEAPON_SKINS, WEAPON_VFX);
    expect(live.length).toBeGreaterThan(10);
    expect(live).toContain('ice_fang_sword');
  });

  it('plans only what each Soul Rend flag asks for', () => {
    const spec = INTERIOR_ENCOUNTER_PREWARM.nythraxis;
    const full = planInteriorEncounterPrewarm(spec, {
      playerClasses: ALL_CLASSES,
      weaponSkinIds: ['ice_fang_sword'],
    });
    expect(full.playerClasses).toEqual([...ALL_CLASSES]);
    expect(full.weaponSkinIds).toEqual(['ice_fang_sword']);
    expect(Object.keys(full).sort()).toEqual(['playerClasses', 'weaponSkinIds']);

    const noClasses = planInteriorEncounterPrewarm(
      { ...spec, soulRendPlayerClasses: false },
      { playerClasses: ALL_CLASSES, weaponSkinIds: ['ice_fang_sword'] },
    );
    expect(noClasses.playerClasses).toEqual([]);
    expect(noClasses.weaponSkinIds).toEqual(['ice_fang_sword']);

    const noSkins = planInteriorEncounterPrewarm(
      { ...spec, soulRendVfxWeaponSkins: false },
      { playerClasses: ALL_CLASSES, weaponSkinIds: ['ice_fang_sword'] },
    );
    expect(noSkins.playerClasses).toEqual([...ALL_CLASSES]);
    expect(noSkins.weaponSkinIds).toEqual([]);
  });

  it('builds no encounter NPC rig at all, in the pass or the host contract', () => {
    const pass = readSource('../src/render/interior_encounter_prewarm_pass.ts');
    expect(pass).not.toContain('NPCS');
    expect(pass).not.toContain("prewarmEntity('npc'");
    expect(pass).not.toContain('prewarmedNpcModels');
    expect(pass).not.toContain('storePooledVisual');
    // The host contract sheds what only that arm needed, so it cannot come
    // back as dead scaffolding.
    const host = readSource('../src/render/interior_encounter_prewarm_host.ts');
    expect(host).not.toContain('prewarmedNpcModels');
    expect(host).not.toContain('storePooledVisual');
    // The zone prewarm still owns NPC models: this only says the ENCOUNTER
    // pass does not duplicate that job.
    const renderer = readSource('../src/render/renderer.ts');
    expect(renderer).toContain('private prewarmedNpcModels = new Set<string>()');
  });

  it('builds Soul Rend units through setSoulRend after the worn weapon-skin attach', () => {
    const pass = readSource('../src/render/interior_encounter_prewarm_pass.ts');
    expect(pass).toContain('visual.setSoulRend(true)');
    const skinAt = pass.indexOf('visual.setWeaponSkin(skinId)');
    const rendAt = pass.indexOf('visual.setSoulRend(true)', skinAt);
    expect(skinAt).toBeGreaterThan(-1);
    expect(rendAt).toBeGreaterThan(skinAt);
    expect(pass).toContain('runBackgroundPrewarm');
    expect(pass).toContain('GPU_WORK_PRIORITY.VISIBLE_PREWARM');
    expect(pass).toContain('if (!payloads || payloads.length === 0)');
    const finallyAt = pass.indexOf('} finally {');
    expect(finallyAt).toBeGreaterThan(rendAt);
    expect(pass.slice(finallyAt)).not.toContain('.dispose(');
  });

  it('drains the catalog build across idle slots instead of one attach-frame burst', () => {
    const pass = readSource('../src/render/interior_encounter_prewarm_pass.ts');
    const runStart = pass.indexOf('async function runInteriorEncounterPrewarm');
    const runEnd = pass.indexOf('function liveSoulRendProxyMesh');
    const body = pass.slice(runStart, runEnd);
    // Every rig is a skinned clone plus a material clone pass: built in one
    // loop the whole catalog lands on the interior-attach frame.
    expect(body).toContain('await runIdleQueue(units, (unit) => unit(), {');
    expect(body).toContain('cancelled: () => host.shutdownStarted');
    expect(body).toContain('timeoutMs: IDLE_MS');
    const queueAt = body.indexOf('await runIdleQueue(');
    for (const build of ['buildPlayerClass(cls)', 'buildWeaponSkin(skinId)'])
      expect(body.slice(0, queueAt)).toContain(`() => ${build}`);
    // The unit bodies are thunks the queue drives, never called inline before it.
    expect(body.slice(0, queueAt)).not.toMatch(/^\s+buildPlayerClass\(/m);
    expect(body.slice(0, queueAt)).not.toMatch(/^\s+buildWeaponSkin\(/m);
    // The compile only starts once the queue has drained (or shutdown won).
    const compileAt = body.indexOf('await compileEncounterPrewarmGroup(host, group)');
    expect(compileAt).toBeGreaterThan(queueAt);
    expect(body.slice(queueAt, compileAt)).toContain('if (host.shutdownStarted ||');
  });
});

describe('live Soul Rend player-visual prewarm', () => {
  const spec = INTERIOR_ENCOUNTER_PREWARM.nythraxis;

  function queue(over: Partial<Parameters<typeof shouldQueueLiveSoulRendPrewarm>[0]> = {}) {
    return shouldQueueLiveSoulRendPrewarm({
      disabled: false,
      spec,
      kind: 'player',
      shutdown: false,
      already: false,
      ...over,
    });
  }

  it('keys a look by the worn weapon skin, the only thing that varies per body', () => {
    // The caller holds one warmed set PER VISUAL, so the body's own identity is
    // already the map key; carrying it here forced a reverse scan of the views.
    expect(liveSoulRendPrewarmIdentity(null)).toBe('');
    expect(liveSoulRendPrewarmIdentity('ice_fang_sword')).toBe('ice_fang_sword');
    expect(liveSoulRendPrewarmIdentity('ice_fang_sword')).not.toBe(
      liveSoulRendPrewarmIdentity('skyrender_axe'),
    );
  });

  it('queues only Nythraxis player looks that are not yet warm', () => {
    expect(queue()).toBe(true);
    expect(queue({ disabled: true })).toBe(false);
    expect(queue({ spec: null })).toBe(false);
    expect(queue({ spec: { ...spec, soulRendLivePlayerVisuals: false } })).toBe(false);
    expect(queue({ kind: 'npc' })).toBe(false);
    expect(queue({ shutdown: true })).toBe(false);
    expect(queue({ already: true })).toBe(false);
  });

  it('treats a plane stand-in as a different program than the live skinned mesh', () => {
    const overlay = ['soul-rend'];
    const skinned = prewarmProgramContentKeys({ isSkinnedMesh: true, castShadow: true }, overlay);
    const plane = prewarmProgramContentKeys({ isSkinnedMesh: false, castShadow: true }, overlay);
    expect(skinned).not.toEqual(plane);
  });

  it('compiles live clones off hidden proxies without flipping the displayed mark', () => {
    const pass = readSource('../src/render/interior_encounter_prewarm_pass.ts');
    const queueStart = pass.indexOf('export function queueLiveSoulRendPrewarm');
    const queueEnd = pass.indexOf('async function runInteriorEncounterPrewarm');
    const proxyStart = pass.indexOf('function liveSoulRendProxyMesh');
    const queueBody = pass.slice(queueStart, queueEnd);
    // The queue only decides and hands off: cloning a rig's materials on the
    // frame createView or applyWeaponSkin is running is what it must not do.
    expect(queueBody).not.toContain('prewarmSoulRendSlots()');
    expect(queueBody).toContain('compileLiveSoulRendClones(typed, visual)');
    expect(queueBody).not.toContain('setSoulRend(true)');
    expect(queueBody).toContain('shouldQueueLiveSoulRendPrewarm');
    expect(pass).not.toContain('PlaneGeometry');
    const liveCompile = pass.slice(
      proxyStart,
      pass.indexOf('async function compileEncounterPrewarmGroup'),
    );
    // An arriving raid warms one body at a time: without the chain, six
    // independent idle waits resolve in the same idle period and their links
    // concatenate into one long task.
    expect(queueBody).toContain('liveChainByHost.get(host) ?? Promise.resolve()');
    expect(queueBody).toContain('liveChainByHost.set(host, chain)');
    // ...and the clone pass itself waits for an idle slot before it touches
    // the rig, so an arriving raid never pays it on the arrival frames.
    const idleAt = liveCompile.indexOf('await idleSlot(IDLE_MS');
    const cloneAt = liveCompile.indexOf('visual.prewarmSoulRendSlots()');
    expect(idleAt).toBeGreaterThan(-1);
    expect(cloneAt).toBeGreaterThan(idleAt);
    // A body torn down while the slot was pending must clone nothing.
    const visualSource = readSource('../src/render/characters/visual.ts');
    const slotsStart = visualSource.indexOf('  prewarmSoulRendSlots():');
    expect(slotsStart).toBeGreaterThan(-1);
    const slotsBody = visualSource.slice(
      slotsStart,
      visualSource.indexOf('\n  /** Scale only the drawn pose.', slotsStart),
    );
    // The selection itself is the pure core tested in soul_rend_prewarm_core;
    // what this pins is that the method delegates to it rather than growing a
    // second copy of the rule.
    expect(slotsBody).toContain('soulRendPrewarmTargets<THREE.Mesh, THREE.Material>({');
    expect(slotsBody).toContain('disposed: this.disposed,');
    expect(liveCompile).toContain("group.name = 'live-soul-rend-prewarm'");
    expect(liveCompile).toContain("batch.name = 'live-soul-rend-prewarm-batch'");
    expect(liveCompile).toContain('new THREE.SkinnedMesh(source.geometry, overlay)');
    expect(liveCompile).toContain('proxy.bind(skinned.skeleton, skinned.bindMatrix)');
    expect(liveCompile).toContain('group.add(batch)');
    expect(liveCompile).not.toContain('.dispose(');

    const start = pass.indexOf('export function startInteriorEncounterPrewarm');
    const startBody = pass.slice(start, queueStart);
    expect(startBody).toContain(
      'queueLiveSoulRendPrewarm(host, view.visual, view.weaponSkinId, interior)',
    );

    const visualSrc = readFileSync(
      new URL('../src/render/characters/visual.ts', import.meta.url),
      'utf8',
    );
    const methodStart = visualSrc.indexOf('  prewarmSoulRendSlots():');
    const methodEnd = visualSrc.indexOf('\n  /** Scale only the drawn pose.', methodStart);
    const method = visualSrc.slice(methodStart, methodEnd);
    expect(method).toContain('this.soulRendMaterial(material)');
    expect(method).not.toContain('this.soulRend =');
    expect(method).not.toContain('applyVisualMaterials');

    const renderer = readSource('../src/render/renderer.ts');
    expect(renderer).toContain('activeInterior: string | null = null');
    expect(renderer).toContain('this.activeInterior = interior');
    const createStart = renderer.indexOf('private createView(');
    const createEnd = renderer.indexOf('\n  // Shared core for every compile gate', createStart);
    const create = renderer.slice(createStart, createEnd);
    const setAt = create.indexOf('this.views.set(e.id, {');
    const kickAt = create.indexOf('queueLiveSoulRendPrewarm(this, visual, null)');
    expect(setAt).toBeGreaterThan(-1);
    expect(kickAt).toBeGreaterThan(setAt);
    const applyStart = renderer.indexOf('private applyWeaponSkin(');
    const applyEnd = renderer.indexOf('\n  /** Spend this frame', applyStart);
    const apply = renderer.slice(applyStart, applyEnd);
    const skinAt = apply.indexOf('v.visual.setWeaponSkin(skinId)');
    const skinKick = apply.indexOf('queueLiveSoulRendPrewarm(this, v.visual, skinId)');
    expect(skinAt).toBeGreaterThan(-1);
    expect(skinKick).toBeGreaterThan(skinAt);
  });
});

describe('interior encounter prewarm kill switch', () => {
  it('treats encounterPrewarm=0 and =off as disabled, anything else as enabled', () => {
    expect(encounterPrewarmDisabled('')).toBe(false);
    expect(encounterPrewarmDisabled('?perf&gfx=insane')).toBe(false);
    expect(encounterPrewarmDisabled('?encounterPrewarm=1')).toBe(false);
    expect(encounterPrewarmDisabled('?encounterPrewarm=0')).toBe(true);
    expect(encounterPrewarmDisabled('?encounterPrewarm=off')).toBe(true);
    expect(encounterPrewarmDisabled('perf=1&encounterPrewarm=0&gfx=insane')).toBe(true);
  });

  it('returns before recording a started interior when the URL disables prewarm', () => {
    const pass = readSource('../src/render/interior_encounter_prewarm_pass.ts');
    const start = pass.indexOf('export function startInteriorEncounterPrewarm');
    const run = pass.indexOf('async function runInteriorEncounterPrewarm');
    const body = pass.slice(start, run);
    expect(body).toContain('encounterPrewarmDisabled');
    expect(body.indexOf('encounterPrewarmDisabled')).toBeLessThan(body.indexOf('started.add'));
  });
});
