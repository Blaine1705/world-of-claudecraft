# Desktop Client Update: brainstorm and research record

Vision: make the Electron desktop client feel like a AAA MMORPG client on Windows,
macOS, and Linux. Performance first (hybrid-GPU laptops are the priority cohort), then
desktop UX players expect from a real game client. No rewrite; the Electron shell stays.

Origin: deep-research session 2026-08-08 (Electron shell audit, renderer stack audit,
live version verification, and a correction pass over an external report). User locked
scope via four decisions the same day; see state.md.

## 1. Current state (verified at base 6ed4d7e12c)

The shell is already strong: hardened isolation (contextIsolation, sandbox, fuses, ASAR
integrity, per-response CSP with hashed inline scripts, trustedSender on all 15 IPC
handlers), three-channel packaging (website with electron-updater, steam and epic with
the updater hard-off twice over), hybrid-GPU steering (Windows HKCU GpuPreference merge,
both force-high-performance switches, Linux PRIME re-exec with ozone x11), crash and log
capture, and 26 dedicated shell/desktop test files. main.cjs is a 728-line coordinator
over 14 pure .cjs modules, each Node-tested.

Confirmed gaps this packet closes:
- No V8 code cache privilege on the app:// scheme (re-parse on every launch).
- Window shown before first paint (dark flash), hardcoded 1440x900 every launch, no
  bounds/display persistence, a plain second launch is silently swallowed.
- A minimized desktop client keeps rendering at full rate (backgroundThrottling:false
  plus an ungated rAF loop).
- Monitor/DPI change mid-session keeps a stale pixel ratio (only resize/orientation
  listeners exist).
- The main process's own GPU verdict (software renderer, discreteInactive, post-crash
  WARP flip) is log-only; the player-facing gpu notice triggers only off renderer-side
  detection.
- No native notifications, no display-mode options (the only display setting is a
  browser-fullscreen boolean), no Rich Presence, update toast has no what's-new surface,
  stale DESKTOP_VERSION constant (0.35.1 on a 0.36.0 branch). [Corrected by phase 1 QA
  and resolved in phase 2: the constant was never stale, package.json was also 0.35.1
  (release-owned hand-bump not yet run); phase 2 removed the constant entirely, the
  version now derives from package.json via the __APP_VERSION__ define.]
- LOW graphics preset renders MORE than MEDIUM on several axes (details below).

## 2. Version currency (verified live 2026-08-08)

electron ^43.0.0 (43.1.1 installed) -> 43.3.0 latest (Chromium 150.0.7871.212, Node
24.18.1; secondary-monitor DPI sizing fix and an asar-adjacent memory-safety patch in
the train). Supported majors 41/42/43; 44 in beta, stable ~Aug 25 (out of scope).
electron-builder 26.15.6 -> 26.15.7 (v26 tag; npm latest tag lags at 26.15.3).
three 0.165.0 -> 0.185.1. postprocessing 6.36.0 -> 6.39.4 (peer three >=0.168 <0.186;
6.39.2 is the FLOOR for three 0.185; 6.39.3 fixed a depth-buffer format mismatch for
late-added depth-aware passes, exactly the AO-pass shape). n8ao 1.10.1 -> 2.0.0 (neural
denoising; no breaking API; peers unchanged and uninformative). electron-updater 6.8.9
and electron-log 5.4.4 already current.

## 3. three.js r166 -> r185 migration brief (web-research agent, 2026-08-08)

Action list for Phase 6 (per the official Migration Guide wiki):
- r170: Material.type is static/immutable for custom materials; mipmaps ALWAYS generate
  when generateMipmaps is true (upload/VRAM cost up for non-mip-filter textures).
- r174: RenderTarget.clone() is a full structural clone, no shared textures.
- r176: GLTFLoader dropped WebP/AVIF support detection (audit curated GLBs for
  EXT_texture_webp).
- r177: ColorManagement.fromWorkingColorSpace -> workingToColorSpace,
  toWorkingColorSpace -> colorSpaceToWorking.
- r178: MultiplyBlending / SubtractiveBlending now require premultipliedAlpha=true
  (silent VFX visual change).
- r179/r180: reverseDepthBuffer -> reversedDepthBuffer; GLSL defines USE_REVERSEDEPTHBUF
  -> USE_REVERSED_DEPTH_BUFFER and USE_LOGDEPTHBUF -> USE_LOGARITHMIC_DEPTH_BUFFER. The
  define renames are the ONE confirmed break class for onBeforeCompile string patching
  in the window; no chunk RENAMES exist r166-r185, but chunk CONTENT edits were not
  exhaustively audited (grep every patch anchor against r185 chunk sources).
- r181: PBR energy conservation change; global lighting/brightness shift expected.
- r182: PCFSoftShadowMap deprecated with WebGLRenderer (we use PCFSoft; move to
  PCFShadowMap and eyeball shadows).
- r183: background/environment rotation sign alignment; Clock deprecated (Timer);
  RoomEnvironment position change shifts PMREM lighting; Sky legacy gamma removed.
- r184: raw-context pixel storage must go through renderer.state.pixelStorei (we pass a
  caller-supplied WebGL2 context: audit every direct gl.pixelStorei); FileLoader/
  ImageBitmapLoader load() no longer returns a value.
- r185: Object3D.updateWorldMatrix honors matrixWorldNeedsUpdate (DIRECT hit on our
  scene.matrixAutoUpdate=false manual-transform code: stale flags now skip updates);
  DRACOLoader/KTX2Loader default to relative decoder URLs; position attribute always
  bound to location 0; info.reset moved before shadowMap.render, our autoReset=false
  draw-stats shim is UNAFFECTED (totals unchanged with manual reset).
- Editor-only: r169 TransformControls needs controls.getHelper() added to the scene.
- Perf upside in-range: r184 material/geometry comparison and pixel-storage caching,
  r185 render-list and UBO GC reductions and merged update ranges. The widely quoted
  "240k-500k allocations/sec eliminated" figure is from a secondary blog, treat the
  magnitude as unverified.
- postprocessing crossings: 6.38.0 DoF world-units and Pass default camera changes;
  6.39.0 removed EffectComposer alpha param and createBuffer; 6.39.1 removed
  Resolution.resizable; 6.37.6 changed BloomEffect defaults and luminance threshold
  (eyeball bloom after the bump).
- No publicly filed postprocessing blocker against three 0.185; precedent exists for
  n8ao shader errors with mismatched three (react-postprocessing #291), so a
  shader-error smoke pass (checkShaderErrors temporarily ON in a dev run) is required.

## 4. Governor / tier verdicts (code-audit agent, 2026-08-08, at base)

- Frame-cap trap: FIXED by 6ad39476f2 (2026-06-20) with test pins in
  tests/render_budget.test.ts. Cadence and render work are independent inputs; a stable
  external cap no longer degrades and recovery proceeds under a cap.
- Residual 1 (Phase 5 target): recover() restores resolution LAST (ladder rung nine)
  and its gate needs draw calls, triangles, AND grass tufts at <=90% of tier targets;
  climbing the quality buckets toward band maxima raises exactly those counters, so in
  dense scenes the ladder stalls before the resolution rung and render scale stays
  degraded indefinitely with full GPU headroom.
- Residual 2 (note, smaller): the cap-detection window is 28 to 48 ms (misses 20/24 fps
  caps) and requires renderer-CPU headroom, so first entry into a dense scene sheds once
  before the cap is recognized. Converges; fix only if cheap while in there.
- LOW heavier than MEDIUM: STILL PRESENT, five mechanisms: grass radius 80 vs 76 times
  band baselines 0.9 vs 0.78 (roughly 40% more grass drawn at baseline), governor caps
  560 calls / 2.2M tris / 5600 tufts vs 420 / 1.8M / 3800, quality floors strictly above
  MEDIUM's, and lowPlusGrassScale 1.08 blade-quad fill. LOW does win on the composer
  (none) and shadows (off); the inversion is grass/foliage load, deliberate lowPlus art
  direction applied to ALL low-tier users instead of the weak-fragment-bound iGPU cohort
  it was designed for. Fix direction: monotonic caps/floors/baselines for plain LOW,
  keep lowPlus visuals gated on the weak-iGPU classification.
- The shader-compile-gate holes and the WS-backlog recovery tail from issue #2243 are
  real but OUT of this packet.

## 5. Recipes extracted for the UX phases

Full detail lives in state.md "Key repo recipes". Headlines: the options doctrine from
the playtime PR (settings declaration, one boolToggle row, an applySetting arm owning
the single write path, M16 fills, three test pins); the shell-strings closed-set
contract; the preload bridge house style (optional DesktopBridge members, feature-check
consumers, the ipc_channels text-scan pins including the EXACT pinned push-channel
array); electron persistence is greenfield (first store lands in Phase 7); notification
observation points: partyInvite is a SimEvent handled in the hud event switch (offline
events are pid-gated there, mind the gate), update-ready is the reduceUpdateToast
'downloaded' -> mode 'ready' transition in the pure src/ui/desktop_update_view.ts core.

## 6. Discord Rich Presence research (web-research agent, 2026-08-08)

Decision: in-house client, no dependency. The needed protocol is small and officially
documented: connect to the local pipe (Windows \\?\pipe\discord-ipc-{0..9}; unix
$XDG_RUNTIME_DIR/discord-ipc-{n} with TMPDIR//tmp fallbacks, plus Flatpak/Snap subdirs),
frames are 32-bit LE opcode + 32-bit LE length + JSON (0 HANDSHAKE with {v:1,client_id},
1 FRAME carrying SET_ACTIVITY, 2 CLOSE, 3 PING, 4 PONG). Presence needs only a
registered Application ID (art assets uploaded in the portal, 1024x1024 recommended);
the native Social SDK is NOT required; the Discord desktop client must be running.
Absence behavior: pipe connect fails fast (ENOENT/ECONNREFUSED), retry with jittered
backoff to ~30-60s, treat CLOSE/EPIPE as Discord quitting. Rate limits: gateway
presence documents 5/20s; legacy RPC guidance was one update per 15s with NO client-side
queueing (rapid calls blanked presence per discord-api-docs issue #668): coalesce zone
changes behind a ~15s trailing timer and drop same-zone no-ops.
Rejected libraries: @xhayper/discord-rpc 1.3.4 (only maintained option, but drags
@discordjs/rest + undici, ~13 packages, into an audited vendor bundle); discord-rpc
4.0.1 (5 years stale, git-URL dependency hostile to frozen installs); @xmcl (dormant);
@ryuziii (single-author RC). Fallback if policy changes: @xhayper, pinned.
OPEN: the approval-gate ambiguity and the Application ID provisioning (see state.md).

## 7. Ideas parked for later (explicitly out of this packet)

WebGPU renderer spike (own branch after this lands); Electron 44 soak; shader-compile
gate holes and WS recovery tail (#2243 workstreams 3 and 4); whole-tree dependency
refresh; Flatpak channel; Steam Input test matrix beyond smoke; crash-minidump endpoint
provisioning (maintainer infrastructure); tray minimize (deliberately skipped, wrong
for an MMO); Steam overlay (documented non-goal, security conflict).
