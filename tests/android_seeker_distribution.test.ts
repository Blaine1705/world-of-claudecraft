import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const appGradle = readFileSync('android/app/build.gradle', 'utf8');
const plugin = readFileSync(
  'android/app/src/solanaStore/java/com/worldofclaudecraft/NativeSolanaMobilePlugin.kt',
  'utf8',
);
const baseActivity = readFileSync(
  'android/app/src/main/java/com/worldofclaudecraft/BaseMainActivity.java',
  'utf8',
);
const playActivity = readFileSync(
  'android/app/src/play/java/com/worldofclaudecraft/MainActivity.java',
  'utf8',
);
const solanaStoreActivity = readFileSync(
  'android/app/src/solanaStore/java/com/worldofclaudecraft/MainActivity.java',
  'utf8',
);
const main = readFileSync('src/main.ts', 'utf8');
const hudCss = readFileSync('src/styles/hud.css', 'utf8');
const shellCss = readFileSync('src/styles/shell.css', 'utf8');
const mobileHudCss = readFileSync('src/styles/hud.mobile.css', 'utf8');

function sourceText(root: string): string {
  const files: string[] = [];
  const visit = (path: string): void => {
    for (const name of readdirSync(path)) {
      const child = join(path, name);
      if (statSync(child).isDirectory()) visit(child);
      else if (/\.(?:java|kt)$/.test(name)) files.push(child);
    }
  };
  visit(root);
  return files
    .sort()
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');
}

describe('Android Seeker distribution boundary', () => {
  it('builds explicit Play and Solana dApp Store flavors', () => {
    expect(appGradle).toContain('flavorDimensions += "distribution"');
    expect(appGradle).toContain('play {');
    expect(appGradle).toContain(
      'buildConfigField "String", "SOLANA_MOBILE_DISTRIBUTION", \'"google-play"\'',
    );
    expect(appGradle).toContain('solanaStore {');
    expect(appGradle).toContain(
      'buildConfigField "String", "SOLANA_MOBILE_DISTRIBUTION", \'"solana-dapp-store"\'',
    );
  });

  it('packages the Solana SDK dependencies only in the Solana Store variant', () => {
    for (const dependency of [
      'com.solanamobile:mobile-wallet-adapter-clientlib-ktx:2.0.3',
      'com.solanamobile:web3-solana:0.2.5',
      'com.solanamobile:rpc-core:0.2.7',
      'io.github.funkatronics:multimult:0.2.3',
    ]) {
      expect(appGradle).toContain(`solanaStoreImplementation "${dependency}"`);
      expect(appGradle).not.toMatch(
        new RegExp(`^\\s*implementation\\s+"${dependency.replace(/[.]/g, '\\.')}"`, 'm'),
      );
    }
  });

  it('keeps the real MWA plugin and registration out of shared and Play sources', () => {
    expect(
      existsSync('android/app/src/main/java/com/worldofclaudecraft/NativeSolanaMobilePlugin.kt'),
    ).toBe(false);
    expect(
      existsSync('android/app/src/play/java/com/worldofclaudecraft/NativeSolanaMobilePlugin.kt'),
    ).toBe(false);
    expect(baseActivity).not.toContain('NativeSolanaMobilePlugin');
    expect(playActivity).not.toContain('NativeSolanaMobilePlugin');
    expect(playActivity).not.toContain('registerPlugin(');
    const nonSolanaSources = [
      sourceText('android/app/src/main/java'),
      sourceText('android/app/src/play/java'),
    ].join('\n');
    expect(nonSolanaSources).not.toMatch(
      /com\.solanamobile|com\.funkatronics|NativeSolanaMobilePlugin/,
    );
    expect(solanaStoreActivity).toContain('registerPlugin(NativeSolanaMobilePlugin.class);');
  });

  it('fails closed unless dApp Store, exact Seeker identity, and MWA are all present', () => {
    expect(plugin).toContain('BuildConfig.SOLANA_MOBILE_DISTRIBUTION == "solana-dapp-store"');
    expect(plugin).toContain('Build.MODEL.equals("Seeker", ignoreCase = true)');
    expect(plugin).toContain('Build.BRAND.equals("solanamobile", ignoreCase = true)');
    expect(plugin).toContain('Build.MANUFACTURER.equals("Solana Mobile Inc.", ignoreCase = true)');
    expect(plugin).toContain('result.put("mwaAvailable", solanaMobileAllowed())');
    expect(plugin).toContain(
      'BuildConfig.SOLANA_MOBILE_DISTRIBUTION == "solana-dapp-store" && isSeeker()',
    );
    expect(solanaStoreActivity).toContain('registerPlugin(NativeSolanaMobilePlugin.class);');
  });

  it('reveals the existing wallet UI only after the Seeker capability succeeds', () => {
    expect(main).toContain(
      "document.body.classList.toggle('seeker-wallet-enabled', NATIVE_APP && WALLET_ENABLED)",
    );
    expect(main).toContain('const seekerDefaults = seekerFirstRunSettings(');
    expect(main).toContain('NATIVE_APP && (await walletCapabilityReady),');
    expect(main).toContain("settings.set('browserEffects', seekerDefaults.browserEffects)");
    expect(main).toContain("settings.set('weather', seekerDefaults.weather)");
    expect(main).toContain('seekerDefaults?.graphicsPreset ?? null');
    expect(hudCss).toContain('body.native-app:not(.seeker-wallet-enabled) .cs-wallet');
    expect(shellCss).toContain(
      'body.mobile-touch:not(.seeker-wallet-enabled) #charselect-panel .cs-wallet',
    );
    expect(hudCss).not.toContain('body.native-app .cs-wallet,');
    expect(shellCss).not.toContain('body.mobile-touch #charselect-panel .cs-wallet,');
  });

  it('registers the MWA activity result sender before the activity is started', () => {
    expect(plugin).toContain('private lateinit var activityResultSender: ActivityResultSender');
    expect(plugin).toContain('activityResultSender = ActivityResultSender(activity)');
    expect(plugin.match(/ActivityResultSender\(activity\)/g)).toHaveLength(1);
    expect(plugin).toContain('walletAdapter.connect(activityResultSender)');
    expect(plugin).toContain('walletAdapter.disconnect(activityResultSender)');
    expect(plugin).toContain('walletAdapter.transact(activityResultSender)');
  });

  it('uses Seed Vault instructions in the native Seeker wallet picker', () => {
    expect(main).toContain("? t('wallet.seekerAppHelp')");
  });

  it('promotes the existing rewards button below Chat without covering mobile unit frames', () => {
    expect(main).toContain(
      "document.getElementById('mobile-combat-controls')?.appendChild(dailyRewardsButton)",
    );
    expect(mobileHudCss).toContain(
      'body.mobile-touch.seeker-wallet-enabled #mobile-combat-controls #mobile-daily-rewards',
    );
    expect(mobileHudCss).toContain('url("/ui/daily-rewards/treasure_chest.webp")');
    expect(mobileHudCss).toContain('grid-column: 1;');
    expect(mobileHudCss).toContain('grid-row: 2;');
    expect(mobileHudCss).toMatch(
      /body\.mobile-touch\.seeker-wallet-enabled #target-frame \{[^}]*top: calc\(max\(8px, env\(safe-area-inset-top\)\) \+ 140px\);/,
    );
    expect(mobileHudCss).toMatch(
      /body\.mobile-touch\.seeker-wallet-enabled #party-frames \{[^}]*top: calc\(max\(8px, env\(safe-area-inset-top\)\) \+ 142px\);/,
    );
    expect(mobileHudCss).toMatch(
      /body\.mobile-touch\.seeker-wallet-enabled #target-frame \{[^}]*top: calc\(max\(6px, env\(safe-area-inset-top\)\) \+ 132px\);/,
    );
    expect(mobileHudCss).toMatch(
      /body\.mobile-touch\.seeker-wallet-enabled #party-frames \{[^}]*top: calc\(max\(6px, env\(safe-area-inset-top\)\) \+ 134px\);/,
    );
  });

  it('lays out the Seeker wallet as a header row above its actions', () => {
    expect(shellCss).toContain(
      'body.mobile-touch.seeker-wallet-enabled #charselect-panel .cs-wallet-group',
    );
    expect(shellCss).toContain('grid-template-columns: auto minmax(0, 1fr);');
    expect(shellCss).toContain(
      'body.mobile-touch.seeker-wallet-enabled #charselect-panel .cs-wallet-main',
    );
    expect(shellCss).toContain('display: contents;');
    expect(shellCss).toMatch(
      /body\.mobile-touch\.seeker-wallet-enabled #charselect-panel :is\(\.wallet-cta, \.wallet-mini\) \{[\s\S]*?min-width: 40px;[\s\S]*?min-height: 40px;/,
    );
  });
});
