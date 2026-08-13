// Browser-side WebGL probe. The exported function is serialization-safe so
// Puppeteer can install it with page.evaluateOnNewDocument before navigation.

export const GPU_HITCH_PROBE_VERSION = 3;

export function installGpuHitchProbe(options = {}) {
  const PROBE_VERSION = 3;
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
    programs: new Map(),
    // Live references to whatever renderBufferDirect is currently drawing.
    // Storing the objects instead of a description keeps the per-draw cost to
    // three assignments; the description is built only when a link or a
    // reflection query actually happens inside the draw.
    drawMaterial: null,
    drawObject: null,
    drawScene: null,
    // The container a recorded rootIndex indexes into, not the drawn scene.
    rootRef: null,
    // How much of the capture actually had a draw context available. A link
    // before attachedAtMs simply could not be attributed to a draw, which is a
    // different statement from "this link happened outside any draw".
    rendererHook: { attachedAtMs: null, draws: 0, scenedDraws: 0 },
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

  // Technical identifiers only. A program cache key can embed an
  // onBeforeCompile source (three keys its program cache on
  // customProgramCacheKey, whose default return value IS the hook source), so
  // it is hashed and never serialized. Names are kept only when they are a
  // plain token, so no free-form string reaches the artifact.
  const SAFE_TOKEN = /^[A-Za-z0-9_.:\- ]{1,64}$/;
  const safeToken = (value) => (typeof value === 'string' && SAFE_TOKEN.test(value) ? value : '');

  const hashString = (text) => {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  };

  // The topmost ancestor that is a direct child of the scene, reported as an
  // index rather than a name: scene roots are unnamed groups added in a fixed
  // order by the renderer, so the index resolves to a subsystem through the
  // sceneRoots census below without carrying any free-form string.
  //
  // The census is taken from the container this walk INDEXES INTO, not from the
  // scene argument of the draw. Those are not the same object: the post chain
  // draws its own quad scenes, so the last drawn scene is routinely not the
  // world scene, and a rootIndex is meaningless without the array it indexes.
  // rootCount travels with each draw so a mismatch is visible rather than
  // silent.
  const describeDraw = () => {
    const material = state.drawMaterial;
    const object = state.drawObject;
    if (!material && !object) return null;
    let node = object ?? null;
    let topChild = node;
    let depth = 0;
    while (node?.parent && depth < 64) {
      topChild = node;
      node = node.parent;
      depth++;
    }
    const rootChildren = Array.isArray(node?.children) ? node.children : null;
    const rootIndex = rootChildren ? rootChildren.indexOf(topChild) : -1;
    if (rootChildren) state.rootRef = node;
    const morphPositions = object?.geometry?.morphAttributes?.position;
    return {
      materialType: safeToken(material?.type),
      materialName: safeToken(material?.name),
      objectType: safeToken(object?.type),
      skinned: object?.isSkinnedMesh === true,
      instanced: object?.isInstancedMesh === true,
      morphTargets: Array.isArray(morphPositions) ? morphPositions.length : 0,
      castShadow: object?.castShadow === true,
      // three passes a null scene from WebGLShadowMap, so this is an exact
      // discriminator for a shadow-map draw rather than a heuristic.
      shadowPass: state.drawScene === null,
      rootIndex,
      rootCount: rootChildren ? rootChildren.length : 0,
      depth,
    };
  };

  // Why a material that was ALREADY compiled links a second program: three
  // keys its program cache on the material PLUS the render conditions baked
  // into it (light counts, shadow map type, tone mapping, clipping planes,
  // output colour space, ...). Change one condition and the warm program is
  // invalid, so the next draw links a fresh one and blocks on it.
  //
  // The raw keys are compared HERE, in the page, and only the differing segment
  // leaves: `array.join()` in getProgramCacheKey means a plain comma split, and
  // the last element is customProgramCacheKey, which for a patched material IS
  // the onBeforeCompile source. Retaining the first key per material costs some
  // page memory and is never serialized.
  const MAX_RETAINED_KEYS = 512;
  const retainedKeys = new Map();

  const safeSegment = (value) =>
    value.length <= 32 && /^[A-Za-z0-9_.:+\- ]*$/.test(value)
      ? value
      : `#${hashString(value)}:${value.length}`;

  /** Widen a raw character span to whole comma-separated segments. */
  const diffCacheKeys = (before, after) => {
    let start = 0;
    const shortest = Math.min(before.length, after.length);
    while (start < shortest && before[start] === after[start]) start++;
    let tail = 0;
    while (
      tail < shortest - start &&
      before[before.length - 1 - tail] === after[after.length - 1 - tail]
    )
      tail++;
    let segmentStart = before.lastIndexOf(',', start) + 1;
    if (start < segmentStart) segmentStart = start;
    const beforeEndRaw = before.length - tail;
    const afterEndRaw = after.length - tail;
    let beforeEnd = before.indexOf(',', beforeEndRaw);
    if (beforeEnd === -1) beforeEnd = before.length;
    let afterEnd = after.indexOf(',', afterEndRaw);
    if (afterEnd === -1) afterEnd = after.length;
    const commasBefore = before.slice(0, segmentStart).split(',').length - 1;
    return {
      segmentIndex: commasBefore,
      segmentsBefore: before.split(',').length,
      segmentsAfter: after.split(',').length,
      before: safeSegment(before.slice(segmentStart, beforeEnd)),
      after: safeSegment(after.slice(segmentStart, afterEnd)),
    };
  };

  // linkProgram runs inside the WebGLProgram constructor; three pushes the
  // wrapper onto info.programs only after that constructor returns. Resolve on
  // the next microtask and match on the raw GL program object, which is exact.
  //
  // The renderer only becomes reachable when main.ts assembles window.__game,
  // which happens around the reveal, while most links happen under the curtain
  // long before it. An unreachable renderer therefore costs an entry NOTHING:
  // only a pass that could actually have found the program consumes an attempt,
  // so the whole cover phase resolves retroactively from the first reachable
  // pass (three keeps a program in info.programs while it is still used).
  const MAX_PENDING_ATTRIBUTION = 8_192;
  const MAX_ATTRIBUTION_ATTEMPTS = 4;
  let pendingAttribution = [];
  const flushAttribution = () => {
    attachRendererHook();
    if (pendingAttribution.length === 0) return;
    const programs = ROOT.__game?.renderer?.webgl?.info?.programs;
    if (!Array.isArray(programs)) return;
    const byGlProgram = new Map();
    for (const wrapper of programs) {
      if (wrapper?.program !== undefined && !byGlProgram.has(wrapper.program))
        byGlProgram.set(wrapper.program, wrapper);
    }
    const remaining = [];
    for (const entry of pendingAttribution) {
      entry.attempts++;
      const wrapper = byGlProgram.get(entry.glProgram);
      if (!wrapper) {
        // A program disposed before the first reachable pass can never be
        // resolved; give up after a few reachable passes.
        if (entry.attempts < MAX_ATTRIBUTION_ATTEMPTS) remaining.push(entry);
        continue;
      }
      const cacheKey = typeof wrapper.cacheKey === 'string' ? wrapper.cacheKey : '';
      // Identity of the VARIANT FAMILY: same material, different conditions.
      const family = `${wrapper.type ?? ''} ${wrapper.name ?? ''}`;
      const retained = retainedKeys.get(family);
      let variantDiff = null;
      if (cacheKey === '') {
        // nothing to compare
      } else if (retained === undefined) {
        if (retainedKeys.size < MAX_RETAINED_KEYS) retainedKeys.set(family, cacheKey);
      } else if (retained !== cacheKey) {
        variantDiff = diffCacheKeys(retained, cacheKey);
      }
      state.programs.set(entry.programId, {
        programId: entry.programId,
        threeId: Number.isFinite(wrapper.id) ? wrapper.id : null,
        materialType: safeToken(wrapper.type),
        materialName: safeToken(wrapper.name),
        cacheKeyHash: cacheKey === '' ? '' : hashString(cacheKey),
        cacheKeyLength: cacheKey.length,
        variantDiff,
        resolvedAtMs: since(),
      });
    }
    pendingAttribution = remaining;
  };

  let rendererHook = null;
  let rendererHookTimer = null;
  const attachRendererHook = () => {
    if (rendererHook || !state.running) return;
    const webgl = ROOT.__game?.renderer?.webgl;
    if (!webgl || typeof webgl.renderBufferDirect !== 'function') return;
    if (rendererHookTimer !== null) {
      clearInterval(rendererHookTimer);
      rendererHookTimer = null;
    }
    const original = webgl.renderBufferDirect;
    rendererHook = { webgl, original };
    state.rendererHook.attachedAtMs = since();
    webgl.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
      const previousMaterial = state.drawMaterial;
      const previousObject = state.drawObject;
      const previousScene = state.drawScene;
      state.drawMaterial = material;
      state.drawObject = object;
      state.drawScene = scene;
      state.rendererHook.draws++;
      if (scene) state.rendererHook.scenedDraws++;
      try {
        return original.call(this, camera, scene, geometry, material, object, group);
      } finally {
        state.drawMaterial = previousMaterial;
        state.drawObject = previousObject;
        state.drawScene = previousScene;
      }
    };
  };

  const sceneRootsCensus = () => {
    const children = state.rootRef?.children;
    if (!Array.isArray(children)) return [];
    return children.slice(0, 256).map((child, index) => ({
      index,
      type: safeToken(child?.type),
      name: safeToken(child?.name),
      children: Array.isArray(child?.children) ? child.children.length : 0,
      visible: child?.visible === true,
    }));
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
          // The renderer is built after this probe installs, and the first
          // links happen during that construction. Retrying on every link
          // costs one property read and attaches as soon as it exists.
          attachRendererHook();
          const draw = describeDraw();
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
              draw,
            });
            if (id !== null) {
              // Oldest first: a renderer that never becomes reachable must not
              // let this list grow with the capture.
              if (pendingAttribution.length >= MAX_PENDING_ATTRIBUTION) pendingAttribution.shift();
              pendingAttribution.push({ programId: id, glProgram: program, attempts: 0 });
              queueMicrotask(flushAttribution);
            }
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
          let result;
          try {
            result = original.call(this, program, pname);
            return result;
          } finally {
            const endMs = since();
            const reflection = kind !== 'completion-status';
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
              // The completion status is the boolean that decides whether a
              // later first use waits on the link; the two reflection pnames
              // return the program's active cardinality.
              value: reflection ? (Number.isFinite(result) ? result : null) : result === true,
              // Only the two reflection kinds carry a draw context: a capture
              // holds tens of thousands of completion polls and an object per
              // poll would dominate the artifact for no attribution value.
              draw: reflection ? describeDraw() : null,
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
  // Links are the natural attach trigger, but a capture can go quiet right
  // after the last link and before window.__game exists, which would leave
  // every live draw unattributed. A slow poll closes that window; it stops the
  // moment the hook attaches.
  attachRendererHook();
  if (!rendererHook && typeof setInterval === 'function') {
    rendererHookTimer = setInterval(attachRendererHook, 250);
  }

  const restore = () => {
    if (!state.running) return;
    state.running = false;
    state.stopReason ??= 'stopped';
    if (phaseAttachTimer !== null) clearTimeout(phaseAttachTimer);
    phaseObserver?.disconnect();
    curtainRootObserver?.disconnect();
    document.removeEventListener('visibilitychange', visibilityListener);
    document.removeEventListener('webglcontextlost', contextLostListener, true);
    if (rendererHookTimer !== null) {
      clearInterval(rendererHookTimer);
      rendererHookTimer = null;
    }
    if (rendererHook) {
      rendererHook.webgl.renderBufferDirect = rendererHook.original;
      rendererHook = null;
    }
    for (let index = originals.length - 1; index >= 0; index--) {
      const { prototype, name, original } = originals[index];
      prototype[name] = original;
    }
  };

  const snapshot = () => {
    // Resolve anything linked since the last microtask so a capture stopped
    // right after a link burst still names those programs.
    flushAttribution();
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
      programs: [...state.programs.values()],
      sceneRoots: sceneRootsCensus(),
      rendererHook: { ...state.rendererHook },
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
