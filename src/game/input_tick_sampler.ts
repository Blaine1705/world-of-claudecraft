import { DT, emptyMoveInput, type MoveInput } from '../sim/types';

const DT_MS = DT * 1000;

export interface InputTickSample {
  mi: MoveInput;
  facing: number | null;
}

export interface InputTickFrame extends InputTickSample {
  ct: number;
}

export class InputTickSampler {
  private nowMs = 0;
  private nextTickAtMs = DT_MS;
  private nextClientTick = 0;

  get interpolationAlpha(): number {
    const tickStartedAtMs = this.nextTickAtMs - DT_MS;
    return Math.min(1, Math.max(0, (this.nowMs - tickStartedAtMs) / DT_MS));
  }

  reset(now: number): void {
    this.nowMs = now;
    this.nextTickAtMs = now + DT_MS;
    this.nextClientTick = 0;
  }

  emitNeutralFrame(now: number): InputTickFrame {
    this.nowMs = now;
    this.nextTickAtMs = now + DT_MS;
    return {
      ct: this.nextClientTick++,
      mi: emptyMoveInput(),
      facing: null,
    };
  }

  advance(now: number, sampleFn: () => InputTickSample): InputTickFrame[] {
    this.nowMs = now;
    const frames: InputTickFrame[] = [];
    while (now >= this.nextTickAtMs) {
      frames.push({ ct: this.nextClientTick++, ...sampleFn() });
      this.nextTickAtMs += DT_MS;
    }
    return frames;
  }
}
