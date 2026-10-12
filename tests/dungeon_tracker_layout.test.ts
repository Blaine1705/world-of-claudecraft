// The dungeon objectives tracker's seat and stylesheet contracts: the things a
// behavior test in a Node DOM cannot see (a :not() fold, a media query, the
// entries' markup) and that nothing else ties together. Each pin names the
// defect it stands against.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HUD_FRAME_GROUPS } from '../src/ui/hud_frame_groups';
import { HUD_FRAME_SPECS } from '../src/ui/interface_unlock_core';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const hudCss = read('src/styles/hud.css');
const mobileCss = read('src/styles/hud.mobile.css');
const hud = read('src/ui/hud.ts');

/** The tracker's own ten-dash section of hud.css. */
function section(): string {
  const start = hudCss.indexOf('/* ---------- dungeon objectives tracker ---------- */');
  const end = hudCss.indexOf('/* ---------- practice DPS tracker ---------- */');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return hudCss.slice(start, end);
}

describe('dungeon tracker seat (both entries)', () => {
  it.each(['index.html', 'play.html'])(
    '%s seats it as the FIRST tracker of the right stack, a named group',
    (entry) => {
      // First, so it sits above the quest tracker: inside a dungeon it is the
      // business at hand. An entry that drops it hands the painter a null root.
      expect(read(entry)).toMatch(
        /<div id="right-tracker-stack" class="ui-outline">\s*<div id="dungeon-tracker" role="group"><\/div>\s*<div id="quest-tracker">/,
      );
    },
  );

  it('hud.ts paints that element through the shared facet, from IWorld', () => {
    expect(hud).toMatch(
      /new DungeonTrackerPainter\(\{\s*root: \(\) => \$\('#dungeon-tracker'\),\s*writers: this\.writerFacet,\s*world: \(\) => this\.sim,\s*dungeonName: dungeonDisplayName,\s*mobName: mobDisplayName,\s*\}\)/,
    );
    // And the touch strip is handed the same run as a page.
    expect(hud).toContain('dungeonRow: () => this.dungeonTracker.stripQuest(),');
  });
});

describe('dungeon tracker stylesheet', () => {
  it('leaves the stack entirely outside a run, so it never spends a gap', () => {
    // The stack is a flex column with a gap: a zero-height child would still
    // push the quest tracker down 14px for every player outside a dungeon.
    expect(section()).toMatch(/#dungeon-tracker:not\(\.is-live\)\s*\{\s*display:\s*none;/);
  });

  it('keeps the empty plate out of the frame editor`s placeholder', () => {
    // The editor force-shows a hidden frame (display !important): the plate and
    // the list must stay hidden under it, or the placeholder is an empty box.
    expect(section()).toMatch(
      /#dungeon-tracker:not\(\.is-live\) > \.dgt-plate,\s*#dungeon-tracker:not\(\.is-live\) > \.dgt-list\s*\{\s*display:\s*none;/,
    );
    expect(hudCss).toMatch(
      /body\.interface-unlocked #dungeon-tracker\.tf-unlocked,[\s\S]*?display:\s*block !important;/,
    );
  });

  it('is click-through, like every other tracker over the world', () => {
    expect(section()).toMatch(/#dungeon-tracker\s*\{[^}]*pointer-events:\s*none;/);
  });

  it('keeps the plate and its rows clear of the button rail on a short viewport', () => {
    // The plate is the one opaque box in the stack: where the rail climbs into
    // its span it must keep to the column the rail leaves free, and its rows
    // follow it in so a long boss name wraps instead of crossing the icons.
    const css = section();
    expect(css).toMatch(
      /@media \(max-height: 895px\)\s*\{\s*body:not\(\.mobile-touch\) #dungeon-tracker:not\(\.hud-frame-detached\) \.dgt-plate\s*\{\s*width:\s*calc\(100% - 80px\);/,
    );
    expect(css).toMatch(
      /body:not\(\.mobile-touch\) #dungeon-tracker:not\(\.hud-frame-detached\) \.dgt-list\s*\{\s*margin-right:\s*80px;/,
    );
  });

  it('never re-declares the plate primitive`s look', () => {
    // ui-panel-soft owns the fill, border and shadow; the section sets geometry.
    const plate = /#dungeon-tracker \.dgt-plate\s*\{([^}]*)\}/.exec(section())?.[1] ?? '';
    expect(plate).toContain('padding');
    expect(plate).not.toMatch(/background|border|box-shadow|outline/);
  });

  it('spells no raw color', () => {
    const css = section().replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\(/);
  });

  it('both glows stand down under reduced motion, by media query and by the setting', () => {
    const css = section();
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*#dungeon-tracker \.dgt-row\.is-flash,\s*#dungeon-tracker \.dgt-plate\.is-complete-flash::after\s*\{\s*animation:\s*none;/,
    );
    expect(css).toMatch(
      /body\.reduce-motion #dungeon-tracker \.dgt-row\.is-flash,\s*body\.reduce-motion #dungeon-tracker \.dgt-plate\.is-complete-flash::after\s*\{\s*animation:\s*none;/,
    );
  });

  it('the done state does not rest on color alone under forced colors', () => {
    expect(section()).toMatch(
      /@media \(forced-colors: active\)\s*\{\s*#dungeon-tracker \.dgt-row\.is-done\s*\{\s*color:\s*Highlight;/,
    );
  });

  it('anchors no :has() of its own', () => {
    expect(section()).not.toContain(':has(');
  });

  it('is hidden on touch, where the quest strip carries the run instead', () => {
    // Its seat on a landscape phone sits on the action ring.
    expect(mobileCss).toMatch(/body\.mobile-touch #dungeon-tracker\s*\{\s*display:\s*none;\s*\}/);
  });
});

describe('dungeon tracker as a movable frame', () => {
  it('has a frame row and rides the combined tracker group, leading it', () => {
    const spec = HUD_FRAME_SPECS.find((row) => row.id === 'dungeonTracker');
    expect(spec).toMatchObject({
      elementId: 'dungeon-tracker',
      storageKey: 'woc_hud_frame_dungeon_tracker',
      labelKey: 'hudChrome.interfaceUnlock.frameNames.dungeonTracker',
      detachToUiRoot: true,
    });
    const group = HUD_FRAME_GROUPS.find((row) => row.id === 'trackerGroup');
    expect(group?.members[0]).toBe('dungeonTracker');
  });

  it('wears every piece of frame chrome the rift tracker wears', () => {
    // The chrome is seven hand-kept selector lists in hud.css. A tracker left
    // out of one of them unlocks without a cursor, a width or a move button.
    const chrome = (id: string): string[] => {
      const line = new RegExp(
        `^\\s*((?:body\\.interface-unlocked )?)#${id}((?:\\.[\\w-]+)+| \\.tf-move-btn(?::focus-visible)?),?$`,
        'gm',
      );
      return [...hudCss.matchAll(line)].map((m) => `${m[1]}${m[2]}`).sort();
    };
    const rift = chrome('rift-tracker');
    expect(rift.length).toBeGreaterThanOrEqual(7);
    expect(chrome('dungeon-tracker')).toEqual(rift);
  });
});
