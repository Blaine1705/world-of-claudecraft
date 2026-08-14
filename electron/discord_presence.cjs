'use strict';

// Discord Rich Presence, in house.
//
// Discord's own SDK is a native dependency with a service of its own; the wire
// protocol it speaks to the locally running client is a JSON frame on a unix
// socket (a named pipe on Windows), which is small enough to own outright. That
// keeps the dependency set where CONTRIBUTING wants it and, more importantly,
// keeps every failure mode ours to decide: a player without Discord, a player
// who quits Discord mid-session, and a build whose app id was never registered
// all have to be non-events for the game.
//
// The rules that shape the state machine:
//
//  - CONSTRUCTION DOES NO IO. main.cjs builds this at module scope, before the
//    window exists, so the constructor may not touch a socket or arm a timer.
//    The first connection attempt happens when the game first has something to
//    show, which is also the earliest moment the connection is worth anything.
//  - ABSENCE IS SILENT. No Discord client means every candidate path fails, and
//    that is the common case for most players. It gets a debug line and a
//    backoff, never a warning and never a tight retry loop.
//  - A MISCONFIGURED APP ID IS TERMINAL. An unregistered client_id is answered
//    with a CLOSE frame before READY (probe-confirmed: {"code":4000,"message":
//    "Invalid Client ID"}). Retrying that would hot-loop against the daemon for
//    the whole session, so it is a one-line warning and a full stop.
//  - THE RATE LIMIT IS OURS TOO. Discord throttles presence updates (about one
//    per fifteen seconds), and the renderer's zone changes are not paced. The
//    floor here is trailing-edge: the LATEST desired activity is what lands,
//    intermediate ones are dropped rather than queued, because a presence line
//    that is four zones behind is worse than one that skipped four zones.
//
// Pure and dependency-injected (no electron import, and the socket factory
// arrives as a function), so tests/electron_discord_presence.test.ts drives
// every transition with a fake socket and fake timers.

const {
  EMPTY_FRAME_BUFFER,
  OPCODES,
  decodeFrames,
  encodeHandshake,
  encodePong,
  encodeSetActivity,
} = require('./discord_presence_codec.cjs');

/** The floor between two SET_ACTIVITY writes; Discord's own limit is near this. */
const DISCORD_MIN_SEND_INTERVAL_MS = 15000;

/** The first reconnect delay, doubled on each further failure. */
const DISCORD_BASE_BACKOFF_MS = 2000;

/** The ceiling the doubling stops at. */
const DISCORD_MAX_BACKOFF_MS = 60000;

/** How many socket paths Discord may be listening on (discord-ipc-0 .. -9). */
const DISCORD_PIPE_SLOTS = 10;

/**
 * A Discord application id is a snowflake: digits only, and never a length that
 * short. Validated as a shape rather than trusted, because it arrives from the
 * environment and is written straight into a handshake.
 */
const DISCORD_CLIENT_ID_PATTERN = /^\d{15,22}$/;

/**
 * The app id for this build, or null when there is none. There is deliberately
 * no hardcoded fallback: an id baked into the source would have every fork and
 * every local checkout reporting presence as the maintainer's registered app.
 * Absent means the whole feature stays inert, which is the correct reading of
 * an unconfigured build.
 */
function resolveDiscordClientId(env) {
  const raw = env?.WOC_DISCORD_APP_ID;
  if (typeof raw !== 'string') return null;
  return DISCORD_CLIENT_ID_PATTERN.test(raw) ? raw : null;
}

/**
 * Every socket path Discord could be listening on, in the order to try them.
 *
 * Windows uses named pipes and has one fixed base. Everywhere else the socket
 * lives in the runtime directory, but a sandboxed install relocates it: Flatpak
 * puts it under app/com.discordapp.Discord and snap under snap.discord, both
 * inside XDG_RUNTIME_DIR (the Flatpak path is the one that answered on the
 * maintainer's box). Those two are linux-only; macOS has neither packaging.
 *
 * The order is n-MAJOR: every base is tried for ipc-0 before any base is tried
 * for ipc-1. Slot 0 is what a single running client uses, so a base-major walk
 * would spend nine failed connects on the first base's empty slots before
 * reaching the base that actually has one.
 */
function candidatePipePaths(platform, env) {
  if (platform === 'win32') {
    const paths = [];
    for (let n = 0; n < DISCORD_PIPE_SLOTS; n += 1) paths.push(`\\\\?\\pipe\\discord-ipc-${n}`);
    return paths;
  }
  const bases = [];
  const addBase = (base) => {
    if (typeof base !== 'string' || base === '' || bases.includes(base)) return;
    bases.push(base);
  };
  const runtimeDir = env?.XDG_RUNTIME_DIR;
  addBase(runtimeDir);
  if (platform === 'linux' && typeof runtimeDir === 'string' && runtimeDir !== '') {
    addBase(`${runtimeDir}/app/com.discordapp.Discord`);
    addBase(`${runtimeDir}/snap.discord`);
  }
  // TMPDIR is usually /tmp, which is why the dedupe above is not cosmetic: the
  // walk is ten connect attempts per base on a machine with no Discord at all.
  addBase(env?.TMPDIR);
  addBase('/tmp');
  const paths = [];
  for (let n = 0; n < DISCORD_PIPE_SLOTS; n += 1) {
    for (const base of bases) paths.push(`${base}/discord-ipc-${n}`);
  }
  return paths;
}

function requireFunction(value, label) {
  if (typeof value !== 'function') {
    throw new TypeError(`createDiscordPresence: ${label} must be a function`);
  }
}

function requirePositiveInterval(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(
      `createDiscordPresence: ${label} must be a finite number greater than zero`,
    );
  }
}

/**
 * Structural equality over the small JSON activity objects this module sends.
 * Key ORDER is deliberately not part of it: the comparison exists to answer
 * "would this write change what Discord is showing", and a caller that built an
 * identical object a different way has nothing to say.
 */
function sameActivity(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) {
    if (!Object.hasOwn(b, key)) return false;
    if (!sameActivity(a[key], b[key])) return false;
  }
  return true;
}

/**
 * Build the presence connection. Returns the three signals the shell drives it
 * with (what to show, whether the player wants it at all, and app shutdown)
 * plus a state readout the tests assert transitions through.
 */
function createDiscordPresence({
  clientId,
  connect,
  platform,
  env,
  now,
  setTimeoutFn,
  clearTimeoutFn,
  random,
  pid,
  log,
  initiallyEnabled = true,
  minSendIntervalMs = DISCORD_MIN_SEND_INTERVAL_MS,
  maxBackoffMs = DISCORD_MAX_BACKOFF_MS,
}) {
  requireFunction(connect, 'connect');
  requireFunction(now, 'now');
  requireFunction(setTimeoutFn, 'setTimeoutFn');
  requireFunction(clearTimeoutFn, 'clearTimeoutFn');
  requireFunction(random, 'random');
  requirePositiveInterval(minSendIntervalMs, 'minSendIntervalMs');
  requirePositiveInterval(maxBackoffMs, 'maxBackoffMs');
  if (!Number.isInteger(pid)) {
    throw new TypeError('createDiscordPresence: pid must be an integer');
  }
  if (!log || typeof log.warn !== 'function' || typeof log.debug !== 'function') {
    throw new TypeError('createDiscordPresence: log must provide warn and debug');
  }

  // An id that is absent or malformed makes the whole module inert rather than
  // half-live: nothing to connect to means nothing worth a socket, a timer, or
  // a log line on every zone change.
  const appId = typeof clientId === 'string' && clientId !== '' ? clientId : null;
  const paths = appId === null ? [] : candidatePipePaths(platform, env);

  // The connection lifecycle: 'idle' (nothing wanted or nothing running),
  // 'connecting' (walking the candidate paths), 'handshaking' (a socket
  // accepted us and the handshake is out), 'ready' (Discord answered READY),
  // 'backoff' (waiting to retry), 'off' (the player turned it off).
  let state = 'idle';
  // Held separately from the lifecycle because it must SURVIVE a disable and a
  // re-enable: an unregistered app id is a property of the build, so it stays
  // refused for the whole process run however the player toggles the setting.
  let terminal = appId === null ? 'absent' : null;
  let enabled = initiallyEnabled !== false;

  let socket = null;
  let inbound = EMPTY_FRAME_BUFFER;
  let pathIndex = 0;
  let connectAttempts = 0;

  // What the game wants shown (null means "show nothing"), and what actually
  // went out on the current connection. lastSentActivity is undefined until a
  // write lands and is reset on every READY, because a fresh connection knows
  // nothing about what the last one was told.
  let desired = null;
  let lastSentActivity;
  let lastSendAt = 0;
  let pendingNonce = null;
  let nonceCounter = 0;
  let loggedActivityError = false;

  let backoffMs = 0;
  let retryTimer = null;
  let sendTimer = null;

  const clearRetryTimer = () => {
    if (retryTimer === null) return;
    clearTimeoutFn(retryTimer);
    retryTimer = null;
  };

  const clearSendTimer = () => {
    if (sendTimer === null) return;
    clearTimeoutFn(sendTimer);
    sendTimer = null;
  };

  // Drop the live socket without letting its own teardown events act: the
  // reference is cleared FIRST, so the handlers below see a socket that is no
  // longer ours and return.
  const destroySocket = () => {
    if (socket === null) return;
    const dead = socket;
    socket = null;
    inbound = EMPTY_FRAME_BUFFER;
    pendingNonce = null;
    try {
      dead.destroy();
    } catch {
      // A socket that refuses to be destroyed is already gone as far as we care.
    }
  };

  const write = (buffer) => {
    if (socket === null) return false;
    try {
      socket.write(buffer);
      return true;
    } catch {
      // A write that throws (a pipe closed between the check and the call) is
      // the same event as a close: drop back to the reconnect path.
      destroySocket();
      scheduleRetry();
      return false;
    }
  };

  // The trailing-edge rate limiter and the single-flight gate, in one place so
  // every path that could send (a new activity, a READY, a response, a timer)
  // asks the same question.
  const flush = () => {
    if (state !== 'ready' || socket === null) return;
    // One SET_ACTIVITY in flight at a time. Discord answers each with an echo of
    // its nonce; the response handler calls back here, so a desired value that
    // changed meanwhile is never lost, only deferred.
    if (pendingNonce !== null) return;
    if (sameActivity(desired, lastSentActivity)) return;
    const at = now();
    const waitMs = minSendIntervalMs - (at - lastSendAt);
    if (waitMs > 0) {
      // One timer, re-read at fire time: whatever `desired` holds THEN is what
      // goes out, so a burst of zone changes costs one write rather than a
      // queue the player watches replay.
      if (sendTimer === null) {
        sendTimer = setTimeoutFn(() => {
          sendTimer = null;
          flush();
        }, waitMs);
      }
      return;
    }
    clearSendTimer();
    nonceCounter += 1;
    const nonce = `woc-${nonceCounter}`;
    const activity = desired;
    if (!write(encodeSetActivity(nonce, pid, activity))) return;
    pendingNonce = nonce;
    lastSentActivity = activity;
    lastSendAt = at;
  };

  const onReady = () => {
    state = 'ready';
    // The walk starts over from the first candidate next time, and the backoff
    // is forgiven: this connection worked, so a later failure is a new problem.
    backoffMs = 0;
    pathIndex = 0;
    pendingNonce = null;
    // A new connection has been told nothing, so even an unchanged activity has
    // to go out again; without this reset a reconnect would leave the presence
    // blank until the player changed zone.
    lastSentActivity = undefined;
    flush();
  };

  const onInvalidClient = (payload) => {
    // Terminal, and the one line in this module that is worth a warning: it is
    // always a build or configuration mistake, and it is silent otherwise.
    log.warn(
      '[discord] presence refused by the client, disabling for this run:',
      payload?.code,
      payload?.message,
    );
    terminal = 'invalid-client';
    clearRetryTimer();
    clearSendTimer();
    destroySocket();
    desired = null;
  };

  const handleFrame = (frame) => {
    if (frame.opcode === OPCODES.PING) {
      write(encodePong(frame.payload ?? {}));
      return;
    }
    if (frame.opcode === OPCODES.CLOSE) {
      if (state !== 'ready') {
        onInvalidClient(frame.payload);
        return;
      }
      // A CLOSE on a connection that was working is Discord shutting down, not
      // a refusal: reconnect like any other drop.
      destroySocket();
      scheduleRetry();
      return;
    }
    if (frame.opcode !== OPCODES.FRAME) return;
    const payload = frame.payload;
    if (payload === null || typeof payload !== 'object') return;
    if (payload.evt === 'READY') {
      onReady();
      return;
    }
    if (pendingNonce !== null && payload.nonce === pendingNonce) {
      if (payload.evt === 'ERROR' && !loggedActivityError) {
        // Once per run. A rejected activity is reported and then treated as
        // delivered: retrying the payload Discord just refused would be a loop,
        // and the next real change goes out normally.
        loggedActivityError = true;
        log.warn('[discord] presence update rejected:', payload.data?.message);
      }
      pendingNonce = null;
      flush();
    }
  };

  const attach = (candidate) => {
    // Guards every handler below: a socket that has been superseded (the walk
    // moved on, or the manager was disposed) must not be able to advance the
    // walk a second time or resurrect a torn-down connection.
    const isLive = () => socket === candidate;

    candidate.on('connect', () => {
      if (!isLive()) return;
      state = 'handshaking';
      inbound = EMPTY_FRAME_BUFFER;
      write(encodeHandshake(appId));
    });

    candidate.on('data', (chunk) => {
      if (!isLive()) return;
      // The accumulator is bounded by the decoder: anything claiming more than
      // MAX_FRAME_BYTES is an error rather than a payload to keep waiting for,
      // so this can never grow past one header plus one capped frame.
      inbound = inbound.length === 0 ? Buffer.from(chunk) : Buffer.concat([inbound, chunk]);
      const { frames, rest, error } = decodeFrames(inbound);
      inbound = rest;
      for (const frame of frames) {
        if (!isLive()) return;
        handleFrame(frame);
      }
      if (error === null || !isLive()) return;
      // The stream cannot be resynchronized (see the decoder), so the socket
      // goes rather than the shell reading whatever comes next as frames.
      log.debug('[discord] dropping a corrupt IPC stream:', error);
      destroySocket();
      scheduleRetry();
    });

    const onSocketGone = () => {
      if (!isLive()) return;
      socket = null;
      inbound = EMPTY_FRAME_BUFFER;
      pendingNonce = null;
      clearSendTimer();
      try {
        candidate.destroy();
      } catch {
        // Already gone; nothing to release.
      }
      if (terminal !== null || state === 'off') return;
      if (state === 'connecting') {
        // The socket never came up, which is the ordinary reading of "Discord
        // is not listening on THIS path": try the next one.
        connectNextPath();
        return;
      }
      // It came up and then went away (Discord quit, a broken pipe): the paths
      // are not the problem, so back off rather than walking them again.
      scheduleRetry();
    };

    candidate.on('error', onSocketGone);
    candidate.on('close', onSocketGone);
  };

  function connectNextPath() {
    if (terminal !== null || !enabled) return;
    if (pathIndex >= paths.length) {
      // Every candidate refused us. This is what "the player does not run
      // Discord" looks like, so it stays at debug and turns into a backoff.
      pathIndex = 0;
      log.debug('[discord] no local IPC socket answered; retrying later');
      scheduleRetry();
      return;
    }
    const path = paths[pathIndex];
    pathIndex += 1;
    connectAttempts += 1;
    let candidate = null;
    try {
      candidate = connect(path);
    } catch {
      candidate = null;
    }
    if (!candidate) {
      connectNextPath();
      return;
    }
    socket = candidate;
    attach(candidate);
  }

  function scheduleRetry() {
    if (terminal !== null || retryTimer !== null) return;
    state = 'backoff';
    // The ceiling caps the FIRST delay too, so an injected ceiling below the
    // base cannot produce a backoff longer than the caller asked for.
    backoffMs =
      backoffMs === 0
        ? Math.min(DISCORD_BASE_BACKOFF_MS, maxBackoffMs)
        : Math.min(backoffMs * 2, maxBackoffMs);
    // Jittered so a machine that suspended with the game open does not have
    // every reconnect land on the same instant as every other client's.
    const delayMs = Math.max(1, Math.round(backoffMs * (0.5 + random() * 0.5)));
    retryTimer = setTimeoutFn(() => {
      retryTimer = null;
      if (terminal !== null || state !== 'backoff') return;
      // Only reconnect for something worth showing. A player who turned the
      // setting off, or who is at a screen with no activity, gets no socket.
      if (!enabled || desired === null) {
        state = 'idle';
        return;
      }
      state = 'connecting';
      pathIndex = 0;
      connectNextPath();
    }, delayMs);
  }

  const beginConnect = () => {
    if (terminal !== null || !enabled) return;
    if (state !== 'idle' && state !== 'off') return;
    state = 'connecting';
    pathIndex = 0;
    connectNextPath();
  };

  return {
    /**
     * What the game wants Discord to show, or null for nothing. The FIRST
     * non-null activity is what opens the connection: until the player is in
     * the world there is nothing to report, and a shell that dialed at boot
     * would pay the walk (and Discord would show the game as running) for a
     * player still sitting at the login screen.
     */
    setActivity: (activity) => {
      if (terminal !== null) return;
      desired = activity === null || activity === undefined ? null : activity;
      if (!enabled) return;
      if (desired !== null) beginConnect();
      flush();
    },

    /**
     * The player's setting. Turning it off clears the presence on the way out,
     * because leaving a stale line in Discord's UI would be the opposite of
     * what the toggle promises. Turning it back on connects nothing by itself:
     * the next activity does that, the same way the first one did.
     */
    setEnabled: (nextEnabled) => {
      if (terminal === 'disposed') return;
      const on = nextEnabled === true;
      if (on === enabled) return;
      enabled = on;
      if (on) {
        if (state === 'off') state = 'idle';
        return;
      }
      if (state === 'ready' && socket !== null) {
        nonceCounter += 1;
        write(encodeSetActivity(`woc-${nonceCounter}`, pid, null));
        try {
          socket.end();
        } catch {
          // The clear may not have reached Discord; destroying below is what
          // matters, and Discord drops the presence when the socket closes.
        }
      }
      clearRetryTimer();
      clearSendTimer();
      destroySocket();
      desired = null;
      lastSentActivity = undefined;
      state = 'off';
    },

    /** App shutdown. Terminal: nothing may reconnect behind a quitting process. */
    dispose: () => {
      if (terminal === 'disposed') return;
      terminal = 'disposed';
      clearRetryTimer();
      clearSendTimer();
      destroySocket();
      desired = null;
    },

    /** The lifecycle readout the tests assert on, without reaching into privates. */
    stateForTest: () => ({
      state: terminal ?? state,
      enabled,
      desiredActivity: desired,
      lastSentActivity,
      pendingNonce,
      backoffMs,
      connectAttempts,
    }),
  };
}

module.exports = {
  DISCORD_BASE_BACKOFF_MS,
  DISCORD_MAX_BACKOFF_MS,
  DISCORD_MIN_SEND_INTERVAL_MS,
  DISCORD_PIPE_SLOTS,
  candidatePipePaths,
  createDiscordPresence,
  resolveDiscordClientId,
};
