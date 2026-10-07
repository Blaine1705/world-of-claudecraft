// The dedicated boss-fight loop's asset handling, lifted out of MusicDirector
// (music.ts sits at its monolith ceiling): which track a boss fight plays, the
// streamed <audio> element, the decoded fallback buffer and its source node.
// MusicDirector keeps the mix (the boss gain, the duck, the enable and menu
// gates) and asks this for the sound itself.
//
// A boss with an owner-supplied production of its own is a row in
// BOSS_TRACK_URLS; every other boss fight keeps the shared default loop.

/** The shared boss-fight loop every boss without its own track plays. */
export const DEFAULT_BOSS_TRACK_URL = '/audio/dungeon-boss-fight.mp3';

/** Boss template id to its own fight track (owner-supplied productions). */
export const BOSS_TRACK_URLS: Readonly<Record<string, string>> = {
  morthen: '/audio/music/boss_morthen.mp3?v=664edb19bfe2',
};

/** The fight track for a boss template, or null when it has none of its own. */
export function bossTrackFor(templateId: string): string | null {
  return Object.hasOwn(BOSS_TRACK_URLS, templateId) ? BOSS_TRACK_URLS[templateId] : null;
}

export class BossLoopTrack {
  private url = DEFAULT_BOSS_TRACK_URL;
  private el: HTMLAudioElement | null = null;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private loading = false;

  get currentUrl(): string {
    return this.url;
  }

  get hasBuffer(): boolean {
    return this.buffer !== null;
  }

  /** Point the loop at another track: drops the old element, buffer and source. */
  retarget(url: string): void {
    if (url === this.url) return;
    this.el?.pause();
    this.stopSource();
    this.el = null;
    this.buffer = null;
    this.url = url;
  }

  /** The streamed element for the current track (null where Audio is missing). */
  element(): HTMLAudioElement | null {
    if (this.el) return this.el;
    if (typeof Audio !== 'function') return null;
    const el = new Audio(this.url);
    el.loop = true;
    el.preload = 'auto';
    this.el = el;
    return el;
  }

  pause(): void {
    this.el?.pause();
  }

  /** Back to the top, for a fresh dungeon run. */
  rewind(): void {
    if (this.el) {
      try {
        this.el.currentTime = 0;
      } catch {
        /* browser may reject seeking before metadata */
      }
    }
    this.stopSource();
  }

  /** Fetch and decode the fallback buffer once; `ready` runs when it lands. */
  loadBuffer(ctx: AudioContext, ready: () => void): void {
    if (this.buffer || this.loading || typeof fetch !== 'function') return;
    this.loading = true;
    const url = this.url;
    void fetch(url)
      .then((res) => res.arrayBuffer())
      .then((bytes) => ctx.decodeAudioData(bytes))
      .then((buffer) => {
        this.loading = false;
        // A retarget while this was in flight keeps the newer track.
        if (url !== this.url) return;
        this.buffer = buffer;
        ready();
      })
      .catch(() => {
        this.loading = false;
      });
  }

  startSource(ctx: AudioContext, gain: GainNode): void {
    if (!this.buffer || this.source) return;
    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    src.loop = true;
    src.connect(gain);
    src.start();
    this.source = src;
  }

  stopSource(): void {
    if (!this.source) return;
    try {
      this.source.stop();
    } catch {
      /* already stopped */
    }
    this.source.disconnect();
    this.source = null;
  }
}
