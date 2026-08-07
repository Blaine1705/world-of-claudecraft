// The bridge between a native BUILD NUMBER and a marketing version.
//
// Capgo reports `version_build` as the native build identifier, never a semver:
// on iOS that is CFBundleVersion (= CURRENT_PROJECT_VERSION, an integer that
// increments once per release), and on Android it is versionCode. A device
// still running store-shipped assets sends `version_name: 'builtin'`, so the
// only version information the server gets about it is that integer. Comparing
// it against a semver manifest is impossible without knowing which marketing
// version a given build number shipped as, and without that bridge every
// store-fresh install is silently told "no new version available" forever.
//
// ONE data point is enough. Build numbers are monotonic, so any build BELOW
// this release's is an older store build (and therefore older than any bundle
// we would publish), and any build at or above it is running this release's
// assets. `scripts/release_version.mjs` keeps these in lockstep with the
// project files, and tests/server/ota_native_build.test.ts pins them against
// package.json, build.gradle and project.pbxproj, so a release version sync
// that forgets to update them fails the release gate rather than going dark.

export interface NativeBuildBridge {
  /** The marketing version this checkout ships as (package.json version). */
  version: string;
  /** iOS CURRENT_PROJECT_VERSION / CFBundleVersion at that marketing version. */
  ios: number;
  /** Android versionCode at that marketing version. */
  android: number;
}

export const NATIVE_BUILD_BRIDGE: NativeBuildBridge = {
  version: '0.35.1',
  ios: 47,
  android: 39,
};
