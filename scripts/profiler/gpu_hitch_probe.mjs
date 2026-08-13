// Browser-side WebGL probe. The exported function is serialization-safe so
// Puppeteer can install it with page.evaluateOnNewDocument before navigation.

export const GPU_HITCH_PROBE_VERSION = 1;

export function installGpuHitchProbe(options = {}) {
  const PROBE_VERSION = 1;
  const ROOT = window;
  if (ROOT.__wocGpuHitchProbe?.version === PROBE_VERSION) return;

  const startedAt = performance.now();
  const profile =
    options.profile === 'upload' || options.profile === 'full' ? options.profile : 'shader';
  const uploadBucketWidthMs =
    Number.isFinite(options.uploadBucketWidthMs) && options.uploadBucketWidthMs > 0
      ? options.uploadBucketWidthMs
      : 100;
  const state = {
    version: PROBE_VERSION,
    profile,
    captureId: String(options.captureId ?? ''),
    scenario: options.scenario ?? null,
    phase: 'boot',
    transitions: [],
    links: [],
    queries: [],
    uploadBuckets: new Map(),
    controls: { calls: 0, totalMs: 0, maxMs: 0 },
    visibilityTransitions: [{ atMs: 0, state: document.visibilityState }],
    contextLost: 0,
    running: true,
    stopReason: null,
  };
  const since = () => performance.now() - startedAt;
  const originals = [];
  const programIds = new WeakMap();
  let nextProgramId = 1;
  let phaseObserver = null;
  let curtainRootObserver = null;
  let phaseAttachTimer = null;
  let visibilityListener = null;
  let contextLostListener = null;

  const recordTransition = (event, nextPhase) => {
    const atMs = since();
    state.phase = nextPhase;
    state.transitions.push({ atMs, event, phase: nextPhase });
  };

  const attachCurtainObserver = () => {
    if (!state.running || phaseObserver || typeof document === 'undefined') return;
    const curtain = document.querySelector('#loading-screen');
    if (!curtain) {
      if (!document.documentElement) {
        phaseAttachTimer = setTimeout(attachCurtainObserver, 0);
        return;
      }
      curtainRootObserver ??= new MutationObserver(attachCurtainObserver);
      curtainRootObserver.observe(document.documentElement, { childList: true, subtree: true });
      return;
    }
    curtainRootObserver?.disconnect();
    curtainRootObserver = null;
    let visible = curtain.classList.contains('visible');
    let fading = curtain.classList.contains('fade');
    if (visible) state.phase = 'cover';
    phaseObserver = new MutationObserver(() => {
      const nextVisible = curtain.classList.contains('visible');
      const nextFading = curtain.classList.contains('fade');
      if (nextVisible && !visible) recordTransition('cover-up', 'cover');
      if (nextVisible && nextFading && !fading) recordTransition('reveal', 'live');
      if (!nextVisible && visible && state.phase === 'cover') recordTransition('reveal', 'live');
      visible = nextVisible;
      fading = nextFading;
    });
    phaseObserver.observe(curtain, { attributes: true, attributeFilter: ['class'] });
  };

  const laneOf = () => {
    let stack = '';
    try {
      stack = new Error().stack ?? '';
    } catch {
      return 'unknown';
    }
    const lanes = [
      ['submit-sync', /submitCompileUnits/],
      ['submit-async-tail', /compilePrewarmColorPrograms|compileShadowPrograms|compileEntryUnits/],
      ['prewarm-resume', /prewarm_resume|resumePrewarm/],
      ['prewarm-pass', /prewarm_pass|renderPrewarmPass/],
      ['compile-gate', /compile_gate|gateViewOnCompile|awaitCompileGate/],
      ['zone-prepare', /zone_streaming|prepareZone|prepareStreamed/],
      ['background-queue', /background_gpu_queue/],
      ['armory-preview', /armory_preview/],
      ['first-draw', /renderBufferDirect|WebGLRenderer\.render/],
    ];
    for (const [name, expression] of lanes) if (expression.test(stack)) return name;
    return 'unknown';
  };

  const programId = (program) => {
    if (!program || (typeof program !== 'object' && typeof program !== 'function')) return null;
    let id = programIds.get(program);
    if (!id) {
      id = nextProgramId++;
      programIds.set(program, id);
    }
    return id;
  };

  const remember = (prototype, name, replacement) => {
    const original = prototype?.[name];
    if (typeof original !== 'function') return;
    originals.push({ prototype, name, original });
    prototype[name] = replacement(original);
  };

  const bucketFor = (atMs) => {
    const startMs = Math.floor(atMs / uploadBucketWidthMs) * uploadBucketWidthMs;
    let bucket = state.uploadBuckets.get(startMs);
    if (!bucket) {
      bucket = { startMs, count: 0, bytes: 0 };
      state.uploadBuckets.set(startMs, bucket);
    }
    return bucket;
  };

  const uploadBytes = (method, args) => {
    const last = args[args.length - 1];
    if (last && Number.isFinite(last.byteLength)) return last.byteLength;
    if (method.includes('compressed')) return 0;
    const width = Number(args[3]);
    const height = Number(args[4]);
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0)
      return width * height * 4;
    return 0;
  };

  const GL2 = globalThis.WebGL2RenderingContext?.prototype;
  if (GL2) {
    remember(
      GL2,
      'linkProgram',
      (original) =>
        function (program) {
          const startMs = since();
          const id = programId(program);
          const lane = laneOf();
          const phaseAtStart = state.phase;
          try {
            return original.call(this, program);
          } finally {
            state.links.push({
              programId: id,
              startMs,
              endMs: since(),
              lane,
              phaseAtStart,
              phaseAtEnd: state.phase,
            });
          }
        },
    );

    const completion = 0x91b1;
    const activeUniforms = 0x8b86;
    const activeAttributes = 0x8b89;
    const maxTextureSize = 0x0d33;
    let originalGetParameter = null;
    const measureControl = (gl) => {
      if (!originalGetParameter) return null;
      const started = performance.now();
      try {
        originalGetParameter.call(gl, maxTextureSize);
      } catch {
        return null;
      }
      const elapsed = performance.now() - started;
      state.controls.calls++;
      state.controls.totalMs += elapsed;
      state.controls.maxMs = Math.max(state.controls.maxMs, elapsed);
      return elapsed;
    };
    remember(GL2, 'getParameter', (original) => {
      originalGetParameter = original;
      return original;
    });
    remember(
      GL2,
      'getProgramParameter',
      (original) =>
        function (program, pname) {
          if (pname !== completion && pname !== activeUniforms && pname !== activeAttributes)
            return original.call(this, program, pname);
          const phaseAtStart = state.phase;
          const preControlMs = measureControl(this);
          const startMs = since();
          const kind =
            pname === completion
              ? 'completion-status'
              : pname === activeUniforms
                ? 'active-uniforms'
                : 'active-attributes';
          try {
            return original.call(this, program, pname);
          } finally {
            const endMs = since();
            state.queries.push({
              programId: programId(program),
              kind,
              startMs,
              endMs,
              durationMs: endMs - startMs,
              phaseAtStart,
              phaseAtEnd: state.phase,
              lane: laneOf(),
              preControlMs,
            });
          }
        },
    );

    if (profile === 'upload' || profile === 'full') {
      for (const name of [
        'texImage2D',
        'texSubImage2D',
        'compressedTexImage2D',
        'compressedTexSubImage2D',
      ]) {
        remember(
          GL2,
          name,
          (original) =>
            function (...args) {
              const atMs = since();
              try {
                return original.apply(this, args);
              } finally {
                const bucket = bucketFor(atMs);
                bucket.count++;
                bucket.bytes += uploadBytes(name, args);
              }
            },
        );
      }
    }
  }

  visibilityListener = () => {
    const atMs = since();
    const nextState = document.visibilityState;
    const noApplicationEvidence =
      state.transitions.length === 0 &&
      state.links.length === 0 &&
      state.queries.length === 0 &&
      state.uploadBuckets.size === 0;
    // A newly created Chrome target can briefly cycle visible-hidden-visible
    // during its initial focus handoff. Collapse only that sub-second setup
    // churn while absolutely no application/GPU evidence exists. Every later
    // hidden transition remains in the journal and invalidates the capture.
    if (nextState === 'visible' && atMs <= 1_000 && noApplicationEvidence) {
      state.visibilityTransitions = [{ atMs, state: nextState }];
      return;
    }
    state.visibilityTransitions.push({ atMs, state: nextState });
  };
  document.addEventListener('visibilitychange', visibilityListener);
  contextLostListener = () => {
    state.contextLost++;
  };
  document.addEventListener('webglcontextlost', contextLostListener, true);
  attachCurtainObserver();

  const restore = () => {
    if (!state.running) return;
    state.running = false;
    state.stopReason ??= 'stopped';
    if (phaseAttachTimer !== null) clearTimeout(phaseAttachTimer);
    phaseObserver?.disconnect();
    curtainRootObserver?.disconnect();
    document.removeEventListener('visibilitychange', visibilityListener);
    document.removeEventListener('webglcontextlost', contextLostListener, true);
    for (let index = originals.length - 1; index >= 0; index--) {
      const { prototype, name, original } = originals[index];
      prototype[name] = original;
    }
  };

  const snapshot = () => {
    const receipt = ROOT.__wocGpuHitchReceipt ?? null;
    const renderer = ROOT.__game?.renderer;
    let rendererStats = null;
    try {
      rendererStats = renderer?.perfStats?.() ?? null;
    } catch {
      rendererStats = null;
    }
    return {
      version: PROBE_VERSION,
      captureId: state.captureId,
      profile: state.profile,
      scenario: state.scenario,
      phase: state.phase,
      transitions: state.transitions.slice(),
      links: state.links.slice(),
      queries: state.queries.slice(),
      uploadBucketWidthMs,
      uploadBuckets: [...state.uploadBuckets.values()].sort((a, b) => a.startMs - b.startMs),
      controls: { ...state.controls },
      visibilityTransitions: state.visibilityTransitions.slice(),
      visible: document.visibilityState === 'visible',
      contextLost: state.contextLost,
      running: state.running,
      stopReason: state.stopReason,
      runtimeReceipt: receipt,
      rendererStats,
      startedAtPerformanceMs: startedAt,
      startedAtEpochMs: Date.now() - since(),
      elapsedMs: since(),
    };
  };
  const stop = (reason = 'stopped') => {
    state.stopReason = reason;
    restore();
    return snapshot();
  };

  ROOT.__wocGpuHitchProbe = {
    version: PROBE_VERSION,
    snapshot,
    stop,
  };
}
