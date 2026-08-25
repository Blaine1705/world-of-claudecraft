import { DT, emptyMoveInput, type MoveInput } from '../sim/types';

const MAX_FRAME_DT_SEC = 0.25;

export interface InputTickSample {
  mi: MoveInput;
  facing: number | null;
}

export interface InputTickFrame extends InputTickSample {
  ct: number;
}

export class InputTickSampler {
  private accumulator = 0;
  private nextClientTick = 0;

  reset(): void {
    this.accumulator = 0;
    this.nextClientTick = 0;
  }

  emitNeutralFrame(): InputTickFrame {
    return {
      ct: this.nextClientTick++,
      mi: emptyMoveInput(),
      facing: null,
    };
  }

  advance(frameDtSec: number, sampleFn: () => InputTickSample): InputTickFrame[] {
    this.accumulator += Math.min(Math.max(frameDtSec, 0), MAX_FRAME_DT_SEC);
    const frames: InputTickFrame[] = [];
    while (this.accumulator >= DT) {
      frames.push({ ct: this.nextClientTick++, ...sampleFn() });
      this.accumulator -= DT;
    }
    return frames;
  }
}
