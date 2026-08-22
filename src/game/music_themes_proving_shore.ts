// The Proving Shore candidate themes. The tutorial island is the first place
// a brand-new player ever stands, so its cue has to carry the whole game's
// promise in one loop: dawn over a calm starter sea, a safe camp, and an
// adventure waiting on the far shore. All three candidates state the same
// five-note leitmotif, "the Proving call" (scale degrees 1, 5, 6, 5, 3: a
// rising fifth for the adventure ahead, a lift to the sixth for hope, a
// settle on the third for safety), so the island keeps one musical identity
// whichever render ships; they differ in form, tempo, and temperament.
//
// Registered in buildMusicThemes() (src/game/music.ts) as:
//   proving_shore    "First Light at Dawnrest" (the wired zone cue)
//   proving_shore_b  "The Gauntlet at Sunrise" (alternate candidate)
//   proving_shore_c  "Across the Morning Water" (alternate candidate)
//
// This is a sibling module rather than more music.ts: that file is a monolith
// ratchet target (tests/monolith_budget.test.ts), so new compositions land
// beside it and register through one import.

import type { NoteEvent, Theme } from './music';

type Inst = NoteEvent['inst'];

// ---------------------------------------------------------------------------
// Local composition helpers (the same idioms music.ts uses privately).
// ---------------------------------------------------------------------------

function pushNote(
  out: NoteEvent[],
  beat: number,
  midi: number,
  dur: number,
  vel: number,
  inst: Inst,
): void {
  out.push({ beat, midi, dur, vel, inst });
}

// melody phrases written as [beatOffset, midi, durBeats]
type Phrase = [number, number, number][];

function pushPhrase(
  out: NoteEvent[],
  startBeat: number,
  phrase: Phrase,
  vel: number,
  inst: Inst,
): void {
  for (const [b, m, d] of phrase) pushNote(out, startBeat + b, m, d, vel, inst);
}

// explicit chord voicing: absolute midi pitches sounded together
function pushVoicing(
  out: NoteEvent[],
  beat: number,
  midis: number[],
  dur: number,
  vel: number,
  inst: Inst,
): void {
  for (const m of midis) pushNote(out, beat, m, dur, vel, inst);
}

function pushDrumHits(
  out: NoteEvent[],
  startBeat: number,
  offsets: number[],
  inst: Inst,
  vel: number,
  midi = 42,
): void {
  for (const [i, b] of offsets.entries()) {
    pushNote(out, startBeat + b, midi, 0.22, vel * (i % 2 === 0 ? 1 : 0.78), inst);
  }
}

// ---------------------------------------------------------------------------
// Candidate A: the wired zone cue.
// ---------------------------------------------------------------------------

/** The Proving Shore: "First Light at Dawnrest". D major, 76 bpm, 28 bars,
 *  A B A' coda. The island at first light: harp plays the tide breathing
 *  against the pier pilings, a flute states the Proving call over Dawnrest
 *  Camp waking, and the ferry bell (one toll, the island's only clock) marks
 *  each turn of the form. The middle eight hands the call to a horn looking
 *  across the strait toward the vale (the promise every graduate sails to,
 *  in the same D major Eastbrook's town theme lives in, so the crossing home
 *  lands as a resolution), then the reprise adds an oboe answering the flute
 *  and gull glints of tinyBell. The coda thins to piano light on the water
 *  and holds the dominant so the loop resolves home onto its own first bar. */
export function composeProvingShoreDawnrest(): Theme {
  const ev: NoteEvent[] = [];
  type BarSpec = { root: number; tide: number[]; pad: number[] };
  // tide: the harp's rolling eighth figure, out with the wave and back
  const D: BarSpec = { root: 38, tide: [50, 57, 62, 66, 69, 66, 62, 57], pad: [62, 66, 69] };
  const G: BarSpec = { root: 43, tide: [55, 62, 67, 71, 74, 71, 67, 62], pad: [59, 62, 67] };
  const Bm: BarSpec = { root: 35, tide: [47, 54, 59, 62, 66, 62, 59, 54], pad: [59, 62, 66] };
  const A: BarSpec = { root: 33, tide: [45, 52, 57, 61, 64, 61, 57, 52], pad: [57, 61, 64] };
  const Em: BarSpec = { root: 40, tide: [52, 59, 64, 67, 71, 67, 64, 59], pad: [59, 64, 67] };
  const Asus: BarSpec = { root: 33, tide: [45, 52, 57, 62, 64, 62, 57, 52], pad: [57, 62, 64] };
  const A8: BarSpec[] = [D, G, Bm, A, D, G, Em, A];
  const B8: BarSpec[] = [Bm, G, D, A, Bm, G, Em, A];
  const coda: BarSpec[] = [G, Em, A, Asus];
  const bars: BarSpec[] = [...A8, ...B8, ...A8, ...coda];

  bars.forEach((c, bar) => {
    const b0 = bar * 4;
    const inB = bar >= 8 && bar < 16;
    const inA2 = bar >= 16 && bar < 24;
    const inCoda = bar >= 24;
    // dawn pad, breathing every two bars
    if (bar % 2 === 0) pushVoicing(ev, b0, c.pad, 8.2, 0.12, 'pad');
    // strings thicken under the horn's promise, then a low hush in the coda
    if (inB) pushVoicing(ev, b0, [c.pad[0] - 12, c.pad[2] - 12], 4.05, 0.1, 'strings');
    if (inCoda) pushNote(ev, b0, c.pad[0] - 12, 4.05, 0.08, 'strings');
    // bass: the tide pulling at the pilings, easing off as the light lands
    pushNote(ev, b0, c.root, 2.2, inCoda ? 0.22 : 0.28, 'bass');
    if (bar % 2 === 1 && !inCoda) pushNote(ev, b0 + 2.5, c.root + 7, 1.2, 0.15, 'bass');
    // harp tide: each wave crests mid-bar and falls back
    for (const [i, m] of c.tide.entries()) {
      const swell = i <= 4 ? i : 8 - i;
      pushNote(ev, b0 + i * 0.5, m, 0.55, (0.085 + swell * 0.018) * (inB ? 0.8 : 1), 'harp');
    }
    // the camp stirring: a soft heartbeat only under the horn
    if (inB) {
      pushDrumHits(ev, b0, [0, 2], 'frameDrum', 0.09, 44);
      if (bar === 15) pushNote(ev, b0 + 3.25, 38, 0.8, 0.1, 'warDrum');
    }
    // gulls over the reprise
    if (inA2 && bar % 4 === 1) pushNote(ev, b0 + 2.25, bar < 20 ? 86 : 83, 0.9, 0.05, 'tinyBell');
  });

  // the ferry bell: one toll at each turn of the form, the island's clock
  for (const beat of [0, 32, 64, 96]) pushNote(ev, beat, 62, 3.5, 0.12, 'bell');

  // the Proving call, stated by the flute as the camp wakes
  const call: Phrase = [
    [0, 62, 2],
    [2, 69, 2],
    [4, 71, 2],
    [6, 67, 1],
    [7, 66, 1],
    [8, 66, 2],
    [10, 62, 1],
    [11, 64, 1],
    [12, 64, 2],
    [14, 61, 2],
    [16, 66, 2],
    [18, 69, 1],
    [19, 74, 1],
    [20, 74, 2],
    [22, 71, 1],
    [23, 67, 1],
    [24, 67, 1.5],
    [25.5, 66, 0.5],
    [26, 64, 2],
    [28, 64, 2],
    [30, 61, 1],
    [31, 62, 1],
  ];
  pushPhrase(ev, 0, call, 0.2, 'flute');
  // the promise: a horn looking across the strait, rising to its C# climax
  const promise: Phrase = [
    [0, 59, 2],
    [2, 62, 2],
    [4, 67, 3],
    [7, 66, 1],
    [8, 66, 2],
    [10, 69, 2],
    [12, 73, 3],
    [15, 71, 1],
    [16, 74, 2],
    [18, 71, 2],
    [20, 67, 2],
    [22, 64, 2],
    [24, 64, 1.5],
    [25.5, 62, 0.5],
    [26, 59, 2],
    [28, 61, 2],
    [30, 64, 2],
  ];
  pushPhrase(ev, 32, promise, 0.19, 'horn');
  // reprise: the flute again, a shade brighter, with an oboe answering
  pushPhrase(ev, 64, call, 0.22, 'flute');
  pushPhrase(ev, 64, call, 0.1, 'harp');
  const answers: Phrase = [
    [4, 62, 2],
    [6, 59, 2],
    [12, 57, 4],
    [20, 62, 2],
    [22, 64, 2],
  ];
  pushPhrase(ev, 64, answers, 0.14, 'oboe');
  // coda: first light on the water; the held E asks the loop to resolve home
  const settle: Phrase = [
    [0, 71, 3],
    [3, 69, 1],
    [4, 67, 2],
    [6, 64, 2],
    [8, 64, 2],
    [10, 61, 2],
    [12, 64, 4],
  ];
  pushPhrase(ev, 96, settle, 0.18, 'flute');
  const under: Phrase = [
    [0, 62, 4],
    [4, 59, 4],
    [8, 57, 4],
    [12, 57, 3.5],
  ];
  pushPhrase(ev, 96, under, 0.12, 'oboe');
  const droplets: Phrase = [
    [1.5, 78, 0.8],
    [5.5, 76, 0.8],
    [9.5, 73, 0.8],
    [13.5, 74, 1],
  ];
  pushPhrase(ev, 96, droplets, 0.08, 'piano');

  ev.sort((a, b) => a.beat - b.beat);
  return { bpm: 76, bars: 28, events: ev };
}

// ---------------------------------------------------------------------------
// Candidate B.
// ---------------------------------------------------------------------------

/** The Proving Shore, alternate: "The Gauntlet at Sunrise". G major, 100 bpm,
 *  32 bars, intro A B A' turn. The island as a morning drill yard: a bugle
 *  reveille run-up wakes the camp, then lute strum and an oom-pah bass march
 *  the Proving call around the Gauntlet behind a woodblock cadence. The
 *  middle eight drops to E minor for the drillmaster's reed tune with brass
 *  stab accents (the effigy strikes), the reprise adds shakers and a slow
 *  horn countermelody (the wardens walking the wall), and a timpani roll
 *  turns the form: the last bar hangs the melody on G over a D suspension so
 *  the loop resolves onto its own downbeat, ready to run the course again. */
export function composeProvingShoreGauntlet(): Theme {
  const ev: NoteEvent[] = [];
  type BarSpec = { root: number; strum: number[] };
  const G: BarSpec = { root: 43, strum: [55, 59, 62] };
  const C: BarSpec = { root: 36, strum: [55, 60, 64] };
  const D: BarSpec = { root: 38, strum: [57, 62, 66] };
  const Em: BarSpec = { root: 40, strum: [55, 59, 64] };
  const Am: BarSpec = { root: 33, strum: [57, 60, 64] };
  const Dsus: BarSpec = { root: 38, strum: [57, 62, 67] };
  const bars: BarSpec[] = [
    ...[G, G, C, D],
    ...[G, C, G, D, G, Em, C, D],
    ...[Em, C, G, D, Em, C, Am, D],
    ...[G, C, G, D, C, G, Am, D],
    ...[C, G, D, Dsus],
  ];

  bars.forEach((c, bar) => {
    const b0 = bar * 4;
    const inIntro = bar < 4;
    const inB = bar >= 12 && bar < 20;
    const inA2 = bar >= 20 && bar < 28;
    // lute strum on the offbeats; the intro builds it from a whisper
    const strumVel = inIntro ? 0.07 + bar * 0.015 : 0.11;
    pushVoicing(ev, b0 + 0.5, c.strum, 0.4, strumVel, 'lute');
    pushNote(ev, b0 + 1.5, c.strum[1], 0.4, strumVel * 0.65, 'lute');
    pushVoicing(ev, b0 + 2.5, c.strum, 0.4, strumVel * 0.9, 'lute');
    pushNote(ev, b0 + 3.5, c.strum[2], 0.4, strumVel * 0.65, 'lute');
    // oom-pah bass: left boot, right boot
    pushNote(ev, b0, c.root, 0.9, inIntro ? 0.18 : 0.24, 'bass');
    pushNote(ev, b0 + 1, c.root + 7, 0.6, 0.13, 'bass');
    pushNote(ev, b0 + 2, c.root, 0.9, 0.2, 'bass');
    pushNote(ev, b0 + 3, c.root + 7, 0.6, 0.13, 'bass');
    // the drill cadence: frame drum march with a woodblock flourish
    if (bar >= 2) pushDrumHits(ev, b0, [0, 2], 'frameDrum', 0.1, 44);
    if (bar % 2 === 1 && !inIntro) pushDrumHits(ev, b0, [2.75, 3.5], 'woodBlock', 0.05, 70);
    if (inA2) pushDrumHits(ev, b0, [0.5, 1.5, 2.5, 3.5], 'shaker', 0.04, 46);
    // dulcimer glints answering the strum
    if (bar % 2 === 1 && !inIntro) {
      pushNote(ev, b0 + 1.25, c.strum[2] + 12, 0.3, 0.09, 'dulcimer');
      pushNote(ev, b0 + 3.25, c.strum[1] + 12, 0.3, 0.07, 'dulcimer');
    }
    // war drum under the drillmaster's eight
    if (inB && bar % 2 === 0) pushNote(ev, b0, 38, 0.8, 0.1, 'warDrum');
  });

  // cymbal swells turn the big corners: into the march, into the next lap
  pushNote(ev, 12, 42, 4, 0.1, 'cymSwell');
  pushNote(ev, 124, 42, 4, 0.11, 'cymSwell');
  // the bugle reveille: a rising D arpeggio run-up out of the intro
  pushPhrase(
    ev,
    14,
    [
      [0, 62, 0.5],
      [0.5, 66, 0.5],
      [1, 69, 0.5],
      [1.5, 74, 0.5],
    ],
    0.16,
    'pipe',
  );

  // the Proving call as a marching tune on the pipe
  const march: Phrase = [
    [0, 67, 1],
    [1, 67, 0.5],
    [1.5, 69, 0.5],
    [2, 74, 2],
    [4, 76, 1.5],
    [5.5, 74, 0.5],
    [6, 72, 1],
    [7, 69, 1],
    [8, 71, 1.5],
    [9.5, 67, 0.5],
    [10, 71, 1],
    [11, 74, 1],
    [12, 74, 1],
    [13, 72, 0.5],
    [13.5, 71, 0.5],
    [14, 69, 2],
    [16, 67, 1.5],
    [17.5, 69, 0.5],
    [18, 74, 1],
    [19, 76, 1],
    [20, 76, 2],
    [22, 74, 1],
    [23, 71, 1],
    [24, 72, 1.5],
    [25.5, 71, 0.5],
    [26, 69, 1],
    [27, 67, 1],
    [28, 66, 2],
    [30, 69, 2],
  ];
  pushPhrase(ev, 16, march, 0.17, 'pipe');
  // the reed walks the squad back in under the pipe's held notes
  pushPhrase(
    ev,
    30,
    [
      [0, 57, 0.5],
      [0.5, 59, 0.5],
      [1, 62, 1],
    ],
    0.14,
    'reed',
  );
  pushPhrase(
    ev,
    46,
    [
      [0, 50, 0.5],
      [0.5, 54, 0.5],
      [1, 57, 1],
    ],
    0.14,
    'reed',
  );

  // the drillmaster's eight: a reed tune in E minor, brass stabs for strikes
  const drill: Phrase = [
    [0, 64, 1.5],
    [1.5, 62, 0.5],
    [2, 59, 2],
    [4, 60, 1],
    [5, 64, 1],
    [6, 67, 2],
    [8, 67, 1],
    [9, 66, 0.5],
    [9.5, 64, 0.5],
    [10, 62, 2],
    [12, 60, 1],
    [13, 62, 1],
    [14, 66, 2],
    [16, 71, 2],
    [18, 67, 1],
    [19, 64, 1],
    [20, 67, 1.5],
    [21.5, 64, 0.5],
    [22, 60, 2],
    [24, 60, 1],
    [25, 57, 1],
    [26, 64, 2],
    [28, 66, 1],
    [29, 69, 1],
    [30, 74, 2],
  ];
  pushPhrase(ev, 48, drill, 0.16, 'reed');
  pushVoicing(ev, 48, [52, 59], 0.5, 0.11, 'brassStab');
  pushVoicing(ev, 64, [52, 59], 0.5, 0.11, 'brassStab');
  pushVoicing(ev, 76, [50, 57], 0.5, 0.1, 'brassStab');

  // the reprise: the march again with the wardens' slow horn walking the wall
  pushPhrase(ev, 80, march, 0.19, 'pipe');
  const wall: Phrase = [
    [0, 59, 4],
    [4, 60, 4],
    [8, 59, 4],
    [12, 57, 4],
    [16, 60, 4],
    [20, 59, 4],
    [24, 57, 4],
    [28, 57, 2],
    [30, 54, 2],
  ];
  pushPhrase(ev, 80, wall, 0.12, 'horn');

  // the turn: timpani roll, then the tune hangs on G over the D suspension
  pushPhrase(
    ev,
    108,
    [
      [2, 36, 0.3],
      [2.5, 36, 0.3],
      [3, 36, 0.3],
      [3.5, 36, 0.3],
    ],
    0.09,
    'timpani',
  );
  pushNote(ev, 112, 36, 1, 0.2, 'timpani');
  const turn: Phrase = [
    [0, 72, 2],
    [2, 74, 1],
    [3, 76, 1],
    [4, 74, 2],
    [6, 71, 2],
    [8, 69, 2],
    [10, 66, 1],
    [11, 62, 1],
    [12, 67, 4],
  ];
  pushPhrase(ev, 112, turn, 0.18, 'pipe');

  ev.sort((a, b) => a.beat - b.beat);
  return { bpm: 100, bars: 32, events: ev };
}

// ---------------------------------------------------------------------------
// Candidate C.
// ---------------------------------------------------------------------------

/** The Proving Shore, alternate: "Across the Morning Water". D major, 63 bpm,
 *  24 bars in a 12/8 lilt (the beat grid carries triplets), A B A'. The
 *  crossing itself: a piano barcarolle rocks the ferry while strings swell
 *  like the open water and a flute lilts the Proving call over the rail. The
 *  middle eight broadens it to a horn augmentation under a wordless choir,
 *  and at its midpoint the island's bell tolls and the vale strand's twin
 *  answers across the strait (the two bells of the PR's ferry crossing).
 *  Harp sweeps turn each section, and the last one rises straight into the
 *  loop's downbeat so the water never stops moving. */
export function composeProvingShoreCrossing(): Theme {
  const ev: NoteEvent[] = [];
  const T = 1 / 3;
  type BarSpec = { root: number; low: number; mid: number; tops: [number, number]; pad: number[] };
  const D: BarSpec = { root: 38, low: 50, mid: 57, tops: [66, 69], pad: [62, 66, 69] };
  const G: BarSpec = { root: 43, low: 55, mid: 62, tops: [67, 71], pad: [59, 62, 67] };
  const Bm: BarSpec = { root: 35, low: 47, mid: 54, tops: [62, 66], pad: [59, 62, 66] };
  const A: BarSpec = { root: 33, low: 45, mid: 52, tops: [61, 64], pad: [57, 61, 64] };
  const Em: BarSpec = { root: 40, low: 52, mid: 59, tops: [67, 64], pad: [59, 64, 67] };
  const A8: BarSpec[] = [D, G, Bm, A, D, G, Em, A];
  const B8: BarSpec[] = [Bm, G, D, A, Bm, Em, G, A];
  const bars: BarSpec[] = [...A8, ...B8, ...A8];

  bars.forEach((c, bar) => {
    const b0 = bar * 4;
    const inB = bar >= 8 && bar < 16;
    const inA2 = bar >= 16;
    // piano barcarolle: the ferry rocking, three notes to every beat
    for (let beat = 0; beat < 4; beat++) {
      const top = c.tops[beat % 2];
      pushNote(ev, b0 + beat, c.low, 2 * T, 0.1, 'piano');
      pushNote(ev, b0 + beat + T, c.mid, 2 * T, 0.09, 'piano');
      pushNote(ev, b0 + beat + 2 * T, top, 2 * T, beat === 2 ? 0.1 : 0.08, 'piano');
    }
    // strings: the open water, swelling every two bars, fuller mid-crossing
    if (bar % 2 === 0) {
      pushVoicing(ev, b0, [c.pad[0] - 12, c.pad[1] - 12, c.pad[2] - 12], 8.2, 0.13, 'strings');
    }
    if (inB) pushNote(ev, b0, c.pad[2], 4.05, 0.1, 'strings');
    // choir: wordless over the deep middle, an echo of it on the way home
    if (bar % 2 === 0 && (inB || inA2)) {
      pushNote(ev, b0, c.root + 12, 8.2, inB ? 0.09 : 0.06, 'choir');
      pushNote(ev, b0, c.root + 19, 8.2, inB ? 0.06 : 0.04, 'choir');
    }
    // bass: the hull's slow keel
    pushNote(ev, b0, c.root, 2.5, 0.26, 'bass');
    if (bar % 2 === 1) pushNote(ev, b0 + 3, c.root + 7, 1, 0.13, 'bass');
    // a soft skin drum keeps the oar time mid-crossing
    if (inB) {
      pushNote(ev, b0, 44, 0.22, 0.07, 'frameDrum');
      if (bar % 2 === 1) pushNote(ev, b0 + 2, 44, 0.22, 0.05, 'frameDrum');
    }
    // gull glints on the home leg
    if (inA2 && bar % 4 === 2) pushNote(ev, b0 + 2, bar < 20 ? 86 : 83, 1, 0.05, 'tinyBell');
  });

  // the flute lilts the call over the rail; the reprise brings it home
  const lilt: Phrase = [
    [0, 66, 2],
    [2, 67, T],
    [2 + T, 69, 2 - T],
    [4, 71, 2],
    [6, 67, 1],
    [7, 66, 1],
    [8, 66, 2],
    [10, 62, 1],
    [11, 64, 1],
    [12, 64, 3],
    [15, 61, 1],
    [16, 62, 1],
    [17, 66, 1],
    [18, 69, 2],
    [20, 74, 2],
    [22, 71, 1],
    [23, 69, 1],
    [24, 67, 2],
    [26, 64, 1],
    [27, 62, 1],
    [28, 61, 2],
    [30, 57, 2],
  ];
  pushPhrase(ev, 0, lilt, 0.2, 'flute');
  pushPhrase(ev, 64, lilt, 0.22, 'flute');
  pushPhrase(ev, 64, lilt, 0.09, 'harp');

  // the call augmented: a horn across the whole middle eight
  const broad: Phrase = [
    [0, 62, 4],
    [4, 67, 2],
    [6, 69, 2],
    [8, 71, 2],
    [10, 69, 2],
    [12, 69, 3],
    [15, 66, 1],
    [16, 66, 4],
    [20, 64, 2],
    [22, 62, 2],
    [24, 62, 2],
    [26, 59, 2],
    [28, 61, 4],
  ];
  pushPhrase(ev, 32, broad, 0.18, 'horn');
  // a flute descant rides the horn's last four bars
  const descant: Phrase = [
    [16, 74, 2],
    [18, 71, 2],
    [20, 71, 1],
    [21, 67, 1],
    [22, 67, 2],
    [24, 66, 2],
    [26, 62, 2],
    [28, 64, 4],
  ];
  pushPhrase(ev, 32, descant, 0.12, 'flute');

  // the two bells of the crossing: the island tolls, the vale strand answers
  pushNote(ev, 0, 62, 3.5, 0.12, 'bell');
  pushNote(ev, 48, 62, 3.5, 0.12, 'bell');
  pushNote(ev, 50, 57, 3.5, 0.1, 'bell');

  // harp sweeps turn each section; the last one rises into the loop itself
  const sweep: Phrase = [
    [0, 57, T],
    [T, 61, T],
    [2 * T, 64, T],
    [1, 69, T],
    [1 + T, 73, T],
    [1 + 2 * T, 76, T],
  ];
  for (const at of [30, 62, 94]) {
    for (const [i, [b, m, d]] of sweep.entries()) {
      pushNote(ev, at + b, m, d, 0.06 + i * 0.01, 'harp');
    }
  }
  // cymbal swells under the sweeps
  pushNote(ev, 30, 42, 2, 0.09, 'cymSwell');
  pushNote(ev, 62, 42, 2, 0.09, 'cymSwell');
  pushNote(ev, 94, 42, 2, 0.1, 'cymSwell');

  ev.sort((a, b) => a.beat - b.beat);
  return { bpm: 63, bars: 24, events: ev };
}
