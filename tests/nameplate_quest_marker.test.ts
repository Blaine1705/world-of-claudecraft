// @vitest-environment happy-dom
//
// The overhead quest marker branch of the nameplate painter, now driven by the
// shared quest_marker_kind rule (phase 23): the gold '!'/'?' arms must stay
// byte-identical to the pre-phase painter, the blue repeat and dimmed cooldown
// variants join them, and (the nameplate_ai_tag lesson) a LIVE transition from
// gold to blue must repaint, which holds only while marker and markerClass stay
// in the plate's static signature.

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { NameplatePainter } from '../src/render/nameplate_painter';
import type { EntityView } from '../src/render/renderer';
import { QUESTS } from '../src/sim/data';
import type { Entity, QuestState } from '../src/sim/types';
import type { IWorld } from '../src/world_api';

const VIEWPORT = { width: 1280, height: 720 };

function requireWorkOrderQuest() {
  const quest = Object.values(QUESTS).find((q) => q.repeatable && q.repeatCadenceTicks);
  if (!quest) throw new Error('expected a cadenced work order');
  return quest;
}
const WORK_ORDER = requireWorkOrderQuest();

function entity(over: Partial<Entity> & { id: number }): Entity {
  return {
    kind: 'player',
    name: 'Viewer',
    templateId: 'warrior',
    pos: { x: 0, y: 0, z: 0 },
    scale: 1,
    level: 10,
    hp: 100,
    maxHp: 100,
    dead: false,
    lootable: false,
    hostile: false,
    ownerId: null,
    guild: '',
    auras: [],
    questIds: [],
    targetId: null,
    aggroTargetId: null,
    comboPoints: 0,
    comboTargetId: null,
    castingAbility: null,
    castTotal: 0,
    castRemaining: 0,
    channeling: false,
    ...over,
  } as unknown as Entity;
}

function view(): EntityView {
  const div = (cls: string) => {
    const el = document.createElement('div');
    el.className = cls;
    return el;
  };
  const img = () => document.createElement('img');
  const levelEl = document.createElement('span');
  levelEl.className = 'np-level';
  const group = new THREE.Group();
  group.position.set(0, 0, 0);
  return {
    group,
    height: 2,
    mountLift: 0,
    nameplate: div('nameplate'),
    nameEl: div('np-name'),
    titleEl: div('np-title'),
    guildEl: div('np-guild'),
    hpBar: div('np-hpbar'),
    hpFill: div('np-hpfill'),
    emoteEl: div('np-emote'),
    emoteIconEl: img(),
    emoteLabelEl: document.createElement('span'),
    markerEl: div('np-marker'),
    castBar: div('np-castbar'),
    castFill: div('np-castfill'),
    castLabel: div('np-castlabel'),
    raidMarkEl: div('np-raidmark'),
    comboRow: div('np-combo'),
    comboPips: [div('pip'), div('pip'), div('pip'), div('pip'), div('pip')],
    tierEl: img(),
    devTierEl: img(),
    discordEl: img(),
    aiEl: document.createElement('span'),
    levelEl,
    nameplateDisplay: 'none',
    nameplateTransform: '',
    nameplateSig: '',
    nameplateStateMask: 0,
    nameplateFriendlyPet: false,
    nameplateHpWidth: '',
    nameplateScale: 1,
    nameplateBaseOpacity: '1',
    nameplateOpacity: '',
    comboSig: '',
    tierValue: 0,
    devTierValue: 0,
    discordAvatarSig: '',
    levelSig: '',
  } as unknown as EntityView;
}

/** A painter looking at the work order's giver NPC, with the quest-marker
 *  world knobs (state, history, the cadence mirror) under test control. */
function harness(knobs: { state: QuestState; done?: boolean; cadenceBlocked?: boolean }) {
  const me = entity({ id: 1, name: 'Me', pos: { x: 0, y: 0, z: 3 } as Entity['pos'] });
  const npc = entity({
    id: 2,
    kind: 'npc',
    name: 'Master',
    templateId: WORK_ORDER.giverNpcId,
    questIds: [WORK_ORDER.id],
  });
  const views = new Map<number, EntityView>();
  const v = view();
  views.set(npc.id, v);
  const camera = new THREE.PerspectiveCamera(60, VIEWPORT.width / VIEWPORT.height, 0.1, 500);
  camera.position.set(0, 3, 12);
  camera.lookAt(0, 1, 0);
  camera.updateMatrixWorld(true);
  const world = {
    player: me,
    entities: new Map<number, Entity>([
      [me.id, me],
      [npc.id, npc],
    ]),
    markerFor: () => null,
    questState: () => knobs.state,
    questsDone: new Set<string>(knobs.done ? [WORK_ORDER.id] : []),
    craftingIdentity: {
      version: 1,
      synced: true,
      cadenceBlockedQuests: knobs.cadenceBlocked ? [WORK_ORDER.id] : [],
    },
  } as unknown as IWorld;
  const painter = new NameplatePainter({
    views,
    camera,
    world,
    getViewport: () => VIEWPORT,
    showNameplates: () => true,
    showDevBadges: () => true,
    showOwnNameplate: () => false,
    showPlayerNameplates: () => true,
    isHostilePlayer: () => false,
  });
  return { painter, v, world };
}

describe('nameplate quest marker variants', () => {
  it("keeps the gold '!' for a never-completed offer, repeatable or not (Q30's first half)", () => {
    const { painter, v } = harness({ state: 'available' });
    painter.update(true);
    expect(v.markerEl.textContent).toBe('!');
    expect(v.markerEl.className).toBe('np-marker avail');
  });

  it("keeps the gold '?' for a ready turn-in and the gray '?' for an active one", () => {
    const ready = harness({ state: 'ready', done: true });
    ready.painter.update(true);
    expect(ready.v.markerEl.textContent).toBe('?');
    expect(ready.v.markerEl.className).toBe('np-marker ready');

    const active = harness({ state: 'active' });
    active.painter.update(true);
    expect(active.v.markerEl.textContent).toBe('?');
    expect(active.v.markerEl.className).toBe('np-marker active');
  });

  it("shows the blue '!' once the repeatable has been completed at least once", () => {
    const { painter, v } = harness({ state: 'available', done: true });
    painter.update(true);
    expect(v.markerEl.textContent).toBe('!');
    expect(v.markerEl.className).toBe('np-marker repeat');
  });

  it("shows the dimmed '!' inside the cadence window, and nothing without the mirror", () => {
    const blocked = harness({ state: 'unavailable', done: true, cadenceBlocked: true });
    blocked.painter.update(true);
    expect(blocked.v.markerEl.textContent).toBe('!');
    expect(blocked.v.markerEl.className).toBe('np-marker cooldown');

    // An older server payload (no cadenceBlockedQuests) degrades to today's
    // no-marker plate rather than guessing.
    const bare = harness({ state: 'unavailable', done: true });
    bare.painter.update(true);
    expect(bare.v.markerEl.textContent).toBe('');
    expect(bare.v.markerEl.className).toBe('np-marker');
  });

  it('repaints on a LIVE gold-to-blue transition: the marker class is in the plate signature', () => {
    // The first completion of a work order happens while its giver's plate
    // is on screen; if markerClass ever leaves the static signature the
    // plate keeps the gold '!' until something else changes (the ai-tag
    // lesson, applied to this branch).
    const { painter, v, world } = harness({ state: 'available' });
    painter.update(true);
    expect(v.markerEl.className).toBe('np-marker avail');
    (world as unknown as { questsDone: Set<string> }).questsDone.add(WORK_ORDER.id);
    painter.update(true);
    expect(v.markerEl.textContent).toBe('!');
    expect(v.markerEl.className).toBe('np-marker repeat');
  });
});
