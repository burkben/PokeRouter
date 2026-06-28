import type { NamedPoint } from '../share/links';

export type TeslaMode = 'mock' | 'live' | 'disabled';

/** A vehicle as surfaced to clients (a trimmed view of the Fleet API shape). */
export interface TeslaVehicle {
  /** Command tag used in Fleet API command paths (vehicle id). */
  id: string;
  vin: string;
  displayName: string;
  /** 'online' | 'asleep' | 'offline' (best-effort; mock always 'online'). */
  state: string;
}

/** Where to send the car. Origin/stops are optional; only destination is required. */
export interface NavTarget {
  origin?: NamedPoint;
  destination: NamedPoint;
  stops?: NamedPoint[];
  /**
   * Which waypoint in the ordered itinerary `[...stops, destination]` to navigate
   * to. Tesla's Fleet API only accepts a single destination at a time (and drops
   * intermediate waypoints from shared links), so PokéRouter sends the trip one
   * leg at a time. Defaults to 0 — the first stop (the next vending machine).
   */
  targetIndex?: number;
}

export interface TeslaStatus {
  mode: TeslaMode;
  /** Credentials present (live) or mock explicitly enabled. */
  configured: boolean;
  /** A usable user token is held, so vehicle calls can be made. */
  connected: boolean;
  vehicleCount?: number;
}

export interface SendResult {
  sent: true;
  /** The Google Maps URL handed to the vehicle's navigation. */
  url: string;
  vehicle: string;
  /** Index of the waypoint that was sent within `[...stops, destination]`. */
  targetIndex: number;
  /** Human label of the sent waypoint (e.g. the vending-machine name), if any. */
  targetName?: string;
  /** Total number of waypoints in the itinerary (`stops.length + 1`). */
  waypointCount: number;
  /** True when the waypoint sent was the final destination (last leg). */
  isFinal: boolean;
}

/**
 * One interface, two implementations: a MockTeslaProvider (demoable with
 * TESLA_MOCK=1, no Tesla account needed) and a LiveTeslaProvider (real Fleet
 * API). The HTTP routes are identical for both.
 */
export interface TeslaProvider {
  readonly mode: 'mock' | 'live';
  status(): Promise<TeslaStatus>;
  /** OAuth authorize URL for the connect flow; null in mock (no real OAuth). */
  authorizeUrl(state: string): string | null;
  /** Exchange an OAuth callback for tokens (mock: just flips to connected). */
  handleCallback(code: string, state: string): Promise<void>;
  isConnected(): boolean;
  listVehicles(): Promise<TeslaVehicle[]>;
  sendNavigation(vehicleTag: string, target: NavTarget): Promise<SendResult>;
}
