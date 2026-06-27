import { loadTeslaConfig, type TeslaConfig } from './config';
import { LiveTeslaProvider } from './client';
import { MockTeslaProvider } from './mock';
import { TokenStore } from './store';
import type { TeslaProvider } from './types';

export { loadTeslaConfig } from './config';
export type { TeslaConfig } from './config';
export type { TeslaProvider, TeslaVehicle, TeslaStatus, NavTarget } from './types';

/**
 * Build a Tesla provider from config, or `null` when Tesla is disabled (no env
 * configured). Mirrors `selectRoutingProvider`: the choice is made once at
 * startup and the rest of the app just sees the interface.
 */
export function selectTeslaProvider(config: TeslaConfig): TeslaProvider | null {
  if (config.mode === 'mock') {
    console.log('[tesla] TESLA_MOCK enabled — using the offline mock provider (demo mode).');
    return new MockTeslaProvider();
  }

  if (config.mode === 'live') {
    console.log('[tesla] Live Fleet API configured — real send-to-car enabled.');
    const store = new TokenStore(process.env.TESLA_TOKEN_FILE);
    return new LiveTeslaProvider(config, store);
  }

  console.warn(
    '[tesla] Not configured — send-to-car is disabled. Set TESLA_MOCK=1 to demo, ' +
      'or TESLA_CLIENT_ID/SECRET/REDIRECT_URI for the real Fleet API.',
  );
  return null;
}

/** Convenience: load config from the environment and select a provider. */
export function selectTeslaProviderFromEnv(): {
  config: TeslaConfig;
  provider: TeslaProvider | null;
} {
  const config = loadTeslaConfig();
  return { config, provider: selectTeslaProvider(config) };
}
