import type { RoutingProvider } from './types';
import { HaversineRoutingProvider } from './haversineProvider';
import { OpenRouteServiceProvider } from './openRouteServiceProvider';

export type { RoutingProvider, RouteResult } from './types';
export { HaversineRoutingProvider } from './haversineProvider';
export { OpenRouteServiceProvider } from './openRouteServiceProvider';

/**
 * Pick a routing provider from the environment: OpenRouteService when ORS_API_KEY
 * is set, otherwise the offline haversine stub (with a warning, since it does not
 * follow roads).
 */
export function selectRoutingProvider(): RoutingProvider {
  const key = process.env.ORS_API_KEY;
  if (key) return new OpenRouteServiceProvider(key);
  console.warn(
    '[routing] ORS_API_KEY not set — using the haversine straight-line stub. ' +
      'Routes will not follow roads. Set ORS_API_KEY for real driving routes.',
  );
  return new HaversineRoutingProvider();
}
