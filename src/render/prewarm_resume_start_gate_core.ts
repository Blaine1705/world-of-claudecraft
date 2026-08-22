// One-shot ownership boundary between the curtained entry and post-manifest
// GPU debt. The initial page entry releases the shared instance only after a
// world frame has actually painted; direct/rebuild prewarms can omit the gate.

export interface PrewarmResumeStartGate {
  readonly wait: Promise<void>;
  release(): void;
}

export function createPrewarmResumeStartGate(): PrewarmResumeStartGate {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { wait, release };
}

export const initialPrewarmResumeStartGate = createPrewarmResumeStartGate();
