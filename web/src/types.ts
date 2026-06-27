// Response shapes mirroring the PokeRouter backend (see backend/src/planner/types.ts).

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Health {
  status: string;
  machines: number;
  routing: { provider: string; isRoadRouting: boolean };
}

export interface RetailerCount {
  retailer: string;
  count: number;
}

export interface PlannedStop {
  id: string;
  name: string;
  retailer: string;
  address: string;
  lat: number;
  lng: number;
  order: number;
  offRouteMeters: number;
  addedDetourMeters: number;
}

export interface CandidateMachine {
  id: string;
  name: string;
  retailer: string;
  address: string;
  lat: number;
  lng: number;
  offRouteMeters: number;
}

export interface RouteSummary {
  distanceMeters: number;
  durationSeconds: number;
}

export interface PlanResult {
  origin: LatLng;
  destination: LatLng;
  base: RouteSummary;
  planned: RouteSummary & {
    addedDistanceMeters: number;
    addedDurationSeconds: number;
  };
  stops: PlannedStop[];
  candidateCount: number;
  candidates: CandidateMachine[];
  routeGeometry: [number, number][];
  routing: { provider: string; isRoadRouting: boolean };
}

export interface RouteResult {
  distanceMeters: number;
  durationSeconds: number;
  routeGeometry: [number, number][];
  routing: { provider: string; isRoadRouting: boolean };
}

export interface PlanRequest {
  origin: LatLng;
  destination: LatLng;
  maxStops?: number;
  corridorMeters?: number;
  maxAddedMetersPerStop?: number;
  retailers?: string[];
}
