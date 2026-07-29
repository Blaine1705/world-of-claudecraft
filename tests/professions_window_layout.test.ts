// @vitest-environment jsdom
//
// DOM structural guard over the professions window's rebuilt layout surface:
// the hero band (identity card + ring stage), the two-line craft-row anatomy
// (the text-squish fix: name and value on one line, role/ceiling chips on
// their own), the attunement-gated switch-cost line, the simplified-mode call
// to action's key selection, the gathering rows, and the two-column craft
// list CSS. Drives the real ProfessionsWindow over jsdom with stub deps (the
// professions_window_focus.test.ts harness), plus source-scan pins where the
// live path cannot reach an arm today.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requiredAmendsProgress } from '../src/sim/professions/archetype';
import { ProfessionsWindow, type ProfessionsWindowDeps } from '../src/ui/professions_window';

// This file runs under jsdom, where import.meta.url is an http URL that
// readFileSync rejects; resolve the source-scan reads from __dirname instead.
const read = (rel: string): string => readFileSync(join(__dirname, rel), 'utf8');

// jsdom ships no 2D canvas, so the procedural icon compositor cannot run here;
// the painter only ever uses the returned string as an <img src>.
vi.mock('../src/ui/icons', () => ({
  iconDataUrl: () => 'data:,',
  // Echo the requested id into the URL so painter tests catch a wrong or
  // hardcoded profession/gathering resolver argument.
  professionIconUrl: (id: string) => `/test-professions/${id}.webp`,
}));

interface WorldState {
  identity: {
    version: 1;
    synced: boolean;
    craftSkills: Record<string, number>;
    activeArchetype: string | null;
    pairedMajor: string | null;
    hobbyCraft: string | null;
    attunedPairs: string[];
    switchCount: number;
    amendsProgress: number;
    amendsRequired: number;
  };
  gathering: { professionId: string; skill: number; maxSkill: number }[];
  toolEffects?: {
    professionId: string;
    effectId: string;
    charges: number;
    maxCharges: number;
    confirmMode: 'always' | 'prompt';
  }[];
  // The viewer's bags (IWorld `inventory`), the slot/recharge affordance
  // input. Defaults to empty: no charms, no buttons, so the existing cases
  // keep asserting the button-free surface.
  inventory?: { itemId: string; count: number }[];
}

// An attuned, tiered identity so the window opens in full mode (hero band,
// ring, ten craft rows, perks, gathering).
function baseState(): WorldState {
  return {
    identity: {
      version: 1,
      synced: true,
      craftSkills: {
        engineering: 0,
        alchemy: 0,
        cooking: 30,
        leatherworking: 0,
        tailoring: 0,
        inscription: 0,
        enchanting: 0,
        jewelcrafting: 60,
        weaponcrafting: 25,
        armorcrafting: 49,
      },
      activeArchetype: 'armorcrafting',
      pairedMajor: 'weaponcrafting',
      hobbyCraft: 'leatherworking',
      attunedPairs: ['weaponcrafting+armorcrafting'],
      switchCount: 2,
      amendsProgress: 1,
      amendsRequired: 11,
    },
    gathering: [{ professionId: 'mining', skill: 30, maxSkill: 300 }],
  };
}

/** A full-mode identity that has NEVER attuned: no archetype and an empty
 *  attunedPairs, but crafts past the first tier so the full layout renders. */
function neverAttunedFullState(): WorldState {
  const state = baseState();
  state.identity.activeArchetype = null;
  state.identity.pairedMajor = null;
  state.identity.hobbyCraft = null;
  state.identity.attunedPairs = [];
  return state;
}

function makeWindow(
  state: WorldState,
  depsOver: Partial<ProfessionsWindowDeps> = {},
): { w: ProfessionsWindow; el: HTMLElement } {
  const el = document.createElement('div');
  el.id = 'professions-window';
  document.body.appendChild(el);
  const deps: ProfessionsWindowDeps = {
    root: () => el,
    world: () =>
      ({
        craftingIdentity: state.identity,
        professionsState: { skills: state.gathering },
        gatheringProficiency: Object.fromEntries(
          state.gathering.map((row) => [row.professionId, row.skill]),
        ),
        toolEffectSlots: state.toolEffects ?? [],
        inventory: state.inventory ?? [],
      }) as never,
    closeOthers: () => {},
    hideTooltip: () => {},
    consumePeek: () => false,
    captureFocus: () => null,
    restoreFocus: () => {},
    itemIcon: () => '',
    moneyHtml: () => '',
    itemTooltip: () => '',
    attachTooltip: () => {},
    ...depsOver,
  };
  const w = new ProfessionsWindow(deps);
  w.open();
  return { w, el };
}

function mustQuery(root: ParentNode, selector: string): Element {
  const found = root.querySelector(selector);
  if (!found) throw new Error(`missing ${selector}`);
  return found;
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('ProfessionsWindow: hero band structure', () => {
  it('pairs the identity card with the ring stage inside .prof-hero', () => {
    const { el } = makeWindow(baseState());
    const hero = mustQuery(el, '.prof-hero');
    // Exact child pin: the hero band holds the identity section and the ring
    // stage, nothing else, in that order.
    expect(
      [...hero.children].map((child) => `${child.tagName.toLowerCase()}.${child.className}`),
    ).toEqual(['section.prof-identity', 'div.prof-ring-stage']);
  });

  it('keeps the aria surface on the ring itself, never the stage wrapper', () => {
    const { el } = makeWindow(baseState());
    const stage = mustQuery(el, '.prof-hero .prof-ring-stage');
    // The stage is decorative chrome around the wheel: it must never absorb
    // or replace the ring's accessibility surface.
    expect(stage.hasAttribute('role')).toBe(false);
    expect(stage.hasAttribute('aria-label')).toBe(false);
    const ring = mustQuery(stage, '.prof-ring');
    expect(ring.getAttribute('role')).toBe('img');
    expect(ring.getAttribute('aria-label') ?? '').not.toBe('');
    // Ring anatomy: one hidden SVG drawing, then exactly ten icon nodes.
    const children = [...ring.children];
    expect(children).toHaveLength(11);
    expect(children[0].getAttribute('class')).toBe('prof-ring-svg');
    expect(children[0].getAttribute('aria-hidden')).toBe('true');
    for (const node of children.slice(1)) {
      expect(node.classList.contains('prof-ring-node')).toBe(true);
    }
  });
});

describe('ProfessionsWindow: craft row anatomy', () => {
  it('keeps the name line to name plus skill value, chips on their own line', () => {
    // The text-squish fix: a long localized craft name and wide chips must
    // never fight for one baseline, so the head line carries ONLY the name
    // and the right-aligned value, and the role/ceiling chips move to a
    // second line. Pinned via exact child class lists on all ten rows.
    const { el } = makeWindow(baseState());
    const rows = [...el.querySelectorAll('.prof-crafts .prof-craft-row')];
    expect(rows).toHaveLength(10);
    for (const row of rows) {
      const head = mustQuery(row, '.prof-craft-head');
      expect([...head.children].map((child) => child.className)).toEqual([
        'prof-craft-name',
        'prof-skill-value',
      ]);
      const chips = mustQuery(row, '.prof-craft-chips');
      expect([...chips.children].map((child) => child.className)).toEqual([
        'prof-role-badge',
        'prof-ceiling',
      ]);
    }
  });
});

describe('ProfessionsWindow: switch-cost visibility', () => {
  it('renders the switch-cost line with the next cost for an attuned identity', () => {
    const state = baseState();
    const { el } = makeWindow(state);
    const cost = mustQuery(el, '.prof-switch-cost');
    // The displayed cost is the client-computed requiredAmendsProgress of the
    // CURRENT switch count (the next switch), not the stored amendsRequired.
    expect(cost.textContent).toContain(String(requiredAmendsProgress(state.identity.switchCount)));
  });

  it('renders NO switch-cost line for a never-attuned full-mode identity', () => {
    // A player who has never attuned has no archetype to switch from, so the
    // line is noise even once the full layout (tiered crafts) is earned.
    const { el } = makeWindow(neverAttunedFullState());
    expect(el.querySelector('.prof-hero')).not.toBeNull();
    expect(el.querySelector('.prof-crafts')).not.toBeNull();
    expect(el.querySelector('.prof-switch-cost')).toBeNull();
  });

  it('renders NO switch-cost line in simplified mode', () => {
    const state = baseState();
    state.identity.synced = false;
    state.identity.craftSkills = {};
    state.gathering = [];
    const { el } = makeWindow(state);
    expect(el.querySelector('.prof-cta')).not.toBeNull();
    expect(el.querySelector('.prof-switch-cost')).toBeNull();
  });
});

describe('ProfessionsWindow: simplified call to action', () => {
  it('renders the plain raise copy when the next milestone is a tier', () => {
    const state = neverAttunedFullState();
    state.identity.craftSkills = { cooking: 10 };
    state.gathering = [];
    const { el } = makeWindow(state);
    const cta = mustQuery(el, '.prof-cta-line').textContent ?? '';
    // The ctaRaise key: interpolated points to the next tier boundary (15
    // from skill 10), with the plain next-tier tail, never the specialized
    // material-cost copy.
    expect(cta).toContain('15 more points to the next tier.');
    expect(cta).not.toContain('Specialized');
  });

  it('selects the specialized copy key on the specialized next-unlock arm', () => {
    // The live specialized arm is unreachable today: simplified mode requires
    // every craft below the first tier (skill under TIER_SKILL_STEP, 25), so
    // the trending craft's next tier boundary is at most 50, while the
    // uniform specialization threshold is 75; craftNextUnlock only reports
    // 'specialized' once the threshold falls inside the next boundary, which
    // first happens at skill 50 and above, already full mode. So the key
    // mapping is pinned at the source: the painter must select the
    // specialized copy exactly when nextUnlock.kind is 'specialized' and the
    // plain raise copy otherwise.
    const painter = read('../src/ui/professions_window.ts');
    expect(painter).toContain("'hudChrome.professions.ctaRaiseSpecialized'");
    expect(painter).toContain("'hudChrome.professions.ctaRaise'");
    const flat = painter.replace(/\s+/g, ' ');
    expect(flat).toContain(
      "simplified.nextUnlock.kind === 'specialized' " +
        "? 'hudChrome.professions.ctaRaiseSpecialized' " +
        ": 'hudChrome.professions.ctaRaise'",
    );
  });
});

describe('ProfessionsWindow: gathering rows', () => {
  it('renders one row per known gathering id and nothing for unknown ids', () => {
    const state = baseState();
    state.gathering = [
      { professionId: 'mining', skill: 30, maxSkill: 300 },
      { professionId: 'logging', skill: 12, maxSkill: 300 },
      { professionId: 'herbalism', skill: 5, maxSkill: 300 },
      { professionId: 'fishing', skill: 1, maxSkill: 300 },
      // Skinning is deliberately NOT a gathering profession (gathering.ts),
      // so an id with no display-name key renders no row BY DESIGN.
      { professionId: 'skinning', skill: 10, maxSkill: 300 },
    ];
    const { el } = makeWindow(state);
    const section = mustQuery(el, '.prof-gathering');
    expect(section.querySelectorAll('.prof-gather-row')).toHaveLength(4);
    expect(
      [...section.querySelectorAll<HTMLImageElement>('.prof-gather-row .prof-craft-icon')].map(
        (image) => image.getAttribute('src'),
      ),
    ).toEqual([
      '/test-professions/gather_mining.webp',
      '/test-professions/gather_logging.webp',
      '/test-professions/gather_herbalism.webp',
      '/test-professions/gather_fishing.webp',
    ]);
  });

  it('omits the gathering section entirely when every injected id is unknown', () => {
    const state = baseState();
    state.gathering = [{ professionId: 'skinning', skill: 10, maxSkill: 300 }];
    const { el } = makeWindow(state);
    expect(el.querySelectorAll('.prof-gather-row')).toHaveLength(0);
    expect(el.querySelector('.prof-gathering')).toBeNull();
  });
});

describe('ProfessionsWindow: the slotted tool effect row', () => {
  const slotted = (over: Record<string, unknown> = {}) => {
    const state = baseState();
    state.toolEffects = [
      {
        professionId: 'mining',
        effectId: 'gatherers_cache',
        charges: 12,
        maxCharges: 30,
        confirmMode: 'always',
        ...over,
      } as WorldState['toolEffects'] extends (infer R)[] | undefined ? R : never,
    ];
    return state;
  };

  it('paints NO effect line for a player with no slot, which is every player today', () => {
    // The default surface. An always-present "no effect" line would be three
    // permanent rows of absence in a window that is otherwise all progress.
    const { el } = makeWindow(baseState());
    expect(el.querySelectorAll('.prof-effect')).toHaveLength(0);
  });

  it('paints one line under the slotted profession only, never under the others', () => {
    const { el } = makeWindow(slotted());
    const lines = el.querySelectorAll('.prof-effect');
    expect(lines).toHaveLength(1);
    // It must sit INSIDE the mining row, not loose in the section: a line under
    // the wrong bar would tell the player the wrong tool is affected.
    const rows = [...el.querySelectorAll('.prof-gather-row')];
    const owning = rows.filter((r) => r.querySelector('.prof-effect'));
    expect(owning).toHaveLength(1);
    expect(owning[0].querySelector('.prof-craft-name')?.textContent).toBe('Mining');
    expect(lines[0].querySelector('.prof-effect-name')?.textContent).toBe("Gatherer's Cache");
    expect(lines[0].querySelector('.prof-effect-charges')?.textContent).toBe('12 of 30 charges');
  });

  it('says a spent slot is spent in words rather than showing 0 of 30', () => {
    // A bare zero reads like a broken tool. The tool is fine; only the effect
    // is spent, and it recharges.
    const { el } = makeWindow(slotted({ charges: 0 }));
    const line = el.querySelector('.prof-effect');
    expect(line?.classList.contains('prof-effect-spent')).toBe(true);
    expect(line?.querySelector('.prof-effect-charges')?.textContent).toBe(
      'Spent, needs recharging',
    );
    expect(el.innerHTML).not.toContain('0 of 30 charges');
  });

  it('paints nothing for an effect id the name table does not know', () => {
    // A persisted slot can name an effect a later content change retired; the
    // row must render nothing rather than print a raw id at a player.
    const { el } = makeWindow(slotted({ effectId: 'retired_effect' }));
    expect(el.querySelectorAll('.prof-effect')).toHaveLength(0);
    expect(el.innerHTML).not.toContain('retired_effect');
  });

  it('a held charm paints a slot button whose click sends the command, exactly once', () => {
    const state = baseState();
    state.inventory = [
      { itemId: 'copper_mining_pick', count: 1 },
      { itemId: 'artisans_eye', count: 1 },
    ];
    const sent: [string, string][] = [];
    const { el } = makeWindow(state, {
      world: () =>
        ({
          craftingIdentity: state.identity,
          professionsState: { skills: state.gathering },
          toolEffectSlots: [],
          inventory: state.inventory,
          slotToolEffect: (professionId: string, effectId: string) => {
            sent.push([professionId, effectId]);
          },
        }) as never,
    });
    const button = el.querySelector<HTMLElement>('[data-slot-effect]');
    expect(button?.getAttribute('data-slot-profession')).toBe('mining');
    expect(button?.getAttribute('data-slot-effect')).toBe('artisans_eye');
    expect(button?.textContent).toBe("Slot Artisan's Eye");
    button?.click();
    expect(sent).toEqual([['mining', 'artisans_eye']]);
  });

  it('a rechargeable slot paints the recharge button; a full or tool-less one does not', () => {
    const rechargeState = slotted({ charges: 3, maxCharges: 20 });
    rechargeState.inventory = [{ itemId: 'copper_mining_pick', count: 1 }];
    const sent: string[] = [];
    const { el } = makeWindow(rechargeState, {
      world: () =>
        ({
          craftingIdentity: rechargeState.identity,
          professionsState: { skills: rechargeState.gathering },
          toolEffectSlots: rechargeState.toolEffects,
          inventory: rechargeState.inventory,
          rechargeToolEffect: (professionId: string) => {
            sent.push(professionId);
          },
        }) as never,
    });
    const button = el.querySelector<HTMLElement>('[data-recharge-profession]');
    expect(button?.textContent).toBe('Recharge');
    button?.click();
    expect(sent).toEqual(['mining']);
    // Full slot at the re-derived max: no button.
    const fullState = slotted({ charges: 20, maxCharges: 20 });
    fullState.inventory = [{ itemId: 'copper_mining_pick', count: 1 }];
    const { el: fullEl } = makeWindow(fullState);
    expect(fullEl.querySelector('[data-recharge-profession]')).toBeNull();
    // Tool gone: the resolver refuses, so the affordance stays off.
    const toollessState = slotted({ charges: 3, maxCharges: 20 });
    const { el: toollessEl } = makeWindow(toollessState);
    expect(toollessEl.querySelector('[data-recharge-profession]')).toBeNull();
  });
});

describe('professions window: two-column craft list CSS', () => {
  it('declares .prof-list as a two-column grid in components.css', () => {
    const css = read('../src/styles/components.css');
    const start = css.indexOf('.prof-list {');
    expect(start).toBeGreaterThanOrEqual(0);
    const rule = css.slice(start, css.indexOf('}', start));
    expect(rule).toContain('display: grid');
    expect(rule).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
  });

  it('collapses .prof-list to one column under the mobile-touch override', () => {
    const css = read('../src/styles/hud.mobile.css');
    const selector = 'body.mobile-touch #professions-window .prof-list {';
    const start = css.indexOf(selector);
    expect(start).toBeGreaterThanOrEqual(0);
    const rule = css.slice(start, css.indexOf('}', start));
    expect(rule).toContain('grid-template-columns: minmax(0, 1fr);');
  });
});
