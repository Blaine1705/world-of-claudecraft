const { execFile: nodeExecFile } = require('node:child_process');
const {
  existsSync: nodeExistsSync,
  mkdirSync: nodeMkdirSync,
  readFileSync: nodeReadFileSync,
  renameSync: nodeRenameSync,
  writeFileSync: nodeWriteFileSync,
} = require('node:fs');
const nodeOs = require('node:os');
const nodePath = require('node:path');

// Make the worldofclaudecraft:// deep link resolvable on Linux, which is what carries the
// Discord login code back from the OS browser into the shell (main.cjs handleDeepLink).
//
// Two separate breakages, both silent, both fixed here:
//
//  1. The AppImage installs NOTHING. electron-builder does emit a correct .desktop file
//     (Exec + MimeType=x-scheme-handler/worldofclaudecraft, from the top-level `protocols`
//     block in package.json), but it lives inside the AppImage's squashfs and is only ever
//     read if the player has AppImageLauncher or hand-integrates the file. SteamOS, Bazzite,
//     and a plain "download and chmod +x" have neither, so xdg-open finds no handler at all
//     and the Discord callback dead-ends in a "choose an application" dialog that cannot
//     select an AppImage. The .deb is unaffected: dpkg installs its copy to
//     /usr/share/applications and runs update-desktop-database for us.
//
//  2. app.setAsDefaultProtocolClient is a hard no-op on Linux for BOTH channels. Electron's
//     Linux path shells out to `xdg-settings set default-url-scheme-handler <scheme>
//     <desktop-name>`, and it resolves that name from the CHROME_DESKTOP environment
//     variable. We never set desktopName in package.json, so the name Electron uses is
//     inferred rather than known: Electron's own setDesktopName docs spell out the failure
//     mode, that an inferred name "may not match the packaged app's actual .desktop file".
//     It does not match. electron-builder names the real file after executableName, so the
//     deb ships "world-of-claudecraft.desktop" while the inferred name derives from app.name
//     (productName, "World of ClaudeCraft"). Pointing CHROME_DESKTOP at the filename that
//     actually exists is the whole fix for the deb, and it lets the AppImage reuse Electron's
//     own registration on top of the one we run below.
//
//     Deliberately NOT app.setDesktopName(), the public API for the same value: that one also
//     governs the Wayland app id and the X11 WM_CLASS, and electron-builder independently
//     writes StartupWMClass from productName ("World of ClaudeCraft"). Changing the app id
//     without also setting package.json desktopName + linux.syncDesktopName would desync the
//     two and break the window-to-launcher association that works today. Fixing the URL
//     scheme must not cost a correct taskbar icon; that is a separate, packaging-level change.
//
// Everything here is best-effort: a player with no writable XDG data dir, no xdg-utils, or a
// read-only home still gets a working game, just no deep link (they can sign in with a
// username and password, which never leaves the app).

// The basename electron-builder gives the .deb's entry (LinuxPackager.executableName, which
// is package.json `name` lowercased). The AppImage entry we write below deliberately reuses
// it: one CHROME_DESKTOP value then serves both channels, and on a machine with both the
// user-level AppImage entry cleanly shadows the system-level deb one per the XDG lookup order.
const DESKTOP_ENTRY_BASENAME = 'world-of-claudecraft';
const DESKTOP_ENTRY_NAME = `${DESKTOP_ENTRY_BASENAME}.desktop`;

// Rejected outright rather than escaped. A newline would let a crafted filename inject
// further key=value lines (an attacker-chosen Exec); the shell-reserved characters would
// need the desktop-entry spec's double layer of quoting (Exec argument quoting, then
// desktop-file string escaping) to survive intact, and getting that subtly wrong ships a
// handler that runs the wrong command. No real download path contains any of them, so
// refusing to install is both safer and honest.
const PRODUCT_NAME = 'World of ClaudeCraft';
// Where a system package (the .deb) puts its copy. Read only to answer "does this name
// resolve to anything at all", never written.
const SYSTEM_APPLICATIONS_DIR = '/usr/share/applications';
const EXEC_RESERVED_CHARS = /["`$\\]/;

/**
 * True for any C0 control character or DEL. These are spec-invalid in a desktop-entry string
 * (desktop-file-validate rejects them), and newline / carriage return are the actual injection
 * vector. Checked by code point rather than a regex class: a literal control character inside a
 * regex is its own readability and lint trap, and this states the intent directly. SPACE is
 * deliberately NOT unsafe, since quoting it is the whole point of "~/My Games/woc.AppImage".
 */
function hasControlCharacter(value) {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** A string that cannot be represented safely in a .desktop value, whatever the key. */
function unrepresentable(value) {
  return EXEC_RESERVED_CHARS.test(value) || hasControlCharacter(value);
}
// Characters that need no quoting at all in an Exec value (the same conservative set
// electron-builder uses when it builds the deb's Exec line).
const EXEC_BARE_SAFE = /^[/0-9A-Za-z._-]+$/;
// A URL scheme per RFC 3986: letter, then letters/digits/+/-/. Anything else would be spliced
// straight into the MimeType line and the xdg-mime argument.
const VALID_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*$/;

/**
 * The user-level directory that owns .desktop entries, honoring XDG_DATA_HOME when it is set
 * to an absolute path (the spec says a relative value is invalid and must be ignored).
 */
function desktopEntryDir(env = process.env, homeDir = nodeOs.homedir()) {
  const xdgDataHome = typeof env.XDG_DATA_HOME === 'string' ? env.XDG_DATA_HOME.trim() : '';
  const base = nodePath.isAbsolute(xdgDataHome)
    ? xdgDataHome
    : nodePath.join(homeDir, '.local', 'share');
  return nodePath.join(base, 'applications');
}

/**
 * The AppImage path as an Exec argument, or null when it cannot be represented safely.
 * Bare when it needs no quoting, double-quoted otherwise so the common "~/My Games/woc.AppImage"
 * case works instead of splitting into two arguments.
 */
function execArgumentFor(appImagePath) {
  if (typeof appImagePath !== 'string' || appImagePath === '') return null;
  if (!nodePath.isAbsolute(appImagePath)) return null;
  if (unrepresentable(appImagePath)) return null;
  // A literal % MUST be doubled. The launcher expands field codes (%u, %f, ...) across the
  // whole Exec value, and GLib silently drops an unrecognized %X pair, so a real download
  // path like ~/Games 100%/woc.AppImage would be handed to exec with the "%/" eaten: exactly
  // the silent dead-end this module exists to remove. Escaped rather than rejected because,
  // unlike the shell-reserved characters above, this transformation is unambiguous.
  const escaped = appImagePath.replace(/%/g, '%%');
  return EXEC_BARE_SAFE.test(escaped) ? escaped : `"${escaped}"`;
}

/**
 * The .desktop entry body. `%u` is what hands the URL to us as argv, which is where both
 * deep-link paths in main.cjs read it from (the cold-start process.argv scan and the
 * 'second-instance' argv when the game is already running). Deliberately NOT NoDisplay:
 * a visible entry is one the player can also pick by hand out of the desktop environment's
 * "open with" dialog if the xdg-mime association below never lands.
 */
function buildDesktopEntry({ execArgument, scheme, productName, tryExecPath }) {
  // Validated rather than assumed: this function is exported, and the module's whole safety
  // story is "nothing unrepresentable reaches the file", which must not depend on every future
  // caller remembering to check. A newline in productName alone injects arbitrary keys.
  if (typeof execArgument !== 'string' || execArgument === '') return null;
  if (typeof scheme !== 'string' || !VALID_SCHEME.test(scheme)) return null;
  if (typeof productName !== 'string' || unrepresentable(productName)) return null;
  const lines = [
    '[Desktop Entry]',
    'Type=Application',
    `Name=${productName}`,
    `Exec=${execArgument} %u`,
  ];
  // Lets the desktop environment skip this entry on its own once the AppImage behind it is
  // gone, so a deleted AppImage degrades to "no handler" instead of "a handler that fails".
  if (tryExecPath) lines.push(`TryExec=${tryExecPath}`);
  lines.push(
    `Icon=${DESKTOP_ENTRY_BASENAME}`,
    'Terminal=false',
    'Categories=Game;',
    `MimeType=x-scheme-handler/${scheme};`,
  );
  return `${lines.join('\n')}\n`;
}

/**
 * The AppImage this process is running from, or null when it is not one. AppRun exports
 * APPIMAGE as the path of the outer .AppImage file, which is the only path that survives this
 * process exiting (process.execPath points inside the runtime's FUSE mount, which is torn
 * down with us, so an entry built from it would break on the very next launch).
 */
function appImagePathFrom(env = process.env) {
  const appImage = typeof env.APPIMAGE === 'string' ? env.APPIMAGE.trim() : '';
  return nodePath.isAbsolute(appImage) ? appImage : null;
}

/**
 * Point Electron's Linux protocol registration at a .desktop filename that exists (see the
 * header, breakage 2). Safe on every channel: the deb installs this name, the AppImage gets
 * it written by installDesktopEntry below, and on a dev run the name simply resolves to
 * nothing, exactly as today. No-op off Linux, where CHROME_DESKTOP means nothing and
 * setAsDefaultProtocolClient uses the registry / LaunchServices instead.
 */
function configureLinuxDesktopName(deps = {}) {
  const platform = deps.platform ?? process.platform;
  const env = deps.env ?? process.env;
  const noop = { desktopName: null, restore: () => {} };
  if (platform !== 'linux') return noop;

  // Only when the file is actually on disk (we just wrote it, or the deb installed it).
  // Setting it unconditionally would make a Steam depot, an Epic package, or a dev run hand
  // xdg-settings a name resolving to nothing, which can REPLACE a working association (an
  // AppImageLauncher-integrated entry, say) with a dangling one: strictly worse than today.
  const fileExists = deps.fileExists ?? nodeExistsSync;
  const userDir = deps.dir ?? desktopEntryDir(env, deps.homeDir ?? nodeOs.homedir());
  const resolves =
    fileExists(nodePath.join(userDir, DESKTOP_ENTRY_NAME)) ||
    fileExists(nodePath.join(SYSTEM_APPLICATIONS_DIR, DESKTOP_ENTRY_NAME));
  if (!resolves) return noop;

  const had = Object.hasOwn(env, 'CHROME_DESKTOP');
  const previous = env.CHROME_DESKTOP;
  env.CHROME_DESKTOP = DESKTOP_ENTRY_NAME;
  return {
    desktopName: DESKTOP_ENTRY_NAME,
    // Restored by the caller once the registration has run. It is a process-wide variable
    // inherited by every child, including the browser we spawn for the Discord login itself
    // (shell.openExternal -> xdg-open). Chromium reads CHROME_DESKTOP for its own shell
    // integration, so a freshly spawned Chromium whose user then accepts "make this my
    // default browser" would register OUR desktop file as the http/https handler.
    restore: () => {
      if (had) env.CHROME_DESKTOP = previous;
      else delete env.CHROME_DESKTOP;
    },
  };
}

/**
 * Write the user-level .desktop entry for an AppImage run and associate it with the scheme.
 *
 * Returns a status object rather than throwing, so main.cjs can log the outcome and carry on:
 *   'not-appimage'  nothing to do (deb, Steam depot, dev run, or any non-Linux host)
 *   'invalid-scheme' the caller passed something that is not a URL scheme
 *   'unsafe-path'   the AppImage lives somewhere we refuse to encode (see unrepresentable)
 *   'unsafe-dir'    the XDG applications dir did not resolve to an absolute path
 *   'unchanged'     the entry on disk already matches, so no write and no xdg-utils work
 *   'installed'     the entry was written and the association commands were kicked off
 *   'failed'        the write itself failed (read-only home, no permission)
 *
 * The unchanged path matters: this runs on every launch, and re-running xdg-mime each time
 * would spend two subprocesses to reassert something already true. A moved or renamed
 * AppImage changes Exec, which fails the comparison and re-installs, which is what keeps the
 * entry pointing at a file that still exists after a manual re-download.
 */
function installDesktopEntry(deps = {}) {
  const platform = deps.platform ?? process.platform;
  const env = deps.env ?? process.env;
  const log = deps.log;
  const scheme = deps.scheme;
  const productName = deps.productName ?? PRODUCT_NAME;

  if (platform !== 'linux') return { status: 'not-appimage' };
  const appImagePath = deps.appImagePath ?? appImagePathFrom(env);
  if (!appImagePath) return { status: 'not-appimage' };
  if (typeof scheme !== 'string' || !VALID_SCHEME.test(scheme)) {
    log?.warn?.('[deeplink] refusing to register an invalid URL scheme', { scheme });
    return { status: 'invalid-scheme' };
  }

  const execArgument = execArgumentFor(appImagePath);
  if (!execArgument) {
    log?.warn?.('[deeplink] AppImage path cannot be encoded in a .desktop entry', {
      appImagePath,
    });
    return { status: 'unsafe-path' };
  }

  // os.homedir() returns $HOME verbatim on POSIX, so a hostile or malformed HOME (with
  // XDG_DATA_HOME unset or relative) would otherwise land mkdir/write on a CWD-relative tree.
  const dir = deps.dir ?? desktopEntryDir(env, deps.homeDir ?? nodeOs.homedir());
  if (!nodePath.isAbsolute(dir)) {
    log?.warn?.('[deeplink] refusing a non-absolute applications dir', { dir });
    return { status: 'unsafe-dir' };
  }

  const file = nodePath.join(dir, DESKTOP_ENTRY_NAME);
  const entry = buildDesktopEntry({
    execArgument,
    scheme,
    productName,
    // Only when the raw path needs no quoting: TryExec is a plain path key, not an Exec line,
    // so it has no quoting or field-code layer to hide behind.
    tryExecPath: EXEC_BARE_SAFE.test(appImagePath) ? appImagePath : null,
  });
  if (!entry) {
    log?.warn?.('[deeplink] refusing to write an unrepresentable .desktop entry');
    return { status: 'unsafe-path' };
  }

  const readFile = deps.readFile ?? nodeReadFileSync;
  let existing = null;
  try {
    existing = String(readFile(file, 'utf8'));
  } catch {
    existing = null;
  }
  // update-desktop-database rebuilds the MIME cache that maps the scheme to this entry;
  // xdg-mime then makes it the DEFAULT rather than merely a candidate. Both are best-effort:
  // a distro without xdg-utils still gets a valid entry on disk, and desktop environments
  // that read mimeapps.list directly pick it up on their own.
  const associate = () => {
    const runCommand = deps.runCommand ?? defaultRunCommand;
    runCommand('update-desktop-database', [dir], log);
    runCommand('xdg-mime', ['default', DESKTOP_ENTRY_NAME, `x-scheme-handler/${scheme}`], log);
  };

  // An unchanged FILE does not imply an intact ASSOCIATION: another application can claim the
  // scheme, and a desktop environment can reset or rewrite mimeapps.list. Skipping the write
  // is safe (the bytes are identical); skipping the association would let a stolen default
  // break Discord login permanently, with no relaunch that ever recovers it. The two commands
  // are async, unref'd, and timeout-bounded, so re-asserting costs nothing on the boot path.
  if (existing === entry) {
    associate();
    log?.info?.('[deeplink] Linux URL scheme handler entry current, association re-asserted', {
      file,
    });
    return { status: 'unchanged', file, entry };
  }

  const mkdir = deps.mkdir ?? nodeMkdirSync;
  const writeFile = deps.writeFile ?? nodeWriteFileSync;
  const rename = deps.rename ?? nodeRenameSync;
  try {
    mkdir(dir, { recursive: true });
    // Write-then-rename, never a direct write: rename is atomic within the directory, so a
    // crash or a concurrent second instance can never leave a torn entry, and it REPLACES a
    // symlink at the destination instead of following it into whatever it points at.
    const temp = `${file}.${process.pid}.tmp`;
    writeFile(temp, entry, 'utf8');
    rename(temp, file);
  } catch (err) {
    log?.warn?.('[deeplink] could not write the .desktop entry', err);
    return { status: 'failed', file, entry };
  }

  associate();
  log?.info?.('[deeplink] installed the Linux URL scheme handler', { file, scheme });
  return { status: 'installed', file, entry };
}

/**
 * Fire-and-forget subprocess: never blocks startup, never rejects, never throws.
 *
 * The safety property this module rests on lives HERE, not in the callers: execFile with an
 * ARRAY argv and NO `shell` option, so every argument reaches execve untouched and no
 * argument can ever be re-parsed by a shell. `execFile` is imported under an alias, which
 * means the malware scanner's call-site regex does not see this line at all (only the
 * child_process import on line 1, which scripts/malware_scan.mjs demotes for this file) --
 * so the test that pins these arguments is the real control against a later `shell: true`,
 * not the scanner. execFile is injectable for exactly that test.
 */
function defaultRunCommand(command, args, log, execFile = nodeExecFile) {
  try {
    const child = execFile(command, args, { timeout: 5_000 }, (err) => {
      if (err) log?.warn?.(`[deeplink] ${command} failed`, err);
    });
    child?.unref?.();
  } catch (err) {
    log?.warn?.(`[deeplink] could not run ${command}`, err);
  }
}

/**
 * The single entry point main.cjs calls, before app.setAsDefaultProtocolClient so the
 * filename is already correct (and, on an AppImage, the file already on disk) by the time
 * Electron runs its own xdg-settings registration.
 */
function registerLinuxUrlHandler(deps = {}) {
  const install = installDesktopEntry(deps);
  // Ordered second on purpose: it gates on the entry EXISTING, which the install above may
  // have just created.
  const { desktopName, restore } = configureLinuxDesktopName(deps);
  return { desktopName, restore, ...install };
}

module.exports = {
  SYSTEM_APPLICATIONS_DIR,
  DESKTOP_ENTRY_BASENAME,
  DESKTOP_ENTRY_NAME,
  PRODUCT_NAME,
  appImagePathFrom,
  defaultRunCommand,
  buildDesktopEntry,
  configureLinuxDesktopName,
  desktopEntryDir,
  execArgumentFor,
  installDesktopEntry,
  registerLinuxUrlHandler,
};
