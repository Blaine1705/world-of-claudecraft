import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ENCOUNTER_PREWARM_SETS,
  type EncounterPrewarmSet,
  encounterPrewarmDisabled,
  encounterPrewarmForInterior,
  encounterPrewarmSpecForSets,
  INTERIOR_ENCOUNTER_PREWARM,
  unclaimedEncounterPrewarmSets,
} from '../src/render/interior_encounter_prewarm';
import { DUNGEONS } from '../src/sim/data';
import { IGNIVAR_LIFT_ROOM_ID, IGNIVAR_RAID_ROOM_IDS } from '../src/sim/ignivar_raid_ids';
import { codeWithoutLineComments } from './helpers/code_without_line_comments';

// Every source pin below reads the COMMENT-STRIPPED text: a pin that a comment
// can satisfy says nothing about what runs.
const readSource = (path: string): string =>
  codeWithoutLineComments(readFileSync(new URL(path, import.meta.url), 'utf8'));

const NYTHRAXIS_ALDRIC = 'brother_aldric_raid';

describe('interior encounter prewarm spec', () => {
  it('warms every Varkhul and Ignivar encounter material before entering the Inner Crucible', () => {
    const spec = INTERIOR_ENCOUNTER_PREWARM.ignivar_depths;
    expect(spec).toEqual({ varkhulVisuals: true, ignivarVisuals: true });
    expect(encounterPrewarmForInterior('ignivar_depths')).toEqual(spec);
  });

  it('warms both raid sets from the Forge-Lift and the Halls, before either boss room', () => {
    for (const interior of ['ignivar_lift', 'ignivar_approach']) {
      const spec = INTERIOR_ENCOUNTER_PREWARM[interior];
      expect(spec).toEqual({ varkhulVisuals: true, ignivarVisuals: true });
      expect(encounterPrewarmForInterior(interior)).toEqual(spec);
    }
  });

  it('claims a set once whichever interior asks, and narrows a spec to the unclaimed sets', () => {
    const lift = INTERIOR_ENCOUNTER_PREWARM.ignivar_lift;
    const claimed = new Set<EncounterPrewarmSet>();
    expect(unclaimedEncounterPrewarmSets(lift, claimed)).toEqual([
      'varkhulVisuals',
      'ignivarVisuals',
    ]);
    claimed.add('varkhulVisuals');
    claimed.add('ignivarVisuals');
    for (const interior of ['ignivar_approach', 'ignivar', 'ignivar_depths']) {
      expect(unclaimedEncounterPrewarmSets(INTERIOR_ENCOUNTER_PREWARM[interior], claimed)).toEqual(
        [],
      );
    }
    // A claim on the raid sets says nothing about the crypt's.
    expect(unclaimedEncounterPrewarmSets(INTERIOR_ENCOUNTER_PREWARM.nythraxis, claimed)).toEqual([
      'nythraxisGraveVisuals',
    ]);

    // Every staged set, one per flag the spec can carry.
    expect([...ENCOUNTER_PREWARM_SETS].sort()).toEqual([
      'ignivarVisuals',
      'nythraxisGraveVisuals',
      'varkhulVisuals',
    ]);
    const depths = INTERIOR_ENCOUNTER_PREWARM.ignivar_depths;
    const onlyIgnivar = encounterPrewarmSpecForSets(depths, ['ignivarVisuals']);
    expect(onlyIgnivar.ignivarVisuals).toBe(true);
    expect(onlyIgnivar.varkhulVisuals).toBe(false);
    for (const set of ENCOUNTER_PREWARM_SETS) {
      expect(encounterPrewarmSpecForSets(depths, [set])[set]).toBe(true);
      expect(encounterPrewarmSpecForSets(depths, [])[set]).toBe(false);
    }
  });

  it('keys every row by an interior some dungeon room declares, the lift first in the raid', () => {
    const interiors = new Set<string>(Object.values(DUNGEONS).map((room) => room.interior));
    const rows = Object.keys(INTERIOR_ENCOUNTER_PREWARM);
    expect(rows.length).toBeGreaterThanOrEqual(5);
    for (const row of rows) expect(interiors.has(row), row).toBe(true);
    // The rows count on the raid entering through the lift, its quiet room.
    expect(IGNIVAR_RAID_ROOM_IDS[0]).toBe(IGNIVAR_LIFT_ROOM_ID);
    expect(DUNGEONS[IGNIVAR_LIFT_ROOM_ID].interior).toBe('ignivar_lift');
    for (const room of IGNIVAR_RAID_ROOM_IDS) {
      const interior = DUNGEONS[room].interior;
      expect(interior && encounterPrewarmForInterior(interior), room).not.toBeNull();
    }
  });

  it('claims every staged flag a row sets as a set, and nothing else', () => {
    const staged = new Set<string>();
    const flags = new Set<string>();
    for (const spec of Object.values(INTERIOR_ENCOUNTER_PREWARM)) {
      for (const [flag, on] of Object.entries(spec)) {
        flags.add(flag);
        if (on === true) staged.add(flag);
      }
    }
    expect([...staged].sort()).toEqual([...ENCOUNTER_PREWARM_SETS].sort());
    expect([...flags].sort()).toEqual([...ENCOUNTER_PREWARM_SETS].sort());
  });

  it('warms the Ignivar mechanic visuals in the Crucible arena, without the Varkhul set', () => {
    const spec = INTERIOR_ENCOUNTER_PREWARM.ignivar;
    expect(spec).toEqual({ ignivarVisuals: true });
    expect(encounterPrewarmForInterior('ignivar')).toEqual(spec);
    expect(spec.varkhulVisuals).toBeUndefined();
  });

  it('warms the Nythraxis floor visuals at arena entry, not boot, and warms no encounter NPC', () => {
    const spec = INTERIOR_ENCOUNTER_PREWARM.nythraxis;
    expect(spec).toBeDefined();
    // Aldric is deliberately absent: measured cold (parked in a start zone that
    // never compiled npc_aldric), his 70% spawn linked ZERO programs because
    // the player bodies on screen already carry them. Soul Rend is absent too:
    // the mark draws the spirit veil, which the boot manifest links.
    expect(spec).toEqual({ nythraxisGraveVisuals: true });
    expect(JSON.stringify(spec)).not.toContain('aldric');
    expect(encounterPrewarmForInterior('nythraxis')).toEqual(spec);
    expect(encounterPrewarmForInterior('crypt')).toBeNull();
    expect(encounterPrewarmForInterior('arena')).toBeNull();

    const renderer = readSource('../src/render/renderer.ts');
    const buildStart = renderer.indexOf(
      'private readonly staticInteriors = new StaticInteriorTracker(',
    );
    const buildEnd = renderer.indexOf('\n  );', buildStart);
    expect(buildStart).toBeGreaterThan(-1);
    expect(buildEnd).toBeGreaterThan(buildStart);
    const build = renderer.slice(buildStart, buildEnd);
    expect(build).toContain('encounterPrewarm.startInteriorEncounterPrewarm(interior, this)');
    const kickAt = build.indexOf('encounterPrewarm.startInteriorEncounterPrewarm(interior, this)');
    const kitAt = build.indexOf('this.ensureDungeons().buildInterior(interior, x, z)');
    expect(kickAt).toBeGreaterThan(-1);
    expect(kitAt).toBeGreaterThan(kickAt);

    // The zone prewarm constants moved to src/render/zone_prewarm_groups.ts
    // at the Phase 16 extraction; the encounter-exclusion claim follows them.
    const prewarmGroups = readSource('../src/render/zone_prewarm_groups.ts');
    const mobListStart = prewarmGroups.indexOf('const PREWARM_MOB_TEMPLATE_IDS = [');
    expect(mobListStart).toBeGreaterThan(-1);
    const mobListEnd = prewarmGroups.indexOf('] as const;', mobListStart);
    expect(mobListEnd).toBeGreaterThan(mobListStart);
    const mobList = prewarmGroups.slice(mobListStart, mobListEnd);
    // Positive control: a renamed marker would leave an empty slice that
    // satisfies every not.toContain below without reading a thing.
    expect(mobList).toContain('forest_wolf');
    expect(mobList).not.toContain(NYTHRAXIS_ALDRIC);
    expect(mobList).not.toContain('nythraxis');
    expect(renderer).not.toContain("'entities.nythraxis");
    expect(prewarmGroups).not.toContain("'entities.nythraxis");
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

  it('builds no player rig: the Soul Rend mark needs no encounter warm-up', () => {
    // The mark draws the spirit veil, one program family the boot manifest
    // links for every rig, so warming class rigs or live bodies in the crypt
    // would link nothing new; neither the catalog nor the live arm may return.
    // The one character rig the pass builds is Varkhul's (a mob).
    const pass = readSource('../src/render/interior_encounter_prewarm_pass.ts');
    for (const gone of [
      'setSoulRend',
      "prewarmEntity('player'",
      'queueLiveSoulRendPrewarm',
      'WEAPON_SKINS',
      'ALL_CLASSES',
    ]) {
      expect(pass, gone).not.toContain(gone);
    }
    expect(pass.match(/createCharacterVisual\(/g)).toHaveLength(1);
    expect(pass.match(/prewarmEntity\(/g)).toHaveLength(1);
    expect(pass).toContain("host.prewarmEntity('mob', template.id");
    const spec = readSource('../src/render/interior_encounter_prewarm.ts');
    expect(spec).not.toMatch(/soulRend/);
    const renderer = readSource('../src/render/renderer.ts');
    expect(renderer).not.toContain('SoulRendPrewarm');
    expect(renderer).not.toContain('setEncounterPrewarmInterior');
  });

  it('drains the visual builds across idle slots instead of one attach-frame burst', () => {
    const pass = readSource('../src/render/interior_encounter_prewarm_pass.ts');
    const runStart = pass.indexOf('async function runInteriorEncounterPrewarm');
    const runEnd = pass.indexOf('function placeHiddenPrewarmGroup');
    expect(runStart).toBeGreaterThan(-1);
    expect(runEnd).toBeGreaterThan(runStart);
    const body = pass.slice(runStart, runEnd);
    expect(body).toContain('await runIdleQueue(units, (unit) => unit(), {');
    expect(body).toContain('cancelled: () => host.shutdownStarted');
    expect(body).toContain('timeoutMs: IDLE_MS');
    const queueAt = body.indexOf('await runIdleQueue(');
    for (const build of [
      'buildVarkhulEncounterPrewarmVisual()',
      'buildIgnivarEncounterPrewarmVisual()',
      'buildNythraxisGravePrewarmVisual()',
    ])
      expect(body.slice(0, queueAt)).toContain(build);
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

  it('keys a look by everything the body HOLDS, since each re-snapshots the rig', () => {
    // The caller holds one warmed set PER VISUAL, so the body's own identity is
    // already the map key; carrying it here forced a reverse scan of the views.
    // What varies per body is the held look: setWeapon AND setOffhand both re-run
    // finishWeaponAttach, which re-snapshots the original materials the mark
    // repaints. A form rig (null) holds nothing it can swap.
    const held = (over: Partial<LiveSoulRendLook>): LiveSoulRendLook => ({
      weaponSkinId: null,
      mainhandItemId: null,
      offhandItemId: null,
      ...over,
    });
    expect(liveSoulRendPrewarmIdentity(null)).toBe('');
    expect(liveSoulRendPrewarmIdentity(held({}))).toBe('||');
    // One dimension at a time: a key that only reads the skin passes the first
    // of these three and fails the other two.
    for (const over of [
      { weaponSkinId: 'ice_fang_sword' },
      { mainhandItemId: 'ashbringer' },
      { offhandItemId: 'oak_shield' },
    ]) {
      expect(liveSoulRendPrewarmIdentity(held(over))).not.toBe(
        liveSoulRendPrewarmIdentity(held({})),
      );
    }
    expect(liveSoulRendPrewarmIdentity(held({ weaponSkinId: 'ice_fang_sword' }))).not.toBe(
      liveSoulRendPrewarmIdentity(held({ weaponSkinId: 'skyrender_axe' })),
    );
    // A sheathe toggle changes nothing it holds, so it must not re-key.
    expect(liveSoulRendPrewarmIdentity(held({ mainhandItemId: 'ashbringer' }))).toBe(
      liveSoulRendPrewarmIdentity(held({ mainhandItemId: 'ashbringer' })),
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
    // The kind comes from the view's OWN entity, by id: the reverse scan that
    // used to recover it could only ever find a body some view owns, which is
    // exactly what a form rig is not.
    expect(startBody).toContain("typed.sim.entities.get(id)?.kind ?? ''");
    expect(queueBody).not.toContain('view.visual !== visual');

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
    // The live interior is owned by the pass, not by a field on the monolith;
    // the renderer only REPORTS every change, including leaving one.
    expect(renderer).not.toContain('activeInterior: string | null = null');
    expect(renderer).toContain(
      'encounterPrewarm.setEncounterPrewarmInterior(this, fogScene.interior ?? null)',
    );
    const createStart = renderer.indexOf('private createView(');
    const createEnd = renderer.indexOf('\n  // Shared core for every compile gate', createStart);
    const create = renderer.slice(createStart, createEnd);
    const setAt = create.indexOf('this.views.set(e.id, {');
    const kickAt = create.indexOf(
      'encounterPrewarm.queueLiveSoulRendPrewarm(this, visual, view, e.kind)',
    );
    expect(setAt).toBeGreaterThan(-1);
    expect(kickAt).toBeGreaterThan(setAt);
    const applyStart = renderer.indexOf('private applyWeaponSkin(');
    const applyEnd = renderer.indexOf('\n  /** Spend this frame', applyStart);
    const apply = renderer.slice(applyStart, applyEnd);
    const skinAt = apply.indexOf('v.visual.setWeaponSkin(skinId)');
    const skinKick = apply.indexOf(
      'encounterPrewarm.queueLiveSoulRendPrewarm(this, v.visual, v, kind)',
    );
    expect(skinAt).toBeGreaterThan(-1);
    expect(skinKick).toBeGreaterThan(skinAt);
  });

  it('warms every OTHER path that mints or re-snapshots a live rig', () => {
    const renderer = readSource('../src/render/renderer.ts');

    // A form rig (sheep/bear/cat/travel/metamorph/sporemender) is what a shapeshifted body
    // takes the mark on, and three keys the program on mesh shape and skinning,
    // so it cannot inherit the base rig's warmed variant. Its look is null: a
    // form holds nothing it can swap.
    const formStart = renderer.indexOf('  private buildFormVisual(');
    const formEnd = renderer.indexOf('\n  private ', formStart + 10);
    expect(formStart).toBeGreaterThan(-1);
    const form = renderer.slice(formStart, formEnd);
    // Positive control: a renamed method would leave an empty slice that
    // satisfies the assertions below without reading a thing.
    expect(form).toContain('this.createCharacterVisualWithRetry(e, formKey, formKey)');
    expect(form).toContain('encounterPrewarm.queueLiveSoulRendPrewarm(this, built, null, e.kind)');
    // Every lazy form goes through it, so none can be forgotten one at a time.
    for (const call of [
      "this.buildFormVisual(e, v, 'form_sheep', 'sheepVisual', true)",
      "this.buildFormVisual(e, v, 'form_bear', 'bearVisual', true)",
      "this.buildFormVisual(e, v, 'form_cat', 'catVisual', true)",
      "this.buildFormVisual(e, v, 'form_travel', 'travelVisual', true)",
      "this.buildFormVisual(e, v, 'form_metamorph', 'metamorphVisual', false)",
      "this.buildFormVisual(e, v, 'form_sporemender', 'sporemenderVisual', true)",
    ]) {
      expect(renderer).toContain(call);
    }

    // A race/mech swap replaces v.visual outright: the replacement is cold.
    const baseStart = renderer.indexOf('  private updateBaseVisual(');
    const baseEnd = renderer.indexOf('\n  // Weapon-skin cosmetics waiting', baseStart);
    const base = renderer.slice(baseStart, baseEnd);
    expect(base).toContain('v.visual = next');
    const nextAt = base.indexOf('v.visual = next');
    const baseKick = base.indexOf(
      'encounterPrewarm.queueLiveSoulRendPrewarm(this, next, v, e.kind)',
    );
    expect(baseKick).toBeGreaterThan(nextAt);

    // setWeapon/setOffhand both re-snapshot the originals with the new weapon's
    // meshes, and applyWeaponSkin is the only re-queue that used to exist.
    for (const setter of ['v.visual.setWeapon(e.mainhandItemId)', 'v.visual.setOffhand(']) {
      const at = renderer.indexOf(setter);
      expect(at).toBeGreaterThan(-1);
      const kick = renderer.indexOf(
        'encounterPrewarm.queueLiveSoulRendPrewarm(this, v.visual, v, e.kind)',
        at,
      );
      expect(kick).toBeGreaterThan(at);
      // ...inside the same diff block, not somewhere far below it.
      expect(kick - at).toBeLessThan(400);
    }
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
