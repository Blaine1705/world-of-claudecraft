const LOOPBACK_REMOTE_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function isLoopbackRemoteAddress(remoteAddress) {
  return LOOPBACK_REMOTE_ADDRESSES.has(
    String(remoteAddress ?? '')
      .trim()
      .toLowerCase(),
  );
}

export function sameOrigin(origin, host) {
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function diagnosticsReadAllowed(remoteAddress) {
  return isLoopbackRemoteAddress(remoteAddress);
}

export function diagnosticsCaptureAllowed(remoteAddress, origin, host) {
  return isLoopbackRemoteAddress(remoteAddress) && sameOrigin(origin, host);
}
