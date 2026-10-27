// Plays the Guardian of the Heat's sounds (WHICH and WHEN: the pure core
// beside this file). Fed by the fight's painter (render/smith_heart_fx/
// heat_fight_fx.ts): its cue events, a Wakefire band beginning to build, the
// guardian (its bar) and the local player (the marks on them) each frame.
// Bounded and allocation-free in the frame: no timers, a handful of fields.
// Local presentation: a sound never decides anything.

import type { Entity, SimEvent } from '../sim/types';
import {
  HEAT_BAR_SOUNDS,
  HEAT_CUE_SOUNDS,
  HEAT_MARK_SOUNDS,
  HEAT_SFX_KEYS,
  HEAT_ZONE_BUILD_SOUND,
  heatBarRate,
} from './smith_heart_heat_audio_core';

export interface HeatAudioSink {
  playAt(
    key: string,
    x: number,
    y: number,
    z: number,
    opts?: { gain?: number; cooldown?: number; rate?: number; jitter?: boolean },
  ): boolean;
  preload?(key: string): void;
}

/** The marks' ids, in a fixed order (one bit each in `marks`). */
const MARK_IDS = Object.keys(HEAT_MARK_SOUNDS);

export class HeatAudio {
  private preloaded = false;
  private bar = '';
  private barTotal = 0;
  /** Which marks the local player wore a frame ago (a bit each). */
  private marks = 0;

  constructor(private readonly sink: HeatAudioSink) {}

  private preload(): void {
    if (this.preloaded) return;
    this.preloaded = true;
    for (const key of HEAT_SFX_KEYS) this.sink.preload?.(key);
  }

  /** A fight cue: its layered one-shot. Returns true when it was the fight's. */
  event(
    ev: SimEvent,
    entityOf: (id: number) => Entity | undefined,
    groundY: (x: number, z: number) => number,
  ): boolean {
    if (ev.type !== 'spellfx' && ev.type !== 'spellfxAt') return false;
    const layers = ev.ability ? HEAT_CUE_SOUNDS[ev.ability] : undefined;
    if (!layers) return false;
    this.preload();
    for (const sound of layers) {
      let x: number;
      let y: number;
      let z: number;
      if (ev.type === 'spellfxAt') {
        x = ev.x;
        z = ev.z;
        y = groundY(x, z);
      } else {
        const e = entityOf(sound.at === 'target' ? ev.targetId : ev.sourceId);
        if (!e) continue;
        x = e.pos.x;
        y = e.pos.y;
        z = e.pos.z;
      }
      this.sink.playAt(sound.key, x, y + 1, z, {
        gain: sound.gain,
        rate: sound.rate,
        cooldown: sound.cooldown,
      });
    }
    return true;
  }

  /** A Wakefire band began to build at (x, y, z). */
  zoneBuild(x: number, y: number, z: number): void {
    this.preload();
    this.sink.playAt(HEAT_ZONE_BUILD_SOUND.key, x, y + 0.5, z, {
      gain: HEAT_ZONE_BUILD_SOUND.gain,
      rate: HEAT_ZONE_BUILD_SOUND.rate,
      cooldown: 1.5,
      jitter: false,
    });
  }

  /**
   * One frame of the fight: the guardian (its bar; null out of the fight) and
   * the local player (the marks on them; null when not in it).
   */
  update(guardian: Entity | null, me: Entity | null): void {
    if (guardian !== null) this.preload();
    const bar = guardian && !guardian.dead ? (guardian.castingAbility ?? '') : '';
    const total = guardian?.castTotal ?? 0;
    if (bar !== this.bar || (bar !== '' && total !== this.barTotal)) {
      this.bar = bar;
      this.barTotal = total;
      const sound = bar ? HEAT_BAR_SOUNDS[bar] : undefined;
      if (sound && guardian)
        this.sink.playAt(sound.key, guardian.pos.x, guardian.pos.y + 2, guardian.pos.z, {
          gain: sound.gain,
          rate: heatBarRate(sound, total),
          cooldown: 0.5,
          jitter: false,
        });
    }
    let marks = 0;
    if (me && !me.dead)
      for (const a of me.auras) {
        const i = MARK_IDS.indexOf(a.id);
        if (i >= 0) marks |= 1 << i;
      }
    const fresh = marks & ~this.marks;
    this.marks = marks;
    if (!me || fresh === 0) return;
    for (let i = 0; i < MARK_IDS.length; i++) {
      if ((fresh & (1 << i)) === 0) continue;
      const s = HEAT_MARK_SOUNDS[MARK_IDS[i]];
      this.sink.playAt(s.key, me.pos.x, me.pos.y + 1.6, me.pos.z, {
        gain: s.gain,
        rate: s.rate,
        cooldown: 0.5,
        jitter: false,
      });
    }
  }
}
