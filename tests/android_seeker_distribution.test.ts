import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appGradle = readFileSync('android/app/build.gradle', 'utf8');
const plugin = readFileSync(
  'android/app/src/main/java/com/worldofclaudecraft/NativeSolanaMobilePlugin.kt',
  'utf8',
);
const mainActivity = readFileSync(
  'android/app/src/main/java/com/worldofclaudecraft/MainActivity.java',
  'utf8',
);
const main = readFileSync('src/main.ts', 'utf8');
const hudCss = readFileSync('src/styles/hud.css', 'utf8');
const shellCss = readFileSync('src/styles/shell.css', 'utf8');
const mobileHudCss = readFileSync('src/styles/hud.mobile.css', 'utf8');

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

  it('fails closed unless dApp Store, exact Seeker identity, and MWA are all present', () => {
    expect(plugin).toContain('BuildConfig.SOLANA_MOBILE_DISTRIBUTION == "solana-dapp-store"');
    expect(plugin).toContain('Build.MODEL.equals("Seeker", ignoreCase = true)');
    expect(plugin).toContain('Build.BRAND.equals("solanamobile", ignoreCase = true)');
    expect(plugin).toContain(
      'Build.MANUFACTURER.equals("Solana Mobile Inc.", ignoreCase = true)',
    );
    expect(plugin).toContain('result.put("mwaAvailable", solanaMobileAllowed())');
    expect(plugin).toContain(
      'BuildConfig.SOLANA_MOBILE_DISTRIBUTION == "solana-dapp-store" && isSeeker()',
    );
    expect(mainActivity).toContain('registerPlugin(NativeSolanaMobilePlugin.class);');
  });

  it('reveals the existing wallet UI only after the Seeker capability succeeds', () => {
    expect(main).toContain(
      "document.body.classList.toggle('seeker-wallet-enabled', NATIVE_APP && WALLET_ENABLED)",
    );
    expect(hudCss).toContain(
      'body.native-app:not(.seeker-wallet-enabled) .cs-wallet',
    );
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

  it('promotes the existing rewards button below Chat only for an enabled Seeker', () => {
    expect(main).toContain(
      "document.getElementById('mobile-combat-controls')?.appendChild(dailyRewardsButton)",
    );
    expect(mobileHudCss).toContain(
      'body.mobile-touch.seeker-wallet-enabled #mobile-combat-controls #mobile-daily-rewards',
    );
    expect(mobileHudCss).toContain('url("/ui/daily-rewards/treasure_chest.webp")');
    expect(mobileHudCss).toContain('grid-column: 1;');
    expect(mobileHudCss).toContain('grid-row: 2;');
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
  });
});
