// Laverock's own body (public/models/creatures/temple_laverock.glb, built by the
// Blender builder adapted from the Velkhar kit): every clip the game asks for
// ships in the file, and the manifest row maps the guide's gestures (the
// overhead emotes his lines set) and his song (the cantor_last_verse channel)
// onto them.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import {
  CANTOR_GUIDE,
  CANTOR_LAST_VERSE_CAST,
  CANTOR_NPC_ID,
} from '../src/sim/content/drowned_temple_cantor';
import { GUIDE_TALK_GESTURE } from '../src/sim/dungeon_guide/speech';

function clipsOf(path: string): string[] {
  const buf = readFileSync(path);
  const len = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + len).toString('utf8')) as {
    animations?: { name: string }[];
  };
  return (json.animations ?? []).map((a) => a.name);
}

describe('Laverock: his own model', () => {
  const key = visualKeyFor({ kind: 'npc', templateId: CANTOR_NPC_ID } as never);
  const v = VISUALS[key];

  it('ships the six clips he plays', () => {
    expect(key).toBe('npc_laverock');
    expect(v.url).toBe('models/creatures/temple_laverock.glb');
    expect(clipsOf('public/models/creatures/temple_laverock.glb').sort()).toEqual(
      ['Idle', 'Kneel', 'Sing', 'Startle', 'Talk', 'Walk'].sort(),
    );
  });

  it('maps every gesture a line can set, and the song, to a clip in the file', () => {
    const shipped = new Set(clipsOf('public/models/creatures/temple_laverock.glb'));
    const gestures = new Set<string>([GUIDE_TALK_GESTURE]);
    for (const line of CANTOR_GUIDE.lines) if (line.gesture) gestures.add(line.gesture);
    for (const g of gestures) {
      const spec = v.clips.emote?.[g as keyof NonNullable<typeof v.clips.emote>];
      expect(spec, g).toBeDefined();
      for (const c of spec?.clips ?? []) expect(shipped.has(c), `${g} -> ${c}`).toBe(true);
    }
    expect(v.clips.castByAbility?.[CANTOR_LAST_VERSE_CAST]).toBe('Sing');
    for (const c of [v.clips.idle, v.clips.walk, v.clips.run, v.clips.death, ...v.clips.attack]) {
      expect(shipped.has(c), c).toBe(true);
    }
  });
});
