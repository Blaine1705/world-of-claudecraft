import { describe, expect, it } from 'vitest';
import {
  buildPostEntryPreviewPrewarmUnits,
  PREVIEW_PREWARM_BUSY_POLL_MS,
  PREVIEW_PREWARM_HEADROOM_POLL_CAP,
  PREVIEW_PREWARM_UNIT_SPACING_MS,
  type PreviewPrewarmUnit,
  runPreviewPrewarmSchedule,
} from '../src/ui/preview_prewarm_core';

const unit = (
  family: 'char' | 'armory',
  label: string,
  run: () => void | Promise<void> = () => {},
): PreviewPrewarmUnit => ({ family, label, run });

describe('runPreviewPrewarmSchedule', () => {
  it('enqueues every unit in order and resolves done', async () => {
    const ran: string[] = [];
    const handle = runPreviewPrewarmSchedule(
      [unit('char', 'a'), unit('char', 'b'), unit('armory', 'c')],
      {
        enqueue: async (label, run) => {
          ran.push(label);
          await run();
        },
        isFamilyBusy: () => false,
        delay: async () => {},
      },
    );
    await handle.done;
    expect(ran).toEqual(['a', 'b', 'c']);
  });

  it('pauses while the owning window is open and resumes after it closes', async () => {
    const ran: string[] = [];
    const waits: number[] = [];
    let charBusyPolls = 0;
    const handle = runPreviewPrewarmSchedule([unit('char', 'a'), unit('armory', 'b')], {
      enqueue: async (label) => {
        ran.push(label);
      },
      // Busy for the first two polls of the char family, then free.
      isFamilyBusy: (family) => family === 'char' && ++charBusyPolls <= 2,
      delay: async (ms) => {
        waits.push(ms);
      },
    });
    await handle.done;
    expect(ran).toEqual(['a', 'b']);
    // Two busy polls, then the fixed inter-unit spacing after each unit.
    expect(waits).toEqual([
      PREVIEW_PREWARM_BUSY_POLL_MS,
      PREVIEW_PREWARM_BUSY_POLL_MS,
      PREVIEW_PREWARM_UNIT_SPACING_MS,
      PREVIEW_PREWARM_UNIT_SPACING_MS,
    ]);
  });

  it('waits for frame headroom but runs anyway past the starvation cap', async () => {
    const ran: string[] = [];
    let headroomPolls = 0;
    const handle = runPreviewPrewarmSchedule([unit('char', 'a')], {
      enqueue: async (label) => {
        ran.push(label);
      },
      isFamilyBusy: () => false,
      // Never regains headroom: the cap must bound the wait.
      hasHeadroom: () => {
        headroomPolls++;
        return false;
      },
      delay: async () => {},
    });
    await handle.done;
    expect(ran).toEqual(['a']);
    expect(headroomPolls).toBe(PREVIEW_PREWARM_HEADROOM_POLL_CAP + 1);
  });

  it('a failed unit reports and never halts the remaining schedule', async () => {
    const ran: string[] = [];
    const failed: string[] = [];
    const handle = runPreviewPrewarmSchedule(
      [unit('char', 'a'), unit('char', 'boom'), unit('armory', 'c')],
      {
        enqueue: async (label) => {
          if (label === 'boom') throw new Error('context lost');
          ran.push(label);
        },
        isFamilyBusy: () => false,
        delay: async () => {},
        onUnitError: (label) => failed.push(label),
      },
    );
    await handle.done;
    expect(ran).toEqual(['a', 'c']);
    expect(failed).toEqual(['boom']);
  });

  it('cancel stops issuing units, including out of a busy pause', async () => {
    const ran: string[] = [];
    let polls = 0;
    const handle = runPreviewPrewarmSchedule([unit('char', 'a'), unit('char', 'b')], {
      enqueue: async (label) => {
        // Yield one microtask so the handle exists (the schedule starts
        // synchronously at creation, before its own const is assigned).
        await Promise.resolve();
        ran.push(label);
        // Cancel mid-schedule: the in-flight unit finishes, the next never runs.
        if (label === 'a') handle.cancel();
      },
      isFamilyBusy: () => false,
      delay: async () => {
        polls++;
      },
    });
    await handle.done;
    expect(ran).toEqual(['a']);

    // Cancellation while paused on a busy window also exits promptly.
    const stuck = runPreviewPrewarmSchedule([unit('armory', 'x')], {
      enqueue: async () => {
        throw new Error('must not run');
      },
      isFamilyBusy: () => true,
      delay: async () => {
        if (++polls > 3) stuck.cancel();
      },
    });
    await stuck.done;
    expect(polls).toBeGreaterThan(3);
  });
});

describe('buildPostEntryPreviewPrewarmUnits', () => {
  it('orders shell, own skins, card poses, all-class portraits, then armory per mode', () => {
    const calls: string[] = [];
    const units = buildPostEntryPreviewPrewarmUnits<string>({
      playerClass: 'hunter',
      allClasses: ['hunter', 'mage'],
      skinCount: (unitId) => (unitId === 'player_hunter' ? 2 : 1),
      cardPoses: ['heroic'],
      armorySkinIds: ['mech_amber'],
      renderCharShell: () => {
        calls.push('shell');
      },
      prewarmCharSkin: (skin) => {
        calls.push(`skin:${skin}`);
      },
      prewarmCardPose: (pose) => {
        calls.push(`pose:${pose}`);
      },
      renderPortrait: (cls, skin, framing) => {
        calls.push(`portrait:${cls}:${skin}:${framing}`);
      },
      prewarmArmorySkin: (skinId, mode) => {
        calls.push(`armory:${skinId}:${mode}`);
      },
    });
    expect(units.map((entry) => entry.label)).toEqual([
      'preview:char-window',
      'preview:char-skin:0',
      'preview:char-skin:1',
      'preview:card-pose:0',
      'preview:portrait:hunter:0:headshot',
      'preview:portrait:hunter:0:body',
      'preview:portrait:hunter:1:headshot',
      'preview:portrait:hunter:1:body',
      'preview:portrait:mage:0:headshot',
      'preview:portrait:mage:0:body',
      'preview:armory:mech_amber:character',
      'preview:armory:mech_amber:weapon',
    ]);
    // The armory rows belong to the armory family (their pause key is the
    // store window, not the paperdoll); everything before them is 'char'.
    expect(units.slice(0, 10).every((entry) => entry.family === 'char')).toBe(true);
    expect(units.slice(10).every((entry) => entry.family === 'armory')).toBe(true);
    for (const entry of units) entry.run();
    expect(calls).toEqual([
      'shell',
      'skin:0',
      'skin:1',
      'pose:heroic',
      'portrait:hunter:0:headshot',
      'portrait:hunter:0:body',
      'portrait:hunter:1:headshot',
      'portrait:hunter:1:body',
      'portrait:mage:0:headshot',
      'portrait:mage:0:body',
      'armory:mech_amber:character',
      'armory:mech_amber:weapon',
    ]);
  });
});
