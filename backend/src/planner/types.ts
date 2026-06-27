import type { Machine } from '../types';

/** A geographic point in the API's lat/lng convention. */
export interface LatLng {
  lat: number;
  lng: number;
}

/** Inputs to a corridor plan. */
export interface PlanRequest {
  origin: LatLng;
  destination: LatLng;
  /** Max number of vending-machine stops to insert (default 5). */
  maxStops?: number;
  /** How far off the base route a machine may sit to qualify, in meters (default 3000). */
  corridorMeters?: number;
  /**
   * Max extra distance a single stop may add to the route, in meters. Stops
   * costing more than this are skipped. Defaults to `corridorMeters * 4`.
   */
  maxAddedMetersPerStop?: number;
}

/** A machine selected as a stop, with where it landed and what it cost. */
export interface PlannedStop {
  id: string;
  name: string;
  retailer: string;
  address: string;
  lat: number;
  lng: number;
  /** 1-based position among the inserted stops, in travel order. */
  order: number;
  /** Distance from the base route, in meters. */
  offRouteMeters: number;
  /** Estimated extra distance this stop added at insertion time, in meters. */
  addedDetourMeters: number;
}

/** Distance/time summary for a route. */
export interface RouteSummary {
  distanceMeters: number;
  durationSeconds: number;
}

/** Output of a corridor plan. */
export interface PlanResult {
  origin: LatLng;
  destination: LatLng;
  /** Direct origin→destination route with no stops. */
  base: RouteSummary;
  /** Final route through the inserted stops. */
  planned: RouteSummary & {
    addedDistanceMeters: number;
    addedDurationSeconds: number;
  };
  stops: PlannedStop[];
  /** How many machines fell within the corridor before stop selection. */
  candidateCount: number;
  /** Final route geometry as `[lng, lat]` tuples. */
  routeGeometry: [number, number][];
  /** Routing backend used, and whether it follows roads. */
  routing: { provider: string; isRoadRouting: boolean };
}

export const machineAddress = (m: Machine): string =>
  [m.street, m.city, m.stateProvince, m.zipPostalCode].filter(Boolean).join(', ');
