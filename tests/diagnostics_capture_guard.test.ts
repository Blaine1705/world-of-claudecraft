import { describe, expect, it } from 'vitest';
import {
  diagnosticsCaptureAllowed,
  diagnosticsReadAllowed,
  isLoopbackRemoteAddress,
  sameOrigin,
} from '../scripts/lib/diagnostics_capture_guard.mjs';

describe('diagnostics capture guard', () => {
  it('accepts only concrete loopback socket addresses', () => {
    expect(isLoopbackRemoteAddress('127.0.0.1')).toBe(true);
    expect(isLoopbackRemoteAddress('::1')).toBe(true);
    expect(isLoopbackRemoteAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isLoopbackRemoteAddress('192.168.1.20')).toBe(false);
    expect(isLoopbackRemoteAddress('203.0.113.9')).toBe(false);
    expect(isLoopbackRemoteAddress(undefined)).toBe(false);
  });

  it('fails closed when Origin or Host is missing or malformed', () => {
    expect(sameOrigin('http://127.0.0.1:5173', '127.0.0.1:5173')).toBe(true);
    expect(sameOrigin(undefined, '127.0.0.1:5173')).toBe(false);
    expect(sameOrigin('http://127.0.0.1:5173', undefined)).toBe(false);
    expect(sameOrigin('not a URL', '127.0.0.1:5173')).toBe(false);
    expect(sameOrigin('http://evil.example', '127.0.0.1:5173')).toBe(false);
  });

  it('protects both the latest-report read and report capture write', () => {
    expect(diagnosticsReadAllowed('127.0.0.1')).toBe(true);
    expect(diagnosticsReadAllowed('203.0.113.9')).toBe(false);
    expect(diagnosticsCaptureAllowed('127.0.0.1', 'http://127.0.0.1:5173', '127.0.0.1:5173')).toBe(
      true,
    );
    expect(diagnosticsCaptureAllowed('127.0.0.1', undefined, '127.0.0.1:5173')).toBe(false);
    expect(
      diagnosticsCaptureAllowed('203.0.113.9', 'http://127.0.0.1:5173', '127.0.0.1:5173'),
    ).toBe(false);
  });
});
