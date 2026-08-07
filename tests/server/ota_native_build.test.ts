// The build bridge is only correct while it matches the real project files, and
// nothing else in the tree would notice it going stale: a wrong bridge does not
// crash, it silently stops offering updates to store-fresh devices, which is
// exactly the outage this file exists to prevent recurring. A release version
// sync bumps versionCode and CURRENT_PROJECT_VERSION monotonically, so these
// pins go red on the next release until the bridge is updated with them.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NATIVE_BUILD_BRIDGE } from '../../server/ota_native_build';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

describe('NATIVE_BUILD_BRIDGE tracks the real release surfaces', () => {
  it('carries the marketing version from package.json', () => {
    const pkg = JSON.parse(read('package.json')) as { version: string };
    expect(NATIVE_BUILD_BRIDGE.version).toBe(pkg.version);
  });

  it('carries the Android versionCode from build.gradle', () => {
    const match = /^\s*versionCode\s+(\d+)/m.exec(read('android/app/build.gradle'));
    expect(match, 'versionCode not found in build.gradle').not.toBeNull();
    expect(NATIVE_BUILD_BRIDGE.android).toBe(Number(match?.[1]));
  });

  it('carries the iOS CURRENT_PROJECT_VERSION from project.pbxproj', () => {
    const pbxproj = read('ios/App/App.xcodeproj/project.pbxproj');
    const builds = [...pbxproj.matchAll(/CURRENT_PROJECT_VERSION\s*=\s*(\d+)\s*;/g)].map((m) =>
      Number(m[1]),
    );
    expect(builds.length, 'no CURRENT_PROJECT_VERSION in project.pbxproj').toBeGreaterThan(0);
    // version_sync writes every occurrence together, so they must agree; a split
    // value would make the bridge right for one target and wrong for another.
    expect(new Set(builds).size, `CURRENT_PROJECT_VERSION disagrees: ${builds.join(', ')}`).toBe(1);
    expect(NATIVE_BUILD_BRIDGE.ios).toBe(builds[0]);
  });

  it('pins build numbers as plain integers, never a version string', () => {
    // The whole point: these are CFBundleVersion / versionCode, which are the
    // values Capgo sends as version_build. A semver here would reintroduce the
    // bug by making the bridge unreachable.
    expect(Number.isInteger(NATIVE_BUILD_BRIDGE.ios)).toBe(true);
    expect(Number.isInteger(NATIVE_BUILD_BRIDGE.android)).toBe(true);
    expect(NATIVE_BUILD_BRIDGE.ios).toBeGreaterThan(0);
    expect(NATIVE_BUILD_BRIDGE.android).toBeGreaterThan(0);
  });
});
