#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planVersionSync } from './version_sync.mjs';

const VERSION_RE = /^\d+\.\d+\.\d+$/;
// A release integration branch (release/vX.Y.Z-<slug>) carries the base
// version's surfaces, so a trailing -<slug> is tolerated when inferring.
const RELEASE_REF_RE = /(?:^|refs\/heads\/)release\/v?(\d+\.\d+\.\d+)(?:-[a-z0-9][a-z0-9-]*)?$/;
const MAC_DMG_RE = /world-of-claudecraft-\d+\.\d+\.\d+-mac-universal\.dmg/g;
const LINUX_APPIMAGE_RE = /world-of-claudecraft-\d+\.\d+\.\d+-linux-x86_64\.AppImage/g;
// The website download page links the x64 NSIS installer (build.nsis.
// buildUniversalInstaller is false, issue 2013): a per-arch installer, not
// the old combined "-win.exe" that folded both arches into one download.
const WINDOWS_INSTALLER_RE = /world-of-claudecraft-\d+\.\d+\.\d+-win-x64\.exe/g;
// A page migrated before the per-arch cutover (or hand-edited afterward) can
// still carry the legacy combined-installer filename. Both prepare and check
// must recognize it so it gets rewritten/flagged instead of silently surviving
// a version bump (issue: legacy Windows links bypass the release guard).
const LEGACY_WINDOWS_INSTALLER_RE = /world-of-claudecraft-\d+\.\d+\.\d+-win\.exe/g;
const DESKTOP_VERSION_RE = /export const DESKTOP_VERSION = '(\d+\.\d+\.\d+)';/;
const GAME_VERSION_RE = /(<div\b[^>]*\bid=["']game-version["'][^>]*>)v[^<]*(<\/div>)/;
const README_VERSION_BADGE_SOURCE = String.raw`img\.shields\.io/badge/version-(\d+\.\d+\.\d+)-blue`;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PATHS = {
  packageJson: 'package.json',
  // pnpm-lock.yaml does not store the package version (unlike package-lock.json),
  // so release version surfaces do not rewrite or check a lockfile version field.
  gradle: 'android/app/build.gradle',
  pbxproj: 'ios/App/App.xcodeproj/project.pbxproj',
  desktopModule: 'src/game/desktop_download.ts',
  otaNativeBuild: 'server/ota_native_build.ts',
  htmlFiles: ['index.html', 'play.html'],
  readmeRoot: 'README.md',
  readmeDir: 'docs/i18n',
};

function parseJson(text, path) {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`${path} is not valid JSON: ${err.message}`);
  }
}

function stringifyJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function normalizeVersion(version) {
  const normalized = version?.startsWith('v') ? version.slice(1) : version;
  if (!VERSION_RE.test(normalized ?? '')) {
    throw new Error(`Invalid release version "${version}". Expected X.Y.Z.`);
  }
  return normalized;
}

function versionFromRef(ref) {
  const match = ref?.match(RELEASE_REF_RE);
  return match ? match[1] : null;
}

export function inferExpectedReleaseVersion({ argv = [], env = process.env } = {}) {
  const versionFlagIndex = argv.indexOf('--version');
  if (versionFlagIndex !== -1) {
    return normalizeVersion(argv[versionFlagIndex + 1]);
  }

  const explicit = argv.find((arg) => VERSION_RE.test(arg) || /^v\d+\.\d+\.\d+$/.test(arg));
  if (explicit) return normalizeVersion(explicit);

  const fromEnv =
    versionFromRef(env.GITHUB_HEAD_REF) ??
    versionFromRef(env.GITHUB_REF_NAME) ??
    versionFromRef(env.GITHUB_REF);
  if (fromEnv) return fromEnv;

  throw new Error(
    'Could not infer release version. Run from release/vX.Y.Z or pass --version X.Y.Z.',
  );
}

export function setPackageVersion(packageJson, version) {
  const pkg = parseJson(packageJson, 'package.json');
  pkg.version = normalizeVersion(version);
  return stringifyJson(pkg);
}

export function setDesktopDownloadVersion(html, version, path) {
  if (!MAC_DMG_RE.test(html)) {
    throw new Error(`${path} is missing a macOS desktop download URL`);
  }
  MAC_DMG_RE.lastIndex = 0;
  const normalized = normalizeVersion(version);
  // Optional platform links are rewritten wherever present. The macOS link is
  // the only download URL every entry page is required to carry.
  return html
    .replace(MAC_DMG_RE, `world-of-claudecraft-${normalized}-mac-universal.dmg`)
    .replace(LINUX_APPIMAGE_RE, `world-of-claudecraft-${normalized}-linux-x86_64.AppImage`)
    .replace(WINDOWS_INSTALLER_RE, `world-of-claudecraft-${normalized}-win-x64.exe`)
    .replace(LEGACY_WINDOWS_INSTALLER_RE, `world-of-claudecraft-${normalized}-win-x64.exe`);
}

export function setDesktopModuleVersion(source, version, path) {
  if (!DESKTOP_VERSION_RE.test(source)) {
    throw new Error(`${path} is missing the DESKTOP_VERSION constant`);
  }
  return source.replace(
    DESKTOP_VERSION_RE,
    `export const DESKTOP_VERSION = '${normalizeVersion(version)}';`,
  );
}

export function setGameVersionText(html, version, path) {
  if (!GAME_VERSION_RE.test(html)) {
    throw new Error(`${path} is missing #game-version`);
  }
  return html.replace(GAME_VERSION_RE, `$1v${normalizeVersion(version)}$2`);
}

function readReadmeBadgeVersions(markdown) {
  return [...markdown.matchAll(new RegExp(README_VERSION_BADGE_SOURCE, 'g'))].map(
    (match) => match[1],
  );
}

export function setReadmeVersionBadge(markdown, version, path) {
  if (readReadmeBadgeVersions(markdown).length === 0) {
    throw new Error(`${path} is missing a release version badge`);
  }
  return markdown.replace(
    new RegExp(README_VERSION_BADGE_SOURCE, 'g'),
    `img.shields.io/badge/version-${normalizeVersion(version)}-blue`,
  );
}

const BRIDGE_VERSION_RE = /(version:\s*')(\d+\.\d+\.\d+)(')/;
const BRIDGE_IOS_RE = /(ios:\s*)(\d+)/;
const BRIDGE_ANDROID_RE = /(android:\s*)(\d+)/;

/**
 * Keep server/ota_native_build.ts in lockstep with the native build numbers.
 * The OTA endpoint uses it to map a device's build NUMBER (which is all a
 * store-fresh device reports) onto a marketing version; a stale bridge stops
 * offering updates silently, so it is a release surface like any other.
 */
export function setNativeBuildBridge(source, version, iosBuild, androidBuild) {
  for (const [name, re] of [
    ['version', BRIDGE_VERSION_RE],
    ['ios', BRIDGE_IOS_RE],
    ['android', BRIDGE_ANDROID_RE],
  ]) {
    if (!re.test(source)) {
      throw new Error(`${PATHS.otaNativeBuild} is missing its ${name} field`);
    }
  }
  return source
    .replace(BRIDGE_VERSION_RE, `$1${normalizeVersion(version)}$3`)
    .replace(BRIDGE_IOS_RE, `$1${iosBuild}`)
    .replace(BRIDGE_ANDROID_RE, `$1${androidBuild}`);
}

export function readNativeBuildBridge(source) {
  const version = BRIDGE_VERSION_RE.exec(source)?.[2] ?? null;
  const ios = BRIDGE_IOS_RE.exec(source)?.[2] ?? null;
  const android = BRIDGE_ANDROID_RE.exec(source)?.[2] ?? null;
  return {
    version,
    ios: ios === null ? null : Number(ios),
    android: android === null ? null : Number(android),
  };
}

export function readNativeBuildNumbers(gradle, pbxproj) {
  const android = /^\s*versionCode\s+(\d+)/m.exec(gradle)?.[1] ?? null;
  const iosMatches = [...pbxproj.matchAll(/CURRENT_PROJECT_VERSION\s*=\s*(\d+)\s*;/g)].map((m) =>
    Number(m[1]),
  );
  const ios = iosMatches.length > 0 && new Set(iosMatches).size === 1 ? iosMatches[0] : null;
  return { ios, android: android === null ? null : Number(android) };
}

export function planReleaseVersion({
  version,
  packageJson,
  gradle,
  pbxproj,
  desktopModule,
  otaNativeBuild,
  htmlFiles,
  readmeFiles,
}) {
  const normalized = normalizeVersion(version);
  const nativePlan = planVersionSync({ version: normalized, gradle, pbxproj });
  // Read the build numbers back out of the BUMPED files so the bridge records
  // what actually shipped, never the pre-bump values.
  const bumped = readNativeBuildNumbers(nativePlan.gradle, nativePlan.pbxproj);
  const nextHtmlFiles = Object.fromEntries(
    Object.entries(htmlFiles).map(([path, html]) => [
      path,
      setGameVersionText(setDesktopDownloadVersion(html, normalized, path), normalized, path),
    ]),
  );
  const nextReadmeFiles = Object.fromEntries(
    Object.entries(readmeFiles).map(([path, markdown]) => [
      path,
      setReadmeVersionBadge(markdown, normalized, path),
    ]),
  );

  return {
    packageJson: setPackageVersion(packageJson, normalized),
    gradle: nativePlan.gradle,
    pbxproj: nativePlan.pbxproj,
    desktopModule: setDesktopModuleVersion(desktopModule, normalized, PATHS.desktopModule),
    otaNativeBuild: setNativeBuildBridge(otaNativeBuild, normalized, bumped.ios, bumped.android),
    htmlFiles: nextHtmlFiles,
    readmeFiles: nextReadmeFiles,
  };
}

function readPackageVersion(packageJson) {
  return parseJson(packageJson, 'package.json').version;
}

function readGradleVersionName(gradle) {
  return gradle.match(/^\s*versionName\s+"([^"]+)"/m)?.[1] ?? null;
}

function readMarketingVersions(pbxproj) {
  return [...pbxproj.matchAll(/MARKETING_VERSION\s*=\s*([^;]+)\s*;/g)].map((match) =>
    match[1].trim(),
  );
}

function readGameVersion(html) {
  return html.match(GAME_VERSION_RE)?.[0].match(/>v([^<]+)</)?.[1] ?? null;
}

export function collectReleaseVersionFailures({
  version,
  packageJson,
  gradle,
  pbxproj,
  desktopModule,
  otaNativeBuild,
  htmlFiles,
  readmeFiles,
}) {
  const expected = normalizeVersion(version);
  const failures = [];

  const pkgVersion = readPackageVersion(packageJson);
  if (pkgVersion !== expected) {
    failures.push(`package.json version is ${pkgVersion}, expected ${expected}`);
  }

  const gradleVersion = readGradleVersionName(gradle);
  if (gradleVersion !== expected) {
    failures.push(`android/app/build.gradle versionName is ${gradleVersion}, expected ${expected}`);
  }

  const marketingVersions = readMarketingVersions(pbxproj);
  if (marketingVersions.length === 0) {
    failures.push('ios/App/App.xcodeproj/project.pbxproj has no MARKETING_VERSION entries');
  } else {
    const staleMarketing = marketingVersions.find(
      (marketingVersion) => marketingVersion !== expected,
    );
    if (staleMarketing) {
      failures.push(
        `ios/App/App.xcodeproj/project.pbxproj MARKETING_VERSION includes ${staleMarketing}, expected all ${expected}`,
      );
    }
  }

  const desktopVersion = desktopModule.match(DESKTOP_VERSION_RE)?.[1] ?? null;
  if (desktopVersion !== expected) {
    failures.push(
      `${PATHS.desktopModule} DESKTOP_VERSION is ${desktopVersion}, expected ${expected}`,
    );
  }

  // The OTA build bridge: a stale one silently stops offering updates to every
  // store-fresh device, so it is checked against the SAME files it maps between.
  const bridge = readNativeBuildBridge(otaNativeBuild);
  const native = readNativeBuildNumbers(gradle, pbxproj);
  if (bridge.version !== expected) {
    failures.push(`${PATHS.otaNativeBuild} version is ${bridge.version}, expected ${expected}`);
  }
  if (native.ios === null) {
    failures.push(
      'ios/App/App.xcodeproj/project.pbxproj CURRENT_PROJECT_VERSION is missing or inconsistent',
    );
  } else if (bridge.ios !== native.ios) {
    failures.push(
      `${PATHS.otaNativeBuild} ios build is ${bridge.ios}, expected ${native.ios} (CURRENT_PROJECT_VERSION)`,
    );
  }
  if (native.android === null) {
    failures.push('android/app/build.gradle versionCode is missing');
  } else if (bridge.android !== native.android) {
    failures.push(
      `${PATHS.otaNativeBuild} android build is ${bridge.android}, expected ${native.android} (versionCode)`,
    );
  }

  const expectedArtifact = `world-of-claudecraft-${expected}-mac-universal.dmg`;
  const expectedLinuxArtifact = `world-of-claudecraft-${expected}-linux-x86_64.AppImage`;
  const expectedWindowsArtifact = `world-of-claudecraft-${expected}-win-x64.exe`;
  for (const [path, html] of Object.entries(htmlFiles)) {
    const gameVersion = readGameVersion(html);
    if (gameVersion !== expected) {
      failures.push(`${path} game-version is v${gameVersion}, expected v${expected}`);
    }
    if (!html.includes(expectedArtifact)) {
      failures.push(`${path} is missing the macOS desktop download URL for ${expected}`);
    }
    // Only pages that carry a Linux link must have it on the release version;
    // play.html links only the dmg and stays exempt.
    LINUX_APPIMAGE_RE.lastIndex = 0;
    if (LINUX_APPIMAGE_RE.test(html) && !html.includes(expectedLinuxArtifact)) {
      failures.push(`${path} has a stale Linux desktop download URL, expected ${expected}`);
    }
    WINDOWS_INSTALLER_RE.lastIndex = 0;
    LEGACY_WINDOWS_INSTALLER_RE.lastIndex = 0;
    const hasWindowsInstallerLink =
      WINDOWS_INSTALLER_RE.test(html) || LEGACY_WINDOWS_INSTALLER_RE.test(html);
    if (hasWindowsInstallerLink && !html.includes(expectedWindowsArtifact)) {
      failures.push(`${path} has a stale Windows desktop download URL, expected ${expected}`);
    }
    if (/coming soon/i.test(html)) {
      failures.push(`${path} still contains Coming Soon in the download panel`);
    }
  }

  for (const [path, markdown] of Object.entries(readmeFiles)) {
    const badgeVersions = readReadmeBadgeVersions(markdown);
    if (badgeVersions.length === 0) {
      failures.push(`${path} is missing a release version badge`);
      continue;
    }
    const staleBadge = badgeVersions.find((badgeVersion) => badgeVersion !== expected);
    if (staleBadge) {
      failures.push(`${path} version badge includes ${staleBadge}, expected all ${expected}`);
    }
  }

  return failures;
}

function readReadmePaths() {
  const localized = readdirSync(resolve(ROOT, PATHS.readmeDir), { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^README\.[^.]+\.md$/.test(entry.name))
    .map((entry) => `${PATHS.readmeDir}/${entry.name}`)
    .sort();
  return [PATHS.readmeRoot, ...localized];
}

function readReleaseFiles() {
  const readmePaths = readReadmePaths();
  return {
    packageJson: readFileSync(resolve(ROOT, PATHS.packageJson), 'utf8'),
    gradle: readFileSync(resolve(ROOT, PATHS.gradle), 'utf8'),
    pbxproj: readFileSync(resolve(ROOT, PATHS.pbxproj), 'utf8'),
    desktopModule: readFileSync(resolve(ROOT, PATHS.desktopModule), 'utf8'),
    otaNativeBuild: readFileSync(resolve(ROOT, PATHS.otaNativeBuild), 'utf8'),
    htmlFiles: Object.fromEntries(
      PATHS.htmlFiles.map((path) => [path, readFileSync(resolve(ROOT, path), 'utf8')]),
    ),
    readmeFiles: Object.fromEntries(
      readmePaths.map((path) => [path, readFileSync(resolve(ROOT, path), 'utf8')]),
    ),
  };
}

function writeReleaseFiles(plan) {
  writeFileSync(resolve(ROOT, PATHS.packageJson), plan.packageJson);
  writeFileSync(resolve(ROOT, PATHS.gradle), plan.gradle);
  writeFileSync(resolve(ROOT, PATHS.pbxproj), plan.pbxproj);
  writeFileSync(resolve(ROOT, PATHS.desktopModule), plan.desktopModule);
  writeFileSync(resolve(ROOT, PATHS.otaNativeBuild), plan.otaNativeBuild);
  for (const [path, html] of Object.entries(plan.htmlFiles)) {
    writeFileSync(resolve(ROOT, path), html);
  }
  for (const [path, markdown] of Object.entries(plan.readmeFiles)) {
    writeFileSync(resolve(ROOT, path), markdown);
  }
}

function main() {
  const [mode = 'check', ...rest] = process.argv.slice(2);
  const argv = mode === 'check' || mode === 'prepare' ? rest : [mode, ...rest];
  const action = mode === 'prepare' ? 'prepare' : 'check';
  const version = inferExpectedReleaseVersion({ argv });
  const files = readReleaseFiles();

  if (action === 'prepare') {
    writeReleaseFiles(planReleaseVersion({ version, ...files }));
    console.log(`release_version: prepared release ${version}`);
    return;
  }

  const failures = collectReleaseVersionFailures({ version, ...files });
  if (failures.length > 0) {
    console.error(`release_version: release ${version} is not synchronized:`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log(`release_version: release ${version} is synchronized`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
