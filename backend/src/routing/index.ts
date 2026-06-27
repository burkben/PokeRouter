import type { RoutingProvider } from './types';
import { HaversineRoutingProvider } from './haversineProvider';
import { OpenRouteServiceProvider } from './openRouteServiceProvider';
import { FallbackRoutingProvider } from './fallbackProvider';

export type { RoutingProvider, RouteResult } from './types';
export { HaversineRoutingProvider } from './haversineProvider';
export { OpenRouteServiceProvider } from './openRouteServiceProvider';
export { FallbackRoutingProvider } from './fallbackProvider';

/**
 * Pick a routing provider from the environment.
 *
 * With ORS_API_KEY set, the key is validated at startup so we only advertise
 * road routing when it actually works (and the operator gets an immediate, clear
 * log message if the key is wrong). A validated key is wrapped in a
 * FallbackRoutingProvider so a later rate-limit/quota/network failure degrades
 * to the straight-line stub for that request instead of erroring the whole app.
 * Without a key, the offline haversine stub is used (routes do not follow roads).
 */
export async function selectRoutingProvider(): Promise<RoutingProvider> {
  const key = process.env.ORS_API_KEY;
  const fallback = new HaversineRoutingProvider();

  if (!key) {
    console.warn(
      '[routing] ORS_API_KEY not set — using the haversine straight-line stub. ' +
        'Routes will not follow roads. Set ORS_API_KEY for real driving routes.',
    );
    return fallback;
  }

  const ors = new OpenRouteServiceProvider(key);
  const validation = await ors.validate();

  if (validation.ok) {
    console.log(
      `[routing] OpenRouteService key validated — real road routing enabled (profile: ${ors.profile}).`,
    );
    return new FallbackRoutingProvider(ors, fallback);
  }

  if (validation.kind === 'auth') {
    console.error(
      `[routing] OpenRouteService rejected the API key (${validation.message}). ` +
        'Falling back to the straight-line stub — check ORS_API_KEY.',
    );
    return fallback;
  }

  // Non-auth startup error (network/quota/transient): trust the key and keep ORS,
  // letting the per-request fallback cover any continued failures.
  console.warn(
    `[routing] Could not validate OpenRouteService at startup (${validation.message}). ` +
      'Proceeding with ORS; failed requests will fall back to the straight-line stub.',
  );
  return new FallbackRoutingProvider(ors, fallback);
}
