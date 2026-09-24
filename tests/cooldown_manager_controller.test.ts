// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { ABILITIES } from '../src/sim/content/classes';
import type { ResolvedAbility } from '../src/sim/sim';
import type { ActionBarWorldInput } from '../src/ui/hud/action_bar/action_bar_view';
import {
  CooldownManagerController,
  type CooldownManagerWorld,
} from '../src/ui/hud/cooldown_manager/cooldown_manager_controller';
import { CooldownManagerSettingsPanel } from '../src/ui/hud/cooldown_manager/cooldown_manager_settings';
import type { PainterHostWriters } from '../src/ui/painter_host';

const CUE = 'ui_aura_hard_bell';

beforeEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
});

const writers = {
  toggleClass: (el: HTMLElement, cls: string, on: boolean) => el.classList.toggle(cls, on),
  setText: (el: HTMLElement, text: string) => {
    el.textContent = text;
  },
  setStyleProp: (el: HTMLElement, prop: string, value: string) => {
    el.style.setProperty(prop, value);
  },
} as unknown as PainterHostWriters;

function resolved(id: string): ResolvedAbility {
  const def = ABILITIES[id];
  return { def, cost: 10, cooldown: def.cooldown, effects: [] } as unknown as ResolvedAbility;
}

/** A druid that knows Flense (rake), Rendclaw (claw) and Gorebite (ferocious_bite). */
function rig(opts: { inCombat?: boolean } = {}) {
  const known = ['rake', 'claw', 'ferocious_bite'].map(resolved);
  const world = {
    cfg: { playerClass: 'druid' },
    player: { name: 'Bob', inCombat: opts.inCombat ?? false },
    known,
    resolvedAbility: (id: string) => known.find((ability) => ability.def.id === id) ?? null,
  } as unknown as CooldownManagerWorld & { player: { inCombat: boolean } };
  const cues: [string, number][] = [];
  let auraGlow: ReadonlySet<string> = new Set();
  const controller = new CooldownManagerController({
    world,
    writers,
    playCue: (id, volume) => cues.push([id, volume]),
    auraGlowIds: () => auraGlow,
  });
  const cooldowns = new Map<string, number>();
  const snapshot = {
    player: {
      id: 1,
      autoAttack: false,
      dead: false,
      resource: 100,
      resourceType: 'energy',
      savedMana: 0,
      cooldowns,
      gcdRemaining: 0,
      potionCdRemaining: 0,
      queuedOnSwing: null,
      pos: { x: 0, y: 0, z: 0 },
      auras: [],
    },
    target: null,
    inventory: [],
    stealthed: false,
    entities: [],
    activeAimSlot: null,
  } as unknown as ActionBarWorldInput;
  return {
    controller,
    hooks: controller.settingsHooks(),
    world,
    cooldowns,
    snapshot,
    cues,
    setAuraGlow: (ids: string[]) => {
      auraGlow = new Set(ids);
    },
    layer: () => document.getElementById('cooldown-manager') as HTMLElement,
  };
}

describe('CooldownManagerController', () => {
  it('builds one floating group per kind with explicit grid cells, aria-hidden', () => {
    const { hooks, layer } = rig();
    const line = hooks.addGroup('line') as string;
    const grid = hooks.addGroup('grid') as string;
    const single = hooks.addGroup('single') as string;
    hooks.assign('rake', line);
    hooks.assign('claw', line);
    hooks.assign('ferocious_bite', single);
    hooks.patchGroup(grid, { perLine: 2 });
    expect(layer().getAttribute('aria-hidden')).toBe('true');
    const groups = Array.from(layer().querySelectorAll<HTMLElement>('.cdm-group'));
    expect(groups.map((g) => g.dataset.group)).toEqual([line, grid, single]);
    expect(groups[0].classList.contains('cdm-group--line')).toBe(true);
    const cells = Array.from(groups[0].querySelectorAll<HTMLElement>('.cdm-btn')).map((b) => [
      b.style.gridColumn,
      b.style.gridRow,
    ]);
    expect(cells).toEqual([
      ['1', '1'],
      ['2', '1'],
    ]);
    // A spell sits in one group: moving it empties its old slot.
    hooks.assign('claw', single);
    expect(hooks.groups().find((g) => g.id === single)?.spells).toEqual(['ferocious_bite']);
    hooks.assign('claw', grid);
    expect(hooks.groups().find((g) => g.id === line)?.spells).toEqual(['rake']);
  });

  it('persists groups per character and restores them on the next session', () => {
    const first = rig();
    const id = first.hooks.addGroup('line') as string;
    first.hooks.assign('rake', id);
    first.hooks.patchGroup(id, { orientation: 'vertical', padding: 8 });
    document.body.replaceChildren();
    const second = rig();
    expect(second.hooks.groups()).toMatchObject([
      { id, kind: 'line', spells: ['rake'], orientation: 'vertical', padding: 8 },
    ]);
    expect(Object.keys(localStorage)).toContain('woc_cooldown_manager:druid:Bob');
  });

  it('plays the spell cue on a ready edge, gated by the combat-only switch', () => {
    const { hooks, controller, snapshot, cues, world, cooldowns } = rig();
    const id = hooks.addGroup('single') as string;
    hooks.assign('rake', id);
    hooks.patchSpell('rake', { soundId: CUE, soundVolume: 0.5 });
    controller.paint(snapshot);
    expect(cues).toEqual([]);
    cooldowns.set('rake', 5);
    controller.paint(snapshot);
    cooldowns.delete('rake');
    controller.paint(snapshot);
    expect(cues).toEqual([[CUE, 0.5]]);

    hooks.patchLayout({ soundInCombatOnly: true });
    cooldowns.set('rake', 5);
    controller.paint(snapshot);
    cooldowns.delete('rake');
    controller.paint(snapshot);
    expect(cues).toHaveLength(1);
    world.player.inCombat = true;
    cooldowns.set('rake', 5);
    controller.paint(snapshot);
    cooldowns.delete('rake');
    controller.paint(snapshot);
    expect(cues).toHaveLength(2);
  });

  it('unions its hotbar glow with the Auras panel set, without allocating per frame', () => {
    const { hooks, controller, snapshot, setAuraGlow, cooldowns } = rig();
    const id = hooks.addGroup('line') as string;
    hooks.assign('rake', id);
    hooks.patchSpell('rake', { hotbarGlow: true });
    controller.paint(snapshot);
    const own = controller.readyGlowAbilityIds();
    expect([...own]).toEqual(['rake']);
    setAuraGlow(['execute']);
    const union = controller.readyGlowAbilityIds();
    expect([...union].sort()).toEqual(['execute', 'rake']);
    expect(controller.readyGlowAbilityIds()).toBe(union);
    cooldowns.set('rake', 5);
    controller.paint(snapshot);
    expect([...controller.readyGlowAbilityIds()]).toEqual(['execute']);
  });

  it('hides a group by its visibility rule and shows every group while placing', () => {
    const { hooks, controller, snapshot, world, layer } = rig();
    const always = hooks.addGroup('single') as string;
    const combat = hooks.addGroup('single') as string;
    const hidden = hooks.addGroup('single') as string;
    hooks.patchGroup(combat, { visibility: 'combat' });
    hooks.patchGroup(hidden, { visibility: 'hidden' });
    const shown = () =>
      Array.from(layer().querySelectorAll<HTMLElement>('.cdm-group'))
        .filter((g) => g.style.display !== 'none')
        .map((g) => g.dataset.group);
    controller.paint(snapshot);
    expect(shown()).toEqual([always]);
    world.player.inCombat = true;
    controller.paint(snapshot);
    expect(shown()).toEqual([always, combat]);
    hooks.setPlacement(true);
    controller.paint(snapshot);
    expect(shown()).toEqual([always, combat, hidden]);
    expect(layer().classList.contains('placement')).toBe(true);
    hooks.patchLayout({ enabled: false });
    hooks.setPlacement(false);
    controller.paint(snapshot);
    expect(layer().style.display).toBe('none');
  });

  it('restyles a group in place for appearance changes and re-cells it for layout ones', () => {
    const { hooks, layer } = rig();
    const id = hooks.addGroup('grid') as string;
    hooks.assign('rake', id);
    hooks.assign('claw', id);
    const before = layer().querySelector('.cdm-group');
    hooks.patchGroup(id, { opacity: 0.5, showTimer: false });
    const same = layer().querySelector<HTMLElement>('.cdm-group');
    expect(same).toBe(before);
    expect(same?.style.getPropertyValue('--cdm-opacity')).toBe('0.5');
    expect(same?.classList.contains('hide-timer')).toBe(true);
    hooks.patchGroup(id, { orientation: 'vertical', perLine: 1 });
    const recelled = layer().querySelector<HTMLElement>('.cdm-group');
    expect(recelled).not.toBe(before);
    const cells = Array.from(recelled?.querySelectorAll<HTMLElement>('.cdm-btn') ?? []).map(
      (b) => `${b.style.gridColumn},${b.style.gridRow}`,
    );
    expect(cells).toEqual(['1,1', '2,1']);
  });
});

describe('CooldownManagerSettingsPanel', () => {
  function panel() {
    const r = rig();
    const clicks: number[] = [];
    const root = document.createElement('div');
    document.body.appendChild(root);
    const settings = new CooldownManagerSettingsPanel({
      hooks: r.hooks,
      click: () => clicks.push(1),
    });
    settings.render(root);
    return { ...r, root, settings };
  }
  const chips = (root: HTMLElement, section: string) =>
    Array.from(
      root.querySelectorAll<HTMLElement>(
        `.cdm-spell-section[data-group="${section}"] .cdm-spell-chip`,
      ),
    );

  it('adds the three group kinds from their buttons, one card each', () => {
    const { root } = panel();
    for (const kind of ['single', 'grid', 'line']) {
      root.querySelector<HTMLButtonElement>(`.cdm-add--${kind}`)?.click();
    }
    expect(root.querySelectorAll('.cdm-group-card')).toHaveLength(3);
    // A single button has no orientation, direction or padding to choose.
    const [single, grid] = Array.from(root.querySelectorAll<HTMLElement>('.cdm-group-card'));
    expect(single.querySelectorAll('select')).toHaveLength(1);
    expect(grid.querySelectorAll('select')).toHaveLength(3);
  });

  it('lists the whole castable spellbook as Not Displayed until a spell is placed', () => {
    const { root, hooks, settings } = panel();
    const id = hooks.addGroup('line') as string;
    settings.render(root);
    expect(chips(root, '').map((chip) => chip.dataset.focusKey)).toEqual([
      'cdm-spell:rake',
      'cdm-spell:claw',
      'cdm-spell:ferocious_bite',
    ]);
    // Select a spell, then pick its group in the detail card (the keyboard path).
    chips(root, '')[1].click();
    const select = root.querySelector<HTMLSelectElement>('[data-focus-key="cdm-detail-group"]');
    expect(select).not.toBeNull();
    if (!select) return;
    select.value = id;
    select.dispatchEvent(new Event('change'));
    expect(hooks.groups()[0].spells).toEqual(['claw']);
    expect(chips(root, id).map((chip) => chip.dataset.focusKey)).toEqual(['cdm-spell:claw']);
  });

  it('moves a spell by drag and drop onto a group section', () => {
    const { root, hooks, settings } = panel();
    const id = hooks.addGroup('grid') as string;
    settings.render(root);
    const section = root.querySelector<HTMLElement>(`.cdm-spell-section[data-group="${id}"]`);
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { getData: () => 'rake' } });
    section?.dispatchEvent(drop);
    expect(hooks.groups()[0].spells).toEqual(['rake']);
  });

  it('filters every section by spell name as the player types, without a rebuild', () => {
    const { root, hooks, settings } = panel();
    hooks.assign('rake', hooks.addGroup('line'));
    settings.render(root);
    const search = root.querySelector<HTMLInputElement>('.cdm-search');
    expect(search).not.toBeNull();
    if (!search) return;
    search.value = 'CLAW';
    search.dispatchEvent(new Event('input'));
    const visible = Array.from(root.querySelectorAll<HTMLElement>('.cdm-spell-chip'))
      .filter((chip) => !chip.hidden)
      .map((chip) => chip.dataset.focusKey);
    expect(visible).toEqual(['cdm-spell:claw']);
    // The query survives a rebuild (a move never clears the search).
    settings.render(root);
    expect(root.querySelector<HTMLInputElement>('.cdm-search')?.value).toBe('CLAW');
  });
});
